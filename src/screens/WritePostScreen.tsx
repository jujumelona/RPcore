/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/WritePostScreen.tsx
// ✅ 완전 업그레이드: Reanimated + 프리미엄 스타일

import React, { startTransition, useDeferredValue, useMemo, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { Radius, Typography } from '../constants/tokens';
import { ToastService } from '../components/Toast';
import { useLanguageStore } from '../store/languageStore';
import { authedFetch } from '../utils/authedFetch';
import { RefreshCw, X, Tag, AlignLeft, FileText, ChevronLeft } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import type { ScreenProps } from '../types/navigation';
import Animated, {
  FadeInUp, FadeIn,
  ZoomIn, ZoomOut
  } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';

import { SERVER_BASE } from '../config/ApiConfig';
import { getScreenTranslations } from '../i18n/SCREENS-TRANSLATION';

const API_URL = SERVER_BASE;

export function WritePostScreen({ route, navigation }: ScreenProps<'WritePost'>) {
  const params = route.params ?? {};
  const { boardType, lang: paramLang, editPostId, initialTitle, initialContent } = params as {
    boardType?: 'free' | 'webnovel';
    lang?: string;
    editPostId?: string;
    initialTitle?: string;
    initialContent?: string;
  };
  const isEditMode = !!editPostId;

  const { t, isRTL, lang } = useLanguageStore(useShallow(s => ({ t: s.t, isRTL: s.isRTL, lang: s.appLanguage })));  // ✅ [FIX] s.lang -> s.appLanguage
  // 커뮤니티에서 선택한 언어가 있으면 그걸 쓰고, 없으면 앱 언어 사용
  const postLang = paramLang ?? lang;
  const screenT = useMemo(() => getScreenTranslations(postLang as any), [postLang]);
  // const jwtToken = useAuthStore(s => s.user?.jwtToken || ''); // removed: unused
  // ✅ [BUG-15 FIX] 글 작성/수정 후 커뮤니티 목록 즉시 무효화
  const queryClient = useQueryClient();

  const [title,        setTitle]        = useState(initialTitle ?? '');
  const [content,      setContent]      = useState(initialContent ?? '');
  const [novelContent, setNovelContent] = useState('');
  const [tags,         setTags]         = useState<string[]>([]);
  const [tagInput,     setTagInput]     = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const deferredTitle = useDeferredValue(title);
  const deferredContent = useDeferredValue(content);
  const deferredNovelContent = useDeferredValue(novelContent);
  const deferredTags = useDeferredValue(tags);

  const isWebNovel = boardType === 'webnovel';
  const canSubmit = useMemo(() => {
    if (!deferredTitle.trim() || !deferredContent.trim()) return false;
    if (isWebNovel && !isEditMode && !deferredNovelContent.trim()) return false;
    return true;
  }, [deferredContent, deferredNovelContent, deferredTitle, isEditMode, isWebNovel]);

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && tags.length < 5 && !tags.includes(trimmed)) {
      startTransition(() => {
        setTags([...tags, trimmed]);
      });
      setTagInput('');
    }
  };

  const removeTag = (index: number) => {
    startTransition(() => {
      setTags(tags.filter((_, i) => i !== index));
    });
  };

  const handleSubmit = async () => {
    if (!title.trim())   { ToastService.error(t?.titleRequired   ?? screenT.enterTitle); return; }
    if (!content.trim()) { ToastService.error(t?.contentRequired ?? screenT.enterContent); return; }
    if (isWebNovel && !novelContent.trim() && !isEditMode) {
      ToastService.error(t?.novelContentRequired ?? screenT.enterWebNovelContent);
      return;
    }

    setSubmitting(true);
    try {
      const url    = isEditMode
        ? `${API_URL}/community/posts/${editPostId}`
        : `${API_URL}/community/posts`;
      const method = isEditMode ? 'PATCH' : 'POST';

      const response = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_type: boardType,
          lang: postLang,
          title:         title.trim(),
          content:       content.trim(),
          novel_content: isWebNovel && !isEditMode ? novelContent.trim() : undefined,
          tags
  })
  });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        ToastService.error(body.error ?? t?.errorOccurred ?? screenT.errorOccurred);
        return;
      }
      const data = await response.json();
      if (data.success) {
        ToastService.success(isEditMode ? (t?.postUpdated ?? screenT.postUpdated) : (t?.postCreated ?? screenT.postCreated));
        // ✅ [BUG-15 FIX] 커뮤니티 목록 즉시 무효화 — staleTime(60s) 내에도 새글 반영
        // 기존: goBack()만 -> CommunityScreen이 캐시 사용, 새 글이 60초 동안 안 보임
        queryClient.invalidateQueries({ queryKey: ['community-posts'] });
        navigation.goBack();
      } else {
        ToastService.error(data.error ?? t?.errorOccurred ?? screenT.errorOccurred);
      }
    } catch (error) {
      console.error('Failed to create post:', error);
      ToastService.error(t?.errorOccurred ?? screenT.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const charCountTitle   = deferredTitle.length;
  const charCountContent = deferredContent.length;

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} translucent={false} />

      {/* 헤더 */}
      <Animated.View entering={FadeInUp.springify()} style={[s.header, isRTL && s.rtl]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerIconBtn}>
          <ChevronLeft size={22} color={'#F0F0F5'} />
        </TouchableOpacity>

        <Text style={s.headerTitle}>
          {isEditMode
            ? (t?.editPost ?? screenT.editPost)
            : isWebNovel ? (t?.writeWebNovel ?? screenT.writeWebNovel) : (t?.writePost ?? t?.write ?? screenT.writePost)}
        </Text>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
        >
          {submitting
            ? <RefreshCw size={16} color={'#050507'} />
            : <Text style={s.submitTxt}>{t?.post ?? t?.share ?? screenT.postAction}</Text>
          }
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 제목 */}
        <Animated.View entering={FadeInUp.delay(80).springify()} style={[s.inputCard, focusedInput === 'title' && s.inputCardFocused]}>
          <Text style={s.inputLabel}>{t?.title ?? screenT.title}</Text>
          <TextInput
            style={s.titleInput}
            placeholder={t?.titlePlaceholder ?? t?.titleRequired ?? screenT.enterTitle}
            placeholderTextColor={'#757585'}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            onFocus={() => setFocusedInput('title')}
            onBlur={() => setFocusedInput(null)}
          />
          <Text style={s.charCount}>{charCountTitle}/200</Text>
        </Animated.View>

        {/* 태그 */}
        <Animated.View entering={FadeInUp.delay(140).springify()} style={s.tagSection}>
          <View style={s.tagLabelRow}>
            <Tag size={13} color={'#797990'} />
            <Text style={s.inputLabel}>{t?.tagsMax5 ?? t?.tags ?? screenT.tagsMax5}</Text>
          </View>
          <View style={[s.tagInputRow, isRTL && s.rtl]}>
            <TextInput
              style={[s.tagInput, focusedInput === 'tag' && s.tagInputFocused]}
              placeholder={t?.addTag ?? screenT.addTag}
              placeholderTextColor={'#757585'}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
              maxLength={20}
              onFocus={() => setFocusedInput('tag')}
              onBlur={() => setFocusedInput(null)}
            />
            <TouchableOpacity
              style={[s.addTagBtn, tags.length >= 5 && s.addTagBtnDisabled]}
              onPress={addTag}
              disabled={tags.length >= 5}
            >
              <Text style={s.addTagTxt}>{t?.editorCharAdd ?? screenT.addAction}</Text>
            </TouchableOpacity>
          </View>

          {deferredTags.length > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={s.tagList}>
              {deferredTags.map((tag, index) => (
                <Animated.View
                  key={`${tag}-${index}`}
                  entering={ZoomIn.delay(index * 40).springify()}
                  exiting={ZoomOut.duration(150)}
                  style={s.tagChip}
                >
                  <Text style={s.tagChipText}>#{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(index)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <X size={12} color={'#D4A853'} />
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </Animated.View>

        {/* 소개 / 내용 */}
        <Animated.View entering={FadeInUp.delay(200).springify()} style={[s.inputCard, focusedInput === 'content' && s.inputCardFocused]}>
          <View style={s.inputLabelRow}>
            <AlignLeft size={13} color={'#797990'} />
            <Text style={s.inputLabel}>
              {isWebNovel ? (t?.novelIntro ?? screenT.novelIntro) : (t?.contentPlaceholder ?? screenT.content)}
            </Text>
          </View>
          <TextInput
            style={s.contentInput}
            placeholder={isWebNovel ? (t?.novelIntro ?? screenT.novelIntro) : (t?.contentPlaceholder ?? t?.contentRequired ?? screenT.enterContent)}
            placeholderTextColor={'#757585'}
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={10000}
            textAlignVertical="top"
            onFocus={() => setFocusedInput('content')}
            onBlur={() => setFocusedInput(null)}
          />
          <Text style={s.charCount}>{charCountContent}/10000</Text>
        </Animated.View>

        {/* 웹소설 본문 */}
        {isWebNovel && (
          <Animated.View entering={FadeInUp.delay(260).springify()} style={[s.inputCard, focusedInput === 'novel' && s.inputCardFocused]}>
            <View style={s.inputLabelRow}>
              <FileText size={13} color={'#797990'} />
              <Text style={s.inputLabel}>{t?.novelContent ?? screenT.novelContent}</Text>
            </View>
            <TextInput
              style={[s.contentInput, s.novelInput]}
              placeholder={t?.novelContentPlaceholder ?? screenT.enterWebNovelContent}
              placeholderTextColor={'#757585'}
              value={novelContent}
              onChangeText={setNovelContent}
              multiline
              maxLength={100000}
              textAlignVertical="top"
              onFocus={() => setFocusedInput('novel')}
              onBlur={() => setFocusedInput(null)}
            />
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#050507' },
  rtl:          { flexDirection: 'row-reverse' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 56,
    borderBottomWidth: 1, borderBottomColor: '#1A1A24',
    backgroundColor: '#050507'
  },
  headerIconBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, backgroundColor: '#0C0C14'
  },
  headerTitle: { fontSize: 17, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', letterSpacing: -0.2 },
  submitBtn: { elevation: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#D4A853', borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', minWidth: 52
  },
  submitBtnDisabled: { backgroundColor: '#181820', opacity: 0.6 },
  submitTxt:  { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#050507' },

  scroll:       { flex: 1 },
  scrollContent:{ padding: 16, gap: 12, paddingBottom: 40 },

  // 카드
  inputCard: {
    backgroundColor: '#0C0C14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#1A1A24', padding: 14, gap: 8
  },
  inputCardFocused: { borderColor: 'rgba(212,168,83,0.30)' },
  inputLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inputLabel: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#797990', textTransform: 'uppercase', letterSpacing: 0.5 },
  titleInput: {
    fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5',
    paddingVertical: 4, paddingHorizontal: 0
  },
  charCount: { fontSize: 11, color: '#757585', fontFamily: Typography.fontFamily.regular, textAlign: 'right' },
  contentInput: {
    fontSize: 15, fontFamily: Typography.fontFamily.regular, color: '#F0F0F5',
    minHeight: 140, lineHeight: 24, paddingVertical: 4, textAlignVertical: 'top'
  },
  novelInput: { minHeight: 300 },

  // 태그
  tagSection:  { gap: 10 },
  tagLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagInput: {
    flex: 1, height: 44, fontSize: 14, color: '#F0F0F5',
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 14, borderWidth: 1, borderColor: '#1A1A24',
    fontFamily: Typography.fontFamily.regular
  },
  tagInputFocused: { borderColor: 'rgba(212,168,83,0.30)' },
  addTagBtn: {
    paddingHorizontal: 14, height: 44, backgroundColor: 'rgba(212,168,83,0.14)',
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)'
  },
  addTagBtnDisabled: { opacity: 0.4 },
  addTagTxt: { fontSize: 13, color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  tagList:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(212,168,83,0.07)', borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)',
    paddingLeft: 10, paddingRight: 8, paddingVertical: 5, gap: 5
  },
  tagChipText: { fontSize: 12, color: '#E8C070', fontFamily: Typography.fontFamily.medium }
  });
