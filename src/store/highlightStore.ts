/* eslint-disable @typescript-eslint/no-unused-vars */
// src/store/highlightStore.ts
// ═══════════════════════════════════════════════════════════════════
//  Kindle 텍스트 하이라이트 패턴
//  — 웹소설 챕터 내 구절 선택/하이라이트/저장
//
//  ✅ Zustand + MMKV persist
//  ✅ 챕터별 하이라이트 관리
//  ✅ 색상 구분 (4색)
//  ✅ 노트 메모 첨부
//  ✅ 전체 하이라이트 목록 조회
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from '../utils/mmkvZustandStorage';

// ── Types ──────────────────────────────────────────────────────────

export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink';

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#D4A85340',
  blue:   '#5B9BD540',
  green:  '#4CAF5040',
  pink:   '#E91E6340' };

export interface Highlight {
  id: string;
  novelId: string;
  chapterId: string;
  /** 선택된 텍스트 */
  text: string;
  /** 텍스트 시작 오프셋 */
  startOffset: number;
  /** 텍스트 끝 오프셋 */
  endOffset: number;
  color: HighlightColor;
  /** 사용자 메모 */
  note?: string;
  createdAt: number;
}

// ── Store ─────────────────────────────────────────────────────────

interface HighlightState {
  highlights: Record<string, Highlight[]>; // key: `${novelId}:${chapterId}`

  addHighlight: (_h: Omit<Highlight, 'id' | 'createdAt'>) => void;
  removeHighlight: (_novelId: string, _chapterId: string, _highlightId: string) => void;
  updateNote: (_novelId: string, _chapterId: string, _highlightId: string, _note: string) => void;
  updateColor: (_novelId: string, _chapterId: string, _highlightId: string, _color: HighlightColor) => void;
  getChapterHighlights: (_novelId: string, _chapterId: string) => Highlight[];
  getAllHighlights: () => Highlight[];
  getHighlightCount: () => number;
}

const mmkvStorage = createMMKVStorage({ id: 'highlights' });

function makeKey(novelId: string, chapterId: string) {
  return `${novelId}:${chapterId}`;
}

export const useHighlightStore = create<HighlightState>()(
  persist(
    (set, get) => ({
      highlights: {},

      addHighlight: (h) => {
        const key = makeKey(h.novelId, h.chapterId);
        const highlight: Highlight = {
          ...h,
          id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now() };

        set(s => ({
          highlights: {
            ...s.highlights,
            [key]: [...(s.highlights[key] ?? []), highlight] } }));
      },

      removeHighlight: (novelId, chapterId, highlightId) => {
        const key = makeKey(novelId, chapterId);
        set(s => ({
          highlights: {
            ...s.highlights,
            [key]: (s.highlights[key] ?? []).filter(h => h.id !== highlightId) } }));
      },

      updateNote: (novelId, chapterId, highlightId, note) => {
        const key = makeKey(novelId, chapterId);
        set(s => ({
          highlights: {
            ...s.highlights,
            [key]: (s.highlights[key] ?? []).map(h =>
              h.id === highlightId ? { ...h, note } : h,
            ) } }));
      },

      updateColor: (novelId, chapterId, highlightId, color) => {
        const key = makeKey(novelId, chapterId);
        set(s => ({
          highlights: {
            ...s.highlights,
            [key]: (s.highlights[key] ?? []).map(h =>
              h.id === highlightId ? { ...h, color } : h,
            ) } }));
      },

      getChapterHighlights: (novelId, chapterId) => {
        const key = makeKey(novelId, chapterId);
        return get().highlights[key] ?? [];
      },

      getAllHighlights: () => {
        const all: Highlight[] = [];
        for (const arr of Object.values(get().highlights)) {
          all.push(...arr);
        }
        return all.sort((a, b) => b.createdAt - a.createdAt);
      },

      getHighlightCount: () => {
        let count = 0;
        for (const arr of Object.values(get().highlights)) {
          count += arr.length;
        }
        return count;
      } }),
    {
      name: 'highlights-v1',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({ highlights: s.highlights }) },
  ),
);
