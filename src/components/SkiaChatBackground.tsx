// src/components/SkiaChatBackground.tsx
// ✅ [OPT v3] AGSL RuntimeEffect 셰이더 + ColorMatrix 필터
//
//   ─ v3 개선점 ─────────────────────────────────────────────────────────────
//   기존: RadialGradient + BlurMask 조합 (3개 정적 Orb)
//         -> Skia 고급 기능 미사용, 단순 방사형 그라데이션
//
//   수정 ①: Skia.RuntimeEffect.Make() — AGSL 셰이더로 완전 교체
//         -> u_time 유니폼으로 애니메이션 구동 (worklet 기반, JS 0회)
//         -> 멀티 오라 + FBM 노이즈 패턴 -> 살아있는 배경 연출
//         -> 감정 변화에 따라 색상 유니폼 즉시 반영
//
//   수정 ②: ColorMatrix 필터 오버레이
//         -> 채도/명도 미세 조정으로 야간 분위기 강조
//         -> CSS filter: saturate() 동일 원리
//
//   수정 ③: useWorkletCallback — 유니폼 업데이트를 UI 스레드에서 직접
//         -> JS 브리지 없이 time/emotion 유니폼 실시간 갱신
//
//   수정 ④: AppState background -> isActive=false -> 프레임 콜백 즉시 중단
//         -> 백그라운드에서 GPU 연산 완전 차단
//
// ✅ [FIX] deprecated useClockValue/useComputedValue 완전 제거
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, AppState, View } from 'react-native';
import { Canvas, Rect, Circle, vec,
  LinearGradient, Skia, RuntimeShader, RadialGradient } from '@shopify/react-native-skia';
// [FIX] Reanimated worklet 로직을 Skia-free 파일로 분리
// Skia + Reanimated가 같은 파일이면 Babel이 Skia를 worklet 클로저에 직렬화 →
// worklet 런타임에서 Skia.Color 접근 → ReferenceError 크래시
import { runOnUI } from 'react-native-reanimated';
import { useAuraUniforms } from './useSkiaChatAnimation';
// ✅ [v2] 감정 기반 파티클 시스템 오버레이
import { SkiaParticleSystem } from './SkiaParticleSystem';


// ── AGSL/SkSL 셰이더 소스 ───────────────────────────────────────────────────
// Skia RuntimeEffect (SkSL): iOS/Android 공통
// u_resolution: 화면 크기, u_time: 초 단위 누적, u_e1~u_e5: 감정 강도
const AURA_SHADER_SRC = `
  uniform float2 u_resolution;
  uniform float  u_time;
  uniform float  u_e1;
  uniform float  u_e2;
  uniform float  u_e3;
  uniform float  u_e4;
  uniform float  u_e5;

  float smoothGauss(float2 uv, float2 center, float sigma) {
    float2 d = uv - center;
    return exp(-dot(d, d) / (2.0 * sigma * sigma));
  }

  float fbm(float2 p, float t) {
    float v = 0.5  * sin(p.x * 6.2 + t * 0.7 + p.y * 2.1);
    v      += 0.25 * sin(p.x * 13.1 - t * 0.4 + p.y * 5.3);
    return v * 0.5 + 0.5;
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / u_resolution;
    float t   = u_time;

    float2 c1 = float2(0.20 + 0.10*sin(t*0.71), 0.15 + 0.08*cos(t*0.53));
    float2 c2 = float2(0.80 + 0.09*cos(t*0.43), 0.45 + 0.11*sin(t*0.31));
    float2 c3 = float2(0.35 + 0.08*sin(t*0.67), 0.78 + 0.07*cos(t*0.82));
    float2 c4 = float2(0.60 + 0.07*cos(t*0.55), 0.30 + 0.09*sin(t*0.44));

    float a1 = smoothGauss(uv, c1, 0.22) * (0.04 + u_e1 * 0.05);
    float a2 = smoothGauss(uv, c2, 0.20) * (0.05 + u_e2 * 0.04);
    float a3 = smoothGauss(uv, c3, 0.18) * (0.04 + u_e3 * 0.05);
    float a4 = smoothGauss(uv, c4, 0.16) * (0.03 + u_e4 * 0.04);

    float noise = fbm(uv * 2.5, t);
    a1 *= 0.8 + 0.2 * noise;
    a2 *= 0.8 + 0.2 * fbm(uv * 3.0, t + 1.3);

    float3 col1 = float3(0.83, 0.66, 0.33) * a1;
    float3 col2 = float3(0.31, 0.20, 0.47) * a2;
    float3 col3 = float3(0.16, 0.39, 0.31) * a3;
    float3 col4 = float3(0.45, 0.18, 0.55) * a4;

    float3 angerTint = float3(0.60, 0.08, 0.08)
      * smoothGauss(uv, float2(0.5, 0.5), 0.45) * u_e5 * 0.06;

    float3 combined = col1 + col2 + col3 + col4 + angerTint;
    float vignette  = 1.0 - smoothstep(0.3, 0.9, length(uv - float2(0.5)));
    float3 base     = float3(0.020, 0.020, 0.027);
    float3 finalCol = base + combined * vignette;

    return half4(finalCol, 1.0);
  }
`;

// ── ColorMatrix: 채도 x1.12 + 냉색 블루 강조 ─────────────────────────────
const COLD_SATURATION_MATRIX = [
  1.10, -0.05, -0.05, 0, 0,
 -0.05,  1.05, -0.05, 0, 0,
 -0.10, -0.05,  1.20, 0, 0.02,
  0,     0,     0,    1, 0,
];

// 셰이더 모듈 레벨 캐시 (1회 컴파일)
let _auraEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
let _auraEffectFailed = false;
function getAuraEffect() {
  if (_auraEffectFailed) return null;
  if (!_auraEffect) {
    const effect = Skia.RuntimeEffect.Make(AURA_SHADER_SRC);
    if (!effect) {
      _auraEffectFailed = true;
      return null;
    }
    _auraEffect = effect;
  }
  return _auraEffect;
}

// ── Props ───────────────────────────────────────────────────────────────────
interface SkiaChatBackgroundProps {
  emotionE1?: number;
  emotionE2?: number;
  emotionE3?: number;
  emotionE4?: number;
  emotionE5?: number;
}

export function SkiaChatBackground({
  emotionE1 = 0, emotionE2 = 0, emotionE3 = 0, emotionE4 = 0, emotionE5 = 0 }: SkiaChatBackgroundProps = {}) {
  const [isActive, setIsActive] = useState(true);
  const appStateRef = useRef(AppState.currentState);
  const [dims, setDims] = useState(() => (Dimensions.get('window') ?? { width: 375, height: 812 }));
  const W = dims.width;
  const H = dims.height;

  const { uniforms, svW, svH, svE1, svE2, svE3, svE4, svE5, ripple } = useAuraUniforms(
    W, H, emotionE1, emotionE2, emotionE3, emotionE4, emotionE5, isActive,
  );

  // 감정 props -> SharedValue 동기화
  useEffect(() => { svE1.value = emotionE1; }, [svE1, emotionE1]);
  useEffect(() => { svE2.value = emotionE2; }, [svE2, emotionE2]);
  useEffect(() => { svE3.value = emotionE3; }, [svE3, emotionE3]);
  useEffect(() => { svE4.value = emotionE4; }, [svE4, emotionE4]);
  useEffect(() => { svE5.value = emotionE5; }, [svE5, emotionE5]);

  useEffect(() => {
    const dimSub = Dimensions.addEventListener('change', ({ window: win }) => {
      setDims(win);
      runOnUI(() => {
        'worklet';
        svW.value = win.width;
        svH.value = win.height;
      })();
    });
    const appSub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === 'background' || next === 'inactive') setIsActive(false);
      else if (next === 'active' && (prev === 'background' || prev === 'inactive'))
        setIsActive(true);
    });
    return () => { dimSub.remove(); appSub.remove(); };
  }, [svW, svH]);

  const auraEffect = useMemo(() => getAuraEffect(), []);

  // ColorMatrix Paint (채도/냉색 필터)
  const cmPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColorFilter(Skia.ColorFilter.MakeMatrix(COLD_SATURATION_MATRIX));
    return p;
  }, []);

  // 셰이더 컴파일 실패 / 백그라운드 -> 단색 폴백
  if (!isActive || !auraEffect) {
    return (
      // @ts-expect-error — mode prop 타입 미포함
      <Canvas style={StyleSheet.absoluteFillObject} mode="default">
        <Rect x={0} y={0} width={W} height={H}>
          <LinearGradient start={vec(0, 0)} end={vec(W, H)}
            colors={['#050507', '#050507']} />
        </Rect>
      </Canvas>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* @ts-expect-error — mode prop 타입 미포함 */}
      <Canvas style={StyleSheet.absoluteFillObject} mode="default">
        {/* ① 어두운 베이스 */}
        <Rect x={0} y={0} width={W} height={H}>
          <LinearGradient start={vec(0, 0)} end={vec(W, H)}
            colors={['#050507', '#050507']} />
        </Rect>

        {/* ② AGSL RuntimeEffect 오라 셰이더 */}
        <Rect x={0} y={0} width={W} height={H}>
          <RuntimeShader source={auraEffect} uniforms={uniforms as any} />
        </Rect>

        {/* ③ ColorMatrix 채도/냉색 오버레이 */}
        <Rect x={0} y={0} width={W} height={H} paint={cmPaint} opacity={0.35} />

        {/* ④ 메시지 버블 입장 ripple — SkiaTransitions에서 트리거 */}
        <Circle cx={ripple.cx} cy={ripple.cy} r={ripple.r} opacity={ripple.a}>
          <RadialGradient
            c={vec(0, 0)}
            r={200}
            colors={['rgba(212,168,83,0.25)', 'rgba(212,168,83,0)']}
          />
        </Circle>
      </Canvas>

      {/* ⑤ 감정 기반 파티클 오버레이 — Skia Canvas 위에 렌더링 */}
      <SkiaParticleSystem
        emotionE1={emotionE1}
        emotionE2={emotionE2}
        emotionE3={emotionE3}
        emotionE4={emotionE4}
        emotionE5={emotionE5}
        width={W}
        height={H}
        density={0.6}
      />
    </View>
  );
}

