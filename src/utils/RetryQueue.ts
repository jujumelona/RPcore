/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/RetryQueue.ts
// ═══════════════════════════════════════════════════════════════════
//  Bluesky persisted-fetch 패턴 이식 — 실패한 뮤테이션을 MMKV에 영속화하고
//  네트워크 복구 시 exponential backoff으로 자동 재시도
//
//  ✅ MMKV 영속화 (앱 재시작 후에도 큐 유지)
//  ✅ NetworkMonitor 연동 — 온라인 복귀 시 자동 flush
//  ✅ 최대 재시도 횟수 초과 시 dead-letter → 사용자 알림
//  ✅ 중복 방지 (idempotencyKey)
// ═══════════════════════════════════════════════════════════════════

import { createMMKVStorage } from './mmkvZustandStorage';
import { networkMonitor } from './NetworkMonitor';

// ── Types ──────────────────────────────────────────────────────────

export interface QueuedAction {
  id: string;
  /** 엔드포인트 경로 (예: '/authors/123/follow') */
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Record<string, unknown>;
  /** 멱등성 키 — 같은 키가 이미 큐에 있으면 중복 추가 방지 */
  idempotencyKey: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt?: number;
}

export interface RetryQueueState {
  pending: QueuedAction[];
  deadLetter: QueuedAction[];
}

type QueueListener = (state: RetryQueueState) => void;

// ── Constants ─────────────────────────────────────────────────────

const MAX_RETRIES      = 5;
const BASE_DELAY_MS    = 1_000;
const MAX_DELAY_MS     = 30_000;
const STORAGE_KEY      = 'retry-queue-v1';

// ── Storage ───────────────────────────────────────────────────────

const storage = createMMKVStorage({ id: 'retry-queue' });

function loadState(): RetryQueueState {
  try {
    const raw = storage.getItem(STORAGE_KEY) as string | null;
    if (raw) return JSON.parse(raw);
  } catch {}
  return { pending: [], deadLetter: [] };
}

function saveState(state: RetryQueueState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── RetryQueue ────────────────────────────────────────────────────

class RetryQueue {
  private _state: RetryQueueState;
  private _listeners = new Set<QueueListener>();
  private _flushing  = false;
  private _networkUnsub: (() => void) | null = null;
  private _fetchFn: (endpoint: string, init: RequestInit) => Promise<Response>;

  constructor() {
    this._state = loadState();

    // 기본 fetch — authedFetch 사용
    this._fetchFn = async (endpoint, init) => {
      const { authedFetch } = require('./authedFetch');
      return authedFetch(endpoint, init);
    };
  }

  // ── 초기화 (AppBootstrap에서 1회 호출) ────────────────────────────

  start(): void {
    // 온라인 복귀 시 자동 flush
    this._networkUnsub = networkMonitor.addListener(status => {
      if (status.isConnected && this._state.pending.length > 0) {
        this.flush();
      }
    });

    // 앱 시작 시 큐에 남아있으면 즉시 시도
    if (networkMonitor.getStatus().isConnected && this._state.pending.length > 0) {
      setTimeout(() => this.flush(), 500);
    }
  }

  stop(): void {
    this._networkUnsub?.();
    this._networkUnsub = null;
  }

  // ── 엔큐 ─────────────────────────────────────────────────────────

  enqueue(action: Omit<QueuedAction, 'id' | 'retryCount' | 'createdAt' | 'maxRetries'>): void {
    // 중복 방지
    if (this._state.pending.some(a => a.idempotencyKey === action.idempotencyKey)) {
      return;
    }

    const queued: QueuedAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      createdAt: Date.now() };

    this._state.pending.push(queued);
    this._persist();

    // 온라인이면 즉시 시도
    if (networkMonitor.getStatus().isConnected) {
      this.flush();
    }
  }

  // ── flush (순차 실행) ────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this._flushing || this._state.pending.length === 0) return;
    this._flushing = true;

    try {
      while (true) { // eslint-disable-line no-constant-condition
        const pendingMsgs = this._state.pending.filter(
          a => a.retryCount < a.maxRetries
        );
        if (pendingMsgs.length === 0 || !networkMonitor.getStatus().isConnected) break;

        for (const action of pendingMsgs) {
          if (!networkMonitor.getStatus().isConnected) break;

          let success = false;
          let fatal = false;

          try {
            const resp = await this._fetchFn(action.endpoint, {
              method: action.method,
              headers: { 'Content-Type': 'application/json' },
              body: action.body ? JSON.stringify(action.body) : undefined });

            if (resp.ok || resp.status === 409) {
              success = true;
            } else if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
              fatal = true;
            }
          } catch {
            // Network error
          }

          if (success) {
            this._state.pending = this._state.pending.filter(a => a.id !== action.id);
          } else if (fatal) {
            this._moveToDead(action);
          } else {
            this._incrementRetry(action);
            // Only delay if it hasn't been moved to dead-letter
            if (this._state.pending.some(a => a.id === action.id)) {
              await this._delay(action);
            }
          }
        }
      }
    } finally {
      this._flushing = false;
      this._persist();
    }
  }

  // ── 상태 접근 ───────────────────────────────────────────────────

  getState(): RetryQueueState {
    return { ...this._state };
  }

  get pendingCount(): number {
    return this._state.pending.length;
  }

  clearDeadLetter(): void {
    this._state.deadLetter = [];
    this._persist();
  }

  addListener(fn: QueueListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── 내부 ─────────────────────────────────────────────────────────

  private _incrementRetry(action: QueuedAction): void {
    action.retryCount++;
    action.lastAttemptAt = Date.now();
    if (action.retryCount >= action.maxRetries) {
      this._moveToDead(action);
    }
  }

  private _moveToDead(action: QueuedAction): void {
    this._state.pending = this._state.pending.filter(a => a.id !== action.id);
    this._state.deadLetter.push(action);
    // dead-letter가 50개 초과 시 오래된 것 제거
    if (this._state.deadLetter.length > 50) {
      this._state.deadLetter = this._state.deadLetter.slice(-50);
    }
  }

  private _delay(action: QueuedAction): Promise<void> {
    const ms = Math.min(BASE_DELAY_MS * Math.pow(2, action.retryCount), MAX_DELAY_MS);
    return new Promise(r => setTimeout(r, ms));
  }

  private _persist(): void {
    saveState(this._state);
    this._listeners.forEach(fn => fn(this.getState()));
  }
}

// ── Singleton ─────────────────────────────────────────────────────

export const retryQueue = new RetryQueue();
export default retryQueue;
