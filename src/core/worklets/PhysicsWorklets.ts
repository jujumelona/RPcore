﻿// src/core/worklets/PhysicsWorklets.ts
// ✅ [OPT] react-native-reanimated Custom Worklet Functions
//
// 'worklet' 지시자로 등록된 UI 스레드 전용 물리 함수들
// JS 스레드 개입 0 — 순수 UI 스레드 연산
//
// 포함:
//   1. rk4Spring       — RK4 스프링 (내장 withSpring보다 물리 정밀도 ↑)
//   2. emotionDecayStep — 지수 감쇠 (감정값 자연 복귀)
//   3. useElasticPress — 탄성 버튼 눌림 (useWorkletCallback 등록)
//   4. useAuraPulse    — 오라 맥박 (useFrameCallback + worklet)
//   5. inertialStep    — 관성 스크롤 (속도 감쇠)

import { useSharedValue, useFrameCallback,
  useDerivedValue, withSpring, withTiming, runOnUI, makeMutable } from 'react-native-reanimated';
import { useEffect, useCallback } from 'react';

// ─ 1. RK4 스프링 물리 ─────────────────────────────────────────────────
export interface SpringState { position: number; velocity: number; }

export function rk4Spring(
  state: SpringState, target: number,
  stiffness: number, damping: number, mass: number, dt: number,
): SpringState {
  'worklet';
  const accel = (pos: number, vel: number): number => {
    'worklet';
    return ((-stiffness * (pos - target)) + (-damping * vel)) / mass;
  };
  const k1v = state.velocity,             k1a = accel(state.position, state.velocity);
  const k2v = state.velocity + k1a*(dt/2),k2a = accel(state.position + k1v*(dt/2), k2v);
  const k3v = state.velocity + k2a*(dt/2),k3a = accel(state.position + k2v*(dt/2), k3v);
  const k4v = state.velocity + k3a*dt,    k4a = accel(state.position + k3v*dt, k4v);
  return {
    position: state.position + (dt/6)*(k1v + 2*k2v + 2*k3v + k4v),
    velocity: state.velocity + (dt/6)*(k1a + 2*k2a + 2*k3a + k4a) };
}

// ─ 2. 감정 지수 감쇠 ──────────────────────────────────────────────────
export function emotionDecayStep(
  current: number, baseline: number, rate: number, dt: number,
): number {
  'worklet';
  return baseline + (current - baseline) * Math.exp(-rate * dt);
}

// ─ 3. 탄성 버튼 훅 ────────────────────────────────────────────────────
export function useElasticPress(config?: {
  stiffness?: number; damping?: number; pressedScale?: number;
}) {
  const { stiffness = 400, damping = 15, pressedScale = 0.93 } = config ?? {};
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    'worklet';
    scale.value = withSpring(pressedScale, { stiffness, damping });
  }, [scale, stiffness, damping, pressedScale]);

  const onPressOut = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, { stiffness: stiffness*0.6, damping: damping*0.8 });
  }, [scale, stiffness, damping]);

  return { scale, onPressIn, onPressOut };
}

// ─ 4. 오라 펄스 훅 ────────────────────────────────────────────────────
export function useAuraPulse(options?: {
  baseScale?: number; amplitude?: number; frequency?: number; active?: boolean;
}) {
  const { baseScale=1.0, amplitude=0.04, frequency=1.2, active=true } = options ?? {};
  const clock = useSharedValue(0);

  const pulse = useDerivedValue(() => {
    'worklet';
    return baseScale + amplitude * Math.sin(clock.value * frequency * Math.PI * 2);
  }, [baseScale, amplitude, frequency]);

  useFrameCallback((info) => {
    'worklet';
    clock.value += (info.timeSincePreviousFrame ?? 16) * 0.001;
  }, active);

  useEffect(() => {
    if (!active) {
      runOnUI(() => {
        'worklet';
        clock.value = withTiming(0, { duration: 400 });
      })();
    }
  }, [active, clock]);

  return pulse;
}

// ─ 5. 관성 스크롤 스텝 ────────────────────────────────────────────────
export function inertialStep(
  velocity: number, friction: number, dt: number,
): { newVelocity: number; delta: number } {
  'worklet';
  return {
    newVelocity: velocity * Math.pow(friction, dt),
    delta:       velocity * dt };
}

// 전역 스프링 SharedValue (makeMutable — worklet 직접 접근 가능)
export const globalSpringPos = makeMutable(0);

export function triggerGlobalSpring(target: number, stiffness = 300, damping = 20) {
  runOnUI(() => {
    'worklet';
    globalSpringPos.value = withSpring(target, { stiffness, damping });
  })();
}
