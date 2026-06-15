
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/AIStoryChatScreen.components.tsx
// ✅ 완전 업그레이드: Reanimated 애니메이션 + 프리미엄 스타일

import { ReactNode, memo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Radius, Shadow, Typography } from '../constants/tokens';
const _W_accentBorder = 'rgba(212,168,83,0.30)';
import { PressableOpacity } from '../components/PressableOpacity';
import { ArrowLeft, ArrowRight, Ban, Bell, Bookmark, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, Copy, Eye, Flag, Heart, MoreHorizontal, MoreVertical,
  PenLine, Plus, Search, Settings, Sparkles, Trash2, User, X, XCircle } from 'lucide-react-native';
import Animated, {
  FadeIn, ZoomIn, useSharedValue, useAnimatedStyle,
  withSpring, withTiming } from 'react-native-reanimated';

// ── lucide 동적 아이콘 헬퍼 ─────────────────────────────────────────────
const _ICON_MAP: Record<string, any> = {
  'chevron-up': ChevronUp, 'chevron-down': ChevronDown, 'chevron-back': ChevronLeft,
  'chevron-forward': ChevronRight, 'close': X, 'close-outline': X, 'checkmark': Check,
  'heart': Heart, 'heart-outline': Heart, 'person': User, 'person-circle-outline': User,
  'search': Search, 'settings-outline': Settings, 'notifications-outline': Bell,
  'create': PenLine, 'create-outline': PenLine, 'trash-outline': Trash2,
  'arrow-back': ArrowLeft, 'arrow-forward': ArrowRight, 'ellipsis-vertical': MoreVertical,
  'ellipsis-horizontal': MoreHorizontal, 'sparkles': Sparkles, 'sparkles-outline': Sparkles,
  'add': Plus, 'close-circle': XCircle, 'eye-outline': Eye, 'copy-outline': Copy,
  'bookmark-outline': Bookmark, 'flag-outline': Flag, 'ban-outline': Ban };
function _RenderIcon({ name, size = 20, color = '#fff', style }: {
  name: string; size?: number; color?: string; style?: import('react-native').ViewStyle;
}) {
  const Icon = _ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} style={style ?? undefined} />;
}

// ── 공유 색상 상수 ─────────────────────────────────────────────────────
// [FIX] Property 'Color' doesn't exist 크래시 수정
// module-level에서 Color를 즉시 평가하면 Metro 모듈 로드 순서에 따라
// tokens.ts가 아직 evaluate되지 않은 상태에서 Color가 undefined가 됨.
// -> 인라인 16진수 값으로 교체 (EmotionPADBars.tsx 패턴 동일)
export const C = {
  bg:      'transparent',
  surface: '#0E0E14',    // '#0E0E14'
  border:  '#1A1A24',    // '#1A1A24'
  ph:      '#797990',    // '#797990'
  ph2:     '#757585',    // '#757585'
  action:  '#8A8A9E',    // '#8A8A9E'
  key:     '#60A5FA',    // '#60A5FA'
  choice:  '#4ADE80',    // '#4ADE80'
  char:    '#F59E0B',    // '#F59E0B'
  chapter: '#FF5555',    // '#FF5555'
  accent:  '#D4A853',    // '#D4A853'
};

// ── FieldLabel ────────────────────────────────────────────────────────
export const FieldLabel = memo(({ text, optional, isKo }: {
  text: string; optional?: boolean; isKo?: boolean;
}) => (
  <Text style={CS.lbl}>
    {text}
    {optional && (
      <Text style={CS.optLbl}> {isKo ? '(선택)' : '(선택)'}</Text>
    )}
  </Text>
));

// ── Chip ─────────────────────────────────────────────────────────────
export const Chip = memo(({ label, on, onPress }: {
  label: string; on: boolean; onPress: () => void;
}) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <PressableOpacity
        style={[CS.chip, on && CS.chipOn]}
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 80 }); }}
        onPressOut={() => { scale.value = withSpring(1, { stiffness: 300, damping: 20 }); }}
      >
        {on && (
          <Animated.View entering={ZoomIn.duration(150)}>
            <Check size={11} color={C.accent} style={styles._marginRight} />
          </Animated.View>
        )}
        <Text style={[CS.chipTxt, on && CS.chipTxtOn]}>{label}</Text>
      </PressableOpacity>
    </Animated.View>
  );
});

// ── ParseRow ─────────────────────────────────────────────────────────
export const ParseRow = memo(({ color, text }: { color: string; text: string }) => (
  <Animated.View entering={FadeIn.duration(200)} style={CS.parseRow}>
    <View style={[CS.parseDot, { backgroundColor: color }]} />
    <Text style={[CS.parseTxt, { color: color + 'DD' }]}>{text}</Text>
  </Animated.View>
));

// ── PromptLine ────────────────────────────────────────────────────────
export const PromptLine = memo(({ line }: { line: string }) => {
  if (!line) return <View style={styles._height} />;
  const isSep = /^[━═]+$/.test(line.trim());
  return (
    <Text style={[
      CS.mono,
      isSep && { color: '#181820', fontSize: 9 },
    ]} selectable>{line}</Text>
  );
});

// ── PastedLine ────────────────────────────────────────────────────────
export const PastedLine = memo(({ line }: { line: string }) => {
  if (!line.trim()) return <View style={styles._height1} />;
  return <Text style={[CS.mono, { color: '#8A8A9E', marginBottom: 2 }]}>{line}</Text>;
});

// ── SectionCard ───────────────────────────────────────────────────────
export const SectionCard = memo(({ title, accent, icon, children }: {
  title: string; accent?: string; icon?: string; children: ReactNode;
}) => (
  <Animated.View
    entering={FadeIn.delay(60).duration(280)}
    style={[CS.sectionCard, accent ? { borderColor: accent + '40' } : {}]}
  >
    <View style={[CS.sectionBar, accent ? { backgroundColor: accent } : {}]} />
    <View style={CS.sectionInner}>
      <View style={CS.sectionTitleRow}>
        {icon && (
          <_RenderIcon name={icon} size={13} color={accent ?? '#D4A853'} style={styles._marginRight1} />
        )}
        <Text style={[CS.sectionTitle, accent ? { color: accent } : {}]}>{title}</Text>
      </View>
      {children}
    </View>
  </Animated.View>
));

// ── FocusInput ────────────────────────────────────────────────────────
export function FocusInput({ style, inputStyle, ...props }: import('react-native').TextInputProps & { style?: import('react-native').ViewStyle; inputStyle?: import('react-native').TextStyle }) {
  const [_focused, setFocused] = useState(false);
  const borderColor = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    borderColor: borderColor.value === 1
      ? _W_accentBorder
      : 'rgba(255,255,255,0.08)' }));

  return (
    <Animated.View style={[CS.inp, style, animStyle]}>
      <TextInput
        {...props}
        style={[{ flex: 1, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular, fontSize: 13 }, inputStyle]}
        onFocus={(e: any) => {
          setFocused(true);
          borderColor.value = withTiming(1, { duration: 200 });
          props.onFocus?.(e);
        }}
        onBlur={(e: any) => {
          setFocused(false);
          borderColor.value = withTiming(0, { duration: 200 });
          props.onBlur?.(e);
        }}
      />
    </Animated.View>
  );
}

// ── 공유 스타일 ───────────────────────────────────────────────────────
export const CS = StyleSheet.create({
  lbl: {
    fontSize: 11, fontFamily: Typography.fontFamily.semibold, color: '#8A8A9E',
    marginBottom: 5, letterSpacing: 0.3, marginTop: 12 },
  optLbl: { color: '#797990', fontFamily: Typography.fontFamily.regular },

  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: '#0C0C14',
    borderWidth: 1, borderColor: '#1A1A24',
    marginRight: 6, marginBottom: 6 },
  chipOn: {
    borderColor: 'rgba(212,168,83,0.30)',
    backgroundColor: 'rgba(212,168,83,0.14)' },
  chipTxt:   { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#8A8A9E' },
  chipTxtOn: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },

  parseRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 5, paddingVertical: 1 },
  parseDot:  { width: 7, height: 7, borderRadius: 3.5, marginRight: 9, flexShrink: 0 },
  parseTxt:  { fontSize: 12, fontFamily: Typography.fontFamily.regular, flex: 1, lineHeight: 18 },

  mono: { fontSize: 11, fontFamily: 'monospace', color: '#8A8A9E', lineHeight: 16 },

  sectionCard: {
    backgroundColor: '#0C0C14', borderRadius: Radius.lg, borderWidth: 1,
    borderColor: '#1A1A24', marginBottom: 12, overflow: 'hidden', ...Shadow.sm },
  sectionBar:      { width: 3, position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: '#D4A853' },
  sectionInner:    { padding: 16, paddingLeft: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: {
    fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#D4A853', letterSpacing: 0.2 },

  inp: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md, borderWidth: 1,
    borderColor: '#1A1A24', paddingHorizontal: 12, paddingVertical: 10, minHeight: 42,
    flexDirection: 'row', alignItems: 'center' } });

const styles = StyleSheet.create({
  _marginRight: {
    marginRight: 3 },
  _height: {
    height: 4 },
  _height1: {
    height: 3 },
  _flexDirection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2 },
  _marginRight1: {
    marginRight: 5 } });
