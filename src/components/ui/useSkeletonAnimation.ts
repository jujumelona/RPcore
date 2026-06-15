﻿// src/components/ui/useSkeletonAnimation.ts
// [FIX] Skia import와 Reanimated worklet을 분리 — 같은 파일에 두면
//       Babel이 Skia 네임스페이스를 worklet 클로저에 직렬화 ->
//       worklet 런타임에 Skia.Color 접근 실패 -> ReferenceError 크래시.
// 이 파일: Reanimated만 import, Skia 없음 -> worklet 직렬화 안전.

import { useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

export function useSkeletonShimmerClock(): SharedValue<number> {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => { cancelAnimation(clock); };
  }, [clock]);
  return clock;
}

export function useSkeletonPositions(
  clock: SharedValue<number>,
  boxW: number,
  h: number,
): { startX: SharedValue<number>; endX: SharedValue<number>; startY: number; } {
  // [FIX] vec()는 Skia JSI 객체 -> worklet 클로저 캡처 금지.
  // 좌표 숫자만 SV로 관리, vec()는 Skia Canvas 렌더 시점(JS 스레드)에서 호출.
  const startX = useDerivedValue(() =>
    -boxW * 0.5 + (boxW * 2) * clock.value
  );
  const endX = useDerivedValue(() => startX.value + boxW * 0.5);
  return { startX, endX, startY: h / 2 };
}
