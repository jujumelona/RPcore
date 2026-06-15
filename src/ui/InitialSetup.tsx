import { useCallback, useEffect, useRef, useState } from 'react';
import { View,
  Text,
  StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableOpacity } from '../components/PressableOpacity';

import { getDownloadedModels } from '../utils/modelUtils';
import { modelDownloader, DownloadProgress } from '../core/llama/ModelDownloader';
import { useLanguageStore } from '../store/languageStore';
import { ModelSelector } from './ModelSelector';
import { getTranslations } from '../i18n/translations';
import { appStorage } from '../utils/storage';

// 온보딩 완료 여부 키 (OnboardingScreen.tsx와 동일하게 맞춤)
const ONBOARDING_KEY = 'onboarding_complete_v3';

type Step = 'checking' | 'download' | 'complete';

export function InitialSetup({ onComplete }: { onComplete: () => void }) {
  const storeT = useLanguageStore(s => s.t);
  const t = storeT ?? getTranslations('ko');
  const [step, setStep] = useState<Step>('checking');
  const modelChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const safeComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const checkModel = useCallback(async () => {
    // 온보딩 미완료 사용자 = 새 설치 → 모델 없음이 확실하므로 즉시 통과
    const onboardingDone = appStorage.getString(ONBOARDING_KEY) === '1';
    if (!onboardingDone) {
      safeComplete();
      return;
    }

    // 모델 체크에 최대 4초 타임아웃 — RNFS hang 방지
    const timeout = new Promise<'timeout'>(res => setTimeout(() => res('timeout'), 4000));
    const check   = getDownloadedModels().then(models => models);

    const result = await Promise.race([check, timeout]);

    if (result === 'timeout') {
      // 타임아웃 → 일단 통과 (모델 없으면 채팅 시 다운로드 안내)
      safeComplete();
      return;
    }

    if (((result as typeof result & { length?: number }).length ?? 0) > 0) {
      safeComplete();
    } else {
      setStep('download');
    }
  }, [safeComplete]);

  useEffect(() => {
    checkModel().catch(() => {
      // 예외 발생해도 앱이 stuck 안 되게 통과
      safeComplete();
    });
  }, [checkModel, safeComplete]);

  useEffect(() => {
    let completeTimerId: ReturnType<typeof setTimeout> | null = null;

    const listener = (progress: DownloadProgress) => {
      if (progress.status === 'completed') {
        setStep('complete');
        completeTimerId = setTimeout(() => safeComplete(), 1200);
      }
    };

    modelDownloader.addListener(listener);
    return () => {
      modelDownloader.removeListener(listener);
      if (completeTimerId !== null) clearTimeout(completeTimerId);
      if (modelChangeTimerRef.current !== null) {
        clearTimeout(modelChangeTimerRef.current);
        modelChangeTimerRef.current = null;
      }
    };
  }, [safeComplete]);


  if (step === 'checking') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>{t?.checkingModel ?? 'Checking model...'}</Text>
      </SafeAreaView>
    );
  }

  if (step === 'download') {
    return (
      <SafeAreaView style={styles.full}>
        <View style={styles.header}>
          <Text style={styles.title}>{t?.downloadModel ?? 'Download model'}</Text>
          <Text style={styles.desc}>{t?.downloadModelDesc ?? 'Please download a model to continue.'}</Text>
        </View>
        <View style={styles.selectorWrap}>
          <ModelSelector
            onModelChange={() => {
              if (modelChangeTimerRef.current !== null) {
                clearTimeout(modelChangeTimerRef.current);
              }
              modelChangeTimerRef.current = setTimeout(() => {
                modelChangeTimerRef.current = null;
                safeComplete();
              }, 800);
            }}
          />
        </View>
        <View style={styles.footer}>
          <PressableOpacity style={styles.skipBtn} onPress={safeComplete}>
            <Text style={styles.skipText}>{t?.continueBtn ?? 'Continue'}</Text>
          </PressableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.centered}>
      <Text style={styles.title}>{t?.modelReady ?? 'Model ready'}</Text>
      <Text style={styles.desc}>{t?.modelReadyDesc ?? 'You can start chatting now.'}</Text>
      <PressableOpacity style={styles.btn} onPress={safeComplete}>
        <Text style={styles.btnText}>{t?.startChat ?? 'Start chat'}</Text>
      </PressableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#050507',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32 },
  full: { flex: 1, backgroundColor: '#050507' },
  header: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 32, paddingBottom: 4 },
  selectorWrap: { flex: 1 },
  footer: { alignItems: 'center', paddingBottom: 12 },
  logo: { fontSize: 42, fontWeight: 'bold', color: '#F0F0F5', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#F0F0F5', marginBottom: 10, textAlign: 'center' },
  desc: { fontSize: 14, color: '#8A8A9E', marginBottom: 8, textAlign: 'center', lineHeight: 22 },
  btn: { width: '100%', padding: 16, backgroundColor: '#F0F0F5', borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#050507', fontSize: 16, fontWeight: 'bold' },
  skipBtn: { padding: 12 },
  skipText: { color: '#797990', fontSize: 14 } });
