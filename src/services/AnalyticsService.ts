﻿// src/services/AnalyticsService.ts
// ══════════════════════════════════════════════════════════════════════
// 통합 분석 + 모니터링 서비스 v2
//
// Amplitude — logEvent / setUser / setUserProperties 풀 연결
// Sentry    — setSentryUser / setModelTag / setStoryContext / addBreadcrumb
// FCM       — 푸시 권한 요청
// ✅ FCM       — 푸시 권한 요청
//
// 이벤트 상수 (EVENT.*) 중앙 관리 → 오타 방지, 타입 자동완성
// ══════════════════════════════════════════════════════════════════════

import * as Amplitude from '@amplitude/analytics-react-native';
import * as Sentry from '@sentry/react-native';
import { requestPermission, getMessaging } from '@react-native-firebase/messaging';
let _mI: ReturnType<typeof getMessaging> | null = null;
const _messaging = () => { if (!_mI) _mI = getMessaging(); return _mI; };
import RemoteConfig from '../config/RemoteConfig';

let _amplitudeInitialized = false;
// ✅ FIX: DEV 빌드에서 Amplitude 네트워크 에러 스팸 방지 — 개발 중엔 비활성화
const _amplitudeEnabled = !__DEV__;

// ── 이벤트 이름 상수 ───────────────────────────────────────────────
export const EVENT = {
  // 스토리
  STORY_STARTED:         'story_started',
  STORY_COMPLETED:       'story_completed',
  CHAPTER_COMPLETED:     'chapter_completed',
  CHAPTER_CHANGED:       'chapter_changed',
  STORY_LIKED:           'story_liked',
  STORY_BOOKMARKED:      'story_bookmarked',
  STORY_REPORTED:        'story_reported',
  // 채팅
  CHAT_MESSAGE_SENT:     'chat_message_sent',
  CHAT_CONTINUED:        'chat_continued',
  CHAT_REFUSAL_RECEIVED: 'chat_refusal_received',
  // 모델/엔진
  MODEL_LOADED:          'model_loaded',
  MODEL_SWITCHED:        'model_switched',
  MODEL_LOAD_FAILED:     'model_load_failed',
  KV_CACHE_HIT:          'kv_cache_hit',
  KV_CACHE_MISS:         'kv_cache_miss',
  ENGINE_ERROR:          'engine_error',
  // 온보딩/인증
  ONBOARDING_COMPLETED:  'onboarding_completed',
  LOGIN_SUCCESS:         'login_success',
  LOGOUT:                'logout',
  // 앱
  APP_FOREGROUND:        'app_foreground',
  OFFLINE_DETECTED:      'offline_detected',
  ONLINE_RESTORED:       'online_restored' } as const;

export type EventName = typeof EVENT[keyof typeof EVENT];

type BreadcrumbCategory = 'navigation' | 'user_action' | 'engine' | 'network' | 'kv_cache';

// ══════════════════════════════════════════════════════════════════════

export const AnalyticsService = {

  // ── 초기화 ──────────────────────────────────────────────────────

  async initialize() {
    // 민감 키는 RemoteConfig(서버)에서 가져옴 — 앱 번들에 하드코딩 금지
    if (!_amplitudeEnabled) return; // DEV 빌드에서 Amplitude 비활성화
    const amplitudeKey = RemoteConfig.get('amplitudeApiKey');
    if (amplitudeKey && !_amplitudeInitialized) {
      try {
        await Amplitude.init(amplitudeKey, undefined, {
          flushQueueSize:      30,
          flushIntervalMillis: 30_000,
          flushMaxRetries:     1,
          // api2.amplitude.com 대신 안정적인 엔드포인트 사용 (한국 연결 불안정 방지)
          serverUrl: 'https://api.amplitude.com/2/httpapi',
          // [FIX] React Native(Hermes)에서 document.cookie / window.screen 접근 크래시 방지
          // cookieOptions: { disable: true }, // not in ReactNativeOptions type
        }).promise;
        _amplitudeInitialized = true;
        if (__DEV__) console.log('[Analytics] Amplitude initialized');
      } catch (e) {
        console.warn('[Analytics] Amplitude init failed:', e);
      }
    } else if (!amplitudeKey) {
      if (__DEV__) console.warn('[Analytics] AMPLITUDE_API_KEY 미설정 (RemoteConfig)');
    }

    // [BUG FIX] iOS에서 FCM 권한 요청 누락 수정
    // 기존: Platform.OS === 'android' 조건으로 Android에서만 권한 요청
    // iOS는 requestPermission()을 호출하지 않으면 푸시 알림이 동작하지 않음
    // 수정: 모든 플랫폼에서 권한 요청 (Android도 동일하게 유지)
    try {
      await requestPermission(_messaging());
    } catch (e) {
      console.error('[Analytics] FCM Error:', e);
    }
  },

  initializeIfConsented(consentVersion: string | undefined | null) {
    if (!consentVersion) return;
    // eslint-disable-next-line no-void
    void AnalyticsService.initialize();
  },

  // ── Amplitude 이벤트 ────────────────────────────────────────────

  logEvent(eventName: EventName | string, params?: Record<string, unknown>) {
    if (!_amplitudeInitialized) return;
    try { Amplitude.track(eventName, params); } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
    if (__DEV__) console.log(`[Analytics] ${eventName}`, params);
  },

  // ── Amplitude 사용자 ─────────────────────────────────────────────

  /** 로그인 성공 시 호출 — Amplitude userId 세팅 */
  setUser(user: { id: string; email?: string }) {
    if (!_amplitudeInitialized) return;
    try { Amplitude.setUserId(user.id); } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  /**
   * 디바이스/언어 등 속성 설정.
   * 어떤 티어에서 이탈하는지, 어떤 언어 사용자인지 파악 가능.
   */
  setUserProperties(props: {
    deviceTier?: string;
    language?:   string;
    modelId?:    string;
    platform?:   string;
  }) {
    if (!_amplitudeInitialized) return;
    try {
      const identify = new Amplitude.Identify();
      if (props.deviceTier) identify.set('device_tier', props.deviceTier);
      if (props.language)   identify.set('language', props.language);
      if (props.modelId)    identify.set('active_model', props.modelId);
      if (props.platform)   identify.set('platform', props.platform);
      Amplitude.identify(identify);
    } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  clearUser() {
    if (!_amplitudeInitialized) return;
    try { Amplitude.setUserId(undefined); Amplitude.reset(); } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  // ── Sentry 컨텍스트 ─────────────────────────────────────────────

  /** 로그인/로그아웃 시 호출 — 어떤 유저에서 에러가 터졌는지 추적 */
  setSentryUser(user: { id: string; email?: string } | null) {
    try {
      Sentry.setUser(user ? { id: user.id, email: user.email } : null);
    } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  /** 모델 로드 시 호출 — 어떤 모델에서 에러가 터졌는지 추적 */
  setModelTag(modelId: string) {
    try { Sentry.setTag('model_id', modelId); } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  /** ChatScreen 진입/챕터 전환 시 호출 — 에러 맥락 정보 */
  setStoryContext(ctx: { storyId: string; genre?: string; chapterIdx?: number }) {
    try {
      Sentry.setContext('story', {
        id:          ctx.storyId,
        genre:       ctx.genre,
        chapter_idx: ctx.chapterIdx });
    } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  /**
   * 주요 액션마다 호출 → Sentry 이슈에서 에러 직전 사용자 흐름 확인 가능.
   * @example
   *   AnalyticsService.addBreadcrumb({ message: 'sendMessage', category: 'user_action', data: { turn: 3 } })
   */
  addBreadcrumb(opts: {
    message:   string;
    category?: BreadcrumbCategory;
    level?:    'info' | 'warning' | 'error';
    data?:     Record<string, unknown>;
  }) {
    try {
      Sentry.addBreadcrumb({
        message:  opts.message,
        category: opts.category ?? 'user_action',
        level:    opts.level    ?? 'info',
        data:     opts.data });
    } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  },

  // ── 에러 리포트 ─────────────────────────────────────────────────

  logError(error: Error, context?: string, extra?: Record<string, unknown>) {
    try {
      Sentry.captureException(error, { extra: { context, ...extra } });
    } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
    if (__DEV__) console.error(`[Analytics] Error in ${context}:`, error);
  },

  logMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    try { Sentry.captureMessage(message, level); } catch (e) { if (__DEV__) console.warn(`[AnalyticsService] ignored error:`, e); }
  } };

declare const __DEV__: boolean;

