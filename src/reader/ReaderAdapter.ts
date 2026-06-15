export type ReaderAdapterKind = 'scroll' | 'epubjs' | 'readium';

export interface ReaderLocator {
  kind: ReaderAdapterKind;
  bookId: string;
  chapterIndex: number;
  chapterId?: string;
  progression: number;
  scrollOffset?: number;
  pageIndex?: number;
  href?: string;
  cfi?: string;
  paragraphId?: number;
  updatedAt: number;
}

export interface ReaderSelection {
  text: string;
  locator: ReaderLocator;
}

export interface ReaderBookmark {
  id: string;
  label?: string;
  locator: ReaderLocator;
  createdAt: number;
}

export interface ReaderAnnotation {
  id: string;
  locator: ReaderLocator;
  quote?: string;
  note?: string;
  color?: string;
  createdAt: number;
}

export interface ReaderOpenInput {
  bookId: string;
  sourceUri?: string;
  manifestPath?: string;
  initialLocator?: ReaderLocator | null;
}

export interface ReaderAdapter {
  readonly kind: ReaderAdapterKind;
  open: (_input: ReaderOpenInput) => Promise<void>;
  close: () => Promise<void>;
  goTo: (_locator: ReaderLocator) => Promise<void>;
  getCurrentLocator: () => Promise<ReaderLocator | null>;
}
