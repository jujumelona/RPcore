﻿// src/components/useHeartBurstAnimation.ts
// [FIX] Skia + Reanimated 분리 — Reanimated-only 파일
// Skia import 없음 -> worklet 직렬화 시 Skia.Color 접근 없음 -> 크래시 방지

import { useSharedValue,
  useDerivedValue,
  withTiming,
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

export const HEART_DURATION = 550;

export function useHeartBurstProgress(
  visible: boolean,
  onDone: () => void,
): SharedValue<number> {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: HEART_DURATION,
      easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return () => { cancelAnimation(progress); };
  }, [visible, onDone, progress]);
  return progress;
}

export function useParticleValues(
  progress: SharedValue<number>,
  delay: number,
  baseCx: number,
  baseCy: number,
  angle: number,
  speed: number,
  size: number,
): {
  x: SharedValue<number>;
  y: SharedValue<number>;
  r: SharedValue<number>;
  opacity: SharedValue<number>;
} {
  const t = useDerivedValue(() =>
    Math.max(0, (progress.value - delay) / (1 - delay))
  );
  const x = useDerivedValue(() => {
    const eased = 1 - Math.pow(1 - t.value, 2);
    return baseCx + Math.cos(angle) * speed * eased;
  });
  const y = useDerivedValue(() => {
    const eased = 1 - Math.pow(1 - t.value, 2);
    return baseCy + Math.sin(angle) * speed * eased - 7 * Math.sin(t.value * Math.PI);
  });
  const r = useDerivedValue(() => {
    const grow   = Math.min(1, t.value * 8);
    const shrink = Math.max(0, 1 - t.value * 1.15);
    return size * grow * shrink;
  });
  const opacity = useDerivedValue(() =>
    Math.max(0, 1 - Math.pow(t.value, 0.55))
  );
  return { x, y, r, opacity };
}

export function useCenterGlowValues(progress: SharedValue<number>): {
  r: SharedValue<number>;
  opacity: SharedValue<number>;
} {
  const r = useDerivedValue(() => 3 + 22 * progress.value);
  const opacity = useDerivedValue(() =>
    Math.max(0, (1 - progress.value * 1.5) * 0.45)
  );
  return { r, opacity };
}
