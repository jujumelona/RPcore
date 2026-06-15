// src/components/reader/SkiaPageTurn.tsx
// ═══════════════════════════════════════════════════════════════════
// Skia 기반 3D 페이지 넘김 효과
//
// 참고: William Candillon "Can it be done in React Native?" — 3D Page Turn
//
// ── 원리 ────────────────────────────────────────────────────────
//   GestureDetector(수평 드래그) → SharedValue(foldProgress 0→1)
//   → Skia Path로 책 페이지처럼 접히는 곡면 렌더링
//   → Shadow로 페이지 접힘부 그림자 + 하이라이트
//
// ── 통합 방법 ──────────────────────────────────────────────────
//   PagedTextView.tsx 또는 WebNovelReaderScreen.tsx에서
//   <SkiaPageTurnWrapper> 로 페이지 컨텐츠를 감싸면
//   제스처로 페이지 넘김 애니메이션 적용됨
//
// ── 성능 ────────────────────────────────────────────────────────
//   Reanimated SharedValue + worklet → UI 스레드에서 직접 애니메이션
//   JS 스레드 0 부하
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Dimensions, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Shadow, Rect, Group,
  LinearGradient, vec, Skia } from '@shopify/react-native-skia';
import { // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useSharedValue, useAnimatedStyle, useDerivedValue,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ── Props ───────────────────────────────────────────────────────

interface SkiaPageTurnProps {
  /** 현재 페이지 인덱스 */
  currentPage: number;
  /** 총 페이지 수 */
  totalPages: number;
  /** 페이지 변경 콜백 */
  onPageChange: (newPage: number) => void;
  /** 페이지 콘텐츠 렌더 함수 */
  renderPage: (pageIndex: number) => ReactNode;
  /** 넘김 방향 제한 */
  canGoNext?: boolean;
  canGoPrev?: boolean;
}

// ── 상수 ────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 0.3; // 30% 이상 넘기면 페이지 전환
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

// ── 페이지 커브 Path 생성 (워크렛용) ──────────────────────────────

function buildCurlPath(
  width: number,
  height: number,
  progress: number, // 0 = 평평, 1 = 완전히 넘김
): string {
  // 페이지 접힘 위치 (오른쪽에서 왼쪽으로)
  const foldX = width * (1 - progress);
  // 접힌 페이지의 곡률 (진행도에 따라 증가)
  const curlWidth = Math.min(width * 0.15, progress * width * 0.3);

  // Bezier 커브로 종이 곡면 표현
  const path = Skia.Path.Make();

  // 접힌 부분의 곡면  
  path.moveTo(foldX, 0);
  path.cubicTo(
    foldX + curlWidth * 0.3, height * 0.25,
    foldX + curlWidth * 0.6, height * 0.5,
    foldX + curlWidth * 0.3, height * 0.75,
  );
  path.lineTo(foldX, height);
  path.lineTo(width, height);
  path.lineTo(width, 0);
  path.close();

  return path.toSVGString();
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

export function SkiaPageTurn({
  currentPage,
  totalPages,
  onPageChange,
  renderPage,
  canGoNext = true,
  canGoPrev = true }: SkiaPageTurnProps) {
  const [layout, setLayout] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.85 });

  const W = layout.width;
  const H = layout.height;

  // 드래그 진행도: -1(이전 페이지) ~ 0(현재) ~ 1(다음 페이지)
  const dragProgress = useSharedValue(0);
  // 드래그 중 여부
  const isDragging = useSharedValue(false);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ width, height });
  }, []);

  // 페이지 전환 완료 콜백
  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
  }, [currentPage, totalPages, onPageChange]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) onPageChange(currentPage - 1);
  }, [currentPage, onPageChange]);

  // 수평 드래그 제스처
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-20, 20]) // 수평 20px 이상 이동 시 활성화
      .onStart(() => {
        'worklet';
        isDragging.value = true;
      })
      .onUpdate((e) => {
        'worklet';
        // 왼쪽으로 드래그 = 다음 페이지 (양수 progress)
        // 오른쪽으로 드래그 = 이전 페이지 (음수 progress)
        const raw = -e.translationX / W;
        const clamped = Math.max(
          canGoPrev ? -1 : 0,
          Math.min(canGoNext ? 1 : 0, raw),
        );
        dragProgress.value = clamped;
      })
      .onEnd((e) => {
        'worklet';
        isDragging.value = false;
        const progress = dragProgress.value;
        const velocity = -e.velocityX / W;

        // 빠른 스와이프 또는 30% 이상 드래그 → 페이지 전환
        if (progress > SWIPE_THRESHOLD || velocity > 2) {
          dragProgress.value = withSpring(1, SPRING_CONFIG, () => {
            dragProgress.value = 0;
            runOnJS(goNext)();
          });
        } else if (progress < -SWIPE_THRESHOLD || velocity < -2) {
          dragProgress.value = withSpring(-1, SPRING_CONFIG, () => {
            dragProgress.value = 0;
            runOnJS(goPrev)();
          });
        } else {
          // 복귀
          dragProgress.value = withSpring(0, SPRING_CONFIG);
        }
      }),
    [W, canGoNext, canGoPrev, dragProgress, isDragging, goNext, goPrev],
  );

  // Skia 커브 Path (derived)
  const curlPathStr = useDerivedValue(() => {
    const p = Math.abs(dragProgress.value);
    if (p < 0.01) return '';
    return buildCurlPath(W, H, p);
  }, [W, H]);

  // 그림자 위치
  const shadowX = useDerivedValue(() => {
    const p = Math.abs(dragProgress.value);
    return W * (1 - p);
  }, [W]);

  // 그림자 불투명도
  const shadowOpacity = useDerivedValue(() => {
    return Math.min(0.4, Math.abs(dragProgress.value) * 0.6);
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container} onLayout={onLayout}>
        {/* 현재 페이지 콘텐츠 */}
        <View style={styles.pageContent}>
          {renderPage(currentPage)}
        </View>

        {/* Skia 오버레이 — 페이지 넘김 효과 */}
        {/* @ts-expect-error — mode prop */}
        <Canvas style={StyleSheet.absoluteFillObject} mode="default" pointerEvents="none">
          {/* 접힌 페이지 곡면 */}
          {curlPathStr.value !== '' && (
            <Group>
              <Path path={curlPathStr} color="rgba(15,15,20,0.85)">
                <Shadow dx={-4} dy={0} blur={8} color="rgba(0,0,0,0.5)" />
              </Path>

              {/* 접힘선 하이라이트 (빛 반사) */}
              <Rect
                x={shadowX}
                y={0}
                width={3}
                height={H}
              >
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(3, 0)}
                  colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']}
                />
              </Rect>

              {/* 그림자 그라데이션 */}
              <Rect
                x={shadowX.value - 30}
                y={0}
                width={30}
                height={H}
                opacity={shadowOpacity}
              >
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(30, 0)}
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)']}
                />
              </Rect>
            </Group>
          )}
        </Canvas>

        {/* 페이지 카운터 */}
        <View style={styles.pageCounter}>
          <View style={styles.pageCounterInner}>
            {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.pageDot,
                  i === currentPage && styles.pageDotActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden' },
  pageContent: {
    flex: 1 },
  pageCounter: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center' },
  pageCounterInner: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5 },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)' },
  pageDotActive: {
    backgroundColor: '#D4A853',
    width: 18,
    borderRadius: 3 } });
