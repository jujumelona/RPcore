import { ReactNode, useEffect } from 'react';
import { StyleProp,
  StyleSheet,
  View,
  ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
  } from 'react-native-reanimated';
import { AmbientOverlay } from '../AmbientOverlay';
import { PressableOpacity } from '../PressableOpacity';
import { Duration, Radius, Space } from '../../constants/tokens';
import type { DeviceTier } from '../../screens/chat/types/ChatTypes';

interface PremiumBackdropProps {
  accent?: string;
  ambient?: boolean;
  ambientTier?: DeviceTier;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PremiumBackdrop({
  accent = '#D4A853',
  ambient = false,
  ambientTier,
  animated = true,
  style
  }: PremiumBackdropProps) {
  const orbOneX = useSharedValue(-18);
  const orbOneY = useSharedValue(0);
  const orbOneOpacity = useSharedValue(0.18);

  const orbTwoX = useSharedValue(14);
  const orbTwoY = useSharedValue(-8);
  const orbTwoOpacity = useSharedValue(0.12);

  useEffect(() => {
    if (!animated) {
      cancelAnimation(orbOneX);
      cancelAnimation(orbOneY);
      cancelAnimation(orbOneOpacity);
      cancelAnimation(orbTwoX);
      cancelAnimation(orbTwoY);
      cancelAnimation(orbTwoOpacity);

      orbOneX.value = -18;
      orbOneY.value = 0;
      orbOneOpacity.value = 0.16;
      orbTwoX.value = 14;
      orbTwoY.value = -8;
      orbTwoOpacity.value = 0.1;
      return;
    }

    const slow = Duration.slower * 5;
    const slower = Duration.slower * 7;

    orbOneX.value = withRepeat(
      withSequence(
        withTiming(24, { duration: slow, easing: Easing.inOut(Easing.sin) }),
        withTiming(-18, { duration: slow, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    orbOneY.value = withRepeat(
      withSequence(
        withTiming(-28, { duration: slower, easing: Easing.inOut(Easing.sin) }),
        withTiming(10, { duration: slower, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    orbOneOpacity.value = withRepeat(
      withSequence(
        withTiming(0.22, { duration: slower, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.12, { duration: slower, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    orbTwoX.value = withRepeat(
      withSequence(
        withTiming(-20, { duration: slower, easing: Easing.inOut(Easing.sin) }),
        withTiming(16, { duration: slower, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    orbTwoY.value = withRepeat(
      withSequence(
        withTiming(18, { duration: slow, easing: Easing.inOut(Easing.sin) }),
        withTiming(-20, { duration: slow, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    orbTwoOpacity.value = withRepeat(
      withSequence(
        withTiming(0.16, { duration: slow, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.08, { duration: slow, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(orbOneX);
      cancelAnimation(orbOneY);
      cancelAnimation(orbOneOpacity);
      cancelAnimation(orbTwoX);
      cancelAnimation(orbTwoY);
      cancelAnimation(orbTwoOpacity);
    };
  }, [animated, orbOneOpacity, orbOneX, orbOneY, orbTwoOpacity, orbTwoX, orbTwoY]);

  const orbOneStyle = useAnimatedStyle(() => ({
    opacity: orbOneOpacity.value,
    transform: [
      { translateX: orbOneX.value },
      { translateY: orbOneY.value },
    ] as any
  }));

  const orbTwoStyle = useAnimatedStyle(() => ({
    opacity: orbTwoOpacity.value,
    transform: [
      { translateX: orbTwoX.value },
      { translateY: orbTwoY.value },
    ] as any
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, style]}>
      <LinearGradient
        colors={['#050507', '#050507', '#050507', '#050507']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[`${accent}2A`, `${accent}08`, 'transparent']}
        start={[0.15, 0]}
        end={[0.9, 0.85]}
        style={styles.topGlow}
      />
      <Animated.View style={[styles.orb, styles.orbOne, { backgroundColor: `${accent}24` }, orbOneStyle]} />
      <Animated.View style={[styles.orb, styles.orbTwo, orbTwoStyle]} />
      {ambient && ambientTier ? <AmbientOverlay deviceTier={ambientTier} /> : null}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.45)']}
        start={[0.5, 0]}
        end={[0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

interface PremiumPanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  colors?: readonly [string, string, string];
  padding?: number;
  glow?: boolean;
  borderColor?: string;
}

export function PremiumPanel({
  children,
  style,
  contentStyle,
  colors = ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)'] as const,
  padding = Space['4'],
  glow = false,
  borderColor = 'rgba(255,255,255,0.08)'
  }: PremiumPanelProps) {
  return (
    <LinearGradient
      colors={colors}
      start={[0, 0]}
      end={[1, 1]}
      style={[
        styles.panel,
        glow && styles.panelGlow,
        { borderColor },
        style,
      ]}
    >
      <View style={[styles.panelInner, { padding }, contentStyle]}>
        {children}
      </View>
    </LinearGradient>
  );
}

interface PremiumActionButtonProps {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
}

export function PremiumActionButton({
  children,
  onPress,
  style,
  active = false,
  accessibilityLabel,
  accessibilityRole = 'button'
  }: PremiumActionButtonProps) {
  return (
    <PressableOpacity
      style={[styles.actionOuter, style]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <LinearGradient
        colors={
          active
            ? ['rgba(212,168,83,0.07)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']
            : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.015)']
        }
        start={[0, 0]}
        end={[1, 1]}
        style={[
          styles.actionInner,
          active && styles.actionInnerActive,
        ]}
      >
        {children}
      </LinearGradient>
    </PressableOpacity>
  );
}

// ── BlurOverlay ─────────────────────────────────────────────────────
// Modal / bottom sheet 뒷배경에 사용. iOS는 실제 blur, Android는 반투명 폴백.
interface BlurOverlayProps {
  style?: StyleProp<ViewStyle>;
  intensity?: number;        // 기본 60 — iOS blur 강도
  tint?: 'dark' | 'light' | 'default';
  children?: ReactNode;
}

export function BlurOverlay({
  style,
  children
  }: BlurOverlayProps) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.blurFallback, style]}>
      {children}
    </View>
  );
}

// ── BlurPanel ───────────────────────────────────────────────────────
// 카드, 바텀시트 패널에 쓰는 glass morphism 컴포넌트
interface BlurPanelProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  borderRadius?: number;
}

export function BlurPanel({
  children,
  style,
  borderRadius = 20
  }: BlurPanelProps) {
  return (
    <View style={[styles.blurPanelFallback, { borderRadius }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  topGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9
  },
  orb: {
    position: 'absolute',
    borderRadius: 999
  },
  orbOne: {
    width: 220,
    height: 220,
    top: -48,
    right: -54
  },
  orbTwo: {
    width: 180,
    height: 180,
    bottom: 84,
    left: -60,
    backgroundColor: 'rgba(112, 152, 255, 0.12)'
  },
  panel: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  panelGlow: {
    elevation: 6
  },
  panelInner: {
    backgroundColor: 'rgba(8,10,14,0.38)'
  },
  actionOuter: {
    borderRadius: Radius.full,
    overflow: 'hidden'
  },
  actionInner: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space['4']
  },
  actionInnerActive: {
    borderColor: 'rgba(212,168,83,0.40)',
    elevation: 4
  },
  blurFallback: {
    backgroundColor: 'rgba(6,8,12,0.85)'
  },
  blurPanelInner: {
    backgroundColor: 'rgba(12,14,18,0.35)'
  },
  blurPanelFallback: {
    backgroundColor: 'rgba(18,20,26,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    elevation: 8
  }
  });
