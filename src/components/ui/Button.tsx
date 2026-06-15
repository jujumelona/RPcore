import { ReactNode, useCallback } from 'react';
import { useMemo } from 'react';
import { AccessibilityRole,
  Pressable,
  Text,
  View,
  StyleSheet,
  ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring
  } from 'react-native-reanimated';

import { Radius, Spring, Space, Size, TouchTarget, Typography } from '../../constants/tokens';
import { EmotionColors, type EmotionType } from '../../constants/EmotionColors';
import { useHaptic } from '../../hooks/useHaptic';
import { useLanguageStore } from '../../store/languageStore';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'purple';
type BtnSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: BtnSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
  /** 감정 색상 오버라이드 — emotion prop을 넘기면 해당 EmotionColor로 버튼 색상이 변경됩니다 */
  emotion?: EmotionType;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}

const variantMap: Record<Variant, { bg: string; text: string; border: string; ripple: string }> = {
  primary: {
    bg: '#1A1A24',
    text: '#F0F0F5',
    border: 'rgba(139,92,246,0.18)',
    ripple: 'rgba(167,139,250,0.12)'
  },
  secondary: {
    bg: '#141419',
    text: '#C8C8D4',
    border: 'rgba(139,92,246,0.12)',
    ripple: 'rgba(167,139,250,0.08)'
  },
  ghost: {
    bg: 'transparent',
    text: '#A78BFA',
    border: 'transparent',
    ripple: 'rgba(167,139,250,0.08)'
  },
  danger: {
    bg: 'rgba(255,107,107,0.12)',  // ✅ 개선된 색상
    text: '#FF6B6B',                // ✅ 대비율 5.2:1
    border: 'rgba(255,107,107,0.28)',
    ripple: 'rgba(255,107,107,0.18)'
  },
  accent: {
    bg: 'rgba(212,168,83,0.14)',
    text: '#E8C070',                // ✅ 대비율 8.5:1 (개선: 기존 #D4A853 6.8:1)
    border: 'rgba(212,168,83,0.38)',
    ripple: 'rgba(212,168,83,0.22)'
  },
  purple: {
    bg: 'rgba(139,92,246,0.14)',
    text: '#A78BFA',
    border: 'rgba(167,139,250,0.38)',
    ripple: 'rgba(167,139,250,0.22)'
  }
  };

const sizeMap: Record<BtnSize, { height: number; fontSize: number; px: number }> = {
  sm: { height: Size.btnSm, fontSize: Typography.size.sm, px: Space['3'] },
  md: { height: Size.btnMd, fontSize: Typography.size.md, px: Space['4'] },
  lg: { height: Size.btnLg, fontSize: Typography.size.base, px: Space['5'] }
  };

/** emotion prop이 있으면 EmotionColors 기반 스타일로 오버라이드 */
function resolveVariantStyle(
  variant: Variant,
  emotion?: EmotionType,
): { bg: string; text: string; border: string; ripple: string; shadow?: object } {
  if (emotion && EmotionColors[emotion]) {
    const ec = EmotionColors[emotion];
    return {
      bg:     `${ec.primary}22`,          // 13% opacity fill
      text:   ec.primary,
      border: `${ec.primary}55`,          // 33% opacity border
      ripple: `${ec.primary}33`,          // 20% opacity ripple
      shadow: {
        elevation: 5
  }
  };
  }
  const base = variantMap[variant];
  if (variant === 'accent') {
    return {
      ...base,
      shadow: {
        elevation: 6
  }
  };
  }
  if (variant === 'purple') {
    return {
      ...base,
      shadow: {
        elevation: 7
  }
  };
  }
  return base;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  style,
  fullWidth = false,
  emotion,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button'
  }: ButtonProps) {
  const { trigger } = useHaptic();
  const scale = useSharedValue(1);
  const variantStyle = resolveVariantStyle(variant, emotion);
  const sizing = sizeMap[size];

  const dynamicLabelStyle = useMemo(() => ({
    fontSize: sizing.fontSize,
    color: disabled ? '#797990' : variantStyle.text }), [sizing.fontSize, disabled, variantStyle.text]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, Spring.press);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, Spring.press);
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    trigger('confirm');
    onPress();
  }, [disabled, loading, onPress, trigger]);

  const isBusy = Boolean(loading);
  const t = useLanguageStore(s => s.t);

  return (
    <Animated.View style={[animStyle, fullWidth && styles.fullWidth]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        android_ripple={{
          color: variantStyle.ripple,
          foreground: true,
          borderless: false
  }}
        hitSlop={6}
        pressRetentionOffset={10}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: disabled || loading, busy: isBusy }}
        style={[
          styles.base,
          {
            minHeight: Math.max(sizing.height, TouchTarget.comfortable),
            paddingHorizontal: sizing.px,
            backgroundColor: variantStyle.bg,
            borderColor: variantStyle.border
  },
          variantStyle.shadow,
          disabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <Spinner size={18} color={variantStyle.text} />
            <Text style={[styles.loadingLabel, { color: variantStyle.text }]}>Loading</Text>
          </View>
        ) : (
          <View style={styles.inner}>
            {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
            <Text
                            style={[styles.label, dynamicLabelStyle]}
            >
              {label}
            </Text>
            {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface IconButtonProps {
  icon: ReactNode;
  onPress: () => void;
  variant?: 'ghost' | 'surface' | 'accent' | 'danger';
  /** 감정 색상 오버라이드 */
  emotion?: EmotionType;
  size?: number;
  rounded?: boolean;
  haptic?: 'confirm' | 'dismiss' | 'select';
  style?: ViewStyle;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function IconButton({
  icon,
  onPress,
  variant = 'ghost',
  emotion,
  size = Size.btnMd,
  rounded = true,
  haptic = 'select',
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityHint
  }: IconButtonProps) {
  const { trigger } = useHaptic();
  const scale = useSharedValue(1);

  const bgMap = {
    ghost: 'transparent',
    surface: '#0C0C14',
    accent: 'rgba(212,168,83,0.14)',
    danger: 'rgba(255,107,107,0.12)'  // ✅ 개선된 색상
  } as const;

  const rippleMap = {
    ghost: 'rgba(255,255,255,0.06)',
    surface: 'rgba(255,255,255,0.08)',
    accent: 'rgba(212,168,83,0.2)',
    danger: 'rgba(255,107,107,0.2)'  // ✅ 개선된 색상
  } as const;

  // emotion이 있으면 EmotionColors로 오버라이드
  const resolvedBg = emotion ? `${EmotionColors[emotion]?.primary ?? ''}22` : bgMap[variant];
  const resolvedRipple = emotion ? `${EmotionColors[emotion]?.primary ?? ''}33` : rippleMap[variant];

  const dynamicIconBtnStyle = useMemo(() => ({
    width: Math.max(size, TouchTarget.min),
    height: Math.max(size, TouchTarget.min),
    borderRadius: rounded ? size / 2 : Radius.md,
    backgroundColor: resolvedBg,
    opacity: disabled ? 0.45 : 1 }), [size, rounded, resolvedBg, disabled]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePress = useCallback(() => {
    if (disabled) return;
    trigger(haptic);
    onPress();
  }, [disabled, haptic, onPress, trigger]);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withSpring(0.92, Spring.press);
  }, [disabled, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, Spring.press);
  }, [scale]);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        android_ripple={{
          color: resolvedRipple,
          foreground: true,
          borderless: rounded
  }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, busy: false }}
                style={[styles.iconBtnBase, dynamicIconBtnStyle, style]}
      >
        {icon}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    elevation: 3
  },
  fullWidth: {
    width: '100%'
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  label: {
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: Typography.letterSpacing.wide
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  loadingLabel: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium
  },
  iconLeft: {
    marginRight: 4
  },
  iconRight: {
    marginLeft: 4
  },
  disabled: {
    opacity: 0.35
  },
  iconBtnBase: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2
  }
  });
