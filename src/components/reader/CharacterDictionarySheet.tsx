import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeInUp,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { X, ChevronDown, ChevronUp, BookOpen, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';
import type { ReaderPanelTheme } from '../../screens/webnovel/WebNovelEmotionPanel';
import type { WNEmotions } from '../../utils/webNovelStorage';

export interface NovelCharacter {
  id?: string | number;
  name: string;
  role?: string;
  description?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  image?: string;
  imageUri?: string;
  personality?: string;
  traits?: string;
  initialEmotions?: { e1: number; e2: number; e3: number; e4: number; e5: number };
}

interface CharacterDictionarySheetProps {
  visible: boolean;
  onClose: () => void;
  characters: NovelCharacter[];
  novelTitle?: string;
  liveEmotions?: Record<number, WNEmotions>;
  prevLiveEmotions?: Record<number, WNEmotions>;
  themeColors?: ReaderPanelTheme;
}

function alpha(hex: string, suffix: string, fallback: string) {
  'worklet';
  return hex?.startsWith('#') && hex.length === 7 ? `${hex}${suffix}` : fallback;
}

const BADGE_COLORS = [
  '#D4A853', '#FF5555', '#60A5FA', '#4ADE80',
  '#F59E0B', '#8B5CF6', '#F472B6', '#2DD4BF',
];

const EMOTION_KEYS = [
  { key: 'e1' as const, color: '#FF5555' },
  { key: 'e2' as const, color: '#60A5FA' },
  { key: 'e3' as const, color: '#4ADE80' },
  { key: 'e4' as const, color: '#F59E0B' },
  { key: 'e5' as const, color: '#8B5CF6' },
];

function getBadgeColor(name: string, idx: number): string {
  let hash = idx;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 0xffff;
  return BADGE_COLORS[hash % BADGE_COLORS.length] ?? '#D4A853';
}

function InitialBadge({
  name,
  idx,
  theme,
}: {
  name: string;
  idx: number;
  theme: ReaderPanelTheme;
}) {
  const color = getBadgeColor(name, idx);
  const initial = name?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={[b.outer, { borderColor: alpha(color, '55', color) }]}>
      <View style={[b.inner, { backgroundColor: alpha(theme.secondary, '14', 'rgba(255,255,255,0.06)') }]}>
        <Text style={[b.text, { color }]}>{initial}</Text>
      </View>
    </View>
  );
}

function EmotionGaugeRow({
  label,
  color,
  baseValue,
  currValue,
  secondary,
}: {
  label: string;
  color: string;
  baseValue: number;
  currValue: number;
  secondary: string;
}) {
  const basePct = ((baseValue + 100) / 200) * 100;
  const currPct = ((currValue + 100) / 200) * 100;
  const baseAnim = useSharedValue(basePct);
  const currAnim = useSharedValue(currPct);

  React.useEffect(() => {
    baseAnim.value = withTiming(basePct, { duration: 240 });
    currAnim.value = withTiming(currPct, { duration: 300 });
  }, [baseAnim, basePct, currAnim, currPct]);

  const baseStyle = useAnimatedStyle(() => ({
    width: `${baseAnim.value}%`,
    backgroundColor: alpha(color, '30', 'rgba(255,255,255,0.12)'),
  }));

  const deltaStyle = useAnimatedStyle(() => {
    const start = Math.min(baseAnim.value, currAnim.value);
    const width = Math.abs(currAnim.value - baseAnim.value);
    return {
      left: `${start}%`,
      width: `${width}%`,
      backgroundColor: currValue >= baseValue ? color : '#FF7777',
    };
  });

  return (
    <View style={g.row}>
      <Text style={[g.label, { color }]}>{label}</Text>
      <View style={[g.track, { backgroundColor: alpha(secondary, '14', 'rgba(255,255,255,0.08)') }]}>
        <Animated.View style={[g.baseFill, baseStyle]} />
        <Animated.View style={[g.deltaFill, deltaStyle]} />
        <View style={[g.centerLine, { backgroundColor: alpha(secondary, '55', 'rgba(255,255,255,0.34)') }]} />
      </View>
      <Text style={[g.value, { color: currValue >= 0 ? color : secondary }]}>
        {currValue > 0 ? `+${currValue}` : `${currValue}`}
      </Text>
    </View>
  );
}

function CharacterCard({
  character,
  idx,
  liveEmotions,
  prevLiveEmotions,
  theme,
  emotionLabels,
  noInfoLabel,
  appearanceLabel,
  personalityLabel,
  emotionLabel,
  ageSuffix,
}: {
  character: NovelCharacter;
  idx: number;
  liveEmotions?: Record<number, WNEmotions>;
  prevLiveEmotions?: Record<number, WNEmotions>;
  theme: ReaderPanelTheme;
  emotionLabels: string[];
  noInfoLabel: string;
  appearanceLabel: string;
  personalityLabel: string;
  emotionLabel: string;
  ageSuffix: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyHeight = useSharedValue(0);
  const bodyStyle = useAnimatedStyle(() => ({
    maxHeight: bodyHeight.value,
    overflow: 'hidden',
  }));

  const charId = typeof character.id === 'number'
    ? character.id
    : typeof character.id === 'string'
      ? parseInt(character.id, 10)
      : -1;

  const live = charId >= 0 ? liveEmotions?.[charId] ?? null : null;
  const prev = charId >= 0 ? prevLiveEmotions?.[charId] ?? null : null;
  const initial = character.initialEmotions
    ? {
        e1: character.initialEmotions.e1,
        e2: character.initialEmotions.e2,
        e3: character.initialEmotions.e3,
        e4: character.initialEmotions.e4,
        e5: character.initialEmotions.e5,
      }
    : null;

  const currentEmotions = live ?? initial;
  const previousEmotions = prev ?? initial;
  const appearance = character.appearance || character.traits;
  const personality = character.description || character.personality;
  const hasDetails = !!appearance || !!personality || !!currentEmotions;

  const toggle = () => {
    if (!hasDetails) return;
    const next = !expanded;
    setExpanded(next);
    bodyHeight.value = withTiming(next ? 720 : 0, { duration: 220 });
  };

  return (
    <Animated.View entering={FadeInUp.delay(idx * 36).duration(220)} style={[c.card, { backgroundColor: alpha(theme.secondary, '0E', 'rgba(255,255,255,0.04)'), borderColor: alpha(theme.secondary, '1E', 'rgba(255,255,255,0.08)') }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={toggle} style={c.header}>
        <InitialBadge name={character.name} idx={idx} theme={theme} />

        <View style={c.meta}>
          <Text style={[c.name, { color: theme.text }]} numberOfLines={1}>{character.name}</Text>
          <View style={c.chips}>
            {!!character.role && (
              <View style={[c.chip, { backgroundColor: alpha('#D4A853', '18', 'rgba(212,168,83,0.10)') }]}>
                <Text style={[c.chipText, c.chipTextGold]}>{character.role}</Text>
              </View>
            )}
            {!!character.age && (
              <View style={[c.chip, { backgroundColor: alpha(theme.secondary, '12', 'rgba(255,255,255,0.05)') }]}>
                <Text style={[c.chipText, { color: theme.secondary }]}>{character.age}{ageSuffix}</Text>
              </View>
            )}
            {!!character.gender && (
              <View style={[c.chip, { backgroundColor: alpha(theme.secondary, '12', 'rgba(255,255,255,0.05)') }]}>
                <Text style={[c.chipText, { color: theme.secondary }]}>{character.gender}</Text>
              </View>
            )}
            {!character.role && !character.age && !character.gender && (
              <Text style={[c.noInfo, { color: theme.secondary }]}>{noInfoLabel}</Text>
            )}
          </View>
        </View>

        {hasDetails && (
          expanded
            ? <ChevronUp size={16} color={theme.secondary} />
            : <ChevronDown size={16} color={theme.secondary} />
        )}
      </TouchableOpacity>

      {hasDetails && (
        <Animated.View style={bodyStyle}>
          <View style={[c.body, { borderTopColor: alpha(theme.secondary, '18', 'rgba(255,255,255,0.06)') }]}>
            {!!appearance && (
              <View style={c.section}>
                <Text style={[c.sectionLabel, { color: theme.secondary }]}>{appearanceLabel}</Text>
                <Text style={[c.sectionText, { color: theme.text }]}>{appearance}</Text>
              </View>
            )}

            {!!personality && (
              <View style={c.section}>
                <Text style={[c.sectionLabel, { color: theme.secondary }]}>{personalityLabel}</Text>
                <Text style={[c.sectionText, { color: theme.text }]}>{personality}</Text>
              </View>
            )}

            {!!currentEmotions && !!previousEmotions && (
              <View style={c.section}>
                <View style={c.sectionHeader}>
                  <Text style={[c.sectionLabel, { color: theme.secondary }]}>{emotionLabel}</Text>
                  {live && (
                    <View style={c.liveChip}>
                      <View style={c.liveDot} />
                      <Text style={c.liveText}>LIVE</Text>
                    </View>
                  )}
                </View>
                {EMOTION_KEYS.map((meta, index) => (
                  <EmotionGaugeRow
                    key={meta.key}
                    label={emotionLabels[index] ?? meta.key}
                    color={meta.color}
                    baseValue={previousEmotions[meta.key] ?? 0}
                    currValue={currentEmotions[meta.key] ?? 0}
                    secondary={theme.secondary}
                  />
                ))}
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function EmptyState({
  title,
  description,
  theme,
}: {
  title: string;
  description: string;
  theme: ReaderPanelTheme;
}) {
  return (
    <View style={e.wrap}>
      <View style={[e.iconBox, { backgroundColor: alpha(theme.secondary, '10', 'rgba(255,255,255,0.05)'), borderColor: alpha(theme.secondary, '1E', 'rgba(255,255,255,0.08)') }]}>
        <Users size={28} color={theme.secondary} />
      </View>
      <Text style={[e.title, { color: theme.text }]}>{title}</Text>
      <Text style={[e.description, { color: theme.secondary }]}>{description}</Text>
    </View>
  );
}

export function CharacterDictionarySheet({
  visible,
  onClose,
  characters,
  novelTitle,
  liveEmotions,
  prevLiveEmotions,
  themeColors,
}: CharacterDictionarySheetProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useLanguageStore(s => s.t);
  const drawerWidth = Math.min(400, Math.round(width * 0.84));
  const theme = themeColors ?? { bg: '#0C0C18', text: '#F0F0F5', secondary: '#8A8A9E' };

  const emotionLabels = useMemo(
    () => ['Empathy', 'Trust', 'Anger', 'Arousal', 'Fear'],
    [],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar backgroundColor="transparent" translucent barStyle={theme.bg === '#FAFAFA' ? 'dark-content' : 'light-content'} />
      <TouchableOpacity style={sh.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        entering={SlideInRight.duration(260)}
        exiting={SlideOutRight.duration(220)}
        style={[
          sh.sheet,
          {
            width: drawerWidth,
            backgroundColor: theme.bg,
            borderLeftColor: alpha(theme.secondary, '22', 'rgba(255,255,255,0.08)'),
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom, 18),
          },
        ]}
      >
        <View style={[sh.header, { borderBottomColor: alpha(theme.secondary, '18', 'rgba(255,255,255,0.06)') }]}>
          <View style={sh.headerMeta}>
            <Text style={[sh.title, { color: theme.text }]}>{t?.charInfo}</Text>
            {!!novelTitle && <Text style={[sh.subtitle, { color: theme.secondary }]} numberOfLines={1}>{novelTitle}</Text>}
          </View>
          <TouchableOpacity style={[sh.closeBtn, { backgroundColor: alpha(theme.secondary, '10', 'rgba(255,255,255,0.05)') }]} onPress={onClose}>
            <X size={18} color={theme.secondary} />
          </TouchableOpacity>
        </View>

        {characters.length > 0 && (
          <View style={[sh.countRow, { borderBottomColor: alpha(theme.secondary, '12', 'rgba(255,255,255,0.05)') }]}>
            <BookOpen size={12} color={theme.secondary} />
            <Text style={[sh.countText, { color: theme.secondary }]}>{characters.length}</Text>
            {!!liveEmotions && (
              <View style={c.liveChip}>
                <View style={c.liveDot} />
                <Text style={c.liveText}>LIVE</Text>
              </View>
            )}
          </View>
        )}

        <ScrollView
          style={sh.list}
          contentContainerStyle={sh.content}
          showsVerticalScrollIndicator={false}
        >
          {characters.length === 0
            ? (
                <EmptyState
                  title={t?.charInfo}
                  description={t?.noInfoLabel}
                  theme={theme}
                />
              )
            : characters.map((character, idx) => (
                <CharacterCard
                  key={character.id != null ? String(character.id) : `char-${idx}`}
                  character={character}
                  idx={idx}
                  liveEmotions={liveEmotions}
                  prevLiveEmotions={prevLiveEmotions}
                  theme={theme}
                  emotionLabels={emotionLabels}
                  noInfoLabel={t?.noInfoLabel}
                  appearanceLabel={t?.charTraitsLabel}
                  personalityLabel={t?.charPersonalityLabel}
                  emotionLabel={t?.emotionEffects}
                  ageSuffix={t?.ageSuffix ?? ''}
                />
              ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const b = StyleSheet.create({
  outer: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
  },
});

const g = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    width: 52,
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  baseFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  deltaFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    zIndex: 1,
  },
  value: {
    width: 34,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: Typography.fontFamily.semibold,
  },
});

const c = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  meta: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semibold,
  },
  chipTextGold: {
    color: '#D4A853',
  },
  noInfo: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
  },
  body: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  sectionText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.regular,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,68,68,0.10)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FF5555',
  },
  liveText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    color: '#FF6666',
  },
});

const e = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
  },
  description: {
    fontSize: 12,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.regular,
  },
});

const sh = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerMeta: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
  },
});
