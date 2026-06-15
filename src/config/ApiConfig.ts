﻿import Constants from 'expo-constants';

interface AppExtra {
  HF_TOKEN?:       string;
  ADMOB_APP_ID?:   string;
  WORKER_BASE_URL?: string;
  eas?:            { projectId?: string };
}

const extra = (
  Constants.expoConfig?.extra ??
  (Constants as typeof Constants & { manifest?: { extra?: AppExtra } }).manifest?.extra ??
  {}
) as AppExtra;

// ✅ [BUG FIX] 하드코딩 제거 — expo config extra.WORKER_BASE_URL 또는 환경변수 우선 사용
// 서버 마이그레이션 시 앱 재빌드 없이 변경 가능
const _envBase = extra.WORKER_BASE_URL ?? process.env.EXPO_PUBLIC_WORKER_BASE_URL;
export const SERVER_BASE: string = _envBase
  ? _envBase.replace(/\/$/, '')
  : 'https://misty-mode-b5f5.bnm4564085.workers.dev';

export const ApiConfig = {
  workerBaseUrl: SERVER_BASE };

/** Hugging Face 인증 토큰 (비공개 모델 다운로드용) */
export function getHFToken(): string | undefined {
  const token = extra.HF_TOKEN?.trim();
  return token && token.startsWith('hf_') ? token : undefined;
}

/** Sentry DSN — RemoteConfig.get('sentryDsn') 으로 대체됨
 * @deprecated App.tsx 에서 RemoteConfig를 직접 사용하세요
 */
export function getSentryDSN(): string {
  return '';
}

/** EAS 프로젝트 ID */
export function getEASProjectId(): string | undefined {
  return extra.eas?.projectId;
}
