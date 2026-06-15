import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  BookOpen,
  BookText,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Languages,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import { Typography } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';
import { getGuides } from './utils/StoryEditorUtils';
import type { CharacterDraft, ChapterDraft } from './types/StoryEditorTypes';

type TranslationMap = Record<string, string | undefined>;
type StoryEditorTab = 'core' | 'characters' | 'chapters' | 'story' | 'background' | 'world' | 'translate';

interface StoryDraft {
  title?: string;
  description?: string;
  tags?: string[];
  characters?: CharacterDraft[];
  chapters?: ChapterDraft[];
}

interface StoryEditorUIProps {
  story: StoryDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  _hasUnsavedChanges: boolean;
  activeTab: string;
  showTranslationModal: boolean;
  _characters: CharacterDraft[];
  _chapters: ChapterDraft[];
  onBack: () => void;
  onSave: () => void;
  onSwitchTab: (tab: string) => void;
  onUpdateStory: (partial: Partial<StoryDraft>) => void;
  onAddCharacter: (char: CharacterDraft) => void;
  onDeleteCharacter: (id: number) => void;
  onAddChapter: (chap: ChapterDraft) => void;
  onDeleteChapter: (id: string) => void;
  onCloseTranslationModal: () => void;
  _onUpdateCharacter: (char: CharacterDraft) => void;
  _onUpdateChapter: (chap: ChapterDraft) => void;
  _onReorderChapters: (chapters: ChapterDraft[]) => void;
  _onUploadCoverImage: () => void;
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function GuideButton({ guideKey, t }: { guideKey: string; t: TranslationMap }) {
  const [visible, setVisible] = useState(false);
  const guides = getGuides(t);

  return (
    <View>
      <TouchableOpacity style={styles.guideBtn} onPress={() => setVisible(value => !value)}>
        <Text style={styles.guideBtnText}>?</Text>
      </TouchableOpacity>
      {visible ? (
        <TouchableOpacity activeOpacity={1} onPress={() => setVisible(false)} style={styles.guideBalloon}>
          <View style={styles.guideBalloonArrow} />
          <Text style={styles.guideBalloonText}>{guides[guideKey] ?? ''}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function FieldRow({
  label,
  guideKey,
  t,
  children,
}: {
  label: string;
  guideKey: string;
  t: TranslationMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <GuideButton guideKey={guideKey} t={t} />
      </View>
      {children}
    </View>
  );
}

function buildCharacterDraft(): CharacterDraft {
  return {
    id: Date.now(),
    name: '',
    imageUris: [],
    personality: '',
    personalityExample: '',
  };
}

function buildChapterDraft(): ChapterDraft {
  return {
    id: `chap_${Date.now()}`,
    title: '',
    aiGoal: '',
    characterGoals: {},
    prevSummary: '',
    chapterInfo: '',
    triggers: [],
    choiceEvents: [],
  };
}

export function StoryEditorUI({
  story,
  isLoading,
  isSaving,
  activeTab,
  showTranslationModal,
  onBack,
  onSave,
  onSwitchTab,
  onUpdateStory,
  onAddCharacter,
  onDeleteCharacter,
  onAddChapter,
  onDeleteChapter,
  onCloseTranslationModal,
}: StoryEditorUIProps) {
  const t = useLanguageStore(state => (state.t ?? {}) as TranslationMap);

  const tabs = useMemo(
    () => [
      { id: 'core' as const, label: t.editorSectionBasic ?? '', Icon: BookText },
      { id: 'characters' as const, label: t.editorSectionCharacters ?? '', Icon: Users },
      { id: 'chapters' as const, label: t.editorSectionChapters ?? '', Icon: FileText },
      { id: 'story' as const, label: t.editorTabIntro ?? '', Icon: BookOpen },
      { id: 'background' as const, label: t.editorBgLabel ?? '', Icon: ImageIcon },
      { id: 'world' as const, label: t.editorWorldLabel ?? '', Icon: BookText },
      { id: 'translate' as const, label: t.editorSectionTranslate ?? t.translate ?? '', Icon: Languages },
    ],
    [t],
  );

  const active = (activeTab || 'core') as StoryEditorTab;
  const characters = story?.characters ?? [];
  const chapters = story?.chapters ?? [];

  const renderPlaceholder = (title: string, hint?: string) => (
    <View style={styles.tabContent}>
      <SectionHeader title={title} hint={hint} />
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderText}>{hint ?? t.translationInProgress ?? ''}</Text>
      </View>
    </View>
  );

  const renderCoreTab = () => (
    <View style={styles.tabContent}>
      <SectionHeader title={t.editorSectionBasic ?? ''} hint={t.editorSectionBasicHint ?? ''} />
      <FieldRow label={t.storyTitle ?? ''} guideKey="storyTitle" t={t}>
        <TextInput
          style={styles.input}
          value={story?.title ?? ''}
          onChangeText={(text) => onUpdateStory({ title: text })}
          placeholder={t.phStoryTitle ?? ''}
          placeholderTextColor="#666A78"
        />
      </FieldRow>
      <FieldRow label={t.storyIntro ?? ''} guideKey="storyDesc" t={t}>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={story?.description ?? ''}
          onChangeText={(text) => onUpdateStory({ description: text })}
          placeholder={t.phStoryDesc ?? ''}
          placeholderTextColor="#666A78"
          multiline
        />
      </FieldRow>
      <FieldRow label={t.editorHashtag ?? ''} guideKey="storyHashtag" t={t}>
        <TextInput
          style={styles.input}
          value={story?.tags?.join(', ') ?? ''}
          onChangeText={(text) => onUpdateStory({ tags: text.split(',').map(tag => tag.trim()).filter(Boolean) })}
          placeholder={t.phStoryHashtag ?? ''}
          placeholderTextColor="#666A78"
        />
      </FieldRow>
    </View>
  );

  const renderCharactersTab = () => (
    <View style={styles.tabContent}>
      <SectionHeader title={t.editorSectionCharacters ?? ''} hint={t.editorSectionCharactersHint ?? ''} />
      <TouchableOpacity style={styles.addButton} onPress={() => onAddCharacter(buildCharacterDraft())}>
        <Plus size={16} color="#050507" />
        <Text style={styles.addButtonText}>{t.addCharacter ?? t.editorCharAdd ?? ''}</Text>
      </TouchableOpacity>
      {characters.map((character, index) => (
        <View key={character.id} style={styles.listCard}>
          <View style={styles.listCardMain}>
            {character.imageUris?.[0] ? (
              <Image source={{ uri: character.imageUris[0] }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Users size={16} color="#D4A853" />
              </View>
            )}
            <View style={styles.listCardCopy}>
              <Text style={styles.listCardTitle}>
                {character.name?.trim() || `${t.defaultCharName ?? ''} ${index + 1}`.trim()}
              </Text>
              <Text style={styles.listCardSubtitle} numberOfLines={2}>
                {character.personality?.trim() || t.editorSectionCharactersHint ?? ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onDeleteCharacter(character.id)}
            accessibilityRole="button"
            accessibilityLabel={t.deleteCharacter ?? t.delete ?? ''}
          >
            <Trash2 size={16} color="#FF7777" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderChaptersTab = () => (
    <View style={styles.tabContent}>
      <SectionHeader title={t.editorSectionChapters ?? ''} hint={t.editorSectionChaptersHint ?? ''} />
      <TouchableOpacity style={styles.addButton} onPress={() => onAddChapter(buildChapterDraft())}>
        <Plus size={16} color="#050507" />
        <Text style={styles.addButtonText}>{t.addChapter ?? t.editorChapterAdd ?? ''}</Text>
      </TouchableOpacity>
      {chapters.map((chapter, index) => (
        <View key={chapter.id} style={styles.listCard}>
          <View style={styles.listCardCopy}>
            <Text style={styles.listCardTitle}>
              {chapter.title?.trim() || `${t.chapter ?? ''} ${index + 1}`.trim()}
            </Text>
            <Text style={styles.listCardSubtitle} numberOfLines={2}>
              {chapter.aiGoal?.trim() || t.editorSectionChaptersHint ?? ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onDeleteChapter(chapter.id)}
            accessibilityRole="button"
            accessibilityLabel={t.deleteChapter ?? t.delete ?? ''}
          >
            <Trash2 size={16} color="#FF7777" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderActiveTab = () => {
    switch (active) {
      case 'core':
        return renderCoreTab();
      case 'characters':
        return renderCharactersTab();
      case 'chapters':
        return renderChaptersTab();
      case 'story':
        return renderPlaceholder(t.editorTabIntro ?? '', t.editorIntroHint ?? '');
      case 'background':
        return renderPlaceholder(t.editorBgLabel ?? '', t.editorBgHint ?? '');
      case 'world':
        return renderPlaceholder(t.editorWorldLabel ?? '', t.editorWorldHint ?? '');
      case 'translate':
        return renderPlaceholder(t.editorSectionTranslate ?? t.translate ?? '', t.editorSectionTranslateHint ?? '');
      default:
        return renderCoreTab();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050507" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t.goBack ?? ''}>
            <ChevronLeft size={22} color="#F4F6FB" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.editorTitle ?? ''}</Text>
          <TouchableOpacity onPress={onSave} disabled={isSaving} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>{isSaving ? (t.savingLabel ?? '') : (t.saveLabel ?? '')}</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>{t.loading ?? ''}</Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBar}
              style={styles.tabBarScroll}
            >
              {tabs.map(({ id, label, Icon }) => {
                const isActive = active === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.tabButton, isActive && styles.tabButtonActive]}
                    onPress={() => onSwitchTab(id)}
                  >
                    <Icon size={14} color={isActive ? '#F6D27F' : '#84889A'} />
                    <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {renderActiveTab()}
              <View style={styles.bottomSpacer} />
            </ScrollView>
          </>
        )}

        <Modal visible={showTranslationModal} transparent animationType="fade" onRequestClose={onCloseTranslationModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t.translate ?? ''}</Text>
                <TouchableOpacity onPress={onCloseTranslationModal} accessibilityRole="button" accessibilityLabel={t.close ?? ''}>
                  <X size={18} color="#F4F6FB" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalBody}>{t.translationInProgress ?? ''}</Text>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0B0D12',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: '#F4F6FB',
  },
  saveButton: {
    minWidth: 76,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4A853',
  },
  saveButtonText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
    color: '#050507',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: '#F4F6FB',
  },
  tabBarScroll: {
    maxHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tabBar: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#11141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(212,168,83,0.14)',
    borderColor: 'rgba(212,168,83,0.28)',
  },
  tabButtonText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: '#A0A6B6',
  },
  tabButtonTextActive: {
    color: '#F6D27F',
    fontFamily: Typography.fontFamily.semibold,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    gap: 6,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.bold,
    color: '#F4F6FB',
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Typography.fontFamily.regular,
    color: '#99A1B3',
  },
  fieldRow: {
    gap: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F4F6FB',
  },
  guideBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.25)',
  },
  guideBtnText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: '#D4A853',
  },
  guideBalloon: {
    position: 'absolute',
    top: 30,
    right: 0,
    minWidth: 220,
    maxWidth: 300,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#10131A',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.25)',
    zIndex: 10,
  },
  guideBalloonArrow: {
    position: 'absolute',
    top: -8,
    right: 12,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#10131A',
  },
  guideBalloonText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
    color: '#F4F6FB',
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: '#F4F6FB',
    backgroundColor: '#11141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#D4A853',
  },
  addButtonText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
    color: '#050507',
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#11141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  listCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listCardCopy: {
    flex: 1,
    gap: 4,
  },
  listCardTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F4F6FB',
  },
  listCardSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
    color: '#99A1B3',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.24)',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,119,119,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,119,119,0.18)',
  },
  placeholderCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#11141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  placeholderText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.regular,
    color: '#99A1B3',
  },
  bottomSpacer: {
    height: 32,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(5,5,7,0.72)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#11141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
    color: '#F4F6FB',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.regular,
    color: '#99A1B3',
  },
});
