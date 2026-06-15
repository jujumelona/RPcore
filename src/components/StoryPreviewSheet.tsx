import { useEffect, useRef } from 'react';
import { Modal,
  Pressable,
  StyleSheet,
  Text,
  View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Heart, Play, PlayCircle, Sparkles, User } from 'lucide-react-native';

import { Radius, Typography as Typo } from '../constants/tokens';
import { Story } from '../types/navigation';
import { formatCount } from '../utils/formatCount';
import { useTranslation } from '../hooks/useTranslation';
import { getStoryGenreLabel } from '../utils/storyGenres';

/** 장르명을 번역된 이름으로 변환 */
function translateGenre(genre: string, t?: ReturnType<typeof useTranslation>): string {
  return getStoryGenreLabel(genre, t as Record<string, string | undefined>);
}

type StoryCharacterPreview = {
  id: number | string;
  name: string;
  profileUrl?: string;
  profile_url?: string;
  imageUrls?: string[];
  imageUris?: string[];
};

interface StoryPreviewSheetProps {
  visible: boolean;
  story: (Story & Record<string, any>) | null;
  onClose: () => void;
  onOpenDetail?: () => void;
  onPrimaryAction?: () => void;
  onOpenAuthor?: () => void;
  primaryActionLabel?: string;
}

export function StoryPreviewSheet({
  visible,
  story,
  onClose,
  onOpenDetail,
  onPrimaryAction,
  onOpenAuthor,
  primaryActionLabel }: StoryPreviewSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(640);
  const overlayOpacity = useSharedValue(0);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useTranslation();
  const resolvedPrimaryActionLabel = primaryActionLabel ?? String(t?.startStory ?? '');
  const detailActionLabel = String(t?.viewAll ?? '');
  const sectionTitle = String(t?.characters ?? '');

  useEffect(() => {
    if (!visible) return;
    translateY.value = withSpring(0, { damping: 22, stiffness: 240 });
    overlayOpacity.value = withTiming(1, { duration: 180 });
  }, [overlayOpacity, translateY, visible]);

  useEffect(() => {
    return () => {
      if (actionTimerRef.current !== null) {
        clearTimeout(actionTimerRef.current);
        actionTimerRef.current = null;
      }
    };
  }, []);

  const closeSheet = () => {
    overlayOpacity.value = withTiming(0, { duration: 150 });
    translateY.value = withTiming(640, { duration: 210 }, finished => {
      if (finished) runOnJS(onClose)();
    });
  };

  const panGesture = Gesture.Pan()
    .activeOffsetY([8, 999])
    .onUpdate(event => {
      translateY.value = Math.max(0, event.translationY);
      overlayOpacity.value = Math.max(0.2, 1 - event.translationY / 280);
    })
    .onEnd(event => {
      if (event.translationY > 120 || event.velocityY > 900) {
        runOnJS(closeSheet)();
        return;
      }

      translateY.value = withSpring(0, { damping: 22, stiffness: 260 });
      overlayOpacity.value = withTiming(1, { duration: 140 });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value }));

  const scrollHandler = useAnimatedScrollHandler(_event => {
    // scroll-linked header fade: cover scrim intensifies as user scrolls
  });

  if (!visible || !story) return null;

  const tags = Array.isArray(story.tags) ? story.tags.slice(0, 4) : [];
  const characters = Array.isArray(story.characters) ? (story.characters as StoryCharacterPreview[]).slice(0, 3) : [];
  const likes = story.likeCount ?? story.like_count ?? 0;
  const views = story.playerCount ?? story.viewCount ?? story.view_count ?? 0;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={closeSheet}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.modalRoot, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheetWrap, sheetStyle, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.handle} />

            <Animated.ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
            >
              <View style={styles.hero}>
                {story.coverUrl || story.cover_url || story.cover_urls?.[0] ? (
                  <Image source={{ uri: story.coverUrl ?? story.cover_url ?? story.cover_urls?.[0] }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]} />
                )}
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.72)']}
                  start={[0.5, 0]}
                  end={[0.5, 1]}
                  style={styles.coverScrim}
                />
                <View style={styles.coverMeta}>
                  {!!story.genre && (
                    <View style={styles.genreBadge}>
                      <Text style={styles.genreBadgeText}>{translateGenre(story.genre, t)}</Text>
                    </View>
                  )}
                  <View style={styles.metricRail}>
                    <View style={styles.metricPill}>
                      <Heart size={12} color="#ff708a" />
                      <Text style={styles.metricText}>{formatCount(likes)}</Text>
                    </View>
                    <View style={styles.metricPill}>
                      <Play size={12} color="#fff" />
                      <Text style={styles.metricText}>{formatCount(views)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.mainCard}>
                <Text style={styles.title}>{story.title}</Text>
                {!!story.author && (
                  <Pressable style={styles.authorRow} onPress={onOpenAuthor}>
                    <Sparkles size={14} color={'#D4A853'} />
                    <Text style={styles.authorText}>{story.author}</Text>
                    {onOpenAuthor ? <ChevronRight size={14} color={'#797990'} /> : null}
                  </Pressable>
                )}
                {!!story.description && (
                  <Text style={styles.description}>{story.description}</Text>
                )}

                {tags.length > 0 ? (
                  <View style={styles.tagRail}>
                    {tags.map(tag => (
                      <View key={tag} style={styles.tag}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {characters.length > 0 ? (
                  <View style={styles.section}>
                    <View style={styles.sectionHead}>
                      <Text style={styles.sectionTitle}>{sectionTitle}</Text>
                    </View>
                    <View style={styles.characterRail}>
                      {characters.map((character: StoryCharacterPreview) => (
                        <View key={character.id ?? character.name} style={styles.characterCard}>
                          {(character.imageUrls?.[0] ?? character.imageUris?.[0] ?? character.profileUrl ?? character.profile_url) ? (
                            <Image source={{ uri: (character.imageUrls?.[0] ?? character.imageUris?.[0] ?? character.profileUrl ?? character.profile_url) as string }} style={styles.characterImage} contentFit="cover" cachePolicy="memory-disk" />
                          ) : (
                            <View style={[styles.characterImage, styles.characterFallback]}>
                              <User size={18} color={'#797990'} />
                            </View>
                          )}
                          <Text style={styles.characterName} numberOfLines={1}>
                            {character.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                {onOpenDetail ? (
                  <Pressable
                    style={[styles.actionBtn, styles.secondaryAction]}
                    onPress={() => {
                      closeSheet();
                      if (actionTimerRef.current !== null) clearTimeout(actionTimerRef.current);
                      actionTimerRef.current = setTimeout(() => {
                        actionTimerRef.current = null;
                        onOpenDetail();
                      }, 180);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>{detailActionLabel}</Text>
                  </Pressable>
                ) : null}

                {onPrimaryAction ? (
                  <Pressable
                    style={[styles.actionBtn, styles.primaryAction]}
                    onPress={() => {
                      closeSheet();
                      if (actionTimerRef.current !== null) clearTimeout(actionTimerRef.current);
                      actionTimerRef.current = setTimeout(() => {
                        actionTimerRef.current = null;
                        onPrimaryAction();
                      }, 180);
                    }}
                  >
                    <PlayCircle size={18} color="#071018" />
                    <Text style={styles.primaryActionText}>{resolvedPrimaryActionLabel}</Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    backgroundColor: 'rgba(2, 4, 8, 0.62)',
    justifyContent: 'flex-end' },
  sheetWrap: {
    maxHeight: '86%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: 'rgba(8,12,16,0.98)',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden' },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 10,
    marginBottom: 8 },
  content: {
    paddingHorizontal: 18 },
  hero: {
    height: 250,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 18 },
  cover: {
    width: '100%',
    height: '100%' },
  coverFallback: {
    backgroundColor: 'rgba(255,255,255,0.06)' },
  coverScrim: {
    ...StyleSheet.absoluteFillObject },
  coverMeta: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 12 },
  genreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)' },
  genreBadgeText: {
    fontSize: 11,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold,
    textTransform: 'capitalize' },
  metricRail: {
    flexDirection: 'row',
    gap: 8 },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.44)' },
  metricText: {
    fontSize: 11,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold },
  mainCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)' },
  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 32,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.bold },
  authorRow: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 },
  authorText: {
    fontSize: Typo.size.sm,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.medium },
  description: {
    marginTop: 14,
    fontSize: Typo.size.base,
    lineHeight: 23,
    color: '#C8C8D4' },
  tagRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)' },
  tagText: {
    fontSize: 11,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.medium },
  section: {
    marginTop: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10 },
  sectionTitle: {
    fontSize: 14,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold },
  characterRail: {
    flexDirection: 'row',
    gap: 10 },
  characterCard: {
    width: 86,
    gap: 8 },
  characterImage: {
    width: 86,
    height: 110,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)' },
  characterFallback: {
    alignItems: 'center',
    justifyContent: 'center' },
  characterName: {
    fontSize: 12,
    color: '#C8C8D4',
    fontFamily: Typo.fontFamily.medium },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 8 },
  actionBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8 },
  primaryAction: {
    backgroundColor: '#F0F0F5' },
  primaryActionText: {
    fontSize: Typo.size.base,
    color: '#050507',
    fontFamily: Typo.fontFamily.bold },
  secondaryAction: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)' },
  secondaryActionText: {
    fontSize: Typo.size.base,
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.semibold } });
