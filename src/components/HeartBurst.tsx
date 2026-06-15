﻿// src/components/HeartBurst.tsx
// ✅ Skia 파티클 버스트
// [FIX] Skia + Reanimated 분리: useDerivedValue 등 worklet 훅을
//       useHeartBurstAnimation.ts (Skia import 없음)으로 분리.
//       이 파일은 Skia 렌더링만 담당 -> worklet 직렬화에 Skia 네임스페이스 포함 안 됨.

import { StyleSheet, View, useWindowDimensions, Dimensions } from 'react-native';
import { Canvas, Circle, Group, BlurMask } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { useHeartBurstProgress,
  useParticleValues,
  useCenterGlowValues } from './useHeartBurstAnimation';

const _W = (Dimensions.get('window') ?? { width: 375, height: 812 }).width;
export const DEFAULT_CX = _W / 2;
export const DEFAULT_CY = _W * 0.6;

const PARTICLE_CONFIGS = [
  ...Array.from({ length: 8 }, (_, i) => ({
    angle: (i / 8) * Math.PI * 2,
    speed: 34 + i * 2,
    size: 3,
    color: i % 2 === 0 ? '#D4A853' : '#E8C070',
    delay: 0 })),
  ...Array.from({ length: 4 }, (_, i) => ({
    angle: ((i + 0.5) / 4) * Math.PI * 2,
    speed: 18 + i * 2,
    size: 2,
    color: 'rgba(212,168,83,0.65)',
    delay: 0.05 })),
];

function Particle({
  progress, cx: baseCx, cy: baseCy, angle, speed, size, color, delay }: {
  progress: SharedValue<number>;
  cx: number; cy: number; angle: number; speed: number;
  size: number; color: string; delay: number;
}) {
  const { x, y, r, opacity } = useParticleValues(
    progress, delay, baseCx, baseCy, angle, speed, size,
  );
  return (
    <Group opacity={opacity}>
      <Circle cx={x} cy={y} r={r} color={color} />
    </Group>
  );
}

function CenterGlow({ progress, cx, cy }: {
  progress: SharedValue<number>; cx: number; cy: number;
}) {
  const { r, opacity } = useCenterGlowValues(progress);
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={r} color="rgba(212,168,83,0.35)">
        <BlurMask blur={6} style="normal" />
      </Circle>
    </Group>
  );
}

interface HeartBurstProps {
  visible: boolean;
  onDone: () => void;
  cx?: number;
  cy?: number;
}

export function HeartBurst({ visible, onDone, cx, cy }: HeartBurstProps) {
  const { width: W } = useWindowDimensions();
  const resolvedCx = cx ?? W / 2;
  const resolvedCy = cy ?? W * 0.6;
  const progress = useHeartBurstProgress(visible, onDone);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <CenterGlow progress={progress} cx={resolvedCx} cy={resolvedCy} />
        {PARTICLE_CONFIGS.map((p, i) => (
          <Particle key={i} progress={progress} cx={resolvedCx} cy={resolvedCy} {...p} />
        ))}
      </Canvas>
    </View>
  );
}
