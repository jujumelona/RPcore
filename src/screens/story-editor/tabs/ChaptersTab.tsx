import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, Edit3, Plus, Sparkles, Trash2 } from 'lucide-react-native';

import { ConfirmModal } from '../../../components/ConfirmModal';
import { KeyboardAwareWrapper } from '../../../components/KeyboardAwareWrapper';
import { ToastService } from '../../../components/Toast';
import { PremiumHeroCard } from '../../../components/ui/PremiumHeroCard';
import { Radius, Space, Typography as Typo } from '../../../constants/tokens';
import llamaEngine from '../../../core/llama/LlamaEngine';
import { useTranslation } from '../../../hooks/useTranslation';
import { makeA11yProps } from '../../../utils/a11yProps';
import type { ChapterDraft, CharacterDraft } from '../types/StoryEditorTypes';

interface ChaptersTabProps {
  chapters: ChapterDraft[];
  characters: CharacterDraft[];
  onAddChapter: () => void;
  onUpdateChapter: (index: number, chapter: ChapterDraft) => void;
  onDeleteChapter: (index: number) => void;
  onMoveChapter: (fromIndex: number, toIndex: number) => void;
}

const ChapterItemSeparator = () => <View style={styles.separator} />;

export const ChaptersTab = React.memo<ChaptersTabProps>(function ChaptersTab({
  chapters,
  characters,
  onAddChapter,
  onUpdateChapter,
  onDeleteChapter,
  onMoveChapter,
}) {
  const t = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; index: number }>({
    visible: false,
    index: -1,
  });

  const editableCharacters = useMemo(
    () => characters.filter(character => character.id > 1),
    [characters],
  );

  const handleChapterUpdate = (index: number, field: keyof ChapterDraft, value: unknown) => {
    onUpdateChapter(index, { ...chapters[index], [field]: value });
  };

  const handleCharacterGoalUpdate = (index: number, characterId: number, goal: string) => {
    const chapter = chapters[index];
    onUpdateChapter(index, {
      ...chapter,
      characterGoals: {
        ...(chapter.characterGoals ?? {}),
        [characterId]: goal,
      },
    });
  };

  const handleAIGenerate = async (index: number, field: 'aiGoal' | 'chapterInfo') => {
    setIsGenerating(true);

    try {
      if (llamaEngine.getState() !== 'ready') {
        ToastService.info(t?.modelNotReady ?? '');
        return;
      }

      const chapter = chapters[index];
      const characterNames = editableCharacters.map(character => character.name).filter(Boolean).join(', ');
      const prompt =
        field === 'aiGoal'
          ? [
              'Write a short chapter objective for the current story chapter.',
              `Title: ${chapter.title || ''}`,
              `Characters: ${characterNames}`,
              `Chapter info: ${chapter.chapterInfo || ''}`,
            ].join('\n')
          : [
              'Write short chapter notes for the current story chapter.',
              `Title: ${chapter.title || ''}`,
              `Characters: ${characterNames}`,
              `Previous summary: ${chapter.prevSummary || ''}`,
            ].join('\n');

      const generated = (await llamaEngine.generateRaw(prompt, 150))?.trim();
      if (!generated) {
        ToastService.error(t?.aiChapterFailed ?? '');
        return;
      }

      handleChapterUpdate(index, field, generated);
      ToastService.success(t?.aiChapterDraftDone ?? t?.aiDraftGenerated ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not ready') || message.includes('model')) {
        ToastService.info(t?.modelNotReady ?? '');
      } else {
        ToastService.error(t?.aiChapterFailed ?? '');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const renderChapter = ({ item, index }: { item: ChapterDraft; index: number }) => {
    const isEditing = editingIndex === index;
    const canMoveUp = index > 0;
    const canMoveDown = index < chapters.length - 1;

    return (
      <View style={styles.chapterCard}>
        <View style={styles.chapterHeader}>
          <View style={styles.chapterInfo}>
            <View style={styles.chapterNumber}>
              <Text style={styles.chapterNumberText}>{index + 1}</Text>
            </View>

            <View style={styles.chapterDetails}>
              <TextInput
                style={styles.chapterTitle}
                value={item.title}
                onChangeText={value => handleChapterUpdate(index, 'title', value)}
                placeholder={t?.phChapterName ?? ''}
                placeholderTextColor="#94A3B8"
                {...makeA11yProps({
                  label: `${t?.editorChapterNum ?? t?.chapterListLabel ?? ''} ${index + 1}`,
                  role: 'text',
                })}
              />
              <Text style={styles.chapterId}>{String(item.id)}</Text>
            </View>
          </View>

          <View style={styles.chapterActions}>
            <View style={styles.moveButtons}>
              <TouchableOpacity
                style={[styles.moveButton, !canMoveUp && styles.moveButtonDisabled]}
                onPress={() => onMoveChapter(index, index - 1)}
                disabled={!canMoveUp}
              >
                <ChevronUp size={16} color={canMoveUp ? '#475569' : '#CBD5E1'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.moveButton, !canMoveDown && styles.moveButtonDisabled]}
                onPress={() => onMoveChapter(index, index + 1)}
                disabled={!canMoveDown}
              >
                <ChevronDown size={16} color={canMoveDown ? '#475569' : '#CBD5E1'} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setEditingIndex(isEditing ? null : index)}
              {...makeA11yProps({ label: t?.editorSectionChapters ?? '', role: 'button' })}
            >
              <Edit3 size={16} color="#475569" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => setDeleteModal({ visible: true, index })}
              {...makeA11yProps({ label: t?.deleteChapter ?? '', role: 'button' })}
            >
              <Trash2 size={16} color="#B91C1C" />
            </TouchableOpacity>
          </View>
        </View>

        {isEditing ? (
          <View style={styles.chapterForm}>
            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formLabel}>{t?.editorChapterAiGoal ?? ''}</Text>
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={() => handleAIGenerate(index, 'aiGoal')}
                  disabled={isGenerating}
                >
                  <Sparkles size={14} color="#A16207" />
                  <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={item.aiGoal}
                onChangeText={value => handleChapterUpdate(index, 'aiGoal', value)}
                placeholder={t?.phAiGoal ?? ''}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formLabel}>{t?.editorChapterInfo ?? ''}</Text>
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={() => handleAIGenerate(index, 'chapterInfo')}
                  disabled={isGenerating}
                >
                  <Sparkles size={14} color="#A16207" />
                  <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={item.chapterInfo}
                onChangeText={value => handleChapterUpdate(index, 'chapterInfo', value)}
                placeholder={t?.phChapterInfo ?? ''}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {index > 0 ? (
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>{t?.editorPrevSummary ?? ''}</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={item.prevSummary}
                  onChangeText={value => handleChapterUpdate(index, 'prevSummary', value)}
                  placeholder={t?.phPrevSummary ?? ''}
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            ) : null}

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t?.chapterGoal ?? ''}</Text>

              {editableCharacters.length === 0 ? (
                <Text style={styles.emptyHint}>{t?.noCharForGoals ?? ''}</Text>
              ) : (
                editableCharacters.map(character => (
                  <View key={character.id} style={styles.characterGoalSection}>
                    <Text style={styles.characterGoalLabel}>{character.name || t?.noName || ''}</Text>
                    <TextInput
                      style={[styles.textInput, styles.characterGoalInput]}
                      value={item.characterGoals?.[character.id] || ''}
                      onChangeText={value => handleCharacterGoalUpdate(index, character.id, value)}
                      placeholder={`${character.name || t?.character || ''} ${t?.chapterGoal ?? ''}`}
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                  </View>
                ))
              )}
            </View>

            <View style={styles.formSection}>
              <View style={styles.switchContainer}>
                <Text style={styles.formLabel}>{t?.endingChapter ?? ''}</Text>
                <TouchableOpacity
                  style={[styles.switch, item.isEnding && styles.switchActive]}
                  onPress={() => handleChapterUpdate(index, 'isEnding', !item.isEnding)}
                  {...makeA11yProps({
                    label: t?.endingChapter ?? '',
                    role: 'switch',
                    state: { checked: Boolean(item.isEnding) },
                  })}
                >
                  <View style={[styles.switchThumb, item.isEnding && styles.switchThumbActive]} />
                </TouchableOpacity>
              </View>
              {item.isEnding ? <Text style={styles.noticeText}>{t?.endingChapterNotice ?? ''}</Text> : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <KeyboardAwareWrapper style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <PremiumHeroCard
          style={styles.heroCard}
          title={t?.editorSectionChapters ?? ''}
          subtitle={t?.editorSectionChaptersHint ?? ''}
          eyebrow={t?.editorSectionChapters ?? ''}
          pills={[
            `${t?.chapterListLabel ?? ''} ${chapters.length}`,
            `${t?.editorSectionCharacters ?? t?.character ?? ''} ${editableCharacters.length}`,
          ]}
        />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{`${t?.chapterListLabel ?? ''} (${chapters.length})`}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={onAddChapter}
              {...makeA11yProps({ label: t?.addChapter ?? t?.add ?? '', role: 'button' })}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>{t?.addChapter ?? t?.add ?? ''}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listContent}>
            {chapters.map((item, index) => (
              <React.Fragment key={item.id}>
                {renderChapter({ item, index })}
                {index < chapters.length - 1 ? <ChapterItemSeparator /> : null}
              </React.Fragment>
            ))}
          </View>
        </View>
      </KeyboardAwareWrapper>

      <ConfirmModal
        visible={deleteModal.visible}
        icon="trash-outline"
        iconColor="#FF5555"
        title={t?.deleteChapter ?? ''}
        message={t?.deleteChapterConfirm ?? ''}
        onRequestClose={() => setDeleteModal({ visible: false, index: -1 })}
        actions={[
          {
            label: t?.delete ?? '',
            variant: 'danger',
            onPress: () => {
              onDeleteChapter(deleteModal.index);
              setDeleteModal({ visible: false, index: -1 });
            },
          },
          {
            label: t?.cancel ?? '',
            variant: 'default',
            onPress: () => setDeleteModal({ visible: false, index: -1 }),
          },
        ]}
      />
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  heroCard: {
    marginHorizontal: Space['4'],
    marginTop: Space['4'],
    marginBottom: Space['2'],
  },
  content: {
    flex: 1,
    paddingHorizontal: Space['4'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space['3'],
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.bold,
  },
  addButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    backgroundColor: '#F0F0F5',
  },
  addButtonText: {
    fontSize: Typo.size.sm,
    color: '#0E0E14',
    fontFamily: Typo.fontFamily.semibold,
  },
  listContent: {
    paddingBottom: Space['6'],
  },
  separator: {
    height: 12,
  },
  chapterCard: {
    backgroundColor: '#0E0E14',
    borderRadius: Radius.lg,
    padding: Space['4'],
    borderWidth: 1,
    borderColor: '#D6DEEA',
    elevation: 2,
  },
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  chapterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chapterNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A24',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chapterNumberText: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.bold,
  },
  chapterDetails: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
    paddingVertical: 0,
    marginBottom: 4,
  },
  chapterId: {
    fontSize: Typo.size.xs,
    color: '#64748B',
    fontFamily: Typo.fontFamily.regular,
  },
  chapterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moveButtons: {
    gap: 6,
  },
  moveButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: '#0C0C14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveButtonDisabled: {
    opacity: 0.45,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: '#0C0C14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  chapterForm: {
    marginTop: Space['4'],
    paddingTop: Space['4'],
    borderTopWidth: 1,
    borderTopColor: '#1A1A24',
  },
  formSection: {
    marginBottom: Space['4'],
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  formLabel: {
    flex: 1,
    fontSize: Typo.size.md,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.semibold,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: Typo.size.md,
    color: '#F0F0F5',
    backgroundColor: '#0E0E14',
  },
  textArea: {
    minHeight: 88,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  aiButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  aiButtonText: {
    fontSize: Typo.size.xs,
    color: '#92400E',
    fontFamily: Typo.fontFamily.semibold,
  },
  emptyHint: {
    fontSize: Typo.size.sm,
    color: '#64748B',
    fontFamily: Typo.fontFamily.regular,
  },
  characterGoalSection: {
    marginBottom: 12,
  },
  characterGoalLabel: {
    marginBottom: 6,
    fontSize: Typo.size.sm,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
  },
  characterGoalInput: {
    minHeight: 74,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#1A1A24',
    padding: 3,
  },
  switchActive: {
    backgroundColor: '#D4A853',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F0F5',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  noticeText: {
    marginTop: 8,
    fontSize: Typo.size.sm,
    lineHeight: 20,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.regular,
  },
});
