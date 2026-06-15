// src/components/SkiaParticleSystem.tsx
// ═══════════════════════════════════════════════════════════════════
// 감정 기반 Skia 파티클 시스템
//
// 참고: William Candillon "Can it be done in React Native?" Skia 파티클
//
// ── 감정 → 파티클 매핑 ────────────────────────────────────────
//   e1 (Valence/긍정)  → 금빛 스파클 ✨ (위로 떠오름)
//   e2 (Trust/신뢰)    → 파란 별 ⭐ (부드럽게 반짝)
//   e3 (Dominance/지배)→ 초록 오라 (바깥으로 확산)
//   e4 (Arousal/흥분)  → 주황 불꽃 🔥 (빠르게 튀어오름)
//   e5 (Attachment/분노)→ 빨간 파편 (격렬하게 흩날림)
//
//   파티클은 가벼운 JS 시뮬레이션 + Skia 렌더링으로 동작
//   → 강도 낮을 때는 완전히 꺼지고, 활성 시에도 빈도를 낮춰 발열을 줄임
//
// ── AppState 연동 ─────────────────────────────────────────────
//   백그라운드 → isActive=false → Canvas 렌더 중단 (GPU 절약)
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Dimensions } from 'react-native';
import { Canvas, Circle, BlurMask } from '@shopify/react-native-skia';

// ── 파티클 타입 ──────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  life: number;      // 0→1 (0=탄생, 1=소멸)
  maxLife: number;    // 초 단위
  color: string;
}

type EmotionType = 'valence' | 'trust' | 'dominance' | 'arousal' | 'anger';

// ── 감정별 파티클 설정 ───────────────────────────────────────────

const EMOTION_CONFIG: Record<EmotionType, {
  colors: string[];
  speed: number;
  sizeRange: [number, number];
  direction: 'up' | 'radial' | 'scatter';
  blur: number;
}> = {
  valence:   { colors: ['#D4A853', '#FFD700', '#FFA500'], speed: 0.5, sizeRange: [2, 5], direction: 'up', blur: 2 },
  trust:     { colors: ['#60A5FA', '#3B82F6', '#93C5FD'], speed: 0.3, sizeRange: [3, 6], direction: 'up', blur: 3 },
  dominance: { colors: ['#4ADE80', '#22C55E', '#86EFAC'], speed: 0.4, sizeRange: [2, 4], direction: 'radial', blur: 2 },
  arousal:   { colors: ['#F59E0B', '#EF4444', '#FB923C'], speed: 0.8, sizeRange: [2, 5], direction: 'scatter', blur: 1 },
  anger:     { colors: ['#EF4444', '#DC2626', '#FF6B6B'], speed: 1.0, sizeRange: [1, 4], direction: 'scatter', blur: 1 } };

const MAX_PARTICLES = 24;
const SIMULATION_FPS = 15;
const MIN_TOTAL_INTENSITY = 0.12;
const RENDER_EVERY_N_TICKS = 2;

// ── 파티클 생성 ─────────────────────────────────────────────────

function createParticle(
  emotionType: EmotionType,
  width: number,
  height: number,
): Particle {
  const config = EMOTION_CONFIG[emotionType];
  const color = config.colors[Math.floor(Math.random() * config.colors.length)]!;
  const radius = config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0]);

  let x: number, y: number, vx: number, vy: number;

  switch (config.direction) {
    case 'up':
      x = Math.random() * width;
      y = height + radius;
      vx = (Math.random() - 0.5) * 30;
      vy = -(40 + Math.random() * 60) * config.speed;
      break;
    case 'radial': {
      const cx = width / 2;
      const cy = height / 2;
      const angle = Math.random() * Math.PI * 2;
      x = cx;
      y = cy;
      vx = Math.cos(angle) * (30 + Math.random() * 40) * config.speed;
      vy = Math.sin(angle) * (30 + Math.random() * 40) * config.speed;
      break;
    }
    case 'scatter':
      x = Math.random() * width;
      y = Math.random() * height;
      vx = (Math.random() - 0.5) * 80 * config.speed;
      vy = (Math.random() - 0.5) * 80 * config.speed;
      break;
  }

  return {
    x, y, vx, vy, radius,
    opacity: 0.6 + Math.random() * 0.4,
    life: 0,
    maxLife: 2 + Math.random() * 3,
    color };
}

// ── Props ───────────────────────────────────────────────────────

interface SkiaParticleSystemProps {
  /** 감정 강도 0~1 */
  emotionE1?: number;  // Valence
  emotionE2?: number;  // Trust
  emotionE3?: number;  // Dominance
  emotionE4?: number;  // Arousal
  emotionE5?: number;  // Anger/Attachment
  /** 파티클 밀도 배율 (기본 1.0) */
  density?: number;
  /** 컴포넌트 크기 (부모에서 전달 또는 자동 측정) */
  width?: number;
  height?: number;
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

export function SkiaParticleSystem({
  emotionE1 = 0,
  emotionE2 = 0,
  emotionE3 = 0,
  emotionE4 = 0,
  emotionE5 = 0,
  density = 1.0,
  width: propWidth,
  height: propHeight }: SkiaParticleSystemProps) {
  const [isActive, setIsActive] = useState(true);
  const appStateRef = useRef(AppState.currentState);
  const mountedRef = useRef(true);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [dims, setDims] = useState(() => ({
    width: propWidth ?? Dimensions.get('window').width,
    height: propHeight ?? Dimensions.get('window').height }));

  const W = propWidth ?? dims.width;
  const H = propHeight ?? dims.height;
  const totalIntensity = useMemo(
    () => [emotionE1, emotionE2, emotionE3, emotionE4, emotionE5]
      .reduce((sum, value) => sum + Math.max(0, value), 0),
    [emotionE1, emotionE2, emotionE3, emotionE4, emotionE5],
  );
  const shouldSimulate = isActive && density > 0 && totalIntensity >= MIN_TOTAL_INTENSITY;

  // 파티클 풀
  const particlesRef = useRef<Particle[]>([]);
  // 렌더 트리거
  const [renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      particlesRef.current = [];
    };
  }, []);

  // AppState 감지
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === 'background' || next === 'inactive') setIsActive(false);
      else if (next === 'active' && (prev === 'background' || prev === 'inactive'))
        setIsActive(true);
    });
    return () => sub.remove();
  }, []);

  const emotionRef = useRef({ emotionE1, emotionE2, emotionE3, emotionE4, emotionE5 });
  useEffect(() => {
    emotionRef.current = { emotionE1, emotionE2, emotionE3, emotionE4, emotionE5 };
  }, [emotionE1, emotionE2, emotionE3, emotionE4, emotionE5]);

  // 감정 강도 기반 파티클 생성 + 시뮬레이션
  useEffect(() => {
    if (!shouldSimulate) {
      if (particlesRef.current.length > 0) {
        particlesRef.current = [];
        setRenderTick(prev => prev + 1);
      }
      return;
    }

    // 프레임 루프: 파티클 시뮬레이션 (JS 측 — 간단한 물리)
    const dt = 1 / SIMULATION_FPS;
    let renderThrottle = 0;

    const interval = setInterval(() => {
      const emotions = emotionRef.current;
      const emotionMap: [EmotionType, number][] = [
        ['valence', emotions.emotionE1],
        ['trust', emotions.emotionE2],
        ['dominance', emotions.emotionE3],
        ['arousal', emotions.emotionE4],
        ['anger', emotions.emotionE5],
      ];
      const particles = particlesRef.current;

      // 파티클 업데이트
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life += dt / p.maxLife;
        if (p.life >= 1) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // 감속
        p.vx *= 0.98;
        p.vy *= 0.98;
        // 페이드 아웃 (마지막 30%)
        if (p.life > 0.7) {
          p.opacity = Math.max(0, (1 - p.life) / 0.3);
        }
      }

      // 새 파티클 스폰 (프레임당 0~2개)
      for (const [eType, intensity] of emotionMap) {
        if (intensity < 0.1) continue;
        const spawnChance = Math.min(0.35, intensity * density * 0.16);
        if (Math.random() < spawnChance && particles.length < MAX_PARTICLES) {
          particles.push(createParticle(eType, W, H));
        }
      }

      renderThrottle = (renderThrottle + 1) % RENDER_EVERY_N_TICKS;
      if (renderThrottle === 0) {
        setRenderTick(prev => prev + 1);
      }
    }, 1000 / SIMULATION_FPS);

    return () => {
      clearInterval(interval);
      const hadParticles = particlesRef.current.length > 0;
      particlesRef.current = [];
      if (hadParticles && mountedRef.current) {
        setRenderTick(prev => prev + 1);
      }
    };
  }, [shouldSimulate, density, W, H]);

  // 파티클이 없으면 Canvas 렌더링 스킵
  const particles = particlesRef.current;
  if (!shouldSimulate || particles.length === 0) return null;

// eslint-disable-next-line no-void
  void renderTick; // 리렌더 트리거

  return (
    // @ts-expect-error — mode prop 타입 미포함
    <Canvas style={StyleSheet.absoluteFillObject} mode="default" pointerEvents="none">
      {particles.map((p, i) => (
        <Circle
          key={`p${i}`}
          cx={p.x}
          cy={p.y}
          r={p.radius}
          color={p.color}
          opacity={p.opacity}
        >
          <BlurMask blur={EMOTION_CONFIG[
            p.color.startsWith('#D4A') || p.color.startsWith('#FFD') || p.color.startsWith('#FFA') ? 'valence' :
            p.color.startsWith('#60A') || p.color.startsWith('#3B8') || p.color.startsWith('#93C') ? 'trust' :
            p.color.startsWith('#4AD') || p.color.startsWith('#22C') || p.color.startsWith('#86E') ? 'dominance' :
            p.color.startsWith('#F59') || p.color.startsWith('#FB9') ? 'arousal' : 'anger'
          ]?.blur ?? 2} style="normal" />
        </Circle>
      ))}
    </Canvas>
  );
}

// ── 챕터 전환 파티클 버스트 ──────────────────────────────────────
// WebNovel Reader에서 챕터 넘어갈 때 1회성 파티클 폭발

interface ChapterBurstProps {
  /** 트리거 (true로 변경 시 1회 실행) */
  trigger: boolean;
  width?: number;
  height?: number;
  onComplete?: () => void;
}

export function SkiaChapterBurst({
  trigger,
  width: W = Dimensions.get('window').width,
  height: H = Dimensions.get('window').height,
  onComplete }: ChapterBurstProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!trigger) return;

    // ✅ [FIX] 기존 시뮬레이션 인터벌 명시적 정리 후 새로 시작
    if (animRef.current) {
      clearInterval(animRef.current);
      animRef.current = null;
    }

    // 즉시 30~50개 파티클 스폰 (화면 중앙에서 방사)
    const burst: Particle[] = [];
    const count = 30 + Math.floor(Math.random() * 20);
    const colors = ['#D4A853', '#FFD700', '#8B5CF6', '#60A5FA', '#F59E0B'];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;
      const color = colors[i % colors.length]!;
      burst.push({
        x: W / 2,
        y: H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 4,
        opacity: 0.8 + Math.random() * 0.2,
        life: 0,
        maxLife: 1.5 + Math.random() * 1,
        color });
    }

    setParticles(burst);

    const dt = 1 / 30;
    animRef.current = setInterval(() => {
      setParticles(prev => {
        const next = prev
          .map(p => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vx: p.vx * 0.96,
            vy: p.vy * 0.96,
            life: p.life + dt / p.maxLife,
            opacity: p.life > 0.6 ? Math.max(0, (1 - p.life) / 0.4) * p.opacity : p.opacity }))
          .filter(p => p.life < 1);

        if (next.length === 0) {
          if (animRef.current) clearInterval(animRef.current);
          onComplete?.();
        }
        return next;
      });
    }, 1000 / 30);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [trigger, W, H, onComplete]);

  if (particles.length === 0) return null;

  return (
    // @ts-expect-error — mode prop 타입 미포함
    <Canvas style={StyleSheet.absoluteFillObject} mode="default" pointerEvents="none">
      {particles.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.radius} color={p.color} opacity={p.opacity}>
          <BlurMask blur={2} style="normal" />
        </Circle>
      ))}
    </Canvas>
  );
}
