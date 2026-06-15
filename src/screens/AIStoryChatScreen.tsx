
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/AIStoryChatScreen.tsx
// ═══════════════════════════════════════════════════════════════════════
// AI 활용 스토리 제작 도우미
// GPT / Gemini / Claude 등 외부 AI를 활용해 스토리를 완전 자동 생성
// 온디바이스 AI 기능 없음 — 모든 생성은 외부 AI에 위임
//
// 주요 기능:
//  - 챕터 수 제한 없는 자유 입력
//  - 분기형 트리 구조 (선택지 -> 챕터 이동)
//  - 챕터별 캐릭터 목표 자동 생성
//  - 선택지 2개 + 감정 변화 포함
//  - 인트로 메시지 12줄+ 상세 생성
//  - 모든 StoryEditor 필드 자동 완성
// ═══════════════════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, TextInput, BackHandler, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import Animated, {
  FadeInDown,
  Layout } from 'react-native-reanimated';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { ToastService } from '../components/Toast';
import { clipboardSetString, clipboardGetString } from '../utils/ClipboardUtils';
import { useLanguageStore } from '../store/languageStore';
import type { LanguageCode } from '../i18n/languages';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Radius, Shadow, Typography } from '../constants/tokens';
import { ConfirmModal } from '../components/ConfirmModal';

// ───────────────────────────────────────────────────────────────────────
// 타입 · 프롬프트 · 파서 — 외부 파일 사용
// ───────────────────────────────────────────────────────────────────────

import type { FormData, CharInput, UserInput, Step } from './AIStoryChatScreen.types';
import { buildPrompt } from './AIStoryChatScreen.prompt';
import { parseResponse } from './AIStoryChatScreen.parser';
import { getStoryGenreLabel } from '../utils/storyGenres';
import { getStoryStylePresetOptions } from '../utils/storyStylePresets';


// ───────────────────────────────────────────────────────────────────────
// 상수
// ───────────────────────────────────────────────────────────────────────

// Step type is imported from AIStoryChatScreen.types

// ───────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ───────────────────────────────────────────────────────────────────────

// ── 흑백 아이콘 컴포넌트 ───────────────────────────────
function IcoCopy({ c = '#050507', size = 14 }: { c?: string; size?: number }) {
  return (
    <View style={{ width: size + 4, height: size + 2, marginRight: 7 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: size - 1, height: size - 1, borderWidth: 1.5, borderColor: c }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: size - 1, height: size - 1, borderWidth: 1.5, borderColor: c, backgroundColor: 'rgba(8,8,8,1)' }} />
    </View>
  );
}
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _IcoArrowR({ c = '#050507' }: { c?: string }) {
  return <ArrowRight size={13} color={c} style={{ marginLeft: 5 }} />;
}
function IcoArrowL({ c = '#8A8A9E' }: { c?: string }) {
  return <ArrowLeft size={13} color={c} style={{ marginRight: 5 }} />;
}
function IcoCheck({ c = '#050507' }: { c?: string }) {
  return (
    <View style={{ width: 16, height: 16, marginRight: 6, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 7, height: 4, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: c, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
    </View>
  );
}
function IcoTrash({ c = '#8A8A9E' }: { c?: string }) {
  return (
    <View style={{ width: 13, height: 16, marginRight: 6 }}>
      <View style={{ position: 'absolute', top: 4, left: 0, right: 0, bottom: 0, borderWidth: 1.5, borderColor: c }} />
      <View style={{ position: 'absolute', top: 0, left: -1, right: -1, height: 5, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: c }} />
      <View style={{ position: 'absolute', top: 1, left: -3, right: -3, height: 2, backgroundColor: c }} />
      <View style={{ position: 'absolute', top: 7, left: 3, width: 2, bottom: 2, backgroundColor: c, opacity: 0.7 }} />
      <View style={{ position: 'absolute', top: 7, right: 3, width: 2, bottom: 2, backgroundColor: c, opacity: 0.7 }} />
    </View>
  );
}
function IcoPaste({ c = '#050507', size = 14 }: { c?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size + 2, marginRight: 7, alignItems: 'center' }}>
      <View style={{ width: size - 2, height: size + 2, borderWidth: 1.5, borderColor: c }}>
        <View style={{ position: 'absolute', top: -3, left: 2, width: size - 8, height: 4, backgroundColor: 'rgba(8,8,8,1)', borderTopWidth: 1.5, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: c }} />
      </View>
    </View>
  );
}


// ───────────────────────────────────────────────────────────────────────
// 색상 상수 (소형 컴포넌트에서 참조하므로 먼저 선언)
// ───────────────────────────────────────────────────────────────────────

// 스타일
// ───────────────────────────────────────────────────────────────────────

const MONO = false ? 'Courier' : 'monospace';

const S = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#050507' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    position: 'relative',
    backgroundColor: 'transparent' },
  glowGold: {
    position: 'absolute', top: -80, left: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(212,168,83,0.07)'
  },
  glowPurple: {
    position: 'absolute', top: -80, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(139,92,246,0.08)'
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#0C0C14', marginRight: 12 },
  backIcon: { fontSize: 20, color: '#F0F0F5' },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  stepDots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#181820' },
  dotOn: { backgroundColor: '#D4A853', width: 14 },

  scroll: { flex: 1 },
  body: { padding: 20, paddingBottom: 40 },


  infoCard: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: '#1A1A24' },
  infoTitle: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#797990', marginBottom: 7 },
  infoBody: { fontSize: 12, color: '#757585', lineHeight: 20 },

  statusCard: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#1A1A24' },
  statusTitle: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#C8C8D4', marginBottom: 6 },
  statusBody: { fontSize: 12, color: '#8A8A9E', lineHeight: 19 },

  lbl: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#8A8A9E', marginBottom: 7, marginTop: 18 },
  optLbl: { fontSize: 11, color: '#757585', fontFamily: Typography.fontFamily.regular },
  hint: { fontSize: 11, color: '#757585', marginTop: 3, marginBottom: 6, fontFamily: Typography.fontFamily.regular },

  inp: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 14, minHeight: 48,
    color: '#F0F0F5', fontSize: 14, borderWidth: 1,
    borderColor: '#1A1A24', marginBottom: 6,
    fontFamily: Typography.fontFamily.regular },
  ta: { minHeight: 72, textAlignVertical: 'top' },
  numInp: { width: 100, textAlign: 'center' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24' },
  chipOn: { backgroundColor: 'rgba(212,168,83,0.14)', borderColor: 'rgba(212,168,83,0.30)' },
  chipTxt: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  chipTxtOn: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },

  charBox: {
    backgroundColor: '#0E0E14', borderRadius: Radius.md, padding: 12,
    marginTop: 6, gap: 4, borderWidth: 1, borderColor: '#1A1A24' },
  charLbl: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#797990', marginBottom: 3 },

  genderBtn: {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: '#1A1A24', backgroundColor: '#0C0C14',
    justifyContent: 'center', alignItems: 'center' },
  genderBtnOn: { borderColor: 'rgba(212,168,83,0.30)', backgroundColor: 'rgba(212,168,83,0.14)' },
  genderBtnTxt: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  genderBtnTxtOn: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },

  mainBtn: {
    backgroundColor: '#D4A853', borderRadius: Radius.lg, padding: 15,
    alignItems: 'center', marginTop: 18, overflow: 'hidden',
    ...Shadow.md },
  mainBtnDone: { backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  mainBtnTxt: { fontSize: 15, fontFamily: Typography.fontFamily.bold },
  mainBtnTxtDefault: { color: '#050507' },
  mainBtnTxtDone: { color: '#F0F0F5' },

  secBtn: {
    backgroundColor: '#0C0C14', borderRadius: Radius.lg, padding: 13,
    alignItems: 'center', borderWidth: 1, borderColor: '#1A1A24' },
  secBtnTxt: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#C8C8D4' },

  ghostBtn: { alignItems: 'center', padding: 12, marginTop: 4 },
  ghostTxt: { fontSize: 12, color: '#757585', fontFamily: Typography.fontFamily.regular },

  whiteGhostBtn: {
    alignItems: 'center', justifyContent: 'center',
    padding: 12, marginTop: 4,
    borderRadius: Radius.md, borderWidth: 1, borderColor: '#181820' },
  whiteGhostTxt: { fontSize: 13, color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },

  previewBox: {
    backgroundColor: '#0E0E14', borderRadius: Radius.md, padding: 12,
    borderWidth: 1, borderColor: '#1A1A24', marginTop: 12,
    maxHeight: 320 },
  mono: { fontSize: 10, fontFamily: MONO, lineHeight: 17, color: '#797990' },

  parseInfoBox: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md, padding: 11,
    borderWidth: 1, borderColor: '#1A1A24', marginBottom: 10 },
  parseRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5, gap: 7 },
  parseDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  parseTxt: { fontSize: 11, lineHeight: 17, flex: 1, color: '#F0F0F5' },

  pasteBtn: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md, padding: 11,
    alignItems: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: '#1A1A24' },
  pasteBtnTxt: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  pasteArea: { minHeight: 200, fontSize: 12, lineHeight: 19, fontFamily: MONO, color: '#F0F0F5' },

  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0C0C14',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#181820',
    ...Shadow.xl },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24' },
  modalHeaderTitle: {
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' },
  modalHeaderSub: {
    fontSize: 12,
    color: '#797990',
    marginTop: 4,
    fontFamily: Typography.fontFamily.regular },
  modalCloseBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, backgroundColor: '#0E0E14', marginLeft: 12 },
  modalCloseBtnText: {
    fontSize: 20,
    color: '#8A8A9E' },
  modalOriginalBox: {
    backgroundColor: '#0E0E14',
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1A1A24' },
  modalOriginalLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
    color: '#797990',
    marginBottom: 8 },
  modalOriginalTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
    marginBottom: 4 },
  modalOriginalDesc: {
    fontSize: 12,
    color: '#8A8A9E',
    marginBottom: 2 },
  modalOriginalTags: {
    fontSize: 11,
    color: '#797990',
    marginTop: 4 },
  modalStepDesc: {
    fontSize: 13,
    color: '#8A8A9E',
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: Typography.fontFamily.regular },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 7 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0C0C14', borderRadius: Radius.md, borderWidth: 1, borderColor: '#1A1A24', overflow: 'hidden' },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14141E' },
  stepBtnDis: { opacity: 0.3 },
  stepBtnTxt: { color: '#F0F0F5', fontSize: 18, fontFamily: Typography.fontFamily.bold },
  stepValBox: { width: 40, alignItems: 'center', justifyContent: 'center' },
  stepValTxt: { color: '#D4A853', fontSize: 15, fontFamily: Typography.fontFamily.bold } });

// ───────────────────────────────────────────────────────────────────────
// 색상 & 소형 컴포넌트 (StyleSheet보다 나중, 메인 컴포넌트보다 먼저)
// ───────────────────────────────────────────────────────────────────────

const C = {
  bg: '#050507',
  surface: '#0E0E14',
  border: '#0C0C14',
  ph: '#2E2E2E',
  ph2: '#5A5A70',
  action: '#9A9A9A',
  key: '#5A9FD4',
  choice: '#7EC8A0',
  char: '#D4A85A',
  chapter: '#C87A7A' };

// ───────────────────────────────────────────────────────────────────────
// 소형 컴포넌트 (AIStoryChatScreen보다 먼저 선언해야 undefined 에러 방지)
// ───────────────────────────────────────────────────────────────────────

const FieldLabel = memo(({ text, optional, optTxt }: { text: string; optional?: boolean; optTxt?: string }) => {
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  return (
    <Text style={S.lbl}>
      {text}
      {optional && <Text style={S.optLbl}> {optTxt ?? t?.aiStoryOptional ?? ''}</Text>}
    </Text>
  );
});

const Chip = memo(({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[S.chip, on && S.chipOn]} onPress={onPress}>
    <Text style={[S.chipTxt, on && S.chipTxtOn]}>{label}</Text>
  { }
  </TouchableOpacity>
 
));

const ParseRow = memo(({ text }: { color?: string; text: string }) => (
  <View style={S.parseRow}>
    <View style={S.parseDot} />
    <Text style={S.parseTxt}>{text}</Text>
  </View>
));



// 붙여넣기 미리보기 라인
const PastedLine = memo(({ line }: { line: string }) => {
  if (!line.trim()) return <View style={{ height: 3 }} />;
  const colonIdx = line.indexOf(':');
  const isKey = colonIdx > 0 && /^[A-Z_0-9]+$/.test(line.slice(0, colonIdx).trim());
  if (isKey) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 }}>
        <Text style={[S.mono, { color: '#C8C8D4', fontFamily: Typography.fontFamily.semibold }]}>{line.slice(0, colonIdx + 1)}</Text>
        <Text style={[S.mono, { color: '#8A8A9E', flex: 1 }]}>{line.slice(colonIdx + 1)}</Text>
      </View>
    );
  }
  return <Text style={[S.mono, { color: '#8A8A9E', marginBottom: 2 }]}>{line}</Text>;
});

export function AIStoryChatScreen({ navigation }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const lang = (useLanguageStore(s => s.currentLanguage || s.detectFromLocale() || 'ko')) as LanguageCode;

  const genreOptions = React.useMemo(
    () => [
      { id: 'fantasy', label: t?.aiStoryGenreFantasy ?? getStoryGenreLabel('fantasy', t as Record<string, string | undefined>) },
      { id: 'romance', label: t?.aiStoryGenreRomance ?? getStoryGenreLabel('romance', t as Record<string, string | undefined>) },
      { id: 'action', label: t?.aiStoryGenreAction ?? getStoryGenreLabel('action', t as Record<string, string | undefined>) },
      { id: 'school', label: t?.aiStoryGenreSchool ?? getStoryGenreLabel('school', t as Record<string, string | undefined>) },
      { id: 'mystery', label: t?.aiStoryGenreMystery ?? getStoryGenreLabel('mystery', t as Record<string, string | undefined>) },
      { id: 'horror', label: t?.aiStoryGenreHorror ?? getStoryGenreLabel('horror', t as Record<string, string | undefined>) },
      { id: 'sf', label: t?.aiStoryGenreSF ?? getStoryGenreLabel('sf', t as Record<string, string | undefined>) },
      { id: 'comedy', label: t?.aiStoryGenreComedy ?? getStoryGenreLabel('comedy', t as Record<string, string | undefined>) },
      { id: 'period', label: t?.aiStoryGenrePeriod ?? getStoryGenreLabel('period', t as Record<string, string | undefined>) },
      { id: 'modern', label: t?.aiStoryGenreModern ?? getStoryGenreLabel('modern', t as Record<string, string | undefined>) },
    ],
    [t],
  );
  const stylePresetOptions = React.useMemo(
    () => getStoryStylePresetOptions(t as Record<string, string | undefined>),
    [t],
  );

  const tones = [
    t?.aiStoryToneWarm, t?.aiStoryToneDark,
    t?.aiStoryToneTense, t?.aiStoryToneComic,
    t?.aiStoryToneLyrical, t?.aiStoryToneThriller,
    t?.aiStoryToneCalm, t?.aiStoryToneMelancholy,
    t?.aiStoryToneHopeful,
  ].filter(Boolean) as string[];

  const opt = t?.aiStoryOptional || '';

  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<FormData>({
    title: '', genre: '', stylePreset: '', worldSetting: '',
    user: { name: '', age: '', gender: '', traits: '', description: '' },
    charCount: '2',
    chars: [
      { name: '', age: '', gender: '', traits: '', personality: '', personalityExample: '' },
      { name: '', age: '', gender: '', traits: '', personality: '', personalityExample: '' },
    ],
    chapterCount: '5', tone: '', extra: '',
  });
  const [prompt, setPrompt] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  
  // ── 취소 확인 모달 ──
  const [showCancelModal, setShowCancelModal] = useState(false);
  const pendingBackActionRef = useRef<(() => void) | null>(null);
  const shouldIgnoreBeforeRemove = useRef(false);

  const hasContent = step === 'paste' || prompt.length > 0 || form.title.length > 0 || form.worldSetting.length > 0;

  const scrollRef = useRef<any>(null);

  // ✅ 키보드 나타날 때 자동 스크롤
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  useEffect(() => {
    const handleBackPress = () => {
      if (hasContent) {
        setShowCancelModal(true);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => { subscription.remove(); };
  }, [hasContent]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (shouldIgnoreBeforeRemove.current) return;
      if (hasContent) {
        if (showCancelModal) return;
        e.preventDefault();
        pendingBackActionRef.current = () => navigation.dispatch(e.data.action);
        setShowCancelModal(true);
      }
    });
    return unsubscribe;
  }, [navigation, hasContent, showCancelModal]);

  const confirmBack = () => {
    setShowCancelModal(false);
    shouldIgnoreBeforeRemove.current = true;
    const pendingAction = pendingBackActionRef.current;
    pendingBackActionRef.current = null;
    if (pendingAction) {
      pendingAction();
    } else {
      // @ts-ignore
      if (navigation.canGoBack()) navigation.goBack();
      // @ts-ignore
      else navigation.navigate('MainTabs');
    }
  };

  const upd = useCallback(<K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm(p => ({ ...p, [k]: v })), []);

  const updChar = useCallback((i: number, f: keyof CharInput, v: string) =>
    setForm(p => { const c = [...p.chars]; c[i] = { ...c[i], [f]: v }; return { ...p, chars: c }; }), []);

  const updUser = useCallback((f: keyof UserInput, v: string) =>
    setForm(p => ({ ...p, user: { ...p.user, [f]: v } })), []);

  const onCharCntChange = useCallback((v: string) => {
    setForm(p => {
      const n = Math.max(1, parseInt(v, 10) || 1);
      const chars = Array.from({ length: Math.max(n, p.chars.length) }, (_, i) =>
        p.chars[i] ?? { name: '', age: '', gender: '', traits: '', personality: '', personalityExample: '' });
      return { ...p, charCount: v, chars };
    });
  }, []);

  const handleGen = useCallback(() => {
    if (!form.stylePreset) {
      ToastService.info((t as Record<string, string | undefined>).selectStylePresetRequired ?? '');
      return;
    }
    setPrompt(buildPrompt(form, lang));
    setStep('paste');
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 80);
  }, [form, lang, t]);

  const handleCopy = useCallback(() => {
    clipboardSetString(prompt);
    setStep('paste');
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 80);
  }, [prompt]);

  const handlePasteClip = useCallback(async () => {
    const clipboardText = await clipboardGetString();
    if (clipboardText) {
      setPasteText(clipboardText);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } else {
      ToastService.info(t?.aiStoryClipboardEmpty ?? '');
    }
  }, [t]);

  const handleGoEditor = useCallback(async () => {
    if (!pasteText.trim()) {
      ToastService.info(t?.aiStoryPasteEmpty ?? '');
      return;
    }
    setParsing(true);
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    
    try {
      const prefill = parseResponse(pasteText, form);
      setParsing(false);
      shouldIgnoreBeforeRemove.current = true;
      // @ts-ignore
      navigation.replace('StoryEditor', { prefill, fromAIChat: true, autoSaveDraft: true });
    } catch (error) {
      setParsing(false);
      ToastService.info(t?.aiStoryParseError ?? '');
    }
  }, [pasteText, form, navigation, t]);

  const handleBack = useCallback(() => {
    if (step === 'form') {
      if (hasContent) setShowCancelModal(true);
      else {
        // @ts-ignore
        if (navigation.canGoBack()) navigation.goBack();
      }
    }
    if (step === 'paste') setStep('form');
  }, [step, navigation, hasContent]);

  const insets = useSafeAreaInsets();
  const validCharCount = Math.max(1, parseInt(form.charCount, 10) || 1);

  return (
    <View style={S.wrap}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent />
      {/* 프리미엄 배경 글로우 추가 */}
      <View style={S.glowGold} />
      <View style={S.glowPurple} />

      {/* 헤더 */}
      <Animated.View entering={FadeInDown.springify()} style={[S.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <TouchableOpacity onPress={handleBack} style={S.backBtn}>
          <ArrowLeft size={22} color={'#F0F0F5'} />
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>
          {t?.aiStoryTitle ?? ''}
        </Text>
        <View style={S.stepDots}>
          {(['form', 'paste'] as Step[]).map(st => (
            <Animated.View key={st} layout={Layout.springify()} style={[S.dot, step === st && S.dotOn]} />
          ))}
        </View>
      </Animated.View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={S.scroll}
          contentContainerStyle={S.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
        >

          {/* ══════════════ STEP 1: 폼 입력 ══════════════ */}
          {step === 'form' && (
            <>
              <View style={S.infoCard}>
                <Text style={S.infoTitle}>{t?.aiStoryHowToUse ?? ''}</Text>
                <Text style={S.infoBody}>{t?.aiStoryHowToUseBody ?? ''}</Text>
              </View>

              <View style={S.statusCard}>
                <Text style={S.statusTitle}>{t?.aiStoryRecommendation ?? ''}</Text>
                <Text style={S.statusBody}>{t?.aiStoryRecommendationBody ?? ''}</Text>
              </View>

              {/* 제목 */}
              <FieldLabel text={t?.aiStoryTitleTheme ?? ''} optional />
              <TextInput
                style={S.inp} value={form.title} onChangeText={v => upd('title', v)}
                placeholder={t?.aiStoryTitleTheme || ''}
                placeholderTextColor={C.ph}
              />

              {/* 장르 */}
              <FieldLabel text={t?.aiStoryGenreLabel ?? ''} optional />
              <View style={S.chips}>
                {genreOptions.map(genre => (
                  <Chip key={genre.id} label={genre.label} on={form.genre === genre.id} onPress={() => upd('genre', genre.id)} />
                ))}
              </View>
              <TextInput
                style={[S.inp, { display: 'none', marginTop: 8 }]} value={''} editable={false}
                placeholder={t?.aiStoryCustomInput ?? ''}
                placeholderTextColor={C.ph}
              />

              <FieldLabel text={(t as Record<string, string | undefined>).stylePresetLabel ?? ''} />
              <View style={S.chips}>
                {stylePresetOptions.map((preset) => (
                  <Chip
                    key={preset.id}
                    label={preset.label}
                    on={form.stylePreset === preset.id}
                    onPress={() => upd('stylePreset', preset.id)}
                  />
                ))}
              </View>
              <Text style={S.hint}>{(t as Record<string, string | undefined>).stylePresetGuide ?? ''}</Text>

              {/* 세계관 */}
              <FieldLabel text={t?.aiStoryWorldSetting ?? ''} optional />
              <TextInput
                style={[S.inp, S.ta]} value={form.worldSetting} onChangeText={v => upd('worldSetting', v)}
                placeholder={t?.aiStoryWorldSettingPlaceholder ?? ''}
                placeholderTextColor={C.ph} multiline numberOfLines={3} textAlignVertical="top"
              />

              {/* 나(유저) 설정 */}
              <View style={S.charBox}>
                <Text style={S.charLbl}>
                  {t?.aiStoryPlayerSetting ?? ''}
                  <Text style={S.optLbl}> {opt}</Text>
                </Text>
                <Text style={[S.hint, { marginBottom: 8, marginTop: 0 }]}>
                  {t?.aiStoryPlayerHint ?? ''}
                </Text>
                {/* User name input removed per request */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <TextInput
                    style={[S.inp, { flex: 1, marginTop: 0, minWidth: 60 }]}
                    value={form.user.age} onChangeText={v => updUser('age', v)}
                    placeholder={t?.aiStoryAgeLabel ?? ''} placeholderTextColor={C.ph} keyboardType="numeric"
                  />
                  <View style={{ flexDirection: 'row', gap: 6, flex: 1.5, minWidth: 160 }}>
                    {(['male', 'female', 'other'] as const).map(g => (
                      <TouchableOpacity
                        key={g}
                        style={[S.genderBtn, { flex: 1, paddingHorizontal: 0 }, form.user.gender === g && S.genderBtnOn]}
                        onPress={() => updUser('gender', form.user.gender === g ? '' : g)}
                      >
                        <Text style={[S.genderBtnTxt, form.user.gender === g && S.genderBtnTxtOn]} numberOfLines={1}>
                          {g === 'male' ? (t?.genderMale ?? '') : g === 'female' ? (t?.genderFemale ?? '') : (t?.genderOther ?? '')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TextInput
                  style={[S.inp, { marginTop: 6 }]} value={form.user.traits}
                  onChangeText={v => updUser('traits', v)}
                  placeholder={t?.aiStoryTraitsHint ?? ''}
                  placeholderTextColor={C.ph}
                />
                <TextInput
                  style={[S.inp, S.ta, { marginTop: 6 }]} value={form.user.description}
                  onChangeText={v => updUser('description', v)}
                  placeholder={t?.aiStoryPersonalityHint || ''}
                  placeholderTextColor={C.ph} multiline numberOfLines={2} textAlignVertical="top"
                />
              </View>

              {/* 분위기 */}
              <FieldLabel text={t?.aiStoryToneLabel ?? ''} optional />
              <View style={S.chips}>
                {tones.map(tn => (
                  <Chip key={tn} label={tn} on={form.tone === tn} onPress={() => upd('tone', form.tone === tn ? '' : tn)} />
                ))}
              </View>

              {/* 캐릭터 수 (스테퍼 타입) */}
              <View style={S.stepperRow}>
                <FieldLabel text={t?.aiStoryCharCountLabel ?? ''} />
                <View style={S.stepper}>
                  <TouchableOpacity 
                    style={[S.stepBtn, validCharCount <= 1 && S.stepBtnDis]} 
                    onPress={() => onCharCntChange(String(validCharCount - 1))}
                    disabled={validCharCount <= 1}
                  >
                    <Text style={S.stepBtnTxt}>-</Text>
                  </TouchableOpacity>
                  <View style={S.stepValBox}>
                    <Text style={S.stepValTxt}>{validCharCount}</Text>
                  </View>
                  <TouchableOpacity 
                    style={[S.stepBtn, validCharCount >= 4 && S.stepBtnDis]} 
                    onPress={() => onCharCntChange(String(validCharCount + 1))}
                    disabled={validCharCount >= 4}
                  >
                    <Text style={S.stepBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={S.hint}>{t?.aiStoryCharCountHint ?? ''}</Text>

              {/* 캐릭터 상세 */}
              {Array.from({ length: validCharCount }, (_, i) => (
                <View key={i} style={S.charBox}>
                  <Text style={S.charLbl}>
                    {(t?.aiStoryCharN ?? '').replace('{n}', String(i + 1))}
                    <Text style={S.optLbl}> {opt}</Text>
                  </Text>
                  <TextInput
                    style={S.inp} value={form.chars[i]?.name || ''}
                    onChangeText={v => updChar(i, 'name', v)}
                    placeholder={t?.aiStoryNameHint ?? ''}
                    placeholderTextColor={C.ph}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <TextInput
                      style={[S.inp, { flex: 1, marginTop: 0, minWidth: 60 }]}
                      value={form.chars[i]?.age || ''}
                      onChangeText={v => updChar(i, 'age', v)}
                      placeholder={t?.aiStoryAgeLabel ?? ''}
                      placeholderTextColor={C.ph}
                      keyboardType="numeric"
                    />
                    <View style={{ flexDirection: 'row', gap: 6, flex: 1.5, minWidth: 160 }}>
                      {(['male', 'female', 'other'] as const).map(g => (
                        <TouchableOpacity
                          key={g}
                          style={[S.genderBtn, { flex: 1, paddingHorizontal: 0 }, form.chars[i]?.gender === g && S.genderBtnOn]}
                          onPress={() => updChar(i, 'gender', form.chars[i]?.gender === g ? '' : g)}
                        >
                          <Text style={[S.genderBtnTxt, form.chars[i]?.gender === g && S.genderBtnTxtOn]} numberOfLines={1}>
                            {g === 'male' ? (t?.genderMale ?? '') : g === 'female' ? (t?.genderFemale ?? '') : (t?.genderOther ?? '')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <TextInput
                    style={[S.inp, { marginTop: 6 }]} value={form.chars[i]?.traits || ''}
                    onChangeText={v => updChar(i, 'traits', v)}
                    placeholder={t?.aiStoryTraitsHint ?? ''}
                    placeholderTextColor={C.ph}
                  />
                  <TextInput
                    style={[S.inp, { marginTop: 6 }]} value={form.chars[i]?.personality || ''}
                    onChangeText={v => updChar(i, 'personality', v)}
                    placeholder={t?.aiStoryPersonalityHint ?? ''}
                    placeholderTextColor={C.ph}
                  />
                </View>
              ))}

              {/* 챕터 수 */}
              <FieldLabel text={t?.aiStoryChapterCountLabel ?? ''} />
              <TextInput
                style={[S.inp, S.numInp]} value={form.chapterCount}
                onChangeText={v => upd('chapterCount', v)}
                placeholder="5"
                placeholderTextColor={C.ph}
                keyboardType="numeric"
              />
              <Text style={S.hint}>{t?.aiStoryChapterCountHint ?? ''}</Text>

              {/* 추가 요청 */}
              <FieldLabel text={t?.aiStoryExtraRequestLabel ?? ''} optional />
              <TextInput
                style={[S.inp, S.ta]} value={form.extra} onChangeText={v => upd('extra', v)}
                placeholder={t?.aiStoryExtraPlaceholder ?? ''}
                placeholderTextColor={C.ph} multiline numberOfLines={3} textAlignVertical="top"
              />

              <TouchableOpacity style={S.mainBtn} onPress={handleGen}>
                <Text style={S.mainBtnTxt}>{t?.aiStoryGeneratePrompt ?? ''}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ══════════════ STEP 2: 프롬프트 복사 ══════════════ */}
          {step === 'paste' && (
            <>
              <View style={S.statusCard}>
                <Text style={S.statusTitle}>{t?.aiStoryPasteTitle ?? ''}</Text>
                <Text style={S.statusBody}>{t?.aiStoryPasteBody ?? ''}</Text>
              </View>

              <View style={[S.parseInfoBox, { marginTop: 16 }]}>
                <ParseRow color={C.key} text={t?.aiStoryParseGuideStoryMeta ?? ''} />
                <ParseRow color={C.char} text={t?.aiStoryParseGuideCharacter ?? ''} />
                <ParseRow color={C.chapter} text={t?.aiStoryParseGuideChapter ?? ''} />
                <ParseRow color={C.choice} text={t?.aiStoryParseGuideChoice ?? ''} />
                <ParseRow color={C.action} text={t?.aiStoryParseGuideIntro ?? ''} />
              </View>

              {/* Action Buttons Group (Centered) */}
              <View style={{ gap: 12, marginVertical: 32 }}>
                <TouchableOpacity
                  style={S.mainBtn}
                  onPress={handleCopy}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IcoCopy c='#050507' />
                    <Text style={[S.mainBtnTxt, S.mainBtnTxtDefault]}>
                      {t?.aiStoryCopyPrompt ?? ''}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={S.secBtn} onPress={handlePasteClip}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IcoPaste c='#C8C8D4' />
                    <Text style={S.secBtnTxt}>{t?.aiStoryPasteFromClip ?? ''}</Text>
                  </View>
                </TouchableOpacity>

                {/* 돌아가기 */}
                <TouchableOpacity style={S.whiteGhostBtn} onPress={() => setStep('form')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IcoArrowL c="#FFF" />
                    <Text style={S.whiteGhostTxt}>{t?.aiStoryEditAgain ?? ''}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* ✅ AI 응답 입력 - 고정 높이 */}
              <Text style={S.lbl}>{t?.aiStoryInputLabel ?? ''}</Text>
              <TextInput
                style={[S.inp, { minHeight: 180, maxHeight: 180, textAlignVertical: 'top' }]}
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={`TITLE: ...\nDESC: ...\nCHAR_1_NAME: ...\nCH_1_TITLE: ...\nCH_1_INTRO_LINE_1: 0:...`}
                placeholderTextColor={C.ph2}
                multiline
                scrollEnabled
              />

              {/* 미리보기 - 입력과 분리 */}
              {pasteText.trim().length > 0 && (
                <>
                  <Text style={[S.lbl, { marginTop: 12 }]}>{t?.aiStoryPreviewLabel ?? ''}</Text>
                  <View style={[S.previewBox, { maxHeight: 200 }]}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      <Text style={[S.mono, { color: '#8A8A9E' }]}>{pasteText}</Text>
                    </ScrollView>
                  </View>
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {pasteText.trim() && (
                  <TouchableOpacity style={[S.whiteGhostBtn, { flex: 1 }]} onPress={() => setPasteText('')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <IcoTrash c="#AAA" />
                      <Text style={S.whiteGhostTxt}>{t?.aiStoryClear ?? ''}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[S.mainBtn, { flex: pasteText.trim() ? 2 : 1, marginTop: 0 }, (!pasteText.trim() || parsing) && { opacity: 0.4 }]}
                  onPress={handleGoEditor}
                  disabled={!pasteText.trim() || parsing}
                >
                  {parsing
                    ? <RefreshCw size={18} color='#050507' />
                    : <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <IcoCheck c='#050507' />
                      <Text style={[S.mainBtnTxt, S.mainBtnTxtDefault]}>{t?.aiStoryGoEditor ?? ''}</Text>
                    </View>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ✅ 하단 여백 증가 - 키보드에 가려지지 않도록 */}
          <View style={{ height: 200 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={showCancelModal}
        icon="alert-circle-outline"
        iconColor="#F59E0B"
        title={(t as Record<string, string | undefined>).aiWebNovelCancelTitle ?? ''}
        message={(t as Record<string, string | undefined>).aiWebNovelCancelMsg ?? ''}
        onRequestClose={() => setShowCancelModal(false)}
        actions={[
          { label: (t as Record<string, string | undefined>).aiWebNovelCancelConfirm ?? '', variant: 'danger', onPress: confirmBack },
          { label: (t as Record<string, string | undefined>).aiWebNovelCancelStay ?? '', variant: 'default', onPress: () => setShowCancelModal(false) },
        ]}
      />
    </View>
  );
}


// ───────────────────────────────────────────────────────────────────────
