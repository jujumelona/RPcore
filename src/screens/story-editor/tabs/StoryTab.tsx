import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, XCircle } from 'lucide-react-native';

import { KeyboardAwareWrapper } from '../../../components/KeyboardAwareWrapper';
import { Radius, Space, Typography as Typo } from '../../../constants/tokens';
import { SectionTitle, FieldRow } from '../components/StoryEditorUIComponents';
import type { TranslationFunction } from '../types/StoryEditorLegacyTypes';
import { pickImages } from '../utils/StoryEditorImageUtils';

type TranslationItem = {
  title: string;
  description: string;
  hashtags: string;
};

interface StoryTabProps {
  t: TranslationFunction;
  storyTitle: string;
  setStoryTitle: (v: string) => void;
  storyDesc: string;
  setStoryDesc: (v: string) => void;
  storyHashtag: string;
  setStoryHashtag: (v: string) => void;
  storeCoverUris: string[];
  setStoreCoverUris: (v: string[] | ((prev: string[]) => string[])) => void;
  coverPreviewIdx: number;
  setCoverPreviewIdx: (v: number | ((prev: number) => number)) => void;
  multiLangTranslations: Record<string, TranslationItem>;
  setMultiLangTranslations: (v: Record<string, TranslationItem>) => void;
  multiLangExpanded: boolean;
  setMultiLangExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  storyTranslateModalVisible: boolean;
  setStoryTranslateModalVisible: (v: boolean) => void;
  ToastService: any;
}

export function StoryTab({
  t,
  storyTitle,
  setStoryTitle,
  storyDesc,
  setStoryDesc,
  storyHashtag,
  setStoryHashtag,
  storeCoverUris,
  setStoreCoverUris,
  coverPreviewIdx,
  setCoverPreviewIdx,
  multiLangTranslations: _multiLangTranslations,
  setMultiLangTranslations: _setMultiLangTranslations,
  multiLangExpanded: _multiLangExpanded,
  setMultiLangExpanded: _setMultiLangExpanded,
  storyTranslateModalVisible: _storyTranslateModalVisible,
  setStoryTranslateModalVisible: _setStoryTranslateModalVisible,
  ToastService,
}: StoryTabProps): React.JSX.Element {
  const tr = (...keys: string[]): string => {
    for (const key of keys) {
      const value = t?.[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
  };

  const showInfo = (message: string) => {
    if (typeof ToastService?.info === 'function') {
      ToastService.info(message);
    }
  };

  const handleAddCover = async () => {
    const remaining = Math.max(0, 3 - storeCoverUris.length);
    if (remaining === 0) {
      showInfo(tr('guideStoreCover', 'editorCoverImage', 'coverImage'));
      return;
    }

    const translator = (key: string) => tr(key);
    const picked = await pickImages(translator, remaining);
    if (!picked?.length) return;

    setStoreCoverUris(prev => {
      const next = [...prev, ...picked].slice(0, 3);
      setCoverPreviewIdx(prev.length > 0 ? prev.length : 0);
      return next;
    });
  };

  const handleRemoveCover = (index: number) => {
    setStoreCoverUris(prev => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      setCoverPreviewIdx(current => {
        if (next.length === 0) return 0;
        if (current > index) return current - 1;
        return Math.min(current, next.length - 1);
      });
      return next;
    });
  };

  return (
    <KeyboardAwareWrapper style={styles.tabContent} extraBottomPadding={100}>
      <SectionTitle title={tr('editorSectionBasic')} />

      <FieldRow label={tr('storyTitle', 'title')} guideKey="storyTitle" t={t}>
        <TextInput
          style={styles.input}
          value={storyTitle}
          onChangeText={setStoryTitle}
          placeholder={tr('phStoryTitle')}
          placeholderTextColor="#64748B"
          maxLength={100}
        />
        <Text style={styles.counter}>{storyTitle.length}/100</Text>
      </FieldRow>

      <FieldRow label={tr('storyIntro', 'description')} guideKey="storyDesc" t={t}>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={storyDesc}
          onChangeText={setStoryDesc}
          multiline
          numberOfLines={4}
          placeholder={tr('phStoryDesc')}
          placeholderTextColor="#64748B"
          textAlignVertical="top"
          maxLength={500}
        />
        <Text style={styles.counter}>{storyDesc.length}/500</Text>
      </FieldRow>

      <FieldRow label={tr('editorHashtag')} guideKey="storyHashtag" t={t}>
        <TextInput
          style={styles.input}
          value={storyHashtag}
          onChangeText={setStoryHashtag}
          placeholder={tr('phStoryHashtag')}
          placeholderTextColor="#64748B"
          maxLength={120}
        />
        <Text style={styles.counter}>{storyHashtag.length}/120</Text>
      </FieldRow>

      <FieldRow label={tr('editorCoverImage', 'coverImage')} guideKey="storeCover" t={t}>
        <View style={styles.coverPickerWrap}>
          {storeCoverUris.length > 0 ? (
            <View style={styles.coverPicker}>
              <Image
                source={{ uri: storeCoverUris[Math.min(coverPreviewIdx, storeCoverUris.length - 1)] }}
                style={styles.coverPreview}
                contentFit="cover"
              />

              {coverPreviewIdx > 0 ? (
                <TouchableOpacity
                  style={[styles.coverNavBtn, styles.coverNavLeft]}
                  onPress={() => setCoverPreviewIdx(prev => prev - 1)}
                >
                  <ChevronLeft size={20} color="#F8FAFC" />
                </TouchableOpacity>
              ) : null}

              {coverPreviewIdx < storeCoverUris.length - 1 ? (
                <TouchableOpacity
                  style={[styles.coverNavBtn, styles.coverNavRight]}
                  onPress={() => setCoverPreviewIdx(prev => prev + 1)}
                >
                  <ChevronRight size={20} color="#F8FAFC" />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.imgDeleteBtn} onPress={() => handleRemoveCover(coverPreviewIdx)}>
                <XCircle size={18} color="#F8FAFC" />
              </TouchableOpacity>

              {storeCoverUris.length > 1 ? (
                <View style={styles.coverDots}>
                  {storeCoverUris.map((_, index) => (
                    <View key={index} style={[styles.coverDot, index === coverPreviewIdx && styles.coverDotOn]} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity style={styles.coverPicker} activeOpacity={0.9} onPress={handleAddCover}>
              <Text style={styles.coverPickerText}>{tr('selectCoverImage')}</Text>
              <Text style={styles.coverPickerSub}>{tr('recommendedRatio')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </FieldRow>
    </KeyboardAwareWrapper>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    paddingHorizontal: Space['4'],
    paddingVertical: Space['3'],
    gap: 6,
  },
  input: {
    backgroundColor: '#0E0E14',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#F0F0F5',
    fontSize: Typo.size.md,
    fontFamily: Typo.fontFamily.regular,
  },
  inputMulti: {
    minHeight: 110,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  counter: {
    marginTop: 6,
    textAlign: 'right',
    color: '#64748B',
    fontSize: Typo.size.sm,
    fontFamily: Typo.fontFamily.regular,
  },
  coverPickerWrap: {
    marginTop: 2,
  },
  coverPicker: {
    minHeight: 220,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0E0E14',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  coverPreview: {
    width: '100%',
    height: 320,
  },
  coverPickerText: {
    textAlign: 'center',
    color: '#F0F0F5',
    fontSize: Typo.size.base,
    fontFamily: Typo.fontFamily.semibold,
  },
  coverPickerSub: {
    marginTop: 8,
    textAlign: 'center',
    color: '#8A8A9E',
    fontSize: Typo.size.sm,
    fontFamily: Typo.fontFamily.regular,
  },
  coverNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverNavLeft: {
    left: 12,
  },
  coverNavRight: {
    right: 12,
  },
  imgDeleteBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverDots: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    gap: 8,
  },
  coverDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  coverDotOn: {
    backgroundColor: '#F8FAFC',
  },
});
