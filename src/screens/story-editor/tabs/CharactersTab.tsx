import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Edit3, Plus, Sparkles, Trash2, UserCircle2 } from 'lucide-react-native';

import { ConfirmModal } from '../../../components/ConfirmModal';
import { KeyboardAwareWrapper } from '../../../components/KeyboardAwareWrapper';
import { ToastService } from '../../../components/Toast';
import { PremiumHeroCard } from '../../../components/ui/PremiumHeroCard';
import { Radius, Space, Typography as Typo } from '../../../constants/tokens';
import { useTranslation } from '../../../hooks/useTranslation';
import { makeA11yProps } from '../../../utils/a11yProps';
import { pickImages } from '../utils/StoryEditorImageUtils';
import type { CharacterDraft } from '../types/StoryEditorTypes';

interface CharactersTabProps {
  characters: CharacterDraft[];
  onAddCharacter: () => void;
  onUpdateCharacter: (index: number, character: CharacterDraft) => void;
  onDeleteCharacter: (index: number) => void;
}

const CharacterItemSeparator = () => <View style={styles.separator} />;

export const CharactersTab = React.memo<CharactersTabProps>(function CharactersTab({
  characters,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}) {
  const t = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; index: number }>({
    visible: false,
    index: -1,
  });

  const editableCount = useMemo(
    () => characters.filter(character => character.id > 1).length,
    [characters],
  );

  const handleCharacterUpdate = (index: number, field: keyof CharacterDraft, value: unknown) => {
    onUpdateCharacter(index, { ...characters[index], [field]: value });
  };

  const handleAIGenerate = async (index: number, field: 'personality' | 'personalityExample') => {
    setIsGenerating(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 400));

      if (field === 'personality') {
        handleCharacterUpdate(
          index,
          'personality',
          characters[index].personality?.trim() || t?.phPersonalityDeep || '',
        );
      } else {
        handleCharacterUpdate(
          index,
          'personalityExample',
          characters[index].personalityExample?.trim() || t?.phCharExample || '',
        );
      }

      ToastService.success(t?.aiCharDraftDone ?? '');
    } catch {
      ToastService.error(t?.aiCharFailed ?? '');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCharacter = (index: number) => {
    if (characters[index].id <= 1) {
      ToastService.error(t?.cannotDeleteBase ?? '');
      return;
    }

    setDeleteModal({ visible: true, index });
  };

  const handleImagePick = async (index: number) => {
    try {
      const translator = (key: string) => t?.[key] ?? key;
      const picked = await pickImages(translator, 1);
      if (!picked.length) return;

      onUpdateCharacter(index, {
        ...characters[index],
        imageUris: [...picked, ...(characters[index].imageUris || [])].slice(0, 5),
      });
      ToastService.success(t?.imageAdded ?? '');
    } catch {
      ToastService.error(t?.imageFailed ?? '');
    }
  };

  const renderCharacter = ({ item, index }: { item: CharacterDraft; index: number }) => {
    const isEditing = editingIndex === index;
    const isSystemCharacter = item.id <= 1;

    return (
      <View style={styles.characterCard}>
        <View style={styles.characterHeader}>
          <View style={styles.characterInfo}>
            <View style={styles.avatarContainer}>
              {item.imageUris?.[0] ? (
                <Image source={{ uri: item.imageUris[0] }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <UserCircle2 size={28} color="#64748B" />
                </View>
              )}
            </View>

            <View style={styles.characterDetails}>
              <TextInput
                style={[styles.characterName, isSystemCharacter && styles.systemCharacterName]}
                value={item.name}
                onChangeText={value => handleCharacterUpdate(index, 'name', value)}
                placeholder={t?.phCharName ?? ''}
                placeholderTextColor="#94A3B8"
                editable={!isSystemCharacter}
                {...makeA11yProps({
                  label: t?.phCharName ?? '',
                  role: 'text',
                  disabled: isSystemCharacter,
                })}
              />
              <Text style={styles.characterId}>{String(item.id)}</Text>
            </View>
          </View>

          {!isSystemCharacter ? (
            <View style={styles.characterActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setEditingIndex(isEditing ? null : index)}
                {...makeA11yProps({ label: t?.editorSectionCharacters ?? '', role: 'button' })}
              >
                <Edit3 size={16} color="#475569" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteCharacter(index)}
                {...makeA11yProps({ label: t?.deleteCharacter ?? '', role: 'button' })}
              >
                <Trash2 size={16} color="#B91C1C" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {isEditing ? (
          <View style={styles.characterForm}>
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t?.age ?? ''}</Text>
              <TextInput
                style={styles.textInput}
                value={item.age || ''}
                onChangeText={value => handleCharacterUpdate(index, 'age', value)}
                placeholder={t?.ageExample ?? ''}
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t?.genderIdentity ?? ''}</Text>
              <TextInput
                style={styles.textInput}
                value={item.gender || ''}
                onChangeText={value => handleCharacterUpdate(index, 'gender', value)}
                placeholder={t?.genderIdentity ?? ''}
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t?.traits ?? ''}</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={item.traits || ''}
                onChangeText={value => handleCharacterUpdate(index, 'traits', value)}
                placeholder={t?.phPersonality ?? ''}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formLabel}>{t?.personalitySection ?? ''}</Text>
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={() => handleAIGenerate(index, 'personality')}
                  disabled={isGenerating}
                >
                  <Sparkles size={14} color="#A16207" />
                  <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={item.personality}
                onChangeText={value => handleCharacterUpdate(index, 'personality', value)}
                placeholder={t?.phPersonalityDeep ?? ''}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formLabel}>{t?.phPersonalityEx ?? t?.phCharExample ?? ''}</Text>
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={() => handleAIGenerate(index, 'personalityExample')}
                  disabled={isGenerating}
                >
                  <Sparkles size={14} color="#A16207" />
                  <Text style={styles.aiButtonText}>{isGenerating ? (t?.generating ?? '') : (t?.aiGenerate ?? '')}</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={item.personalityExample}
                onChangeText={value => handleCharacterUpdate(index, 'personalityExample', value)}
                placeholder={t?.phCharExample ?? ''}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t?.charImage ?? ''}</Text>
              <TouchableOpacity
                style={styles.imagePicker}
                onPress={() => handleImagePick(index)}
                {...makeA11yProps({ label: t?.charImage ?? '', role: 'button' })}
              >
                {item.imageUris?.[0] ? (
                  <View style={styles.imagePreview}>
                    <Image source={{ uri: item.imageUris[0] }} style={styles.previewImage} contentFit="cover" />
                    <Text style={styles.changeImageText}>{t?.changeImage ?? ''}</Text>
                  </View>
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Text style={styles.imagePickerText}>{t?.selectImage ?? ''}</Text>
                  </View>
                )}
              </TouchableOpacity>
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
          title={t?.editorSectionCharacters ?? ''}
          subtitle={t?.editorSectionCharactersHint ?? ''}
          eyebrow={t?.editorSectionCharacters ?? ''}
          pills={[`${characters.length}`, `${editableCount}`]}
        />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{`${t?.editorSectionCharacters ?? ''} (${characters.length})`}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={onAddCharacter}
              {...makeA11yProps({ label: t?.addCharacter ?? t?.add ?? '', role: 'button' })}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>{t?.addCharacter ?? t?.add ?? ''}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listContent}>
            {characters.map((item, index) => (
              <React.Fragment key={item.id.toString()}>
                {renderCharacter({ item, index })}
                {index < characters.length - 1 ? <CharacterItemSeparator /> : null}
              </React.Fragment>
            ))}
          </View>
        </View>
      </KeyboardAwareWrapper>

      <ConfirmModal
        visible={deleteModal.visible}
        icon="trash-outline"
        iconColor="#FF5555"
        title={t?.deleteCharacter ?? ''}
        message={t?.deleteCharacterConfirm ?? ''}
        onRequestClose={() => setDeleteModal({ visible: false, index: -1 })}
        actions={[
          {
            label: t?.delete ?? '',
            variant: 'danger',
            onPress: () => {
              onDeleteCharacter(deleteModal.index);
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
  characterCard: {
    backgroundColor: '#0E0E14',
    borderRadius: Radius.lg,
    padding: Space['4'],
    borderWidth: 1,
    borderColor: '#D6DEEA',
    elevation: 2,
  },
  characterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  characterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1A1A24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterDetails: {
    flex: 1,
  },
  characterName: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
    paddingVertical: 0,
    marginBottom: 2,
  },
  systemCharacterName: {
    color: '#64748B',
  },
  characterId: {
    fontSize: Typo.size.xs,
    color: '#64748B',
    fontFamily: Typo.fontFamily.regular,
  },
  characterActions: {
    flexDirection: 'row',
    gap: 8,
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
  characterForm: {
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
    marginBottom: 8,
    gap: 10,
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
  imagePicker: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#0E0E14',
  },
  imagePreview: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  previewImage: {
    width: 96,
    height: 96,
    borderRadius: Radius.md,
    marginBottom: 8,
  },
  changeImageText: {
    fontSize: Typo.size.sm,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.semibold,
  },
  imagePickerPlaceholder: {
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: '#0E0E14',
  },
  imagePickerText: {
    fontSize: Typo.size.md,
    color: '#64748B',
    fontFamily: Typo.fontFamily.medium,
  },
});
