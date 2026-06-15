﻿// src/hooks/useSpringPress.ts
// ✅ v2 — 스프링 애니메이션 + 햅틱 통합
//
//  변경 내용:
//    - hapticOnPress 옵션 추가 (기본 'select')
//    - onPressIn 시 즉시 햅틱 발화 (터치 후 0ms — 최적 타이밍)
//    - hapticEnabled false 시 자동 비활성화 (settingsStore 연동)
//
//  연구 근거:
//    • 햅틱은 onPressIn에서 발화해야 자연스럽게 인식됨
//    • onPress(손가락 뗄 때)는 최대 100ms 지연 -> 체감 지연 유발
//    • Apple iOS HIG: 터치 시작 시점에 임팩트 발화 권장

import { useCallback } from 'react';
import { useSharedValue,
  withSpring,
  useAnimatedStyle } from 'react-native-reanimated';
import { Spring } from '../constants/tokens';
import { useHaptic, type HapticEvent } from './useHaptic';

interface UseSpringPressOptions {
  /** 누를 때 스케일 (기본 0.96) */
  scale?: number;
  /** 누를 때 발화할 햅틱 이벤트. false이면 햅틱 없음 (기본 'select') */
  hapticOnPress?: HapticEvent | false;
  /** 뗄 때 발화할 햅틱 이벤트. 기본 없음 */
  hapticOnRelease?: HapticEvent | false;
}

export function useSpringPress({
  scale = 0.96,
  hapticOnPress = 'select',
  hapticOnRelease = false }: UseSpringPressOptions = {}) {
  const s = useSharedValue(1);
  const { trigger } = useHaptic();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }] }));

  const onPressIn = useCallback(() => {
    s.value = withSpring(scale, Spring.press);
    // 연구 기반: 터치 시작 즉시 햅틱 -> 0ms 지연에 가장 가깝게 반응
    if (hapticOnPress !== false) {
      trigger(hapticOnPress);
    }
  }, [s, scale, hapticOnPress, trigger]);

  const onPressOut = useCallback(() => {
    s.value = withSpring(1, Spring.press);
    if (hapticOnRelease !== false) {
      trigger(hapticOnRelease);
    }
  }, [s, hapticOnRelease, trigger]);

  return { animatedStyle, onPressIn, onPressOut };
}
