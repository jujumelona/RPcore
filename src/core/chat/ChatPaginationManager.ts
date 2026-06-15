// src/core/chat/ChatPaginationManager.ts
// ═══════════════════════════════════════════════════════════════════
// Mattermost 채팅방 진입 시 끊김 없는 렌더링 패턴 이식
//
// ✅ 진입 시 최근 30개만 즉시 표시 (HEAD 캐시)
// ✅ 위로 스크롤 시 DB에서 이전 메시지 30개씩 페이징
// ✅ 메모리 상한 관리 (화면에서 벗어난 메시지 해제)
// ✅ maintainVisibleContentPosition 연동
// ═══════════════════════════════════════════════════════════════════

import { DatabaseService } from '../../services/DatabaseService';
import { normalizeSpeakerId } from '../../utils/ChatUtils';

// ── Types ──────────────────────────────────────────────────────────

export interface PaginatedMessage {
  id: string;
  speaker: number;
  speakerName: string;
  content: string;
  timestamp: number;
  isImportant?: boolean;
  chapter_id?: string;
  [key: string]: unknown;
}

interface PaginationState {
  /** 현재 로드된 메시지 (시간순 ASC) */
  messages: PaginatedMessage[];
  /** 이전 메시지가 더 있는지 */
  hasOlder: boolean;
  /** 이전 페이지 로딩 중인지 */
  isLoadingOlder: boolean;
  /** 가장 오래된 메시지의 타임스탬프 (페이징 커서) */
  oldestTimestamp: number | null;
}

type PaginationListener = (state: PaginationState) => void;

// ── Constants ─────────────────────────────────────────────────────

const INITIAL_PAGE_SIZE = 30;
const PAGE_SIZE = 30;
const MAX_MESSAGES_IN_MEMORY = 300; // 메모리 상한

// ── ChatPaginationManager ─────────────────────────────────────────

export class ChatPaginationManager {
  private _storyId: string;
  private _state: PaginationState;
  private _listeners = new Set<PaginationListener>();

  constructor(storyId: string) {
    this._storyId = storyId;
    this._state = {
      messages: [],
      hasOlder: true,
      isLoadingOlder: false,
      oldestTimestamp: null };
  }

  // ── 초기 로드 (채팅방 진입) ──────────────────────────────────────

  async loadInitial(cachedMessages?: PaginatedMessage[]): Promise<PaginationState> {
    // 1. HEAD 캐시 활용
    if (cachedMessages && cachedMessages.length > 0) {
      const initial = cachedMessages.slice(-INITIAL_PAGE_SIZE);
      this._state = {
        messages: initial,
        // [BUG-8 FIX] 캐시가 INITIAL_PAGE_SIZE보다 작으면 확실히 hasOlder=false
        // 같거나 크면 DB에 더 있을 수 있으므로 일단 true로 두고 첫 loadOlder에서 확정
        hasOlder: cachedMessages.length >= INITIAL_PAGE_SIZE,
        isLoadingOlder: false,
        oldestTimestamp: initial[0]?.timestamp ?? null };
      this._emit();
      return this._state;
    }

    // 2. DB에서 로드 (하나 더 가져와서 hasOlder 판단)
    try {
      // ✅ [FIX] INITIAL_PAGE_SIZE+1개를 '가장 최근' 쪽에서 가져오도록 getMessagesBefore 사용
      // 이전: getMessages(ASC LIMIT 31) → 스토리의 가장 오래된 메시지부터 불러오는 버그
      const beforeTimestamp = Date.now() + 1000;
      const rawRows = await DatabaseService.getMessagesBefore(
        this._storyId,
        beforeTimestamp,
        INITIAL_PAGE_SIZE + 1,
      );
      const allMsgs = (rawRows ?? []).map(this._normalizeRow);
      // getMessagesBefore는 이미 ASC로 반환되므로, 31개가 차면 index 0이 '더 오래된' 초과분
      const hasOlder = allMsgs.length > INITIAL_PAGE_SIZE;
      const messages = hasOlder ? allMsgs.slice(1) : allMsgs;

      this._state = {
        messages,
        hasOlder,
        isLoadingOlder: false,
        oldestTimestamp: messages[0]?.timestamp ?? null };
    } catch {
      this._state = { messages: [], hasOlder: false, isLoadingOlder: false, oldestTimestamp: null };
    }

    this._emit();
    return this._state;
  }

  // ── 이전 메시지 로드 (위로 스크롤) ──────────────────────────────

  async loadOlder(): Promise<void> {
    if (this._state.isLoadingOlder || !this._state.hasOlder) return;

    this._state.isLoadingOlder = true;
    this._emit();

    try {
      const beforeTimestamp = this._state.oldestTimestamp ?? Date.now();
      // 하나 더 가져와서 다음 페이지 존재 여부 미리 확인 (네트워크/DB 왕복 1회 절약)
      const rawRows = await DatabaseService.getMessagesBefore(
        this._storyId,
        beforeTimestamp,
        PAGE_SIZE + 1,
      );
      const allOlder = (rawRows ?? []).map(this._normalizeRow);
      
      if (allOlder.length === 0) {
        this._state.hasOlder = false;
      } else {
        const hasOlder = allOlder.length > PAGE_SIZE;
        const olderMessages = hasOlder ? allOlder.slice(1) : allOlder;

        // 앞에 추가 (시간순 ASC)
        this._state.messages = [...olderMessages, ...this._state.messages];
        this._state.oldestTimestamp = olderMessages[0]?.timestamp ?? this._state.oldestTimestamp;
        this._state.hasOlder = hasOlder;

        // 메모리 상한 관리
        if (this._state.messages.length > MAX_MESSAGES_IN_MEMORY) {
          this._state.messages = this._state.messages.slice(-MAX_MESSAGES_IN_MEMORY);
          this._state.oldestTimestamp = this._state.messages[0]?.timestamp ?? null;
          this._state.hasOlder = true; // 잘린 부분이 있으므로 무조건 true
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[ChatPagination] loadOlder failed:', e);
    } finally {
      this._state.isLoadingOlder = false;
    }

    this._emit();
  }

  // ── 신규 메시지 추가 (실시간) ──────────────────────────────────

  appendMessage(msg: PaginatedMessage): void {
    // 중복 방지
    if (this._state.messages.some(m => m.id === msg.id)) return;

    const newMessages = [...this._state.messages, msg];

    // 메모리 상한 관리 (위쪽에서 제거)
    if (newMessages.length > MAX_MESSAGES_IN_MEMORY) {
      this._state.messages = newMessages.slice(-MAX_MESSAGES_IN_MEMORY);
      this._state.oldestTimestamp = this._state.messages[0]?.timestamp ?? null;
      this._state.hasOlder = true;
    } else {
      this._state.messages = newMessages;
    }

    this._emit();
  }

  appendMessages(msgs: PaginatedMessage[]): void {
    const existingIds = new Set(this._state.messages.map(m => m.id));
    const newMsgs = msgs.filter(m => !existingIds.has(m.id));
    if (!newMsgs.length) return;

    const newMessages = [...this._state.messages, ...newMsgs];

    if (newMessages.length > MAX_MESSAGES_IN_MEMORY) {
      this._state.messages = newMessages.slice(-MAX_MESSAGES_IN_MEMORY);
      this._state.oldestTimestamp = this._state.messages[0]?.timestamp ?? null;
      this._state.hasOlder = true;
    } else {
      this._state.messages = newMessages;
    }

    this._emit();
  }

  // ── 메시지 삭제 ────────────────────────────────────────────────

  removeMessage(messageId: string): void {
    this._state.messages = this._state.messages.filter(m => m.id !== messageId);
    this._emit();
  }

  // ── 상태 조회 ──────────────────────────────────────────────────

  getState(): PaginationState {
    return { ...this._state };
  }

  getMessages(): PaginatedMessage[] {
    return this._state.messages;
  }

  // ── 리스너 ─────────────────────────────────────────────────────

  addListener(fn: PaginationListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── 정리 ───────────────────────────────────────────────────────

  dispose(): void {
    this._listeners.clear();
    this._state.messages = [];
  }

  // ── 내부 ───────────────────────────────────────────────────────

  private _normalizeRow = (row: any): PaginatedMessage => {
    const speaker = normalizeSpeakerId(row.speaker_id);
    const timestamp = Number(row.timestamp ?? 0);
    const fallbackId = `msg_${this._storyId}_${timestamp}_${speaker}`;

    return {
      id: String(row.client_id ?? row.id ?? '') || fallbackId,
      speaker,
      speakerName: row.speaker_name || row.character_name || (speaker === 1 ? 'user' : speaker === 0 ? 'narrator' : ''),
      content: String(row.content ?? ''),
      timestamp,
      isImportant: row.is_important === 1 || row.is_important === true,
      chapter_id: row.chapter_id ?? undefined };
  }

  private _emit(): void {
    const snapshot = this.getState();
    this._listeners.forEach(fn => fn(snapshot));
  }
}
