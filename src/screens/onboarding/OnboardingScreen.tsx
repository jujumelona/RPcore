// src/screens/onboarding/OnboardingScreen.tsx
// ✅ v4 - 키보드 완전 대응 (히어로 섹션 제거 -> 입력창 가림 없음)
// ✅ 골드+퍼플 혼합 글로우 시스템
// ✅ 스텝 도트: 골드->퍼플 그라데이션 활성
// ✅ CTA 버튼: 골드(기본) / 퍼플(AI/소셜로그인)

import { appStorage } from '../../utils/storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StyleSheet, StatusBar, Text, TextInput,
  TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { LANGUAGE_LIST, LANGUAGES, type LanguageCode } from '../../i18n/languages';
import { detectRegion, getPolicy } from '../../i18n/policyContent';
import { useAuthStore, CURRENT_CONSENT_VERSION } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { PressableOpacity } from '../../components/PressableOpacity';
import { ToastService } from '../../components/Toast';
import { Radius, Typography as Typo } from '../../constants/tokens';
import { getOnboardingCopy } from './onboardingCopy';
import { triggerHaptic } from '../../utils/haptics';
import { Check } from 'lucide-react-native';

export const ONBOARDING_KEY = 'onboarding_complete_v3';
const MIN_AGE = 17;
type Step = 1 | 2 | 3;
type PolicyKey = 'terms' | 'operation' | 'privacy' | 'ugc';
type ConsentState = { terms: boolean; operation: boolean; privacy: boolean; ugc: boolean; ad: boolean };
const WEBSITE_URL = 'https://rpcore.netlify.app/#policy';

const GOLD   = '#D4A853';
const PURPLE = '#8B5CF6';
const PURPLE_L = '#A78BFA';

function detectDeviceLanguage(): LanguageCode {
  try {
    const locales: string[] = [];
    // 1순위: Android NativeModules.I18nManager (기기 언어 가장 정확)
    try {
      const { NativeModules: NM } = require('react-native');
      const nativeLocale: string | undefined =
        NM?.I18nManager?.localeIdentifier ??
        NM?.SettingsManager?.settings?.AppleLocale ??
        NM?.SettingsManager?.settings?.AppleLanguages?.[0];
      if (nativeLocale) locales.push(nativeLocale.replace(/_/g, '-'));
    } catch {}
    // 2순위: Intl API
    if (typeof Intl !== 'undefined') {
      try {
        const l = Intl.DateTimeFormat().resolvedOptions().locale;
        if (l && l !== 'en' && l !== 'und') locales.push(l);
      } catch {}
    }
    if (typeof navigator !== 'undefined') {
      if (navigator.languages?.length) locales.push(...navigator.languages);
      else if (navigator.language) locales.push(navigator.language);
    }
    for (const locale of locales) {
      if (!locale) continue;
      const lower = locale.toLowerCase();
      if (lower.startsWith('zh')) {
        if (lower.includes('hant') || lower.includes('tw') || lower.includes('hk')) return 'zh-TW';
        return 'zh-CN';
      }
      const base = locale.substring(0, 2).toLowerCase() as LanguageCode;
      if (base in LANGUAGES) return base;
    }
  } catch {}
  return 'en';
}

function calcAge(year: number, month: number, day: number = 1): number {
  const now = new Date();
  let age = now.getFullYear() - year;
  const nowMonth = now.getMonth() + 1;
  if (nowMonth < month) {
    age -= 1;
  } else if (nowMonth === month && now.getDate() < day) {
    age -= 1;
  }
  return age;
}

/* ── 스텝 도트: 골드->퍼플 그라데이션 ─────────────────────── */
function StepDots({ step }: { step: Step }) {
  return (
    <View style={s.dots}>
      {([1, 2, 3] as Step[]).map(n => {
        const isActive  = step >= n;
        const isCurrent = step === n;
        const bg = n === 1 ? GOLD : n === 2 ? '#B086E0' : PURPLE_L;
        return (
          <View
            key={n}
            style={[
              s.dot,
              isCurrent && s.dotActive,
              isActive && { backgroundColor: bg },
              // eslint-disable-next-line
              isCurrent && { elevation: 4 },
            ]}
          />
        );
      })}
    </View>
  );
}

/* ── 언어 픽커 ───────────────────────────────────────────── */
function LanguagePickerModal({ visible, current, onSelect, onClose }: {
  visible: boolean; current: LanguageCode;
  onSelect: (code: LanguageCode) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={lm.overlay} activeOpacity={1} onPress={onClose}>
        <View style={lm.sheet}>
          <View style={lm.handle} />
          <FlashList
            data={LANGUAGE_LIST}
            estimatedItemSize={48}
            keyExtractor={item => item.code}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const selected = current === item.code;
              return (
                <TouchableOpacity
                  style={[lm.item, selected && lm.itemOn]}
                  onPress={() => { onSelect(item.code); onClose(); }}
                >
                  <Text style={[lm.itemTxt, selected && lm.itemTxtOn]}>{item.nativeName}</Text>
                  {selected && <Check size={16} color={GOLD} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const lm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 },
  sheet:   {
    backgroundColor: '#0C0C14', borderRadius: 18,
    borderWidth: 1, borderColor: '#1A1A26',
    width: '100%', maxHeight: 360, paddingVertical: 8,
    // 상단 골드->퍼플 라인
    borderTopWidth: 1, borderTopColor: '#D4A853',
    overflow: 'hidden'
  },
  handle:    { width: 32, height: 3, borderRadius: 2, backgroundColor: '#222232', alignSelf: 'center', marginBottom: 8 },
  item:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 20 },
  itemOn:    { backgroundColor: 'rgba(212,168,83,0.06)' },
  itemTxt:   { fontSize: 14, color: '#8A8A9E', fontFamily: Typo.fontFamily.regular },
  itemTxtOn: { color: '#F0F0F5', fontFamily: Typo.fontFamily.semibold },
  tick:      { fontSize: 14, color: GOLD }
  });

/* ── 약관 모달 ───────────────────────────────────────────── */
function PolicyModal({ visible, title, content, webButtonLabel, onClose }: {
  visible: boolean; title: string; content: string; webButtonLabel: string; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={pm.safe}>
        <View style={pm.hdr}>
          <View style={pm.hdrLine} />
          <Text style={pm.hdrTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={pm.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={pm.body} showsVerticalScrollIndicator={false}>
          <Text style={pm.bodyTxt}>{content}</Text>
          <TouchableOpacity style={pm.webBtn} onPress={() => Linking.openURL(WEBSITE_URL).catch(() => {})}>
            <Text style={pm.webBtnTxt}>{webButtonLabel}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const pm = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#08080C' },
  hdr:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24', position: 'relative' },
  hdrLine:  { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: GOLD, opacity: 0.4 },
  hdrTitle: { fontSize: 15, fontFamily: Typo.fontFamily.bold, color: '#F0F0F5', flex: 1 },
  closeBtn: { fontSize: 14, color: '#C8C8D4', fontFamily: Typo.fontFamily.medium, paddingLeft: 16 },
  body:     { padding: 20, paddingBottom: 48 },
  bodyTxt:  { fontSize: 13, color: '#C8C8D4', lineHeight: 22, fontFamily: Typo.fontFamily.regular },
  webBtn:   { marginTop: 28, paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1, borderColor: '#1A1A24', alignItems: 'center' },
  webBtnTxt:{ fontSize: 13, color: '#797990', fontFamily: Typo.fontFamily.medium }
  });

/* ── 동의 행 ──────────────────────────────────────────────── */
function ConsentRow({ label, required, checked, onToggle, onOpen, copy }: {
  label: string; required: boolean; checked: boolean;
  onToggle: () => void; onOpen: () => void;
  copy: ReturnType<typeof getOnboardingCopy>;
}) {
  return (
    <View style={[s.cRow, checked && s.cRowActive]}>
      <TouchableOpacity activeOpacity={0.7} style={s.cLeft} onPress={() => { triggerHaptic('select'); onToggle(); }}>
        <View style={[s.chk, checked && s.chkOn]}>
          {checked ? <Check size={14} color={GOLD} /> : null}
        </View>
        <Text style={s.cLabel} numberOfLines={2}>{label}</Text>
        {required && <Text style={s.cReq}>{copy.requiredLabel}</Text>}
      </TouchableOpacity>
      <PressableOpacity style={s.linkBtn} onPress={onOpen}>
        <Text style={s.linkBtnTxt}>{copy.openPolicy}</Text>
      </PressableOpacity>
    </View>
  );
}

// src/screens/onboarding/OnboardingScreen.tsx
/* ── 메인 ─────────────────────────────────────────────────── */
export function OnboardingScreen({ navigation }: { navigation?: any }) {
  const { setLanguage } = useLanguageStore();
  const { signIn, saveConsentToServer, isLoading, error, clearError } = useAuthStore();
  const [step, setStep]               = useState<Step>(1);
  const [birthYear, setBirthYear]     = useState('');
  const [birthMonth, setBirthMonth]   = useState('');
  // 온보딩 최초 진입 시 항상 기기 언어로 초기화
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(() => detectDeviceLanguage());
  const [consent, setConsent]         = useState<ConsentState>({ terms: false, operation: false, privacy: false, ugc: false, ad: false });
  const [policyModal, setPolicyModal] = useState<{ key: PolicyKey; title: string; content: string } | null>(null);
  const [langPickerVisible, setLangPickerVisible] = useState(false);

  const policyDocs = useMemo(() => { try { return getPolicy(selectedLanguage); } catch { return null; } }, [selectedLanguage]);
  const copy       = useMemo(() => getOnboardingCopy(selectedLanguage), [selectedLanguage]);
  const currentLangLabel = LANGUAGE_LIST.find(l => l.code === selectedLanguage)?.nativeName ?? selectedLanguage;

  useEffect(() => { return () => clearError(); }, [clearError]);

  // [DEV] 로그인 시 role 확인용 로그
  useEffect(() => {
    if (!__DEV__) return;
    const { user } = useAuthStore.getState();
    if (user) {
      console.log('[DEV] Current user:', { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        hasRole: !!user.role 
      });
    }
  }, []);

  function openPolicy(type: PolicyKey) {
    if (!policyDocs) return;
    const titles:   Record<PolicyKey, string> = { terms: copy.terms, operation: copy.operation, privacy: copy.privacy, ugc: copy.ugc };
    // [BUG FIX] ugc: policyDocs.terms → policyDocs.ugc (UGC 약관 클릭 시 일반 약관이 표시되던 버그)
    const contents: Record<PolicyKey, string> = { 
      terms: policyDocs.terms, 
      operation: policyDocs.operation, 
      privacy: policyDocs.privacy, 
      ugc: (policyDocs as unknown as Record<string, string>).ugc || policyDocs.terms 
    };
    setPolicyModal({ key: type, title: titles[type], content: contents[type] });
  }

  const reqOk = consent.terms && consent.operation && consent.privacy && consent.ugc;
  const allOn = reqOk && consent.ad;

  const goStep2 = () => {
    const y = parseInt(birthYear, 10), m = parseInt(birthMonth, 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) { ToastService.error(copy.invalidBirthBody); return; }
    if (calcAge(y, m) < MIN_AGE) { ToastService.error(copy.tooYoungBody); return; }
    setStep(2);
  };

  const handleGoogleLogin = async () => {
    const y = parseInt(birthYear, 10);
    await setLanguage(selectedLanguage);
    const user = await signIn();
    if (!user) return;
    await saveConsentToServer({
      version: CURRENT_CONSENT_VERSION,
      consentDate: new Date().toISOString(),
      ageVerified: true,
      birthYear: Number.isFinite(y) ? y : null,
      consentItems: [
        ...(consent.terms     ? ['terms']     : []),
        ...(consent.operation ? ['operation'] : []),
        ...(consent.privacy   ? ['privacy']   : []),
        ...(consent.ugc       ? ['ugc']       : []),
        ...(consent.ad        ? ['ad']        : []),
      ],
      lang: selectedLanguage,
      region: detectRegion(selectedLanguage)
  });
    appStorage.set(ONBOARDING_KEY, '1');
    navigation?.reset?.({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

  return (
    <View style={s.root}>
      <StatusBar backgroundColor="#050507" barStyle="light-content" translucent={false} animated={false} />
      {/* 배경 — 위쪽 골드/퍼플 글로우 */}
      <View style={s.glowGold} />
      <View style={s.glowPurple} />

      {/* 키보드가 올라와도 입력창이 가리지 않도록 최상위 KAV */}
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView style={s.flex}>

          {/* 헤더 */}
          <View style={s.hdr}>
            {/* 헤더 하단 골드->퍼플 라인 */}
            <View style={s.hdrGlowLine} />

            {/* 브랜드 */}
            <View style={s.logoPill}>
              <Text style={s.logoText}>RP</Text>
              <View style={s.logoLine} />
              <Text style={[s.logoText, { color: PURPLE_L }]}>core</Text>
            </View>

            <View style={s.hdrRight}>
              <StepDots step={step} />
              <TouchableOpacity style={s.langBtn} onPress={() => setLangPickerVisible(true)}>
                <Text style={s.langBtnTxt}>{currentLangLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 스텝 진행 바 */}
          <View style={s.progressTrack}>
            <LinearGradient
              colors={[PURPLE, PURPLE_L]}
              start={[0, 0]} end={[1, 0]}
              style={[s.progressFill, { width: `${(step / 2) * 100}%` }]}
            />
          </View>

          <ScrollView
            style={s.flex}
            contentContainerStyle={step === 2 ? s.scrollContentConsent : s.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* 스텝 타이틀 */}
            <View key={`title-${step}`} style={s.titleWrap}>
              <Text style={s.stepNum}>0{step} / 02</Text>
              <Text style={s.stepTitle}>
                {step === 1 ? copy.ageTitle : copy.consentTitle}
              </Text>
              {/* 타이틀 하단 골드->퍼플 언더라인 */}
              <LinearGradient
                colors={step === 1 ? [PURPLE, 'transparent'] : [PURPLE, PURPLE_L]}
                start={[0, 0]} end={[1, 0]}
                style={s.titleUnderline}
              />
            </View>

            {/* ── Step 1: 나이 확인 ── */}
            {step === 1 && (
              <View>
                <Text style={s.desc}>{copy.ageDesc}</Text>

                {/* 입력 그룹 — 포커스 시 골드 테두리 */}
                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>{copy.birthYearLabel}</Text>
                    <TextInput
                      value={birthYear} onChangeText={setBirthYear}
                      keyboardType="number-pad" maxLength={4}
                      style={s.input} placeholder="YYYY" placeholderTextColor="#2A2A3C"
                      returnKeyType="next"
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>{copy.birthMonthLabel}</Text>
                    <TextInput
                      value={birthMonth} onChangeText={setBirthMonth}
                      keyboardType="number-pad" maxLength={2}
                      style={s.input} placeholder="MM" placeholderTextColor="#2A2A3C"
                      returnKeyType="done"
                      onSubmitEditing={goStep2}
                    />
                  </View>
                </View>
                <Text style={s.notice}>{copy.ageNotice}</Text>
              </View>
            )}

            {/* ── Step 2: 약관 동의 ── */}
            {step === 2 && (
              <View>
                <Text style={s.desc}>{copy.consentDesc}</Text>
                <View style={s.cList}>
                  {([
                    { key: 'terms'     as PolicyKey, label: copy.terms,     req: true },
                    { key: 'operation' as PolicyKey, label: copy.operation, req: true },
                    { key: 'privacy'   as PolicyKey, label: copy.privacy,   req: true },
                    { key: 'ugc'       as PolicyKey, label: copy.ugc,       req: true },
                  ] as const).map(item => (
                    <ConsentRow key={item.key} label={item.label} required={item.req}
                      checked={consent[item.key]}
                      onToggle={() => setConsent(p => ({ ...p, [item.key]: !p[item.key] }))}
                      onOpen={() => openPolicy(item.key)} copy={copy} />
                  ))}
                  <ConsentRow label={copy.adOptional} required={false} checked={consent.ad}
                    onToggle={() => setConsent(p => ({ ...p, ad: !p.ad }))}
                    onOpen={() => openPolicy('privacy')} copy={copy} />
                  <View style={[s.cRow, allOn && s.cRowActive]}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={s.cLeft}
                      onPress={() => {
                        triggerHaptic('select');
                        const next = !allOn;
                        setConsent({ terms: next, operation: next, privacy: next, ugc: next, ad: next });
                      }}
                    >
                      <View style={[s.chk, allOn && s.chkOn]}>
                        {allOn ? <Check size={14} color={GOLD} /> : null}
                      </View>
                      <Text style={[s.cLabel, s.agreeAllFooterTxt]} numberOfLines={1}>{copy.consentAll}</Text>
                    </TouchableOpacity>
                    <View style={s.linkBtnGhost} />
                  </View>

                </View>

                {error ? (
                  <View style={s.errBox}>
                    <Text style={s.errTxt}>{error}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* ── 고정된 하단 버튼 영역 ── */}
          <View style={s.fixedFooter}>
            {step === 1 && (
              <View>
                <TouchableOpacity style={s.primaryBtn} onPress={() => { triggerHaptic('light'); goStep2(); }} activeOpacity={0.85}>
                  <Text style={s.primaryBtnTxt}>{copy.nextButton}</Text>
                </TouchableOpacity>
              </View>
            )}
            {step === 2 && (
              <View>
                <View style={s.rowBtnsFixed}>
                  <TouchableOpacity style={[s.secondaryBtn, s.flex]} onPress={() => setStep(1)}>
                    <Text style={s.secondaryBtnTxt}>{copy.backButton}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.primaryBtnPurple, s.flex, (!reqOk || isLoading) && s.btnDisabled]}
                    onPress={handleGoogleLogin}
                    disabled={!reqOk || isLoading}
                    activeOpacity={0.85}
                  >
                    <Text style={s.primaryBtnTxt}>{isLoading ? '...' : copy.loginButton}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

        </SafeAreaView>
      </KeyboardAvoidingView>

      <LanguagePickerModal visible={langPickerVisible} current={selectedLanguage}
        onSelect={setSelectedLanguage} onClose={() => setLangPickerVisible(false)} />

      {policyModal && (
        <PolicyModal visible title={policyModal.title} content={policyModal.content}
          webButtonLabel={copy.viewPolicyOnWeb} onClose={() => setPolicyModal(null)} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  dotActive: { width: 20, borderRadius: 3 },
  root: { flex: 1, backgroundColor: '#050507' },
  flex: { flex: 1 },

  /* 배경 글로우 */
  glowGold: {
    position: 'absolute', top: -100, left: -40,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(139,92,246,0.12)'  // 보라색으로 변경
  },
  glowPurple: {
    position: 'absolute', top: -80, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(139,92,246,0.08)'
  },

  /* 헤더 */
  hdr: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14,
    position: 'relative'
  },
  hdrGlowLine: {
    position: 'absolute', bottom: 0, left: 24, right: 24, height: 0.5,
    backgroundColor: PURPLE, opacity: 0.3
  },
  logoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.55)',
    backgroundColor: 'rgba(139,92,246,0.05)', elevation: 4
  },
  logoText: {
    fontSize: 16, fontFamily: Typo.fontFamily.extrabold,
    color: '#E8E1FF', letterSpacing: 1
  },
  logoLine: { width: 1, height: 12, backgroundColor: 'rgba(167,139,250,0.3)', marginHorizontal: 2 },

  hdrRight:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dots:       { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#1A1A24' },
  langBtn:    { borderWidth: 1, borderColor: '#1A1A24', backgroundColor: '#0A0A12', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  langBtnTxt: { fontSize: 11, color: '#8A8A9E', fontFamily: Typo.fontFamily.medium },

  /* 진행 바 */
  progressTrack: { height: 2, backgroundColor: '#0E0E18', marginHorizontal: 0 },
  progressFill:  { height: '100%', borderRadius: 0 },

  /* 스크롤 */
  scroll:     { paddingHorizontal: 24, paddingTop: 20 },
  scrollContent: { paddingBottom: 12 },
  scrollContentConsent: { paddingBottom: 84 },

  /* 타이틀 */
  titleWrap:      { marginBottom: 14 },
  stepNum:        { fontSize: 10, fontFamily: Typo.fontFamily.bold, color: GOLD, letterSpacing: 2.5, marginBottom: 6, textTransform: 'uppercase' },
  stepTitle:      { fontSize: 22, fontFamily: Typo.fontFamily.bold, color: '#F0F0F5', letterSpacing: -0.4, lineHeight: 28, marginBottom: 8 },
  titleUnderline: { height: 1.5, borderRadius: 1, width: 60 },

  /* 폼 */
  desc:       { color: '#6A6A80', fontSize: 13, lineHeight: 20, fontFamily: Typo.fontFamily.regular, marginBottom: 14 },
  fieldRow:   { flexDirection: 'row', gap: 12, marginBottom: 12 },
  fieldHalf:  { flex: 1 },
  fieldLabel: { fontSize: 9, fontFamily: Typo.fontFamily.bold, color: '#3A3A50', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' },
  input: {
    borderWidth: 1.5, borderColor: '#1A1A26',
    backgroundColor: '#09090F', color: '#F0F0F5',
    borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 17, fontFamily: Typo.fontFamily.regular
  },
  notice: { color: '#3A3A50', fontSize: 11, lineHeight: 16, fontFamily: Typo.fontFamily.regular, marginBottom: 22 },

  /* 버튼 */
  primaryBtn: {
    alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md,
    paddingVertical: 14, backgroundColor: GOLD, minHeight: 50, elevation: 8
  },
  primaryBtnPurple: {
    alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md,
    paddingVertical: 14, backgroundColor: PURPLE, minHeight: 50, elevation: 8
  },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontFamily: Typo.fontFamily.extrabold, letterSpacing: 0.2 },
  secondaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#1A1A24',
    backgroundColor: '#09090F', minHeight: 50
  },
  secondaryBtnTxt: { color: '#4A4A60', fontSize: 13, fontFamily: Typo.fontFamily.medium },
  rowBtnsFixed: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  fixedFooter: { paddingHorizontal: 24, paddingBottom: 18, paddingTop: 6, backgroundColor: '#050507' },

  /* 동의 */
  cList:      { gap: 6, marginBottom: 8 },
  cRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#09090F', borderWidth: 1, borderColor: '#141420',
    borderRadius: Radius.md, paddingHorizontal: 13, paddingVertical: 12, minHeight: 48
  },
  cRowActive: { borderColor: '#1E1E2E', backgroundColor: 'rgba(212,168,83,0.02)' },
  cLeft:      { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  chk: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#06060C'
  },
  chkOn:   { borderColor: GOLD, backgroundColor: 'rgba(212,168,83,0.15)' },
  chkTick: { fontSize: 12, color: GOLD, fontFamily: Typo.fontFamily.bold },
  cLabel:  { color: '#C8C8D4', fontSize: 12, fontFamily: Typo.fontFamily.regular, flexShrink: 1, lineHeight: 17 },
  cReq: {
    fontSize: 9, fontFamily: Typo.fontFamily.extrabold, color: '#FF9B9B',
    backgroundColor: 'rgba(255,85,85,0.07)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4
  },
  linkBtn:    { borderWidth: 1, borderColor: '#141420', borderRadius: Radius.sm, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#050510', marginLeft: 4 },
  linkBtnTxt: { color: '#3A3A50', fontSize: 10, fontFamily: Typo.fontFamily.medium },
  linkBtnGhost: {
    width: 48,
    height: 30,
    marginLeft: 4,
    opacity: 0 },
  agreeAllFooterTxt: { fontFamily: Typo.fontFamily.semibold },

  /* 요약 */
  summary: {
    backgroundColor: '#09090F', borderRadius: Radius.md,
    padding: 16, gap: 10, borderWidth: 1, borderColor: '#1A1A24',
    marginBottom: 22, overflow: 'hidden', position: 'relative'
  },
  summaryTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  summaryRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryCheck:   { fontSize: 13, color: GOLD },
  summaryTxt:     { color: '#8A8A9E', fontSize: 13, fontFamily: Typo.fontFamily.medium },

  btnDisabled: { opacity: 0.35 },
  errBox:      { marginTop: 12, padding: 13, borderRadius: Radius.md, backgroundColor: 'rgba(255,85,85,0.06)', borderWidth: 1, borderColor: 'rgba(255,85,85,0.18)' },
  errTxt:      { color: '#FF8A8A', fontSize: 12, lineHeight: 17, fontFamily: Typo.fontFamily.regular }
  });
