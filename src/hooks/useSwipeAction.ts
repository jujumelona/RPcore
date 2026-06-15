// src/hooks/useSwipeAction.ts
// ═══════════════════════════════════════════════════════════════════
//  Reddit Infinity 스와이프 제스처 패턴 이식
//  — Reanimated + Gesture Handler 기반 좌우 스와이프 퀵액션
//
//  ✅ 왼쪽 스와이프 → 좋아요 / 길게 → 북마크
//  ✅ 오른쪽 스와이프 → 댓글 / 길게 → 신고
//  ✅ 햅틱 피드백
//  ✅ threshold 기반 트리거
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useRef } from 'react';
import { useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';

// ── Types ──────────────────────────────────────────────────────────

export type SwipeDirection = 'left' | 'right';
export type SwipeLevel = 'short' | 'long'; // short = 1단계, long = 2단계

export interface SwipeActionConfig {
  /** 1단계 트리거 거리 (px) */
  shortThreshold?: number;
  /** 2단계 트리거 거리 (px) */
  longThreshold?: number;
  /** 왼쪽 1단계 (예: 좋아요) */
  onLeftShort?: () => void;
  /** 왼쪽 2단계 (예: 북마크) */
  onLeftLong?: () => void;
  /** 오른쪽 1단계 (예: 댓글) */
  onRightShort?: () => void;
  /** 오른쪽 2단계 (예: 신고) */
  onRightLong?: () => void;
  /** 햅틱 함수 */
  haptic?: () => void;
}

export interface SwipeActionResult {
  translateX: SharedValue<number>;
  animatedRowStyle: ReturnType<typeof useAnimatedStyle>;
  animatedLeftStyle: ReturnType<typeof useAnimatedStyle>;
  animatedRightStyle: ReturnType<typeof useAnimatedStyle>;
  onGestureUpdate: (translationX: number) => void;
  onGestureEnd: () => void;
  resetPosition: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.5 };

export function useSwipeAction(config: SwipeActionConfig = {}): SwipeActionResult {
  const {
    shortThreshold = 80,
    longThreshold = 160,
    onLeftShort,
    onLeftLong,
    onRightShort,
    onRightLong,
    haptic } = config;

  const translateX = useSharedValue(0);
  const hasTriggeredShort = useRef(false);
  const hasTriggeredLong = useRef(false);

  const triggerHaptic = useCallback(() => {
    if (haptic) haptic();
  }, [haptic]);

  // 제스처 진행 중 업데이트
  const onGestureUpdate = useCallback(
    (translationX: number) => {
      translateX.value = translationX;

      const absX = Math.abs(translationX);

      // 2단계 임계값 도달
      if (absX >= longThreshold && !hasTriggeredLong.current) {
        hasTriggeredLong.current = true;
        runOnJS(triggerHaptic)();
      }
      // 1단계 임계값 도달
      else if (absX >= shortThreshold && !hasTriggeredShort.current) {
        hasTriggeredShort.current = true;
        runOnJS(triggerHaptic)();
      }
    },
    [translateX, shortThreshold, longThreshold, triggerHaptic],
  );

  // 제스처 종료 시 액션 트리거
  const onGestureEnd = useCallback(() => {
    const x = translateX.value;
    const absX = Math.abs(x);

    if (x < 0) {
      // 왼쪽 스와이프
      if (absX >= longThreshold && onLeftLong) {
        runOnJS(onLeftLong)();
      } else if (absX >= shortThreshold && onLeftShort) {
        runOnJS(onLeftShort)();
      }
    } else if (x > 0) {
      // 오른쪽 스와이프
      if (absX >= longThreshold && onRightLong) {
        runOnJS(onRightLong)();
      } else if (absX >= shortThreshold && onRightShort) {
        runOnJS(onRightShort)();
      }
    }

    // 원위치 복귀
    translateX.value = withSpring(0, SPRING_CONFIG);
    hasTriggeredShort.current = false;
    hasTriggeredLong.current = false;
  }, [translateX, shortThreshold, longThreshold, onLeftShort, onLeftLong, onRightShort, onRightLong]);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, SPRING_CONFIG);
    hasTriggeredShort.current = false;
    hasTriggeredLong.current = false;
  }, [translateX]);

  // ── Animated Styles ───────────────────────────────────────────

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }] }));

  // 왼쪽 배경 (오른쪽 스와이프 시 노출)
  const animatedLeftStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? Math.min(translateX.value / 80, 1) : 0 }));

  // 오른쪽 배경 (왼쪽 스와이프 시 노출)
  const animatedRightStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? Math.min(Math.abs(translateX.value) / 80, 1) : 0 }));

  return {
    translateX,
    animatedRowStyle,
    animatedLeftStyle,
    animatedRightStyle,
    onGestureUpdate,
    onGestureEnd,
    resetPosition };
}
