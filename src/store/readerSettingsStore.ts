import { Typography } from '../constants/tokens';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from '../utils/mmkvZustandStorage';
import type { ReaderLocator } from '../reader/ReaderAdapter';

// ── MMKV Zustand Storage (lazy, Nitro-safe) ─────────────────────────────────
const mmkvStorage = createMMKVStorage({ id: 'reader-settings' });

// ── Types ──────────────────────────────────────────────────────────────────
export type ReaderTheme = 'dark' | 'sepia' | 'white' | 'night';
export type ScrollMode = 'vertical' | 'paged' | 'horizontal';

export interface ReaderSettings {
  fontSize: number;           // 14–28
  lineHeight: number;         // 1.4–2.2
  paragraphSpacing: number;   // 8–32
  theme: ReaderTheme;
  fontFamily: string;
  scrollMode: ScrollMode;
  keepScreenOn: boolean;
  showProgressBar: boolean;
  showLineNumbers: boolean;
  fullscreenOnRead: boolean;
  autoScrollSpeed: number;    // 0 = off, 1–10
}

export interface NovelProgress {
  novelId: string;
  chapterIndex: number;       // current chapter
  scrollOffset: number;       // scroll position in chapter
  totalChapters: number;
  lastReadAt: number;         // timestamp
  pageIndex?: number;         // for paged mode
  locator?: ReaderLocator;
}

interface ReaderSettingsState {
  settings: ReaderSettings;
  progressMap: Record<string, NovelProgress>;
  updateSettings: (_partial: Partial<ReaderSettings>) => void;
  resetSettings: () => void;

  saveProgress: (_progress: NovelProgress) => void;
  getProgress: (_novelId: string) => NovelProgress | undefined;
  clearProgress: (_novelId: string) => void;
}

// ── Defaults (LNReader defaults 참고) ─────────────────────────────────────
const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.75,
  paragraphSpacing: 16,
  theme: 'dark',
  fontFamily: Typography.fontFamily.regular,
  scrollMode: 'vertical',
  keepScreenOn: true,
  showProgressBar: true,
  showLineNumbers: false,
  fullscreenOnRead: false,
  autoScrollSpeed: 0 };

// ── Theme Definitions ──────────────────────────────────────────────────────
export const READER_THEMES: Record<ReaderTheme, { bg: string; text: string; secondary: string; label: string }> = {
  dark:   { bg: '#0C0C14', text: '#D8D8E8', secondary: '#8A8A9E', label: '다크' },
  sepia:  { bg: '#1A1610', text: '#C8B89A', secondary: '#a0907e', label: '세피아' },
  white:  { bg: '#FAFAFA', text: '#1A1A2E', secondary: '#6A6A7E', label: '화이트' },
  night:  { bg: '#080810', text: '#9A9AB0', secondary: '#606072', label: '야간' } };

// ── Font Options ──────────────────────────────────────────────────────────
export const FONT_OPTIONS = [
  { label: 'Pretendard', value: Typography.fontFamily.regular },
  { label: '나눔고딕', value: 'NanumGothic' },
  { label: '나눔명조', value: 'NanumMyeongjo' },
  { label: 'Noto Serif', value: 'NotoSerifKR-Regular' },
];

// ── Store ──────────────────────────────────────────────────────────────────
export const useReaderSettingsStore = create<ReaderSettingsState>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },
      progressMap: {},

      updateSettings: (partial) =>
        set(state => ({
          settings: { ...state.settings, ...partial } })),

      resetSettings: () =>
        set({ settings: { ...DEFAULT_SETTINGS } }),

      saveProgress: (progress) =>
        set(state => ({
          progressMap: {
            ...state.progressMap,
            [progress.novelId]: {
              ...progress,
              lastReadAt: Date.now() } } })),

      getProgress: (novelId) => get().progressMap[novelId],

      clearProgress: (novelId) =>
        set(state => {
            
           
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [novelId]: _, ...rest } = state.progressMap;
          return { progressMap: rest };
        }) }),
    {
      name: 'reader-settings',
      storage: createJSONStorage(() => mmkvStorage) },
  ),
);

// ── Helpers ────────────────────────────────────────────────────────────────
export function getReaderTheme(theme: ReaderTheme) {
  return READER_THEMES[theme] ?? READER_THEMES.dark;
}

export function clampFontSize(size: number) {
  return Math.min(28, Math.max(14, size));
}

export function clampLineHeight(lh: number) {
  return Math.min(2.2, Math.max(1.4, lh));
}
