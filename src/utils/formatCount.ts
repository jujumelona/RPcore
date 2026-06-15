/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/formatCount.ts
// ── 숫자 축약 포맷 유틸 (15개 언어 완전 지원) ──────────────────────
// HomeScreen / StoryDetailScreen / SearchScreen / StoryScreen 공통
// 사용: import { formatCount } from '../utils/formatCount';
//
// ── 언어별 단위 설계 원칙 ─────────────────────────────────────────
// ko: 만(U+B9CC 한글) / 억 — 중국 한자 万(U+4E07) 절대 사용 금지
// ja: 万(U+4E07) / 億 — 일본어에서는 万가 맞는 표기
// zh-CN: 万(U+4E07) / 亿 — 간체 표기
// zh-TW: 萬(U+842C) / 億 — 번체는 萬으로 다름
// th: หมื่น(10K) / ล้าน(1M) — 태국 고유 단위
// ar: ألف(K) / مليون(M) — 아랍어 단위, 숫자는 그대로 (동-아랍 숫자 변환 없음)
// hi: हज़ार(K) / लाख(100K) / करोड़(10M) — 인도 단위 체계
// 서유럽(en/es/pt/fr/de/it/tr/ru): K / M / B — 국제 표준
//
// Hermes(React Native JS 엔진) Intl.NumberFormat compact 미지원 대응:
//   -> 각 언어별 수동 포맷 먼저 적용 후 Intl fallback 시도

/** 숫자를 1자리 소수로 반올림, 소수점이 0이면 정수 표기 */
function fmt(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? `${Math.trunc(rounded)}${unit}` : `${rounded.toFixed(1)}${unit}`;
}

export function formatCount(n: number, locale = 'ko'): string {
  if (!Number.isFinite(n) || n < 0) return '0';

  switch (locale) {
    // ── 한국어: 만(U+B9CC)/억 — 한글 단위 ──────────────────────────
    // [BUG FIX] 万(U+4E07, 중국 한자) -> 만(U+B9CC, 한글) 수정
    case 'ko':
      if (n >= 100_000_000) return fmt(n / 100_000_000, '억');
      if (n >= 10_000)      return fmt(n / 10_000,      '만');
      if (n >= 1_000)       return fmt(n / 1_000,       '천');
      return n.toLocaleString('ko');

    // ── 일본語: 万(U+4E07)/億 — 일본어는 万가 올바른 표기 ────────────
    case 'ja':
      if (n >= 100_000_000) return fmt(n / 100_000_000, '億');
      if (n >= 10_000)      return fmt(n / 10_000,      '万');
      if (n >= 1_000)       return fmt(n / 1_000,       '千');
      return n.toLocaleString('ja');

    // ── 중국어 간체: 万(U+4E07)/亿 ──────────────────────────────────
    case 'zh-CN':
      if (n >= 100_000_000) return fmt(n / 100_000_000, '亿');
      if (n >= 10_000)      return fmt(n / 10_000,      '万');
      if (n >= 1_000)       return fmt(n / 1_000,       '千');
      return n.toLocaleString('zh-CN');

    // ── 중국어 번체: 萬(U+842C)/億 — 간체 万와 다름 ─────────────────
    case 'zh-TW':
      if (n >= 100_000_000) return fmt(n / 100_000_000, '億');
      if (n >= 10_000)      return fmt(n / 10_000,      '萬');
      if (n >= 1_000)       return fmt(n / 1_000,       '千');
      return n.toLocaleString('zh-TW');

    // ── 태국어: ล้าน(100만)/หมื่น(1만)/พัน(천) ─────────────────────
    case 'th':
      if (n >= 1_000_000) return fmt(n / 1_000_000, 'ล้าน');
      if (n >= 10_000)    return fmt(n / 10_000,    'หมื่น');
      if (n >= 1_000)     return fmt(n / 1_000,     'พัน');
      return n.toLocaleString('th');

    // ── 힌디어: करोड़(1천만)/लाख(십만)/हज़ार(천) ─────────────────────
    case 'hi':
      if (n >= 10_000_000) return fmt(n / 10_000_000, 'कर');   // करोड़ 축약
      if (n >= 100_000)    return fmt(n / 100_000,    'लाख');
      if (n >= 1_000)      return fmt(n / 1_000,      'हज़');  // हज़ार 축약
      return n.toLocaleString('hi');

    // ── 아랍어: مليون(M)/ألف(K) ──────────────────────────────────────
    case 'ar':
      if (n >= 1_000_000_000) return fmt(n / 1_000_000_000, 'مليار');
      if (n >= 1_000_000)     return fmt(n / 1_000_000,     'مليون');
      if (n >= 1_000)         return fmt(n / 1_000,         'ألف');
      return n.toLocaleString('ar');

    // ── 러시아어: млн/тыс ────────────────────────────────────────────
    case 'ru':
      if (n >= 1_000_000_000) return fmt(n / 1_000_000_000, 'млрд');
      if (n >= 1_000_000)     return fmt(n / 1_000_000,     'млн');
      if (n >= 1_000)         return fmt(n / 1_000,         'тыс');
      return n.toLocaleString('ru');

    // ── 서유럽 + 터키 (en/es/pt/fr/de/it/tr): B/M/K 국제 표준 ────────
    case 'en':
    case 'es':
    case 'pt':
    case 'fr':
    case 'de':
    case 'it':
    case 'tr':
    default: {
      if (n >= 1_000_000_000) return fmt(n / 1_000_000_000, 'B');
      if (n >= 1_000_000)     return fmt(n / 1_000_000,     'M');
      if (n >= 1_000)         return fmt(n / 1_000,         'K');
      return String(n);
    }
  }
}

/**
 * Intl.NumberFormat compact 지원 환경에서 OS 로케일 포맷 사용.
 * React Native Hermes 엔진에서 compact 미지원 시 formatCount()로 자동 fallback.
 */
export function formatCountIntl(n: number, locale = 'ko'): string {
  try {
    const formatted = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1 }).format(n);
    // Intl 출력이 숫자만 반환(compact 미지원)하면 수동 포맷으로 fallback
    if (/^\d+$/.test(formatted) && n >= 1_000) {
      return formatCount(n, locale);
    }
    return formatted;
  } catch {
    return formatCount(n, locale);
  }
}
