/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, StatusBar, BackHandler } from 'react-native';
import { useLanguageStore } from '../store/languageStore';
import { ScreenProps } from '../types/navigation';
import { ArrowLeft, ClipboardPaste, X, Layers } from 'lucide-react-native';
import { PressableOpacity } from '../components/PressableOpacity';
import Animated, { FadeInDown, Layout, FadeIn } from 'react-native-reanimated';
import { Radius, Typography } from '../constants/tokens';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ConfirmModal } from '../components/ConfirmModal';
import { ToastService } from '../components/Toast';
import { clipboardGetString, clipboardSetString } from '../utils/ClipboardUtils';
import { triggerHaptic } from '../utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WNFormData, WNFormStep, WNCharInput, DEFAULT_WN_FORM_DATA } from './AIWebNovelChatScreen.types';
import { buildWebNovelPrompt } from './AIWebNovelChatScreen.prompt';
import { parseWebNovelResponse } from './AIWebNovelChatScreenParser';
import { getSeriesFinalEmotions } from '../utils/webNovelStorage';
import { nanoid } from 'nanoid/non-secure';
import { getScreenTranslations } from '../i18n/SCREENS-TRANSLATION';

const DEFAULT_PREV_EPISODE_EMOTION_TITLE = 'Episode {n} ending emotion state';
const DEFAULT_PREV_EPISODE_EMOTION_HINT = 'Automatically applied to the next episode prompt';
const DEFAULT_AFFINITY_LABEL = 'Favor(+100)';

export function AIWebNovelChatScreen({ navigation }: ScreenProps<'AIWebNovelChat'>) {
  const { t, appLanguage } = useLanguageStore();
  const screenT = useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const [step, setStep]           = useState<WNFormStep>('form');
  const [formData, setFormData]   = useState<WNFormData>(DEFAULT_WN_FORM_DATA);
  const [promptText, setPromptText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [isSaving, setIsSaving]   = useState(false);
  const scrollRef = useRef<any>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const pendingBackActionRef = useRef<(() => void) | null>(null);
  const shouldIgnoreBeforeRemove = useRef(false);

  // 시리즈 직전 화 감정 상태 (다음 화 프롬프트에 표시용)
  const [prevFinalEmotions, setPrevFinalEmotions] = useState<Record<number, any> | null>(null);

  const hasContent =
    step === 'paste' ||
    promptText.length > 0 ||
    formData.sourceText.length > 0 ||
    formData.title.length > 0 ||
    formData.chars.some(c => c.name || c.traits || c.personality);

  // ── 뒤로가기 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hasContent) { setShowCancelModal(true); return true; }
      return false;
    });
    return () => sub.remove();
  }, [hasContent]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (shouldIgnoreBeforeRemove.current) return;
      if (hasContent) {
        if (showCancelModal) return;
        e.preventDefault();
        pendingBackActionRef.current = () => navigation.dispatch(e.data.action);
        setShowCancelModal(true);
      }
    });
    return unsub;
  }, [navigation, hasContent, showCancelModal]);

  const confirmBack = () => {
    setShowCancelModal(false);
    shouldIgnoreBeforeRemove.current = true;
    const action = pendingBackActionRef.current;
    pendingBackActionRef.current = null;
    if (action) { action(); }
    // @ts-ignore
    else if (navigation.canGoBack()) navigation.goBack();
    // @ts-ignore
    else navigation.navigate('MainTabs');
  };

  // ── 장르 / 분위기 ────────────────────────────────────────────────────────
  const genres = [
    t?.aiStoryGenreFantasy, t?.aiStoryGenreRomance,
    t?.aiStoryGenreAction,  t?.aiStoryGenreSchool,
    t?.aiStoryGenreMystery, t?.aiStoryGenreHorror,
    t?.aiStoryGenreSF,      t?.aiStoryGenreComedy,
    t?.aiStoryGenrePeriod,  t?.aiStoryGenreModern,
  ].filter(Boolean) as string[];

  const tones = [
    t?.aiStoryToneWarm,    t?.aiStoryToneDark,
    t?.aiStoryToneTense,   t?.aiStoryToneComic,
    t?.aiStoryToneLyrical, t?.aiStoryToneThriller,
    t?.aiStoryToneCalm,
  ].filter(Boolean) as string[];

  const opt = t?.aiStoryOptional || '';
  const prevEpisodeEmotionTitle = (
    t?.aiWebNovelPrevEpisodeEmotionTitle ?? DEFAULT_PREV_EPISODE_EMOTION_TITLE
  ).replace('{n}', String(Math.max(1, formData.currentEpisode - 1)));
  const prevEpisodeEmotionHint =
    t?.aiWebNovelPrevEpisodeEmotionHint ?? DEFAULT_PREV_EPISODE_EMOTION_HINT;
  const affinityLabel = (t?.emoE1Pos ?? DEFAULT_AFFINITY_LABEL).replace(/\([^)]*\)/g, '').trim();

  // ── 스크롤 헬퍼 ──────────────────────────────────────────────────────────
  const clearScrollTimer = useCallback(() => {
    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }, []);

  const scheduleScrollToTop = useCallback(() => {
    clearScrollTimer();
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 80);
  }, [clearScrollTimer]);

  useEffect(() => clearScrollTimer, [clearScrollTimer]);

  // ── 폼 업데이트 헬퍼 ─────────────────────────────────────────────────────
  const upd = useCallback(<K extends keyof WNFormData>(k: K, v: WNFormData[K]) =>
    setFormData(p => ({ ...p, [k]: v })), []);

  const updChar = useCallback((i: number, f: keyof WNCharInput, v: string) =>
    setFormData(p => {
      const c = [...p.chars];
      c[i] = { ...c[i], [f]: v };
      return { ...p, chars: c };
    }), []);

  const updUser = useCallback((f: keyof WNFormData['user'], v: string) =>
    setFormData(p => ({ ...p, user: { ...p.user, [f]: v } })), []);

  const onCharCntChange = useCallback((v: string) => {
    setFormData(p => {
      const n = Math.max(1, Math.min(4, parseInt(v, 10) || 1));
      const chars = Array.from({ length: Math.max(n, p.chars.length) }, (_, i) =>
        p.chars[i] ?? { name: '', age: '', gender: '', traits: '', personality: '' });
      return { ...p, charCount: v, chars };
    });
  }, []);

  // ── 시리즈: 직전 화 감정 상태 로드 ────────────────────────────────────────
  useEffect(() => {
    if (!formData.isSeries || !formData.seriesId || formData.currentEpisode <= 1) {
      setPrevFinalEmotions(null);
      return;
    }
    const prev = getSeriesFinalEmotions(formData.seriesId, formData.currentEpisode - 1);
    setPrevFinalEmotions(prev);
  }, [formData.isSeries, formData.seriesId, formData.currentEpisode]);

  // ── 프롬프트 생성 ────────────────────────────────────────────────────────
  const generatePrompt = () => {
    triggerHaptic('medium');
    let updated = { ...formData };

    // 시리즈 1화: seriesId 최초 발급
    if (formData.isSeries && !formData.seriesId) {
      updated.seriesId = nanoid();
      setFormData(updated);
    }

    const prompt = buildWebNovelPrompt(updated, appLanguage);
    setPromptText(prompt);
    clipboardSetString(prompt);
    ToastService.success(t?.copiedToClipboard ?? screenT.copiedToClipboard);
    // [FIX] 바로 paste 페이지로 이동 (form 페이지 건너뛰기)
    setStep('paste');
    clearScrollTimer();
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const pasteFromClipboard = async () => {
    triggerHaptic('light');
    const text = await clipboardGetString();
    if (text) setPastedText(text);
  };

  const copyPromptAgain = useCallback(() => {
    if (!promptText.trim()) return;
    triggerHaptic('light');
    clipboardSetString(promptText);
    ToastService.success(t?.copiedToClipboard ?? screenT.copiedToClipboard);
  }, [promptText, t]);

  const getSaveErrorMessage = (err: unknown) => {
    if (err instanceof Error && err.message.trim()) return err.message;
    if (typeof err === 'string' && err.trim()) return err;
    return t?.errorOccurred ?? screenT.errorOccurred;
  };

  // ── 저장 ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!pastedText.trim()) {
      ToastService.error(t?.aiWebNovelNoPasteText ?? screenT.translationResultRequired);
      return;
    }
    triggerHaptic('medium');
    setIsSaving(true);
    try {
      parseWebNovelResponse(pastedText, formData);

      // [FIX] 저장 후 바로 내 소설 목록으로 이동
      setShowCancelModal(false);
      shouldIgnoreBeforeRemove.current = true;
      ToastService.success(t?.aiWebNovelSaved ?? screenT.toastSaveOk);
      // @ts-ignore
      navigation.replace('MyWebNovels');
    } catch (err) {
      ToastService.error(getSaveErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const validCharCount = Math.max(1, Math.min(4, parseInt(formData.charCount, 10) || 1));
  const insets         = useSafeAreaInsets();
  const totalEps       = parseInt(formData.seriesCount, 10) || 1;

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <>
      <View style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* 헤더 */}
        <Animated.View
          entering={FadeInDown.springify()}
          style={[s.header, { paddingTop: Math.max(insets.top, 10) }]}
        >
          <PressableOpacity
            style={s.backBtn}
            onPress={() => { if (hasContent) setShowCancelModal(true); else if (navigation.canGoBack()) navigation.goBack(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={22} color="#F0F0F5" />
          </PressableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>
            {t?.aiWebNovelTitle ?? screenT.writeWebNovel}
          </Text>
          <View style={s.stepDots}>
            {(['form', 'paste'] as WNFormStep[]).map(st => (
              <Animated.View key={st} layout={Layout.springify()} style={[s.dot, step === st && s.dotOn]} />
            ))}
          </View>
        </Animated.View>

        <KeyboardAwareScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[s.body, { paddingBottom: 140 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
          bottomOffset={60}
        >
          {/* ──────────── STEP 1: 설정 폼 ──────────── */}
          {step === 'form' && (
            <>
              {/* 시리즈 설정 카드 */}
              <View style={s.seriesCard}>
                <View style={s.seriesRow}>
                  <View style={s.flex1}>
                    <View style={s.seriesTitleRow}>
                      <Layers size={14} color="#D4A853" />
                      <Text style={s.seriesLabel}>
                        {t?.aiWebNovelSeriesCountLabel}
                      </Text>
                    </View>
                    <Text style={s.seriesHint}>
                      {t?.aiWebNovelSeriesCountHint}
                    </Text>
                  </View>
                  <View style={s.countInputWrapper}>
                    <TextInput
                      style={s.seriesInp}
                      value={formData.seriesCount}
                      onChangeText={v => {
                        const num   = v.replace(/[^0-9]/g, '');
                        const isSer = parseInt(num, 10) > 1;
                        setFormData(p => ({ ...p, seriesCount: num, isSeries: isSer }));
                      }}
                      placeholder="1"
                      keyboardType="numeric"
                      placeholderTextColor="#5A5A70"
                      maxLength={3}
                    />
                    <Text style={s.countUnit}>{t?.aiWebNovelEpisodeSymbol}</Text>
                  </View>
                </View>

                {formData.isSeries && (
                  <Animated.View entering={FadeInDown} style={s.seriesInputs}>
                    {/* 진행 상황 배지 - 제거됨 */}

                    {/* 직전 화 감정 상태 미리보기 */}
                    {prevFinalEmotions && formData.currentEpisode > 1 && (
                      <Animated.View entering={FadeIn} style={s.prevEmoCard}>
                        <Text style={s.prevEmoTitle}>
                          {prevEpisodeEmotionTitle}
                        </Text>
                        <Text style={s.prevEmoHint}>{prevEpisodeEmotionHint}</Text>
                        <View style={s.prevEmoRow}>
                          {Object.entries(prevFinalEmotions).map(([charId, emo]) => (
                            <View key={charId} style={s.prevEmoChip}>
                              <Text style={s.prevEmoChipLabel}>CH{charId}</Text>
                              <Text style={s.prevEmoChipVal}>
                                {affinityLabel}{emo.e1 > 0 ? '+' : ''}{emo.e1}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </Animated.View>
                    )}
                  </Animated.View>
                )}
              </View>

              {/* 제목 */}
              <Text style={s.lbl}>
                {(t as Record<string, string | undefined>).aiWebNovelTitleLabel ?? screenT.webnovelTitleLabel}
                {' '}<Text style={s.optLbl}>{opt}</Text>
              </Text>
              <TextInput
                style={s.inp}
                value={formData.title}
                onChangeText={v => upd('title', v)}
                placeholder={(t as Record<string, string | undefined>).aiWebNovelTitleHint ?? screenT.webnovelTitleHint}
                placeholderTextColor="#5A5A70"
                maxLength={200}
              />

              {/* 장르 */}
              <View style={s.chips}>
                {genres.map(g => (
                  <PressableOpacity
                    key={g}
                    style={[s.chip, formData.genre === g && s.chipOn]}
                    onPress={() => upd('genre', formData.genre === g ? '' : g)}
                  >
                    <Text style={[s.chipTxt, formData.genre === g && s.chipTxtOn]}>{g}</Text>
                  </PressableOpacity>
                ))}
              </View>

              {/* 분위기 */}
              <View style={s.chips}>
                {tones.map(tn => (
                  <PressableOpacity
                    key={tn}
                    style={[s.chip, formData.tone === tn && s.chipOn]}
                    onPress={() => upd('tone', formData.tone === tn ? '' : tn)}
                  >
                    <Text style={[s.chipTxt, formData.tone === tn && s.chipTxtOn]}>{tn}</Text>
                  </PressableOpacity>
                ))}
              </View>

              {/* 주인공 설정 */}
              <View style={s.charBox}>
                <Text style={s.charLbl}>
                  {(t as Record<string, string | undefined>).aiWebNovelPlayerSetting ?? screenT.webnovelPlayerSetting}
                  <Text style={s.optLbl}> {opt}</Text>
                </Text>
                <Text style={s.hintNoMargin}>
                  {(t as Record<string, string | undefined>).aiWebNovelPlayerHint ?? screenT.webnovelPlayerHint}
                </Text>
                <TextInput
                  style={s.inp} value={formData.user.name}
                  onChangeText={v => updUser('name', v)}
                  placeholder={(t as Record<string, string | undefined>).aiWebNovelNameHint ?? screenT.nameHint}
                  placeholderTextColor="#5A5A70" maxLength={60}
                />
                <View style={s.charRow}>
                  <TextInput
                    style={s.inpAge}
                    value={formData.user.age}
                    onChangeText={v => updUser('age', v)}
                    placeholder={(t as Record<string, string | undefined>).aiWebNovelAgeLabel ?? screenT.age}
                    placeholderTextColor="#5A5A70" keyboardType="numeric" maxLength={10}
                  />
                  <View style={s.genderRow}>
                    {(['male', 'female', 'other'] as const).map(g => (
                      <PressableOpacity
                        key={g}
                        style={[s.genderBtn, s.genderBtnSmall, formData.user.gender === g && s.genderBtnOn]}
                        onPress={() => updUser('gender', formData.user.gender === g ? '' : g)}
                      >
                        <Text style={[s.genderBtnTxt, formData.user.gender === g && s.genderBtnTxtOn]} numberOfLines={1}>
                          {g === 'male' ? ((t as Record<string, string | undefined>).genderMale ?? screenT.genderMale) :
                           g === 'female' ? ((t as Record<string, string | undefined>).genderFemale ?? screenT.genderFemale) :
                           ((t as Record<string, string | undefined>).genderOther ?? screenT.genderOther)}
                        </Text>
                      </PressableOpacity>
                    ))}
                  </View>
                </View>
                <TextInput
                  style={s.inpMarginTop} value={formData.user.traits}
                  onChangeText={v => updUser('traits', v)}
                  placeholder={(t as Record<string, string | undefined>).aiWebNovelTraitsHint ?? screenT.webnovelTraitsHint}
                  placeholderTextColor="#5A5A70" maxLength={120}
                />
                <TextInput
                  style={[s.inp, s.ta, s.inpMarginTop]} value={formData.user.description}
                  onChangeText={v => updUser('description', v)}
                  placeholder={(t as Record<string, string | undefined>).aiWebNovelPersonalityHint ?? screenT.webnovelPersonalityHint}
                  placeholderTextColor="#5A5A70" multiline numberOfLines={2} textAlignVertical="top"
                />
              </View>

              {/* 등장인물 수 */}
              <View style={s.stepperRow}>
                <Text style={s.lblNoMargin}>
                  {(t as Record<string, string | undefined>).aiWebNovelCharCountLabel ?? screenT.webnovelCharCountLabel}
                </Text>
                <View style={s.stepper}>
                  <PressableOpacity
                    style={[s.stepBtn, validCharCount <= 1 && s.stepBtnDis]}
                    onPress={() => onCharCntChange(String(validCharCount - 1))}
                    disabled={validCharCount <= 1}
                  >
                    <Text style={s.stepBtnTxt}>-</Text>
                  </PressableOpacity>
                  <View style={s.stepValBox}>
                    <Text style={s.stepValTxt}>{validCharCount}</Text>
                  </View>
                  <PressableOpacity
                    style={[s.stepBtn, validCharCount >= 4 && s.stepBtnDis]}
                    onPress={() => onCharCntChange(String(validCharCount + 1))}
                    disabled={validCharCount >= 4}
                  >
                    <Text style={s.stepBtnTxt}>+</Text>
                  </PressableOpacity>
                </View>
              </View>
              <Text style={s.hint}>
                {(t as Record<string, string | undefined>).aiStoryCharCountHint ?? screenT.webnovelCharCountHint}
              </Text>

              {/* 등장인물 입력 */}
              {Array.from({ length: validCharCount }, (_, i) => (
                <View key={i} style={s.charBox}>
                  <Text style={s.charLbl}>
                    {((t as Record<string, string | undefined>).aiWebNovelCharN ?? screenT.webnovelCharN).replace('{n}', String(i + 1))}
                    <Text style={s.optLbl}> {opt}</Text>
                  </Text>
                  <TextInput
                    style={s.inp} value={formData.chars[i]?.name || ''}
                    onChangeText={v => updChar(i, 'name', v)}
                    placeholder={(t as Record<string, string | undefined>).aiWebNovelNameHint ?? screenT.nameHint}
                    placeholderTextColor="#5A5A70" maxLength={60}
                  />
                  <View style={s.charRow}>
                    <TextInput
                      style={s.inpAge}
                      value={formData.chars[i]?.age || ''}
                      onChangeText={v => updChar(i, 'age', v)}
                      placeholder={(t as Record<string, string | undefined>).aiWebNovelAgeLabel ?? screenT.age}
                      placeholderTextColor="#5A5A70" keyboardType="numeric" maxLength={10}
                    />
                    <View style={s.genderRow}>
                      {(['male', 'female', 'other'] as const).map(g => (
                        <PressableOpacity
                          key={g}
                          style={[s.genderBtn, s.genderBtnSmall, formData.chars[i]?.gender === g && s.genderBtnOn]}
                          onPress={() => updChar(i, 'gender', formData.chars[i]?.gender === g ? '' : g)}
                        >
                          <Text style={[s.genderBtnTxt, formData.chars[i]?.gender === g && s.genderBtnTxtOn]} numberOfLines={1}>
                            {g === 'male' ? ((t as Record<string, string | undefined>).genderMale ?? screenT.genderMale) :
                             g === 'female' ? ((t as Record<string, string | undefined>).genderFemale ?? screenT.genderFemale) :
                             ((t as Record<string, string | undefined>).genderOther ?? screenT.genderOther)}
                          </Text>
                        </PressableOpacity>
                      ))}
                    </View>
                  </View>
                  <TextInput
                    style={s.inpMarginTop} value={formData.chars[i]?.traits || ''}
                    onChangeText={v => updChar(i, 'traits', v)}
                    placeholder={(t as Record<string, string | undefined>).aiWebNovelTraitsHint ?? screenT.webnovelTraitsHint}
                    placeholderTextColor="#5A5A70" maxLength={120}
                  />
                  <TextInput
                    style={s.inpMarginTop} value={formData.chars[i]?.personality || ''}
                    onChangeText={v => updChar(i, 'personality', v)}
                    placeholder={(t as Record<string, string | undefined>).aiWebNovelPersonalityHint ?? screenT.webnovelPersonalityHint}
                    placeholderTextColor="#5A5A70" maxLength={120}
                  />
                </View>
              ))}

              {/* 글자 수 */}
              <Text style={s.lbl}>
                {(t as Record<string, string | undefined>).aiWebNovelWordCountLabel ?? screenT.webnovelWordCountLabel}
              </Text>
              <TextInput
                style={[s.inp, s.numInp]} value={formData.wordCount}
                onChangeText={v => upd('wordCount', v)}
                placeholder={formData.isSeries ? '5000' : '3000'}
                placeholderTextColor="#5A5A70"
                keyboardType="numeric"
              />
              <Text style={s.hint}>
                {(t as Record<string, string | undefined>).aiWebNovelWordCountHint ?? screenT.webnovelWordCountHint}
              </Text>

              {/* 상황 설명 */}
              <Text style={s.lbl}>
                {(t as Record<string, string | undefined>).aiWebNovelSourceLabel ?? screenT.webnovelSourceLabel}
                {' '}<Text style={s.optLbl}>{opt}</Text>
              </Text>
              <TextInput
                style={[s.inp, s.ta, s.sourceArea]} value={formData.sourceText}
                onChangeText={v => upd('sourceText', v)}
                placeholder={(t as Record<string, string | undefined>).aiWebNovelSourceHint ?? screenT.webnovelSourceHint}
                placeholderTextColor="#5A5A70" multiline textAlignVertical="top"
              />

              {/* 추가 스타일 */}
              <Text style={s.lbl}>
                {(t as Record<string, string | undefined>).aiWebNovelStyleLabel ?? screenT.webnovelStyleLabel}
                {' '}<Text style={s.optLbl}>{opt}</Text>
              </Text>
              <TextInput
                style={[s.inp, s.ta]} value={formData.extraStyles}
                onChangeText={v => upd('extraStyles', v)}
                placeholder={(t as Record<string, string | undefined>).aiWebNovelStyleHint ?? screenT.webnovelStyleHint}
                placeholderTextColor="#5A5A70" multiline maxLength={500} textAlignVertical="top"
              />

              {/* 동반자 AI 설명 */}
              <Text style={s.lbl}>
                {(t as Record<string, string | undefined>).aiWebNovelDescLabel ?? screenT.webnovelDescLabel}
                {' '}<Text style={s.optLbl}>{opt}</Text>
              </Text>
              <Text style={s.hint}>
                {(t as Record<string, string | undefined>).aiWebNovelDescHint ?? screenT.webnovelDescHint}
              </Text>
              <TextInput
                style={[s.inp, s.ta]} value={formData.description}
                onChangeText={v => upd('description', v)}
                placeholder={(t as Record<string, string | undefined>).aiWebNovelDescPlaceholder ?? screenT.webnovelDescPlaceholder}
                placeholderTextColor="#5A5A70" multiline maxLength={300} textAlignVertical="top"
              />

            </>
          )}

          {/* ──────────── STEP 2: 붙여넣기 ──────────── */}
          {step === 'paste' && (
            <>
              {/* 버튼 그룹 */}
              <View style={s.btnGroup}>
                <PressableOpacity style={s.whiteGhostBtnFull} onPress={copyPromptAgain}>
                  <Text style={s.whiteGhostTxt}>
                    {(t as Record<string, string | undefined>).aiWebNovelCopyPromptAgain ?? screenT.copyPromptAgain}
                  </Text>
                </PressableOpacity>

                <PressableOpacity style={s.secBtn} onPress={pasteFromClipboard}>
                  <View style={s.btnRow}>
                    <ClipboardPaste size={14} color="#C8C8D4" style={s.btnIcon} />
                    <Text style={s.secBtnTxt}>
                      {(t as Record<string, string | undefined>).aiWebNovelPasteFromClip ?? screenT.pasteFromClipboard}
                    </Text>
                  </View>
                </PressableOpacity>

                <View style={s.ghostBtnRow}>
                  <PressableOpacity style={s.whiteGhostBtnFlex} onPress={() => setStep('form')}>
                    <View style={s.btnRow}>
                      <ArrowLeft size={14} color="#FFF" style={s.btnIcon} />
                      <Text style={s.whiteGhostTxt}>
                        {(t as Record<string, string | undefined>).aiWebNovelEditAgain ?? screenT.editAgainBtn}
                      </Text>
                    </View>
                  </PressableOpacity>
                  <PressableOpacity style={s.whiteGhostBtnFlex} onPress={() => setPastedText('')}>
                    <View style={s.btnRow}>
                      <X size={14} color="#AAA" style={s.btnIcon} />
                      <Text style={s.whiteGhostTxt}>{t?.aiWebNovelClear ?? screenT.clearText}</Text>
                    </View>
                  </PressableOpacity>
                </View>
              </View>

              {/* 입력 영역 */}
              <TextInput
                style={[s.inp, s.pasteArea]}
                value={pastedText}
                onChangeText={setPastedText}
                placeholder={t?.aiWebNovelPasteTitle ?? screenT.pasteTranslationResult}
                placeholderTextColor="#5A5A70"
                multiline
                textAlignVertical="top"
              />

            </>
          )}
        </KeyboardAwareScrollView>

        {/* 하단 고정 버튼 영역 */}
        {step === 'form' && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={[s.fixedBtnContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <PressableOpacity style={s.mainBtn} onPress={generatePrompt}>
              <Text style={s.mainBtnTxt}>
                {(t as Record<string, string | undefined>).aiWebNovelGeneratePrompt ?? screenT.copyPromptBtn}
              </Text>
            </PressableOpacity>
          </Animated.View>
        )}

        {step === 'paste' && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={[s.fixedBtnContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <PressableOpacity
              style={[
                s.mainBtn,
                (!pastedText.trim() || isSaving) && s.disabled,
                s.saveBtnGold,
              ]}
              onPress={handleSave}
              disabled={!pastedText.trim() || isSaving}
            >
              {isSaving ? (
                <Text style={s.mainBtnTxtBlack}>{t?.aiWebNovelSaving ?? screenT.webnovelSaving}</Text>
              ) : (
                <Text style={s.mainBtnTxtBlack}>
                  {t?.aiWebNovelSave ?? screenT.webnovelSave}
                </Text>
              )}
            </PressableOpacity>
          </Animated.View>
        )}
      </View>

      <ConfirmModal
        visible={showCancelModal}
        icon="alert-circle-outline"
        iconColor="#F59E0B"
        title={(t as Record<string, string | undefined>).aiWebNovelCancelTitle}
        message={(t as Record<string, string | undefined>).aiWebNovelCancelMsg}
        onRequestClose={() => setShowCancelModal(false)}
        actions={[
          { label: t?.aiWebNovelCancelConfirm ?? screenT.cancel, variant: 'danger',   onPress: confirmBack },
          { label: t?.aiWebNovelCancelStay ?? screenT.keepGoing, variant: 'default', onPress: () => setShowCancelModal(false) },
        ]}
      />
    </>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex1: { flex: 1 },
  safe:  { flex: 1, backgroundColor: '#050507' },
  scroll:{ flex: 1 },
  body:  { padding: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'transparent' },
  backBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 19, backgroundColor: '#0C0C14', marginRight: 12,
    borderWidth: 1, borderColor: '#1A1A24' },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  stepDots: { flexDirection: 'row', gap: 5 },
  dot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#181820' },
  dotOn: { backgroundColor: '#D4A853', width: 14 },

  lbl: {
    fontSize: 13, fontFamily: Typography.fontFamily.semibold,
    color: '#8A8A9E', marginBottom: 7, marginTop: 18 },
  lblNoMargin: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#8A8A9E' },
  optLbl: { fontSize: 11, color: '#757585', fontFamily: Typography.fontFamily.regular },
  hint:   { fontSize: 11, color: '#757585', marginTop: 3, marginBottom: 6, fontFamily: Typography.fontFamily.regular },
  hintNoMargin: { fontSize: 11, color: '#757585', marginTop: 0, marginBottom: 8, fontFamily: Typography.fontFamily.regular },

  inp: {
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 14, minHeight: 48,
    color: '#F0F0F5', fontSize: 14, borderWidth: 1, borderColor: '#1A1A24',
    marginBottom: 6, fontFamily: Typography.fontFamily.regular },
  inpMarginTop: {
    marginTop: 6,
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 14, minHeight: 48,
    color: '#F0F0F5', fontSize: 14, borderWidth: 1, borderColor: '#1A1A24',
    fontFamily: Typography.fontFamily.regular },
  inpAge: {
    flex: 1, minWidth: 60,
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 14,
    color: '#F0F0F5', fontSize: 14, borderWidth: 1, borderColor: '#1A1A24',
    marginBottom: 6, fontFamily: Typography.fontFamily.regular },
  ta:         { minHeight: 72, textAlignVertical: 'top' as const },
  numInp:     { width: 120, textAlign: 'center' as const },
  sourceArea: { minHeight: 140 },
  pasteArea:  { minHeight: 220 },

  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24' },
  chipOn:    { backgroundColor: 'rgba(212,168,83,0.14)', borderColor: 'rgba(212,168,83,0.30)' },
  chipTxt:   { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  chipTxtOn: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },

  charBox: {
    backgroundColor: '#0E0E14', borderRadius: Radius.md, padding: 12,
    marginTop: 6, gap: 4, borderWidth: 1, borderColor: '#1A1A24' },
  charLbl: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#797990', marginBottom: 3 },
  charRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },

  genderRow:    { flexDirection: 'row', gap: 6, flex: 1.5, minWidth: 160 },
  genderBtn: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: '#1A1A24', backgroundColor: '#0C0C14',
    justifyContent: 'center' as const, alignItems: 'center' as const },
  genderBtnSmall:  { paddingHorizontal: 0 },
  genderBtnOn:     { borderColor: 'rgba(212,168,83,0.50)', backgroundColor: 'rgba(212,168,83,0.14)' },
  genderBtnTxt:    { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  genderBtnTxtOn:  { color: '#D4A853', fontFamily: Typography.fontFamily.bold },

  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 18, marginBottom: 7 },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#1A1A24', overflow: 'hidden' },
  stepBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14141E' },
  stepBtnDis: { opacity: 0.3 },
  stepBtnTxt: { color: '#F0F0F5', fontSize: 18, fontFamily: Typography.fontFamily.bold },
  stepValBox: { width: 40, alignItems: 'center', justifyContent: 'center' },
  stepValTxt: { color: '#D4A853', fontSize: 15, fontFamily: Typography.fontFamily.bold },

  mainBtn: {
    backgroundColor: '#D4A853', borderRadius: Radius.lg, padding: 15,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8 },
  mainBtnTxt:      { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  mainBtnTxtBlack: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  saveBtnGold:     { backgroundColor: '#D4A853' },
  disabled:        { opacity: 0.4 },
  fixedBtnContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#050507',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1A1A24',
  },
  btnRow:          { flexDirection: 'row', alignItems: 'center' },
  btnIcon:         { marginRight: 6 },
  btnGroup:        { gap: 12, marginVertical: 16 },
  ghostBtnRow:     { flexDirection: 'row', gap: 8 },
  whiteGhostBtnFull: {
    alignItems: 'center', justifyContent: 'center',
    padding: 12,
    borderRadius: Radius.md, borderWidth: 1, borderColor: '#181820' },
  whiteGhostBtnFlex: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 12, marginTop: 4,
    borderRadius: Radius.md, borderWidth: 1, borderColor: '#181820' },
  whiteGhostTxt: { fontSize: 13, color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },

  secBtn: {
    backgroundColor: '#0C0C14', borderRadius: Radius.lg, padding: 13,
    alignItems: 'center' as const, borderWidth: 1, borderColor: '#1A1A24' },
  secBtnTxt: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#C8C8D4' },

  // 시리즈 카드
  seriesCard: {
    backgroundColor: '#101018', borderRadius: Radius.lg, padding: 18,
    marginBottom: 24, borderWidth: 1, borderColor: '#1E1E2A' },
  seriesRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seriesTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  seriesLabel:   { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  seriesHint:    { fontSize: 12, fontFamily: Typography.fontFamily.regular, color: '#8A8A9E', maxWidth: '75%' },
  countInputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countUnit:     { color: '#8A8A9E', fontSize: 13, fontFamily: Typography.fontFamily.medium },
  seriesInp: {
    backgroundColor: '#050507', borderRadius: Radius.sm, borderWidth: 1, borderColor: '#2A2A3A',
    paddingHorizontal: 12, paddingVertical: 8, color: '#D4A853',
    fontSize: 16, fontFamily: Typography.fontFamily.bold,
    width: 60, textAlign: 'center' },
  seriesInputs:  { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1A1A24' },
  currentEpRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentEpMiniLbl: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#757585' },
  currentEpBadge: {
    backgroundColor: 'rgba(212,168,83,0.12)', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: Radius.full },
  currentEpBadgeTxt: { color: '#D4A853', fontSize: 13, fontFamily: Typography.fontFamily.bold },

  // 직전 화 감정 미리보기
  prevEmoCard: {
    marginTop: 12, backgroundColor: 'rgba(212,168,83,0.04)',
    borderRadius: Radius.md, padding: 12,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.12)' },
  prevEmoTitle: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853', marginBottom: 2 },
  prevEmoHint:  { fontSize: 11, color: '#555570', marginBottom: 8 },
  prevEmoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prevEmoChip:  {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: '#0C0C18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#1E1E2E' },
  prevEmoChipLabel: { fontSize: 10, color: '#555570', fontFamily: Typography.fontFamily.medium },
  prevEmoChipVal:   { fontSize: 11, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
});
