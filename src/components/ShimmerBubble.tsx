// src/components/ShimmerBubble.tsx
// 스트리밍 대기 중 shimmer 애니메이션 버블

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence,
  cancelAnimation } from 'react-native-reanimated';
import { Space, Radius } from '../constants/tokens';

interface ShimmerBubbleProps {
  width?: number;
  lines?: number;
}

export default function ShimmerBubble({ width = 200, lines = 2 }: ShimmerBubbleProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 700 }),
        withTiming(0.3, { duration: 700 }),
      ),
      -1,
      false,
    );
    // ✅ [FIX] withRepeat(-1) 무한 반복 -> 언마운트 시 네이티브 워크릿 잔존 방지
    // 기존: cleanup 없음 -> 채팅화면 이동 후에도 shimmer 워크릿이 계속 실행됨.
    // 수정: cancelAnimation으로 즉시 중단.
    return () => { cancelAnimation(opacity); };
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={s.wrap}>
      <View style={s.avatarPlaceholder} />
      <View style={s.lines}>
        {Array.from({ length: lines }).map((_, i) => (
          <Animated.View
            key={i}
            style={[
              s.line,
              { width: i === lines - 1 ? width * 0.6 : width },
              animStyle,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:              { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Space['4'], paddingVertical: Space['2'], gap: Space['2'] },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#111118' },
  lines:             { gap: Space['2'] },
  line:              { height: 14, borderRadius: Radius.sm, backgroundColor: '#111118' } });
