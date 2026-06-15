/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/AccessibilityScreen.tsx
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  접근성 설정 & 접근성 선언문                                               │
 * │                                                                          │
 * │  법적 근거:                                                               │
 * │   · WCAG 2.1 AA (국제 표준, 세계 대부분 법률의 기준)                       │
 * │   · ADA (미국 장애인법) — 웹/앱 접근성 적용                                │
 * │   · European Accessibility Act 2025 (EU) — EN 301 549                   │
 * │   · 장애인차별금지 및 권리구제 등에 관한 법률 (대한민국)                    │
 * │   · Equality Act 2010 (영국)                                             │
 * │   · DDA (호주 장애차별금지법)                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import React from 'react';
import {
  AccessibilityInfo,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Type, Contrast, Zap, Info, ExternalLink } from 'lucide-react-native';
import { PressableOpacity } from '../components/PressableOpacity';
import { Radius, Typography } from '../constants/tokens';
import { useLanguageStore } from '../store/languageStore';
import { getAccessibilityCopy } from '../i18n/accessibilityCopy';
import { useAccessibilityStore, type FontScale } from './accessibilityStore';

// ─── 터치 타겟 최소값 (WCAG 2.5.5 · Apple HIG · Android Material) ───────────
const MIN_TOUCH = 44;
const WCAG_STANDARD = 'WCAG 2.1 AA';

const CONTACT_EMAIL = 'fdje0303@gmail.com';

// ─────────────────────────────────────────────────────────────────────────────

export function AccessibilityScreen({ navigation }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const copy = getAccessibilityCopy(appLanguage);
  const {
    fontScale, setFontScale,
    highContrast, setHighContrast,
    reduceMotion, setReduceMotion } = useAccessibilityStore();

  const getFontSizeLabel = (scale: FontScale) => {
    switch (scale) {
      case 0.85:
        return copy.fontSizeSmall;
      case 1.2:
        return copy.fontSizeLarge;
      case 1.4:
        return copy.fontSizeXLarge;
      case 1.0:
      default:
        return copy.fontSizeDefault;
    }
  };

  const handleFontScale = (scale: FontScale) => {
    setFontScale(scale);
    AccessibilityInfo.announceForAccessibility(
      copy.fontSizeChangedAnnouncement.replace('{label}', getFontSizeLabel(scale)),
    );
  };

  const handleHighContrast = (val: boolean) => {
    setHighContrast(val);
    AccessibilityInfo.announceForAccessibility(
      val ? copy.highContrastEnabledAnnouncement : copy.highContrastDisabledAnnouncement,
    );
  };

  const handleReduceMotion = (val: boolean) => {
    setReduceMotion(val);
    AccessibilityInfo.announceForAccessibility(
      val ? copy.reduceMotionEnabledAnnouncement : copy.reduceMotionDisabledAnnouncement,
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>

      {/* ── 헤더 ── */}
      <View style={s.header} accessibilityRole="header">
        <PressableOpacity
          style={s.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t?.back ?? 'Back'}
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color={'#F0F0F5'} />
        </PressableOpacity>
        <Text style={s.headerTitle} accessibilityRole="header">{copy.title}</Text>
        <View style={{ width: MIN_TOUCH }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={copy.title}
      >

        {/* ── 글자 크기 ── */}
        <Section icon={<Type size={18} color={'#D4A853'} />} title={copy.fontSizeTitle}>
          <Text style={s.sectionDesc}>{copy.fontSizeGuide}</Text>
          <View style={s.fontRow} accessibilityRole="radiogroup" accessibilityLabel={copy.fontSizeTitle}>
            {[0.85, 1.0, 1.2, 1.4].map(value => {
              const scale = value as FontScale;
              const isSelected = fontScale === scale;
              const label = getFontSizeLabel(scale);
              return (
                <PressableOpacity
                  key={String(scale)}
                  style={[s.fontBtn, isSelected && s.fontBtnActive]}
                  onPress={() => handleFontScale(scale)}
                  accessibilityLabel={`${copy.fontSizeTitle}: ${label}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[s.fontBtnSample, { fontSize: 12 * scale }]}>A</Text>
                  <Text style={[s.fontBtnLabel, isSelected && s.fontBtnLabelActive]}>{label}</Text>
                </PressableOpacity>
              );
            })}
          </View>
          <Text style={[s.previewText, { fontSize: Math.round(14 * fontScale) }]} accessibilityLiveRegion="polite">
            {copy.previewTemplate.replace('{percent}', String(Math.round(fontScale * 100)))}
          </Text>
        </Section>

        {/* ── 시각 설정 ── */}
        <Section icon={<Contrast size={18} color={'#D4A853'} />} title={copy.visualSettingsTitle}>
          <ToggleRow
            label={copy.highContrastTitle}
            desc={copy.highContrastDesc}
            value={highContrast}
            onValueChange={handleHighContrast}
            a11yLabel={copy.highContrastTitle}
            stateOn={copy.toggleOn}
            stateOff={copy.toggleOff}
          />
        </Section>

        {/* ── 모션 설정 ── */}
        <Section icon={<Zap size={18} color={'#D4A853'} />} title={copy.motionSettingsTitle}>
          <ToggleRow
            label={copy.reduceMotionTitle}
            desc={copy.reduceMotionDesc}
            value={reduceMotion}
            onValueChange={handleReduceMotion}
            a11yLabel={copy.reduceMotionTitle}
            stateOn={copy.toggleOn}
            stateOff={copy.toggleOff}
          />
        </Section>

        {/* ── 접근성 선언문 ── */}
        <Section icon={<Info size={18} color={'#D4A853'} />} title={copy.statementTitle}>
          <Text style={s.declarationIntro}>
            {copy.appGoal} <Text style={s.bold}>{WCAG_STANDARD}</Text> {copy.appGoalSuffix}
          </Text>

          <Text style={s.summaryText}>{copy.complianceSummary}</Text>

          {/* 적용 법률 */}
          <Text style={s.standardsTitle}>{copy.legalStandards}</Text>
          <Text style={s.summaryText}>{copy.legalSummary}</Text>

          {/* 준수 현황 */}
          <View style={s.statusBox} accessible accessibilityLabel={copy.complianceStatus}>
            <Text style={s.statusTitle}>{copy.complianceStatus}</Text>
            <Text style={s.statusText}>
              <Text style={s.bold}>{copy.partialConformant}</Text>{'\n'}
              {copy.statusBody}
            </Text>
          </View>

          {/* 문의 */}
          <Text style={s.standardsTitle}>{copy.contactTitle}</Text>
          <Text style={s.declarationIntro}>
            {copy.contactDesc}
          </Text>
          <PressableOpacity
            style={s.contactBtn}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
            accessibilityRole="link"
            accessibilityLabel={CONTACT_EMAIL}
          >
            <ExternalLink size={14} color={'#D4A853'} />
            <Text style={s.contactBtnText}>{CONTACT_EMAIL}</Text>
          </PressableOpacity>

          {/* 최종 갱신일 */}
          <Text style={s.lastUpdated}>{copy.lastUpdated}</Text>
        </Section>

        <View style={styles._height} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 재사용 컴포넌트 ──────────────────────────────────────────────────────────

function Section({
  icon, title, children }: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section} accessibilityLabel={title}>
      <View style={s.sectionTitleRow}>
        {icon}
        <View style={{ marginLeft: icon ? 8 : 0 }}>
          <Text style={s.sectionTitle}>{title}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  a11yLabel: string;
  stateOn: string;
  stateOff: string;
}

function ToggleRow({ label, desc, value, onValueChange, a11yLabel, stateOn, stateOff }: ToggleRowProps) {
  return (
    <View
      style={s.toggleRow}
      accessible
      accessibilityLabel={`${a11yLabel}, ${value ? stateOn : stateOff}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={styles._flex1}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? '#D4A853' : '#797990'}
        trackColor={{ false: '#111118', true: 'rgba(212,168,83,0.14)' }}
        importantForAccessibility="no"
        accessibilityElementsHidden={Platform.OS === 'ios'}
      />
    </View>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: '#050507' },
  scroll: { flex: 1 },
  content: { paddingBottom: 20 },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24',
    minHeight: MIN_TOUCH },
  backBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md },
  headerTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5' },

  // 섹션
  section: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#181820',
    padding: 16 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12 },
  sectionTitle: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5' },
  sectionDesc: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: '#8A8A9E',
    marginBottom: 12,
    lineHeight: 20 },

  // 글자 크기 선택
  fontRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12 },
  fontBtn: {
    flex: 1,
    minHeight: MIN_TOUCH,        // WCAG 2.5.5 터치 타겟
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#181820',
    backgroundColor: '#08080C',
    gap: 4 },
  fontBtnActive: {
    borderColor: '#D4A853',
    backgroundColor: 'rgba(212,168,83,0.14)' },
  fontBtnSample: {
    fontFamily: Typography.fontFamily.medium,
    color: '#F0F0F5' },
  fontBtnLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: '#797990' },
  fontBtnLabelActive: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  previewText: {
    fontFamily: Typography.fontFamily.regular,
    color: '#C8C8D4',
    lineHeight: 24,
    marginTop: 4 },

  // 토글
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: MIN_TOUCH,        // WCAG 2.5.5 터치 타겟
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24',
    marginTop: 4 },
  toggleLabel: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
    marginBottom: 2 },
  toggleDesc: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.regular,
    color: '#797990',
    lineHeight: 16 },

  // 접근성 선언문
  declarationIntro: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: '#C8C8D4',
    lineHeight: 22,
    marginBottom: 12 },
  summaryText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.regular,
    color: '#8A8A9E',
    lineHeight: 18 },
  bold: { fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5' },
  standardsTitle: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
    marginTop: 16,
    marginBottom: 8 },
  statusBox: {
    marginTop: 16,
    backgroundColor: '#08080C',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#181820' },
  statusTitle: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
    marginBottom: 6 },
  statusText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.regular,
    color: '#8A8A9E',
    lineHeight: 18 },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH,        // WCAG 2.5.5
    backgroundColor: 'rgba(212,168,83,0.14)',
    borderRadius: Radius.md,
    alignSelf: 'flex-start' },
  contactBtnText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: '#D4A853' },
  lastUpdated: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.regular,
    color: '#797990',
    marginTop: 16,
    textAlign: 'center' } });

const styles = StyleSheet.create({
  _flex: {
    flex: 1 },
  _height: {
    height: 40 },
  _flex1: {
    flex: 1,
    marginRight: 12 } });
