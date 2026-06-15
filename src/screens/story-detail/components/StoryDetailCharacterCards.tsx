/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { MessageCircle } from 'lucide-react-native';
import { Typography } from '../../../constants/tokens';
import { PressableOpacity as TouchableOpacity } from '../../../components/PressableOpacity';
import { PremiumImageViewer } from '../../../components/PremiumImageViewer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MEDIA_SIZE = Math.min(136, Math.floor((SCREEN_WIDTH - 72) / 2));

export interface StoryDetailCharacterCardItem {
  id: string | number;
  isUser?: boolean;
  name: string;
  age?: string;
  gender?: string;
  traits?: string;
  appearance?: string;
  setting?: string;
  description?: string;
  personality?: string;
  personalityExample?: string;
  speech?: string;
  speechPattern?: string;
  imageUris?: string[];
  rawSource?: Record<string, unknown>;
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function joinParagraphs(...values: unknown[]): string {
  const seen = new Set<string>();
  return values
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .filter(value => {
      const key = value.replace(/\s+/g, ' ').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n\n');
}

export function StoryDetailCharacterCards({
  characters,
  applyName,
  appLanguage,
  onChatPress,
  chatLabel,
}: {
  characters: StoryDetailCharacterCardItem[];
  applyName: (value?: string) => string;
  appLanguage?: string;
  worldSetting?: string;
  onChatPress?: (character: StoryDetailCharacterCardItem) => void;
  chatLabel: string;
}) {
  const [imageIndexes, setImageIndexes] = useState<Record<string, number>>({});
  const [viewerCharacter, setViewerCharacter] = useState<StoryDetailCharacterCardItem | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const viewerRaw = ((viewerCharacter?.rawSource ?? viewerCharacter ?? {}) as Record<string, unknown>);

  const updateImageIndex = (
    characterId: string,
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / MEDIA_SIZE);
    setImageIndexes(prev => ({
      ...prev,
      [characterId]: Math.max(0, nextIndex),
    }));
  };

  return (
    <View style={styles.list}>
      {characters.map(character => {
        const charKey = String(character.id);
        const rawCharacter = (character.rawSource ?? character) as Record<string, unknown>;
        const images = Array.isArray(character.imageUris) ? character.imageUris.filter(Boolean) : [];
        const currentIndex = imageIndexes[charKey] ?? 0;
        const displayName = applyName(character.name);
        const appearanceText = applyName(
          pickText(character.appearance, rawCharacter.appearance, character.traits, rawCharacter.traits),
        );
        const settingText = applyName(
          pickText(
            rawCharacter.setting,
            rawCharacter.description,
            character.setting,
            character.description,
          ),
        );
        const personalityText = applyName(
          pickText(
            rawCharacter.personality,
            character.personality,
            rawCharacter.description,
            rawCharacter.setting,
            character.description,
            character.setting,
          ),
        );
        const bodyText = character.isUser
          ? joinParagraphs(appearanceText, settingText)
          : joinParagraphs(appearanceText, personalityText);
        return (
          <View key={charKey} style={styles.card}>
            <View style={styles.imageOnlyRow}>
              <View style={styles.imageFrame}>
                {images.length > 0 ? (
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={event => updateImageIndex(charKey, event)}
                  >
                    {images.map((uri, index) => (
                      <TouchableOpacity
                        key={`${charKey}-${index}`}
                        activeOpacity={0.98}
                        onPress={() => {
                          setViewerCharacter(character);
                          setViewerIndex(index);
                        }}
                        style={styles.imageSlide}
                      >
                        <Image source={{ uri }} style={styles.characterImage} contentFit="contain" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={[styles.characterImage, styles.imageFallback]}>
                    <Text style={styles.imageFallbackText}>{displayName.charAt(0) || '?'}</Text>
                  </View>
                )}

                {images.length > 1 && (
                  <View style={styles.imageCounter}>
                    <Text style={styles.imageCounterText}>
                      {currentIndex + 1} / {images.length}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.identityRow}>
              <View style={styles.identityMain}>
                <Text style={styles.nameText} numberOfLines={1}>
                  {displayName}
                </Text>
                {!!character.age && (
                  <Text style={styles.ageText} numberOfLines={1}>
                    {character.age}
                  </Text>
                )}
                {!!character.gender && (
                  <Text style={styles.metaText} numberOfLines={1}>
                    {character.gender}
                  </Text>
                )}
              </View>
              {!character.isUser && onChatPress && (
                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => onChatPress(character)}
                  activeOpacity={0.92}
                >
                  <MessageCircle size={14} color="#D4A853" />
                  <Text style={styles.chatButtonText} numberOfLines={1}>
                    {chatLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {!!bodyText && <Text style={styles.copyText}>{bodyText}</Text>}
          </View>
        );
      })}

      <PremiumImageViewer
        visible={!!viewerCharacter}
        images={viewerCharacter?.imageUris ?? []}
        initialIndex={viewerIndex}
        charInfo={{
          name: applyName(viewerCharacter?.name ?? ''),
          age: viewerCharacter?.age ?? '',
          gender: viewerCharacter?.gender ?? '',
          hideStats: true,
          hideStoryMeta: true,
          hideActions: true,
          detailRows: viewerCharacter
            ? [
                {
                  label: '',
                  value: applyName(
                    pickText(
                      viewerCharacter.appearance,
                      viewerRaw.appearance,
                      viewerCharacter.traits,
                      viewerRaw.traits,
                    ),
                  ),
                },
                {
                  label: '',
                  value: applyName(
                    viewerCharacter.isUser
                      ? pickText(
                          viewerRaw.setting,
                          viewerRaw.description,
                          viewerCharacter.setting,
                          viewerCharacter.description,
                        )
                      : pickText(
                          viewerRaw.personality,
                          viewerRaw.description,
                          viewerRaw.setting,
                          viewerCharacter.personality,
                          viewerCharacter.description,
                          viewerCharacter.setting,
                        ),
                  ),
                },
              ].filter(row => row.value.trim().length > 0)
            : [],
        }}
        onClose={() => setViewerCharacter(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 18,
  },
  card: {
    paddingBottom: 18,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(214,221,233,0.12)',
  },
  imageOnlyRow: {
    flexDirection: 'row',
  },
  imageFrame: {
    width: MEDIA_SIZE,
    height: MEDIA_SIZE,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0B0E13',
  },
  imageSlide: {
    width: MEDIA_SIZE,
    height: MEDIA_SIZE,
  },
  characterImage: {
    width: MEDIA_SIZE,
    height: MEDIA_SIZE,
    backgroundColor: '#0B0E13',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: '#6C7382',
    fontSize: 30,
    fontFamily: Typography.fontFamily.bold,
  },
  imageCounter: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: Typography.fontFamily.semibold,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  identityMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  nameText: {
    color: '#F4F6FA',
    fontSize: 19,
    lineHeight: 24,
    fontFamily: Typography.fontFamily.bold,
  },
  ageText: {
    color: '#939CAC',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.medium,
  },
  metaText: {
    color: '#B9C0CD',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.medium,
  },
  copyText: {
    color: '#D7DCE6',
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Typography.fontFamily.regular,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 'auto',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(212,168,83,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.24)',
  },
  chatButtonText: {
    color: '#F5D79B',
    fontSize: 13,
    lineHeight: 16,
    fontFamily: Typography.fontFamily.semibold,
  },
});
