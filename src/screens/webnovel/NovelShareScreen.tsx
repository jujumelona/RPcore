/* eslint-disable @typescript-eslint/no-unused-vars */
import llamaEngine from '../../core/llama/LlamaEngine';
// src/screens/NovelShareScreen.tsx
// i18n ?곸슜 ?꾨즺

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Modal,
  KeyboardAvoidingView, BackHandler } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import { ToastService } from '../../components/Toast';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming,
  interpolate } from 'react-native-reanimated';
import { SkeletonBox } from '../../components/Skeleton';
import { NovelShareData } from '../../types/navigation';
import { SERVER_BASE } from '../../config/ApiConfig';
import { db } from '../../core/sqlite/Database';
import { chapterSummarizer } from '../../utils/ChapterSummarizer';
import { embeddingEngine } from '../../core/llama/EmbeddingEngine';
import { useLanguageStore } from '../../store/languageStore';
import { useAuthStore } from '../../store/authStore';
import { ArrowRight, CheckCircle, RefreshCw, X , ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Radius, Typography } from '../../constants/tokens';
import { ConfirmModal } from '../../components/ConfirmModal';

interface SummarizedChapter {
  chapterId: string;
  chapterTitle: string;
  content: string;
  done: boolean;
  error?: boolean;
}

function buildNovelPrompt(chapterTitle: string, chatLog: string): string {
  return [
    '<start_of_turn>user',
    'You are a Korean webnovel author. Rewrite the chat log below in literary prose.',
    '',
    '[Rules]',
    '- 1st-person or 3rd-person literary prose style',
    '- Dialogue uses quotation marks: "..."',
    '- Describe emotions and actions vividly',
    '- Paragraph format only (no lists or numbering)',
    '- Do not use meta expressions ("chapter", "message")',
    '',
    `[Chapter: ${chapterTitle}]`,
    chatLog,
    '<end_of_turn>',
    '<start_of_turn>model',
    '',
  ].join('\n');
}

/**
 * ChapterSummarizer MMR ?꾪꽣濡??듭떖 ??붾쭔 異붿텧
 * ?꾨쿋??誘몄?鍮????먮낯 ?꾩껜 諛섑솚
 */
async function filterKeyLines(
  convs: Array<{ speaker_type: string; content: string }>,
  chapterHint: string,
): Promise<string> {
  const messages = convs.map(m => ({
    speaker: m.speaker_type === 'user' ? '1' : m.speaker_type === 'narrator' ? '0' : '2',
    content: m.content }));

  if (!embeddingEngine.isReady() || messages.length <= 10) {
    // ?꾨쿋???녾굅??吏㏃쑝硫?洹몃깷 ?꾩껜 ?ъ슜
    return convs
      .map(m => `[${m.speaker_type === 'user' ? 'Me' : m.speaker_type === 'narrator' ? 'Narrator' : 'Character'}]: ${m.content}`)
      .join('\n');
  }

  try {
    const result = await chapterSummarizer.summarize(
      messages,
      async () => '',
      0,
      chapterHint,
    );

    if (result.filteredCount === 0) throw new Error('empty filter');

    return convs
      .filter(m => {
        const c = m.content.replace(/@\d+:[^\n]+/g, '').trim();
        return c.length > 15; // 理쒖냼?쒖쓽 ?꾪꽣
      })
      .slice(-20) // 理쒓렐 20以?湲곗? (?꾪꽣 ??
      .map(m => `[${m.speaker_type === 'user' ? 'Me' : m.speaker_type === 'narrator' ? 'Narrator' : 'Character'}]: ${m.content}`)
      .join('\n');
  } catch {
    return convs
      .map(m => `[${m.speaker_type === 'user' ? 'Me' : m.speaker_type === 'narrator' ? 'Narrator' : 'Character'}]: ${m.content}`)
      .join('\n');
  }
}

export function NovelShareScreen({ route, navigation }: { route: any; navigation: any }) {
  const novelData = (route.params as { novelData?: NovelShareData } | undefined)?.novelData;
  const { t, isRTL } = useLanguageStore(useShallow(s => ({ t: s.t, isRTL: s.isRTL })));
  const invalidMsg = t?.invalidAccess ?? t?.errorOccurred ?? t?.error ?? '';
  const errorMessage = (t?.errorSubtitle ?? t?.errorOccurred ?? t?.error ?? '').replace('\n', ' ');
  const shareSuccessMessage = t?.shareSuccess ?? t?.share ?? '';
  const missingParamRef = useRef(false);
  const isMountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const clearElapsedTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const safeGoBack = useCallback(() => {
    cancelledRef.current = true;
    clearElapsedTimer();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [clearElapsedTimer, navigation]);

  const storyId = novelData?.storyId ?? '';
  const novelTags = novelData?.tags ?? [];

  const [phase, setPhase] = useState<'loading' | 'preview' | 'sharing'>('loading');
  const [summaries, setSummaries] = useState<SummarizedChapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [editTitle, setEditTitle] = useState(novelData?.title ?? '');
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const progressAnim = useSharedValue(0);

  const progressAnimStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progressAnim.value, [0, 1], [0, 100])}%` }));
  useEffect(() => {
    isMountedRef.current = true;
    cancelledRef.current = false;
    return () => {
      isMountedRef.current = false;
      cancelledRef.current = true;
      clearElapsedTimer();
      llamaEngine.stopGeneration().catch(() => {});
    };
  }, [clearElapsedTimer]);

  useEffect(() => {
    const handleBackPress = () => {
      if (phase === 'loading') {
        setShowCancelModal(true);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => { subscription.remove(); };
  }, [phase]);

  useEffect(() => {
    if (novelData || missingParamRef.current) return;
    missingParamRef.current = true;
    ToastService.error(invalidMsg);
    safeGoBack();
  }, [novelData, invalidMsg, safeGoBack]);

  const loadAndSummarize = useCallback(async () => {
    if (!storyId) {
      ToastService.error(invalidMsg);
      safeGoBack();
      return;
    }
    try {
      const chapterIds = await db.getChaptersByStory(storyId);

      if (!chapterIds.length) {
        ToastService.error(t?.noChats);
        safeGoBack();
        return;
      }

      if (cancelledRef.current || !isMountedRef.current) return;

      setTotalChapters(chapterIds.length);
      setEstimatedSeconds(chapterIds.length * 30);

      startTimeRef.current = Date.now();
      clearElapsedTimer();
      timerRef.current = setInterval(() => {
        if (cancelledRef.current || !isMountedRef.current) return;
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      const initSummaries: SummarizedChapter[] = chapterIds.map((chId: any) => ({
        chapterId: chId, chapterTitle: chId, content: '', done: false }));
      setSummaries(initSummaries);

      const results: SummarizedChapter[] = [...initSummaries];
      const CONCURRENCY = 2;
      let nextIndex = 0;
      const total = chapterIds.length;

      const worker = async () => {
        while (true) { // eslint-disable-line no-constant-condition
          const i = nextIndex++;
          if (i >= total) break;
          // [BUG FIX] ?몃쭏?댄듃 ??猷⑦봽 利됱떆 ?덉텧
          if (cancelledRef.current || !isMountedRef.current) break;

          setCurrentChapterIdx(i);
          progressAnim.value = withTiming(i / total, { duration: 400 });

          try {
            const convs = await db.getConversationsByChapter(storyId, chapterIds[i]);
            const chapText = await filterKeyLines(convs, chapterIds[i]);
            const novelPrompt = buildNovelPrompt(chapterIds[i], chapText);
            if (cancelledRef.current || !isMountedRef.current) break;
            if (llamaEngine.getState() !== 'ready') {
              results[i] = { ...results[i], content: t?.modelNotReady ?? '', done: true };
              continue;
            }
            const novelContent: string = await llamaEngine.generateRaw(novelPrompt, 1500);
            if (cancelledRef.current || !isMountedRef.current) break;
            results[i] = { ...results[i], content: novelContent, done: true };
          } catch {
            results[i] = { ...results[i], content: `(${t?.errorTitle})`, done: true, error: true };
          } finally {
            if (!cancelledRef.current && isMountedRef.current) setSummaries([...results]);
          }
        }
      };

      const workerCount = Math.min(CONCURRENCY, chapterIds.length);
      const workers = Array.from({ length: workerCount }, () => worker());
      await Promise.all(workers);

      clearElapsedTimer();
      if (cancelledRef.current || !isMountedRef.current) return;
      progressAnim.value = withTiming(1, { duration: 400 });
      setPhase('preview');
    } catch {
      clearElapsedTimer();
      if (cancelledRef.current || !isMountedRef.current) return;
      ToastService.error(t?.errorSubtitle.replace('\n', ' ') || 'Error');
      safeGoBack();
    }
  }, [storyId, t, progressAnim, invalidMsg, safeGoBack, clearElapsedTimer]);

  useEffect(() => {
    if (!novelData) return;
    if (novelData.chapters && novelData.chapters.length > 0) {
      const prebuilt: SummarizedChapter[] = novelData.chapters.map((ch: any) => ({
        chapterId: ch.chapterTitle,
        chapterTitle: ch.chapterTitle,
        content: ch.content,
        done: true }));
      setSummaries(prebuilt);
      setPhase('preview');
    } else {
      loadAndSummarize();
    }
  }, [loadAndSummarize, novelData]);

  // [MEMORY LEAK FIX] ?몃쭏?댄듃 ??setInterval ?뺣━
  useEffect(() => {
    return () => {
      clearElapsedTimer();
    };
  }, [clearElapsedTimer]);

  const handleShare = async () => {
    if (!editTitle.trim()) { ToastService.warning(t?.editNovelTitle); return; }
    setIsSharing(true);

    const fullContent = summaries.map(s =>
      `[${s.chapterTitle}]\n\n${s.content}`
    ).join('\n\n???????????????\n\n');

    try {
      const token = useAuthStore.getState().user?.jwtToken ?? '';
      const { useLanguageStore: _ls } = await import('../../store/languageStore');
      const _lang = _ls.getState().appLanguage || 'en';
      const shareRes = await fetch(`${SERVER_BASE}/community/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          board_type: 'webnovel',
          lang: _lang,
          title: editTitle, content: fullContent.slice(0, 10000),
          novel_content: fullContent,
          novelPreview: summaries[0]?.content?.slice(0, 150) + '...',
          tags: novelTags || [], storyId: storyId }) });

      // ??[BUG FIX] ?쒕쾭 ?묐떟 誘명솗??-> ?ㅻ쪟 ?쒖뿉??"Share complete!" ?쒖떆
      if (!shareRes.ok) {
        const errBody = await shareRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `Server error ${shareRes.status}`);
      }

      if (!isMountedRef.current) return;
      setIsSharing(false);
      setShowShareModal(false);
      ToastService.success(shareSuccessMessage);
    } catch {
      if (!isMountedRef.current) return;
      setIsSharing(false);
      ToastService.error(t?.errorSubtitle.replace('\n', ' ') || 'Error');
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);

  if (!novelData) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={'#050507'} />
        <View style={s.guard}>
          <Text style={s.guardText}>{invalidMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={'#050507'} />
        <View style={[s.header, isRTL && s.rowReverse, s.headerNoBorder]}>
          <TouchableOpacity onPress={() => setShowCancelModal(true)} style={s.backBtn}>
            <ArrowLeft size={20} color='#E8E8F0' strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <View style={s.loadingContainer}>
          <View style={s.loadingCircle}>
            <SkeletonBox w={64} h={64} style={s.skeletonCircle} />
            <Text style={s.loadingPct}>
              {totalChapters > 0 ? Math.round((currentChapterIdx / totalChapters) * 100) : 0}%
            </Text>
          </View>

          <Text style={s.loadingTitle}>{t?.convertingNovel}</Text>
          <Text style={s.loadingChapter}>
            {t?.convertingChapter} {currentChapterIdx + 1} {t?.chapterOf} {totalChapters}
          </Text>

          <View style={s.progressBg}>
            <Animated.View style={[s.progressFill, progressAnimStyle]} />
          </View>

          <View style={s.timeRow}>
            <Text style={s.timeText}>{formatTime(elapsedSeconds)}</Text>
            <Text style={s.timeDot}>  쨌  </Text>
            <Text style={s.timeText}>
              {remainingSeconds > 0 ? `${t?.estimatedTime}: ${formatTime(remainingSeconds)}` : '...'}
            </Text>
          </View>

          <KeyboardAvoidingView behavior={'height'} style={{ flex: 1 }}>
            <ScrollView style={s.chapterProgressList} showsVerticalScrollIndicator={false}>
              {summaries.map((sum, i) => (
                <View key={sum.chapterId} style={s.chapterProgressItem}>
                  <View style={[
                    s.chapterProgressDot,
                    sum.done && !sum.error && s.chapterProgressDotDone,
                    sum.error && s.chapterProgressDotError,
                    i === currentChapterIdx && !sum.done && s.chapterProgressDotActive,
                  ]} />
                  <Text style={[s.chapterProgressText, sum.done && s.chapterProgressTextDone]}>
                    {sum.chapterTitle}
                  </Text>
                  {sum.done && !sum.error && <CheckCircle size={14} color="#7C3AED" style={s.iconMarginLeft} />}
                  {i === currentChapterIdx && !sum.done && (
                    <RefreshCw size={14} color={'#8A8A9E'} style={s.iconMarginLeft} />
                  )}
                  {sum.error && <Text style={s.errorIcon}>!</Text>}
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>

        <ConfirmModal
          visible={showCancelModal}
          icon="alert-circle-outline"
          iconColor="#F59E0B"
          title={(t as Record<string, string | undefined>).aiWebNovelCancelTitle ?? ''}
          message={(t as Record<string, string | undefined>).aiWebNovelCancelMsg ?? ''}
          onRequestClose={() => setShowCancelModal(false)}
          actions={[
            { label: (t as Record<string, string | undefined>).aiWebNovelCancelConfirm ?? '', variant: 'danger', onPress: () => { setShowCancelModal(false); safeGoBack(); } },
            { label: (t as Record<string, string | undefined>).aiWebNovelCancelStay ?? '', variant: 'default', onPress: () => setShowCancelModal(false) },
          ]}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />
      <View style={[s.header, isRTL && s.rowReverse]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={20} color='#E8E8F0' strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t?.novelPreview}</Text>
        <TouchableOpacity style={s.shareHeaderBtn} onPress={() => setShowShareModal(true)}>
          <Text style={s.shareHeaderText}>{t?.share}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scrollFlex} contentContainerStyle={s.previewContent}>
        <Text style={[s.novelTitle, isRTL && s.textRight]}>{editTitle || novelData.title}</Text>
        {novelTags.length > 0 && (
          <View style={s.tagRow}>
            {novelTags.map((tag: any) => (
              <View key={tag} style={s.tag}>
                <Text style={s.tagText}>{tag.startsWith('#') ? tag : `#${tag}`}</Text>
              </View>
            ))}
          </View>
        )}

        {summaries.map((ch) => (
          <View key={ch.chapterId} style={s.chapterBlock}>
            <View style={s.chapterDivider}>
              <View style={s.dividerLine} />
              <Text style={s.chapterLabel}>{ch.chapterTitle}</Text>
              <View style={s.dividerLine} />
            </View>
            <Text style={[s.novelContent, isRTL && s.textRight]}>{ch.content}</Text>
          </View>
        ))}
        <View style={s.spacer80} />
      </ScrollView>

      <View style={s.bottomBar}>
        <TouchableOpacity style={s.shareBtn} onPress={() => setShowShareModal(true)}>
          <Text style={s.shareBtnText}>{t?.sharePost}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showShareModal} transparent animationType="slide" onRequestClose={() => setShowShareModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={[s.modalHeader, isRTL && s.rowReverse]}>
              <Text style={s.modalTitle}>{t?.novelShare}</Text>
              <TouchableOpacity onPress={() => setShowShareModal(false)}>
                <X size={22} color={'#8A8A9E'} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalLabel, isRTL && s.textRight]}>{t?.editNovelTitle}</Text>
            <TextInput
              style={[s.titleInput, isRTL && s.textRight]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t?.title}
              placeholderTextColor={'#757585'}
              maxLength={60}
            />

            <Text style={[s.modalLabel, isRTL && s.textRight]}>{t?.tags}</Text>
            <View style={s.modalTagRow}>
              {novelTags.map((tag: any) => (
                <View key={tag} style={s.tag}>
                  <Text style={s.tagText}>{tag.startsWith('#') ? tag : `#${tag}`}</Text>
                </View>
              ))}
            </View>

            <View style={s.modalInfo}>
              <Text style={[s.modalInfoText, isRTL && s.textRight]}>
                {summaries.length} {t?.chapter} 쨌 {t?.share}
              </Text>
              <Text style={[s.modalInfoSub, isRTL && s.textRight]}>{t?.postToCommunity}</Text>
            </View>

            <TouchableOpacity
              style={[s.confirmBtn, isSharing && s.confirmBtnDisabled]}
              onPress={handleShare}
              disabled={isSharing}
            >
              {isSharing ? (
                <RefreshCw size={20} color='#050507' />
              ) : (
                <View style={s.confirmBtnRow}>
                  <Text style={s.confirmBtnText}>{t?.postToCommunity}</Text>
                  <ArrowRight size={16} color='#050507' />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 50, borderBottomWidth: 0.5, borderBottomColor: '#0E0E14' },
  headerNoBorder: { borderBottomWidth: 0 },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backText: { fontSize: 22, color: '#F0F0F5' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  shareHeaderBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#8B5CF6', borderRadius: 8 },
  shareHeaderText: { fontSize: 14, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#08080C', borderWidth: 2, borderColor: '#181820', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  loadingPct: { position: 'absolute', bottom: 10, fontSize: 11, color: '#797990', fontFamily: Typography.fontFamily.semibold },
  loadingTitle: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 6 },
  loadingChapter: { fontSize: 13, color: '#797990', marginBottom: 20 },
  progressBg: { width: '100%', height: 4, backgroundColor: '#0E0E14', borderRadius: 2, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', backgroundColor: '#8B5CF6', borderRadius: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  timeText: { fontSize: 12, color: '#797990' },
  timeDot: { fontSize: 12, color: '#2C2C38' },
  chapterProgressList: { width: '100%', maxHeight: 200 },
  chapterProgressItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  chapterProgressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2C2C38' },
  chapterProgressDotDone: { backgroundColor: '#8B5CF6' },
  chapterProgressDotError: { backgroundColor: '#FF5555' },
  chapterProgressDotActive: { backgroundColor: '#8A8A9E' },
  chapterProgressText: { flex: 1, fontSize: 13, color: '#797990' },
  chapterProgressTextDone: { color: '#F0F0F5' },
  checkIcon: { fontSize: 14, color: '#8B5CF6', fontFamily: Typography.fontFamily.bold },
  errorIcon: { fontSize: 14, color: '#FF5555', fontFamily: Typography.fontFamily.bold },
  previewContent: { padding: 20 },
  novelTitle: { fontSize: 22, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', marginBottom: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  tag: { backgroundColor: '#0E0E14', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 12, color: '#8A8A9E' },
  chapterBlock: { marginBottom: 24 },
  chapterDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: '#181820' },
  chapterLabel: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.semibold },
  novelContent: { fontSize: 15, color: '#C8C8D4', lineHeight: 26 },
  bottomBar: { padding: 16, borderTopWidth: 0.5, borderTopColor: '#0E0E14' },
  shareBtn: { backgroundColor: '#8B5CF6', borderRadius: Radius.lg, paddingVertical: 16, alignItems: 'center', overflow: 'hidden' },
  shareBtnText: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#0C0C14', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: '#181820' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  modalClose: { fontSize: 20, color: '#797990' },
  modalLabel: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.semibold, marginBottom: 8 },
  titleInput: { backgroundColor: '#0E0E14', borderRadius: 10, padding: 14, fontSize: 15, color: '#F0F0F5', marginBottom: 16 },
  modalTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  modalInfo: { backgroundColor: '#0E0E14', borderRadius: 10, padding: 14, marginBottom: 20 },
  modalInfoText: { fontSize: 14, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', marginBottom: 4 },
  modalInfoSub: { fontSize: 12, color: '#797990' },
  confirmBtn: { backgroundColor: '#D4A853', borderRadius: Radius.lg, paddingVertical: 16, alignItems: 'center', overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  skeletonCircle: { borderRadius: 32 },
  iconMarginLeft: { marginLeft: 4 },
  scrollFlex: { flex: 1 },
  spacer80: { height: 80 },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  guardText: { color: '#F0F0F5', fontSize: 14, textAlign: 'center' } });


