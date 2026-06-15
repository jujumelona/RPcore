/* eslint-disable @typescript-eslint/no-unused-vars */
// src/policy/PolicyUpdateBanner.tsx
// ✅ [PERF] RN Animated → Reanimated (JS 스레드 → UI 스레드)
//    기존: Animated.spring + useNativeDriver:true — JS 스레드에서 값 계산
//    수정: useSharedValue + withSpring → UI 스레드 직접 실행 (jank 0)
// ✅ [PERF] TouchableOpacity → PressableOpacity (스프링 피드백)

import { Typography } from '../constants/tokens';
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring
  } from 'react-native-reanimated';
import { PressableOpacity } from '../components/PressableOpacity';

import { type LanguageCode, getSupportedLanguage } from '../i18n/languages';
import { useLanguageStore } from '../store/languageStore';
import { usePolicyVersionStore } from '../store/policyVersionStore';
import { useShallow } from 'zustand/react/shallow';

// [FIX] navigation prop 제거 → useNavigation hook으로 교체
// NavigationContainer 내부 어디서든 props 없이 바로 사용 가능
import { useNavigation } from '@react-navigation/native';

type BannerText = {
  msg: string;
  btn: string;
  dismiss: string;
};

const BANNER_TEXT: Record<LanguageCode, BannerText> = {
  en: {
    msg: 'Our terms were updated. Please review the latest version before continuing.',
    btn: 'Review update',
    dismiss: 'Later'
  },
  ko: {
    msg: '약관이 업데이트되었어요. 계속하려면 변경 내용을 먼저 확인해 주세요.',
    btn: '변경 내용 확인',
    dismiss: '나중에'
  },
  ja: {
    msg: '規約が更新されました。続行する前に最新の内容をご確認ください。',
    btn: '変更内容を確認',
    dismiss: 'あとで'
  },
  'zh-CN': {
    msg: '条款已更新。继续之前，请先查看最新内容。',
    btn: '查看更新内容',
    dismiss: '稍后'
  },
  'zh-TW': {
    msg: '條款已更新。繼續前，請先查看最新內容。',
    btn: '查看更新內容',
    dismiss: '稍後'
  },
  es: {
    msg: 'Nuestros términos se actualizaron. Revisa la versión más reciente antes de continuar.',
    btn: 'Revisar cambios',
    dismiss: 'Más tarde'
  },
  pt: {
    msg: 'Nossos termos foram atualizados. Revise a versão mais recente antes de continuar.',
    btn: 'Revisar atualização',
    dismiss: 'Depois'
  },
  fr: {
    msg: 'Nos conditions ont été mises à jour. Veuillez consulter la dernière version avant de continuer.',
    btn: 'Voir la mise à jour',
    dismiss: 'Plus tard'
  },
  de: {
    msg: 'Unsere Bedingungen wurden aktualisiert. Bitte prüfe die neueste Version, bevor du fortfährst.',
    btn: 'Änderung prüfen',
    dismiss: 'Später'
  },
  it: {
    msg: 'I nostri termini sono stati aggiornati. Controlla la versione più recente prima di continuare.',
    btn: 'Controlla aggiornamento',
    dismiss: 'Più tardi'
  },
  ru: {
    msg: 'Наши условия обновились. Перед продолжением просмотрите последнюю версию.',
    btn: 'Проверить изменения',
    dismiss: 'Позже'
  },
  th: {
    msg: 'เงื่อนไขของเราได้รับการอัปเดต โปรดตรวจสอบเวอร์ชันล่าสุดก่อนดำเนินการต่อ',
    btn: 'ดูการอัปเดต',
    dismiss: 'ภายหลัง'
  },
  tr: {
    msg: 'Koşullarımız güncellendi. Devam etmeden önce lütfen en son sürümü inceleyin.',
    btn: 'Güncellemeyi incele',
    dismiss: 'Daha sonra'
  },
  hi: {
    msg: 'हमारी शर्तें अपडेट हुई हैं। आगे बढ़ने से पहले कृपया नवीनतम संस्करण देखें।',
    btn: 'अपडेट देखें',
    dismiss: 'बाद में'
  },
  ar: {
    msg: 'تم تحديث الشروط. يُرجى مراجعة أحدث إصدار قبل المتابعة.',
    btn: 'مراجعة التحديث',
    dismiss: 'لاحقًا'
  }
  };

function getBannerText(lang: string) {
  return BANNER_TEXT[getSupportedLanguage(lang)] ?? BANNER_TEXT.en;
}

export function PolicyUpdateBanner() {
  const navigation = useNavigation<import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>>();
  const { hasNewPolicy, isChecked, checkVersion, dismissTemporarily } = usePolicyVersionStore(
    useShallow((s) => ({
      hasNewPolicy: s.hasNewPolicy,
        isChecked: s.isChecked,
        checkVersion: s.checkVersion,
        dismissTemporarily: s.dismissTemporarily
  })),
  );
  const { currentLanguage } = useLanguageStore();

  // ✅ Reanimated SharedValue — UI 스레드에서 직접 실행
  const translateY = useSharedValue(-60);

  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  useEffect(() => {
    if (hasNewPolicy) {
      translateY.value = withSpring(0, { damping: 16, stiffness: 120 });
    } else {
      translateY.value = withSpring(-60, { damping: 20, stiffness: 200 });
    }
  }, [hasNewPolicy, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  if (!isChecked || !hasNewPolicy) return null;

  const text = getBannerText(currentLanguage);

  return (
    <Animated.View style={[st.banner, animStyle]}>
      <Text style={st.msg} numberOfLines={2}>
        {text.msg}
      </Text>
      <View style={st.btns}>
        <PressableOpacity
          onPress={() => {
            dismissTemporarily();
            navigation.navigate('Notifications');
          }}
          style={st.viewBtn}
          activeOpacity={0.8}
          scaleDown={0.95}
        >
          <Text style={st.viewBtnText}>{text.btn}</Text>
        </PressableOpacity>
        <PressableOpacity
          onPress={() => dismissTemporarily()}
          style={st.dismissBtn}
          activeOpacity={0.7}
          scaleDown={0.97}
        >
          <Text style={st.dismissBtnText}>{text.dismiss}</Text>
        </PressableOpacity>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(212,168,83,0.07)',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8C070',
    elevation: 3
  },
  msg: {
    fontSize: 14,
    color: 'rgba(212,168,83,0.14)',
    marginBottom: 10,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.semibold
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  viewBtn: {
    backgroundColor: '#D4A853',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8
  },
  viewBtnText: {
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.bold,
    fontSize: 13
  },
  dismissBtn: {
    paddingHorizontal: 10,
    justifyContent: 'center'
  },
  dismissBtnText: {
    color: 'rgba(212,168,83,0.14)',
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold
  }
  });
