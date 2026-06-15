// src/core/chat/MessageOutbox.ts
// ═══════════════════════════════════════════════════════════════════
// Mattermost Outbox 패턴 이식
// — 채팅 메시지 전용 오프라인 큐
//
// ✅ 즉시 로컬 저장 + 화면 표시
// ✅ 전송 상태: pending → sending → sent → failed
// ✅ 인터넷 끊김 → 로컬 큐에 적재 → 복구 시 순차 전송
// ✅ client_id 기반 서버 중복 방지
// ✅ MMKV 영속화 (앱 재시작 후에도 큐 유지)
// ═══════════════════════════════════════════════════════════════════

import { createMMKVStorage } from '../../utils/mmkvZustandStorage';
import { networkMonitor } from '../../utils/NetworkMonitor';

// ── Types ──────────────────────────────────────────────────────────

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface OutboxMessage {
  clientId: string;
  storyId: string;
  content: string;
  speaker: number;
  speakerName: string;
  timestamp: number;
  chapterId?: string;
  status: OutboxStatus;
  retryCount: number;
  lastAttemptAt?: number;
  error?: string;
}

type OutboxListener = (messages: OutboxMessage[]) => void;

// ── Constants ─────────────────────────────────────────────────────

const STORAGE_KEY = 'message-outbox-v1';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 15_000;
const MAX_QUEUED = 200;

// ── Storage ───────────────────────────────────────────────────────

const storage = createMMKVStorage({ id: 'message-outbox' });

function loadQueue(): OutboxMessage[] {
  try {
    const raw = storage.getItem(STORAGE_KEY) as string | null;
    if (raw) {
      const parsed: OutboxMessage[] = JSON.parse(raw);
      // 앱 재시작 시 sending 상태를 pending으로 리셋
      return parsed.map(m =>
        m.status === 'sending' ? { ...m, status: 'pending' as const } : m,
      );
    }
  } catch {}
  return [];
}

function saveQueue(queue: OutboxMessage[]): void {
  try {
    // 보존할 것을 앞쪽에 배치하여 slice(0, MAX_QUEUED)로 보존
    // 1. pending/sending 메시지 우선 (failed는 제거 후보)
    // 2. 시간순 (오래된 메시지 우선 보존 — 오프라인 순차 전송 보장)
    const toSave = [...queue].sort((a, b) => {
      const aFailed = a.status === 'failed';
      const bFailed = b.status === 'failed';
      if (aFailed && !bFailed) return 1;
      if (!aFailed && bFailed) return -1;
      return a.timestamp - b.timestamp;
    }).slice(0, MAX_QUEUED);
    storage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

// ── MessageOutbox ─────────────────────────────────────────────────

class MessageOutbox {
  private _queue: OutboxMessage[] = [];
  private _listeners = new Set<OutboxListener>();
  private _flushing = false;
  private _networkUnsub: (() => void) | null = null;
  private _sendFn: ((msg: OutboxMessage) => Promise<boolean>) | null = null;

  constructor() {
    this._queue = loadQueue();
  }

  // ── 초기화 (AppBootstrap에서 1회 호출) ──────────────────────────

  start(sendFn: (msg: OutboxMessage) => Promise<boolean>): void {
    this._sendFn = sendFn;

    // 온라인 복귀 시 자동 flush
    this._networkUnsub = networkMonitor.addListener(status => {
      if (status.isConnected && this.pendingCount > 0) {
        this.flush();
      }
    });

    // 앱 시작 시 큐에 남아있으면 즉시 시도
    if (networkMonitor.getStatus().isConnected && this.pendingCount > 0) {
      setTimeout(() => this.flush(), 300);
    }
  }

  stop(): void {
    this._networkUnsub?.();
    this._networkUnsub = null;
    this._sendFn = null;
  }

  // ── 메시지 큐잉 ────────────────────────────────────────────────

  enqueue(message: Omit<OutboxMessage, 'status' | 'retryCount'>): OutboxMessage {
    // 중복 방지
    const existing = this._queue.find(m => m.clientId === message.clientId);
    if (existing) return existing;

    const outboxMsg: OutboxMessage = {
      ...message,
      status: 'pending',
      retryCount: 0 };

    this._queue.push(outboxMsg);
    this._persist();

    // 온라인이면 즉시 전송 시도
    if (networkMonitor.getStatus().isConnected) {
      this.flush();
    }

    return outboxMsg;
  }

  // ── 전송 처리 ──────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this._flushing || !this._sendFn) return;
    this._flushing = true;

    try {
      while (true) {
        if (!networkMonitor.getStatus().isConnected) break;

        const pendingMsgs = this._queue.filter(
          m => m.status === 'pending' || (m.status === 'failed' && m.retryCount < MAX_RETRIES),
        );
        if (pendingMsgs.length === 0) break;

        let hasNetworkError = false;
        for (const msg of pendingMsgs) {
          if (!networkMonitor.getStatus().isConnected) {
            hasNetworkError = true;
            break;
          }

          const idx = this._queue.findIndex(m => m.clientId === msg.clientId);
          if (idx === -1) continue;

          this._queue[idx] = {
            ...this._queue[idx],
            status: 'sending',
            lastAttemptAt: Date.now() };
          this._emit();

          try {
            const currentMsg = this._queue[idx];
            const success = await this._sendFn!(currentMsg);

            if (success) {
              this._queue[idx] = { ...this._queue[idx], status: 'sent' };
              this._emit();
            } else {
              this._handleRetry(idx, 'Send returned false');
              // Delay on failure based on retryCount
              await this._delay(this._queue[idx]?.retryCount ?? 0);
            }
          } catch (err: any) {
            this._handleRetry(idx, err?.message ?? 'Unknown error');
            await this._delay(this._queue[idx]?.retryCount ?? 0);
          }
        }

        if (hasNetworkError) break;
      }

      // sent 상태 메시지 정리 (5분간 보존 후 제거)
      const now = Date.now();
      this._queue = this._queue.filter(
        m => m.status !== 'sent' || (now - (m.lastAttemptAt ?? m.timestamp) < 5 * 60 * 1000),
      );
    } finally {
      this._flushing = false;
      this._persist();
    }
  }

  private _handleRetry(idx: number, error: string): void {
    const msg = this._queue[idx];
    if (!msg) return;

    const retryCount = msg.retryCount + 1;
    const status = retryCount >= MAX_RETRIES ? 'failed' : 'pending';

    this._queue[idx] = {
      ...msg,
      retryCount,
      error,
      status };
  }

  // ── 상태 조회 ──────────────────────────────────────────────────

  getQueue(): OutboxMessage[] {
    return [...this._queue];
  }

  getMessageStatus(clientId: string): OutboxStatus | null {
    return this._queue.find(m => m.clientId === clientId)?.status ?? null;
  }

  get pendingCount(): number {
    return this._queue.filter(
      m => m.status === 'pending' || m.status === 'sending' || m.status === 'failed',
    ).length;
  }

  // ── 수동 재시도 ────────────────────────────────────────────────

  retryMessage(clientId: string): void {
    const msg = this._queue.find(m => m.clientId === clientId);
    if (msg && msg.status === 'failed') {
      this._queue = this._queue.map(m =>
        m.clientId === clientId ? { ...m, status: 'pending' as const, retryCount: 0 } : m,
      );
      this._persist();
      this.flush();
    }
  }

  retryAll(): void {
    this._queue = this._queue.map(m =>
      m.status === 'failed' ? { ...m, status: 'pending' as const, retryCount: 0 } : m,
    );
    this._persist();
    this.flush();
  }

  // ── 삭제 ───────────────────────────────────────────────────────

  removeMessage(clientId: string): void {
    this._queue = this._queue.filter(m => m.clientId !== clientId);
    this._persist();
  }

  clearAll(): void {
    this._queue = [];
    this._persist();
  }

  // ── 리스너 ─────────────────────────────────────────────────────

  addListener(fn: OutboxListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── 내부 ───────────────────────────────────────────────────────

  private _delay(retryCount: number): Promise<void> {
    const ms = Math.min(BASE_DELAY_MS * Math.pow(1.5, retryCount), MAX_DELAY_MS);
    return new Promise(r => setTimeout(r, ms));
  }

  private _persist(): void {
    saveQueue(this._queue);
    this._emit();
  }

  private _emit(): void {
    const snapshot = this.getQueue();
    this._listeners.forEach(fn => fn(snapshot));
  }
}

// ── Singleton ─────────────────────────────────────────────────────

export const messageOutbox = new MessageOutbox();
export default messageOutbox;
