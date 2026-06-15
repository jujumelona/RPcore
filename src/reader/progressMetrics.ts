import type { NovelProgress } from '../store/readerSettingsStore';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function getNovelProgressRatio(
  progress: NovelProgress | null | undefined,
): number {
  if (!progress) {
    return 0;
  }

  if (typeof progress.locator?.progression === 'number') {
    return clamp01(progress.locator.progression);
  }

  if (progress.totalChapters > 0) {
    return clamp01(progress.chapterIndex / progress.totalChapters);
  }

  return 0;
}

export function formatLastReadTimestamp(
  timestamp: number | null | undefined,
  locale: string,
): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}
