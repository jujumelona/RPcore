// src/utils/ChapterDownloadManager.ts
// ═══════════════════════════════════════════════════════════════════
//  LNReader 오프라인 다운로드 패턴 이식
//  — 웹소설 챕터를 MMKV에 캐시하여 오프라인 읽기 지원
//
//  ✅ 개별/일괄 다운로드
//  ✅ 진행률 Zustand 스토어
//  ✅ 중복 다운로드 방지 (dedup)
//  ✅ 다운로드 취소 (AbortController)
//  ✅ 오프라인 읽기 캐시
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { createMMKVStorage } from './mmkvZustandStorage';
import { authedFetch } from './authedFetch';

// ── Types ──────────────────────────────────────────────────────────

export interface ChapterMeta {
  chapterId: string;
  novelId: string;
  title: string;
  order: number;
}

export interface DownloadTask {
  chapterId: string;
  novelId: string;
  status: 'queued' | 'downloading' | 'done' | 'error';
  progress: number; // 0~1
  error?: string;
}

interface DownloadState {
  tasks: Record<string, DownloadTask>;
  /** 현재 진행 중인 다운로드 수 */
  activeCount: number;

  // actions
  startDownload: (_chapter: ChapterMeta) => void;
  startBatchDownload: (_chapters: ChapterMeta[]) => void;
  cancelDownload: (_chapterId: string) => void;
  cancelAll: () => void;
  removeTask: (_chapterId: string) => void;
}

// ── MMKV 캐시 (챕터 텍스트 저장) ──────────────────────────────────

const chapterCache = createMMKVStorage({ id: 'chapter-cache' });

export function getCachedChapter(chapterId: string): string | null {
  return chapterCache.getItem(`ch:${chapterId}`) as string | null;
}

export function isChapterCached(chapterId: string): boolean {
  return chapterCache.getItem(`ch:${chapterId}`) !== null;
}

export function deleteCachedChapter(chapterId: string): void {
  chapterCache.removeItem(`ch:${chapterId}`);
}

export function clearChapterCache(): void {
  // MMKV 전체 캐시 크기를 위해 개별 삭제는 비효율
  // 앱 설정에서 일괄 삭제 시 사용
}

/**
 * ✅ [BUG-D FIX] 특정 스토리의 챕터 텍스트 캐시 삭제
 * cleanupStoryData에서 호출하여 스토리 삭제 시 챕터 캐시도 함께 정리
 */
export function deleteStoryChapterCache(chapterIds: string[]): void {
  chapterIds.forEach(id => {
    chapterCache.removeItem(`ch:${id}`);
  });
  if (chapterIds.length > 0) {
    console.log(`[ChapterDownloadManager] 챕터 캐시 ${chapterIds.length}개 삭제 완료`);
  }
}

// ── AbortController 레지스트리 ────────────────────────────────────

const _abortControllers = new Map<string, AbortController>();

// ── 다운로드 로직 ─────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
let _downloadQueue: ChapterMeta[] = [];
let _processing = false;

async function processQueue(get: () => DownloadState, set: (fn: (s: DownloadState) => Partial<DownloadState>) => void) {
  if (_processing) return;
  _processing = true;

  while (_downloadQueue.length > 0) {
    const state = get();
    const activeCount = Object.values(state.tasks).filter(t => t.status === 'downloading').length;
    if (activeCount >= MAX_CONCURRENT) {
      await new Promise<void>(r => setTimeout(r, 200));
      continue;
    }

    const chapter = _downloadQueue.shift();
    if (!chapter) break;

    const { chapterId, novelId } = chapter;

    // 이미 캐시됨
    if (isChapterCached(chapterId)) {
      set(s => ({
        tasks: {
          ...s.tasks,
          [chapterId]: { chapterId, novelId, status: 'done', progress: 1 } } }));
      continue;
    }

    // AbortController 생성
    const ac = new AbortController();
    _abortControllers.set(chapterId, ac);

    set(s => ({
      tasks: {
        ...s.tasks,
        [chapterId]: { chapterId, novelId, status: 'downloading', progress: 0 } },
      activeCount: s.activeCount + 1 }));

    try {
      const resp = await authedFetch(`/webnovel/${novelId}/chapter/${chapterId}`, {
        signal: ac.signal });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const text: string = data.content ?? data.text ?? '';

      // MMKV에 캐시
      chapterCache.setItem(`ch:${chapterId}`, text);

      set(s => ({
        tasks: {
          ...s.tasks,
          [chapterId]: { chapterId, novelId, status: 'done', progress: 1 } },
        activeCount: Math.max(0, s.activeCount - 1) }));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // 사용자 취소
        set(s => {
            
           
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [chapterId]: _, ...rest } = s.tasks;
          return { tasks: rest, activeCount: Math.max(0, s.activeCount - 1) };
        });
      } else {
        set(s => ({
          tasks: {
            ...s.tasks,
            [chapterId]: {
              chapterId,
              novelId,
              status: 'error',
              progress: 0,
              error: err?.message ?? 'Download failed' } },
          activeCount: Math.max(0, s.activeCount - 1) }));
      }
    } finally {
      _abortControllers.delete(chapterId);
    }
  }

  _processing = false;
}

// ── Zustand Store ─────────────────────────────────────────────────

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: {},
  activeCount: 0,

  startDownload: (chapter) => {
    if (get().tasks[chapter.chapterId]?.status === 'downloading') return;
    if (isChapterCached(chapter.chapterId)) {
      set(s => ({
        tasks: {
          ...s.tasks,
          [chapter.chapterId]: {
            chapterId: chapter.chapterId,
            novelId: chapter.novelId,
            status: 'done',
            progress: 1 } } }));
      return;
    }
    _downloadQueue.push(chapter);
    processQueue(get, set);
  },

  startBatchDownload: (chapters) => {
    const existing = get().tasks;
    const toAdd = chapters.filter(c =>
      !isChapterCached(c.chapterId) &&
      existing[c.chapterId]?.status !== 'downloading',
    );
    _downloadQueue.push(...toAdd);
    processQueue(get, set);
  },

  cancelDownload: (chapterId) => {
    _abortControllers.get(chapterId)?.abort();
    _abortControllers.delete(chapterId); // ✅ [BUG FIX] AbortController Map 항목 삭제 누락 수정
    _downloadQueue = _downloadQueue.filter(c => c.chapterId !== chapterId);
  },

  cancelAll: () => {
    _abortControllers.forEach(ac => ac.abort());
    _downloadQueue = [];
  },

   
  removeTask: (chapterId) => {
     
    set(s => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [chapterId]: _, ...rest } = s.tasks;
      return { tasks: rest };
    });
  } }));

/**
 * [NEW] 앱 종료/재시작 시 다운로드 큐 정리
 */
export function teardownDownloadManager(): void {
  _abortControllers.forEach(ac => ac.abort());
  _abortControllers.clear();
  _downloadQueue = [];
  _processing = false;
}
