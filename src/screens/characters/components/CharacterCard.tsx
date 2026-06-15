/**
 * src/screens/characters/components/CharacterCard.tsx
 * 캐릭터 카드 컴포넌트 — 상용 서비스 수준 완전 구현
 *
 * Features:
 * - 이미지 갤러리 슬라이더 (스와이프)
 * - 감정 상태 표시 바
 * - 팔로우 버튼 & 좋아요
 * - 애니메이션 진입 효과
 * - 장르 뱃지 / 인기도 표시
 */

import React, { useCallback, useState, memo } from 'react';
import { View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown
  } from 'react-native-reanimated';
import { Heart, MessageCircle, Users, Star } from 'lucide-react-native';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { Radius, Spring, Typography } from '../../../constants/tokens';
import { formatCount } from '../../../utils/formatCount';
import { getStoryGenreLabel } from '../../../utils/storyGenres';
import { useTranslation } from '../../../hooks/useTranslation';

/** 장르명을 번역된 이름으로 변환 */
function translateGenre(genre: string, t?: ReturnType<typeof useTranslation>): string {
  return getStoryGenreLabel(genre, t as Record<string, string | undefined>);
}

const { width: SCR_W } = (Dimensions.get('window') ?? { width: 375, height: 812 });
const CARD_GAP = 12;
const CARD_PADDING = 14;
const CARD_WIDTH = (SCR_W - CARD_PADDING * 2 - CARD_GAP) / 2;
const CARD_IMAGE_H = Math.round(CARD_WIDTH * 1.55);

/* ── 장르 색상 맵 ─────────────────────────────────────────────── */
const GENRE_COLORS: Record<string, { bg: string; text: string }> = {
  romance:   { bg: 'rgba(255,107,139,0.75)', text: '#fff' },
  fantasy:   { bg: 'rgba(120,87,255,0.75)',  text: '#fff' },
  school:    { bg: 'rgba(255,165,40,0.75)',  text: '#fff' },
  daily:     { bg: 'rgba(50,200,150,0.75)',  text: '#fff' },
  mystery:   { bg: 'rgba(60,160,255,0.75)',  text: '#fff' },
  obsession: { bg: 'rgba(220,60,100,0.75)', text: '#fff' },
  bl:        { bg: 'rgba(180,100,255,0.75)', text: '#fff' },
  default:   { bg: 'rgba(100,100,130,0.75)', text: '#fff' }
  };

/* ── CharacterCardData 타입 ───────────────────────────────────── */
export interface CharacterCardData {
  id: string | number;
  name: string;
  age?: string | number;
  genre?: string;
  tags?: string[];
  imageUrls: string[];
  profileUrl?: string;
  personality?: string;
  storyTitle?: string;
  storyId?: string;
  likeCount?: number;
  playerCount?: number;
  isLiked?: boolean;
  isNew?: boolean;
  isHot?: boolean;
  /** 감정 초기값 (e1~e5), 0~20 범위 */
  emotions?: Record<string, number>;
}

interface CharacterCardProps {
  character: CharacterCardData;
  index: number;
  onPress: () => void;
  onLike?: (id: string | number) => void;
  t?: Record<string, string | undefined>;
}

/* ── 이미지 도트 인디케이터 ─────────────────────────────────────── */
function DotIndicator({ total, active }: { total: number; active: number }) {
  if (total <= 1) return null;
  return (
    <View style={st.dots}>
      {Array.from({ length: Math.min(total, 5) }).map((_, i) => (
        <View
          key={i}
          style={[
            st.dot,
            i === active && st.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

/* ── 감정 미니 바 ────────────────────────────────────────────── */
function EmotionMiniBar({ emotions }: { emotions?: Record<string, number> }) {
  if (!emotions) return null;
  const EMOTION_COLORS = ['#FF6B8B', '#60A5FA', '#FBBF24', '#34D399', '#A78BFA'];
  const keys = Object.keys(emotions).slice(0, 5);
  if (keys.length === 0) return null;

  return (
    <View style={st.emotionBar}>
      {keys.map((key, i) => {
        const val = Math.max(0, Math.min(20, emotions[key] ?? 0));
        const pct = val / 20;
        return (
          <View key={key} style={st.emotionTrack}>
            <View
              style={[
                st.emotionFill,
                { width: `${pct * 100}%`, backgroundColor: EMOTION_COLORS[i] },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

/* ── 메인 캐릭터 카드 ─────────────────────────────────────────── */
export const CharacterCard = memo(function CharacterCard({
  character, index, onPress, onLike, t: _t
  }: CharacterCardProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const t = useTranslation();

  const images = character.imageUrls?.length
    ? character.imageUrls
    : character.profileUrl
      ? [character.profileUrl]
      : ['https://picsum.photos/seed/' + character.id + '/400/600'];

  const genreColor = GENRE_COLORS[character.genre ?? ''] ?? GENRE_COLORS.default;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
      setImgIdx(idx);
    },
    [],
  );

  const handleLike = useCallback((e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    onLike?.(character.id);
  }, [character.id, onLike]);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 55).springify().damping(22)}
    >
      <Animated.View style={animStyle}>
        <PressableOpacity
          style={st.card}
          onPress={onPress}
          onPressIn={() => { scale.value = withSpring(0.968, Spring.press); }}
          onPressOut={() => { scale.value = withSpring(1, Spring.press); }}
          activeOpacity={1}
        >
          {/* ── 이미지 슬라이더 ── */}
          <View style={st.imgWrap}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScroll}
              scrollEventThrottle={16}
              style={st.imgScroll}
            >
              {images.map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={st.img}
                  contentFit="cover"
                  transition={200}
                />
              ))}
            </ScrollView>

            {/* 상단 배지 */}
            <View style={st.topRow}>
              {character.genre && (
                <View style={[st.genreBadge, { backgroundColor: genreColor.bg }]}>
                  <Text style={[st.genreText, { color: genreColor.text }]}>
                    {translateGenre(character.genre, t)}
                  </Text>
                </View>
              )}
              {character.isNew && (
                <View style={st.newBadge}>
                  <Text style={st.newBadgeText}>NEW</Text>
                </View>
              )}
              {character.isHot && (
                <View style={st.hotBadge}>
                  <Text style={st.hotBadgeText}>HOT</Text>
                </View>
              )}
            </View>

            {/* 좋아요 버튼 */}
            <PressableOpacity
              style={st.likeBtn}
              onPress={handleLike}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Heart
                size={14}
                color={character.isLiked ? '#FF6B8B' : 'rgba(255,255,255,0.85)'}
                fill={character.isLiked ? '#FF6B8B' : 'none'}
              />
            </PressableOpacity>

            {/* 하단 그라데이션 + 이름 */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.82)']}
              style={st.imgGrad}
            >
              <DotIndicator total={images.length} active={imgIdx} />
              <Text style={st.charName} numberOfLines={1}>{character.name}</Text>
              {character.age !== undefined && (
                <Text style={st.charAge}>{String(character.age)}</Text>
              )}
            </LinearGradient>
          </View>

          {/* ── 하단 정보 ── */}
          <View style={st.info}>
            {/* 스토리 제목 */}
            {!!character.storyTitle && (
              <Text style={st.storyTitle} numberOfLines={1}>
                {character.storyTitle}
              </Text>
            )}

            {/* 성격 미리보기 */}
            {!!character.personality && (
              <Text style={st.personality} numberOfLines={2}>
                {character.personality}
              </Text>
            )}

            {/* 태그 */}
            {!!character.tags?.length && (
              <View style={st.tags}>
                {character.tags.slice(0, 3).map((tag, i) => (
                  <View key={i} style={st.tag}>
                    <Text style={st.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 감정 바 */}
            <EmotionMiniBar emotions={character.emotions} />

            {/* 통계 */}
            <View style={st.stats}>
              <View style={st.statItem}>
                <Heart size={10} color="#FF6B8B" fill="#FF6B8B" />
                <Text style={st.statText}>{formatCount(character.likeCount ?? 0)}</Text>
              </View>
              <View style={st.statItem}>
                <Users size={10} color="#60A5FA" />
                <Text style={st.statText}>{formatCount(character.playerCount ?? 0)}</Text>
              </View>
            </View>
          </View>
        </PressableOpacity>
      </Animated.View>
    </Animated.View>
  );
});

/* ── Wide 카드 (가로 전체) ────────────────────────────────────── */
export const CharacterCardWide = memo(function CharacterCardWide({
  character, index, onPress, onLike, t: _t
  }: CharacterCardProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const t = useTranslation();

  const imgUri = character.imageUrls?.[0]
    ?? character.profileUrl
    ?? `https://picsum.photos/seed/${character.id}/300/400`;

  const genreColor = GENRE_COLORS[character.genre ?? ''] ?? GENRE_COLORS.default;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).springify().damping(20)}
    >
      <Animated.View style={[animStyle, st.wideCard]}>
        <PressableOpacity
          onPress={onPress}
          onPressIn={() => { scale.value = withSpring(0.97, Spring.press); }}
          onPressOut={() => { scale.value = withSpring(1, Spring.press); }}
          activeOpacity={1}
          style={st.wideInner}
        >
          {/* 왼쪽 이미지 */}
          <View style={st.wideImgWrap}>
            <Image
              source={{ uri: imgUri }}
              style={st.wideImg}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.5)']}
              style={StyleSheet.absoluteFill}
            />
            {character.genre && (
              <View style={[st.wideGenre, { backgroundColor: genreColor.bg }]}>
                <Text style={[st.genreText, { color: genreColor.text }]}>{translateGenre(character.genre, t)}</Text>
              </View>
            )}
          </View>

          {/* 오른쪽 정보 */}
          <View style={st.wideContent}>
            <View style={st.wideNameRow}>
              <Text style={st.wideName} numberOfLines={1}>{character.name}</Text>
              {character.age !== undefined && (
                <View style={st.wideAgeBadge}>
                  <Text style={st.wideAgeText}>{String(character.age)}</Text>
                </View>
              )}
            </View>

            {!!character.storyTitle && (
              <View style={st.storyRow}>
                <Star size={10} color="#D4A853" fill="#D4A853" />
                <Text style={st.wideStoryTitle} numberOfLines={1}>{character.storyTitle}</Text>
              </View>
            )}

            {!!character.personality && (
              <Text style={st.widePersonality} numberOfLines={3}>
                {character.personality}
              </Text>
            )}

            {!!character.tags?.length && (
              <View style={st.tags}>
                {character.tags.slice(0, 3).map((tag, i) => (
                  <View key={i} style={st.tag}>
                    <Text style={st.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={st.wideStats}>
              <PressableOpacity
                style={st.wideStatBtn}
                onPress={() => onLike?.(character.id)}
              >
                <Heart
                  size={12}
                  color={character.isLiked ? '#FF6B8B' : '#797990'}
                  fill={character.isLiked ? '#FF6B8B' : 'none'}
                />
                <Text style={[st.statText, character.isLiked && { color: '#FF6B8B' }]}>
                  {formatCount(character.likeCount ?? 0)}
                </Text>
              </PressableOpacity>
              <View style={st.statItem}>
                <MessageCircle size={12} color="#60A5FA" />
                <Text style={st.statText}>{formatCount(character.playerCount ?? 0)}</Text>
              </View>

              {/* 대화 시작 버튼 */}
              <View style={st.spacer} />
              <PressableOpacity style={st.wideChatBtn} onPress={onPress}>
                <MessageCircle size={12} color="#050507" />
                <Text style={st.wideChatBtnText}>{String(t?.chatBtn ?? t?.startChat ?? '')}</Text>
              </PressableOpacity>
            </View>
          </View>
        </PressableOpacity>
      </Animated.View>
    </Animated.View>
  );
});

/* ── 스타일 ──────────────────────────────────────────────────── */
const st = StyleSheet.create({
  spacer: { flex: 1 },
  /* ─ Grid Card ─ */
  card: {
    width: CARD_WIDTH,
    borderRadius: Radius.lg,
    backgroundColor: '#09090F',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.09)',
    elevation: 3 },
  imgWrap: { width: CARD_WIDTH, height: CARD_IMAGE_H, position: 'relative' },
  imgScroll: { width: CARD_WIDTH, height: CARD_IMAGE_H },
  img: { width: CARD_WIDTH, height: CARD_IMAGE_H },

  topRow: {
    position: 'absolute', top: 8, left: 6, right: 6,
    flexDirection: 'row', gap: 4, alignItems: 'center'
  },
  genreBadge: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3
  },
  genreText: { fontSize: 9, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.3 },
  newBadge: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: 'rgba(212,168,83,0.85)'
  },
  newBadgeText: { fontSize: 9, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  hotBadge: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: 'rgba(255,80,80,0.85)'
  },
  hotBadgeText: { fontSize: 9, fontFamily: Typography.fontFamily.bold, color: '#fff' },

  likeBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28,
    borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center'
  },

  imgGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 10, paddingTop: 40, paddingBottom: 10
  },
  charName: {
    fontSize: 14, fontFamily: Typography.fontFamily.extrabold,
    color: '#fff', letterSpacing: -0.3
  },
  charAge: {
    fontSize: 11, fontFamily: Typography.fontFamily.medium,
    color: 'rgba(255,255,255,0.7)', marginTop: 1
  },

  dots: { flexDirection: 'row', gap: 3, marginBottom: 5 },
  dot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)'
  },
  dotActive: { width: 10, backgroundColor: '#fff' },

  info: { padding: 10 },
  storyTitle: {
    fontSize: 10, fontFamily: Typography.fontFamily.medium,
    color: '#D4A853', marginBottom: 4
  },
  personality: {
    fontSize: 11, fontFamily: Typography.fontFamily.regular,
    color: '#7070A0', lineHeight: 16, marginBottom: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  tag: {
    backgroundColor: 'rgba(212,168,83,0.06)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.18)'
  },
  tagText: { fontSize: 9, fontFamily: Typography.fontFamily.medium, color: '#B8924A' },

  emotionBar: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  emotionTrack: {
    flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 1, overflow: 'hidden' },
  emotionFill: { height: '100%', borderRadius: 1 },

  stats: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: {
    fontSize: 10, fontFamily: Typography.fontFamily.medium, color: '#797990'
  },

  /* ─ Wide Card ─ */
  wideCard: {
    marginHorizontal: 14, marginBottom: 8,
    borderRadius: Radius.lg, backgroundColor: '#09090F',
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.09)',
    elevation: 3 },
  wideInner: { flexDirection: 'row' },
  wideImgWrap: { width: 110, height: 140, position: 'relative' },
  wideImg: { width: 110, height: 140 },
  wideGenre: {
    position: 'absolute', bottom: 8, left: 8,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2
  },
  wideContent: { flex: 1, padding: 12 },
  wideNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  wideName: {
    flex: 1, fontSize: 16, fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5', letterSpacing: -0.3
  },
  wideAgeBadge: {
    backgroundColor: '#111118', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#222232'
  },
  wideAgeText: { fontSize: 10, fontFamily: Typography.fontFamily.medium, color: '#797990' },
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  wideStoryTitle: { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#D4A853', flex: 1 },
  widePersonality: {
    fontSize: 12, fontFamily: Typography.fontFamily.regular,
    color: '#8A8A9E', lineHeight: 17, marginBottom: 6
  },
  wideStats: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 'auto' },
  wideStatBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  wideChatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#D4A853', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    elevation: 4
  },
  wideChatBtnText: { fontSize: 11, fontFamily: Typography.fontFamily.bold, color: '#050507' }
  });
