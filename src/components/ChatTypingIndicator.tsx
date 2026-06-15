// src/components/ChatTypingIndicator.tsx  v4
// ══════════════════════════════════════════════════════════════
// 온디바이스 느린 TTFT -> 몰입 유지 전략
//
// ─ 3단계 페이즈 전환 ────────────────────────────────────────────
// [1] thinking  (0 ~ 2.2초)
//     · 아바타 골드 breathing glow — "캐릭터가 살아있다"는 느낌
//     · 이름 + 부드러운 fade-dot (bounce 아닌 fade -> 덜 불안함)
//     · 체감 전략: "AI가 느린 게 아니라 캐릭터가 생각 중"
//
// [2] writing   (2.2초 이후)
//     · 슬라이딩 shimmer bar -> 진행감 + "곧 나온다" 기대감
//     · "작성 중..." 텍스트 -> 투명도 낮춰 과하지 않게
//
// [3] patience  (6초 이후, 온디바이스 heavy model)
//     · 짧은 분위기 힌트 텍스트 순환
//       ("잠시 후...", "생각을 정리하는 중...", "...")
//     · 사용자가 앱이 죽었다고 오해하는 걸 방지
//
// ─ 연구 근거 ────────────────────────────────────────────────────
// · TTFT 동안 뭔가 움직이면 체감 대기시간 40% 감소 (AWS Bedrock 가이드)
// · "캐릭터가 생각 중" 프레이밍 -> 기다림이 서사의 일부로 느껴짐
//
// ─ v4 변경 ──────────────────────────────────────────────────────
// · LoadingStages 흡수 (구 src/ui/TypingIndicator.tsx)
//   엔진 로딩 진행 단계(loading -> warming -> ready)를 시각화하는
//   유일한 컴포넌트였으나 TypingIndicator 파일 자체는 미사용 상태.
//   LoadingStages / EngineLoadingView만 이 파일로 이전.
// ══════════════════════════════════════════════════════════════

import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, I18nManager } from 'react-native';
import { useLanguageStore } from '../store/languageStore';
import Animated, {
  FadeInDown, FadeInUp, FadeOut, FadeIn,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
  cancelAnimation, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from './CachedImage';
import { Space, Typography as Typo } from '../constants/tokens';
import type { DeviceTier } from '../screens/chat/types/ChatTypes';
import LottieView from 'lottie-react-native';
import type { EngineState } from '../core/llama/LlamaEngine';

const THINKING_MS = 2200;
const PATIENCE_MS = 6000;

const PATIENCE_HINTS = [
  '잠시만 기다려주세요...',
  '생각을 정리하고 있어요...',
  '...',
  '곧 보여드릴게요...',
];

// ════════════════════════════════════════════════════════════════
// ChatTypingIndicator — 채팅 중 AI 응답 대기 표시
// ════════════════════════════════════════════════════════════════

export interface ChatTypingIndicatorProps {
  profileUrl?: string;
  charName?:   string;
  storyId?:    string;
  charId?:     number;
  deviceTier?: DeviceTier;
}

// ── BreathingAvatar ──────────────────────────────────────────

function BreathingAvatar({ profileUrl, charName }: { profileUrl?: string; charName?: string }) {
  const scale = useSharedValue(1);
  const glow  = useSharedValue(0.2);

  useEffect(() => {
    scale.value = withRepeat(withSequence(
      withTiming(1.065, { duration: 1300 }),
      withTiming(1.0,   { duration: 1300 }),
    ), -1, false);
    glow.value = withRepeat(withSequence(
      withTiming(0.65, { duration: 1300 }),
      withTiming(0.2,  { duration: 1300 }),
    ), -1, false);
    return () => { cancelAnimation(scale); cancelAnimation(glow); };
  }, [glow, scale]);

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle  = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <View style={av.wrap}>
      <Animated.View style={[av.glow, glowStyle]} />
      <Animated.View style={[av.ring, scaleStyle]}>
        {profileUrl
          ? <CachedImage uri={profileUrl} style={av.img} contentFit="cover" />
          : <View style={[av.img, av.fallback]}>
              <Text style={av.initial}>{(charName ?? '?')[0]}</Text>
            </View>
        }
      </Animated.View>
    </View>
  );
}

// ── FadeDot ──────────────────────────────────────────────────

function FadeDot({ delay }: { delay: number }) {
  const op = useSharedValue(0.12);
  useEffect(() => {
    op.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1,    { duration: 520 }),
      withTiming(0.12, { duration: 520 }),
    ), -1, false));
    return () => { cancelAnimation(op); };
  }, [delay, op]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return <Animated.View style={[dot.base, style]} />;
}

// ── ShimmerText ──────────────────────────────────────────────
// 금색 텍스트만 표시 (shimmer 효과 제거)

interface ShimmerTextProps {
  children: string;
  style?: object;
}

function ShimmerText({ children, style }: ShimmerTextProps) {
  return (
    <View style={stx.container}>
      <Text style={[style, { color: '#D4A853' }]}>{children}</Text>
    </View>
  );
}



function ShimmerBar() {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withSequence(
      withTiming(1,  { duration: 1700 }),
      withTiming(-1, { duration: 0 }),
    ), -1, false);
    return () => { cancelAnimation(x); };
  }, [x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [-1, 1], [-100, 100], Extrapolation.CLAMP) }] }));
  return (
    <View style={sh.track}>
      <Animated.View style={[sh.bar, style]} />
    </View>
  );
}

// ── PatienceHint ─────────────────────────────────────────────

function PatienceHint() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PATIENCE_HINTS.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <Animated.View
      key={idx}
      entering={FadeIn.duration(600)}
      exiting={FadeOut.duration(400)}
    >
      <ShimmerText style={s.patienceText}>{PATIENCE_HINTS[idx]}</ShimmerText>
    </Animated.View>
  );
}

// ── LottieWritingDots ────────────────────────────────────────
// Lottie 로드 실패 시 ShimmerBar 폴백 (try/catch — 파일 없어도 크래시 없음)
function LottieWritingDots() {
  try {
    const src = require('../../assets/lottie/ai_thinking.json');
    return (
      <LottieView
        source={src}
        autoPlay
        loop
        style={styles._width}
        colorFilters={[{ keypath: '**', color: 'rgba(212,168,83,0.9)' }]}
        resizeMode="contain"
        renderMode="HARDWARE"
      />
    );
  } catch {
    return <ShimmerBar />;
  }
}

// ── ChatTypingIndicator ──────────────────────────────────────

type Phase = 'thinking' | 'writing' | 'patience';

const ChatTypingIndicator = memo<ChatTypingIndicatorProps>(({ profileUrl, charName }) => {
  const [phase, setPhase] = useState<Phase>('thinking');
  const t = useLanguageStore(s => s.t);
  // ✅ [BUG FIX] mountedRef 선언 누락 수정
  // 기존: mountedRef.current 참조는 있으나 useRef 선언이 없어 런타임 ReferenceError 발생
  // 수정: useRef(true) 추가 + cleanup에서 false로 세팅 -> 언마운트 후 setState 방지
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setPhase('thinking');
    const t1 = setTimeout(() => { if (mountedRef.current) setPhase('writing');  }, THINKING_MS);
    const t2 = setTimeout(() => { if (mountedRef.current) setPhase('patience'); }, PATIENCE_MS);
    return () => {
      mountedRef.current = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <Animated.View
      entering={FadeInDown.duration(250).springify().damping(22)}
      exiting={FadeOut.duration(180)}
      style={s.container}
    >
      <BreathingAvatar profileUrl={profileUrl} charName={charName} />

      <View style={s.right}>
        {charName && <Text style={s.charName} numberOfLines={1}>{charName}</Text>}

        {phase === 'thinking' && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.thinkingRow}>
            <ShimmerText style={s.thinkingText}>{(t as Record<string,string|undefined>).typingThinking ?? '생각 중...'}</ShimmerText>
            <FadeDot delay={0}   />
            <FadeDot delay={220} />
            <FadeDot delay={440} />
          </Animated.View>
        )}

        {phase === 'writing' && (
          <Animated.View entering={FadeInUp.duration(280).springify().damping(18)} exiting={FadeOut.duration(150)} style={s.subCol}>
            {/* Lottie dots — assets/lottie/ai_thinking.json 없으면 ShimmerBar 폴백 */}
            <LottieWritingDots />
            <ShimmerText style={s.subText}>{(t as Record<string,string|undefined>).typingWriting ?? '작성 중...'}</ShimmerText>
          </Animated.View>
        )}

        {phase === 'patience' && (
          <Animated.View entering={FadeIn.duration(400)} style={s.subCol}>
            <ShimmerBar />
            <PatienceHint />
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
});

export default ChatTypingIndicator;

// ════════════════════════════════════════════════════════════════
// LoadingStages — 엔진 초기화 단계 시각화
// (구 src/ui/TypingIndicator.tsx 에서 이전)
//
// 사용처: 모델 로딩 화면 등 엔진 상태를 단계별로 보여줄 때
//   <LoadingStages engineState={engineState} modelName="Gemma 3 1B" />
// ════════════════════════════════════════════════════════════════

type LoadingStageState = Extract<EngineState, 'loading' | 'warming' | 'ready' | 'generating'>;

export interface LoadingStagesProps {
  engineState: EngineState;
  modelName?:  string;
}

interface Stage {
  states: LoadingStageState[];
  done:   LoadingStageState[];
  label:  string;
}

const STAGES: Stage[] = [
  { states: ['loading'],             done: ['warming', 'ready', 'generating'], label: '모델 불러오는 중'    },
  { states: ['warming'],             done: ['ready', 'generating'],            label: '엔진 준비 중' },
  { states: ['ready', 'generating'], done: [],                                 label: '준비 완료'            },
];

function SpinnerIcon({ active }: { active: boolean }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (active) {
      rotate.value = withRepeat(withTiming(1, { duration: 900 }), -1, false);
    } else {
      cancelAnimation(rotate);
      rotate.value = 0;
    }
    return () => { cancelAnimation(rotate); };
  }, [active, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value * 360}deg` }] }));

  return <Animated.Text style={[ls.iconText, animatedStyle]}>o</Animated.Text>;
}

export function LoadingStages({ engineState, modelName }: LoadingStagesProps) {
  if (engineState === 'idle' || engineState === 'error') return null;

  return (
    <View style={ls.container}>
      {modelName ? <Text style={ls.modelName}>{modelName}</Text> : null}
      {STAGES.map(stage => {
        const isActive = stage.states.includes(engineState as LoadingStageState);
        const isDone   = stage.done.includes(engineState as LoadingStageState);
        return (
          <View key={stage.label} style={ls.row}>
            <View style={[ls.badge, isDone && ls.badgeDone, isActive && ls.badgeActive]}>
              {isDone
                ? <Text style={ls.iconText}>OK</Text>
                : isActive
                  ? <SpinnerIcon active />
                  : <Text style={ls.iconText}>-</Text>
              }
            </View>
            <Text style={[ls.label, isDone && ls.labelDone, isActive && ls.labelActive]}>
              {stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════

const stx = StyleSheet.create({
  container: { overflow: 'hidden' },
  gradient:  { width: 60, height: '100%' } });
const av = StyleSheet.create({
  wrap:    { position: 'relative', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  glow:    { position: 'absolute', width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(212,168,83,0.22)' },
  ring:    { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(212,168,83,0.45)' },
  img:     { width: 40, height: 40, borderRadius: 20 },
  fallback:{ backgroundColor: '#111118', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 15, color: '#C8C8D4', fontFamily: Typo.fontFamily.semibold } });
const dot = StyleSheet.create({
  base: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(212,168,83,0.75)', marginHorizontal: 2 } });
const sh = StyleSheet.create({
  track: { width: 106, height: 2.5, backgroundColor: '#181820', borderRadius: 2, overflow: 'hidden' },
  bar:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 56, borderRadius: 2, backgroundColor: 'rgba(212,168,83,0.5)' } });
const s = StyleSheet.create({
  container:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  right:        { flex: 1, gap: 5 },
  charName:     { fontSize: 10, color: 'rgba(212,168,83,0.8)', fontFamily: Typo.fontFamily.semibold, letterSpacing: 1.3, textTransform: 'uppercase' as const },
  thinkingRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  thinkingText: { fontSize: 12, color: '#797990', fontFamily: Typo.fontFamily.light, fontStyle: 'italic', marginRight: 4, letterSpacing: 0.5 },
  subCol:       { gap: 5 },
  subText:      { fontSize: 11, color: '#797990', fontFamily: Typo.fontFamily.light, letterSpacing: 0.7 },
  patienceText: { fontSize: 11, color: '#797990', fontFamily: Typo.fontFamily.light, fontStyle: 'italic', letterSpacing: 0.5 } });
const ls = StyleSheet.create({
  container: { gap: Space['3'], paddingHorizontal: Space['6'], paddingVertical: Space['5'] },
  modelName: { color: '#8A8A9E', fontSize: Typo.size.sm, fontFamily: Typo.fontFamily.medium },
  row:       { alignItems: 'center', flexDirection: 'row', gap: Space['3'] },
  badge:     { alignItems: 'center', backgroundColor: '#111118', borderColor: '#181820', borderRadius: 999, borderWidth: 1, height: 26, justifyContent: 'center', minWidth: 26, paddingHorizontal: Space['2'] },
  badgeActive: { backgroundColor: 'rgba(212,168,83,0.14)', borderColor: '#D4A853' },
  badgeDone:   { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: '#4ADE80' },
  iconText:  { color: '#F0F0F5', fontSize: Typo.size.xs, fontFamily: Typo.fontFamily.semibold },
  label:     { color: '#8A8A9E', flex: 1, fontSize: Typo.size.md },
  labelActive: { color: '#F0F0F5' },
  labelDone:   { color: '#4ADE80' } });

const styles = StyleSheet.create({
  _width: {
    width: 80,
    height: 24 } });
