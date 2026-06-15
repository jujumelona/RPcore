
import { Typography } from '../../constants/tokens';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { EmotionUITier } from '../../components/emotion/emotionTier';
import type { UIPhrases } from '../../i18n/uiPhrases';
import type { WNCharacter, WNEmotions } from '../../utils/webNovelStorage';
import { ArrowLeft, ArrowRight, Ban, Bell, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Eye, Flag, Heart, MoreHorizontal, MoreVertical, PenLine, Plus, Search, Settings, Sparkles, Trash2, User, X, XCircle } from 'lucide-react-native';

const _W_text3 = '#797990';

// ── lucide 동적 아이콘 헬퍼 (react-native-vector-icons 대체) ─────
const _ICON_MAP: Record<string, any> = {
  'chevron-up':ChevronUp,'chevron-down':ChevronDown,'chevron-back':ChevronLeft,
  'chevron-forward':ChevronRight,'close':X,'close-outline':X,'checkmark':Check,
  'heart':Heart,'heart-outline':Heart,'person':User,'person-circle-outline':User,
  'search':Search,'settings-outline':Settings,'notifications-outline':Bell,
  'create':PenLine,'create-outline':PenLine,'trash-outline':Trash2,
  'arrow-back':ArrowLeft,'arrow-forward':ArrowRight,'ellipsis-vertical':MoreVertical,
  'ellipsis-horizontal':MoreHorizontal,'sparkles':Sparkles,'sparkles-outline':Sparkles,
  'add':Plus,'close-circle':XCircle,'eye-outline':Eye,'copy-outline':Copy,
  'bookmark-outline':Bookmark,'flag-outline':Flag,'ban-outline':Ban };
function _RenderIcon({name,size=20,color='#fff',style}:{name:string;size?:number;color?:string;style?:any}){
  const Icon=_ICON_MAP[name]; if(!Icon) return null;
  return <Icon size={size} color={color} style={style??undefined}/>;
}


const WN_EMOTION_TIER: Record<EmotionUITier, {
  labelFont: number;
  labelWidth: number;
  trackHeight: number;
  valueFont: number;
  valueWidth: number;
  rowGap: number;
  rowMarginBottom: number;
  panelGap: number;
  panelMarginRight: number;
  avatarWrapWidth: number;
  avatarSize: number;
  initialFont: number;
  nameFont: number;
  gaugeMinWidth: number;
  maxHeight: number;
  togglePaddingV: number;
  toggleFont: number;
  iconSize: number;
  scrollPadH: number;
  scrollPadTop: number;
  scrollPadBottom: number;
  bottomInsetCut: number;
}> = {
  low: {
    labelFont: 8,
    labelWidth: 20,
    trackHeight: 2,
    valueFont: 8,
    valueWidth: 24,
    rowGap: 2,
    rowMarginBottom: 0,
    panelGap: 5,
    panelMarginRight: 8,
    avatarWrapWidth: 32,
    avatarSize: 26,
    initialFont: 10,
    nameFont: 8,
    gaugeMinWidth: 100,
    maxHeight: 84,
    togglePaddingV: 2,
    toggleFont: 8,
    iconSize: 10,
    scrollPadH: 8,
    scrollPadTop: 1,
    scrollPadBottom: 3,
    bottomInsetCut: 8 },
  mid: {
    labelFont: 9,
    labelWidth: 22,
    trackHeight: 3,
    valueFont: 9,
    valueWidth: 26,
    rowGap: 3,
    rowMarginBottom: 1,
    panelGap: 6,
    panelMarginRight: 10,
    avatarWrapWidth: 34,
    avatarSize: 28,
    initialFont: 11,
    nameFont: 8,
    gaugeMinWidth: 108,
    maxHeight: 96,
    togglePaddingV: 3,
    toggleFont: 9,
    iconSize: 11,
    scrollPadH: 10,
    scrollPadTop: 2,
    scrollPadBottom: 4,
    bottomInsetCut: 6 },
  high: {
    labelFont: 10,
    labelWidth: 24,
    trackHeight: 4,
    valueFont: 10,
    valueWidth: 28,
    rowGap: 3,
    rowMarginBottom: 1,
    panelGap: 7,
    panelMarginRight: 11,
    avatarWrapWidth: 36,
    avatarSize: 30,
    initialFont: 12,
    nameFont: 9,
    gaugeMinWidth: 114,
    maxHeight: 108,
    togglePaddingV: 4,
    toggleFont: 10,
    iconSize: 12,
    scrollPadH: 11,
    scrollPadTop: 2,
    scrollPadBottom: 5,
    bottomInsetCut: 4 } };

function EmotionGauge({
  meta,
  value,
  tier }: {
  meta: UIPhrases['emotionMeta'][number];
  value: number;
  tier: EmotionUITier;
}) {
  const m = WN_EMOTION_TIER[tier];
  const animVal = useSharedValue(value);

  useEffect(() => {
    animVal.value = withTiming(value, { duration: 400 });
  }, [value, animVal]);

  const fillStyle = useAnimatedStyle(() => {
    const pct = (animVal.value + 100) / 200;
    return { width: `${pct * 100}%`, backgroundColor: animVal.value >= 0 ? meta.color : _W_text3 };
  });

  return (
    <View style={[gStyles.row, { gap: m.rowGap, marginBottom: m.rowMarginBottom }]}>
      <Text style={[gStyles.label, { fontSize: m.labelFont, width: m.labelWidth }]}>{meta.title}</Text>
      <View style={[gStyles.track, { height: m.trackHeight }] }>
        <View style={gStyles.center} />
        <Animated.View style={[gStyles.fill, fillStyle]} />
      </View>
      <Text style={[gStyles.val, { fontSize: m.valueFont, width: m.valueWidth, color: value >= 0 ? meta.color : '#8A8A9E' }]}>
        {value > 0 ? `+${value}` : `${value}`}
      </Text>
    </View>
  );
}

function CharEmotionPanel({
  character,
  emotions,
  tier,
  phrases }: {
  character: WNCharacter;
  emotions: WNEmotions;
  tier: EmotionUITier;
  phrases: UIPhrases;
}) {
  const m = WN_EMOTION_TIER[tier];
  const avatarSize = m.avatarSize;

  return (
    <View style={[cpStyles.panel, { gap: m.panelGap, marginRight: m.panelMarginRight }]}>
      <View style={[cpStyles.avatarWrap, { width: m.avatarWrapWidth }]}>
        {character.imageUri
          ? <Image source={{ uri: character.imageUri }} style={[cpStyles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]} />
          : <View style={[cpStyles.avatar, cpStyles.fallback, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}><Text style={[cpStyles.initial, { fontSize: m.initialFont }]}>{character.name[0] ?? '?'}</Text></View>
        }
        <Text style={[cpStyles.name, { fontSize: m.nameFont, maxWidth: m.avatarWrapWidth }]} numberOfLines={1}>{character.name}</Text>
      </View>
      <View style={[cpStyles.gauges, { minWidth: m.gaugeMinWidth }]}>
        {phrases.emotionMeta.map(meta => <EmotionGauge key={meta.key} meta={meta} value={emotions[meta.key] ?? 0} tier={tier} />)}
      </View>
    </View>
  );
}

interface WebNovelEmotionStatusBarProps {
  characters: WNCharacter[];
  currentEmotions: Record<number, WNEmotions>;
  visible: boolean;
  onToggle: () => void;
  tier: EmotionUITier;
  phrases: UIPhrases;
  basisLabel?: string;
}

export function WebNovelEmotionStatusBar({
  characters,
  currentEmotions,
  visible,
  onToggle,
  tier,
  phrases,
  basisLabel,
}: WebNovelEmotionStatusBarProps) {
  const visChars = characters.filter(c => c.id >= 2);
  const m = WN_EMOTION_TIER[tier];
  const barH = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    barH.value = withSpring(visible ? 1 : 0, { damping: 18, stiffness: 120 });
  }, [visible, barH]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: barH.value,
    maxHeight: barH.value * m.maxHeight,
    overflow: 'hidden' }));

  if (visChars.length === 0) return null;

  return (
    <View style={sbStyles.outer}>
      <Pressable style={[sbStyles.toggle, { paddingVertical: m.togglePaddingV }]} onPress={onToggle}>
        <_RenderIcon name={visible ? 'chevron-down' : 'chevron-up'} size={m.iconSize} color={'#797990'} />
        <Text style={[sbStyles.toggleTxt, { fontSize: m.toggleFont }]}>{visible ? phrases.emotionStatusHide : phrases.emotionStatusShow}</Text>
        {!!basisLabel && (
          <Text style={[sbStyles.basisTxt, { fontSize: Math.max(8, m.toggleFont - 1) }]} numberOfLines={1}>
            {basisLabel}
          </Text>
        )}
      </Pressable>
      <Animated.View style={containerStyle}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[sbStyles.scroll, { paddingHorizontal: m.scrollPadH, paddingBottom: m.scrollPadBottom, paddingTop: m.scrollPadTop }]}
        >
          {visChars.map(c => (
            <CharEmotionPanel
              key={c.id}
              character={c}
              emotions={currentEmotions[c.id] ?? { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 }}
              tier={tier}
              phrases={phrases}
            />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export const WEBNOVEL_EMOTION_UI = WN_EMOTION_TIER;

const gStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 1 },
  label: { color: '#8A8A9E', fontSize: 9, width: 22, textAlign: 'right' },
  track: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' },
  center:{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#757585', zIndex: 1 },
  fill:  { height: '100%', borderRadius: 2 },
  val:   { fontSize: 9, width: 26, textAlign: 'right', fontFamily: Typography.fontFamily.semibold } });

const cpStyles = StyleSheet.create({
  panel:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 10 },
  avatarWrap: { alignItems: 'center', width: 34 },
  avatar:     { width: 28, height: 28, borderRadius: 14 },
  fallback:   { backgroundColor: '#181820', alignItems: 'center', justifyContent: 'center' },
  initial:    { color: '#C8C8D4', fontSize: 11, fontFamily: Typography.fontFamily.bold },
  name:       { color: '#8A8A9E', fontSize: 8, marginTop: 1, maxWidth: 34, textAlign: 'center' },
  gauges:     { flex: 1, justifyContent: 'center', minWidth: 108 } });

const sbStyles = StyleSheet.create({
  outer:     { backgroundColor: 'rgba(10,10,10,0.9)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#181820' },
  toggle:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 3 },
  toggleTxt: { color: '#797990', fontSize: 9 },
  basisTxt:  { color: '#A3A3B4', fontFamily: Typography.fontFamily.regular, maxWidth: 180 },
  scroll:    { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 4, paddingTop: 2 } });
