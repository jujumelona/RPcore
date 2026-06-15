﻿// src/core/llama/LanguageTokenBias.ts
// ════════════════════════════════════════════════════════════════════
// 비-사용자-언어 스크립트 토큰 logit 페널티 생성기
//
// 목적:
//   작은 모델(Gemma 3 1B 등)은 시스템 프롬프트에 다른 언어(예: 한국어)
//   예시가 있으면 출력 중간에 그 언어가 섞이는 경향이 있음.
//   LanguageEnforcer(프롬프트 지시)로는 100% 방어가 안 되는 경우를 위해
//   logit_bias로 비-사용자-언어 스크립트 토큰에 강한 페널티를 부여.
//
// 전략:
//   - 완전 차단(-∞ / false) 대신 강한 페널티(-40)를 사용
//     → 완전 차단 시 고유명사, 숫자 등 공유 토큰까지 날릴 수 있음
//   - 사용자 언어 스크립트는 페널티 없음 (바이어스 0)
//   - 숫자(0-9), 기본 라틴(알파벳, 구두점) 등 범용 토큰은 제외
//   - 각 스크립트에서 가장 고빈도 대표 문자 샘플만 사용
//     → LlamaEngine이 네이티브 호출 직전에 문자열 샘플을
//        실제 토큰 ID 배열로 정규화해서 전달함
//
// 사용법:
//   const biasEntries = buildLanguageTokenBias('ja'); // 일본어 사용자
//   // → 한국어, 중국어, 아랍어, 태국어, 힌디어, 키릴 문자 등에 -40 페널티
//   // → 히라가나, 가타카나, 한자는 페널티 없음
//
//   llamaEngine.generate(messages, { logitBias: biasEntries });
// ════════════════════════════════════════════════════════════════════

import type { LogitBiasEntry } from './LlamaEngine';
import type { LanguageCode } from '../../i18n/languages';

const ENGLISH_LANGUAGE_CODES = new Set<LanguageCode>(['en']);

// Keep this list small. We want to bias generic English fallback replies,
// not fight with every Latin character or every possible word.
const ENGLISH_REPLY_SAMPLES = [
  'Okay',
  ' okay',
  'Hello',
  ' hello',
  'You',
  ' you',
  'I',
  ' I',
  'AI',
  ' AI',
  'Let',
  ' let',
  'What',
  ' what',
  'your',
  ' your',
  'name',
  ' name',
  'just',
  ' just',
  'this',
  ' this',
  'that',
  ' that',
  'with',
  ' with',
  'and',
  ' and',
  'the',
  ' the',
] as const;

const ENGLISH_REPLY_PENALTY = -8;

// ── 메인 함수 ────────────────────────────────────────────────────

/**
 * Non-English users get a light bias against common English reply tokens.
 * English users receive no bias.
 */
export function buildLanguageTokenBias(userLang: LanguageCode): LogitBiasEntry[] {
  if (ENGLISH_LANGUAGE_CODES.has(userLang)) return [];
  return ENGLISH_REPLY_SAMPLES.map((sample) => [sample, ENGLISH_REPLY_PENALTY]);
}

/**
 * 언어가 바뀔 때마다 bias 배열을 다시 계산하면 비용이 드므로
 * 언어 코드를 키로 캐시한다.
 */
const _cache = new Map<LanguageCode, LogitBiasEntry[]>();

export function getCachedLanguageTokenBias(userLang: LanguageCode): LogitBiasEntry[] {
  if (!_cache.has(userLang)) {
    _cache.set(userLang, buildLanguageTokenBias(userLang));
  }
  return _cache.get(userLang)!;
}
