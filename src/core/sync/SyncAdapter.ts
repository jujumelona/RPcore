// src/core/sync/SyncAdapter.ts
// ═══════════════════════════════════════════════════════════════════
// Legend-State Local-First 동기화 어댑터
//
// ── 아키텍처 ──────────────────────────────────────────────────
//   참고: Legend-State synced() local-first 플러그인
//         Bluesky RN 앱 로컬/리모트 동기화 패턴
//
//   ① 로컬 퍼시스턴스: MMKV (react-native-mmkv) — 빠른 KV 저장
//   ② 오프라인 큐: 네트워크 없을 때 변경사항 큐에 저장
//   ③ 리모트 싱크: Cloudflare D1 API에 CRUD 요청
//   ④ 충돌 해결: updated_at 기반 LWW (Last-Writer-Wins)
//
//   현재 백엔드: Cloudflare Workers (D1 + R2 + KV)
//   → emotion_state, community_post 등 이미 updated_at 컬럼 존재
//
// ── 사용법 ──────────────────────────────────────────────────────
//   import { createSyncedStore, syncConfig } from './SyncAdapter';
//
//   // 1. 앱 시작 시
//   configureLegendSync();
//
//   // 2. 동기화 대상 상태 생성
//   const emotionSync = createSyncedStore({
//     key: 'emotion_state',
//     local: { persist: true, table: 'emotion_state' },
//     remote: { endpoint: '/api/emotion', method: 'PUT' },
//   });
// ═══════════════════════════════════════════════════════════════════

// MMKV dynamic import (native module may not be available in all environments)
type MMKVInstance = { getString: (key: string) => string | undefined; set: (key: string, value: string) => void; delete: (key: string) => void };

// ── MMKV 인스턴스 (동기화 전용) ──────────────────────────────────

let _syncStorage: MMKVInstance | null = null;

function getSyncStorage(): MMKVInstance {
  if (!_syncStorage) {
    try {
      const { MMKV } = require('react-native-mmkv') as { MMKV: new (opts: { id: string }) => MMKVInstance };
      _syncStorage = new MMKV({ id: 'legend-sync-offline-queue' });
    } catch {
      if (__DEV__) console.log('[Sync] MMKV 사용 불가, 임시 메모리 저장소 폴백 사용');
      const inMemoryStore = new Map<string, string>();
      _syncStorage = {
        getString: (k) => inMemoryStore.get(k),
        set: (k, v) => inMemoryStore.set(k, String(v)),
        delete: (k) => inMemoryStore.delete(k) };
    }
  }
  return _syncStorage;
}

// ── 오프라인 큐 ─────────────────────────────────────────────────

export interface QueuedChange {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = 'offline_queue';
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE_MS = 2000;

export class OfflineQueue {
  private get storage() { return getSyncStorage(); }

  /** 변경사항을 큐에 추가 */
  enqueue(change: Omit<QueuedChange, 'id' | 'timestamp' | 'retries'>): void {
    const queue = this.getAll();
    const item: QueuedChange = {
      ...change,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      retries: 0 };

    // 같은 테이블+데이터의 이전 변경 덮어쓰기 (중복 제거)
    const dataKey = change.data?.id ?? change.data?.client_id;
    if (dataKey) {
      const idx = queue.findIndex(
        q => q.table === change.table && (q.data?.id === dataKey || q.data?.client_id === dataKey),
      );
      if (idx >= 0) {
        queue[idx] = item;
        this._save(queue);
        return;
      }
    }

    queue.push(item);
    this._save(queue);
  }

  /** 큐의 모든 항목 조회 */
  getAll(): QueuedChange[] {
    try {
      const raw = this.storage.getString(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 처리 완료된 항목 제거 */
  dequeue(id: string): void {
    const queue = this.getAll().filter(q => q.id !== id);
    this._save(queue);
  }

  /** 재시도 카운트 증가 (최대 초과 시 삭제) */
  markRetry(id: string): boolean {
    const queue = this.getAll();
    const item = queue.find(q => q.id === id);
    if (!item) return false;

    item.retries++;
    if (item.retries >= MAX_RETRIES) {
      // 최대 재시도 초과 → 삭제 + 로그
      console.warn(`[Sync] 최대 재시도 초과, 변경사항 폐기:`, item);
      this.dequeue(id);
      return false;
    }
    this._save(queue);
    return true;
  }

  /** 큐 비우기 */
  clear(): void {
    this.storage.delete(QUEUE_KEY);
  }

  /** 큐 크기 */
  get size(): number {
    return this.getAll().length;
  }

  private _save(queue: QueuedChange[]): void {
    this.storage.set(QUEUE_KEY, JSON.stringify(queue));
  }
}

// ── 싱크 매니저 ─────────────────────────────────────────────────

export interface SyncConfig {
  /** 서버 베이스 URL */
  baseUrl: string;
  /** 인증 토큰 getter */
  getAuthToken: () => string | null;
  /** 네트워크 상태 확인 */
  isOnline?: () => boolean;
}

type SyncListener = (event: 'synced' | 'error' | 'queued', detail?: unknown) => void;

export class SyncManager {
  private static _instance: SyncManager | null = null;
  private config: SyncConfig | null = null;
  private queue = new OfflineQueue();
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: SyncListener[] = [];

  static getInstance(): SyncManager {
    if (!SyncManager._instance) SyncManager._instance = new SyncManager();
    return SyncManager._instance;
  }

  /** 초기 설정 */
  configure(config: SyncConfig): void {
    this.config = config;
    if (__DEV__) console.log('[Sync] 설정 완료:', config.baseUrl);
    // 큐에 미처리 항목이 있으면 즉시 동기화 시도
    if (this.queue.size > 0) {
      this.schedulSync(1000);
    }
  }

  /** 이벤트 리스너 등록 */
  on(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: 'synced' | 'error' | 'queued', detail?: unknown) {
    this.listeners.forEach(l => l(event, detail));
  }

  /** 변경사항 동기화 요청 */
  async pushChange(
    table: string,
    operation: 'create' | 'update' | 'delete',
    data: Record<string, unknown>,
  ): Promise<void> {
    // 오프라인이면 큐에 저장만
    if (!this.config || !(this.config.isOnline?.() ?? true)) {
      this.queue.enqueue({ table, operation, data });
      this.emit('queued', { table, operation });
      return;
    }

    try {
      await this._sendChange(table, operation, data);
      this.emit('synced', { table, operation });
    } catch {
      // 전송 실패 → 큐에 저장
      this.queue.enqueue({ table, operation, data });
      this.emit('queued', { table, operation });
      this.schedulSync(RETRY_DELAY_BASE_MS);
    }
  }

  /** 오프라인 큐 플러시 */
  async flushQueue(): Promise<number> {
    if (this.isSyncing || !this.config) return 0;
    this.isSyncing = true;

    const items = this.queue.getAll();
    let synced = 0;

    for (const item of items) {
      try {
        await this._sendChange(item.table, item.operation, item.data);
        this.queue.dequeue(item.id);
        synced++;
      } catch {
        const shouldRetry = this.queue.markRetry(item.id);
        if (!shouldRetry) continue;
        // 연속 실패 시 중단 (네트워크 문제일 수 있음)
        break;
      }
    }

    this.isSyncing = false;
    if (this.queue.size > 0) {
      this.schedulSync(RETRY_DELAY_BASE_MS * 2);
    }

    if (synced > 0) {
      this.emit('synced', { count: synced });
      if (__DEV__) console.log(`[Sync] ${synced}개 변경사항 동기화 완료`);
    }

    return synced;
  }

  /** 대기 중인 변경 수 */
  get pendingCount(): number {
    return this.queue.size;
  }

  // ── 내부 ──────────────────────────────────────────────────────

  private schedulSync(delayMs: number): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.flushQueue().catch(() => {});
    }, delayMs);
  }

  private async _sendChange(
    table: string,
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.config) throw new Error('[Sync] 미설정');

    const token = this.config.getAuthToken();
    if (!token) throw new Error('[Sync] 인증 토큰 없음');

    const url = `${this.config.baseUrl}/api/sync/${table}`;
    const method = operation === 'delete' ? 'DELETE' : operation === 'create' ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        operation,
        data,
        client_timestamp: Date.now() }) });

    if (!response.ok) {
      throw new Error(`[Sync] HTTP ${response.status}`);
    }
  }
}

// ── 공개 헬퍼 ───────────────────────────────────────────────────

/** 앱 시작 시 호출 — SyncManager 설정 */
export function configureLegendSync(config: SyncConfig): void {
  SyncManager.getInstance().configure(config);
}

/** 동기화 매니저 인스턴스 접근 */
export const syncManager = SyncManager.getInstance();
