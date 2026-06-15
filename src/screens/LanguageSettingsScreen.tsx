// src/screens/LanguageSettingsScreen.tsx
// 15개 언어 설정 화면 - RTL 지원

import { Typography } from '../constants/tokens';
import React, { useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { useLanguageStore } from '../store/languageStore';
import { LANGUAGE_LIST, LanguageCode, LANGUAGES } from '../i18n/languages';
import { ArrowLeft, ArrowRight, Check, Globe, Zap } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ToastService } from '../components/Toast';

export function LanguageSettingsScreen({ navigation }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const { appLanguage, isRTL, t, setAppLanguage } =
    useLanguageStore(useShallow(s => ({
      appLanguage: s.appLanguage, isRTL: s.isRTL, t: s.t,
      setAppLanguage: s.setAppLanguage })));

  const handleLanguageChange = useCallback(async (lang: LanguageCode) => {
    await setAppLanguage(lang);
    ToastService.success(t?.languageChanged ?? '');
  }, [t, setAppLanguage]);

  const rtlStyle = isRTL ? s.rowReverse : undefined;
  const textAlign = isRTL ? 'right' as const : 'left' as const;
  const rtlLanguagesText = LANGUAGE_LIST
    .filter(lang => lang.isRTL)
    .map(lang => `${lang.name} (${lang.nativeName})`)
    .join(', ');

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeFlex}>
        <Animated.View entering={FadeInDown.duration(300).springify()} style={[s.header, rtlStyle]}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            {isRTL ? <ArrowRight size={22} color={'#F0F0F5'} /> : <ArrowLeft size={22} color={'#F0F0F5'} />}
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Globe size={15} color={'#D4A853'} />
            <Text style={s.headerTitle}>{t?.languageSettings}</Text>
          </View>
          <View style={s.headerSpacer} />
        </Animated.View>
        <View style={s.headerLine} />

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          <Animated.View entering={FadeInDown.delay(60).springify()} style={s.infoBanner}>
            <Text style={[s.infoDesc, { textAlign }]}>{t?.languageSystemTitle}</Text>
          </Animated.View>

          <SectionHeader title={t?.appLanguage} current={LANGUAGES[appLanguage]?.nativeName} textAlign={textAlign} delay={80} />
          {LANGUAGE_LIST.map((lang, idx) => (
            <LanguageItem key={lang.code} lang={lang} index={idx} selected={appLanguage === lang.code}
              onPress={() => handleLanguageChange(lang.code)} isRTL={isRTL} />
          ))}

          <Animated.View entering={FadeInUp.delay(120).springify()} style={s.featureBox}>
            <View style={s.featureHeader}>
              <Zap size={13} color={'#D4A853'} />
              <Text style={[s.featureTitle, { textAlign }]}>{t?.languageSystemTitle}</Text>
            </View>
            {[t?.langFeature1, t?.langFeature2, t?.langFeature3, t?.langFeature4].filter(Boolean).map((feat, i) => (
              <View key={i} style={s.featureRow}>
                <View style={s.featureDot} />
                <Text style={[s.featureTxt, { textAlign }]}>{feat}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(140).springify()} style={s.rtlBox}>
            <Text style={[s.rtlTxt, { textAlign }]}>
              {`${t?.rtlSupportLabel ?? ''}: ${rtlLanguagesText}`}
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ title, current, textAlign, delay = 0, accentColor = '#D4A853' }:
  { title: string; current?: string; textAlign: 'left' | 'right'; delay?: number; accentColor?: string }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={s.sectionHeader}>
      <View style={[s.sectionAccent, { backgroundColor: accentColor }]} />
      <View style={s.safeFlex}>
        <Text style={[s.sectionTitle, { textAlign }]}>{title}</Text>
        {current && <Text style={[s.sectionCurrent, { textAlign, color: accentColor }]}>{current}</Text>}
      </View>
    </Animated.View>
  );
}

function LanguageItem({ lang, selected, onPress, isRTL, index = 0, accentColor = '#D4A853' }:
  { lang: { code: LanguageCode; nativeName: string; name: string; isRTL: boolean };
    selected: boolean; onPress: () => void; isRTL: boolean; index?: number; accentColor?: string }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View entering={FadeInUp.delay(index * 16).springify()}>
      <Animated.View style={animStyle}>
      <TouchableOpacity
        style={[s.langItem, selected && [s.langItemActive, { borderColor: accentColor + '55' }], isRTL && s.rowReverse]}
        onPress={onPress} activeOpacity={0.78}
        onPressIn={() => { scale.value = withTiming(0.975, { duration: 80 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 100 }); }}
      >
        {selected && <View style={[s.langActiveLine, { backgroundColor: accentColor }]} />}
        <View style={s.langTextGroup}>
          <Text style={[s.langNative, selected && s.langNativeSelected, lang.isRTL && s.rtlText]}>
            {lang.nativeName}
          </Text>
          <Text style={s.langEnglish}>{lang.name}{lang.isRTL ? '  ·  RTL' : ''}</Text>
        </View>
        {selected && (
          <View style={[s.checkCircle, { backgroundColor: accentColor + '22', borderColor: accentColor + '66' }]}>
            <Check size={13} color={accentColor} />
          </View>
        )}
      </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 17, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  headerLine: { height: StyleSheet.hairlineWidth, backgroundColor: '#1A1A24' },
  scroll: { flex: 1 },
  infoBanner: { margin: 16, marginBottom: 4, backgroundColor: '#0C0C14', borderRadius: 12, borderWidth: 1, borderColor: '#1A1A24', padding: 14 },
  infoDesc: { fontSize: 13, color: '#8A8A9E', lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 10, gap: 10 },
  sectionAccent: { width: 3, height: 36, borderRadius: 2, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  sectionCurrent: { fontSize: 12, fontFamily: Typography.fontFamily.medium, marginTop: 2 },
  langItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 5, padding: 13, borderRadius: 12, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24', overflow: 'hidden' },
  langItemActive: { backgroundColor: '#111118', borderWidth: 1.5 },
  langActiveLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  langTextGroup: { flex: 1, paddingLeft: 4 },
  langNative: { fontSize: 15, fontFamily: Typography.fontFamily.medium, color: '#C8C8D4' },
  langEnglish: { fontSize: 11, color: '#797990', marginTop: 2 },
  rtlText: { textAlign: 'right' },
  checkCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  syncWrap: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(139,92,246,0.14)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.30)', borderRadius: 14, paddingVertical: 15 },
  syncTxt: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#8B5CF6' },
  featureBox: { margin: 16, padding: 16, backgroundColor: '#0C0C14', borderRadius: 14, borderWidth: 1, borderColor: '#1A1A24' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  featureTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  featureDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D4A853', marginTop: 8 },
  featureTxt: { fontSize: 13, color: '#8A8A9E', lineHeight: 21, flex: 1 },
  rtlBox: { marginHorizontal: 16, marginBottom: 16, padding: 12, borderRadius: 10, backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: '#4ADE80' + '44' },
  rtlTxt: { fontSize: 13, color: '#8A8A9E', lineHeight: 20 },
  safeFlex: { flex: 1 },
  headerSpacer: { width: 40 },
  scrollContent: { paddingBottom: 48 },
  flex1: { flex: 1 },
  rowReverse: { flexDirection: 'row-reverse' },
  langNativeSelected: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold } });

export default LanguageSettingsScreen;
