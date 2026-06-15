// src/hooks/useContentFilter.ts
// 피드/검색 결과에 콘텐츠 필터를 자동 적용하는 훅

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useContentFilterStore,
  filterItem,
  type FilterableItem,
  type FilterResult,
  type FilterAction } from '../utils/ContentFilter';

export interface FilteredItem<T extends FilterableItem> {
  item: T;
  filterResult: FilterResult;
}

/**
 * 아이템 배열에 콘텐츠 필터를 적용하는 훅
 * - hide: 배열에서 제거
 * - warn: 포함하되 filterResult.action === 'warn'
 * - show: 그대로 표시
 *
 * @param items 원본 아이템 배열
 * @param hideMode true면 warn도 숨김, false면 warn은 포함 (기본 false)
 */
export function useContentFilter<T extends FilterableItem>(
  items: T[],
  hideMode = false,
): FilteredItem<T>[] {
  const filterState = useContentFilterStore(
    useShallow(s => ({
      rules: s.rules,
      labelSettings: s.labelSettings,
      blockedAuthorIds: s.blockedAuthorIds,
      blockedTags: s.blockedTags })),
  );

  return useMemo(() => {
    const results: FilteredItem<T>[] = [];

    for (const item of items) {
      const result = filterItem(item, filterState);
      if (result.action === 'hide') continue;
      if (result.action === 'warn' && hideMode) continue;
      results.push({ item, filterResult: result });
    }

    return results;
  }, [items, filterState, hideMode]);
}

/**
 * 단일 아이템의 필터 결과를 반환
 */
export function useFilterCheck(item: FilterableItem | null): FilterResult {
  const filterState = useContentFilterStore(
    useShallow(s => ({
      rules: s.rules,
      labelSettings: s.labelSettings,
      blockedAuthorIds: s.blockedAuthorIds,
      blockedTags: s.blockedTags })),
  );

  return useMemo(() => {
    if (!item) return { action: 'show' as FilterAction };
    return filterItem(item, filterState);
  }, [item, filterState]);
}
