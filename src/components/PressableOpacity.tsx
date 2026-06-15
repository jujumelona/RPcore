import React, { useCallback, useRef } from 'react';
import { Animated,
  Easing,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle } from 'react-native';
import { recordUiAction } from '../utils/uiActionLog';
import { TouchTarget } from '../constants/tokens';

export interface PressableOpacityProps extends Omit<PressableProps, 'style'> {
  activeOpacity?: number;
  scaleDown?: number;
  throttleMs?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: React.ReactNode;
  // Optional label to trace which button was pressed.
  debugLabel?: string;
  // a11y: role for screen readers.
  accessibilityRole?: PressableProps['accessibilityRole'];
  // a11y: label for screen readers.
  accessibilityLabel?: string;
  // a11y: optional hint.
  accessibilityHint?: string;
  // ✅ 최소 터치 영역 보장 (Firebase Test Lab 권장)
  ensureMinTouchTarget?: boolean;
}

const EASE_IN = Easing.bezier(0.25, 0, 0.1, 1);

export const PressableOpacity = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  PressableOpacityProps
>(function PressableOpacity(
  {
    activeOpacity = 1,
    scaleDown = 0.97,
    throttleMs = 140,
    style,
    children,
    onPress,
    onLongPress,
    onPressIn,
    onPressOut,
    disabled,
    debugLabel,
    accessibilityRole = 'button',
    accessibilityLabel,
    accessibilityHint,
    ensureMinTouchTarget = false,  // 기본값 false로 변경 (필요한 곳에만 명시적으로 true)
    ...rest
  }: PressableOpacityProps,
  ref,
) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPressAtRef = useRef(0);
  const longPressTriggeredRef = useRef(false);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (throttleMs > 0) {
        const now = Date.now();
        if (now - lastPressAtRef.current < throttleMs) return;
        lastPressAtRef.current = now;
      }
      const label =
        debugLabel ||
        accessibilityLabel ||
        (typeof rest.testID === 'string' ? rest.testID : '');
      if (label) recordUiAction(label);
      onPress?.(e);
    },
    [disabled, onPress, throttleMs, debugLabel, accessibilityLabel, rest.testID],
  );

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      longPressTriggeredRef.current = false;
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: activeOpacity,
          duration: 60,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: scaleDown,
          duration: 60,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
      ]).start();
      onPressIn?.(e);
    },
    [activeOpacity, onPressIn, scaleDown, opacity, scale],
  );

  const handleLongPress = useCallback(
    (e: GestureResponderEvent) => {
      longPressTriggeredRef.current = true;
      onLongPress?.(e);
    },
    [onLongPress],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      Animated.parallel([
        Animated.spring(opacity, {
          toValue: 1,
          speed: 22,
          bounciness: 0,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          speed: 22,
          bounciness: 6,
          useNativeDriver: true,
        }),
      ]).start();
      onPressOut?.(e);
    },
    [onPressOut, opacity, scale],
  );

  // ✅ 최소 터치 영역 보장 (48dp)
  const minTouchStyle: ViewStyle | undefined = ensureMinTouchTarget
    ? { minWidth: TouchTarget.comfortable, minHeight: TouchTarget.comfortable }
    : undefined;

  return (
    <Pressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={ensureMinTouchTarget ? 8 : undefined}  // ✅ 터치 영역 확장
      style={typeof style === 'function' ? style : (style as StyleProp<ViewStyle>)}
    >
      <Animated.View style={[{ opacity, transform: [{ scale }] }, minTouchStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
});
