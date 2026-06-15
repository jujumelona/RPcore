import type { ReaderLocator } from './ReaderAdapter';

export interface ScrollLocatorInput {
  bookId: string;
  chapterIndex?: number;
  chapterId?: string;
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
  paragraphId?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function buildScrollReaderLocator(input: ScrollLocatorInput): ReaderLocator {
  const maxScrollable = Math.max(0, input.contentHeight - input.viewportHeight);
  const progression = maxScrollable > 0 ? clamp01(input.offsetY / maxScrollable) : 0;

  return {
    kind: 'scroll',
    bookId: input.bookId,
    chapterIndex: input.chapterIndex ?? 0,
    chapterId: input.chapterId,
    progression,
    scrollOffset: Math.max(0, input.offsetY),
    paragraphId: typeof input.paragraphId === 'number' && input.paragraphId >= 0
      ? input.paragraphId
      : undefined,
    updatedAt: Date.now(),
  };
}

export function resolveScrollOffsetFromLocator(
  locator: ReaderLocator | null | undefined,
  contentHeight: number,
  viewportHeight: number,
  fallbackOffset = 0,
): number {
  if (!locator || locator.kind !== 'scroll') {
    return Math.max(0, fallbackOffset);
  }

  if (typeof locator.scrollOffset === 'number' && Number.isFinite(locator.scrollOffset)) {
    return Math.max(0, locator.scrollOffset);
  }

  const maxScrollable = Math.max(0, contentHeight - viewportHeight);
  return Math.round(clamp01(locator.progression) * maxScrollable);
}
