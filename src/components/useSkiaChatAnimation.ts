// src/components/useSkiaChatAnimation.ts
// [FIX] Skia + Reanimated 분리 — Reanimated-only 파일
// Skia import 없음 -> worklet 직렬화 시 Skia.Color 접근 없음 -> 크래시 방지

import { useSharedValue,
  useDerivedValue,
  useFrameCallback,
  type SharedValue,
  type DerivedValue } from 'react-native-reanimated';
import { skiaRippleX, skiaRippleY, skiaRippleRadius, skiaRippleAlpha } from '../core/worklets/SkiaTransitions';

export interface AuraUniforms {
  u_resolution: number[];
  u_time: number;
  u_e1: number;
  u_e2: number;
  u_e3: number;
  u_e4: number;
  u_e5: number;
}

export interface RippleState {
  cx: DerivedValue<number>;
  cy: DerivedValue<number>;
  r:  DerivedValue<number>;
  a:  DerivedValue<number>;
}

export function useAuraUniforms(
  W: number,
  H: number,
  emotionE1: number,
  emotionE2: number,
  emotionE3: number,
  emotionE4: number,
  emotionE5: number,
  isActive: boolean,
): {
  uniforms: DerivedValue<AuraUniforms>;
  svW: SharedValue<number>;
  svH: SharedValue<number>;
  svE1: SharedValue<number>;
  svE2: SharedValue<number>;
  svE3: SharedValue<number>;
  svE4: SharedValue<number>;
  svE5: SharedValue<number>;
  ripple: RippleState;
} {
  const clock = useSharedValue(0);
  const svE1  = useSharedValue(emotionE1);
  const svE2  = useSharedValue(emotionE2);
  const svE3  = useSharedValue(emotionE3);
  const svE4  = useSharedValue(emotionE4);
  const svE5  = useSharedValue(emotionE5);
  const svW   = useSharedValue(W);
  const svH   = useSharedValue(H);

  // [FIX] useDerivedValue는 Reanimated-only 파일에서만 사용
  // Skia import 없음 -> worklet 클로저에 Skia 네임스페이스 없음 -> 안전
  const uniforms = useDerivedValue(() => ({
    u_resolution: [svW.value, svH.value],
    u_time:       clock.value,
    u_e1:         svE1.value,
    u_e2:         svE2.value,
    u_e3:         svE3.value,
    u_e4:         svE4.value,
    u_e5:         svE5.value }));

  // ripple SharedValues를 DerivedValue로 래핑 — Skia Canvas에서 직접 사용
  const ripple: RippleState = {
    cx: useDerivedValue(() => skiaRippleX.value),
    cy: useDerivedValue(() => skiaRippleY.value),
    r:  useDerivedValue(() => skiaRippleRadius.value),
    a:  useDerivedValue(() => skiaRippleAlpha.value) };

  useFrameCallback((info) => {
    'worklet';
    clock.value += (info.timeSincePreviousFrame ?? 16) * 0.001;
  }, isActive);

  return { uniforms, svW, svH, svE1, svE2, svE3, svE4, svE5, ripple };
}
