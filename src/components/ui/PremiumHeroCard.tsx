﻿import { ComponentType, ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Sparkles, type LucideProps } from 'lucide-react-native';
import { Space, Typography as Typo } from '../../constants/tokens';
import { PremiumPanel } from './PremiumSurface';

interface PremiumHeroCardProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** @alias subtitle — PremiumScreenShell 하위 호환 */
  description?: string;
  /** lucide-react-native コンポーネント */
  icon?: ComponentType<LucideProps>;
  accent?: string;
  pills?: string[];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function PremiumHeroCard({
  eyebrow,
  title,
  subtitle,
  description,
  icon: IconComp = Sparkles,
  accent = '#D4A853',
  pills = [],
  style,
  children
  }: PremiumHeroCardProps) {
  // description은 subtitle의 alias (PremiumScreenShell 하위 호환)
  const resolvedSubtitle = subtitle ?? description;
  return (
    <PremiumPanel
      padding={Space['5']}
      style={[styles.card, style]}
      colors={['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
      borderColor={`${accent}3A`}
      glow
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent}22`, borderColor: `${accent}38` }]}>
          <IconComp size={18} color={accent} />
        </View>
        <View style={styles.copy}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {resolvedSubtitle ? <Text style={styles.subtitle}>{resolvedSubtitle}</Text> : null}
        </View>
      </View>

      {pills.filter(p => p.trim() !== '').length > 0 ? (
        <View style={styles.pillRow}>
          {pills.filter(p => p.trim() !== '').map(pill => (
            <View key={pill} style={styles.pill}>
              <Text style={styles.pillText}>{pill}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {children}
    </PremiumPanel>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    overflow: 'hidden'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space['4'],
    elevation: 4
  },
  copy: {
    flex: 1
  },
  eyebrow: {
    fontFamily: Typo.fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  title: {
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5
  },
  subtitle: {
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Space['5']
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 10,
    marginBottom: 10
  },
  pillText: {
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.semibold,
    fontSize: 12,
    letterSpacing: 0.3
  }
  });

