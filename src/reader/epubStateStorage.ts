import type { Annotation as EpubAnnotation, Bookmark as EpubBookmark } from '@epubjs-react-native/core';

import { appStorage } from '../utils/storage';

const LAST_SOURCE_KEY = '@epub-reader-spike:last-source';

function bookmarksKey(bookId: string): string {
  return `@epub-reader:bookmarks:${bookId}`;
}

function annotationsKey(bookId: string): string {
  return `@epub-reader:annotations:${bookId}`;
}

function parseStoredArray<T>(raw: string | undefined): T[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function loadPersistedEpubBookmarks(bookId: string): EpubBookmark[] {
  return parseStoredArray<EpubBookmark>(appStorage.getString(bookmarksKey(bookId)));
}

export function savePersistedEpubBookmarks(bookId: string, bookmarks: EpubBookmark[]): void {
  appStorage.set(bookmarksKey(bookId), JSON.stringify(bookmarks));
}

export function loadPersistedEpubAnnotations(bookId: string): EpubAnnotation[] {
  return parseStoredArray<EpubAnnotation>(appStorage.getString(annotationsKey(bookId)));
}

export function savePersistedEpubAnnotations(bookId: string, annotations: EpubAnnotation[]): void {
  appStorage.set(annotationsKey(bookId), JSON.stringify(annotations));
}

export function loadLastEpubSpikeSource(): string {
  return appStorage.getString(LAST_SOURCE_KEY) ?? '';
}

export function saveLastEpubSpikeSource(source: string): void {
  if (!source.trim()) {
    appStorage.remove(LAST_SOURCE_KEY);
    return;
  }

  appStorage.set(LAST_SOURCE_KEY, source.trim());
}
