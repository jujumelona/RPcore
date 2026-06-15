/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/ImageViewerModal.tsx
import { Typography } from '../constants/tokens';
import { useEffect, useRef, useState } from 'react';
import { Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LegendList, type LegendListRef } from '@legendapp/list';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS } from 'react-native-reanimated';
import { GestureDetector,
  Gesture,
  GestureHandlerRootView } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';


interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

function SingleImageViewer({
  uri,
  onClose }: {
  uri: string;
  onClose: () => void;
}) {
  const { width: SW, height: SH } = useWindowDimensions();
  const scale      = useSharedValue(1);
  const focalX     = useSharedValue(0);
  const focalY     = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const bgOpacity  = useSharedValue(1);

  // 상태 관리를 위한 shared values
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // ── 핀치 제스처 ──
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, e.scale));
      focalX.value = e.focalX - SW / 2;
      focalY.value = e.focalY - SH / 2;
    })
    .onEnd(() => {
      if (scale.value < 1.15) {
        scale.value      = withSpring(1,  { damping: 20, stiffness: 200 });
        translateX.value = withSpring(0,  { damping: 20 });
        translateY.value = withSpring(0,  { damping: 20 });
      }
    });

  // ── 팬 제스처 (이동 + 스와이프 닫기) ──
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1) {
        // scale=1 일 때: 세로 스와이프 -> 닫기 제스처
        translateY.value = startY.value + e.translationY;
        const drag = Math.abs(e.translationY) / 250;
        bgOpacity.value = Math.max(0.3, 1 - drag * 0.7);
      } else {
        translateX.value = startX.value + e.translationX;
        translateY.value = startY.value + e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1) {
        // 일정 거리 이상 드래그 -> 닫기
        if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 500) {
          bgOpacity.value = withTiming(0, { duration: 180 });
          translateY.value = withTiming(
            e.translationY > 0 ? SH : -SH,
            { duration: 220 },
            (finished) => {
              if (finished) runOnJS(onClose)();
            }
          );
        } else {
          translateY.value = withSpring(0, { damping: 20 });
          bgOpacity.value  = withTiming(1, { duration: 150 });
        }
      }
    });

  // ── 더블탭 줌 ──
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        scale.value      = withSpring(1,  { damping: 20 });
        translateX.value = withSpring(0,  { damping: 20 });
        translateY.value = withSpring(0,  { damping: 20 });
      } else {
        scale.value      = withSpring(2.5, { damping: 20 });
        translateX.value = withSpring((SW / 2 - e.x) * 0.8, { damping: 20 });
        translateY.value = withSpring((SH / 2 - e.y) * 0.8, { damping: 20 });
      }
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const imageStyle = useAnimatedStyle(() => ({
    // [BUG FIX] focalX/focalY 선언·설정은 되어 있었지만 transform에 미적용
    // -> 핀치가 항상 화면 중앙 기준으로 줌되는 문제 수정
    // focal offset 공식: translate += focal * (1 - 1/scale)
    transform: [
      { translateX: translateX.value + focalX.value * (1 - 1 / Math.max(scale.value, 0.001)) },
      { translateY: translateY.value + focalY.value * (1 - 1 / Math.max(scale.value, 0.001)) },
      { scale: scale.value },
    ] as const }));

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${bgOpacity.value * 0.97})` }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={styles._flex}>
          <Animated.View style={imageStyle}>
            <Image
              source={{ uri }}
              style={{ width: SW, height: SH * 0.85 }}
              contentFit="contain" cachePolicy="memory-disk"
              priority="high"
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export function ImageViewerModal({
  visible,
  images,
  initialIndex = 0,
  onClose }: ImageViewerModalProps) {
  const safeInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
  const [currentIdx, setCurrentIdx] = useState(safeInitialIndex);
  const { width: SW } = useWindowDimensions();
  const flatRef = useRef<LegendListRef | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }

    if (visible) {
      setCurrentIdx(safeInitialIndex);
      // 초기 인덱스로 즉시 스크롤 (애니메이션 없이)
      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null;
        flatRef.current?.scrollToIndex({ index: safeInitialIndex, animated: false });
      }, 50);
    }

    return () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, [visible, safeInitialIndex]);

  if (!visible || images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles._flex1}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* 수평 스와이프 이미지 리스트 */}
        <LegendList
          estimatedItemSize={400}
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_item: string, i: number) => String(i)}
          initialScrollIndex={safeInitialIndex}
          getItemLayout={(_items: string[] | null | undefined, index: number) => ({ length: SW, offset: SW * index, index })}
          onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => setCurrentIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}
          renderItem={({ item: uri }: { item: string }) => (
            <SingleImageViewer uri={uri} onClose={onClose} />
          )}
          style={styles._flex2}
        />

        {/* 닫기 버튼 */}
        <SafeAreaView style={st.topBar} pointerEvents="box-none">
          <Pressable style={st.closeBtn} onPress={onClose} hitSlop={20}>
            <X size={24} color={'#F0F0F5'} />
          </Pressable>

          {/* 인덱스 표시 */}
          {images.length > 1 && (
            <View style={st.indexBadge}>
              <Text style={st.indexText}>{currentIdx + 1} / {images.length}</Text>
            </View>
          )}
        </SafeAreaView>

        {/* 다중 이미지 — 하단 도트 인디케이터 */}
        {images.length > 1 && (
          <View style={st.dotsRow} pointerEvents="box-none">
            {images.map((_: string, i: number) => (
              <Pressable key={i} onPress={() => {
                setCurrentIdx(i);
                flatRef.current?.scrollToIndex({ index: i, animated: true });
              }} style={st.dotWrap}>
                <View style={[st.dot, i === currentIdx && st.dotActive]} />
              </Pressable>
            ))}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    zIndex: 10 },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center' },
  indexBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20 },
  indexText: {
    color: '#F0F0F5',
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold },
  dotsRow: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10 },
  dotWrap: { padding: 4 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: {
    width: 20,
    backgroundColor: '#F0F0F5' },
  arrowBtn: {
    position: 'absolute',
    top: '48%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10 },
  arrowLeft:  { left: 12 },
  arrowRight: { right: 12 } });

const styles = StyleSheet.create({
  _flex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  _flex1: {
    flex: 1,
    backgroundColor: '#050507' },
  _flex2: {
    flex: 1 } });

