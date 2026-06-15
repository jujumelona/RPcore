// ✅ [PERF] AIStoryChatScreen.parser.ts 성능 최적화 버전
// 원본 parseResponse 로직 포함 + 챕터 동적 인식 기능 유지

import { parseResponse as originalParseResponse } from './AIStoryChatScreen.parser';
import type { FormData } from './AIStoryChatScreen.types';

/**
 * 비동기 파싱 래퍼 - UI 블록 방지
 * requestIdleCallback 또는 setTimeout으로 메인 스레드 양보
 */
export async function parseResponseAsync(
  raw: string, 
  form: FormData
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    // requestIdleCallback이 있으면 사용, 없으면 setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        resolve(originalParseResponse(raw, form));
      });
    } else {
      setTimeout(() => {
        resolve(originalParseResponse(raw, form));
      }, 0);
    }
  });
}

/**
 * 동기 파싱 (기존 호환성 유지)
 * 챕터 동적 인식 로직 포함:
 * - AI가 생성한 챕터 개수를 자동으로 인식 (CH_N 키 기반)
 * - form.chapterCount는 fallback으로만 사용
 */
export function parseResponse(raw: string, form: FormData): Record<string, unknown> {
  return originalParseResponse(raw, form);
}
