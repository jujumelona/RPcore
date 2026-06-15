/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/SwipeToReply.tsx
// ✅ GestureHandler — 수평 스와이프 -> 답장 (Discord/WhatsApp 방식)
//
// ✅ [FIX] 잘못된 HapticEvent 이름 수정
//    기존: triggerHaptic('impactMedium') -> 'medium' 수정
//
// ✅ [OPT] worklet 완전 UI 스레드 이전
//    핵심 문제: triggered = useRef(false) — JS 힙 객체를
//               UI 스레드 제스처 콜백에서 읽고 쓰면 JS 브릿지를 매 프레임 건넘
//    수정:      triggered = useSharedValue(false) — UI 스레드 메모리에 직접 존재
//               -> onStart/onUpdate/onEnd 전체가 JS 브릿지 0회 (runOnJS 제외)
//
//    runOnJS 는 아래 2곳에서만 사용 (JS API 필수):
//      ① triggerHaptic — Vibration.vibrate() 는 JS API
//      ② onReply        — React state setter 는 JS 스레드 전용

import { ReactNode, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
  Extrapolation } from 'react-native-reanimated';
import { CornerDownLeft } from 'lucide-react-native';
import { useLanguageStore } from '../store/languageStore';
import { triggerHaptic } from '../utils/haptics';

const _W_accent = '#D4A853';

const REPLY_THRESHOLD = 68;
const MAX_TRANSLATE   = 85;
const ICON_SIZE       = 20;

// ── spring/timing 설정 모듈 레벨 상수 ─────────────────────────
// Reanimated이 매 onEnd마다 동일 객체 리터럴을 새로 할당하지 않도록 추출
const SPRING_BACK   = { damping: 20, stiffness: 300 } as const;
const TIMING_FADE   = { duration: 180 } as const;

interface SwipeToReplyProps {
  isUser: boolean;
  onReply: () => void;
  children: ReactNode;
}

export function SwipeToReply({ isUser, onReply, children }: SwipeToReplyProps) {
  const t = useLanguageStore(s => s.t);
  const translateX  = useSharedValue(0);
  const iconOpacity = useSharedValue(0);
  const iconScale   = useSharedValue(0.6);

  // ✅ [OPT] useRef(false) -> useSharedValue(false)
  //    useRef 는 JS 힙(Proxy 객체) — UI 스레드 콜백에서 읽으면 브릿지 발생
  //    useSharedValue 는 JSI SharedValue — UI 스레드에서 브릿지 없이 직접 읽기/쓰기 가능
  const triggered = useSharedValue(false);

  // ✅ [FIX] onReply stale closure 방지 — useRef로 최신 참조 유지
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const invokeReply = () => onReplyRef.current();

  // ── 리셋 worklet ─────────────────────────────────────────────
  // onEnd/onFinalize 양쪽에서 공유 -> 코드 중복 제거
  // 'worklet' 지시자로 UI 스레드에서 인라인 실행 (함수 호출 오버헤드 없음)
  const resetAnimations = () => {
    'worklet';
    translateX.value  = withSpring(0, SPRING_BACK);
    iconOpacity.value = withTiming(0, TIMING_FADE);
    iconScale.value   = withTiming(0.6, TIMING_FADE);
  };

  const gesture = Gesture.Pan()
    .activeOffsetX(isUser ? [-8, 999] : [-999, 8])
    .failOffsetY([-12, 12])
    // ✅ onStart: triggered 초기화 — UI 스레드에서 직접 SharedValue 쓰기
    .onStart(() => {
      'worklet';
      triggered.value = false;
    })
    // ✅ onUpdate: translateX/opacity/scale 계산 전부 UI 스레드
    //    triggerHaptic 만 runOnJS (Vibration.vibrate는 JS-only API)
    .onUpdate((e) => {
      'worklet';
      const clamped = isUser
        ? Math.max(-MAX_TRANSLATE, Math.min(0, e.translationX))
        : Math.max(0, Math.min(MAX_TRANSLATE, e.translationX));

      translateX.value = clamped;

      const progress = Math.abs(clamped) / REPLY_THRESHOLD;
      iconOpacity.value = interpolate(progress, [0.5, 1], [0, 1], Extrapolation.CLAMP);
      iconScale.value   = interpolate(progress, [0.5, 1], [0.6, 1], Extrapolation.CLAMP);

      if (!triggered.value && Math.abs(clamped) >= REPLY_THRESHOLD) {
        triggered.value = true;
        // haptic: JS 스레드 전용 API -> runOnJS 필수, 1회만 호출됨
        runOnJS(triggerHaptic)('light');
      }
    })
    // ✅ onEnd: triggered.value 읽기 = UI 스레드 직접 (브릿지 0)
    //    onReply: React state -> runOnJS 필수
    .onEnd(() => {
      'worklet';
      if (triggered.value) runOnJS(invokeReply)();
      triggered.value = false;
      resetAnimations();
    })
    // ✅ onFinalize: 제스처 취소/인터럽트 시 보정 — runOnJS 없이 완전 UI 스레드
    .onFinalize(() => {
      'worklet';
      triggered.value = false;
      resetAnimations();
    });

  // ── Animated styles — worklet 묵시적 마킹 (useAnimatedStyle 콜백은 항상 worklet) ──
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }] }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, REPLY_THRESHOLD],
      [0, 0.1],
      Extrapolation.CLAMP,
    ) }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }] }));

  const hintStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value);
    const direction = isUser ? -1 : 1;

    return {
      opacity: interpolate(progress, [8, REPLY_THRESHOLD], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(progress, [0, REPLY_THRESHOLD], [direction * 8, 0], Extrapolation.CLAMP) },
        { scale: interpolate(progress, [0, REPLY_THRESHOLD], [0.92, 1], Extrapolation.CLAMP) },
      ] as any,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={s.wrapper}>
        <Animated.View style={[StyleSheet.absoluteFill, s.bg, bgStyle]} />
        <Animated.View style={[s.hintPill, isUser ? s.hintPillLeft : s.hintPillRight, hintStyle]}>
          <CornerDownLeft
            size={14}
            color={_W_accent}
            style={isUser ? undefined : { transform: [{ scaleX: -1 }] }}
          />
          <Text style={s.hintText}>{t.reply}</Text>
        </Animated.View>
        <Animated.View style={[s.icon, isUser ? s.iconLeft : s.iconRight, iconStyle]}>
          <CornerDownLeft
            size={ICON_SIZE}
            color={_W_accent}
            style={isUser ? undefined : { transform: [{ scaleX: -1 }] }}
          />
        </Animated.View>
        <Animated.View style={bubbleStyle}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  wrapper:   { position: 'relative' },
  bg:        { backgroundColor: '#D4A853', borderRadius: 4 },
  hintPill: {
    position: 'absolute',
    top: '50%',
    zIndex: 1,
    marginTop: -15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(12,16,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.22)',
  },
  hintPillLeft: {
    left: 10,
  },
  hintPillRight: {
    right: 10,
  },
  hintText: {
    color: '#F4E7BB',
    fontSize: 12,
    fontWeight: '600',
  },
  icon:      { position: 'absolute', top: '50%', marginTop: -ICON_SIZE / 2, zIndex: 1 },
  iconLeft:  { left: 6 },
  iconRight: { right: 6 } });
