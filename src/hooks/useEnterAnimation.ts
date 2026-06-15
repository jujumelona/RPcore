﻿// src/hooks/useEnterAnimation.ts
// 화면/요소 진입 애니메이션 훅
// stagger 딜레이가 있는 리스트 진입에 사용

import { useEffect } from 'react';
import { useSharedValue,
  withDelay,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { Spring } from '../constants/tokens';
import { useSafeAnimation } from './useSafe';

export function useEnterAnimation(delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  // ✅ useSafeAnimation — 언마운트 시 worklet 자동 취소 (cancelAnimation 내장)
  useSafeAnimation(opacity, translateY);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    translateY.value = withDelay(delay, withSpring(0, Spring.enter));
  }, [delay, opacity, translateY]);

  return { opacity, translateY };
}
