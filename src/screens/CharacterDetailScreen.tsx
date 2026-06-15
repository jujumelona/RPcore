/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/CharacterDetailScreen.tsx
// ✅ PREMIUM REDESIGN v4 — 상용 서비스 수준 완전 재설계
// - expo-blur BlurView 헤더/배경
// - PremiumImageViewer 풀스크린 갤러리
// - 성격 예시 대사 카드
// - 공유/북마크 헤더 버튼
// - 스크롤 기반 헤더 페이드
// - RTL 완전 지원

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, StatusBar, NativeSyntheticEvent, NativeScrollEvent, Alert, Share } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { ToastService } from '../components/Toast';
import { Image } from 'expo-image';
import { useLanguageStore } from '../store/languageStore';
import { ArrowLeft, ArrowRight, Bookmark, Heart, MessageCircle, MoreVertical, Sparkles, Share2, Star, User, Calendar } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import Animated, { FadeIn, FadeInDown, SlideInDown, useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Shadow, Typography } from '../constants/tokens';
import type { ScreenProps } from '../types/navigation';
import { PremiumImageViewer } from '../components/PremiumImageViewer';
import { buildCharacterChatNavigationParams } from '../utils/characterChat';

const { width, height } = (Dimensions.get('window') ?? { width: 375, height: 812 });

const HEADER_H = 80;
const FADE_START = 60;
const FADE_END = 160;

/* ─── 정보 행 컴포넌트 ─────────────────────────────────────────── */
function InfoRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  if (!value) return null;
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={[ir.value, accent && ir.accent]}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  label: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#5A5A70', flex: 1 },
  value: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#C8C8D4', flex: 2, textAlign: 'right' },
  accent: { color: '#D4A853' }
});

/* ─── 사진 썸네일 그리드 ─────────────────────────────────────────── */
function GalleryGrid({
  images,
  onPress,
  title,
  subtitle,
  badgeLabel,
}: {
  images: string[];
  onPress: (index: number) => void;
  title: string;
  subtitle: string;
  badgeLabel: string;
}) {
  if (!images.length) return null;
  const thumbSize = (width - 32 - 6) / 3;

  return (
    <Animated.View entering={FadeInDown.delay(120).springify()} style={gg.wrap}>
      <View style={gg.header}>
        <Text style={gg.headerText}>{title}</Text>
        <Text style={gg.headerSub}>{subtitle}</Text>
      </View>
      <View style={gg.grid}>
        {images.map((uri, i) => (
          <TouchableOpacity key={i} onPress={() => onPress(i)} activeOpacity={0.88}>
            <View style={[gg.thumb, { width: thumbSize, height: thumbSize * 1.3 }]}>
              <Image source={{ uri }} style={[gg.thumbImage, { width: thumbSize, height: thumbSize * 1.3 }]} contentFit="cover" transition={200} />
              {i === 0 && (
                <View style={gg.mainBadge}>
                  <Star size={8} color="#D4A853" fill="#D4A853" />
                  <Text style={gg.mainBadgeText}>{badgeLabel}</Text>
                </View>
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} style={[StyleSheet.absoluteFill, s.radius10]} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}
const gg = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerText: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  headerSub: { fontSize: 11, fontFamily: Typography.fontFamily.regular, color: '#4A4A5E' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { borderRadius: 10, overflow: 'hidden', position: 'relative' },
  thumbImage: { borderRadius: 10 },
  mainBadge: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  mainBadgeText: { fontSize: 9, fontFamily: Typography.fontFamily.bold, color: '#D4A853' }
});

/* Personality example dialogue card */
function PersonalityExampleCard({ example, charName }: { example: string; charName: string }) {
  return (
    <Animated.View entering={FadeInDown.delay(300).springify()} style={pe.card}>
      <LinearGradient colors={['rgba(212,168,83,0.10)', 'rgba(212,168,83,0.04)']} start={[0, 0]} end={[1, 1]} style={StyleSheet.absoluteFill} />
      <View style={pe.quote}><Text style={pe.quoteChar}>"</Text></View>
      <Text style={pe.text}>{example}</Text>
      <View style={pe.footer}><Text style={pe.footerChar}>— {charName}</Text></View>
    </Animated.View>
  );
}
const pe = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(212,168,83,0.25)', padding: 18, overflow: 'hidden', borderLeftWidth: 3, borderLeftColor: '#D4A853' },
  quote: { marginBottom: 4 },
  quoteChar: { fontSize: 40, fontFamily: Typography.fontFamily.extrabold, color: 'rgba(212,168,83,0.35)', lineHeight: 36 },
  text: { fontSize: 14, fontFamily: Typography.fontFamily.regular, color: '#C8C8D4', lineHeight: 22, fontStyle: 'italic', marginTop: -8 },
  footer: { marginTop: 12, alignItems: 'flex-end' },
  footerChar: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853' }
});

/* ─── 메인 화면 ──────────────────────────────────────────────────── */
export function CharacterDetailScreen({ route, navigation }: ScreenProps<'CharacterDetail'>) {
  const routeParams = route.params as { character?: ScreenProps<'CharacterDetail'>['route']['params']['character'] } | undefined;
  const character = routeParams?.character;
  const { t, isRTL } = useLanguageStore(useShallow(s => ({ t: s.t, isRTL: s.isRTL })));

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const scrollY = useSharedValue(0);
  const isMountedRef = useRef(true);
  const invalidMsg = String(t?.invalidAccess ?? t?.accessDenied ?? '');
  const missingParamRef = useRef(false);
  const chatLaunchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareLabel = String(t?.share ?? '');
  const cancelLabel = String(t?.cancel ?? '');
  const basicInfoLabel = String(t?.basicInfo ?? '');
  const nameLabel = String(t?.namePlaceholder ?? '');
  const ageLabel = String(t?.agePlaceholder ?? t?.age ?? '');
  const heightLabel = String(t?.height ?? '');
  const genderLabel = String(t?.genderPlaceholder ?? '');
  const jobLabel = String(t?.jobPlaceholder ?? '');
  const personalityLabel = String(t?.personality ?? '');
  const habitsLabel = String(t?.habitsFeatures ?? '');
  const situationLabel = String(t?.currentSituation ?? '');
  const likeLabel = String(t?.like ?? '');
  const saveLabel = String(t?.save ?? t?.bookmark ?? '');
  const aiCharacterLabel = String(t?.aiCharacter ?? t?.character ?? '');
  const photosLabel = String(t?.photos ?? '');
  const tapFullscreenLabel = String(t?.tapFullscreen ?? '');
  const representativeLabel = String(t?.representative ?? '');

  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (chatLaunchTimerRef.current !== null) {
        clearTimeout(chatLaunchTimerRef.current);
        chatLaunchTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (character || missingParamRef.current) return;
    missingParamRef.current = true;
    ToastService.error(invalidMsg);
    safeGoBack();
  }, [character, invalidMsg, safeGoBack]);

  const images: string[] = useMemo(() => (
    character?.imageUrls?.length ? character.imageUrls
      : character?.imageUrl ? [character.imageUrl]
        : []
  ), [character?.imageUrls, character?.imageUrl]);

  const headerBlurStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [FADE_START, FADE_END], [0, 1], Extrapolation.CLAMP)
  }));
  const headerTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [FADE_START + 40, FADE_END], [0, 1], Extrapolation.CLAMP)
  }));

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  }, [scrollY]);

  const openViewer = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const handleChat = useCallback(() => {
    if (!character) return;
    if (character.storyId) {
      const { story, character: routeCharacter } = buildCharacterChatNavigationParams({
        ...character,
        imageUrls: images,
        imageUrl: images[0] ?? character.imageUrl,
      });
      navigation.navigate('Chat', { story, character: routeCharacter, resumeMode: true });
      return;
    }

    const storyForChat = {
      id: `char_${String(character.id)}`,
      title: character.name,
      description: character.description ?? '',
      coverUrl: images[0] ?? '',
      cover_urls: images,
      author: '',
      authorId: '',
      likeCount: 0,
      viewCount: 0,
      tags: [],
      genre: 'romance',
      status: 'approved',
      story_config: {
        characters: [{
          id: 2,
          name: character.name,
          personality: character.description ?? '',
          personalityExample: '',
          imageUris: images,
          profileUrl: images[0] ?? '',
          age: '',
          gender: '',
          traits: ''
        }],
        chapters: [{
          id: 'chapter_1',
          title: character.name,
          aiGoal: `Always stay in character as ${character.name}. Respond naturally to the user.`,
          chapterInfo: character.description ?? '',
          prevSummary: '',
          characterGoals: {},
          triggers: [],
          choiceEvents: [],
          intro: []
        }],
        worldSetting: character.description ?? '',
        narratorFrequency: 'minimal' as const
      }
    };
    navigation.navigate('Chat', { story: storyForChat });
  }, [character, images, navigation]);

  if (!character) {
    return (
      <View style={s.guardRoot}>
        <Text style={s.guardText}>{invalidMsg}</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={[s.header, isRTL && s.rtl]}>
        <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
          <View style={em.overlayBg}>
            <View style={[StyleSheet.absoluteFill, s.darkOverlay]} />
          </View>
        </Animated.View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
          {isRTL ? <ArrowRight size={20} color="#F0F0F5" /> : <ArrowLeft size={20} color="#F0F0F5" />}
        </TouchableOpacity>
        <Animated.Text style={[s.headerTitle, headerTitleStyle]} numberOfLines={1}>
          {character.name}
        </Animated.Text>
        <View style={[s.headerRight, isRTL && s.rtl]}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setIsBookmarked(p => !p)}>
            <Bookmark size={18} color={isBookmarked ? '#D4A853' : '#C8C8D4'} fill={isBookmarked ? '#D4A853' : 'none'} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => { Share.share({ title: character.name, message: `${character.name} — RPcore` }).catch(() => {}); }}>
            <Share2 size={18} color="#C8C8D4" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              Alert.alert(character.name, undefined, [
                { text: shareLabel, onPress: () => Share.share({ title: character.name, message: `${character.name} — RPcore` }).catch(() => {}) },
                { text: cancelLabel, style: 'cancel' },
              ]);
            }}
          >
            <MoreVertical size={18} color="#C8C8D4" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={32}>
        {images.length > 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={s.heroWrap}>
            <TouchableOpacity onPress={() => openViewer(0)} activeOpacity={0.95}>
              <Image source={{ uri: images[0] }} style={s.heroImg} contentFit="cover" transition={300} />
              <LinearGradient colors={['rgba(5,5,7,0)', 'rgba(5,5,7,0.4)', 'rgba(5,5,7,0.95)']} locations={[0.35, 0.7, 1]} style={s.heroGrad}>
                <View style={s.heroNameRow}>
                  <Text style={s.heroName}>{character.name}</Text>
                  {character.age && (
                    <View style={s.heroAgeBadge}>
                      <Text style={s.heroAgeText}>{String(character.age)}</Text>
                    </View>
                  )}
                </View>
                <View style={s.heroPicBadge}>
                  <Text style={s.heroPicText}>{images.length}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.heroLikeBtn} onPress={() => setIsLiked(p => !p)}>
              <View style={em.overlayBg}>
                <Heart size={20} color={isLiked ? '#FF6B8B' : 'rgba(255,255,255,0.8)'} fill={isLiked ? '#FF6B8B' : 'none'} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(300)} style={s.heroPlaceholder}>
            <LinearGradient colors={['#111118', '#2A2A38', '#1A1A24']} style={StyleSheet.absoluteFill} />
            <Text style={s.heroPlaceholderText}>{character.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </Animated.View>
        )}

        {images.length > 1 && (
          <GalleryGrid
            images={images}
            onPress={openViewer}
            title={`${photosLabel} ${images.length}`.trim()}
            subtitle={tapFullscreenLabel}
            badgeLabel={representativeLabel}
          />
        )}

        <Animated.View entering={FadeInDown.delay(80).springify()} style={s.nameSection}>
          <View style={s.nameBadgeRow}>
            <Text style={s.bigName}>{character.name}</Text>
            <View style={s.npcBadge}>
              <Sparkles size={10} color="#D4A853" />
              <Text style={s.npcBadgeText}>{aiCharacterLabel}</Text>
            </View>
          </View>
          {!!character.description && <Text style={s.description} numberOfLines={4}>{character.description}</Text>}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).springify()} style={s.card}>
          <LinearGradient colors={['rgba(255,255,255,0.03)', 'transparent']} style={StyleSheet.absoluteFill} />
          <View style={s.cardHeader}>
            <User size={13} color="#D4A853" />
            <Text style={s.cardTitle}>{basicInfoLabel}</Text>
          </View>
          <InfoRow label={nameLabel} value={character.name} />
          {character.age && <InfoRow label={ageLabel} value={String(character.age)} />}
          {character.height && <InfoRow label={heightLabel} value={character.height} />}
          {character.gender && <InfoRow label={genderLabel} value={character.gender} />}
          {character.job && <InfoRow label={jobLabel} value={character.job} />}
          {character.mbti && <InfoRow label="MBTI" value={character.mbti} accent />}
        </Animated.View>

        {(character.personality || character.traits) && (
          <Animated.View entering={FadeInDown.delay(200).springify()} style={s.card}>
            <LinearGradient colors={['rgba(255,255,255,0.03)', 'transparent']} style={StyleSheet.absoluteFill} />
            <Text style={s.sectionLabel}>{personalityLabel}</Text>
            <Text style={s.sectionText}>{character.personality || character.traits}</Text>
          </Animated.View>
        )}

        {!!character.speaking && <PersonalityExampleCard example={character.speaking} charName={character.name} />}

        {!!character.habits && (
          <Animated.View entering={FadeInDown.delay(240).springify()} style={s.card}>
            <LinearGradient colors={['rgba(255,255,255,0.03)', 'transparent']} style={StyleSheet.absoluteFill} />
            <Text style={s.sectionLabel}>{habitsLabel}</Text>
            <Text style={s.sectionText}>{character.habits}</Text>
          </Animated.View>
        )}

        {!!character.situation && (
          <Animated.View entering={FadeInDown.delay(280).springify()} style={s.situationCard}>
            <LinearGradient colors={['rgba(212,168,83,0.12)', 'rgba(212,168,83,0.04)']} start={[0, 0]} end={[1, 1]} style={StyleSheet.absoluteFill} />
            <View style={s.situationHeader}>
              <Calendar size={13} color="#D4A853" />
              <Text style={s.situationTitle}>{situationLabel}</Text>
            </View>
            <Text style={s.situationText}>{character.situation}</Text>
          </Animated.View>
        )}

        <View style={s.bottomSpacer} />
      </ScrollView>

      <Animated.View entering={SlideInDown.delay(300).springify()} style={s.bottomBar}>
        <View style={em.overlayBg} />
        <View style={[StyleSheet.absoluteFill, s.darkOverlay]} />
        <TouchableOpacity style={s.bottomIconBtn} onPress={() => setIsLiked(p => !p)}>
          <Heart size={22} color={isLiked ? '#FF6B8B' : '#797990'} fill={isLiked ? '#FF6B8B' : 'none'} />
          <Text style={[s.bottomIconLabel, isLiked && s.bottomIconLabelPink]}>{likeLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.chatBtn} onPress={handleChat} activeOpacity={0.88}>
          <LinearGradient colors={['#E8C070', '#D4A853', '#C89440']} start={[0, 0]} end={[1, 0]} style={StyleSheet.absoluteFill} />
          <MessageCircle size={20} color="#050507" />
          <Text style={s.chatBtnText}>{String(t?.startChat ?? t?.start ?? '')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bottomIconBtn} onPress={() => setIsBookmarked(p => !p)}>
          <Bookmark size={22} color={isBookmarked ? '#D4A853' : '#797990'} fill={isBookmarked ? '#D4A853' : 'none'} />
          <Text style={[s.bottomIconLabel, isBookmarked && s.bottomIconLabelGold]}>{saveLabel}</Text>
        </TouchableOpacity>
      </Animated.View>

      <PremiumImageViewer
        visible={viewerVisible}
        images={images}
        initialIndex={viewerIndex}
        charInfo={{
          name: character.name,
          age: character.age,
          personality: character.personality ?? character.description,
          genre: character.genre,
          tags: character.tags,
          likeCount: character.likeCount ?? 0,
          playerCount: character.playerCount ?? 0
        }}
        isLiked={isLiked}
        onClose={() => setViewerVisible(false)}
        onLike={() => setIsLiked(p => !p)}
        onChat={() => {
          setViewerVisible(false);
          if (chatLaunchTimerRef.current !== null) { clearTimeout(chatLaunchTimerRef.current); }
          chatLaunchTimerRef.current = setTimeout(() => { chatLaunchTimerRef.current = null; handleChat(); }, 300);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  radius10: { borderRadius: 10 },
  darkOverlay: { backgroundColor: 'rgba(5,5,7,0.5)' },
  bottomSpacer: { height: 140 },
  root: { flex: 1, backgroundColor: '#050507' },
  guardRoot: { flex: 1, backgroundColor: '#050507', alignItems: 'center', justifyContent: 'center', padding: 24 },
  guardText: { color: '#F0F0F5', fontSize: 14, textAlign: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 40, paddingBottom: 12, height: HEADER_H, overflow: 'hidden' },
  rtl: { flexDirection: 'row-reverse' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginHorizontal: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 30 },
  heroWrap: { width, height: height * 0.62, position: 'relative', marginBottom: 8 },
  heroImg: { width: '100%', height: '100%' },
  heroGrad: { ...StyleSheet.absoluteFillObject, padding: 20, paddingBottom: 24, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  heroName: { fontSize: 28, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.6, textShadowColor: 'rgba(0,0,0,0.5)' },
  heroAgeBadge: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  heroAgeText: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#E0E0F0' },
  heroPicBadge: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  heroPicText: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#E0E0F0' },
  heroLikeBtn: { position: 'absolute', top: 90, right: 16, borderRadius: 24, overflow: 'hidden' },
  heroLikeBtnBlur: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  heroPlaceholder: { width, height: height * 0.62, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 },
  heroPlaceholderText: { fontSize: 80, fontFamily: Typography.fontFamily.extrabold, color: '#2A2A3A' },
  nameSection: { paddingHorizontal: 20, paddingVertical: 12, marginBottom: 6 },
  nameBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bigName: { fontSize: 26, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.5, flex: 1 },
  npcBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(212,168,83,0.12)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)' },
  npcBadgeText: { fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#D4A853' },
  description: { fontSize: 14, fontFamily: Typography.fontFamily.regular, color: '#8A8A9E', lineHeight: 22 },
  card: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0C0C14', borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', padding: 18, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  cardTitle: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionLabel: { fontSize: 11, fontFamily: Typography.fontFamily.semibold, color: '#5A5A70', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  sectionText: { fontSize: 14, fontFamily: Typography.fontFamily.regular, color: '#C8C8D4', lineHeight: 22 },
  situationCard: { marginHorizontal: 16, marginBottom: 10, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(212,168,83,0.28)', padding: 18, overflow: 'hidden', ...Shadow.sm },
  situationHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  situationTitle: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853', letterSpacing: 0.8, textTransform: 'uppercase' },
  situationText: { fontSize: 14, fontFamily: Typography.fontFamily.regular, color: '#C8C8D4', lineHeight: 22 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12, paddingBottom: 20, paddingTop: 14, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.07)', backgroundColor: '#050507' },
  bottomIconBtn: { alignItems: 'center', gap: 4, width: 52 },
  bottomIconLabel: { fontSize: 10, fontFamily: Typography.fontFamily.medium, color: '#5A5A70' },
  bottomIconLabelPink: { color: '#FF6B8B' },
  bottomIconLabelGold: { color: '#D4A853' },
  chatBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: 16, overflow: 'hidden', ...Shadow.md },
  chatBtnText: { fontSize: 16, fontFamily: Typography.fontFamily.extrabold, color: '#050507', letterSpacing: -0.2 }
});

const em = StyleSheet.create({
  overlayBg: { backgroundColor: '#050507' }
});
