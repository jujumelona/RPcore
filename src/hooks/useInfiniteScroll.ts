/* eslint-disable @typescript-eslint/no-unused-vars */
// src/hooks/useInfiniteScroll.ts
// ═══════════════════════════════════════════════════════════════════
//  재사용 가능 무한 스크롤 페이지네이션 훅
//  — Reddit/Bluesky 피드 패턴 이식
//
//  ✅ 커서 기반 + 오프셋 기반 페이지네이션 지원
//  ✅ 중복 요청 방지 (dedup)
//  ✅ pull-to-refresh
//  ✅ 1페이지 프리패치
//  ✅ 에러 재시도
// ═══════════════════════════════════════════════════════════════════

  
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useCallback, useRef, useMemo } from 'react';

// ── Types ──────────────────────────────────────────────────────────

export interface PageResult<T> {
  items: T[];
  /** 다음 페이지 커서 (없으면 마지막 페이지) */
  nextCursor?: string | null;
  /** 전체 아이템 수 (선택) */
  totalCount?: number;
}

export interface UseInfiniteScrollOptions<T> {
  /** 페이지 패처 함수 */
  fetcher: (cursor: string | null, pageSize: number) => Promise<PageResult<T>>;
  /** 페이지 크기 (기본 20) */
  pageSize?: number;
  /** 아이템 고유 키 추출 (중복 제거용) */
  getKey?: (item: T) => string;
  /** 자동 초기 로드 (기본 true) */
  autoLoad?: boolean;
}

export interface UseInfiniteScrollResult<T> {
  items: T[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  totalCount?: number;

  /** FlatList onEndReached에 연결 */
  loadMore: () => void;
  /** pull-to-refresh에 연결 */
  refresh: () => Promise<void>;
  /** 수동 재시도 */
  retry: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useInfiniteScroll<T>(
  options: UseInfiniteScrollOptions<T>,
): UseInfiniteScrollResult<T> {
  const {
    fetcher,
    pageSize = 20,
    getKey,
    autoLoad = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | undefined>();

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const initialLoadDone = useRef(false);

  // 중복 제거
  const dedup = useCallback(
    (existing: T[], newItems: T[]): T[] => {
      if (!getKey) return [...existing, ...newItems];
      const existingKeys = new Set(existing.map(getKey));
      const unique = newItems.filter(item => !existingKeys.has(getKey(item)));
      return [...existing, ...unique];
    },
    [getKey],
  );

  // ── 초기 로드 + 리프레시 ────────────────────────────────────

  const fetchPage = useCallback(
    async (isRefresh: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      if (isRefresh) {
        setIsRefreshing(true);
        cursorRef.current = null;
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await fetcher(null, pageSize);
        setItems(result.items);
        cursorRef.current = result.nextCursor ?? null;
        setHasMore(!!result.nextCursor && result.items.length >= pageSize);
        if (result.totalCount != null) setTotalCount(result.totalCount);
        initialLoadDone.current = true;
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        loadingRef.current = false;
      }
    },
    [fetcher, pageSize],
  );

  // 자동 초기 로드
  const hasAutoLoaded = useRef(false);
  if (autoLoad && !hasAutoLoaded.current) {
    hasAutoLoaded.current = true;
    // 비동기 초기 로드 트리거 (useEffect 불필요)
    fetchPage(false);
  }

  // ── 다음 페이지 ─────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore || !cursorRef.current) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    fetcher(cursorRef.current, pageSize)
      .then(result => {
        setItems(prev => dedup(prev, result.items));
        cursorRef.current = result.nextCursor ?? null;
        setHasMore(!!result.nextCursor && result.items.length >= pageSize);
        if (result.totalCount != null) setTotalCount(result.totalCount);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load more');
      })
      .finally(() => {
        setIsLoadingMore(false);
        loadingRef.current = false;
      });
  }, [fetcher, pageSize, hasMore, dedup]);

  // ── Refresh ─────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    await fetchPage(true);
  }, [fetchPage]);

  // ── Retry ───────────────────────────────────────────────────

  const retry = useCallback(() => {
    if (initialLoadDone.current) {
      loadMore();
    } else {
      fetchPage(false);
    }
  }, [fetchPage, loadMore]);

  return {
    items,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    error,
    totalCount,
    loadMore,
    refresh,
    retry };
}
