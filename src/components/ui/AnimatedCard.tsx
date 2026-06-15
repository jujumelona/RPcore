// src/components/ui/AnimatedCard.tsx
// ══════════════════════════════════════════════════════════════
// 애니메이션 카드 컴포넌트
// 등장 애니메이션 + 프레스 효과 + 그라데이션
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { EmotionColors, EmotionType } from '../../constants/EmotionColors';
import { Radius, Shadow } from '../../constants/tokens';

interface AnimatedCardProps {
  children: React.ReactNode;
  emotion?: EmotionType;
  onPress?: () => void;
  delay?: number;
  direction?: 'up' | 'down';
  gradient?: boolean;
  pressable?: boolean;
  style?: ViewStyle;
}

export function AnimatedCard({
  children,
  emotion = 'neutral',
  onPress,
  delay = 0,
  direction = 'up',
  gradient = false,
  pressable = true,
  style }: AnimatedCardProps) {
  const scale = useSharedValue(1);
  const colors = EmotionColors[emotion];
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }] }));
  
  const gesture = Gesture.Tap()
    .onBegin(() => {
      if (pressable) {
        scale.value = withTiming(0.97, { duration: 100 });
      }
    })
    .onFinalize(() => {
      if (pressable) {
        scale.value = withSpring(1, {
          damping: 10,
          stiffness: 400 });
      }
    })
    .onEnd(() => {
      if (onPress) onPress();
    });
  
  const entering = direction === 'up' 
    ? FadeInUp.delay(delay).springify()
    : FadeInDown.delay(delay).springify();
  
  const cardStyle: ViewStyle = {
    borderRadius: Radius.md,
    padding: 16,
    backgroundColor: '#0C0C14',
    borderWidth: 1,
    borderColor: '#1A1A24',
    ...Shadow.sm };
  
  if (gradient) {
    return (
      <Animated.View entering={entering}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[animatedStyle, style]}
          >
            <LinearGradient
              colors={colors.gradient}
              start={[0, 0]}
              end={[1, 1]}
              style={cardStyle}
            >
              {children}
            </LinearGradient>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    );
  }
  
  return (
    <Animated.View entering={entering}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[cardStyle, animatedStyle, style]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
