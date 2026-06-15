import { create } from 'zustand';

import type { ReaderLocator } from '../reader/ReaderAdapter';

export interface ReaderContextSnapshot {
  bookId: string;
  locator: ReaderLocator | null;
  chapterId?: string;
  paragraphId?: number;
  paragraphText?: string;
  selectedText?: string;
  updatedAt: number;
}

interface ReaderContextState {
  snapshots: Record<string, ReaderContextSnapshot>;
  setSnapshot: (snapshot: ReaderContextSnapshot) => void;
  patchSnapshot: (bookId: string, patch: Partial<Omit<ReaderContextSnapshot, 'bookId'>>) => void;
  clearSnapshot: (bookId: string) => void;
}

export const useReaderContextStore = create<ReaderContextState>((set) => ({
  snapshots: {},

  setSnapshot: (snapshot) =>
    set((state) => ({
      snapshots: {
        ...state.snapshots,
        [snapshot.bookId]: snapshot,
      },
    })),

  patchSnapshot: (bookId, patch) =>
    set((state) => {
      const prev = state.snapshots[bookId];

      return {
        snapshots: {
          ...state.snapshots,
          [bookId]: {
            ...prev,
            locator: prev?.locator ?? null,
            ...patch,
            bookId,
            updatedAt: patch.updatedAt ?? Date.now(),
          },
        },
      };
    }),

  clearSnapshot: (bookId) =>
    set((state) => {
      const { [bookId]: _removed, ...rest } = state.snapshots;
      return { snapshots: rest };
    }),
}));
