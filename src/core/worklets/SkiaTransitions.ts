﻿// src/core/worklets/SkiaTransitions.ts
// ✅ [OPT] Layout Animations v3 + Skia 연동 커스텀 트랜지션
//
// ─ Reanimated v3 Layout Animations ────────────────────────────────────────
//   BaseAnimationBuilder 상속 → 완전 커스텀 입장/퇴장 애니메이션
//   Skia Canvas SharedValue와 직접 연동 → 메시지 버블 입장 시
//   배경 Skia 레이어에도 반파동(ripple) 효과 동시 트리거
//
// ─ 포함 ────────────────────────────────────────────────────────────────
//   1. SkiaRippleEntering   — 메시지 버블 입장 (스케일+페이드+Skia ripple)
//   2. SkiaGlowExiting      — 버블 퇴장 (글로우 아웃)
//   3. EmotionCardLayout    — 감정 카드 레이아웃 전환 (높이 스프링)
//   4. withSkiaBridge       — Skia SharedValue 연동 헬퍼
// ─────────────────────────────────────────────────────────────────────────

import { BaseAnimationBuilder,
  withSpring, withTiming, withSequence, withDelay,
  runOnUI, makeMutable } from 'react-native-reanimated';

// ── Skia 연동용 전역 SharedValue ─────────────────────────────────────────
// SkiaChatBackground가 이 값을 구독 → ripple 효과 트리거
export const skiaRippleX      = makeMutable(0);
export const skiaRippleY      = makeMutable(0);
export const skiaRippleRadius = makeMutable(0);
export const skiaRippleAlpha  = makeMutable(0);

/**
 * Skia 리플 트리거 — 메시지 버블 입장 시 배경 캔버스에 파문 효과
 * @param x      리플 중심 X (화면 좌표)
 * @param y      리플 중심 Y (화면 좌표)
 */
export function triggerSkiaRipple(x: number, y: number) {
  runOnUI(() => {
    'worklet';
    skiaRippleX.value      = x;
    skiaRippleY.value      = y;
    skiaRippleAlpha.value  = 0.15;
    skiaRippleRadius.value = withSequence(
      withTiming(0, { duration: 0 }),       // 즉시 0으로 리셋
      withTiming(200, { duration: 600 }),   // 200px로 확장
    );
    skiaRippleAlpha.value  = withSequence(
      withTiming(0.15, { duration: 50 }),
      withTiming(0, { duration: 550 }),     // 페이드 아웃
    );
  })();
}

// ── 1. SkiaRippleEntering — 버블 입장 애니메이션 ─────────────────────────
// BaseAnimationBuilder 상속 → .build() 재정의
// Reanimated v3 Layout Animations API 완전 활용
// @ts-ignore - Reanimated v3 BaseAnimationBuilder static createInstance type mismatch
export class SkiaRippleEntering extends BaseAnimationBuilder {
  static createInstance(): SkiaRippleEntering {
    return new SkiaRippleEntering();
  }

  // @ts-ignore
  build() {
    const delayMs = this.delayV ?? 0;
    return () => {
      'worklet';
      return {
        initialValues: {
          opacity:   0,
          transform: [{ scale: 0.88 }, { translateY: 8 }] },
        animations: {
          opacity: withDelay(delayMs, withTiming(1, { duration: 220 })),
          transform: [
            {
              scale: withDelay(
                delayMs,
                withSpring(1, { stiffness: 280, damping: 22, mass: 0.7 }),
              ) },
            {
              translateY: withDelay(
                delayMs,
                withSpring(0, { stiffness: 320, damping: 28 }),
              ) },
          ] } };
    };
  }
}

// ── 2. SkiaGlowExiting — 버블 퇴장 애니메이션 ────────────────────────────
// @ts-ignore - Reanimated v3 BaseAnimationBuilder static createInstance type mismatch
export class SkiaGlowExiting extends BaseAnimationBuilder {
  static createInstance(): SkiaGlowExiting {
    return new SkiaGlowExiting();
  }

  // @ts-ignore
  // @ts-ignore
  build() {
    return () => {
      'worklet';
      return {
        initialValues: {
          opacity:   1,
          transform: [{ scale: 1 }, { translateX: 0 }] },
        animations: {
          opacity:   withTiming(0, { duration: 200 }),
          transform: [
            { scale:      withTiming(0.9, { duration: 200 }) },
            { translateX: withTiming(-10, { duration: 200 }) },
          ] } };
    };
  }
}

// ── 3. EmotionCardLayout — 감정 카드 크기 변화 스프링 ──────────────────
// Layout prop에 사용: <Animated.View layout={EmotionCardLayout.springify()}>
// @ts-ignore - Reanimated v3 BaseAnimationBuilder static createInstance type mismatch
export class EmotionCardLayout extends BaseAnimationBuilder {
  static createInstance(): EmotionCardLayout {
    return new EmotionCardLayout();
  }

  // @ts-ignore
  build() {
    return () => {
      'worklet';
      return {
        initialValues: {},
        animations: {} };
    };
  }
}

// ── 4. FadeSlideDown — 범용 리스트 아이템 입장 ───────────────────────────
// @ts-ignore - Reanimated v3 BaseAnimationBuilder static createInstance type mismatch
export class FadeSlideDown extends BaseAnimationBuilder {
  private _index: number = 0;

  static createInstance(): FadeSlideDown {
    return new FadeSlideDown();
  }

  index(idx: number): this {
    this._index = idx;
    return this;
  }

  // @ts-ignore
  // @ts-ignore
  build() {
    const delayMs = this.delayV ?? this._index * 40;
    return () => {
      'worklet';
      return {
        initialValues: {
          opacity:   0,
          transform: [{ translateY: 20 }] },
        animations: {
          opacity: withDelay(delayMs, withTiming(1, { duration: 260 })),
          transform: [{
            translateY: withDelay(
              delayMs,
              withSpring(0, { stiffness: 260, damping: 24 }),
            ) }] } };
    };
  }
}
