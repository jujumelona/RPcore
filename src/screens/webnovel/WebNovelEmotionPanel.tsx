import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Typography } from '../../constants/tokens';
import type { UIPhrases } from '../../i18n/uiPhrases';
import type { WNCharacter, WNEmotions } from '../../utils/webNovelStorage';

export interface ReaderPanelTheme {
  bg: string;
  text: string;
  secondary: string;
}

interface WebNovelEmotionPanelProps {
  visible: boolean;
  onToggle: () => void;
  characters: WNCharacter[];
  currentEmotions: Record<number, WNEmotions>;
  phrases: UIPhrases;
  title: string;
  subtitle?: string;
  theme: ReaderPanelTheme;
}

function alpha(hex: string, suffix: string, fallback: string) {
  return hex?.startsWith('#') && hex.length === 7 ? `${hex}${suffix}` : fallback;
}

function EmotionMeter({
  label,
  value,
  color,
  secondary,
}: {
  label: string;
  value: number;
  color: string;
  secondary: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value + 100) / 200) * 100));

  return (
    <View style={m.row}>
      <Text style={[m.label, { color: secondary }]} numberOfLines={1}>{label}</Text>
      <View style={[m.track, { backgroundColor: alpha(secondary, '14', 'rgba(255,255,255,0.08)') }]}>
        <View style={[m.centerLine, { backgroundColor: alpha(secondary, '55', 'rgba(255,255,255,0.35)') }]} />
        <View
          style={[
            m.fill,
            {
              width: `${pct}%`,
              backgroundColor: value >= 0 ? color : alpha(secondary, '66', secondary),
            },
          ]}
        />
      </View>
      <Text style={[m.value, { color: value >= 0 ? color : secondary }]}>
        {value > 0 ? `+${value}` : `${value}`}
      </Text>
    </View>
  );
}

function CharacterEmotionRow({
  character,
  emotions,
  phrases,
  theme,
}: {
  character: WNCharacter;
  emotions: WNEmotions;
  phrases: UIPhrases;
  theme: ReaderPanelTheme;
}) {
  const initial = character.name?.[0] ?? '?';

  return (
    <View style={[r.item, { backgroundColor: alpha(theme.secondary, '0E', 'rgba(255,255,255,0.04)'), borderColor: alpha(theme.secondary, '20', 'rgba(255,255,255,0.08)') }]}>
      <View style={r.identity}>
        <View style={[r.initialBadge, { backgroundColor: alpha(theme.secondary, '18', 'rgba(255,255,255,0.08)') }]}>
          <Text style={[r.initialText, { color: theme.text }]}>{initial}</Text>
        </View>
        <Text style={[r.name, { color: theme.text }]} numberOfLines={1}>{character.name}</Text>
      </View>

      <View style={r.gauges}>
        {phrases.emotionMeta.map(meta => (
          <EmotionMeter
            key={meta.key}
            label={meta.title}
            value={emotions[meta.key] ?? 0}
            color={meta.color}
            secondary={theme.secondary}
          />
        ))}
      </View>
    </View>
  );
}

export function WebNovelEmotionPanel({
  visible,
  onToggle,
  characters,
  currentEmotions,
  phrases,
  title,
  subtitle,
  theme,
}: WebNovelEmotionPanelProps) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(320, Math.max(252, Math.round(width * 0.68)));
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 260 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * drawerWidth }],
    opacity: 0.88 + progress.value * 0.12,
  }));

  const tabStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * drawerWidth }],
  }));

  const emotionCharacters = useMemo(
    () => characters.filter(char => typeof char.id === 'number' && char.id >= 2),
    [characters],
  );

  if (emotionCharacters.length === 0) return null;

  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          p.panel,
          panelStyle,
          {
            width: drawerWidth,
            backgroundColor: theme.bg,
            borderColor: alpha(theme.secondary, '20', 'rgba(255,255,255,0.08)'),
          },
        ]}
      >
        <View style={[p.header, { borderBottomColor: alpha(theme.secondary, '18', 'rgba(255,255,255,0.06)') }]}>
          <Text style={[p.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {!!subtitle && (
            <Text style={[p.subtitle, { color: theme.secondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>

        <ScrollView
          style={p.scroll}
          contentContainerStyle={p.content}
          showsVerticalScrollIndicator={false}
        >
          {emotionCharacters.map(character => {
            const slot = currentEmotions[character.id] ?? { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
            return (
              <CharacterEmotionRow
                key={character.id}
                character={character}
                emotions={slot}
                phrases={phrases}
                theme={theme}
              />
            );
          })}
        </ScrollView>
      </Animated.View>

      <Animated.View style={[p.tabWrap, tabStyle]}>
        <Pressable
          onPress={onToggle}
          style={[
            p.tab,
            {
              backgroundColor: theme.bg,
              borderColor: alpha(theme.secondary, '28', 'rgba(255,255,255,0.10)'),
            },
          ]}
        >
          <View style={p.tabInner}>
            {visible
              ? <ChevronRight size={14} color={theme.secondary} />
              : <ChevronLeft size={14} color={theme.secondary} />}
          </View>
        </Pressable>
      </Animated.View>
    </>
  );
}

const p = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 118,
    right: 0,
    bottom: 24,
    zIndex: 56,
    borderLeftWidth: 1,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Typography.fontFamily.regular,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  tabWrap: {
    position: 'absolute',
    right: 0,
    top: '42%',
    zIndex: 57,
  },
  tab: {
    width: 24,
    height: 88,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderWidth: 1,
    borderRightWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ skewY: '-10deg' }],
  },
  tabInner: {
    transform: [{ skewY: '10deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const r = StyleSheet.create({
  item: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  initialBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
  },
  gauges: {
    gap: 7,
  },
});

const m = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    width: 44,
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    zIndex: 1,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  value: {
    width: 34,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: Typography.fontFamily.semibold,
  },
});
