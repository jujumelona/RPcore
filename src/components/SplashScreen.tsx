/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/SplashScreen.tsx
// ✅ PREMIUM v4 — 고급스러운 로고 중심 디자인 + 부드러운 애니메이션 + 브랜드 아이덴티티 강화

import { Typography } from '../constants/tokens';
import { useLanguageStore } from '../store/languageStore';
import { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions, Platform, AppState, Image } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import * as NavigationBar from 'expo-navigation-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
  cancelAnimation,
  interpolate
} from 'react-native-reanimated';

const { width: SW, height: SH } = (Dimensions.get('window') ?? { width: 375, height: 812 });

interface SplashScreenProps {
  onFinish: () => void;
}

/* ─── 파티클 점 (개선) ─────────────────────────────────────────── */
function Particle({ delay, x, size, color }: { delay: number; x: number; size: number; color?: string }) {
  const y       = useSharedValue(SH * 0.65);
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(delay, withSequence(
      withTiming(0.85, { duration: 500, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 1000, easing: Easing.in(Easing.cubic) }),
    ));
    y.value = withDelay(delay, withTiming(SH * 0.15, { duration: 1400, easing: Easing.out(Easing.cubic) }));
    scale.value = withDelay(delay, withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(0.6, { duration: 1100, easing: Easing.in(Easing.quad) }),
    ));
  }, [delay, opacity, y, scale]);

  const st = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: y.value },
      { translateX: x },
      { scale: scale.value }
    ] as const
  }));

  return (
    <Animated.View
      style={[
        s.particle,
        {
          left: SW / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color || '#D4A853'
        },
        st,
      ]}
    />
  );
}

/* ─── 메인 (개선) ────────────────────────────────────────────── */
export function SplashScreen({ onFinish }: SplashScreenProps) {
  const logoScale     = useSharedValue(0.3);
  const logoOpacity   = useSharedValue(0);
  const logoRotate    = useSharedValue(-5);
  const glow1Opacity  = useSharedValue(0);
  const glow2Opacity  = useSharedValue(0);
  const glow3Opacity  = useSharedValue(0);
  const textOpacity   = useSharedValue(0);
  const textY         = useSharedValue(24);
  const screenOpacity = useSharedValue(1);
  const ringScale     = useSharedValue(0.6);
  const ringOpacity   = useSharedValue(0);
  const ring2Scale    = useSharedValue(0.5);
  const ring2Opacity  = useSharedValue(0);

  const dot1 = useSharedValue(0.15);
  const dot2 = useSharedValue(0.15);
  const dot3 = useSharedValue(0.15);
  const t = useLanguageStore(s => s.t);

  useEffect(() => {
    StatusBar.setHidden(true);
    if (Platform.OS === 'android' && AppState.currentState === 'active') {
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }

    // 로고 등장 (더 부드럽게)
    logoScale.value   = withSpring(1, { damping: 24, stiffness: 140, mass: 1.2 });
    logoOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    logoRotate.value  = withSpring(0, { damping: 20, stiffness: 100 });

    // 이중 링 확장 (더 우아하게)
    ringScale.value   = withDelay(150, withSpring(1.8, { damping: 14, stiffness: 70 }));
    ringOpacity.value = withDelay(150, withSequence(
      withTiming(0.5, { duration: 400, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) }),
    ));

    ring2Scale.value   = withDelay(250, withSpring(2.2, { damping: 12, stiffness: 60 }));
    ring2Opacity.value = withDelay(250, withSequence(
      withTiming(0.3, { duration: 500, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 1100, easing: Easing.in(Easing.quad) }),
    ));

    // 3단계 글로우 (더 깊이감 있게)
    glow1Opacity.value = withDelay(180, withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));

    glow2Opacity.value = withDelay(320, withRepeat(
      withSequence(
        withTiming(0.45, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.12, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));

    glow3Opacity.value = withDelay(480, withRepeat(
      withSequence(
        withTiming(0.25, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.05, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));

    // 텍스트 등장 (더 부드럽게)
    textOpacity.value = withDelay(650, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    textY.value       = withDelay(650, withSpring(0, { damping: 22, stiffness: 150 }));

    // 도트 로딩 (더 우아하게)
    const DD = 500, DUR = 350, DS = 110;
    const dotPulse = (sv: typeof dot1, extra: number) => {
      sv.value = withDelay(DD + extra, withRepeat(
        withSequence(
          withTiming(1, { duration: DUR, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
          withTiming(0.15, { duration: DUR, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
        ), 3, false,
      ));
    };

    dotPulse(dot1, 0);
    dotPulse(dot2, DS);
    dotPulse(dot3, DS * 2);

    // 페이드아웃 (더 부드럽게)
    const total = DD + DS * 2 + DUR * 6 + 300;
    screenOpacity.value = withDelay(total,
      withTiming(0, { duration: 500, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );

    const failsafe = setTimeout(() => runOnJS(onFinish)(), total + 500 + 300);

    return () => {
      clearTimeout(failsafe);
      StatusBar.setHidden(false);
      if (Platform.OS === 'android' && AppState.currentState === 'active') {
        NavigationBar.setButtonStyleAsync('light').catch(() => {});
      }
      cancelAnimation(logoScale);
      cancelAnimation(logoOpacity);
      cancelAnimation(logoRotate);
      cancelAnimation(glow1Opacity);
      cancelAnimation(glow2Opacity);
      cancelAnimation(glow3Opacity);
      cancelAnimation(ringOpacity);
      cancelAnimation(ringScale);
      cancelAnimation(ring2Opacity);
      cancelAnimation(ring2Scale);
      cancelAnimation(dot1);
      cancelAnimation(dot2);
      cancelAnimation(dot3);
    };
  // eslint-disable-next-line
  }, [onFinish]);

  const screenStyle   = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const logoWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: logoScale.value },
      { rotate: `${logoRotate.value}deg` }
    ] as any,
    opacity: logoOpacity.value
  }));
  const glow1Style = useAnimatedStyle(() => ({ opacity: glow1Opacity.value }));
  const glow2Style = useAnimatedStyle(() => ({ opacity: glow2Opacity.value }));
  const glow3Style = useAnimatedStyle(() => ({ opacity: glow3Opacity.value }));
  const ringStyle  = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }]
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: ring2Opacity.value,
    transform: [{ scale: ring2Scale.value }]
  }));
  const textStyle  = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }]
  }));
  const dot1Style = useAnimatedStyle(() => ({
    opacity: dot1.value,
    transform: [{ scale: interpolate(dot1.value, [0.15, 1], [0.8, 1.1]) }]
  }));
  const dot2Style = useAnimatedStyle(() => ({
    opacity: dot2.value,
    transform: [{ scale: interpolate(dot2.value, [0.15, 1], [0.8, 1.1]) }]
  }));
  const dot3Style = useAnimatedStyle(() => ({
    opacity: dot3.value,
    transform: [{ scale: interpolate(dot3.value, [0.15, 1], [0.8, 1.1]) }]
  }));

  return (
    <Animated.View style={[s.container, screenStyle]}>
      {/* [BUG FIX] StatusBar/SystemBars를 absoluteFill wrapper에 격리
          인라인 자식으로 두면 flex 레이아웃에 참여 → justifyContent:center 기준점이
          아래로 밀려 ring 상단이 화면 밖으로 나가 반원처럼 보임 */}
      <View style={s.sysBarWrap} pointerEvents="none">
        <StatusBar hidden={false} backgroundColor="transparent" barStyle="light-content" translucent />
        {Platform.OS === 'android' && <SystemBars style="light" hidden={false} />}
      </View>

      {/* 배경 그라데이션 */}
      <LinearGradient
        colors={['#0C0A14', '#050507', '#04040A']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* 파티클들 (퍼플 & 골드 믹스) */}
      {[
        { delay: 720, x: -70, size: 5, color: '#8B5CF6' },  // 퍼플
        { delay: 820, x: 50, size: 3, color: '#D4A853' },   // 골드
        { delay: 900, x: -25, size: 6, color: '#A78BFA' },  // 라이트 퍼플
        { delay: 680, x: 90, size: 3, color: '#E8C170' },   // 라이트 골드
        { delay: 960, x: -90, size: 4, color: '#8B5CF6' },  // 퍼플
        { delay: 840, x: 110, size: 2, color: '#D4A853' },  // 골드
        { delay: 780, x: -110, size: 3, color: '#A78BFA' }, // 라이트 퍼플
        { delay: 920, x: 0, size: 4, color: '#D4A853' },    // 골드
      ].map((p, i) => (
        <Particle key={i} {...p} />
      ))}

      {/* 로고 (개선) */}
      <Animated.View style={[s.logoWrapper, logoWrapStyle]}>
        {/* 최외곽 글로우 (초대형) */}
        <Animated.View style={[s.glow3, glow3Style]} />
        {/* 외부 글로우 (대형) */}
        <Animated.View style={[s.glow2, glow2Style]} />
        {/* 내부 글로우 */}
        <Animated.View style={[s.glow1, glow1Style]} />
        {/* 확산 링 2 (외곽) */}
        <Animated.View style={[s.ring2, ring2Style]} />
        {/* 확산 링 1 */}
        <Animated.View style={[s.ring, ringStyle]} />
        {/* 로고 원 */}
        <View style={s.logoCircle}>
          <LinearGradient
            colors={['#FFFFFF', '#F8F8FF', '#FFFFFF']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={s.logoText}>RP</Text>
          {/* 내부 퍼플 테두리 */}
          <View style={s.logoBorder} />
        </View>
      </Animated.View>

      {/* 텍스트 */}
      <Animated.View style={[s.textWrap, textStyle]}>
        <Text style={s.appName}>RPcore</Text>
        <View style={s.taglineRow}>
          <View style={s.taglineDash} />
          <Text style={s.tagline}>{t?.tagline ?? ''}</Text>
          <View style={s.taglineDash} />
        </View>
      </Animated.View>

      {/* 로딩 점 */}
      <Animated.View style={[s.dotsRow, textStyle]}>
        <Animated.View style={[s.dot, dot1Style]} />
        <Animated.View style={[s.dot, dot2Style]} />
        <Animated.View style={[s.dot, dot3Style]} />
      </Animated.View>

      {/* 하단 버전 */}
      {/* Gemma ToU에 UI 표시 의무 없음 — 제거 */}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  particle: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#D4A853'
  },
  container: {
    flex: 1, backgroundColor: '#050507',
    alignItems: 'center', justifyContent: 'center', gap: 28
  },
  // [BUG FIX] StatusBar/SystemBars 격리용 — flex 레이아웃에 영향 안 줌
  sysBarWrap: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none'
  },

  logoWrapper: {
    // ring2 최대 확장(120 * 2.2 = 264)을 수용할 크기 + overflow:visible 명시
    width: 280, height: 280,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible'
  },

  glow3: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: '#8B5CF6'  // 퍼플
  },
  glow2: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#A78BFA'  // 라이트 퍼플
  },
  glow1: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#D4A853'  // 골드
  },
  ring2: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 1.5, borderColor: '#A78BFA'  // 라이트 퍼플
  },
  ring: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: '#D4A853'  // 골드
  },

  logoCircle: {
    width: 110, height: 110, borderRadius: 55,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', elevation: 18,
    backgroundColor: '#FFFFFF'  // 흰색 배경
  },
  logoBorder: {
    position: 'absolute', inset: 0,
    borderRadius: 55, borderWidth: 2.5,
    borderColor: 'rgba(139,92,246,0.4)'  // 퍼플 테두리
  },
  logoText: {
    fontSize: 38, fontFamily: Typography.fontFamily.extrabold,
    color: '#1A1A2E', letterSpacing: 3,  // 다크 네이비 텍스트
    textShadowColor: 'rgba(139,92,246,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4
  },

  textWrap: { alignItems: 'center', gap: 8 },
  appName: {
    fontSize: 30, fontFamily: Typography.fontFamily.extrabold,
    color: '#F0F0F5', letterSpacing: 2.5
  },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taglineDash: { width: 20, height: 1, backgroundColor: '#2A2A3A' },
  tagline: {
    fontSize: 12, color: '#5A5A70',
    letterSpacing: 1.5, fontFamily: Typography.fontFamily.medium
  },

  dotsRow: { flexDirection: 'row', gap: 9 },
  dot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: '#A78BFA'  // 라이트 퍼플로 변경
  },

  version: {
    position: 'absolute', bottom: 52,
    fontSize: 10, color: '#2A2A3A',
    fontFamily: Typography.fontFamily.regular, letterSpacing: 1.5
  }
  });
