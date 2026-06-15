import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { AlertCircle, Check, CheckCircle2, Download, Languages, Upload } from 'lucide-react-native';

import { ConfirmModal } from '../../../components/ConfirmModal';
import { ToastService } from '../../../components/Toast';
import { PremiumHeroCard } from '../../../components/ui/PremiumHeroCard';
import { Spinner } from '../../../components/ui/Spinner';
import { Radius, Space, Typography as Typo } from '../../../constants/tokens';
import { useTranslation } from '../../../hooks/useTranslation';
import { LANGUAGE_LIST } from '../../../i18n/languages';
import { makeA11yProps } from '../../../utils/a11yProps';
import { ChapterRangeTranslate } from '../components/ChapterRangeTranslate';
import type { EditorState, TranslationState } from '../types/StoryEditorTypes';

interface TranslateTabProps {
  state: EditorState;
  onUpdate: (updates: Partial<EditorState>) => void;
  onAutoSave?: () => void;
  translation: TranslationState;
}

type LanguageStatus = 'none' | 'partial' | 'complete';

const LanguageItemSeparator = () => <View style={styles.separator} />;

export const TranslateTab: React.FC<TranslateTabProps> = ({
  state,
  onUpdate,
  onAutoSave,
  translation: _translation,
}) => {
  const t = useTranslation();
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [translateConfirmVisible, setTranslateConfirmVisible] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);

  const translatedCount = useMemo(
    () => Object.keys(state.multiLangTranslations || {}).length,
    [state.multiLangTranslations],
  );

  const handleLanguageToggle = (languageCode: string) => {
    setSelectedLanguages(previous =>
      previous.includes(languageCode)
        ? previous.filter(code => code !== languageCode)
        : [...previous, languageCode],
    );
  };

  const handleSelectAll = () => {
    if (selectedLanguages.length === LANGUAGE_LIST.length) {
      setSelectedLanguages([]);
      return;
    }

    setSelectedLanguages(LANGUAGE_LIST.map(language => language.code));
  };

  const getLanguageStatus = (languageCode: string): LanguageStatus => {
    const translated = state.multiLangTranslations?.[languageCode];
    if (!translated) return 'none';

    const hasTitle = Boolean(translated.storyTitle || translated.title);
    const hasDesc = Boolean(translated.storyDesc || translated.description);
    const hasTags = Boolean(translated.hashtags || translated.storyHashtag || translated.tags);

    return hasTitle && hasDesc && hasTags ? 'complete' : 'partial';
  };

  const startTranslation = async () => {
    setIsTranslating(true);
    setTranslationProgress(0);

    let languageNames: Record<string, string> = {};
    try {
      languageNames = JSON.parse(t?.langNames ?? '{}');
    } catch {
      languageNames = {};
    }

    try {
      const total = selectedLanguages.length;
      const nextTranslations = { ...(state.multiLangTranslations || {}) };

      for (let index = 0; index < selectedLanguages.length; index += 1) {
        const languageCode = selectedLanguages[index];
        const languageName = languageNames[languageCode] || languageCode;

        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 500,
              messages: [
                {
                  role: 'user',
                  content: [
                    `Translate the following story metadata into ${languageName}.`,
                    'Return only valid JSON with keys "storyTitle", "storyDesc", and "hashtags".',
                    '',
                    `storyTitle: ${state.storyTitle || ''}`,
                    `storyDesc: ${state.storyDesc || ''}`,
                    `hashtags: ${state.storyHashtag || ''}`,
                  ].join('\n'),
                },
              ],
            }),
          });

          const data = await response.json();
          const text = (data.content as Array<{ type: string; text: string }>)
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('');

          let parsed: { storyTitle?: string; storyDesc?: string; hashtags?: string } = {};
          try {
            parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
          } catch {
            parsed = {};
          }

          nextTranslations[languageCode] = {
            storyTitle: parsed.storyTitle || state.storyTitle || '',
            storyDesc: parsed.storyDesc || state.storyDesc || '',
            hashtags: parsed.hashtags || state.storyHashtag || '',
            updatedAt: Date.now(),
          };
        } catch {
          nextTranslations[languageCode] = {
            storyTitle: state.storyTitle || '',
            storyDesc: state.storyDesc || '',
            hashtags: state.storyHashtag || '',
            updatedAt: Date.now(),
          };
        }

        onUpdate({ multiLangTranslations: { ...nextTranslations }, isDirty: true });
        onAutoSave?.();
        setTranslationProgress(((index + 1) / total) * 100);
      }

      ToastService.success(t?.translateDone ?? '');
    } catch (error) {
      console.error('[TranslateTab] translation failed', error);
      ToastService.error(t?.translateFailed ?? '');
    } finally {
      setIsTranslating(false);
      setTranslationProgress(0);
    }
  };

  const handleStartTranslation = () => {
    if (selectedLanguages.length === 0) {
      ToastService.error(t?.selectLangFirst ?? '');
      return;
    }

    if (!state.storyTitle.trim() || !state.storyDesc.trim()) {
      ToastService.error(t?.fillTitleFirst ?? '');
      return;
    }

    setTranslateConfirmVisible(true);
  };

  const renderLanguage = ({ item }: { item: (typeof LANGUAGE_LIST)[number] }) => {
    const selected = selectedLanguages.includes(item.code);
    const status = getLanguageStatus(item.code);

    return (
      <TouchableOpacity
        style={[styles.languageCard, selected && styles.languageCardSelected]}
        onPress={() => handleLanguageToggle(item.code)}
        activeOpacity={0.9}
        {...makeA11yProps({
          label: item.nativeName,
          role: 'button',
          state: { selected },
        })}
      >
        <View style={styles.languageHeader}>
          <View style={styles.languageInfo}>
            <Text style={styles.languageName}>{item.name}</Text>
            <Text style={styles.languageNative}>{item.nativeName}</Text>
          </View>

          <View style={styles.languageStatus}>
            {selected ? <Check size={16} color="#0F172A" /> : null}
            {!selected && status === 'complete' ? <CheckCircle2 size={20} color="#0F766E" /> : null}
            {!selected && status === 'partial' ? <AlertCircle size={20} color="#B45309" /> : null}
            {!selected && status === 'none' ? <View style={styles.statusPlaceholder} /> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={styles.container}>
        <PremiumHeroCard
          style={styles.heroCard}
          title={t?.editorSectionTranslate ?? ''}
          subtitle={t?.editorSectionTranslateHint ?? ''}
          eyebrow={t?.multiLangTitle ?? t?.editorSectionTranslate ?? ''}
          pills={[`${translatedCount}`, `${selectedLanguages.length}`]}
        />

        <View style={styles.content}>
          <View style={styles.statsSection}>
            <View style={styles.statsCard}>
              <Languages size={22} color="#0F172A" />
              <View style={styles.statsInfo}>
                <Text style={styles.statsNumber}>{translatedCount}</Text>
                <Text style={styles.statsLabel}>{t?.translateDone ?? ''}</Text>
              </View>
            </View>

            <View style={styles.statsCard}>
              <Text style={styles.totalLanguages}>{LANGUAGE_LIST.length}</Text>
              <Text style={styles.statsLabel}>{t?.headerLangLabel ?? t?.languageSettings ?? ''}</Text>
            </View>
          </View>

          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.actionButton} onPress={handleSelectAll}>
              <Text style={styles.actionButtonText}>
                {selectedLanguages.length === LANGUAGE_LIST.length ? (t?.deselectAll ?? '') : (t?.selectAll ?? t?.all ?? '')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.inlineButton]}
              onPress={() => ToastService.info(t?.importComingSoon ?? '')}
            >
              <Upload size={16} color="#334155" />
              <Text style={styles.actionButtonText}>{t?.importBtn ?? ''}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.inlineButton]}
              onPress={() => ToastService.info(t?.exportComingSoon ?? '')}
              disabled={translatedCount === 0}
            >
              <Download size={16} color={translatedCount === 0 ? '#94A3B8' : '#8A8A9E'} />
              <Text style={[styles.actionButtonText, translatedCount === 0 && styles.disabledText]}>{t?.exportBtn ?? ''}</Text>
            </TouchableOpacity>
          </View>

          {isTranslating ? (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Spinner size={18} color="#0F172A" />
                <Text style={styles.progressText}>{t?.translating ?? ''}</Text>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${translationProgress}%` }]} />
              </View>

              <Text style={styles.progressPercent}>{Math.round(translationProgress)}%</Text>
            </View>
          ) : null}

          <View style={styles.languageSection}>
            <Text style={styles.sectionTitle}>{`${t?.headerLangLabel ?? ''}${selectedLanguages.length}/${LANGUAGE_LIST.length}`}</Text>

            <FlashList
              data={LANGUAGE_LIST}
              renderItem={renderLanguage}
              estimatedItemSize={74}
              keyExtractor={item => item.code}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.languageList}
              ItemSeparatorComponent={LanguageItemSeparator}
            />
          </View>

          <View style={styles.footerSection}>
            <TouchableOpacity
              style={[
                styles.translateButton,
                (selectedLanguages.length === 0 || isTranslating) && styles.translateButtonDisabled,
              ]}
              onPress={handleStartTranslation}
              disabled={selectedLanguages.length === 0 || isTranslating}
              {...makeA11yProps({
                label: t?.startTranslate ?? '',
                role: 'button',
                disabled: selectedLanguages.length === 0 || isTranslating,
              })}
            >
              {isTranslating ? <Spinner size={20} color="#FFFFFF" /> : <Languages size={20} color="#FFFFFF" />}
              <Text style={styles.translateButtonText}>{isTranslating ? (t?.translating ?? '') : (t?.startTranslate ?? '')}</Text>
            </TouchableOpacity>
          </View>

          <ChapterRangeTranslate
            chapters={state.chapters || []}
            chapterMultiLangData={state.chapterMultiLangData || {}}
            onApply={result =>
              onUpdate({
                chapterMultiLangData: { ...(state.chapterMultiLangData || {}), ...result },
                isDirty: true,
              })
            }
          />
        </View>
      </View>

      <ConfirmModal
        visible={translateConfirmVisible}
        icon="information-circle-outline"
        iconColor="#D4A853"
        title={t?.startTranslation ?? ''}
        message={(t?.startTranslationConfirm ?? '').replace('{n}', String(selectedLanguages.length))}
        onRequestClose={() => setTranslateConfirmVisible(false)}
        actions={[
          {
            label: t?.start ?? '',
            variant: 'primary',
            onPress: () => {
              setTranslateConfirmVisible(false);
              void startTranslation();
            },
          },
          {
            label: t?.cancel ?? '',
            variant: 'default',
            onPress: () => setTranslateConfirmVisible(false),
          },
        ]}
      />
    </>
  );
};

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
    paddingBottom: Space['6'],
  },
  statsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Space['4'],
  },
  statsCard: {
    flex: 1,
    minHeight: 78,
    borderRadius: Radius.lg,
    backgroundColor: '#F0F0F5',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statsInfo: {
    flex: 1,
  },
  statsNumber: {
    fontSize: Typo.size.lg,
    color: '#0F172A',
    fontFamily: Typo.fontFamily.bold,
  },
  totalLanguages: {
    fontSize: Typo.size.h3,
    color: '#0F172A',
    fontFamily: Typo.fontFamily.bold,
  },
  statsLabel: {
    marginTop: 4,
    fontSize: Typo.size.xs,
    color: '#475569',
    fontFamily: Typo.fontFamily.semibold,
  },
  actionSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Space['4'],
  },
  actionButton: {
    minHeight: 40,
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#0E0E14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  inlineButton: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButtonText: {
    fontSize: Typo.size.sm,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
  },
  disabledText: {
    color: '#94A3B8',
  },
  progressSection: {
    marginBottom: Space['4'],
    borderRadius: Radius.lg,
    backgroundColor: '#F0F0F5',
    padding: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  progressText: {
    fontSize: Typo.size.sm,
    color: '#0F172A',
    fontFamily: Typo.fontFamily.semibold,
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#D6DEEA',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#D4A853',
  },
  progressPercent: {
    marginTop: 8,
    fontSize: Typo.size.xs,
    color: '#475569',
    fontFamily: Typo.fontFamily.semibold,
    textAlign: 'right',
  },
  languageSection: {
    flex: 1,
    minHeight: 360,
  },
  sectionTitle: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.bold,
    marginBottom: 12,
  },
  languageList: {
    paddingBottom: Space['4'],
  },
  separator: {
    height: 10,
  },
  languageCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#0E0E14',
    padding: 14,
  },
  languageCardSelected: {
    backgroundColor: '#F0F0F5',
  },
  languageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
  },
  languageNative: {
    marginTop: 4,
    fontSize: Typo.size.sm,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.regular,
  },
  languageStatus: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPlaceholder: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
  },
  footerSection: {
    marginTop: Space['4'],
    marginBottom: Space['4'],
  },
  translateButton: {
    minHeight: 52,
    borderRadius: Radius.md,
    backgroundColor: '#D4A853',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  translateButtonDisabled: {
    opacity: 0.45,
  },
  translateButtonText: {
    fontSize: Typo.size.base,
    color: '#FFFFFF',
    fontFamily: Typo.fontFamily.bold,
  },
});
