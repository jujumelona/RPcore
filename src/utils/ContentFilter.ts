// src/utils/ContentFilter.ts
// ═══════════════════════════════════════════════════════════════════
//  Bluesky Ozone 콘텐츠 모더레이션 패턴 이식
//  — 사용자 설정 기반 콘텐츠 필터링 레이어
//
//  ✅ 필터 프리셋: hide / warn / show
//  ✅ 키워드/정규식 로컬 필터
//  ✅ 서버 라벨 지원
//  ✅ 차단된 작가/태그 자동 필터링
//  ✅ Zustand + MMKV persist
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from './mmkvZustandStorage';

// ── Types ──────────────────────────────────────────────────────────

export type FilterAction = 'hide' | 'warn' | 'show';

export interface FilterRule {
  id: string;
  /** 키워드 또는 정규식 패턴 */
  pattern: string;
  isRegex: boolean;
  action: FilterAction;
  enabled: boolean;
  createdAt: number;
}

export interface ContentLabel {
  /** 서버에서 부여한 라벨 (예: 'nsfw', 'spoiler', 'violence') */
  label: string;
  action: FilterAction;
}

export interface FilterableItem {
  id: string;
  authorId?: string;
  authorName?: string;
  title?: string;
  content?: string;
  tags?: string[];
  labels?: string[];
}

export interface FilterResult {
  action: FilterAction;
  /** warn 시 표시할 이유 */
  reason?: string;
}

// ── Store ─────────────────────────────────────────────────────────

interface ContentFilterState {
  rules: FilterRule[];
  labelSettings: Record<string, FilterAction>;
  blockedAuthorIds: string[];
  blockedTags: string[];

  // actions
  addRule: (_rule: Omit<FilterRule, 'id' | 'createdAt'>) => void;
  removeRule: (_id: string) => void;
  toggleRule: (_id: string) => void;
  updateLabelSetting: (_label: string, _action: FilterAction) => void;
  setBlockedAuthors: (_ids: string[]) => void;
  setBlockedTags: (_tags: string[]) => void;
}

const mmkvStorage = createMMKVStorage({ id: 'content-filter' });

const DEFAULT_LABELS: Record<string, FilterAction> = {
  nsfw: 'hide',
  spoiler: 'warn',
  violence: 'warn',
  spam: 'hide' };

export const useContentFilterStore = create<ContentFilterState>()(
  persist(
    (set, _get) => ({
      rules: [],
      labelSettings: { ...DEFAULT_LABELS },
      blockedAuthorIds: [],
      blockedTags: [],

      addRule: (rule) =>
        set(s => ({
          rules: [
            ...s.rules,
            {
              ...rule,
              id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              createdAt: Date.now() },
          ] })),

      removeRule: (id) =>
        set(s => ({ rules: s.rules.filter(r => r.id !== id) })),

      toggleRule: (id) =>
        set(s => ({
          rules: s.rules.map(r =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
          ) })),

      updateLabelSetting: (label, action) =>
        set(s => ({
          labelSettings: { ...s.labelSettings, [label]: action } })),

      setBlockedAuthors: (ids) => set({ blockedAuthorIds: ids }),
      setBlockedTags: (tags) => set({ blockedTags: tags }) }),
    {
      name: 'content-filter-v1',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({
        rules: s.rules,
        labelSettings: s.labelSettings,
        blockedAuthorIds: s.blockedAuthorIds,
        blockedTags: s.blockedTags }) },
  ),
);

// ── Filter Engine ─────────────────────────────────────────────────

export function filterItem(
  item: FilterableItem,
  state: Pick<ContentFilterState, 'rules' | 'labelSettings' | 'blockedAuthorIds' | 'blockedTags'>,
): FilterResult {
  // 1) 차단된 작가
  if (item.authorId && state.blockedAuthorIds.includes(item.authorId)) {
    return { action: 'hide', reason: 'Blocked author' };
  }

  // 2) 차단된 태그
  if (item.tags?.some(t => state.blockedTags.includes(t.toLowerCase()))) {
    return { action: 'hide', reason: 'Blocked tag' };
  }

  // 3) 서버 라벨
  if (item.labels) {
    for (const label of item.labels) {
      const setting = state.labelSettings[label];
      if (setting === 'hide') return { action: 'hide', reason: `Label: ${label}` };
      if (setting === 'warn') return { action: 'warn', reason: `Label: ${label}` };
    }
  }

  // 4) 키워드/정규식 규칙
  const text = [item.title, item.content, item.authorName, ...(item.tags ?? [])].join(' ').toLowerCase();

  for (const rule of state.rules) {
    if (!rule.enabled) continue;

    let matches = false;
    if (rule.isRegex) {
      try {
        matches = new RegExp(rule.pattern, 'i').test(text);
      } catch {
        // 잘못된 정규식 무시
      }
    } else {
      matches = text.includes(rule.pattern.toLowerCase());
    }

    if (matches) {
      if (rule.action === 'hide') return { action: 'hide', reason: `Rule: ${rule.pattern}` };
      if (rule.action === 'warn') return { action: 'warn', reason: `Rule: ${rule.pattern}` };
    }
  }

  return { action: 'show' };
}
