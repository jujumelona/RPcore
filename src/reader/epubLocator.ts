import type {
  Annotation as EpubAnnotation,
  Bookmark as EpubBookmark,
  Location as EpubLocation,
  Section as EpubSection,
} from '@epubjs-react-native/core';

import type { ReaderAnnotation, ReaderBookmark, ReaderLocator } from './ReaderAdapter';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function getLocationProgression(location: EpubLocation | null | undefined, progress?: number): number {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return clamp01(progress / 100);
  }

  const percentage = location?.start?.percentage;
  if (typeof percentage === 'number' && Number.isFinite(percentage)) {
    return clamp01(percentage);
  }

  return 0;
}

function getChapterIndex(
  location: EpubLocation | null | undefined,
  currentSection?: EpubSection | null,
  fallback = 0,
): number {
  const locationIndex = location?.start?.index;
  if (typeof locationIndex === 'number' && Number.isFinite(locationIndex)) {
    return Math.max(0, locationIndex);
  }

  if (currentSection?.id) {
    const matched = currentSection.id.match(/(\d+)/);
    if (matched?.[1]) {
      const parsed = Number.parseInt(matched[1], 10);
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }

  return Math.max(0, fallback);
}

export function buildEpubReaderLocator(input: {
  bookId: string;
  location: EpubLocation | null | undefined;
  currentSection?: EpubSection | null;
  progress?: number;
  fallbackChapterIndex?: number;
}): ReaderLocator {
  return {
    kind: 'epubjs',
    bookId: input.bookId,
    chapterIndex: getChapterIndex(input.location, input.currentSection, input.fallbackChapterIndex ?? 0),
    chapterId: input.currentSection?.id,
    progression: getLocationProgression(input.location, input.progress),
    href: input.currentSection?.href ?? input.location?.start?.href ?? input.location?.end?.href,
    cfi: input.location?.start?.cfi ?? input.location?.end?.cfi,
    pageIndex: typeof input.location?.start?.displayed?.page === 'number'
      ? Math.max(0, input.location.start.displayed.page - 1)
      : undefined,
    updatedAt: Date.now(),
  };
}

export function buildEpubAnnotationLocator(input: {
  bookId: string;
  annotation: EpubAnnotation;
}): ReaderLocator {
  return {
    kind: 'epubjs',
    bookId: input.bookId,
    chapterIndex: Math.max(0, input.annotation.sectionIndex ?? 0),
    progression: 0,
    cfi: input.annotation.cfiRange,
    updatedAt: Date.now(),
  };
}

export function resolveEpubInitialLocation(locator: ReaderLocator | null | undefined): string | undefined {
  if (!locator || locator.kind !== 'epubjs') return undefined;
  return locator.cfi ?? locator.href;
}

export function mapEpubBookmark(bookId: string, bookmark: EpubBookmark): ReaderBookmark {
  return {
    id: String(bookmark.id),
    label: bookmark.text || bookmark.section?.label || bookmark.section?.href,
    locator: buildEpubReaderLocator({
      bookId,
      location: bookmark.location,
      currentSection: bookmark.section,
    }),
    createdAt: Date.now(),
  };
}

export function mapEpubAnnotation(bookId: string, annotation: EpubAnnotation): ReaderAnnotation {
  const note =
    annotation.data && typeof annotation.data === 'object' && 'note' in annotation.data
      ? String(annotation.data.note ?? '')
      : undefined;

  return {
    id: `${annotation.sectionIndex}:${annotation.cfiRange}`,
    locator: buildEpubAnnotationLocator({ bookId, annotation }),
    quote: annotation.cfiRangeText,
    note,
    color: annotation.styles?.color,
    createdAt: Date.now(),
  };
}
