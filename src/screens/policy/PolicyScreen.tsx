// src/screens/PolicyScreen.tsx
// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
// [sanitized comment]

import { Typography } from '../../constants/tokens';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { useLanguageStore } from '../../store/languageStore';
import { getPolicy, getPolicyTabLabels, detectRegion, PolicyType } from '../../i18n/policyContent';
import { RTL_LANGUAGES } from '../../i18n/languages';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Section, InfoRow } from './components';

const { width: SCREEN_W } = (Dimensions.get('window') ?? { width: 375, height: 812 });

const TAB_ORDER: PolicyType[] = ['terms', 'privacy', 'operation', 'youth'];

export function PolicyScreen({ navigation, route }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>; route: import('@react-navigation/native').RouteProp<Record<string, object | undefined>> }) {
  const { currentLanguage, t } = useLanguageStore();
  const isRTL = RTL_LANGUAGES.includes(currentLanguage);

  const region = detectRegion(currentLanguage);
  const policy = getPolicy(currentLanguage, region);
  const labels = getPolicyTabLabels(currentLanguage);

  // [sanitized comment]
  // [sanitized comment]
  const initialTab: PolicyType = (() => {
    const t = (route?.params as Record<string, unknown> | undefined)?.tab;
    if (t === 'privacy' || t === 'operation' || t === 'youth' || t === 'terms') {
      return t;
    }
    return 'terms';
  })();

  const [activeTab, setActiveTab] = useState<PolicyType>(initialTab);
  const scrollRef = useRef<ScrollView>(null);
  const indicatorAnim = useSharedValue(TAB_ORDER.indexOf(initialTab) * (SCREEN_W / TAB_ORDER.length));

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorAnim.value }] }));

  const TAB_W = SCREEN_W / TAB_ORDER.length;

  const switchTab = useCallback((tab: PolicyType) => {
    const idx = TAB_ORDER.indexOf(tab);
    setActiveTab(tab);
    indicatorAnim.value = withSpring(idx * TAB_W, { stiffness: 80, damping: 12 });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [indicatorAnim, TAB_W]);

  const labelMap: Record<PolicyType, string> = {
    terms:     labels.terms,
    privacy:   labels.privacy,
    operation: labels.operation ?? '',
    youth:     labels.youth ?? t?.youthPolicy ?? '' };

  const content = policy[activeTab];

  // [sanitized comment]
  const renderContent = () => {
    return content.split('\n\n').map((block, i) => {
      const isTitle = i === 0;
      const isSection = /^(\d+\.[0-9]+\.|[①②③④⑤⑥⑦⑧⑨⑩]|\d+\s*\.)/.test(block.trim());
      return (
        <Text
          key={i}
          style={[
            st.paragraph,
            isTitle && st.docTitle,
            isSection && st.sectionHeader,
            isRTL ? st.textRight : st.textLeft,
          ]}
        >
          {block.trim()}
        </Text>
      );
    });
  };

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor='#050507' />

      {/* ?ㅻ뜑 */}
      <View style={[st.header, isRTL ? st.rowReverse : st.rowNormal]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          {isRTL ? <ChevronRight size={28} color={'#8A8A9E'} /> : <ChevronLeft size={28} color={'#8A8A9E'} />}
        </TouchableOpacity>
        <Text style={st.headerTitle}>{labelMap[activeTab]}</Text>
        <View style={st.backBtn} />
      </View>

      {/* Tabs */}
      <View style={st.tabBar}>
        {TAB_ORDER.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={st.tabItem}
            onPress={() => switchTab(tab)}
            activeOpacity={0.7}
          >
            <Text
              style={[st.tabLabel, activeTab === tab && st.tabLabelActive]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {labelMap[tab]}
            </Text>
          </TouchableOpacity>
        ))}

        {/* [sanitized comment] */}
        <Animated.View
          style={[
            st.tabIndicator,
            { width: TAB_W },
            indicatorStyle,
          ]}
        />
      </View>

      {/* 본문 내용 */}
      <ScrollView
        ref={scrollRef}
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 목차 내용 */}
        <Section icon={<Text style={st.sectionIcon}>DOC</Text>} title={labelMap[activeTab]}>
          <View style={[st.regionBadge, isRTL ? st.alignEnd : st.alignStart]}>
            <Text style={st.regionBadgeText}>{region}</Text>
          </View>

          {renderContent()}
        </Section>

        <Section icon={<Text style={st.sectionIcon}>INFO</Text>} title="Metadata" defaultExpanded={false}>
          <InfoRow label="Language" value={String(currentLanguage)} mono />
          <InfoRow label="Region" value={String(region)} mono />
          <InfoRow label="Tab" value={String(activeTab)} mono />
        </Section>

        <View style={st.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#050507' },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#08080C' },
  backBtn: {
    width: 44,
    alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: Typography.fontFamily.semibold,
    color: '#C8C8D4' },
  sectionIcon: {
    fontSize: 10,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.bold },

  // [sanitized comment]
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#0E0E14',
    position: 'relative' },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50 },
  tabLabel: {
    fontSize: 11,
    color: '#757585',
    textAlign: 'center',
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.2 },
  tabLabelActive: {
    color: '#C8C8D4',
    fontFamily: Typography.fontFamily.bold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: '#D4A853',
    borderRadius: 1 },

  // [sanitized comment]
  scroll: {
    flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40 },
  regionBadge: {
    backgroundColor: '#08080C',
    borderWidth: 1,
    borderColor: '#181820',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 16 },
  regionBadgeText: {
    fontSize: 10,
    color: '#797990',
    letterSpacing: 1,
    fontFamily: Typography.fontFamily.semibold },
  docTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    marginBottom: 8,
    letterSpacing: -0.3 },
  sectionHeader: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
    color: '#8A8A9E',
    marginTop: 8 },
  paragraph: {
    fontSize: 13,
    color: '#797990',
    lineHeight: 22,
    marginBottom: 12 },
  textRight:   { textAlign: 'right' },
  textLeft:    { textAlign: 'left' },
  rowReverse:  { flexDirection: 'row-reverse' },
  rowNormal:   { flexDirection: 'row' },
  alignEnd:    { alignSelf: 'flex-end' },
  alignStart:  { alignSelf: 'flex-start' },
  bottomPad: {
    height: 60 } });
