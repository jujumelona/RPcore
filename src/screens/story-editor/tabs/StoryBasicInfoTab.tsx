import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Images, Sparkles, CheckCircle2 } from 'lucide-react-native';

import { Radius, Space, Typography as Typo } from '../../../constants/tokens';
import { makeA11yProps } from '../../../utils/a11yProps';
import { useTranslation } from '../../../hooks/useTranslation';
import { ToastService } from '../../../components/Toast';
import { PremiumHeroCard } from '../../../components/ui/PremiumHeroCard';
import { KeyboardAwareWrapper } from '../../../components/KeyboardAwareWrapper';
import { STORY_EDITOR_GENRE_IDS, getStoryGenreOptions } from '../../../utils/storyGenres';
import type { EditorState, ValidationError, ValidationResult } from '../types/StoryEditorTypes';

interface StoryBasicInfoTabProps {
  state: EditorState;
  onUpdate: (updates: Partial<EditorState>) => void;
  onValidationChange: (result: ValidationResult) => void;
}

function buildValidation(state: EditorState, t: Record<string, string | undefined>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!state.storyTitle.trim()) {
    errors.push({ field: 'storyTitle', message: t?.phStoryTitle ?? '', severity: 'error' });
  }

  if (!state.storyDesc.trim()) {
    errors.push({ field: 'storyDesc', message: t?.phStoryDesc ?? '', severity: 'error' });
  }

  if (!state.storyGenre?.trim()) {
    warnings.push({ field: 'storyGenre', message: t?.storyGenreGuide ?? t?.genre ?? '', severity: 'warning' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export const StoryBasicInfoTab: React.FC<StoryBasicInfoTabProps> = ({
  state,
  onUpdate,
  onValidationChange,
}) => {
  const t = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);

  const validation = useMemo(() => buildValidation(state, t), [state, t]);
  const genreOptions = useMemo(() => getStoryGenreOptions(STORY_EDITOR_GENRE_IDS, t), [t]);

  useEffect(() => {
    onValidationChange(validation);
  }, [validation, onValidationChange]);

  const handleAIGenerate = async (field: 'title' | 'desc' | 'world') => {
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1100));

      if (field === 'title') {
        onUpdate({ storyTitle: state.storyTitle || '', isDirty: true });
      }
      if (field === 'desc') {
        onUpdate({ storyDesc: state.storyDesc || '', isDirty: true });
      }
      if (field === 'world') {
        onUpdate({ worldSetting: state.worldSetting || '', isDirty: true });
      }

      ToastService.success(t?.aiDraftGenerated ?? '');
    } catch {
      ToastService.error(t?.aiGenFailed ?? '');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCoverImagePick = () => {
    ToastService.info(t?.coverImageComingSoon ?? '');
  };

  return (
    <KeyboardAwareWrapper
      style={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.contentContainer}
    >
      <PremiumHeroCard
        style={styles.heroCard}
        title={t?.editorSectionBasic ?? ''}
        subtitle={t?.editorSectionBasicHint ?? ''}
        eyebrow={t?.editorSectionBasic ?? ''}
        pills={[
          validation.isValid ? (t?.requiredDone ?? '') : `${validation.errors.length}`,
          `${validation.warnings.length}`,
        ]}
      />

      <View style={styles.statusRow}>
        {validation.isValid ? (
          <View style={styles.validChip}>
            <CheckCircle2 size={14} color="#D4A853" />
            <Text style={styles.validChipText}>{t?.requiredDone ?? ''}</Text>
          </View>
        ) : (
          <View style={styles.invalidChip}>
            <Text style={styles.invalidChipText}>{`${validation.errors.length}`}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t?.coverImage ?? ''}</Text>
        <TouchableOpacity
          style={styles.coverImageContainer}
          onPress={handleCoverImagePick}
          activeOpacity={0.9}
          {...makeA11yProps({ label: t?.coverImage ?? '', role: 'button' })}
        >
          {state.coverUrls && state.coverUrls.length > 0 ? (
            <Image source={{ uri: state.coverUrls[0] }} style={styles.coverImage} contentFit="cover" />
          ) : (
            <View style={styles.coverImagePlaceholder}>
              <Images size={32} color="#94A3B8" />
              <Text style={styles.coverImagePlaceholderTitle}>{t?.selectCoverImage ?? ''}</Text>
              <Text style={styles.coverImagePlaceholderSub}>{t?.recommendedRatio ?? ''}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t?.storyTitle ?? t?.title ?? ''}</Text>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => handleAIGenerate('title')}
            disabled={isGenerating}
            {...makeA11yProps({ label: t?.storyTitle ?? t?.title ?? '', role: 'button', disabled: isGenerating })}
          >
            <Sparkles size={16} color="#A16207" />
            <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.textInput, !state.storyTitle.trim() && styles.inputRequired]}
          value={state.storyTitle}
          onChangeText={text => onUpdate({ storyTitle: text, isDirty: true })}
          placeholder={t?.phStoryTitle ?? ''}
          placeholderTextColor="#94A3B8"
          maxLength={100}
          accessibilityLabel={t?.phStoryTitle ?? ''}
        />
        <Text style={styles.charCount}>{state.storyTitle.length}/100</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t?.storyIntro ?? t?.description ?? ''}</Text>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => handleAIGenerate('desc')}
            disabled={isGenerating}
            {...makeA11yProps({ label: t?.storyIntro ?? t?.description ?? '', role: 'button', disabled: isGenerating })}
          >
            <Sparkles size={16} color="#A16207" />
            <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.textInput, styles.textArea, !state.storyDesc.trim() && styles.inputRequired]}
          value={state.storyDesc}
          onChangeText={text => onUpdate({ storyDesc: text, isDirty: true })}
          placeholder={t?.phStoryDesc ?? ''}
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          accessibilityLabel={t?.phStoryDesc ?? ''}
        />
        <Text style={styles.charCount}>{state.storyDesc.length}/500</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t?.genre ?? ''}</Text>
        <View style={styles.genreWrap}>
          {genreOptions.map(option => {
            const selected = state.storyGenre === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.genreChip, selected && styles.genreChipSelected]}
                onPress={() => onUpdate({ storyGenre: option.id, isDirty: true })}
                {...makeA11yProps({ label: option.label, role: 'button', state: { selected } })}
              >
                <Text style={[styles.genreChipText, selected && styles.genreChipTextSelected]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t?.editorHashtag ?? ''}</Text>
        <TextInput
          style={styles.textInput}
          value={state.storyHashtag}
          onChangeText={text => onUpdate({ storyHashtag: text, isDirty: true })}
          placeholder={t?.phStoryHashtag ?? ''}
          placeholderTextColor="#94A3B8"
          maxLength={120}
          accessibilityLabel={t?.phStoryHashtag ?? ''}
        />
        <Text style={styles.charCount}>{state.storyHashtag.length}/120</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t?.worldSetting ?? ''}</Text>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => handleAIGenerate('world')}
            disabled={isGenerating}
            {...makeA11yProps({ label: t?.worldSetting ?? '', role: 'button', disabled: isGenerating })}
          >
            <Sparkles size={16} color="#A16207" />
            <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.textInput, styles.worldTextArea]}
          value={state.worldSetting}
          onChangeText={text => onUpdate({ worldSetting: text, isDirty: true })}
          placeholder={t?.phWorldSetting ?? ''}
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={6}
          maxLength={1200}
          textAlignVertical="top"
          accessibilityLabel={t?.phWorldSetting ?? ''}
        />
        <Text style={styles.charCount}>{state.worldSetting.length}/1200</Text>
      </View>
    </KeyboardAwareWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  contentContainer: {
    paddingBottom: Space['8'],
  },
  heroCard: {
    marginHorizontal: Space['4'],
    marginTop: Space['4'],
    marginBottom: Space['2'],
  },
  statusRow: {
    marginHorizontal: Space['4'],
    marginBottom: Space['3'],
  },
  validChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.4)',
  },
  validChipText: {
    color: '#D4A853',
    fontSize: Typo.size.sm,
    fontFamily: Typo.fontFamily.semibold,
  },
  invalidChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.35)',
  },
  invalidChipText: {
    color: '#F87171',
    fontSize: Typo.size.sm,
    fontFamily: Typo.fontFamily.semibold,
  },
  section: {
    marginHorizontal: Space['4'],
    marginBottom: Space['5'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  sectionTitle: {
    fontSize: Typo.size.md,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
    marginBottom: 8,
  },
  coverImageContainer: {
    minHeight: 220,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#0E0E14',
  },
  coverImage: {
    width: '100%',
    height: 260,
  },
  coverImagePlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  coverImagePlaceholderTitle: {
    color: '#F0F0F5',
    fontSize: Typo.size.md,
    fontFamily: Typo.fontFamily.semibold,
    textAlign: 'center',
  },
  coverImagePlaceholderSub: {
    color: '#8A8A9E',
    fontSize: Typo.size.sm,
    fontFamily: Typo.fontFamily.regular,
    textAlign: 'center',
  },
  aiButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
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
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: Typo.size.md,
    color: '#F0F0F5',
    backgroundColor: '#0E0E14',
  },
  inputRequired: {
    borderColor: '#DC2626',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  worldTextArea: {
    minHeight: 160,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  charCount: {
    marginTop: 6,
    textAlign: 'right',
    color: '#8A8A9E',
    fontSize: Typo.size.xs,
    fontFamily: Typo.fontFamily.regular,
  },
  genreWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#0E0E14',
  },
  genreChipSelected: {
    borderColor: '#D4A853',
    backgroundColor: 'rgba(212,168,83,0.14)',
  },
  genreChipText: {
    color: '#C8C8D4',
    fontSize: Typo.size.sm,
    fontFamily: Typo.fontFamily.medium,
  },
  genreChipTextSelected: {
    color: '#D4A853',
  },
});