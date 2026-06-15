/**
 * src/screens/story-detail/components/StoryDetailCharactersSection.tsx
 * StoryDetailScreen 내 캐릭터 섹션 — 상용 서비스 수준 완전 구현
 *
 * Features:
 * - 캐릭터 프로필 카드 (이미지 갤러리, 정보, 감정 바)
 * - 1:1 대화 시작 버튼
 * - 감정 레이더 차트 연동
 * - 이미지 전체보기 모달
 * - 스크롤 가능한 이미지 슬라이더
 * - 유저/NPC 구분 뱃지
 */

import React, { useState, useCallback, memo } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  FadeIn } from 'react-native-reanimated';
import { X, ChevronRight,
  Sparkles, ShieldCheck } from 'lucide-react-native';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { Radius, Typography } from '../../../constants/tokens';

const { width: SCR_W, height: SCR_H } = (Dimensions.get('window') ?? { width: 375, height: 812 });

/* ─── 감정 색상 맵 ─────────────────────────────────────────────── */
const EMOTION_COLORS = [
  '#FF6B8B', // e1 신뢰/사랑
  '#60A5FA', // e2 경계/냉담
  '#FBBF24', // e3 즐거움/흥미
  '#34D399', // e4 안정/편안
  '#A78BFA', // e5 욕망/집착
];

const EMOTION_LABELS: Record<string, string> = {
  e1: '신뢰', e2: '경계', e3: '즐거움', e4: '안정', e5: '욕망' };

/* ─── 감정 바 ──────────────────────────────────────────────────── */
function EmotionBars({
  emotions, t }: {
  emotions?: Record<string, number>;
  t?: Record<string, string | undefined>;
}) {
  if (!emotions) return null;
  const keys = Object.keys(emotions).slice(0, 5);
  if (keys.length === 0 || keys.every(k => (emotions[k] ?? 0) === 0)) return null;

  return (
    <View style={em.wrap}>
      <View style={em.headerRow}>
        <Sparkles size={12} color="#D4A853" />
        <Text style={em.headerText}>{t?.emotionState ?? ''}</Text>
      </View>
      {keys.map((key, i) => {
        const val = Math.max(0, Math.min(20, emotions[key] ?? 0));
        const pct = val / 20;
        const color = EMOTION_COLORS[i] ?? '#797990';
        const label = {
          e1: t?.emoE1Label,
          e2: t?.emoE2Label,
          e3: t?.emoE3Label,
          e4: t?.emoE4Label,
          e5: t?.emoE5Label,
        }[key] ?? EMOTION_LABELS[key] ?? key;
        return (
          <View key={key} style={em.row}>
            <Text style={em.label}>{label}</Text>
            <View style={em.track}>
              <Animated.View
                entering={FadeIn.delay(i * 80).duration(500)}
                style={[em.fill, { width: `${pct * 100}%`, backgroundColor: color }]}
              />
            </View>
            <Text style={[em.val, { color }]}>{val}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ─── 이미지 전체보기 모달 ──────────────────────────────────────── */
const ImageViewerModal = memo(function ImageViewerModal({
  images,
  initialIndex,
  visible,
  onClose,
  charName }: {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  charName: string;
}) {
  const [curIdx, setCurIdx] = useState(initialIndex);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCR_W);
      setCurIdx(idx);
    },
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={mv.overlay}>
        {/* 상단 바 */}
        <View style={mv.topBar}>
          <Text style={mv.charName}>{charName}</Text>
          <Text style={mv.counter}>{curIdx + 1} / {images.length}</Text>
          <PressableOpacity style={mv.closeBtn} onPress={onClose}>
            <X size={20} color="#F0F0F5" />
          </PressableOpacity>
        </View>

        {/* 이미지 슬라이더 */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={mv.scroll}
          contentOffset={{ x: initialIndex * SCR_W, y: 0 }}
        >
          {images.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={mv.img}
              contentFit="contain"
            />
          ))}
        </ScrollView>

        {/* 도트 인디케이터 */}
        {images.length > 1 && (
          <View style={mv.dots}>
            {images.map((_, i) => (
              <View key={i} style={[mv.dot, i === curIdx && mv.dotActive]} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
});

/* ─── 캐릭터 카드 ──────────────────────────────────────────────── */
interface CharacterProfile {
  id: number | string;
  name: string;
  isUser?: boolean;
  personality?: string;
  personalityExample?: string;
  age?: string | number;
  gender?: string;
  traits?: string;
  description?: string;
  imageUris: string[];
  emotions?: Record<string, number>;
}

interface CharacterProfileCardProps {
  character: CharacterProfile;
  index: number;
  onChatPress: (char: CharacterProfile) => void;
  applyName: (s?: string) => string;
  t?: Record<string, string | undefined>;
}

const CharacterProfileCard = memo(function CharacterProfileCard({
  character, index, onChatPress, applyName, t }: CharacterProfileCardProps) {
  const [showModal, setShowModal] = useState(false);
  const images = character.imageUris.length > 0
    ? character.imageUris
    : [];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify().damping(22)}
      style={c.card}
    >
      <View style={c.mainRow}>
        {/* 캐릭터 이미지 (왼쪽) - 터치하면 대화 시작 */}
        <PressableOpacity
          onPress={() => {
            if (!character.isUser) {
              onChatPress(character);
            } else if (images.length > 0) {
              setShowModal(true);
            }
          }}
          activeOpacity={0.9}
          style={c.imgContainer}
        >
          {images.length > 0 ? (
            <Image
              source={{ uri: images[0] }}
              style={c.mainImg}
              contentFit="cover"
            />
          ) : (
            <View style={[c.mainImg, c.placeholder]}>
              <Text style={c.placeholderTxt}>{character.name?.[0]}</Text>
            </View>
          )}
        </PressableOpacity>

        {/* 정보 영역 (오른쪽) */}
        <View style={c.infoArea}>
          <View style={c.nameAgeRow}>
            <Text style={c.nameTxt}>{applyName(character.name)}</Text>
            {!!character.age && (
              <Text style={c.ageTxt}>{character.age}{t?.ageUnit ?? ''}</Text>
            )}
            {character.isUser && (
              <View style={c.userBadge}><Text style={c.userBadgeTxt}>{t?.protagonistLabel ?? ''}</Text></View>
            )}
          </View>
          
          <Text style={c.specsTxt} numberOfLines={3}>
            {applyName(character.personality || character.description || '')}
          </Text>
        </View>
      </View>

      {/* 감정 바 (선택적) */}
      {!character.isUser && character.emotions && (
        <View style={c.emotionTopMargin}>
          <EmotionBars emotions={character.emotions} t={t} />
        </View>
      )}

      {/* 이미지 전체보기 모달 */}
      {images.length > 0 && showModal && (
        <ImageViewerModal
          images={images}
          initialIndex={0}
          visible={showModal}
          onClose={() => setShowModal(false)}
          charName={character.name}
        />
      )}
    </Animated.View>
  );
});

/* ─── 메인 섹션 컴포넌트 ────────────────────────────────────────── */
export interface StoryDetailCharactersSectionProps {
  characters: CharacterProfile[];
  onChatPress: (char: CharacterProfile) => void;
  applyName: (s?: string) => string;
  t?: Record<string, string | undefined>;
  isRTL?: boolean;
  onViewAllPress?: () => void;
}

export function StoryDetailCharactersSection({
  characters,
  onChatPress,
  applyName,
  t,
  isRTL,
  onViewAllPress }: StoryDetailCharactersSectionProps) {
  if (!characters || characters.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(140).springify()}
      style={sec.wrap}
    >
      {/* 섹션 헤더 */}
      <View style={[sec.header, isRTL && sec.rtl]}>
        <View style={sec.titleWrap}>
          <ShieldCheck size={14} color="#D4A853" />
          <Text style={sec.title}>{t?.characters ?? ''}</Text>
          <View style={sec.countBadge}>
            <Text style={sec.countText}>{characters.length}</Text>
          </View>
        </View>
        {onViewAllPress && characters.length > 2 && (
          <PressableOpacity onPress={onViewAllPress} style={sec.viewAll}>
            <Text style={sec.viewAllText}>{t?.viewAll ?? ''}</Text>
            <ChevronRight size={13} color="#D4A853" />
          </PressableOpacity>
        )}
      </View>

      {/* 캐릭터 카드 목록 */}
      <View style={sec.list}>
        {characters.map((char, idx) => (
          <CharacterProfileCard
            key={String(char.id)}
            character={char}
            index={idx}
            onChatPress={onChatPress}
            applyName={applyName}
            t={t}
          />
        ))}
      </View>
    </Animated.View>
  );
}

/* ─── 상수 ───────────────────────────────────────────────────────── */
/* ─── 스타일 ─────────────────────────────────────────────────────── */
const sec = StyleSheet.create({
  wrap: { marginTop: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12 },
  rtl: { flexDirection: 'row-reverse' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 15, fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5', letterSpacing: -0.2 },
  countBadge: {
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderRadius: 99, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.3)' },
  countText: { fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#D4A853' },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#D4A853' },
  list: { gap: 10, paddingHorizontal: 14 } });

const c = StyleSheet.create({
  card: {
    backgroundColor: '#0C0C14',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1A1A24' },
  mainRow: { flexDirection: 'row', gap: 14 },
  imgContainer: {
    width: 88,
    height: 110,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#16161E' },
  mainImg: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderTxt: { color: '#3A3A4E', fontSize: 24, fontWeight: '800' },
  
  infoArea: { flex: 1, justifyContent: 'center', gap: 6 },
  nameAgeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  nameTxt: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  ageTxt: { fontSize: 12, color: '#656580', fontFamily: Typography.fontFamily.medium },
  
  userBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderRadius: 4, borderWidth: 0.5, borderColor: 'rgba(96,165,250,0.3)' },
  userBadgeTxt: { fontSize: 9, color: '#60A5FA', fontWeight: '700' },
  
  specsTxt: {
    fontSize: 13, color: '#8A8A9E',
    lineHeight: 18, fontFamily: Typography.fontFamily.regular },
  
  chatBtnSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 4 },
  chatBtnSmallTxt: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  emotionTopMargin: { marginTop: 10 } });

const em = StyleSheet.create({
  wrap: {
    marginHorizontal: 14, marginBottom: 14,
    backgroundColor: '#111118',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1, borderColor: '#1A1A24' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  headerText: {
    fontSize: 11, fontFamily: Typography.fontFamily.semibold,
    color: '#D4A853', letterSpacing: 0.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#797990', width: 42 },
  track: { flex: 1, height: 4, backgroundColor: '#111118', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  val: { fontSize: 11, fontFamily: Typography.fontFamily.semibold, width: 20, textAlign: 'right' } });

const mv = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  charName: {
    flex: 1, fontSize: 16, fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' },
  counter: { fontSize: 13, fontFamily: Typography.fontFamily.medium, color: '#797990', marginRight: 12 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#181820',
    alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  img: { width: SCR_W, height: SCR_H * 0.75 },
  dots: {
    flexDirection: 'row', gap: 6,
    alignSelf: 'center', paddingBottom: 50 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#3A3A4E' },
  dotActive: { backgroundColor: '#D4A853', width: 14 } });
