import { ReactNode, useCallback } from 'react';
import { AccessibilityRole,
  Pressable,
  StyleSheet,
  ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
  } from 'react-native-reanimated';

import { Radius, Space, Spring, TouchTarget } from '../../constants/tokens';
import { EmotionColors, type EmotionType } from '../../constants/EmotionColors';
import { useHaptic } from '../../hooks/useHaptic';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  bg?: string;
  bordered?: boolean;
  padding?: number;
  elevation?: number;
  disabled?: boolean;
  /** 감정 색상 오버라이드 — 보더 컬러와 글로우 섀도우를 해당 감정 색으로 변경합니다 */
  emotion?: EmotionType;
  /** emotion이 있을 때 글로우 효과 활성화 여부 (기본 true) */
  glow?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}

export function Card({
  children,
  onPress,
  onLongPress,
  style,
  bg = '#0E0E14',
  bordered = true,
  padding = Space['4'],
  elevation = 0,
  disabled = false,
  emotion,
  glow = true,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button'
  }: CardProps) {
  const { trigger } = useHaptic();
  const scale = useSharedValue(1);
  const pressed = useSharedValue(false);

  // 감정 색상 해석
  const ec = emotion ? EmotionColors[emotion] : null;
  const borderColor = ec
    ? `${ec.primary}55`                  // 33% opacity emotion border
    : 'rgba(34,34,46,0.8)';
  const glowShadow = ec && glow
    ? {
        elevation: elevation + 4
  }
    : elevation > 0
      ? {
          elevation
  }
      : undefined;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: pressed.value ? 0.95 : 1
  }));

  const handlePressIn = useCallback(() => {
    if (!onPress || disabled) return;
    pressed.value = true;
    scale.value = withSpring(0.975, Spring.press);
  }, [onPress, disabled, pressed, scale]);

  const handlePressOut = useCallback(() => {
    if (!onPress || disabled) return;
    pressed.value = false;
    scale.value = withSpring(1, Spring.press);
  }, [onPress, disabled, pressed, scale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    trigger('select');
    onPress?.();
  }, [disabled, onPress, trigger]);

  const cardStyle: ViewStyle = {
    backgroundColor: bg,
    borderRadius: Radius.xl,
    padding,
    borderWidth: bordered ? 1 : 0,
    borderColor,
    ...glowShadow
  };

  if (!onPress && !onLongPress) {
    return (
      <Animated.View
        style={[cardStyle, style]}
        accessibilityRole={accessibilityRole === 'button' ? undefined : accessibilityRole}
      >
        {children}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        hitSlop={4}
        android_ripple={{
          color: ec ? `${ec.primary}22` : 'rgba(255,255,255,0.06)',
          foreground: true
  }}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        style={[
          cardStyle,
          { minHeight: TouchTarget.min },
          disabled && styles.disabled,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4
  }
  });
