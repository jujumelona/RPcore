import { Typography } from '../../../constants/tokens';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { ArrowLeft, MoreVertical } from 'lucide-react-native';
import { makeA11yProps } from '../../../utils/a11yProps';
import { useHaptic } from '../../../hooks/useHaptic';
import { triggerHaptic } from '../../../utils/haptics';
import type { StoryCharacter } from '../../../types/StoryContract';

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  characters: StoryCharacter[];
  isSoundEnabled: boolean;
  modelBadgeLabel?: string;
  modelBadgeTone?: 'gold' | 'silver' | 'red' | 'neutral';
  statusLabel?: string;
  statusTone?: 'gold' | 'silver' | 'red' | 'neutral';
  onBack: () => void;
  onMenu: () => void;
  onCharacters: () => void;
  onSettings: () => void;
  onSoundToggle: () => void;
  topInset?: number;
}

const HIT_SLOP = { top: 10, bottom: 10, left: 8, right: 8 };

export const ChatHeader: React.FC<ChatHeaderProps> = React.memo(({
  title,
  characters,
  modelBadgeLabel,
  modelBadgeTone = 'neutral',
  statusLabel,
  statusTone = 'neutral',
  onBack,
  onMenu,
  onCharacters,
  topInset = 0,
}) => {
  const { trigger } = useHaptic();
  const metaBadges = [
    statusLabel ? { key: 'status', label: statusLabel, tone: statusTone } : null,
    modelBadgeLabel ? { key: 'model', label: modelBadgeLabel, tone: modelBadgeTone } : null,
  ]
    .filter(Boolean)
    .reduce<Array<{ key: string; label: string; tone: 'gold' | 'silver' | 'red' | 'neutral' }>>((acc, badge) => {
      const nextBadge = badge as { key: string; label: string; tone: 'gold' | 'silver' | 'red' | 'neutral' };
      if (acc.some(existing => existing.label === nextBadge.label)) return acc;
      acc.push(nextBadge);
      return acc;
    }, []);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <StatusBar barStyle="light-content" backgroundColor="#050507" />

      <View style={[styles.header, { paddingTop: Math.max(topInset, 0) }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => { triggerHaptic('select'); trigger('light'); onBack(); }}
          hitSlop={HIT_SLOP}
          {...makeA11yProps({ label: 'Go back', role: 'button' })}
        >
          <ArrowLeft size={20} color="#EEF2F7" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.titlePill}
          activeOpacity={0.92}
          onPress={() => { trigger('light'); onCharacters(); }}
          {...makeA11yProps({ label: 'Open characters', role: 'button' })}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {metaBadges.length > 0 ? (
              <View style={styles.metaRow}>
                {metaBadges.map(badge => (
                  <View
                    key={badge.key}
                    style={[
                      styles.metaBadge,
                      badge.tone === 'gold' && styles.metaBadgeGold,
                      badge.tone === 'silver' && styles.metaBadgeSilver,
                      badge.tone === 'red' && styles.metaBadgeRed,
                    ]}
                  >
                    <Text style={styles.metaBadgeText} numberOfLines={1}>
                      {badge.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => { trigger('light'); onMenu(); }}
          hitSlop={HIT_SLOP}
          {...makeA11yProps({ label: 'More options', role: 'button' })}
        >
          <MoreVertical size={18} color="#EEF2F7" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

ChatHeader.displayName = 'ChatHeader';

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#050507',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 3,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#0F141B',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.10)',
  },
  titlePill: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#0C1016',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.08)',
  },
  titleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F7F9FC',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
  },
  metaBadge: {
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  metaBadgeGold: {
    backgroundColor: 'rgba(212,168,83,0.16)',
    borderColor: 'rgba(212,168,83,0.28)',
  },
  metaBadgeSilver: {
    backgroundColor: 'rgba(203,213,225,0.14)',
    borderColor: 'rgba(203,213,225,0.22)',
  },
  metaBadgeRed: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderColor: 'rgba(239,68,68,0.22)',
  },
  metaBadgeText: {
    color: '#F7F9FC',
    fontSize: 9,
    fontFamily: Typography.fontFamily.medium,
  },
});
