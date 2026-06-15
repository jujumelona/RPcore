import React, { useCallback, useEffect, useRef, useState } from 'react';
// ── [POLYFILL] document.cookie 폴리필은 index.js에서 Sentry 충돌 방지를 위해 제거됨.
// Amplitude 등에서의 접근은 AnalyticsService.ts의 cookieOptions: { disable: true } 로 대응.

import {
  View,
  StyleSheet,
  AppState,
  Animated,
  StatusBar,
  I18nManager,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, onlineManager, useIsFetching } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { enableFreeze } from 'react-native-screens';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import { getMessaging, getToken as fcmGetToken } from '@react-native-firebase/messaging';

import inferenceEngine from './src/core/native/InferenceEngine';
import { memoryManager } from './src/core/memory/MemoryManager';
import { streamingManager } from './src/core/streaming/StreamingManager';
import { initAuthEncryption } from './src/utils/storage';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import './src/core/i18n'; // 15개국어 코어 즉시 로드
import { useGlobalLoadingStore } from './src/store/globalLoadingStore';
import { SplashScreen } from './src/components/SplashScreen';
import { OfflineBanner } from './src/components/ui/OfflineBanner';
import { ToastContainer } from './src/components/Toast';
import { AnalyticsService } from './src/services/AnalyticsService';
import { useLanguageStore } from './src/store/languageStore';
import { useChatStore } from './src/store/chatStore';
import { useUserProfileStore } from './src/store/userProfileStore';
import { useModelStore } from './src/store/modelStore';
import { useAuthStore } from './src/store/authStore';
import { useEmotionStore, syncEmotionStoresToSharedValues } from './src/store/emotionStore';
import { useSettingsStore } from './src/store/settingsStore';
import { useAccessibilityStore } from './src/screens/accessibilityStore';
import RemoteConfig from './src/config/RemoteConfig';
import { mmkvQueryPersister, queryPersistOptions } from './src/utils/queryPersister';
import { initApp } from './src/utils/AppBootstrap';
import { installRuntimeGuard } from './src/utils/runtimeGuard';
import { installFetchTimeoutGuard } from './src/utils/fetchRuntime';
import { AppStability, uninstallAppStabilityGuard } from './src/utils/AppStability';
import { authedFetch } from './src/utils/authedFetch';

const APP_BG = '#050507';

enableFreeze(true);

type AppNavigatorComponent = React.ComponentType<any>;

let cachedAppNavigator: AppNavigatorComponent | null = null;

function loadAppNavigatorComponent(): AppNavigatorComponent {
  if (cachedAppNavigator) {
    return cachedAppNavigator;
  }

  const mod = require('./src/navigation/AppNavigator') as {
    AppNavigator?: AppNavigatorComponent;
    default?: AppNavigatorComponent;
  };

  const resolved = mod.AppNavigator ?? mod.default;
  if (!resolved) {
    throw new Error('AppNavigator export not found.');
  }

  cachedAppNavigator = resolved;
  return resolved;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
  },
});

onlineManager.setEventListener(setOnline => {
  return NetInfo.addEventListener(state => setOnline(state.isConnected ?? true));
});

function lockSystemBarsColor() {
  if (Platform.OS !== 'android') return;
  // ✅ FIX: 상태바 배경 투명 + Edge-to-Edge 활성화 (카메라 노치/상단 흰색 버그 영구 방지)
  // 기존 setTranslucent(false)는 시스템이 그 자리를 배경으로 채워 흰색 유발.
  // translucent(true)로 설정해 앱의 배경(#050507)이 카메라 노치 뒤로 그려지도록 함.
  StatusBar.setBackgroundColor(APP_BG, false);
  StatusBar.setBarStyle('light-content', false);
  StatusBar.setTranslucent(false);
  // ✅ FIX 16: 인트로 전 하단 네비게이션바 흰색 방지 — 앱 배경색으로 고정
  try {
    const { NavigationBar } = require('expo-navigation-bar');
    NavigationBar.setBackgroundColorAsync(APP_BG).catch(() => {});
    NavigationBar.setButtonStyleAsync('light').catch(() => {});
  } catch {
    // Navigation bar not available on this platform
  }
}

let _sentryInitialized = false;
function initSentry() {
  if (_sentryInitialized) return;
  const dsn = RemoteConfig.get('sentryDsn');
  if (!dsn) return;
  Sentry.init({ dsn, debug: __DEV__, tracesSampleRate: __DEV__ ? 0 : 0.2 });
  _sentryInitialized = true;
}

function runAfterStartup(task: () => void, delayMs = 0): () => void {
  let cancelled = false;
  let interactionHandle: { cancel?: () => void } | null = null;
  const timer = setTimeout(() => {
    if (cancelled) return;
    interactionHandle = { cancel: undefined };
    setTimeout(() => {
      if (cancelled) return;
      try { task(); } catch {
        // Task execution failed, but we don't want to crash the app
      }
    }, 0);
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    interactionHandle?.cancel?.();
  };
}

function GlobalLoadingIndicator() {
  const fetchingCount  = useIsFetching();
  const authLoading    = useAuthStore(s => s.isLoading);
  const modelSwitching = useModelStore(s => s.isSwitching);
  const globalCount    = useGlobalLoadingStore(s => s.count);

  const rawLoading = fetchingCount > 0 || authLoading || modelSwitching || globalCount > 0;
  // eslint-disable @typescript-eslint/no-unused-vars
  const [_showLoading, _setShowLoading] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (rawLoading) {
      // 300ms 이상 로딩 지속될 때만 표시 (깜빡임 방지)
      timer = setTimeout(() => _setShowLoading(true), 300);
    } else {
      _setShowLoading(false);
    }
    return () => clearTimeout(timer);
  }, [rawLoading]);

  return null;
}




function AppSpinner() {
  const rot = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 800, useNativeDriver: true }),
    );
    loop.start();
    return () => {
      loop.stop();
      rot.stopAnimation();
      rot.setValue(0);
    };
  }, [rot]);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
  );
}

function AppContent(): React.JSX.Element {
  const [phase, setPhase] = useState<'splash' | 'ready'>('splash');
  const [AppNav, setAppNav] = useState<React.ComponentType | null>(null);
  const splashFinishedRef = useRef(false);
  const isRTL = useLanguageStore(s => s.isRTL);
  const initLang = useLanguageStore(s => s.initialize);
  const initAuth = useAuthStore(s => s.initialize);
  const initChat = useChatStore(s => s.initialize);
  const initProfile = useUserProfileStore(s => s.initialize);
  const initModels = useModelStore(s => s.initialize);
  // Navigator loaded statically — no lazy load state needed

  useEffect(() => {
    installFetchTimeoutGuard(25_000);
    AppStability.check().catch(() => {});
    installRuntimeGuard();
    lockSystemBarsColor();

    const disposeDeferred: Array<() => void> = [];

    const softCleanup = () => {
      try { useChatStore.getState().flushPending().catch(() => {}); } catch {
        // Failed to flush chat store
      }
      try { memoryManager.awaitFlush().catch(() => {}); } catch {
        // Failed to flush memory manager
      }
      try { streamingManager.stop(); } catch {
        // Failed to stop streaming manager
      }
      try { inferenceEngine.cancelStream(); } catch {
        // Failed to cancel inference stream
      }
    };

    const hardCleanup = () => {
      softCleanup();
      try { queryClient.clear(); } catch {
        // Failed to clear query client
      }
    };

    let stopLeakGuard = () => {};

    (async () => {
      // ✅ [FIX] OpenCL GPU 초기화를 위한 vendor property 읽기 권한 요청
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.request(
            'android.permission.READ_PRIVILEGED_PHONE_STATE' as any,
            {
              title: 'GPU 가속 권한',
              message: 'AI 모델 GPU 가속을 위해 시스템 속성 접근이 필요합니다.',
              buttonPositive: '허용',
              buttonNegative: '거부',
            }
          );
        } catch {
          // Permission request failed, GPU will fallback to CPU
        }
      }

      // ✅ initAuth를 가장 먼저, 독립적으로 실행 — SecureStore는 네트워크 불필요
      // Sentry/RemoteConfig 등 느린 네트워크 콜과 완전히 분리
      initAuth().catch(() => {});

      await initApp();
      RemoteConfig.initialize().catch(() => {
        // RemoteConfig initialization failed
      });
      initSentry();

      if (Platform.OS === 'android') {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 64));
      }

      // ✅ FIX: 모든 초기화에 타임아웃 — SecureStore/MMKV hang으로 검정화면 방지
      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | void> =>
        Promise.race([p, new Promise<void>(resolve => setTimeout(resolve, ms))]);

      await withTimeout(initAuthEncryption().catch(() => {}), 3000);

      await withTimeout(
        Promise.all([
          Promise.resolve(useLanguageStore.persist.rehydrate()).catch(() => {}),
          Promise.resolve(useEmotionStore.persist.rehydrate()).catch(() => {}),
          Promise.resolve(useSettingsStore.persist.rehydrate()).catch(() => {}),
          Promise.resolve(useAccessibilityStore.persist.rehydrate()).catch(() => {}),
        ]),
        3000
      );
      // BUG-06 fix: sync emotion SharedValues after rehydration completes
      try { syncEmotionStoresToSharedValues(); } catch {
        // Failed to sync emotion stores
      }

      try { initLang(); } catch {
        // Failed to initialize language
      }

      // initAuth는 이미 위에서 독립 실행 중 — 나머지만 병렬 실행
      Promise.all([
        initChat().catch(() => {}),
        initModels().catch(() => {}),
      ]).catch(() => {});

      try { await initProfile(); } catch {
        // Failed to initialize profile
      }

      const u = useAuthStore.getState().user;
      if (u) {
        try {
          AnalyticsService.setUser({ id: u.id, email: u.email });
          AnalyticsService.setSentryUser({ id: u.id, email: u.email });
          if (u.consentVersion) AnalyticsService.initialize().catch(() => {});

          // ✅ 인트로(Splash) 화면 동안 서버 데이터 미리 불러오기 (하나로 뭉치는 효과)
          const lang = useLanguageStore.getState().appLanguage || 'ko';
          Promise.all([
            queryClient.prefetchQuery({ queryKey: ['unread-notifications'], queryFn: async () => { const r = await authedFetch('/api/notifications/unread-count'); return r.json(); } }),
            queryClient.prefetchQuery({ queryKey: ['announcements', lang], queryFn: async () => { const r = await authedFetch(`/api/announcements?lang=${lang}`); return r.json(); } }),
            queryClient.prefetchQuery({ queryKey: ['played-stories', lang], queryFn: async () => { const r = await authedFetch(`/api/stories/mine/played?lang=${lang}`); return r.json(); } }),
            queryClient.prefetchQuery({ queryKey: ['my-stories'], queryFn: async () => { const r = await authedFetch('/story-meta/mine'); return r.json(); } }),
          ]).catch(() => {});
        } catch {
          // Failed to initialize analytics services
        }
      }
    })();

    if (__DEV__) {
      disposeDeferred.push(
        runAfterStartup(() => {
          try {
            const { setupBugDetection } = require('./src/utils/debug');
            setupBugDetection({
              showPerformanceReport: true,
              enableMemoryLeakDetection: true,
              enablePerformanceProfiling: true,
            });
          } catch {
            // Failed to setup bug detection
          }
        }, 250),
      );
    }

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          const preloadedNavigator = loadAppNavigatorComponent();
          setAppNav(current => current ?? preloadedNavigator);
        } catch {
          // Failed to preload app navigator
        }
      }, 140),
    );

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          const { initializeAds } = require('./src/components/ads/AdManager');
          initializeAds().catch(() => {});
        } catch {
          // Failed to initialize ads
        }
      }, 950),
    );

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          const { memoryLeakGuard } = require('./src/utils/MemoryLeakGuard');
          stopLeakGuard = memoryLeakGuard.start({}, {
            onPressure: (info: unknown) => AnalyticsService.logEvent('ram_pressure', info as Record<string, unknown>),
            onLeakSuspected: (info: unknown) => {
              AnalyticsService.logEvent('ram_leak_suspected', info as Record<string, unknown>);
              softCleanup();
            },
            onCritical: (info: unknown) => {
              AnalyticsService.logEvent('ram_critical', info as Record<string, unknown>);
              hardCleanup();
            },
          });
        } catch {
          // Failed to start memory leak guard
        }
      }, 700),
    );

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          const { AppUpdateService } = require('./src/utils/AppUpdateService');
          AppUpdateService.bootstrapAppUpdates().catch(() => {});
        } catch {
          // Failed to bootstrap app updates
        }
      }, 850),
    );

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          const { flushCrashLogsToSentry } = require('./src/utils/crashLogger');
          flushCrashLogsToSentry().catch(() => {});
        } catch {
          // Failed to flush crash logs
        }
      }, 1000),
    );

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          const { purgeExpiredQueryCache } = require('./src/utils/queryPersister');
          purgeExpiredQueryCache().catch(() => {});
        } catch {
          // Failed to purge expired query cache
        }
      }, 1100),
    );

    disposeDeferred.push(
      runAfterStartup(() => {
        try {
          fcmGetToken(getMessaging())
            .then(token => {
              if (token) AnalyticsService.logEvent('fcm_token_ready', { prefix: token.slice(0, 8) });
            })
            .catch(() => {});
        } catch {
          // Failed to get FCM token
        }
      }, 1200),
    );

    const sub = AppState.addEventListener('change', async state => {
      if (state === 'background' || state === 'inactive') {
        // [BUG FIX] teardownApp() → 백그라운드 시 flush만 수행
        // 기존: teardownApp()이 OOM 핸들러, AppState 리스너, flush 콜백을 모두 해제함
        //       포그라운드 복귀 후 앱을 다시 백그라운드로 보내면 chatStore flush 미작동 → 데이터 유실
        // 수정: 필요한 flush만 직접 수행, teardownApp은 실제 앱 종료/테스트 시에만 사용
        try { useChatStore.getState().flushPending().catch(() => {}); } catch {
          // Failed to flush pending chat data
        }
        try { memoryManager.awaitFlush().catch(() => {}); } catch {
          // Failed to flush memory manager
        }
      }
      if (state === 'active') {
        lockSystemBarsColor();
      }
      AnalyticsService.logEvent('app_state_change', { state });
    });

    return () => {
      sub.remove();
      for (const dispose of disposeDeferred) {
        if (typeof dispose === 'function') dispose();
      }
      stopLeakGuard();
      uninstallAppStabilityGuard();
    };
  }, [initAuth, initChat, initLang, initModels, initProfile]);

  // Navigator loaded directly via import



  useEffect(() => {
    if (I18nManager.isRTL !== isRTL) I18nManager.forceRTL(isRTL);
  }, [isRTL]);

  const handleSplashFinish = useCallback(() => {
    if (splashFinishedRef.current) return;
    splashFinishedRef.current = true;

    try {
      const resolvedNavigator = loadAppNavigatorComponent();
      setAppNav(current => current ?? resolvedNavigator);
    } catch (e) {
      console.error('[App] AppNavigator load failed:', e);
    }

    setPhase('ready');
  }, []);

  if (phase === 'splash') return (
    <View style={styles.appBg}>
      <SystemBars style="light" />
      <StatusBar backgroundColor={APP_BG} barStyle="light-content" translucent={false} animated={false} />
      <SplashScreen onFinish={handleSplashFinish} />
    </View>
  );

  if (!AppNav) return (
    <View style={styles.loadingRoot}>
      <SystemBars style="light" />
      <StatusBar backgroundColor={APP_BG} barStyle="light-content" translucent={false} animated={false} />
      <AppSpinner />
    </View>
  );

  return (
    <>
      <SystemBars style="light" />
      <StatusBar backgroundColor={APP_BG} barStyle="light-content" translucent={false} animated={false} />
      <AppNav />
      <ErrorBoundary fallback={null}><OfflineBanner /></ErrorBoundary>
      <ErrorBoundary fallback={null}><ToastContainer /></ErrorBoundary>
    </>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return (
      <View style={styles.appBg}>
        <StatusBar backgroundColor={APP_BG} barStyle="light-content" translucent={false} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        <KeyboardProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              ...queryPersistOptions,
              persister: mmkvQueryPersister,
            }}
          >
            <BottomSheetModalProvider>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
              <ErrorBoundary fallback={null}>
                <GlobalLoadingIndicator />
              </ErrorBoundary>
            </BottomSheetModalProvider>
          </PersistQueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: APP_BG },
  appBg: { flex: 1, backgroundColor: APP_BG },
  loadingRoot: {
    flex: 1,
    backgroundColor: APP_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#1E1E2A',
    borderTopColor: '#D4A853',
  },
  navigatorRetryBox: {
    marginTop: 14,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  navigatorRetryText: {
    color: '#7E7E92',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  navigatorRetryButton: {
    borderWidth: 1,
    borderColor: '#2A2A3A',
    borderRadius: 10,
    backgroundColor: '#11111A',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  navigatorRetryButtonText: {
    color: '#D0D0E0',
    fontSize: 12,
    fontWeight: '600',
  },
});
