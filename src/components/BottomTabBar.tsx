// src/components/BottomTabBar.tsx
// ??FIXED v6 ??諛곌꼍 ?щ챸 踰꾧렇 ?섏젙 + 源붾걫??5???덉씠?꾩썐

import { Typography } from '../constants/tokens';
import React, { memo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming,
  interpolate, Extrapolation
  } from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { Home, PenLine, BookOpen, UserCircle, Users } from 'lucide-react-native';
import { useLanguageStore } from '../store/languageStore';
import { triggerHaptic } from '../utils/haptics';
import { useNotificationBadgeStore } from '../store/notificationBadgeStore';

const { width } = Dimensions.get('window') ?? { width: 375 };
const TAB_BAR_BG = '#050507';
const formatBadgeCount = (count: number, maxCount = 99) =>
  count > maxCount ? `${maxCount}+` : String(count);

interface TabItem {
  name:      string;
  labelKey:  string;
  label:     string;
  color:     string;
  glow:      string;
  glowBorder:string;
}

const TABS: TabItem[] = [
  { name: 'Home',      labelKey: 'tabHome',      label: 'Home',      color: '#D4A853', glow: 'rgba(212,168,83,0.15)',  glowBorder: 'rgba(212,168,83,0.30)'  },
  { name: 'Create',    labelKey: 'tabCreate',    label: 'Create',    color: '#FB923C', glow: 'rgba(251,146,60,0.15)',  glowBorder: 'rgba(251,146,60,0.30)'  },
  { name: 'Story',     labelKey: 'tabStory',     label: 'Story',     color: '#A78BFA', glow: 'rgba(167,139,250,0.15)', glowBorder: 'rgba(167,139,250,0.30)' },
  { name: 'Community', labelKey: 'tabCommunity', label: 'Community', color: '#4ADE80', glow: 'rgba(74,222,128,0.15)', glowBorder: 'rgba(74,222,128,0.30)' },
  { name: 'Profile',   labelKey: 'tabProfile',   label: 'Profile',   color: '#2DD4BF', glow: 'rgba(45,212,191,0.15)', glowBorder: 'rgba(45,212,191,0.30)'  },
];

function TabIcon({ name, isActive, color }: { name: string; isActive: boolean; color: string }) {
  const c = isActive ? color : '#8888A8';
  const sw = isActive ? 2.2 : 1.6;
  const sz = 28;
  switch (name) {
    case 'Home':      return <Home       size={sz} color={c} strokeWidth={sw} />;
    case 'Create':    return <PenLine    size={sz} color={c} strokeWidth={sw} />;
    case 'Story':     return <BookOpen   size={sz} color={c} strokeWidth={sw} />;
    case 'Profile':   return <UserCircle size={sz} color={c} strokeWidth={sw} />;
    case 'Community': return <Users      size={sz} color={c} strokeWidth={sw} />;
    default:          return null;
  }
}

const TabButton = memo(function TabButton({
  tab, isActive, onPress, onLongPress, badge, tabLabel
}: {
  tab: TabItem;
  isActive: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  badge?: number;
  tabLabel: string;
}) {
  const scale  = useSharedValue(1);
  const pillOp = useSharedValue(isActive ? 1 : 0);
  const iconY  = useSharedValue(isActive ? -1 : 0);

  useEffect(() => {
    pillOp.value = withTiming(isActive ? 1 : 0, { duration: 200 });
    iconY.value  = withSpring(isActive ? -1 : 0, { damping: 22, stiffness: 350 });
  }, [isActive, pillOp, iconY]);

  const animStyle  = useAnimatedStyle(() => ({ 
    transform: [
      { scale: scale.value }, 
      { translateY: iconY.value }
    ] as const 
  }));
  const pillStyle  = useAnimatedStyle(() => ({ opacity: pillOp.value, transform: [{ scaleX: interpolate(pillOp.value, [0,1], [0.6,1], Extrapolation.CLAMP) }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(pillOp.value, [0,1], [0.4,1], Extrapolation.CLAMP) }));

  return (
    <Pressable
      style={s.tabBtn}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { scale.value = withSpring(0.88, { damping: 14, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1.0,  { damping: 14, stiffness: 400 }); }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tabLabel || tab.label}
      delayLongPress={500}
    >
      <Animated.View style={[s.tabContent, animStyle]}>
        <Animated.View style={[s.pill, { backgroundColor: tab.glow, borderColor: tab.glowBorder }, pillStyle]} />
        <View style={s.iconWrap}>
          <TabIcon name={tab.name} isActive={isActive} color={tab.color} />
          {!!badge && badge > 0 && (
            <View style={[s.badge, { backgroundColor: tab.color }]}>
              <Text style={s.badgeText}>{formatBadgeCount(badge)}</Text>
            </View>
          )}
        </View>
        <Animated.Text numberOfLines={1} style={[s.label, isActive ? [{ color: tab.color }, s.labelActive] : s.labelInactive, labelStyle]}>
          {tabLabel || tab.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
});

export function BottomTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const bottomInset = insets?.bottom ?? 0;
  const t = useLanguageStore(s => s.t);

  const { unreadCount, refresh: refreshBadge } = useNotificationBadgeStore();
  useFocusEffect(useCallback(() => { refreshBadge(); }, [refreshBadge]));

  return (
    <View style={[s.container, { paddingBottom: Math.max(bottomInset, 4), paddingTop: 12 }]}>
      <View style={s.row}>
        {TABS.map((tab, index) => {
          const route    = state.routes[index];
          const isActive = state.index === index;
          const badge    = tab.name === 'Home' && unreadCount > 0 ? unreadCount : undefined;
          return (
            <TabButton
              key={tab.name}
              tab={tab}
              isActive={isActive}
              badge={badge}
              tabLabel={(t as Record<string, string>)[tab.labelKey] ?? tab.label}
              onPress={() => {
                if (!route) return;
                triggerHaptic('select');
                if (isActive) return;
                navigation.navigate(route.name);
              }}
              onLongPress={tab.name !== 'Home' ? () => { triggerHaptic('medium'); navigation.navigate('Home'); } : undefined}
            />
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#050507',
    paddingTop: 0,
    paddingHorizontal: 0,
    borderTopWidth: StyleSheet.hairlineWidth,  // 寃쎄퀎 紐낇솗?섍쾶
    borderTopColor: '#1A1A24' },
  row: {
    flexDirection: 'row',
    width: '100%',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: '#050507',
    borderWidth: 0,
    borderColor: 'transparent',
    height: 32 },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 0,
    paddingBottom: 2,
    height: 32 },
  tabContent: {
    alignItems: 'center',
    gap: 1,
    position: 'relative',
    paddingHorizontal: 10,
    paddingVertical: 0,
    minWidth: 44,
    marginTop: 8 },
  pill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -5, right: -9,
    minWidth: 14, height: 14, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: TAB_BAR_BG },
  badgeText: { fontSize: 7, fontFamily: Typography.fontFamily.extrabold, color: '#050507' },
  label: { fontSize: 8, maxWidth: (width / 5) - 6, textAlign: 'center', letterSpacing: 0.1 },
  labelActive:   { fontFamily: Typography.fontFamily.semibold },
  labelInactive: { color: '#9090B8', fontFamily: Typography.fontFamily.medium } });

