﻿/**
 * RemoteConfig
 * ─────────────────────────────────────────────────────────────────
 * 민감한 API 키(Amplitude, Sentry 등)를 앱 번들에 하드코딩하지 않고
 * 서버 /api/client-config 에서 가져옵니다.
 *
 * 흐름:
 *   App.tsx -> RemoteConfig.initialize() -> GET /api/client-config
 *   -> 결과를 메모리에 캐시하고 AnalyticsService / Sentry 가 get() 으로 읽음
 *
 * 오류 처리:
 *   - 네트워크 실패 시 빈값으로 폴백 (앱은 계속 실행, 분석 이벤트만 누락)
 *   - 타임아웃 5초 (시작 지연 최소화)
 */

import { SERVER_BASE } from './ApiConfig';
import Constants from 'expo-constants';

// 빌드 타임에 app.config.js -> extra로 주입된 키 (서버 실패 시 fallback)
function _envFallback(): ClientConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return {
    amplitudeApiKey: (extra.AMPLITUDE_API_KEY as string | undefined)?.trim() ?? '',
    sentryDsn:       (extra.SENTRY_DSN       as string | undefined)?.trim() ?? '' };
}

interface ClientConfig {
  amplitudeApiKey: string;
  sentryDsn: string;
}

const DEFAULT_CONFIG: ClientConfig = {
  amplitudeApiKey: '',
  sentryDsn: '' };

let _config: ClientConfig = { ...DEFAULT_CONFIG };
let _initialized = false;
let _initPromise: Promise<void> | null = null;

/**
 * 앱 시작 시 1회 호출.
 * 이미 호출된 경우 동일한 Promise 반환 (중복 요청 방지).
 */
export function initialize(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);

      const res = await fetch(`${SERVER_BASE}/api/client-config`, {
        signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as Partial<ClientConfig>;
        _config = {
          amplitudeApiKey: data.amplitudeApiKey?.trim() ?? '',
          sentryDsn:       data.sentryDsn?.trim()       ?? '' };
        // 서버 응답에 키가 없으면 env fallback으로 보충
        if (!_config.amplitudeApiKey) {
          _config.amplitudeApiKey = _envFallback().amplitudeApiKey;
        }
        if (!_config.sentryDsn) {
          _config.sentryDsn = _envFallback().sentryDsn;
        }
      } else {
        _config = _envFallback();
      }
    } catch {
      // 네트워크 없음 / 타임아웃 -> .env(app.config.js extra)로 폴백
      _config = _envFallback();
      if (__DEV__) console.warn('[RemoteConfig] 서버 실패, env fallback 사용:', _config.amplitudeApiKey ? '키 있음' : '키 없음');
    } finally {
      _initialized = true;
    }
  })();

  return _initPromise;
}

/** 설정값 조회. initialize() 완료 전에도 안전하게 호출 가능 (빈값 반환). */
export function get<K extends keyof ClientConfig>(key: K): ClientConfig[K] {
  return _config[key];
}

export function isInitialized(): boolean {
  return _initialized;
}

const RemoteConfig = { initialize, get, isInitialized };
export default RemoteConfig;
