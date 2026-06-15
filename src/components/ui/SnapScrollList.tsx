// src/components/ui/SnapScrollList.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 틱톡/인스타 릴스급 "찰싹 달라붙는" 스냅 스크롤 리스트
// • FlatList의 snapToInterval + decelerationRate로 네이티브 퍼포먼스 확보
// • 카드 높이를 자동 계산하여 화면에 딱 맞게 스냅
// • 페이징 인디케이터 포함
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useRef, useState } from 'react';
import {
  View, StyleSheet, useWindowDimensions,
  type ViewToken, type ListRenderItemInfo,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';

interface SnapScrollListProps<T> {
  data: T[];
  renderItem: (item: T, index: number, isActive: boolean) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  /** 카드 한 장의 높이 비율 (0~1, 기본 0.82 = 화면의 82%) */
  cardHeightRatio?: number;
  /** 카드 사이 간격 */
  gap?: number;
  /** 상단 여백 */
  topInset?: number;
  /** 카드 하단 여백 (하단 탭바 등) */
  bottomInset?: number;
  /** 페이징 점(dot) 표시 여부 */
  showPagination?: boolean;
}

export function SnapScrollList<T>({
  data,
  renderItem,
  keyExtractor,
  cardHeightRatio = 0.82,
  gap = 14,
  topInset = 0,
  bottomInset = 0,
  showPagination = true,
}: SnapScrollListProps<T>) {
  const { height: screenH } = useWindowDimensions();
  const cardH = Math.round(screenH * cardHeightRatio);
  const snapInterval = cardH + gap;

  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<any>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderWrapper = useCallback(
    (info: ListRenderItemInfo<T>) => (
      <View style={[s.cardWrapper, { height: cardH, marginBottom: gap }]}>
        {renderItem(info.item, info.index, info.index === activeIndex)}
      </View>
    ),
    [renderItem, cardH, gap, activeIndex],
  );

  return (
    <View style={s.container}>
      <FlashList
        ref={flatListRef}
        data={data}
        estimatedItemSize={snapInterval}
        keyExtractor={keyExtractor}
        renderItem={renderWrapper}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingBottom: bottomInset,
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* 페이징 인디케이터 (점) */}
      {showPagination && data.length > 1 && data.length <= 20 && (
        <Animated.View entering={FadeIn.delay(300)} style={s.pagination}>
          {data.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === activeIndex && s.dotActive,
              ]}
            />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  cardWrapper: {
    overflow: 'hidden',
  },
  pagination: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -40 }],
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D4A853',
  },
});
