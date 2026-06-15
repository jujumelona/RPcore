// src/components/ads/AdManager.tsx
// ══════════════════════════════════════════════════════════════════
//  Google AdMob integration — Android only
//  패키지: react-native-google-mobile-ads ^16.0.3 (이미 설치됨)
//
//  android/app/src/main/AndroidManifest.xml — 이미 설정됨:
//    <uses-permission android:name="com.google.android.gms.permission.AD_ID"/>
//    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"
//               android:value="ca-app-pub-9020691040370881~6462881546"/>
//
//  제공 컴포넌트:
//    useAdInitialize   — SDK 초기화 (AppNavigator에서 1회 호출) ✅ 연결됨
//    AdBanner          — 배너 (고정 영역)
//    NativeAdStrip     — 네이티브 광고 스트립 (홈/채팅/웹소설 상단)
//                        30초 자동 갱신 + 로드 실패 시 height=0
//
//  NativeAd v16 API:
//    NativeAdView + NativeAssets (headlineView, bodyView, iconView, callToActionView)
//    테스트 환경 → 테스트 광고 단위 ID 자동 적용 (__DEV__)
// ══════════════════════════════════════════════════════════════════

import { Typography } from '../../constants/tokens';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, Platform, StatusBar, TouchableOpacity, AppState } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── AdMob 단위 ID ────────────────────────────────────────────────
const IS_TEST = __DEV__;

export const AD_IDS = {
  APP:             'ca-app-pub-9020691040370881~6462881546',
  BANNER:          IS_TEST
    ? 'ca-app-pub-3940256099942544/6300978111'
    : 'ca-app-pub-9020691040370881/1848344535',
  NATIVE_HOME:     IS_TEST
    ? 'ca-app-pub-3940256099942544/2247696110'
    : 'ca-app-pub-9020691040370881/3587933048',
  NATIVE_WEBNOVEL: IS_TEST
    ? 'ca-app-pub-3940256099942544/2247696110'
    : 'ca-app-pub-9020691040370881/4381451608',
  NATIVE_CHAT:     IS_TEST
    ? 'ca-app-pub-3940256099942544/2247696110'
    : 'ca-app-pub-9020691040370881/7007614946' } as const;

// ── 동적 라이브러리 로드 ─────────────────────────────────────────
// 설치 여부와 무관하게 import에서 크래시 방지

interface AdapterStatus { adapterName: string; state: number }
interface MobileAdsInstance { initialize(): Promise<AdapterStatus[]> }

// BannerAd API
type BannerAdComponent = React.ComponentType<{
  unitId: string;
  size: string;
  requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
  onAdLoaded?: () => void;
  onAdFailedToLoad?: (err: Error) => void;
}>;
interface BannerAdSizeMap {
  BANNER: string;
  LARGE_BANNER: string;
  MEDIUM_RECTANGLE: string;
  SMART_BANNER: string;
  ANCHORED_ADAPTIVE_BANNER: string;
}

// NativeAd API (v16)
interface NativeAdPayload {
  headline?:    string;
  body?:        string;
  callToAction?: string;
  icon?: { url?: string };
  advertiser?: string;
}
type NativeAdHookFn = (opts: { adUnitId: string }) => {
  load: () => void;
  nativeAd: NativeAdPayload | null;
  isLoading: boolean;
};
type NativeAdViewComponent = React.ComponentType<{
  nativeAd: NativeAdPayload;
  children: React.ReactNode;
  style?: object;
}>;

let MobileAdsModule: { (): MobileAdsInstance } | null = null;
let BannerAd: BannerAdComponent | null               = null;
let BannerAdSize: BannerAdSizeMap | null             = null;
let useNativeAd: NativeAdHookFn | null               = null;
let NativeAdView: NativeAdViewComponent | null       = null;
let adInitializePromise: Promise<void> | null        = null;

try {
  const m = require('react-native-google-mobile-ads');
  MobileAdsModule = m.default || m.MobileAds;
  BannerAd        = m.BannerAd   ?? null;
  BannerAdSize    = m.BannerAdSize ?? null;
  useNativeAd     = m.useNativeAd  ?? null;
  NativeAdView    = m.NativeAdView ?? null;

  if (__DEV__ && !BannerAd) {
    console.warn('[AdManager] BannerAd not available — check react-native-google-mobile-ads version');
  }
} catch {
  if (__DEV__) {
    console.warn('[AdManager] react-native-google-mobile-ads 로드 실패\n  → 이미 package.json에 있으므로 `npx expo run:android`로 재빌드 필요');
  }
}

// ══════════════════════════════════════════════════════════════════
//  useAdInitialize — AppNavigator에서 1회 호출 (이미 연결됨)
// ══════════════════════════════════════════════════════════════════
export function initializeAds(): Promise<void> {
  if (!MobileAdsModule) {
    return Promise.resolve();
  }

  if (adInitializePromise) {
    return adInitializePromise;
  }

  adInitializePromise = (async () => {
    try {
      const ads = MobileAdsModule!();
      await ads.initialize();
    } catch (e) {
      adInitializePromise = null;
      if (__DEV__) console.warn('[AdMob] initialization failed:', e);
    }
  })();

  return adInitializePromise;
}

export function useAdInitialize() {
  useEffect(() => {
    void initializeAds();
  }, []);
}

// ══════════════════════════════════════════════════════════════════
//  AdBanner — 고정 배너 광고
// ══════════════════════════════════════════════════════════════════
export type BannerSize = 'BANNER' | 'LARGE_BANNER' | 'MEDIUM_RECTANGLE' | 'SMART_BANNER';

interface AdBannerProps {
  size?: BannerSize;
  fallbackHeight?: number;
}

const SIZE_HEIGHTS: Record<BannerSize, number> = {
  BANNER: 52, LARGE_BANNER: 100, MEDIUM_RECTANGLE: 250, SMART_BANNER: 52 };

export function AdBanner({ size = 'BANNER', fallbackHeight }: AdBannerProps) {
  const [failed, setFailed] = useState(false);
  const height  = fallbackHeight ?? SIZE_HEIGHTS[size];
  const insets  = useSafeAreaInsets();
  const topPad  = insets.top > 0 ? insets.top : (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0);

  if (!BannerAd || !BannerAdSize || failed) {
    return (
      <View style={[st.placeholder, { height, marginTop: topPad }]}>
        {IS_TEST && <Text style={st.testLabel}>[ AD PLACEHOLDER ]</Text>}
      </View>
    );
  }

  return (
    <View style={[st.bannerWrap, { marginTop: topPad }]}>
      <BannerAd
        unitId={AD_IDS.BANNER}
        size={BannerAdSize[size]}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => setFailed(false)}
        onAdFailedToLoad={(err: Error) => {
          if (__DEV__) console.warn('[AdBanner] load failed:', err?.message);
          setFailed(true);
        }}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NativeAdStrip — 상단 고정 네이티브 광고 (30초 자동 갱신)
//
//  배치:
//    - HomeScreen SafeAreaView 상단 (FlashList 밖)
//    - ChatScreenRefactored AndroidScreen 상단 (FlatList 밖)
//    - WebNovelReaderScreen View 상단 (ScrollView 밖)
//
//  NativeAd v16 useNativeAd hook → 로드 실패 시 height=0 (레이아웃 점프 없음)
//  fallback: BannerAd ANCHORED_ADAPTIVE_BANNER (NativeAd API 미제공 시)
// ══════════════════════════════════════════════════════════════════
const REFRESH_MS = 30_000;

interface NativeAdStripProps {
  adUnitId: string;
}

// NativeAd hook을 사용하는 내부 컴포넌트 (조건부 hook 방지)
function NativeAdStripWithHook({ adUnitId }: NativeAdStripProps) {
  const { load, nativeAd, isLoading } = useNativeAd!({ adUnitId });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const clearRefreshTimer = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const runLoad = () => {
      if (appStateRef.current !== 'active') return;
      loadRef.current();
    };

    const startRefreshTimer = () => {
      clearRefreshTimer();
      timerRef.current = setInterval(() => {
        runLoad();
      }, REFRESH_MS);
    };

    runLoad();
    startRefreshTimer();

    const subscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        runLoad();
        startRefreshTimer();
        return;
      }
      clearRefreshTimer();
    });

    return () => {
      subscription.remove();
      clearRefreshTimer();
    };
  }, [adUnitId]);

  // 로딩 중이거나 광고 없으면 숨김 (height=0 → 레이아웃 점프 없음)
  if (isLoading || !nativeAd) return null;

  const AdView = NativeAdView as NonNullable<typeof NativeAdView>;

  const iconUrl     = nativeAd.icon?.url ?? '';
  const headline    = nativeAd.headline ?? '';
  const body        = nativeAd.body ?? '';
  const cta         = nativeAd.callToAction ?? '';
  const advertiser  = nativeAd.advertiser ?? '';

  return (
    <AdView nativeAd={nativeAd} style={st.nativeStrip}>
      <Text style={st.nativeAdLabel}>AD</Text>
      {!!iconUrl && (
        <Image
          source={{ uri: iconUrl }}
          style={st.nativeAdImg}
          contentFit="cover"
        />
      )}
      <View style={st.nativeAdContent}>
        {!!headline && (
          <Text style={st.nativeAdTitle} numberOfLines={1}>{headline}</Text>
        )}
        {!!(body || advertiser) && (
          <Text style={st.nativeAdBody} numberOfLines={1}>{body || advertiser}</Text>
        )}
      </View>
      {!!cta && (
        <TouchableOpacity style={st.nativeAdCta} activeOpacity={0.8}>
          <Text style={st.nativeAdCtaText}>{cta}</Text>
        </TouchableOpacity>
      )}
    </AdView>
  );
}

// BannerAd fallback (NativeAd hook 없을 때)
function NativeAdStripWithBanner({ adUnitId }: NativeAdStripProps) {
  const [key, setKey]       = useState(0);
  const [failed, setFailed] = useState(false);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef         = useRef(AppState.currentState);

  useEffect(() => {
    setFailed(false);
  }, [adUnitId]);

  useEffect(() => {
    const clearRefreshTimer = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const refreshBanner = () => {
      if (appStateRef.current !== 'active') return;
      setKey(k => k + 1);
      setFailed(false);
    };

    const startRefreshTimer = () => {
      clearRefreshTimer();
      timerRef.current = setInterval(() => {
        refreshBanner();
      }, REFRESH_MS);
    };

    startRefreshTimer();

    const subscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        refreshBanner();
        startRefreshTimer();
        return;
      }
      clearRefreshTimer();
    });

    return () => {
      subscription.remove();
      clearRefreshTimer();
    };
  }, []);

  if (!BannerAd || !BannerAdSize || failed) return null;

  return (
    <View style={st.nativeStrip}>
      <Text style={st.nativeAdLabel}>AD</Text>
      <BannerAd
        key={key}
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => setFailed(false)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

export function NativeAdStrip({ adUnitId }: NativeAdStripProps) {
  // NativeAd API가 사용 가능하면 우선 사용, 없으면 BannerAd fallback
  if (useNativeAd && NativeAdView) {
    return <NativeAdStripWithHook adUnitId={adUnitId} />;
  }
  if (BannerAd && BannerAdSize) {
    return <NativeAdStripWithBanner adUnitId={adUnitId} />;
  }
  // 광고 SDK 완전 미사용 환경 (개발 시뮬레이터 등) → 아무것도 렌더링 안 함
  if (__DEV__) {
    return (
      <View style={st.devPlaceholder}>
        <Text style={st.devPlaceholderText}>[ AD STRIP — DEV ]</Text>
      </View>
    );
  }
  return null;
}

// ── 스타일 ───────────────────────────────────────────────────────
const st = StyleSheet.create({
  bannerWrap: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#050507' },
  placeholder: {
    width: '100%',
    backgroundColor: '#050507',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#08080C' },
  testLabel: {
    fontSize: 9,
    color: '#0E0E14',
    letterSpacing: 1.5 },

  // NativeAdStrip
  nativeStrip: {
    width: '100%',
    backgroundColor: '#050507',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#0C0C14',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56 },
  nativeAdLabel: {
    fontSize: 8,
    color: '#4ADE80',
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: '#4ADE80',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start' },
  nativeAdImg: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.14)',
    flexShrink: 0 },
  nativeAdContent:  { flex: 1, gap: 2 },
  nativeAdTitle:    { fontSize: 12, color: '#E0E0E0', fontFamily: Typography.fontFamily.semibold, lineHeight: 16 },
  nativeAdBody:     { fontSize: 10, color: '#8A8A9E', lineHeight: 14 },
  nativeAdCta: {
    backgroundColor: '#D4A853',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'center',
    flexShrink: 0 },
  nativeAdCtaText: { fontSize: 10, color: '#050507', fontFamily: Typography.fontFamily.bold },

  devPlaceholder: {
    width: '100%',
    height: 32,
    backgroundColor: '#0A0A10',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#181820',
    alignItems: 'center',
    justifyContent: 'center' },
  devPlaceholderText: { fontSize: 9, color: '#252535', letterSpacing: 1.5 } });
