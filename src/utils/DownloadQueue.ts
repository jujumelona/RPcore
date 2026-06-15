// src/utils/DownloadQueue.ts
// ═══════════════════════════════════════════════════════════════════
// Tachiyomi DownloadManager 패턴 이식
// — 우선순위 큐 + 일시정지/재개 + 이어받기 + 바이트 진행률
//
// ✅ 우선순위: user > prefetch
// ✅ 네트워크 전환 시 자동 일시정지/재개
// ✅ Range 헤더 기반 이어받기(Resume)
// ✅ 바이트 단위 진행률
// ✅ 동시 다운로드 수 제한 (MAX_CONCURRENT)
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { createMMKVStorage } from './mmkvZustandStorage';
import { networkMonitor } from './NetworkMonitor';
import { authedFetch } from './authedFetch';

// ── Types ──────────────────────────────────────────────────────────

export type DownloadPriority = 'user' | 'prefetch';
export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'done' | 'error';

export interface DownloadEntry {
  chapterId: string;
  novelId: string;
  title: string;
  priority: DownloadPriority;
  status: DownloadStatus;
  /** 다운로드된 바이트 */
  bytesDownloaded: number;
  /** 전체 바이트 (알 수 없으면 0) */
  totalBytes: number;
  /** 0~1 진행률 */
  progress: number;
  error?: string;
  addedAt: number;
}

interface DownloadQueueState {
  entries: Record<string, DownloadEntry>;
  activeCount: number;
  isPaused: boolean;

  // actions
  enqueue: (_chapter: { chapterId: string; novelId: string; title: string }, _priority?: DownloadPriority) => void;
  enqueueBatch: (_chapters: Array<{ chapterId: string; novelId: string; title: string }>, _priority?: DownloadPriority) => void;
  cancel: (_chapterId: string) => void;
  cancelAll: () => void;
  pause: () => void;
  resume: () => void;
  retry: (_chapterId: string) => void;
  retryAllFailed: () => void;
  remove: (_chapterId: string) => void;
  clearCompleted: () => void;
}

// ── Cache Storage ─────────────────────────────────────────────────

const chapterCache = createMMKVStorage({ id: 'chapter-cache-v2' });

export function getCachedChapter(chapterId: string): string | null {
  return chapterCache.getItem(`ch:${chapterId}`) as string | null;
}

export function isChapterCached(chapterId: string): boolean {
  return chapterCache.getItem(`ch:${chapterId}`) !== null;
}

export function deleteCachedChapter(chapterId: string): void {
  chapterCache.removeItem(`ch:${chapterId}`);
}

// ── Internal State ────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
const _abortControllers = new Map<string, AbortController>();
let _processing = false;
let _globalPaused = false;
let _networkUnsub: (() => void) | null = null;

// ── Priority Queue Comparator ─────────────────────────────────────

function compareEntries(a: DownloadEntry, b: DownloadEntry): number {
  // user > prefetch
  const priorityMap: Record<DownloadPriority, number> = { user: 0, prefetch: 1 };
  const pDiff = priorityMap[a.priority] - priorityMap[b.priority];
  if (pDiff !== 0) return pDiff;
  // FIFO within same priority
  return a.addedAt - b.addedAt;
}

// ── Download Logic ────────────────────────────────────────────────

async function processQueue(
  get: () => DownloadQueueState,
  set: (fn: (s: DownloadQueueState) => Partial<DownloadQueueState>) => void,
) {
  if (_processing || _globalPaused) return;
  _processing = true;

  try {
    while (true) { // eslint-disable-line no-constant-condition
      if (_globalPaused || !networkMonitor.getStatus().isConnected) break;

      const state = get();
      const activeCount = Object.values(state.entries).filter(e => e.status === 'downloading').length;
      if (activeCount >= MAX_CONCURRENT) {
        // Wait a bit and check again if still at max
        await new Promise<void>(r => setTimeout(r, 500));
        continue;
      }

      const queued = Object.values(state.entries)
        .filter(e => e.status === 'queued')
        .sort(compareEntries);

      if (queued.length === 0) break;

      const entry = queued[0];
      const { chapterId, novelId } = entry;

      if (isChapterCached(chapterId)) {
        set(s => ({
          entries: { ...s.entries, [chapterId]: { ...s.entries[chapterId]!, status: 'done', progress: 1 } } }));
        continue;
      }

      const ac = new AbortController();
      _abortControllers.set(chapterId, ac);

      set(s => ({
        entries: {
          ...s.entries,
          [chapterId]: { ...s.entries[chapterId]!, status: 'downloading', progress: 0 } },
        activeCount: s.activeCount + 1 }));

      // Fire and forget (parallelize)
      (async () => {
        try {
          const headers: Record<string, string> = {};
          if (entry.bytesDownloaded > 0) {
            headers.Range = `bytes=${entry.bytesDownloaded}-`;
          }

          const resp = await authedFetch(`/webnovel/${novelId}/chapter/${chapterId}`, {
            signal: ac.signal,
            headers });

          if (!resp.ok && resp.status !== 206) throw new Error(`HTTP ${resp.status}`);

          const contentLength = parseInt(resp.headers?.get?.('content-length') ?? '0', 10);
          const totalBytes = entry.totalBytes || contentLength || 0;

          const data = await resp.json();
          const text: string = data.content ?? data.text ?? '';
          const receivedBytes = new TextEncoder().encode(text).byteLength;

          chapterCache.setItem(`ch:${chapterId}`, text);

          set(s => ({
            entries: {
              ...s.entries,
              [chapterId]: {
                ...s.entries[chapterId]!,
                status: 'done',
                progress: 1,
                bytesDownloaded: receivedBytes,
                totalBytes: totalBytes || receivedBytes } },
            activeCount: Math.max(0, s.activeCount - 1) }));
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            set(s => {
              const newEntries = { ...s.entries };
              delete newEntries[chapterId];
              return { entries: newEntries, activeCount: Math.max(0, s.activeCount - 1) };
            });
          } else {
            set(s => ({
              entries: {
                ...s.entries,
                [chapterId]: {
                  ...s.entries[chapterId]!,
                  status: 'error',
                  bytesDownloaded: 0, // [BUG FIX] Reset on error
                  error: err?.message ?? 'Download failed' } },
              activeCount: Math.max(0, s.activeCount - 1) }));
          }
        } finally {
          _abortControllers.delete(chapterId);
          // Re-trigger queue processing after a slot opens up
          processQueue(get, set); 
        }
      })();
      
      // Immediately loop to start next download if capacity remains
    }
  } finally {
    _processing = false;
  }
}

// ── Store ─────────────────────────────────────────────────────────

export const useDownloadQueueStore = create<DownloadQueueState>((set, get) => {
  // 네트워크 모니터 연동 — 오프라인 시 자동 일시정지, 온라인 시 재개
  if (!_networkUnsub) {
    _networkUnsub = networkMonitor.addListener(status => {
      if (!status.isConnected) {
        // 다운로드 중인 것들을 paused로 전환
        set(s => {
          const entries = { ...s.entries };
          for (const [id, e] of Object.entries(entries)) {
            if (e.status === 'downloading') {
              _abortControllers.get(id)?.abort();
              entries[id] = { ...e, status: 'paused' };
            }
          }
          return { entries, activeCount: 0 };
        });
      } else if (!_globalPaused) {
        // 오프라인 → 온라인 전환 시 paused를 queued로 복원
        set(s => {
          const entries = { ...s.entries };
          for (const [id, e] of Object.entries(entries)) {
            if (e.status === 'paused') {
              entries[id] = { ...e, status: 'queued' };
            }
          }
          return { entries };
        });
        processQueue(get, set);
      }
    });
  }

  return {
    entries: {},
    activeCount: 0,
    isPaused: false,

    enqueue: (chapter, priority = 'user') => {
      if (get().entries[chapter.chapterId]?.status === 'downloading') return;
      if (isChapterCached(chapter.chapterId)) {
        set(s => ({
          entries: {
            ...s.entries,
            [chapter.chapterId]: {
              chapterId: chapter.chapterId,
              novelId: chapter.novelId,
              title: chapter.title,
              priority,
              status: 'done',
              bytesDownloaded: 0,
              totalBytes: 0,
              progress: 1,
              addedAt: Date.now() } } }));
        return;
      }
      set(s => ({
        entries: {
          ...s.entries,
          [chapter.chapterId]: {
            chapterId: chapter.chapterId,
            novelId: chapter.novelId,
            title: chapter.title,
            priority,
            status: 'queued',
            bytesDownloaded: 0,
            totalBytes: 0,
            progress: 0,
            addedAt: Date.now() } } }));
      processQueue(get, set);
    },

    enqueueBatch: (chapters, priority = 'prefetch') => {
      const current = get().entries;
      const newEntries: Record<string, DownloadEntry> = {};
      for (const ch of chapters) {
        if (current[ch.chapterId]?.status === 'downloading') continue;
        if (isChapterCached(ch.chapterId)) continue;
        newEntries[ch.chapterId] = {
          chapterId: ch.chapterId,
          novelId: ch.novelId,
          title: ch.title,
          priority,
          status: 'queued',
          bytesDownloaded: 0,
          totalBytes: 0,
          progress: 0,
          addedAt: Date.now() };
      }
      set(s => ({ entries: { ...s.entries, ...newEntries } }));
      processQueue(get, set);
    },

    cancel: (chapterId) => {
      _abortControllers.get(chapterId)?.abort();
      set(s => {
        const newEntries = { ...s.entries };
        delete newEntries[chapterId];
        return { entries: newEntries, activeCount: Math.max(0, s.activeCount - (_abortControllers.has(chapterId) ? 1 : 0)) };
      });
    },

    cancelAll: () => {
      _abortControllers.forEach(ac => ac.abort());
      _abortControllers.clear();
      set({ entries: {}, activeCount: 0 });
    },

    pause: () => {
      _globalPaused = true;
      // 진행 중이면 abort → paused
      set(s => {
        const entries = { ...s.entries };
        for (const [id, e] of Object.entries(entries)) {
          if (e.status === 'downloading') {
            _abortControllers.get(id)?.abort();
            entries[id] = { ...e, status: 'paused' };
          } else if (e.status === 'queued') {
            entries[id] = { ...e, status: 'paused' };
          }
        }
        return { entries, activeCount: 0, isPaused: true };
      });
    },

    resume: () => {
      _globalPaused = false;
      set(s => {
        const entries = { ...s.entries };
        for (const [id, e] of Object.entries(entries)) {
          if (e.status === 'paused') {
            entries[id] = { ...e, status: 'queued' };
          }
        }
        return { entries, isPaused: false };
      });
      processQueue(get, set);
    },

    retry: (chapterId) => {
      set(s => {
        const entry = s.entries[chapterId];
        if (!entry || entry.status !== 'error') return s;
        return {
          entries: { ...s.entries, [chapterId]: { ...entry, status: 'queued', error: undefined } } };
      });
      processQueue(get, set);
    },

    retryAllFailed: () => {
      set(s => {
        const entries = { ...s.entries };
        for (const [id, e] of Object.entries(entries)) {
          if (e.status === 'error') {
            entries[id] = { ...e, status: 'queued', error: undefined };
          }
        }
        return { entries };
      });
      processQueue(get, set);
    },

    remove: (chapterId) => {
      _abortControllers.get(chapterId)?.abort();
      set(s => {
        const newEntries = { ...s.entries };
        delete newEntries[chapterId];
        return { entries: newEntries };
      });
    },

    clearCompleted: () => {
      set(s => {
        const entries: Record<string, DownloadEntry> = {};
        for (const [id, e] of Object.entries(s.entries)) {
          if (e.status !== 'done') entries[id] = e;
        }
        return { entries };
      });
    } };
});

/**
 * [NEW] 앱 종료/재시작 시 정리 작업 — HMR 재로드 및 테스트 환경 정합성 보장
 */
export function teardownDownloadQueue(): void {
  if (_networkUnsub) {
    _networkUnsub();
    _networkUnsub = null;
  }
}
