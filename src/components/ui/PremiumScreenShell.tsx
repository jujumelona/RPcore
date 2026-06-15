import { ReactNode } from 'react';
import { ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { Radius, Space, Typo, Typography } from '../../constants/tokens';
import { PremiumActionButton, PremiumBackdrop, PremiumPanel } from './PremiumSurface';

interface PremiumScreenShellProps {
  children: ReactNode;
  accent?: string;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  header?: ReactNode;
  footer?: ReactNode;
}

export function PremiumScreenShell({
  children,
  accent = '#D4A853',
  scrollable = true,
  contentContainerStyle,
  style,
  header,
  footer }: PremiumScreenShellProps) {
  const body = scrollable ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.staticContent, contentContainerStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, style]}>
      <StatusBar barStyle="light-content" backgroundColor="#050608" />
      <PremiumBackdrop accent={accent} animated />
      <SafeAreaView style={styles.safeArea}>
        {header}
        {body}
        {footer}
      </SafeAreaView>
    </View>
  );
}

interface PremiumHeaderBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

export function PremiumHeaderBar({
  title,
  subtitle,
  onBack,
  right }: PremiumHeaderBarProps) {
  return (
    <View style={styles.headerWrap}>
      <PremiumPanel padding={Space['4']} style={styles.headerPanel}>
        <View style={styles.headerRow}>
          <View style={styles.sideSlot}>
            {onBack ? (
              <PremiumActionButton onPress={onBack} style={styles.backButton}>
                <ChevronLeft size={20} color={'#F0F0F5'} />
              </PremiumActionButton>
            ) : null}
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{title}</Text>
            {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
          </View>

          <View style={[styles.sideSlot, styles.rightSlot]}>{right}</View>
        </View>
      </PremiumPanel>
    </View>
  );
}

interface PremiumHeroCardProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PremiumHeroCard({
  eyebrow,
  title,
  description,
  children }: PremiumHeroCardProps) {
  return (
    <PremiumPanel padding={Space['5']} glow style={styles.heroPanel}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.heroTitle}>{title}</Text>
      {description ? <Text style={styles.heroDescription}>{description}</Text> : null}
      {children ? <View style={styles.heroContent}>{children}</View> : null}
    </PremiumPanel>
  );
}

interface TabItem {
  key: string;
  label: string;
}

interface PremiumPillTabsProps {
  tabs: readonly TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function PremiumPillTabs({
  tabs,
  activeKey,
  onChange }: PremiumPillTabsProps) {
  return (
    <View style={styles.tabRow}>
      {tabs.map(tab => {
        const active = tab.key === activeKey;
        return (
          <PremiumActionButton
            key={tab.key}
            active={active}
            onPress={() => onChange(tab.key)}
            style={styles.tabButton}
          >
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
          </PremiumActionButton>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050507' },
  safeArea: {
    flex: 1 },
  scroll: {
    flex: 1 },
  scrollContent: {
    paddingHorizontal: Space['4'],
    paddingBottom: Space['8'],
    gap: Space['4'] },
  staticContent: {
    flex: 1,
    paddingHorizontal: Space['4'],
    paddingBottom: Space['8'] },
  headerWrap: {
    paddingHorizontal: Space['4'],
    paddingTop: Space['2'],
    paddingBottom: Space['3'] },
  headerPanel: {
    borderRadius: Radius.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space['3'] },
  sideSlot: {
    width: 56,
    minHeight: 44,
    justifyContent: 'center' },
  rightSlot: {
    alignItems: 'flex-end' },
  backButton: {
    width: 44 },
  headerCenter: {
    flex: 1,
    alignItems: 'center' },
  headerTitle: {
    color: '#F0F0F5',
    fontSize: Typo.size.lg,
    fontFamily: Typography.fontFamily.bold,
    textAlign: 'center' },
  headerSubtitle: {
    marginTop: 2,
    color: '#797990',
    fontSize: Typo.size.xs,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center' },
  heroPanel: {
    marginTop: Space['1'] },
  eyebrow: {
    color: '#D4A853',
    fontSize: Typo.size.caption,
    fontFamily: Typography.fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: Space['2'] },
  heroTitle: {
    color: '#F0F0F5',
    fontSize: Typo.size.h2,
    lineHeight: 28,
    fontFamily: Typography.fontFamily.bold },
  heroDescription: {
    marginTop: Space['2'],
    color: '#8A8A9E',
    fontSize: Typo.size.sm,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.regular },
  heroContent: {
    marginTop: Space['4'] },
  tabRow: {
    flexDirection: 'row',
    gap: Space['2'] },
  tabButton: {
    flex: 1 },
  tabLabel: {
    color: '#8A8A9E',
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    textAlign: 'center' },
  tabLabelActive: {
    color: '#F0F0F5' } });
