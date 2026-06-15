import { Typography } from '../../../constants/tokens';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Bookmark } from 'lucide-react-native';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { makeA11yProps } from '../../../utils/a11yProps';
import { formatChatTextForDisplay } from '../../../utils/chatDisplayText';
import { useHaptic } from '../../../hooks/useHaptic';
import type { DrawerTab } from '../types/ChatTypes';
import type { ChatMessage } from '../types/ChatMessageTypes';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../../store/settingsStore';
import { useLanguageStore } from '../../../store/languageStore';

interface ChatDrawerProps {
  isVisible: boolean;
  currentTab: DrawerTab;
  width: number;
  onClose: () => void;
  onTabChange: (tab: DrawerTab) => void;
  summary?: React.ReactNode;
  children: React.ReactNode;
  topInset?: number;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isVisible,
  currentTab,
  width,
  onClose,
  onTabChange,
  summary,
  children,
  topInset = 0,
}) => {
  const { trigger } = useHaptic();
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const translateX = useSharedValue(width);
  const overlayOpacity = useSharedValue(0);

  React.useEffect(() => {
    translateX.value = withTiming(isVisible ? 0 : width, {
      duration: isVisible ? 240 : 210,
      easing: Easing.out(Easing.cubic),
    });
    overlayOpacity.value = withTiming(isVisible ? 1 : 0, {
      duration: isVisible ? 220 : 160,
      easing: Easing.out(Easing.quad),
    });
  }, [isVisible, width, overlayOpacity, translateX]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const tabs: Array<{ key: DrawerTab; label: string }> = [
    { key: 'characters', label: t?.drawerCharacters ?? '' },
    { key: 'history', label: t?.drawerHistory ?? '' },
    { key: 'settings', label: t?.drawerSettings ?? '' },
  ];

  return (
    <View style={styles.overlay} pointerEvents={isVisible ? 'auto' : 'none'}>
      <Animated.View style={[styles.scrim, overlayStyle]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { trigger('light'); onClose(); }}
        />
      </Animated.View>

      <Animated.View style={[styles.drawer, { width }, drawerStyle]}>
        <View style={[styles.header, { paddingTop: Math.max(topInset, 0) + 12 }]}>
          <Text style={styles.headerTitle}>{t?.drawerMenu ?? ''}</Text>
        </View>

        {summary ? <View style={styles.summaryWrap}>{summary}</View> : null}

        <View style={styles.tabList}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabChip, currentTab === tab.key && styles.tabChipActive]}
              onPress={() => { trigger('light'); onTabChange(tab.key); }}
              {...makeA11yProps({ label: `${tab.label} ${t?.drawerTabA11ySuffix ?? ''}`.trim(), role: 'tab', state: { selected: currentTab === tab.key } })}
            >
              <Text style={[styles.tabLabel, currentTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.content}>{children}</View>
      </Animated.View>
    </View>
  );
};

export const CharacterPanel: React.FC<{
  storyId?: string;
  characters: Array<{ id: number | string; name: string; profileUrl?: string }>;
  onCharacterSelect?: (characterId: string) => void;
  selectedCharacterId?: string;
}> = ({ characters, onCharacterSelect, selectedCharacterId }) => {
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const visible = useMemo(
    () => characters.filter(character => Number(character.id) >= 2),
    [characters],
  );

  const [selectedId, setSelectedId] = useState<number | null>(
    selectedCharacterId ? Number(selectedCharacterId) : (visible[0] ? Number(visible[0].id) : null),
  );

  React.useEffect(() => {
    setSelectedId(prev => {
      if (prev != null && visible.some(character => Number(character.id) === prev)) {
        return prev;
      }
      return visible[0] ? Number(visible[0].id) : null;
    });
  }, [visible]);

  const selected = visible.find(character => Number(character.id) === selectedId);
  return (
    <ScrollView style={styles.panelScroll} showsVerticalScrollIndicator={false}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.charChipRow}
        contentContainerStyle={styles.charChipContent}
      >
        {visible.map(character => {
          const active = Number(character.id) === selectedId;
          return (
            <TouchableOpacity
              key={String(character.id)}
              style={[styles.charChip, active && styles.charChipActive]}
              onPress={() => {
                setSelectedId(Number(character.id));
                onCharacterSelect?.(String(character.id));
              }}
            >
              {character.profileUrl ? (
                <Image source={{ uri: character.profileUrl }} style={styles.chipAvatar} contentFit="cover" />
              ) : (
                <View style={styles.chipAvatarFill}>
                  <Text style={styles.chipInitial}>{character.name[0]}</Text>
                </View>
              )}
              <Text style={[styles.chipName, active && styles.chipNameActive]}>
                {character.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selected ? (
        <View style={styles.characterCard}>
          <Text style={styles.sectionLabel}>{selected.name}</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTxt}>{t?.noCharacters ?? ''}</Text>
        </View>
      )}
    </ScrollView>
  );
};

export const SettingsPanel: React.FC<{
  onSettingChange: (key: string, value: any) => void;
  initialSettings?: Record<string, any>;
  onRestartStory?: () => void;
  restartLabel?: string;
}> = ({ onSettingChange, onRestartStory, restartLabel }) => {
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const {
    chatFontSize, setChatFontSize,
    streamingTyping, setStreamingTyping,
    showNarratorBubble, setShowNarratorBubble,
    hapticEnabled, setHapticEnabled,
  } = useSettingsStore(
    useShallow(s => ({
      chatFontSize: s.chatFontSize,
      setChatFontSize: s.setChatFontSize,
      streamingTyping: s.streamingTyping,
      setStreamingTyping: s.setStreamingTyping,
      showNarratorBubble: s.showNarratorBubble,
      setShowNarratorBubble: s.setShowNarratorBubble,
      hapticEnabled: s.hapticEnabled,
      setHapticEnabled: s.setHapticEnabled,
    })),
  );

  const fontOptions: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
  const fontLabel: Record<string, string> = { sm: 'A-', md: 'A', lg: 'A+' };

  return (
    <ScrollView style={styles.panelScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.settingGroup}>{t?.drawerDisplay ?? t?.display ?? ''}</Text>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{t?.drawerTextSize ?? t?.fontSizeTitle ?? ''}</Text>
        <View style={styles.segControl}>
          {fontOptions.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.segBtn, chatFontSize === opt && styles.segBtnActive]}
              onPress={() => { setChatFontSize(opt); onSettingChange('fontSize', opt); }}
            >
              <Text style={[styles.segBtnTxt, chatFontSize === opt && styles.segBtnTxtActive]}>
                {fontLabel[opt]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.flex1}>
          <Text style={styles.settingLabel}>{t?.drawerStreamingText ?? t?.sentenceFadeIn ?? ''}</Text>
          <Text style={styles.settingDesc}>{t?.drawerStreamingTextDesc ?? ''}</Text>
        </View>
        <Switch
          value={streamingTyping}
          onValueChange={value => { setStreamingTyping(value); onSettingChange('fadeIn', value); }}
          trackColor={{ true: '#D4A853', false: '#38384A' }}
          thumbColor="#F0F0F5"
        />
      </View>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{t?.drawerNarrationBubble ?? t?.showNarrator ?? ''}</Text>
        <Switch
          value={showNarratorBubble}
          onValueChange={value => { setShowNarratorBubble(value); onSettingChange('showNarratorBubble', value); }}
          trackColor={{ true: '#D4A853', false: '#38384A' }}
          thumbColor="#F0F0F5"
        />
      </View>

      <Text style={[styles.settingGroup, styles.settingGroupMt]}>{t?.drawerFeedback ?? t?.soundVibration ?? ''}</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t?.vibration ?? ''}</Text>
          <Switch
            value={hapticEnabled}
            onValueChange={value => { setHapticEnabled(value); onSettingChange('vibrate', value); }}
            trackColor={{ true: '#D4A853', false: '#38384A' }}
            thumbColor="#F0F0F5"
          />
        </View>

        {onRestartStory ? (
          <>
            <Text style={[styles.settingGroup, styles.settingGroupMt]}>{t?.drawerStory ?? ''}</Text>
            <TouchableOpacity style={styles.settingActionBtn} onPress={onRestartStory} activeOpacity={0.82}>
              <Text style={styles.settingActionBtnTxt}>{restartLabel ?? t?.drawerRestartFromBeginning ?? ''}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    );
  };

export const HistoryPanel: React.FC<{
  messages: ChatMessage[];
  userName?: string;
  onMessageSelect: (messageId: string) => void;
}> = ({ messages, userName, onMessageSelect }) => {
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const [filter, setFilter] = useState<'all' | 'ai' | 'bookmark'>('all');

  const filtered = messages.filter(message => {
    if (filter === 'ai') return message.role === 'ai';
    if (filter === 'bookmark') return message.bookmarked || message.isImportant;
    return message.role !== 'narrator';
  });

  const filterOptions: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: t?.drawerAll ?? t?.all ?? '' },
    { key: 'ai', label: t?.drawerAi ?? '' },
    { key: 'bookmark', label: t?.drawerBookmarks ?? '' },
  ];

  return (
    <View style={styles.panelFlex}>
      <View style={styles.filterRow}>
        {filterOptions.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterChip, filter === option.key && styles.filterChipActive]}
            onPress={() => setFilter(option.key)}
          >
            <Text style={[styles.filterChipTxt, filter === option.key && styles.filterChipTxtActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTxt}>{t?.noMessages ?? ''}</Text>
          </View>
        ) : (
          [...filtered].reverse().map((message, index) => (
            <TouchableOpacity
              key={message.id}
              style={[styles.historyItem, index < filtered.length - 1 && styles.historyItemBorder]}
              onPress={() => onMessageSelect(message.id)}
              activeOpacity={0.7}
            >
              <View style={styles.historyMeta}>
                <Text style={styles.historyRole}>
                  {message.role === 'user' ? (t?.drawerYou ?? '') : (message.characterName ?? t?.drawerAi ?? '')}
                </Text>
                {(message.bookmarked || message.isImportant) && (
                  <Bookmark size={11} color="rgba(212,168,83,0.7)" fill="rgba(212,168,83,0.24)" />
                )}
              </View>
              <Text style={styles.historyContent} numberOfLines={2}>
                {message.role === 'user'
                  ? message.content
                  : formatChatTextForDisplay(message.content ?? '', userName)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#050507',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.08)',
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F4FA',
  },
  summaryWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  tabList: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  tabChip: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#050507',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  tabChipActive: {
    backgroundColor: '#2A2314',
    borderColor: 'rgba(212,168,83,0.28)',
  },
  tabLabel: {
    fontSize: 12,
    color: '#8E96A5',
    fontFamily: Typography.fontFamily.medium,
  },
  tabLabelActive: {
    color: '#F4D37A',
    fontFamily: Typography.fontFamily.semibold,
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  panelScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  panelFlex: {
    flex: 1,
  },
  charChipRow: {
    marginBottom: 14,
  },
  charChipContent: {
    gap: 8,
    paddingRight: 10,
  },
  charChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  charChipActive: {
    borderColor: 'rgba(212,168,83,0.28)',
    backgroundColor: 'rgba(212,168,83,0.08)',
  },
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  chipAvatarFill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A313C',
  },
  chipInitial: {
    fontSize: 10,
    color: '#F0F4FA',
    fontFamily: Typography.fontFamily.bold,
  },
  chipName: {
    fontSize: 13,
    color: '#99A1B0',
    fontFamily: Typography.fontFamily.medium,
  },
  chipNameActive: {
    color: '#F4D37A',
  },
  characterCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 14,
  },
  sectionLabel: {
    fontSize: 13,
    color: '#F2F6FB',
    fontFamily: Typography.fontFamily.semibold,
    marginBottom: 12,
  },
  emotionRow: {
    marginBottom: 12,
  },
  emotionRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  emotionLabel: {
    fontSize: 11,
    color: '#8E96A5',
    fontFamily: Typography.fontFamily.medium,
  },
  emotionValue: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
  },
  emotionValuePos: { color: '#8B5CF6' },
  emotionValueNeg: { color: '#8E96A5' },
  emotionFillPos: { backgroundColor: '#8B5CF6' },
  emotionFillNeg: { backgroundColor: 'rgba(142,150,165,0.72)' },
  emotionTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emotionTrackCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    zIndex: 1,
  },
  emotionFill: {
    height: '100%',
    borderRadius: 999,
  },
  settingGroup: {
    fontSize: 11,
    color: '#7A8291',
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  settingGroupMt: {
    marginTop: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 14,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  settingLabel: {
    fontSize: 14,
    color: '#D6DCE7',
  },
  settingDesc: {
      fontSize: 11,
      color: '#7A8291',
      marginTop: 2,
    },
  settingActionBtn: {
      marginTop: 8,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: 'rgba(109,74,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(109,74,255,0.32)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
  settingActionBtnTxt: {
      fontSize: 14,
      color: '#E8DEFF',
      fontFamily: Typography.fontFamily.semibold,
    },
  segControl: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  segBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segBtnActive: {
    backgroundColor: '#D4A853',
  },
  segBtnTxt: {
    fontSize: 12,
    color: '#7A8291',
  },
  segBtnTxtActive: {
    color: '#12161C',
    fontFamily: Typography.fontFamily.bold,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterChipActive: {
    borderColor: 'rgba(212,168,83,0.28)',
    backgroundColor: 'rgba(212,168,83,0.10)',
  },
  filterChipTxt: {
    fontSize: 12,
    color: '#7A8291',
  },
  filterChipTxtActive: {
    color: '#F4D37A',
    fontFamily: Typography.fontFamily.semibold,
  },
  historyItem: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  historyItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  historyRole: {
    fontSize: 11,
    color: '#F4D37A',
    fontFamily: Typography.fontFamily.semibold,
  },
  historyContent: {
    fontSize: 13,
    color: '#A7AFBC',
    lineHeight: 18,
  },
  emptyState: {
    paddingVertical: 42,
    alignItems: 'center',
  },
  emptyTxt: {
    fontSize: 13,
    color: '#667080',
    fontFamily: Typography.fontFamily.regular,
  },
});
