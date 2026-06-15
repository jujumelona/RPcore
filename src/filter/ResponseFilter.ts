﻿// src/filters/ResponseFilter.ts
// AI 응답 후처리 필터 — SequentialGenerator에서 사용

/**
 * AI 출력 텍스트를 정제하고 스타일을 적용하는 필터
 */
class ResponseFilter {
  // ── 불필요한 접두/접미 패턴 ─────────────────────────────────
  private readonly STRIP_PREFIXES = [
    /^(Narration:|Response:|Character:|Assistant:|AI:)\s*/i,
    /^\[.*?\]\s*/,
  ];

  private readonly STRIP_SUFFIXES = [
    /\s*\[END\]\s*$/i,
    /\s*<\|end\|>\s*$/i,
    /\s*<\/s>\s*$/,
  ];

  /**
   * 원시 AI 응답을 정제합니다.
   * - 앞뒤 공백 제거
   * - 불필요한 접두/접미 태그 제거
   * - 빈 줄 정규화
   */
  clean(raw: string): string {
    if (!raw) return '';

    let text = raw.trim();

    for (const pattern of this.STRIP_PREFIXES) {
      text = text.replace(pattern, '');
    }
    for (const pattern of this.STRIP_SUFFIXES) {
      text = text.replace(pattern, '');
    }

    // 연속 빈 줄 3개 이상 -> 2개로 압축
    text = text.replace(/\n{3 }/g, '\n\n');

    return text.trim();
  }

  /**
   * 스타일 접미사를 텍스트에 적용합니다.
   * e.g. style = "dramatic" -> 문장 끝에 강조 처리
   */
  applyStyleSuffix(text: string, style: string): string {
    if (!text || !style) return text;

    switch (style.toLowerCase()) {
      case 'dramatic':
        // 마지막 문장이 !나 …로 끝나지 않으면 … 추가
        if (!/[!?…]$/.test(text.trimEnd())) {
          return text.trimEnd() + '…';
        }
        return text;

      case 'calm':
        // 느낌표를 마침표로 완화
        return text.replace(/!/g, '.');

      case 'intense':
        if (!text.trimEnd().endsWith('!')) {
          return text.trimEnd() + '!';
        }
        return text;

      default:
        return text;
    }
  }

  /**
   * 텍스트가 불완전하게 잘렸는지 확인합니다.
   */
  isIncomplete(text: string): boolean {
    const trimmed = text.trimEnd();
    if (!trimmed) return true;
    // [BUG FIX] 이스케이프된 따옴표 및 한국어 따옴표 제외 후 체크
    // 기존: 이스케이프(\") 포함 카운팅 → 홀짝 오판
    const noEscaped = trimmed.replace(/\\["']/g, ''); // 이스케이프된 따옴표 제거
    const noKorean  = noEscaped.replace(/[「」『』\u201C\u201D\u2018\u2019]/g, ''); // 한국어 따옴표 제거 (쌍 구성이므로 각 2개씩)
    const dqOpen = (noKorean.match(/"/g) || []).length % 2 !== 0;
    const sqOpen = (noKorean.match(/'/g) || []).length % 2 !== 0;
    return dqOpen || sqOpen;
  }
}

export const responseFilter = new ResponseFilter();
export default ResponseFilter;
