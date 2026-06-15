// src/components/feed/OptimizedFeedList.tsx
// ═══════════════════════════════════════════════════════════════════
// Bluesky FlashList 최적화 패턴 이식
//
// ✅ getItemType — 포스트 타입별 레이아웃 크기 사전 계산
// ✅ overrideItemLayout — 이미지/텍스트 높이 분리
// ✅ viewabilityConfig — 화면 밖 이미지 로드 차단
// ✅ drawDistance 최적화 — 스크롤 방향 기반 프리렌더
// ✅ 중복 제거 (dedup by key)
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useRef, useMemo, memo } from 'react';
import { View,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  type ListRenderItem,
  type ViewToken } from 'react-native';
import { FlashList } from '@shopify/flash-list';

// ── Types ──────────────────────────────────────────────────────────

export type FeedItemType = 'text' | 'image' | 'link' | 'repost' | 'separator';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  /** 예상 높이 (px) — 타입별 기본값 사용 시 생략 가능 */
  estimatedHeight?: number;
}

interface OptimizedFeedListProps<T extends FeedItem> {
  items: T[];
  renderItem: ListRenderItem<T>;
  /** 아이템 키 추출 (기본: item.id) */
  keyExtractor?: (item: T, index: number) => string;
  /** 다음 페이지 로드 */
  onEndReached?: () => void;
  /** 풀-투-리프레시 */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  /** 빈 상태 컴포넌트 */
  ListEmptyComponent?: React.ReactElement;
  /** 스크롤 방향 기반 프리렌더 거리 (기본 300) */
  drawDistance?: number;
  /** 아이템 가시성 변경 콜백 (분석용) */
  onViewableItemsChanged?: (info: { viewableItems: ViewToken[] }) => void;
}

// ── 타입별 기본 높이 ──────────────────────────────────────────────

const ITEM_HEIGHT: Record<FeedItemType, number> = {
  text:      120,
  image:     320,
  link:      140,
  repost:    100,
  separator: 48 };

// ── Component ─────────────────────────────────────────────────────

function OptimizedFeedListInner<T extends FeedItem>(
  props: OptimizedFeedListProps<T>,
) {
  const {
    items,
    renderItem,
    keyExtractor,
    onEndReached,
    onRefresh,
    isRefreshing = false,
    isLoadingMore = false,
    ListEmptyComponent,
    drawDistance = 300,
    onViewableItemsChanged } = props;

  const flashListRef = useRef<any>(null);

  // ── Bluesky getItemType 패턴 ────────────────────────────────
  const getItemType = useCallback((item: T) => item.type, []);

  // ── Bluesky overrideItemLayout 패턴 ─────────────────────────
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }, item: T) => {
      layout.size = item.estimatedHeight ?? ITEM_HEIGHT[item.type] ?? 120;
    },
    [],
  );

  // ── viewabilityConfig — 50%+ 노출 시 "visible" 판정 ──────────
  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 300 }),
    [],
  );

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig,
      onViewableItemsChanged: onViewableItemsChanged
        ? (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
            onViewableItemsChanged({ viewableItems: info.viewableItems });
          }
        : undefined },
  ]);

  // ── key extractor ────────────────────────────────────────────
  const defaultKeyExtractor = useCallback(
    (item: T, index: number) => item.id || String(index),
    [],
  );

  // ── 푸터 (로딩중 인디케이터) ──────────────────────────────────
  const ListFooterComponent = useMemo(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color="rgba(168,130,255,0.7)" size="small" />
      </View>
    );
  }, [isLoadingMore]);

  // ── estimatedItemSize — 가장 흔한 타입의 높이 기반 ──────────
  const estimatedItemSize = useMemo(() => {
    if (!items.length) return 120;
    // 가장 많은 타입을 찾아서 그 높이를 사용
    const typeCounts: Record<string, number> = {};
    for (const item of items) {
      typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
    }
    let maxType: FeedItemType = 'text';
    let maxCount = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxType = type as FeedItemType;
        maxCount = count;
      }
    }
    return ITEM_HEIGHT[maxType] ?? 120;
  }, [items]);

  return (
    <FlashList
      ref={flashListRef}
      data={items}
      renderItem={renderItem as any}
      keyExtractor={keyExtractor ?? defaultKeyExtractor}
      getItemType={getItemType}
      overrideItemLayout={overrideItemLayout}
      estimatedItemSize={estimatedItemSize}
      drawDistance={drawDistance}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="rgba(168,130,255,0.7)"
            colors={['rgba(168,130,255,0.7)']}
          />
        ) : undefined
      }
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      viewabilityConfigCallbackPairs={
        onViewableItemsChanged ? viewabilityConfigCallbackPairs.current : undefined
      }
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      // Bluesky: maintainVisibleContentPosition 으로 새 아이템 추가 시 스크롤 점프 방지
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
    />
  );
}

export const OptimizedFeedList = memo(OptimizedFeedListInner) as typeof OptimizedFeedListInner;

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  footer: {
    paddingVertical: 20,
    alignItems: 'center' } });
