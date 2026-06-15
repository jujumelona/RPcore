import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Typography } from '../../../constants/tokens';
import { ToastService } from '../../../components/Toast';
import { useLanguageStore } from '../../../store/languageStore';
import type { ChapterDraft } from '../types/StoryEditorLegacyTypes';
import { TranslationPasteModal } from './TranslationPasteModal';
import { buildAllChaptersPrompt, parseAllChaptersPaste } from '../utils/StoryEditorTranslationUtils';

interface ChapterRangeTranslateProps {
  chapters: ChapterDraft[];
  chapterMultiLangData: Record<string, Record<string, any>>;
  onApply: (result: Record<string, Record<string, any>>) => void;
}

export function ChapterRangeTranslate({
  chapters,
  chapterMultiLangData,
  onApply,
}: ChapterRangeTranslateProps) {
  const t = useLanguageStore(state => state.t);
  const [fromInput, setFromInput] = useState('1');
  const [toInput, setToInput] = useState(String(Math.min(chapters.length, 10)));
  const [modalVisible, setModalVisible] = useState(false);

  const fromIdx = Math.max(0, (parseInt(fromInput, 10) || 1) - 1);
  const toIdx = Math.min(chapters.length - 1, (parseInt(toInput, 10) || chapters.length) - 1);
  const rangeCount = Math.max(0, toIdx - fromIdx + 1);

  const recognizedInRange = useMemo(
    () =>
      chapters
        .slice(fromIdx, toIdx + 1)
        .filter(chapter => Boolean(chapterMultiLangData[chapter.id])).length,
    [chapterMultiLangData, chapters, fromIdx, toIdx],
  );

  return (
    <View style={[styles.translateCard, styles.translateCardDashed]}>
      <View style={styles.flex1}>
        <Text style={styles.translateCardTitle}>{t?.multiLangTitle ?? ''}</Text>
        <Text style={styles.translateCardDesc}>
          {`${recognizedInRange} / ${rangeCount} ${t?.multiLangTranslated ?? ''}`}
        </Text>

        <View style={styles.rangeRow}>
          <TextInput
            style={styles.rangeInput}
            value={fromInput}
            onChangeText={setFromInput}
            keyboardType="number-pad"
            placeholder={t?.start ?? ''}
            placeholderTextColor="#757585"
            maxLength={4}
          />
          <Text style={styles.grayText}>~</Text>
          <TextInput
            style={styles.rangeInput}
            value={toInput}
            onChangeText={setToInput}
            keyboardType="number-pad"
            placeholder={(t as Record<string, string | undefined>)?.end ?? t?.start ?? ''}
            placeholderTextColor="#757585"
            maxLength={4}
          />
          <Text style={styles.grayText}>
            {`(${rangeCount} ${(t as Record<string, string | undefined>)?.multiLangChapters ?? ''})`}
          </Text>
        </View>

        <View style={styles.rangeRow}>
          <TouchableOpacity style={styles.rangeTranslateBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.actionText}>{t?.multiLangTranslate ?? t?.generate ?? ''}</Text>
          </TouchableOpacity>
          <Text style={styles.smallGrayText}>{`${recognizedInRange}/${rangeCount}`}</Text>
        </View>
      </View>

      <TranslationPasteModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${t?.multiLangTranslate ?? ''} ${(t as Record<string, string | undefined>)?.editorChapterNum ?? t?.chapterListLabel ?? ''} ${fromIdx + 1}~${toIdx + 1}`}
        doneCount={recognizedInRange}
        buildPromptFn={languages => buildAllChaptersPrompt(chapters, languages, fromIdx, toIdx)}
        parseFn={text => parseAllChaptersPaste(text, chapters.slice(fromIdx, toIdx + 1), 0)}
        onConfirm={text => {
          const result = parseAllChaptersPaste(text, chapters.slice(fromIdx, toIdx + 1), 0);
          if (Object.keys(result).length === 0) {
            ToastService.info((t as Record<string, string | undefined>)?.translateFormatError ?? t?.error ?? '');
            return;
          }

          onApply(result);
          setModalVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  translateCard: {
    backgroundColor: '#111118',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  translateCardDashed: {
    borderStyle: 'dashed',
    marginTop: 4,
  },
  flex1: {
    flex: 1,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  grayText: {
    color: '#797990',
    fontSize: 14,
  },
  smallGrayText: {
    fontSize: 11,
    color: '#757585',
    marginTop: 5,
  },
  actionText: {
    fontSize: 12,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.bold,
  },
  translateCardTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    marginBottom: 4,
  },
  translateCardDesc: {
    fontSize: 12,
    color: '#8A8A9E',
  },
  rangeInput: {
    backgroundColor: '#0C0C14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C38',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 48,
    color: '#F0F0F5',
    fontSize: 14,
    width: 60,
    textAlign: 'center',
  },
  rangeTranslateBtn: {
    backgroundColor: 'rgba(212,168,83,0.10)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.30)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 12,
  },
});
