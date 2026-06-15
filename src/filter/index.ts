﻿// src/filter/index.ts  — 통합 필터 진입점
//
// ── v2.0 수정 내역 ───────────────────────────────────────────
// [RELAX] 키워드 대폭 완화 — 법적으로 반드시 막아야 하는 것만 차단
//
//  ✅ 허용: 키스, 포옹, 로맨스, 성인 간 성적 묘사
//           살인·폭력·자살 등 단어 자체 (RP 픽션 서사상 정상)
//           욕설, 성인 주제 대화 전반
//
//  차단: loli/shota 계열 (미성년 성적 묘사 전용 용어, 법적 필수)
//           자해·자살 '방법론' 구체 서술
//           마약·폭탄 '제조법' 구체 서술
//
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// 1. InputFilter — 사용자 입력 / AI 출력 안전 검사
// ═══════════════════════════════════════════════════════════════

// 미성년자 성적 묘사 전용 용어 — 법적 필수, 예외 없음
// (단순히 "아동", "청소년" 단어는 차단하지 않음)
const FORBIDDEN_MINORS = [
  '로리', '쇼타', 'loli', 'shota', 'ロリ', 'ショタ',
  'child porn', 'cp content', '아동 포르노',
];

// 실제 행동 유도 — 단어 자체가 아닌 "방법론" 조합만 차단
// ("자살", "마약" 단어 자체는 RP 픽션에서 허용)
const FORBIDDEN_HARMFUL = [
  '목매달기 방법', '손목긋기 방법', '자살하는 방법', '죽는 방법 알려',
  'how to commit suicide', 'suicide method step',
  '필로폰 만드는', '마약 만드는', '폭탄 만드는',
  'meth recipe', 'bomb making instructions', 'how to make drugs',
];

// [PERF] 모듈 로드 시 1회 생성
const ALL_FORBIDDEN: readonly string[] = [...FORBIDDEN_MINORS, ...FORBIDDEN_HARMFUL];
const ALL_FORBIDDEN_LOWER: readonly string[] = ALL_FORBIDDEN.map(k => k.toLowerCase());

export interface FilterResult {
  allowed: boolean;
  reason?: string;
}

export const InputFilter = {
  /**
   * 사용자 입력 또는 AI 출력 검사.
   * @param text    검사할 텍스트
   * @param strict  true = harmful도 검사 (기본 true)
   */
  check(text: string, strict = true): FilterResult {
    const lower = text.toLowerCase();

    for (const kw of FORBIDDEN_MINORS) {
      if (lower.includes(kw.toLowerCase())) {
        return { allowed: false, reason: '미성년자 관련 콘텐츠는 허용되지 않습니다.' };
      }
    }

    if (strict) {
      for (const kw of FORBIDDEN_HARMFUL) {
        if (lower.includes(kw.toLowerCase())) {
          return { allowed: false, reason: '해당 내용은 서비스 정책상 허용되지 않습니다.' };
        }
      }
    }

    return { allowed: true };
  },

  /**
   * 스트리밍 중 누적 텍스트 검사 (빠른 처리용).
   * [PERF] 사전 생성된 ALL_FORBIDDEN_LOWER 재사용.
   */
  checkStreaming(accumulated: string): { shouldStop: boolean } {
    const lower = accumulated.toLowerCase();
    return { shouldStop: ALL_FORBIDDEN_LOWER.some(kw => lower.includes(kw)) };
  } };

// ═══════════════════════════════════════════════════════════════
// 2. OutputCleaner — AI 응답 사족 제거
// ═══════════════════════════════════════════════════════════════

const REMOVE_PATTERNS: Array<[RegExp, string]> = [
  // 한국어 사족
  [/알겠습니다\.?/gi, ''],
  [/네,?\s*알겠어요\.?/gi, ''],
  [/더 궁금한 게 있으신가요\??/gi, ''],
  [/제 생각에는\.{0,3}/gi, ''],
  [/좋은 하루 되세요\.?/gi, ''],
  [/도움이 되었으면 좋겠습니다\.?/gi, ''],
  // 영어 사족
  [/I understand\.?/gi, ''],
  [/Is there anything else\??/gi, ''],
  [/Let me know if you need\.{0,3}/gi, ''],
  [/Hope this helps\.?/gi, ''],
  // 이모티콘
  [/\(웃음\)/gi, ''],
  [/\(미소\)/gi, ''],
  [/\(Smile\)/gi, ''],
  // AI 혼자 질문 만드는 패턴
  [/사용자:\s*.+/gi, ''],
  [/질문:\s*.+/gi, ''],
  [/User:\s*.+/gi, ''],
  [/Question:\s*.+/gi, ''],
];

const STOP_SEQUENCES = ['사용자:', 'User:', '질문:', 'Question:', '\n\n\n'];

class OutputCleaner {
  clean(text: string): string {
    let out = text;
    for (const [pattern, replacement] of REMOVE_PATTERNS) {
      out = out.replace(pattern, replacement);
    }
    for (const seq of STOP_SEQUENCES) {
      const idx = out.indexOf(seq);
      if (idx !== -1) out = out.substring(0, idx);
    }
    out = out.replace(/\s+/g, ' ').replace(/\n{3 }/g, '\n\n').trim();
    return out;
  }

  applyStyleSuffix(text: string, suffix: string): string {
    const sentences = text.split(/[.!?]/);
    const last = sentences[sentences.length - 1]?.trim();
    if (!last) return text;
    const withoutLast = text.substring(0, text.lastIndexOf(last));
    return `${withoutLast}${last}${suffix}`;
  }
}

export const outputCleaner = new OutputCleaner();

// ── 하위 호환 re-export ──────────────────────────────────────

/** @deprecated InputFilter.check() 사용 권장 */
export const MinimalFilter = {
  checkInput: (text: string) => InputFilter.check(text),
  checkStreaming: (acc: string) => InputFilter.checkStreaming(acc) };

/** @deprecated outputCleaner 사용 권장 */
export const responseFilter = outputCleaner;
