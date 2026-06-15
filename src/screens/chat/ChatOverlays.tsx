import { Typography } from '../../constants/tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PressableOpacity } from '../../components/PressableOpacity';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, cancelAnimation } from 'react-native-reanimated';
import { BookOpen } from 'lucide-react-native';
import { CameraRingLoader } from '../../components/CameraRingLoader';
import { Spinner } from '../../components/ui/Spinner';
import { useTranslation } from '../../hooks/useTranslation';


// ── 맥동 링 (KV 로딩 전용) ───────────────────────────────────────
function PulsingRing({ color = 'rgba(212,168,83,0.5)' }: { color?: string }) {
  const scale   = useSharedValue(0.6);
  const opacity = useSharedValue(0.8);
  useEffect(() => {
    scale.value   = withRepeat(withSequence(withTiming(1.4, { duration: 1000 }), withTiming(0.6, { duration: 0 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1000 }), withTiming(0.8, { duration: 0 })), -1, false);
    return () => { cancelAnimation(scale); cancelAnimation(opacity); };
  }, [scale, opacity]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: color,
    position: 'absolute' }));
  return <Animated.View style={style} />;
}

// ── 진행 도트 (챕터 전환 전용) ──────────────────────────────────
function AnimatedDots({ color = 'rgba(255,255,255,0.5)' }: { color?: string }) {
  const d0 = useSharedValue(0.2), d1 = useSharedValue(0.2), d2 = useSharedValue(0.2);
  useEffect(() => {
    d0.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1);
    d1.value = withRepeat(withSequence(withTiming(0.2, { duration: 400 }), withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1);
    d2.value = withRepeat(withSequence(withTiming(0.2, { duration: 400 }), withTiming(0.2, { duration: 400 }), withTiming(1, { duration: 400 })), -1);
    return () => { cancelAnimation(d0); cancelAnimation(d1); cancelAnimation(d2); };
  }, [d0, d1, d2]);
  const s0 = useAnimatedStyle(() => ({ opacity: d0.value }));
  const s1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const dot = { width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginHorizontal: 3 };
  return (
    <View style={styles._flexDirection}>
      <Animated.View style={[dot, s0]} />
      <Animated.View style={[dot, s1]} />
      <Animated.View style={[dot, s2]} />
    </View>
  );
}

// ── KVLoadingOverlay ─────────────────────────────────────────────
interface KVLoadingOverlayProps {
  storyTitle?: string;
  hints: string[];
}

export function KVLoadingOverlay({ storyTitle, hints }: KVLoadingOverlayProps) {
  const t = useTranslation();
  const list = hints.length > 0 ? hints : [t?.kvCleanup ?? ''];
  const [hintIdx, setHintIdx] = useState(0);
  const progressWidth = useSharedValue(0);
  // [BUG FIX] key={hintIdx} 기반 재마운트 → opacity fade 전환으로 교체
  // react-native에서 import된 Animated.Text는 reanimated useAnimatedStyle 지원 안 함
  // reanimated Animated.Text + useSharedValue 기반 fade-in으로 교체
  const hintOpacity = useSharedValue(1);

  useEffect(() => {
    setHintIdx(prev => Math.min(prev, list.length - 1));
  }, [list.length]);

  useEffect(() => {
    if (list.length <= 1) {
      setHintIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setHintIdx(prev => Math.min(prev + 1, list.length - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, [list.length]);

  useEffect(() => {
    // 힌트 전환 시 fade-out → 텍스트 교체(setState) → fade-in
    hintOpacity.value = withTiming(0, { duration: 180 }, () => {
      hintOpacity.value = withTiming(1, { duration: 300 });
    });
    progressWidth.value = withTiming(
      Math.round((hintIdx / Math.max(list.length - 1, 1)) * 100),
      { duration: 500 },
    );
  }, [hintIdx, list.length, progressWidth, hintOpacity]);

  const progressStyle = useAnimatedStyle(() => ({
    width: (progressWidth.value) + '%' as any }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value }));

  return (
    <Animated.View style={kv.overlay} pointerEvents="box-none">
      <View style={kv.bg} pointerEvents="none" />
      <CameraRingLoader visible={true} />
      <View style={kv.content} pointerEvents="none">
        {storyTitle ? (
          <Animated.Text style={kv.title} numberOfLines={1}>
            {storyTitle}
          </Animated.Text>
        ) : null}

        {/* 맥동 링 + 스피너 중첩 */}
        <View style={kv.spinnerWrap}>
          <PulsingRing color="rgba(212,168,83,0.4)" />
          <Spinner size={28} color="rgba(212,168,83,0.85)" />
        </View>

        <Animated.Text style={[kv.hint, hintStyle]}>
          {list[hintIdx]}
        </Animated.Text>
        <View style={kv.track}>
          <Animated.View style={[kv.fill, progressStyle]} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── ModelSwitchingOverlay ─────────────────────────────────────────
export function ModelSwitchingOverlay({ label }: { label: string }) {
  return (
    <Animated.View style={ms.overlay}>
      <View style={ms.pill}>
        <Spinner size={14} color="rgba(212,168,83,0.9)" />
        <Text style={ms.text}>{label}</Text>
      </View>
    </Animated.View>
  );
}

// ── NearChapterEndBanner ──────────────────────────────────────────
export function NearChapterEndBanner({ text }: { text: string }) {
  return (
    <Animated.View style={nb.banner}>
      <Text style={nb.text}>{text}</Text>
    </Animated.View>
  );
}

// ── ChapterTransitionOverlay ──────────────────────────────────────
interface ChapterTransitionOverlayProps {
  title: string;
  manager: import('../../utils/ChapterManager').ChapterTransitionManager;
  chapterLabel: string;
  loadingLabel: string;
}

export function ChapterTransitionOverlay({ title, manager: _manager, chapterLabel, loadingLabel }: ChapterTransitionOverlayProps) {
  const barWidth = useSharedValue(0);

  useEffect(() => {
    barWidth.value = 0;
    barWidth.value = withTiming(92, { duration: 1200 });
  }, [barWidth]);

  const barStyle = useAnimatedStyle(() => ({
    width: (barWidth.value) + '%' as any }));

  return (
    <Animated.View style={ot.overlay}>
      <View style={ot.bg} />
      <Animated.View style={ot.lineTop} />
      <Animated.View style={ot.content}>
        <Text style={ot.label}>{chapterLabel}</Text>
        <Text style={ot.chapterTitle} numberOfLines={2}>{title}</Text>
        <AnimatedDots color="rgba(255,255,255,0.4)" />
      </Animated.View>
      <Animated.View style={ot.lineBottom} />
      <Animated.View style={ot.progressTrack}>
        <Animated.View style={[ot.progressBar, barStyle]} />
      </Animated.View>
      <Animated.View style={ot.loadingRow}>
        <Spinner size={12} color="rgba(255,255,255,0.4)" />
        <Text style={ot.loadingText}>{loadingLabel}</Text>
      </Animated.View>
    </Animated.View>
  );
}

// ── RollingKVBanner ───────────────────────────────────────────────
export function RollingKVBanner({ label }: { label?: string }) {
  const t = useTranslation();
  return (
    <Animated.View
      style={rv.wrap}
    >
      <Spinner size={12} color="rgba(212,168,83,0.55)" />
      <Text style={rv.text}>{label ?? t?.kvCleanup ?? ''}</Text>
    </Animated.View>
  );
}

// ── EndingReachedBanner ───────────────────────────────────────────
export function EndingReachedBanner({ text }: { text: string }) {
  return (
    <Animated.View style={eb.wrap}>
      <Animated.View style={eb.line} />
      <Animated.Text style={eb.text}>{text}</Animated.Text>
    </Animated.View>
  );
}

// ── StoryCompletedOverlay ─────────────────────────────────────────
interface StoryCompletedOverlayProps {
  storyTitle?: string;
  onWebNovel: () => void;
  titleLabel: string;
  message: string;
  actionLabel: string;
}

export function StoryCompletedOverlay({
  storyTitle,
  onWebNovel,
  titleLabel,
  message,
  actionLabel }: StoryCompletedOverlayProps) {
  return (
    <Animated.View style={sc.overlay}>
      <View style={sc.bg} />
      <Animated.View style={sc.lineTop} />
      <Animated.View style={sc.content}>
        <Text style={sc.symbol}>*</Text>
        <Text style={sc.label}>{titleLabel}</Text>
        {storyTitle ? <Text style={sc.title} numberOfLines={2}>{storyTitle}</Text> : null}
        <Text style={sc.message}>{message}</Text>
      </Animated.View>
      <Animated.View style={sc.lineBottom} />
      <Animated.View style={sc.btnWrap}>
        <PressableOpacity style={sc.btn} onPress={onWebNovel} activeOpacity={0.8}>
          <BookOpen size={16} color={'#050507'} />
          <Text style={sc.btnText}>{actionLabel}</Text>
        </PressableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const kv = StyleSheet.create({
  overlay:    { ...StyleSheet.absoluteFillObject, zIndex: 9998, alignItems: 'center', justifyContent: 'center' },
  bg:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,4,8,0.65)' },
  content:    { alignItems: 'center', gap: 18, paddingHorizontal: 40 },
  title:      { fontSize: 18, color: 'rgba(255,255,255,0.75)', fontFamily: Typography.fontFamily.light, letterSpacing: 1, textAlign: 'center' },
  spinnerWrap:{ alignItems: 'center', justifyContent: 'center', width: 56, height: 56 },
  hint:       { fontSize: 13, color: 'rgba(212,168,83,0.7)', fontFamily: Typography.fontFamily.light, letterSpacing: 0.8, textAlign: 'center', minHeight: 20 },
  track:      { width: 160, height: 1.5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden', marginTop: 4 },
  fill:       { height: '100%', backgroundColor: 'rgba(212,168,83,0.45)', borderRadius: 1 } });

const ms = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9997, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 120 },
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(18,18,24,0.92)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, borderWidth: 0.5, borderColor: 'rgba(212,168,83,0.2)' },
  text:    { fontSize: 13, color: 'rgba(212,168,83,0.85)', fontFamily: Typography.fontFamily.light, letterSpacing: 0.5 } });

const nb = StyleSheet.create({
  banner: { position: 'absolute', bottom: 130, left: 24, right: 24, alignItems: 'center', zIndex: 100 },
  text:   { fontSize: 11, color: 'rgba(212,168,83,0.70)', fontStyle: 'italic', letterSpacing: 0.6, textAlign: 'center' } });

const ot = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, zIndex: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,4,8,0.96)' },
  bg:          { ...StyleSheet.absoluteFillObject, backgroundColor: '#050507' },
  lineTop:     { position: 'absolute', top: '38%', left: 40, right: 40, height: 0.5, backgroundColor: 'rgba(255,255,255,0.12)' },
  lineBottom:  { position: 'absolute', top: '62%', left: 40, right: 40, height: 0.5, backgroundColor: 'rgba(255,255,255,0.12)' },
  content:     { alignItems: 'center', paddingHorizontal: 32, gap: 16 },
  label:       { fontSize: 10, color: 'rgba(255,255,255,0.50)', letterSpacing: 5, fontFamily: Typography.fontFamily.bold, textTransform: 'uppercase' },
  chapterTitle:{ fontSize: 24, color: 'rgba(255,255,255,0.88)', fontFamily: Typography.fontFamily.light, letterSpacing: 1, textAlign: 'center', lineHeight: 34 },
  progressTrack: { position: 'absolute', bottom: 90, left: 48, right: 48, height: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 1, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 1 },
  loadingRow:  { position: 'absolute', bottom: 60, flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 11, color: 'rgba(255,255,255,0.50)', letterSpacing: 2 } });

const rv = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 130, left: 0, right: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', zIndex: 101, gap: 6 },
  text: { fontSize: 11, color: 'rgba(212,168,83,0.55)', fontStyle: 'italic', letterSpacing: 0.8 } });

const eb = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 130, left: 0, right: 0, alignItems: 'center', zIndex: 100, gap: 6 },
  line: { width: 48, height: 1, backgroundColor: 'rgba(212,168,83,0.4)' },
  text: { fontSize: 11, color: 'rgba(212,168,83,0.65)', letterSpacing: 1.8, textAlign: 'center', fontStyle: 'italic' } });

const sc = StyleSheet.create({
  overlay:    { ...StyleSheet.absoluteFillObject, zIndex: 9999, alignItems: 'center', justifyContent: 'center' },
  bg:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,4,6,0.96)' },
  lineTop:    { position: 'absolute', top: '30%', left: 40, right: 40, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(212,168,83,0.25)' },
  lineBottom: { position: 'absolute', bottom: '28%', left: 40, right: 40, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(212,168,83,0.25)' },
  content:    { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  symbol:     { fontSize: 20, color: 'rgba(212,168,83,0.5)', marginBottom: 4, letterSpacing: 8 },
  label:      { fontSize: 11, color: 'rgba(212,168,83,0.6)', letterSpacing: 6, fontFamily: Typography.fontFamily.light },
  title:      { fontSize: 22, color: '#F0F0F5', fontFamily: Typography.fontFamily.light, letterSpacing: 1.5, textAlign: 'center', marginTop: 6 },
  message:    { fontSize: 13, color: '#797990', textAlign: 'center', lineHeight: 22, marginTop: 8, letterSpacing: 0.4 },
  btnWrap:    { position: 'absolute', bottom: 60, left: 40, right: 40 },
  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(212,168,83,0.9)', borderRadius: 14, paddingVertical: 16 },
  btnText:    { fontSize: 15, color: '#050507', fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 } });

const styles = StyleSheet.create({
  _flexDirection: {
    flexDirection: 'row',
    alignItems: 'center' } });
