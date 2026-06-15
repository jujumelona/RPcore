// src/components/AmbientOverlay.tsx
// ══════════════════════════════════════════════════════════════
// 채팅 배경 Ambient 오버레이 — 몰입감 + "살아있는 배경" 연출
//
// ─ 설계 원칙 ────────────────────────────────────────────────────
// · 완전히 비가시적: 렌더 비용 0에 가깝게 유지
// · Reanimated worklet-only: JS 스레드 부하 없음
// · pointerEvents="none": 터치 이벤트 차단 안 함
// · deviceTier 'low'/'mid' -> 완전 비활성
//
// ─ 구현 ──────────────────────────────────────────────────────────
// [1] 부유 미립자 (4개): 매우 천천히 랜덤 경로로 떠다니는 반투명 원
//     골드/은색 계열, opacity 0.03~0.07 (거의 안 보이지만 분위기)
// [2] 코너 vignette: 화면 가장자리 어두운 그라데이션 (포커스 유도)
//     CSS trick: 4개 absolute View + 반투명 그라데이션
//
// ─ 성능 수치 ─────────────────────────────────────────────────────
// · 파티클 1개: 단일 Animated.View + 2개 SharedValue
// · 총 SharedValue: 8개 (파티클 4 × 2)
// · 애니메이션 주기: 6~12초 (60fps 불필요, 매우 느린 이동)
// · JS 콜백 없음 (withRepeat+withSequence = 순수 native 실행)
// ══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation } from 'react-native-reanimated';
import type { DeviceTier } from '../screens/chat/types/ChatTypes';


// ── 파티클 설정 ─────────────────────────────────────────────────
// ✅ [FIX] SW/SH를 모듈 레벨에서 Dimensions.get()으로 계산.
//    useWindowDimensions()는 Hook이라 모듈 레벨·컴포넌트 외부에서 호출 불가.
//    파티클 위치는 초기값이므로 Dimensions.get() 1회 읽기로 충분.
const { width: SW, height: SH } = (Dimensions.get('window') ?? { width: 375, height: 812 });

const PARTICLES: Array<{
  x: number; y: number;
  size: number;
  color: string;
  driftX: number; driftY: number;
  duration: number;
  delay: number;
  opacity: number;
}> = [
  // 우상단 골드 미립자
  { x: SW * 0.75, y: SH * 0.15, size: 5,  color: 'rgba(212,168,83,1)', driftX: 18, driftY: -22, duration: 9000,  delay: 0,    opacity: 0.06 },
  // 좌중간 은색 미립자
  { x: SW * 0.12, y: SH * 0.42, size: 3,  color: 'rgba(180,190,200,1)', driftX: -12, driftY: 15, duration: 11000, delay: 2000, opacity: 0.04 },
  // 중앙하단 골드 미립자
  { x: SW * 0.55, y: SH * 0.78, size: 4,  color: 'rgba(212,168,83,1)', driftX: 20, driftY: 10,  duration: 8000,  delay: 1200, opacity: 0.05 },
  // 좌상단 은색 미립자
  { x: SW * 0.22, y: SH * 0.22, size: 2.5, color: 'rgba(160,170,190,1)', driftX: -8, driftY: -18, duration: 13000, delay: 3500, opacity: 0.04 },
];

// ── 단일 파티클 ─────────────────────────────────────────────────

interface ParticleProps {
  x: number; y: number;
  size: number; color: string;
  driftX: number; driftY: number;
  duration: number; delay: number;
  opacity: number;
}

// ✅ [FIX] useWindowDimensions()가 함수 파라미터 구조분해 내부에 잘못 삽입된 구문 오류 수정.
//    Particle은 SW/SH를 직접 사용하지 않음 — PARTICLES 배열에서 이미 계산된 x/y를 props로 받음.
function Particle({
  x, y, size, color, driftX, driftY, duration, delay, opacity }: ParticleProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);

    tx.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(driftX,  { duration, easing: ease }),
        withTiming(-driftX * 0.4, { duration: duration * 0.8, easing: ease }),
        withTiming(0, { duration: duration * 0.6, easing: ease }),
      ),
      -1, false,
    ));

    ty.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(driftY,  { duration: duration * 0.9, easing: ease }),
        withTiming(driftY * 0.3, { duration: duration * 0.7, easing: ease }),
        withTiming(0, { duration: duration * 0.6, easing: ease }),
      ),
      -1, false,
    ));

    // 천천히 페이드인 후 부유
    op.value = withDelay(delay, withTiming(opacity, { duration: 2000 }));

    // ✅ [FIX] withRepeat(-1) 무한 애니메이션 언마운트 cleanup
    // ChatScreen 이탈 시 4개 파티클 각각의 tx/ty worklet이 네이티브 스레드에
    // 잔존하여 계속 실행됨. cancelAnimation으로 즉시 중단.
    return () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(op);
    };
  }, [delay, driftX, driftY, duration, op, opacity, tx, ty]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
    ] as const,
    opacity: op.value }));

  return (
    <Animated.View
      style={[
        styles.particle,
        { left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

// ── AmbientOverlay (메인) ────────────────────────────────────────

interface AmbientOverlayProps {
  deviceTier?: DeviceTier;
}

export function AmbientOverlay({ deviceTier }: AmbientOverlayProps) {
  // 저사양 기기에서는 완전 비활성 (배터리/성능 보호)
  if (deviceTier === 'low' || deviceTier === 'mid') return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* 파티클 */}
      {PARTICLES.map((p, i) => (
        <Particle key={i} {...p} />
      ))}

      {/* Vignette — 가장자리 어두운 그라데이션 (포커스 유도) */}
      {/* React Native는 CSS radial-gradient 미지원 ?? 4모서리 절반 원으로 근사 */}
      <View style={[styles.vignetteCorner, styles.vigTopLeft]}  />
      <View style={[styles.vignetteCorner, styles.vigTopRight]} />
      <View style={[styles.vignetteCorner, styles.vigBotLeft]}  />
      <View style={[styles.vignetteCorner, styles.vigBotRight]} />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const VIG_SIZE = 200;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    // pointerEvents는 JSX prop으로 전달
  },
  particle: {
    position: 'absolute' },
  vignetteCorner: {
    position: 'absolute',
    width: VIG_SIZE,
    height: VIG_SIZE,
    opacity: 0.35,
    borderRadius: VIG_SIZE / 2,
    backgroundColor: '#050507' },
  vigTopLeft:  { top: -VIG_SIZE / 2, left:  -VIG_SIZE / 2 },
  vigTopRight: { top: -VIG_SIZE / 2, right: -VIG_SIZE / 2 },
  vigBotLeft:  { bottom: -VIG_SIZE / 2, left:  -VIG_SIZE / 2 },
  vigBotRight: { bottom: -VIG_SIZE / 2, right: -VIG_SIZE / 2 } });
