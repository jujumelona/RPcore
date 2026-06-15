import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { Image } from 'expo-image';

import { Radius, Space, Typography as Typo } from '../../../constants/tokens';
import { useTranslation } from '../../../hooks/useTranslation';
import { KeyboardAwareWrapper } from '../../../components/KeyboardAwareWrapper';
import type { IntroMessage, CharacterDraft } from '../types/StoryEditorTypes';

const NARRATOR_CHAR_ID = 0;
const USER_CHAR_ID = 1;

interface IntroTabProps {
  introMessages: Record<string, IntroMessage[]>;
  chapters: Array<{ id: string; title: string }>;
  characters: CharacterDraft[];
  isLocked: boolean;
  onUpdateIntroMessages: (messages: Record<string, IntroMessage[]>) => void;
  onAddIntroImage: (key: string) => Promise<void>;
}

const IntroBubble = React.memo<{
  msg: IntroMessage;
  chars: CharacterDraft[];
  onLongPress: () => void;
}>(({ msg, chars, onLongPress }) => {
  const t = useTranslation();

  if (msg.speakerType === 'image') {
    return (
      <TouchableOpacity style={styles.introBubbleImage} onLongPress={onLongPress}>
        {msg.imageUri ? (
          <Image source={{ uri: msg.imageUri }} style={styles.introImage} contentFit="cover" />
        ) : (
          <Text style={styles.introImagePlaceholder}>{t?.editorIntroImage ?? ''}</Text>
        )}
      </TouchableOpacity>
    );
  }

  const speakerName =
    msg.speakerType === 'narrator'
      ? (t?.speakerNarrator ?? t?.narrator ?? '')
      : msg.speakerType === 'user'
      ? (t?.speakerUser ?? '')
      : chars.find(char => char.id === msg.speakerCharId)?.name || `${t?.character ?? ''} ${msg.speakerCharId ?? ''}`;

  return (
    <TouchableOpacity style={styles.introBubble} onLongPress={onLongPress}>
      <Text style={styles.introBubbleSpeaker}>{speakerName}</Text>
      <Text style={styles.introBubbleContent}>{msg.content}</Text>
    </TouchableOpacity>
  );
});

export const IntroTab = React.memo<IntroTabProps>(function IntroTab({
  introMessages,
  chapters,
  characters,
  isLocked,
  onUpdateIntroMessages,
  onAddIntroImage,
}) {
  const t = useTranslation();
  const [introExpanded, setIntroExpanded] = useState<Record<string, boolean>>({ chapter_1: true });
  const [activeIntroKey, setActiveIntroKey] = useState('chapter_1');
  const [introInput, setIntroInput] = useState('');
  const [introSpeaker, setIntroSpeaker] = useState<'narrator' | 'user' | 'character'>('narrator');
  const [introSpeakerCharId, setIntroSpeakerCharId] = useState(NARRATOR_CHAR_ID);

  const regularCharacters = characters.filter(char => char.id > 1);
  const keys = [{ key: 'chapter_1', label: chapters[0]?.title || `${t?.editorChapterNum ?? t?.chapterListLabel ?? ''} 1` }];

  const addIntroMessage = () => {
    if (isLocked || !introInput.trim()) return;

    const nextMessage: IntroMessage = {
      id: Date.now().toString(),
      speakerType: introSpeaker,
      speakerCharId: introSpeaker === 'character' ? introSpeakerCharId : undefined,
      content: introInput.trim(),
    };

    onUpdateIntroMessages({
      ...introMessages,
      [activeIntroKey]: [...(introMessages[activeIntroKey] || []), nextMessage],
    });

    setIntroInput('');
  };

  const removeIntroMessage = (key: string, id: string) => {
    if (isLocked) return;

    onUpdateIntroMessages({
      ...introMessages,
      [key]: (introMessages[key] || []).filter(message => message.id !== id),
    });
  };

  return (
    <KeyboardAwareWrapper style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t?.editorIntroLabel ?? ''}</Text>
          <Text style={styles.headerHint}>{t?.editorIntroHint ?? ''}</Text>
        </View>

        {keys.map(item => {
          const expanded = Boolean(introExpanded[item.key]);
          return (
            <View key={item.key} style={styles.introSection}>
              <TouchableOpacity
                style={styles.introHeader}
                onPress={() => setIntroExpanded(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
              >
                <Text style={styles.introHeaderText}>{item.label}</Text>
                {expanded ? <ChevronUp size={18} color="#8A8A9E" /> : <ChevronDown size={18} color="#8A8A9E" />}
              </TouchableOpacity>

              {expanded && (
                <View style={styles.introBubbleArea}>
                  {(introMessages[item.key] || []).map(message => (
                    <IntroBubble
                      key={message.id}
                      msg={message}
                      chars={characters}
                      onLongPress={() => removeIntroMessage(item.key, message.id)}
                    />
                  ))}

                  <View style={styles.introInputArea}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.speakerScrollContent}
                    >
                      <TouchableOpacity
                        style={[
                          styles.speakerBtn,
                          introSpeaker === 'user' && activeIntroKey === item.key && styles.speakerBtnActive,
                        ]}
                        onPress={() => {
                          const isSelected = introSpeaker === 'user' && activeIntroKey === item.key;
                          setIntroSpeaker(isSelected ? 'narrator' : 'user');
                          setIntroSpeakerCharId(isSelected ? NARRATOR_CHAR_ID : USER_CHAR_ID);
                          setActiveIntroKey(item.key);
                        }}
                      >
                        <Text style={[
                          styles.speakerBtnText,
                          introSpeaker === 'user' && activeIntroKey === item.key && styles.speakerBtnTextActive,
                        ]}>
                          {t?.speakerUser ?? ''}
                        </Text>
                      </TouchableOpacity>

                      {regularCharacters.map(character => {
                        const selected = introSpeaker === 'character' && introSpeakerCharId === character.id && activeIntroKey === item.key;
                        return (
                          <TouchableOpacity
                            key={character.id}
                            style={[styles.speakerBtn, selected && styles.speakerBtnActive]}
                            onPress={() => {
                              setIntroSpeaker(selected ? 'narrator' : 'character');
                              setIntroSpeakerCharId(selected ? NARRATOR_CHAR_ID : character.id);
                              setActiveIntroKey(item.key);
                            }}
                          >
                            <Text style={[styles.speakerBtnText, selected && styles.speakerBtnTextActive]}>
                              {character.name || `${t?.character ?? ''} ${character.id}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}

                      <TouchableOpacity style={styles.speakerBtn} onPress={() => onAddIntroImage(item.key)}>
                        <Text style={styles.speakerBtnText}>{t?.editorIntroImage ?? ''}</Text>
                      </TouchableOpacity>
                    </ScrollView>

                    <View style={styles.introInputRow}>
                      <TextInput
                        style={styles.introInput}
                        value={activeIntroKey === item.key ? introInput : ''}
                        onChangeText={value => {
                          setIntroInput(value);
                          setActiveIntroKey(item.key);
                        }}
                        multiline
                        placeholder={t?.phIntroInput ?? ''}
                        placeholderTextColor="#757585"
                        editable={!isLocked}
                      />
                      <TouchableOpacity
                        style={styles.introSendBtn}
                        onPress={() => {
                          setActiveIntroKey(item.key);
                          addIntroMessage();
                        }}
                        disabled={isLocked}
                      >
                        <Plus size={18} color="#050507" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </KeyboardAwareWrapper>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  content: {
    flex: 1,
    paddingHorizontal: Space['4'],
    paddingTop: Space['4'],
  },
  header: {
    marginBottom: Space['4'],
  },
  headerTitle: {
    fontSize: Typo.size.h3,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.bold,
    marginBottom: 6,
  },
  headerHint: {
    fontSize: Typo.size.sm,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.regular,
  },
  introSection: {
    backgroundColor: '#0E0E14',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D6DEEA',
    marginBottom: Space['3'],
    overflow: 'hidden',
  },
  introHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Space['4'],
    backgroundColor: '#0E0E14',
  },
  introHeaderText: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
  },
  introBubbleArea: {
    padding: Space['4'],
    paddingTop: 0,
    gap: 10,
  },
  introBubble: {
    backgroundColor: '#1A1A24',
    borderRadius: Radius.md,
    padding: 12,
  },
  introBubbleSpeaker: {
    fontSize: Typo.size.xs,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.semibold,
    marginBottom: 4,
  },
  introBubbleContent: {
    fontSize: Typo.size.sm,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.regular,
  },
  introBubbleImage: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    height: 200,
    backgroundColor: '#1A1A24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introImage: {
    width: '100%',
    height: '100%',
  },
  introImagePlaceholder: {
    fontSize: Typo.size.sm,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.medium,
  },
  introInputArea: {
    gap: 10,
  },
  speakerScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  speakerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1A1A24',
    backgroundColor: '#0C0C14',
  },
  speakerBtnActive: {
    borderColor: '#D4A853',
    backgroundColor: 'rgba(212,168,83,0.14)',
  },
  speakerBtnText: {
    fontSize: Typo.size.sm,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.medium,
  },
  speakerBtnTextActive: {
    color: '#D4A853',
  },
  introInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  introInput: {
    flex: 1,
    minHeight: 92,
    maxHeight: 160,
    backgroundColor: '#0C0C14',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#2C2C38',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F0F0F5',
    fontSize: Typo.size.sm,
    textAlignVertical: 'top',
  },
  introSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D4A853',
    alignItems: 'center',
    justifyContent: 'center',
  },
});