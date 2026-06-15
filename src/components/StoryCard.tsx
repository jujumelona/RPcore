import { Typography } from '../constants/tokens';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Dimensions, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Play } from 'lucide-react-native';
import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { StoryAPI } from '../api/StoryAPI';
import { useUserProfileStore } from '../store/userProfileStore';
import type { Story } from '../types/navigation';
import type { RankableStory } from '../utils/recommendationRanker';
import { buildStoryDisplayModel,
  formatCount } from '../screens/home/utils/storyHelpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_COVER_RATIO = 2 / 3;
const CARD_PANEL_TONE = '#26282C';
const HOME_BG_RGB = '5,5,7';

type StoryLike = (Story | RankableStory | Record<string, any>) & {
  id?: string | number;
  title?: string;
  description?: string;
  likeCount?: number;
  like_count?: number;
  isLiked?: boolean;
  is_liked?: boolean;
  viewCount?: number;
  view_count?: number;
  playerCount?: number;
  player_count?: number;
  story_config?: unknown;
};

type StoryCardProps = {
  story: StoryLike;
  onPress?: () => void;
  onLongPress?: () => void;
  appLanguage?: string;
  index?: number;
  t?: unknown;
};

type WideStoryCardFrameProps = {
  coverUrl?: string;
  title: string;
  description: string;
  tagsText?: string;
  likeCount?: string | number;
  playCount?: string | number;
  liked?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onLikePress?: (event?: { stopPropagation?: () => void }) => void;
  likePending?: boolean;
  headerContent?: ReactNode;
  footerTrailing?: ReactNode;
  overlayContent?: ReactNode;
  cardOverlayContent?: ReactNode;
  disabled?: boolean;
  activeOpacity?: number;
  scaleDown?: number;
  onPressIn?: () => void;
  onPressOut?: () => void;
  imageRatio?: number;
  imageHeight?: number;
  cardStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
};

function buildCardContent(story: StoryLike, appLanguage?: string) {
  const display = buildStoryDisplayModel(story as Record<string, unknown>, appLanguage);

  return {
    title: display.title,
    description: display.description,
    worldSetting: display.worldSetting,
    tags: display.tags.slice(0, 5),
    coverUrl: display.coverUrl,
    likeCount: display.likeCount,
    playCount: display.playCount,
    isLiked: display.isLiked,
    modelId: display.modelId };
}

function useLocalLikeState(story: StoryLike, nextCount: number, initialLiked: boolean) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(nextCount);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked, story?.id]);

  useEffect(() => {
    setLikeCount(nextCount);
  }, [nextCount, story?.id]);

  return {
    liked,
    setLiked,
    likeCount,
    setLikeCount,
    pending,
    setPending };
}

async function toggleStoryLike(
  story: StoryLike,
  liked: boolean,
  setLiked: (next: boolean) => void,
  likeCount: number,
  setLikeCount: (next: number) => void,
  pending: boolean,
  setPending: (next: boolean) => void,
  event?: { stopPropagation?: () => void },
) {
  event?.stopPropagation?.();
  if (!story?.id || pending) {
    return;
  }

  const previousLiked = liked;
  const previousCount = likeCount;
  const optimisticLiked = !liked;

  setPending(true);
  setLiked(optimisticLiked);
  setLikeCount(Math.max(0, likeCount + (optimisticLiked ? 1 : -1)));

  try {
    const result = await StoryAPI.like(String(story.id));
    setLiked(Boolean(result.isLiked));
    setLikeCount(Math.max(0, Number(result.likeCount ?? 0)));
  } catch {
    setLiked(previousLiked);
    setLikeCount(previousCount);
  } finally {
    setPending(false);
  }
}

function StoryFallback({ title }: { title: string }) {
  return (
    <View style={[styles.fill, styles.coverFallback]}>
      <LinearGradient
        colors={['#202634', '#151922', '#101218']}
        locations={[0, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      />
      <View style={styles.coverFallbackGlowPrimary} />
      <View style={styles.coverFallbackGlowSecondary} />
      <Text style={styles.coverFallbackText}>{title.charAt(0) || '?'}</Text>
    </View>
  );
}

export function WideStoryCardFrame({
  coverUrl,
  title,
  description,
  tagsText,
  likeCount = 0,
  playCount = 0,
  liked = false,
  onPress,
  onLongPress,
  onLikePress,
  likePending = false,
  headerContent,
  footerTrailing,
  overlayContent,
  cardOverlayContent,
  disabled = false,
  activeOpacity = 1,
  scaleDown = 0.986,
  onPressIn,
  onPressOut,
  imageRatio = DEFAULT_COVER_RATIO,
  imageHeight,
  cardStyle,
  contentStyle,
  titleStyle,
  children }: WideStoryCardFrameProps) {
  const resolvedImageHeight = imageHeight ?? Math.min(126, SCREEN_WIDTH * 0.34);
  const resolvedImageWidth = Math.round(resolvedImageHeight * imageRatio);
 
  return (
    <TouchableOpacity
      style={[styles.wideCard, cardStyle]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={activeOpacity}
      scaleDown={scaleDown}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <View style={[styles.wideRow, { height: resolvedImageHeight }]}>
        <View style={[styles.wideCoverWrap, { width: resolvedImageWidth, height: resolvedImageHeight }]}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={styles.wideCover}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : (
            <StoryFallback title={title} />
          )}
          <LinearGradient
            colors={['rgba(38,40,44,0)', 'rgba(38,40,44,0.01)', 'rgba(38,40,44,0.05)']}
            locations={[0.56, 0.84, 1]}
            style={styles.wideImageShade}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[
              'rgba(38,40,44,0)',
              'rgba(38,40,44,0.04)',
              'rgba(38,40,44,0.10)',
              'rgba(38,40,44,0.22)',
              'rgba(38,40,44,0.42)',
              'rgba(38,40,44,1)',
            ]}
            locations={[0, 0.16, 0.36, 0.62, 0.82, 1]}
            start={{ x: 0.18, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.wideEdgeBlend}
            pointerEvents="none"
          />
          {overlayContent}
        </View>
 
        <View style={[styles.wideInfo, { height: resolvedImageHeight }, contentStyle]}>
          {!!headerContent && <View style={styles.wideHeaderSlot}>{headerContent}</View>}
          <Text style={[styles.wideTitle, titleStyle]} numberOfLines={1}>{title}</Text>
          <Text style={styles.wideDesc} numberOfLines={3}>{description}</Text>
 
          <View style={styles.wideFooter}>
            <Text style={styles.wideTags} numberOfLines={1}>{tagsText || ' '}</Text>
 
            <View style={styles.inlineStats}>
              {onLikePress ? (
                <TouchableOpacity
                  style={[styles.inlineStat, likePending && styles.pendingLike]}
                  onPress={onLikePress}
                  activeOpacity={1}
                  scaleDown={0.986}
                >
                  <View style={styles.inlineStatInner}>
                    <Heart size={12} color="#FFFFFF" fill={liked ? '#FFFFFF' : 'none'} />
                    <Text style={styles.inlineStatText}>{String(likeCount)}</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.inlineStat}>
                  <Heart size={12} color="#FFFFFF" fill="none" />
                  <Text style={styles.inlineStatText}>{String(likeCount)}</Text>
                </View>
              )}
 
              <View style={styles.inlineStat}>
                <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={styles.inlineStatText}>{String(playCount)}</Text>
              </View>
 
              {footerTrailing}
            </View>
          </View>
        </View>

        {cardOverlayContent ? (
          <View pointerEvents="box-none" style={styles.wideCardOverlay}>
            {cardOverlayContent}
          </View>
        ) : null}
      </View>
      {children}
    </TouchableOpacity>
  );
}

export function StoryCard({
  story,
  onPress,
  onLongPress,
  appLanguage = 'ko' }: StoryCardProps) {
  const applyName = useUserProfileStore(s => s.applyName);
  const content = buildCardContent(story, appLanguage);
  const tagText = content.tags.length > 0
    ? content.tags.map(tag => `#${String(tag).replace(/^#/, '')}`).join(' ')
    : '';
  const displayTitle = applyName(content.title);
  const displayDescription = applyName(content.description || content.worldSetting);
  const displayTags = applyName(tagText);
  const hasTags = displayTags.trim().length > 0;
  const [coverAspectRatio, setCoverAspectRatio] = useState<number | null>(null);
  const useContainedCover = (coverAspectRatio ?? 0) > DEFAULT_COVER_RATIO;
  const [cardLayout, setCardLayout] = useState({ width: 0, height: 0 });
  const [imageHeight, setImageHeight] = useState(0);
  const {
    liked,
    setLiked,
    likeCount,
    setLikeCount,
    pending,
    setPending } = useLocalLikeState(story, content.likeCount, content.isLiked);
  const bottomSectionHeight = hasTags ? 14 : 10;
  const titleBottom = bottomSectionHeight + 47;
  const titleTopY = cardLayout.height > 0 ? Math.max(0, cardLayout.height - titleBottom - 22) : 0;
  const fadeStartY = imageHeight > 0 ? Math.min(imageHeight, Math.max(0, titleTopY - 10)) : 0;
  const fadeEndY = imageHeight;
  const fadeHeight = Math.max(0, fadeEndY - fadeStartY);

  return (
    <TouchableOpacity
      style={styles.gridCard}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={1}
      scaleDown={0.986}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setCardLayout({ width, height });
      }}
    >
      <View
        style={styles.gridImageWrap}
        onLayout={event => {
          setImageHeight(event.nativeEvent.layout.height);
        }}
      >
        {content.coverUrl ? (
          useContainedCover ? (
            <>
              <View style={styles.gridCoverBackdrop} />
              <Image
                source={{ uri: content.coverUrl }}
                style={styles.gridCover}
                contentFit="contain"
                contentPosition="center"
                cachePolicy="memory-disk"
                transition={0}
                onLoad={(event: any) => {
                  const source = event?.source ?? event?.nativeEvent?.source;
                  const width = Number(source?.width ?? 0);
                  const height = Number(source?.height ?? 0);
                  if (width > 0 && height > 0) {
                    setCoverAspectRatio(width / height);
                  }
                }}
              />
            </>
          ) : (
            <Image
              source={{ uri: content.coverUrl }}
              style={styles.gridCover}
              contentFit="cover"
              contentPosition="center"
              cachePolicy="memory-disk"
              transition={0}
              onLoad={(event: any) => {
                const source = event?.source ?? event?.nativeEvent?.source;
                const width = Number(source?.width ?? 0);
                const height = Number(source?.height ?? 0);
                if (width > 0 && height > 0) {
                  setCoverAspectRatio(width / height);
                }
              }}
            />
          )
        ) : (
          <StoryFallback title={displayTitle} />
        )}
      </View>
      <View style={styles.gridBottomSpacer} />

      {cardLayout.width > 0 && fadeHeight > 0 ? (
        <LinearGradient
          style={[styles.gridFadeCanvas, { top: fadeStartY, height: fadeHeight }]}
          pointerEvents="none"
          colors={[
            `rgba(${HOME_BG_RGB},0)`,
            `rgba(${HOME_BG_RGB},0.18)`,
            `rgba(${HOME_BG_RGB},0.36)`,
            `rgba(${HOME_BG_RGB},0.52)`,
            `rgba(${HOME_BG_RGB},0.66)`,
            `rgba(${HOME_BG_RGB},0.78)`,
            `rgba(${HOME_BG_RGB},0.88)`,
            `rgba(${HOME_BG_RGB},0.95)`,
            `rgba(${HOME_BG_RGB},1)`,
          ]}
          locations={[0, 0.08, 0.16, 0.28, 0.42, 0.58, 0.74, 0.88, 1]}
        />
      ) : null}

      <View pointerEvents="box-none" style={styles.gridOverlay}>
        <View style={styles.topMetricPill}>
          <Play size={10} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.topMetricText}>{formatCount(content.playCount, appLanguage)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.topHeartIcon, pending && styles.pendingLike]}
          onPress={event =>
            toggleStoryLike(
              story,
              liked,
              setLiked,
              likeCount,
              setLikeCount,
              pending,
              setPending,
              event,
            )
          }
          activeOpacity={1}
          scaleDown={0.986}
        >
          <Heart size={16} color="#FFFFFF" fill={liked ? '#FFFFFF' : 'none'} />
        </TouchableOpacity>

        <View style={[styles.gridTitleWrap, { bottom: titleBottom }]}>
          <Text style={styles.gridTitle} numberOfLines={1}>{displayTitle}</Text>
        </View>

        <View style={[styles.gridDescWrap, hasTags ? styles.gridDescWrapWithTags : styles.gridDescWrapNoTags]}>
          <Text style={styles.gridDesc} numberOfLines={3}>{displayDescription}</Text>
        </View>
        {hasTags ? (
          <Text style={styles.gridTags} numberOfLines={1}>{displayTags}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function StoryCardWide({
  story,
  onPress,
  onLongPress,
  appLanguage = 'ko' }: StoryCardProps) {
  const applyName = useUserProfileStore(s => s.applyName);
  const content = buildCardContent(story, appLanguage);
  const tagText = content.tags.length > 0
    ? content.tags.map(tag => `#${String(tag).replace(/^#/, '')}`).join(' ')
    : '';
  const displayTitle = applyName(content.title);
  const displayDescription = applyName(content.description || content.worldSetting);
  const displayTags = applyName(tagText);
  const {
    liked,
    setLiked,
    likeCount,
    setLikeCount,
    pending,
    setPending } = useLocalLikeState(story, content.likeCount, content.isLiked);

  const stats = useMemo(() => ({
    likeLabel: formatCount(likeCount, appLanguage),
    playLabel: formatCount(content.playCount, appLanguage) }), [appLanguage, content.playCount, likeCount]);

  return (
    <WideStoryCardFrame
      coverUrl={content.coverUrl}
      title={displayTitle}
      description={displayDescription}
      tagsText={displayTags}
      likeCount={stats.likeLabel}
      playCount={stats.playLabel}
      liked={liked}
      onPress={onPress}
      onLongPress={onLongPress}
      onLikePress={event =>
        toggleStoryLike(
          story,
          liked,
          setLiked,
          likeCount,
          setLikeCount,
          pending,
          setPending,
          event,
        )
      }
      likePending={pending}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%' },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121418' },
  coverFallbackGlowPrimary: {
    position: 'absolute',
    top: '8%',
    right: '-12%',
    width: '62%',
    height: '34%',
    borderRadius: 999,
    backgroundColor: 'rgba(176,193,255,0.16)',
    transform: [{ rotate: '-18deg' }] },
  coverFallbackGlowSecondary: {
    position: 'absolute',
    bottom: '-8%',
    left: '-16%',
    width: '70%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: 'rgba(94,115,182,0.18)',
    transform: [{ rotate: '12deg' }] },
  coverFallbackText: {
    color: 'rgba(244,247,255,0.22)',
    fontSize: 34,
    fontFamily: Typography.fontFamily.bold },
  pendingLike: {
    opacity: 0.55 },
  gridCard: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative' },
  gridImageWrap: {
    width: '100%',
    aspectRatio: 0.62,
    position: 'relative',
    backgroundColor: '#454A53' },
  gridCover: {
    width: '100%',
    height: '100%',
    backgroundColor: '#454A53' },
  gridCoverBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#454A53' },
  gridCoverBackdropShade: {
    ...StyleSheet.absoluteFillObject },
  gridBottomSpacer: {
    marginTop: 0,
    minHeight: 0,
    backgroundColor: 'transparent' },
  gridTitleWrap: {
    position: 'absolute',
    left: 8,
    right: 12 },
  topMetricPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(116,121,132,0.42)' },
  topMetricText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: Typography.fontFamily.semibold },
  topHeartIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(116,121,132,0.28)' },
  gridFadeCanvas: {
    position: 'absolute',
    left: 0,
    right: 0 },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject },
  gridContent: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 3,
    justifyContent: 'space-between' },
  gridContentNoTags: {
    bottom: 12 },
  gridTextStack: {
    gap: 1,
    marginTop: 0 },
  gridDescWrap: {
    position: 'absolute',
    left: 8,
    right: 8 },
  gridDescWrapWithTags: {
    bottom: 17 },
  gridDescWrapNoTags: {
    bottom: 8 },
  gridTitle: {
    color: '#F7F8FB',
    fontSize: 17.2,
    lineHeight: 20.2,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -0.35 },
  gridDesc: {
    color: '#E3E7EF',
    fontSize: 11.4,
    lineHeight: 14.2,
    fontFamily: Typography.fontFamily.regular },
  gridTags: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 2,
    color: '#CFD4DE',
    fontSize: 9.6,
    lineHeight: 11.2,
    fontFamily: Typography.fontFamily.medium },
  wideCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent' },
  wideRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: CARD_PANEL_TONE,
    overflow: 'hidden' },
  wideCoverWrap: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: CARD_PANEL_TONE,
    flexShrink: 0 },
  wideCover: {
    width: '100%',
    height: '100%',
    backgroundColor: CARD_PANEL_TONE },
  wideImageShade: {
    ...StyleSheet.absoluteFillObject },
  wideEdgeBlend: {
    ...StyleSheet.absoluteFillObject },
  wideInfo: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 7,
    paddingBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: CARD_PANEL_TONE },
  wideHeaderSlot: {
    marginBottom: 6 },
  wideCardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  wideTitle: {
    color: '#F7F8FB',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -0.3,
    marginTop: -2 },
  wideDesc: {
    marginTop: 8,
    color: '#E5E8EF',
    fontSize: 11.6,
    lineHeight: 16,
    fontFamily: Typography.fontFamily.regular,
    minHeight: 48 },
  wideFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  wideTags: {
    flex: 1,
    color: '#C9CED8',
    fontSize: 11,
    lineHeight: 15,
    fontFamily: Typography.fontFamily.medium,
    paddingRight: 8 },
  inlineStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
    flexWrap: 'nowrap' },
  inlineStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    flexWrap: 'nowrap' },
  inlineStatInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    flexWrap: 'nowrap',
    alignSelf: 'center' },
  inlineStatText: {
    color: '#F6F8FB',
    fontSize: 11,
    lineHeight: 11,
    fontFamily: Typography.fontFamily.semibold,
    includeFontPadding: false,
    textAlignVertical: 'center' } });
