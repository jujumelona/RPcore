// src/components/ui/Spinner.tsx
// ══════════════════════════════════════════════════════════════
// 앱 공용 로딩 스피너 (ActivityIndicator 완전 대체)
//
// ✅ 기존: 각 화면마다 동일한 Spinner 함수 복붙 (19개 파일)
// ✅ 수정: 이 파일 1개로 통합 -> 번들 크기 감소 + 일관된 UX
//
// 사용법:
//   import { Spinner } from './Spinner';
//   <Spinner />                        // 기본 (24px, #fff)
//   <Spinner size={18} color={'#D4A853'} /> // 커스텀
// ══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation } from 'react-native-reanimated';

interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 24, color = '#D4A853' }: SpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(1, { duration: 700 }), -1, false);
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
    width: (typeof size === "number" ? size : 20),
    height: (typeof size === "number" ? size : 20),
    borderRadius: (typeof size === "number" ? size : 20) / 2,
    borderWidth: size > 20 ? 2.5 : 2,
    borderColor: 'rgba(212,168,83,0.15)',
    borderTopColor: color }));

  return <Animated.View style={style} />;
}
