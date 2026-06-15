// ✅ 순환 의존성 방지 - package.json 대신 버전 문자열 직접 사용
const pkg = { version: '1.0.0' };

// ── EAS 프로젝트 ID ────────────────────────────────────────────────────────
const projectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
  process.env.EAS_PROJECT_ID?.trim() ||
  '63604095-4e19-4af9-bffc-b59eee38341e';
const updatesEnabled =
  process.env.EXPO_PUBLIC_ENABLE_UPDATES === '1' ||
  process.env.EAS_BUILD_PROFILE === 'production';

// ── 환경 변수 기반 설정 ────────────────────────────────────────────────────
const ADMOB_APP_ID = process.env.ADMOB_APP_ID?.trim()  ?? 'ca-app-pub-3940256099942544~3347511713';
const HF_TOKEN     = process.env.HF_TOKEN?.trim()      ?? '';

const ADMOB_BANNER_ID         = process.env.ADMOB_BANNER_ID?.trim()         ?? '';
const ADMOB_NATIVE_HOME_ID    = process.env.ADMOB_NATIVE_HOME_ID?.trim()    ?? '';
const ADMOB_NATIVE_WEBNOVEL_ID= process.env.ADMOB_NATIVE_WEBNOVEL_ID?.trim()  ?? '';
const ADMOB_NATIVE_CHAT_ID    = process.env.ADMOB_NATIVE_CHAT_ID?.trim()    ?? '';
const AMPLITUDE_API_KEY = process.env.AMPLITUDE_API_KEY?.trim() ?? '';
const SENTRY_DSN = process.env.SENTRY_DSN?.trim() ?? '';
const GOOGLE_WEB_CLIENT_ID    = process.env.GOOGLE_WEB_CLIENT_ID?.trim()
  ?? '806767847275-o5vduumma9uciog9gqrh166elq3qvniu.apps.googleusercontent.com';

const extra = {
  HF_TOKEN,
  GOOGLE_WEB_CLIENT_ID,
  ADMOB_APP_ID,
  ADMOB_BANNER_ID,
  ADMOB_NATIVE_HOME_ID,
  ADMOB_NATIVE_WEBNOVEL_ID,
  ADMOB_NATIVE_CHAT_ID,
  AMPLITUDE_API_KEY,
  SENTRY_DSN,
  DEBUG_BYPASS_AUTH: process.env.EXPO_PUBLIC_DEBUG_BYPASS_AUTH === '1',
  ...(projectId ? { eas: { projectId } } : {}),
};

const updates = {
  enabled: updatesEnabled,
  checkAutomatically: updatesEnabled ? 'ON_ERROR_RECOVERY' : 'NEVER',
  fallbackToCacheTimeout: 0,
  ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
};

const sentryPlugin = [
  '@sentry/react-native/expo',
  { organization: 'rpplatform', project: 'rpplatform' },
];

module.exports = {
  expo: {
    name:  'RPCore',
    slug:  'rpplatform',
    owner: 'melonauy',
    version: pkg.version,
    icon: './assets/icon.png',

    android: {
      package: 'com.rpplatform',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff'
      },
      versionCode: 1,
      newArchEnabled: true,
      googleServicesFile: './android/app/google-services.json',
      config: {
        googleMobileAdsAppId: ADMOB_APP_ID,
      },
    },

    plugins: [
      'expo-asset',
      'expo-dev-client',
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/Pretendard-Black.ttf',
            './assets/fonts/Pretendard-Bold.ttf',
            './assets/fonts/Pretendard-ExtraBold.ttf',
            './assets/fonts/Pretendard-ExtraLight.ttf',
            './assets/fonts/Pretendard-Light.ttf',
            './assets/fonts/Pretendard-Medium.ttf',
            './assets/fonts/Pretendard-Regular.ttf',
            './assets/fonts/Pretendard-SemiBold.ttf',
            './assets/fonts/Pretendard-Thin.ttf',
          ],
        },
      ],
      [
        'llama.rn',
        { 
          enableOpenCLAndHexagon: true,
          enableEntitlements: true,
          entitlementsProfile: 'production',
          forceCxx20: true
        },
      ],
      [
        'react-native-edge-to-edge',
        {
          android: {
            enforceNavigationBarContrast: false,
          },
        },
      ],
      './plugins/withDisplayCutout',
      './plugins/withRpcoreAndroid',
      sentryPlugin,
    ],

    runtimeVersion: pkg.version,
    updates,
    extra: projectId ? { ...extra, eas: { projectId } } : extra,
  },
};
