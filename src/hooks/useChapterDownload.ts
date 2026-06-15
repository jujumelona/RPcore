// src/hooks/useChapterDownload.ts
// 챕터 다운로드 편의 훅 (LNReader 패턴)

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDownloadStore,
  isChapterCached,
  getCachedChapter,
  deleteCachedChapter,
  type ChapterMeta } from '../utils/ChapterDownloadManager';

/**
 * 특정 소설의 다운로드 상태를 구독하고 제어하는 훅
 */
export function useChapterDownload(novelId: string) {
  const { tasks, startDownload, startBatchDownload, cancelDownload, cancelAll } =
    useDownloadStore(
      useShallow(s => ({
        tasks: s.tasks,
        startDownload: s.startDownload,
        startBatchDownload: s.startBatchDownload,
        cancelDownload: s.cancelDownload,
        cancelAll: s.cancelAll })),
    );

  /** 이 소설의 다운로드 태스크만 필터 */
  const novelTasks = useMemo(
    () => Object.values(tasks).filter(t => t.novelId === novelId),
    [tasks, novelId],
  );

  const downloadingCount = useMemo(
    () => novelTasks.filter(t => t.status === 'downloading').length,
    [novelTasks],
  );

  const completedCount = useMemo(
    () => novelTasks.filter(t => t.status === 'done').length,
    [novelTasks],
  );

  const errorCount = useMemo(
    () => novelTasks.filter(t => t.status === 'error').length,
    [novelTasks],
  );

  const download = useCallback(
    (chapter: ChapterMeta) => startDownload(chapter),
    [startDownload],
  );

  const downloadAll = useCallback(
    (chapters: ChapterMeta[]) => startBatchDownload(chapters),
    [startBatchDownload],
  );

  const cancel = useCallback(
    (chapterId: string) => cancelDownload(chapterId),
    [cancelDownload],
  );

  const getChapterStatus = useCallback(
    (chapterId: string) => {
      if (tasks[chapterId]) return tasks[chapterId].status;
      if (isChapterCached(chapterId)) return 'done' as const;
      return 'idle' as const;
    },
    [tasks],
  );

  return {
    tasks: novelTasks,
    downloadingCount,
    completedCount,
    errorCount,
    download,
    downloadAll,
    cancel,
    cancelAll,
    getChapterStatus,
    isChapterCached,
    getCachedChapter,
    deleteCachedChapter };
}
