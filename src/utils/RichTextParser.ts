/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/RichTextParser.ts
// ═══════════════════════════════════════════════════════════════════
//  Bluesky RichText 패턴 이식
//  — URL, @멘션, #해시태그 자동 감지 및 세그먼트 분리
//  — XSS-safe (정규식 기반, 외부 라이브러리 불필요)
// ═══════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────

export type SegmentType = 'text' | 'url' | 'mention' | 'hashtag';

export interface TextSegment {
  type: SegmentType;
  text: string;
  /** URL이면 전체 URL, 멘션이면 username(@ 제외), 태그면 tag(# 제외) */
  value?: string;
}

// ── Patterns ──────────────────────────────────────────────────────

// URL: http(s), ftp, or www.
// eslint-disable-next-line no-useless-escape
const URL_REGEX = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>\[\]{}()|\\^`"']+/gi;
// @mention: @로 시작, 영문/숫자/언더스코어/점 (2~30자)
const MENTION_REGEX = /@([a-zA-Z0-9_][a-zA-Z0-9_.]{1,29})/g;
// #hashtag: #로 시작, 유니코드 문자/숫자/언더스코어 (1~50자)
const HASHTAG_REGEX = /#([\p{L}\p{N}_]{1,50})/gu;

// ── Parser ────────────────────────────────────────────────────────

interface Match {
  type: SegmentType;
  start: number;
  end: number;
  text: string;
  value: string;
}

function findAllMatches(input: string): Match[] {
  const matches: Match[] = [];

  // URL
  let m: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(input)) !== null) {
    matches.push({
      type: 'url',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      value: m[0].startsWith('www.') ? `https://${m[0]}` : m[0] });
  }

  // @mention (URL과 겹치는 것은 나중에 제거)
  MENTION_REGEX.lastIndex = 0;
  while ((m = MENTION_REGEX.exec(input)) !== null) {
    matches.push({
      type: 'mention',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      value: m[1] });
  }

  // #hashtag
  HASHTAG_REGEX.lastIndex = 0;
  while ((m = HASHTAG_REGEX.exec(input)) !== null) {
    // # 뒤에 순수 숫자만 있으면 해시태그가 아님
    if (/^\d+$/.test(m[1])) continue;
    matches.push({
      type: 'hashtag',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      value: m[1] });
  }

  // 정렬 (start 기준 오름차순)
  matches.sort((a, b) => a.start - b.start);

  // 겹치는 매치 제거 (URL > 멘션 > 태그 우선)
  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      filtered.push(match);
      lastEnd = match.end;
    }
  }

  return filtered;
}

/**
 * 텍스트를 세그먼트로 파싱
 *
 * @example
 * parse('Hello @alice check https://example.com #react')
 * // [
 * //   { type: 'text', text: 'Hello ' },
 * //   { type: 'mention', text: '@alice', value: 'alice' },
 * //   { type: 'text', text: ' check ' },
 * //   { type: 'url', text: 'https://example.com', value: 'https://example.com' },
 * //   { type: 'text', text: ' ' },
 * //   { type: 'hashtag', text: '#react', value: 'react' },
 * // ]
 */
export function parseRichText(input: string): TextSegment[] {
  if (!input) return [];

  const matches = findAllMatches(input);
  if (matches.length === 0) {
    return [{ type: 'text', text: input }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    // 매치 이전 텍스트
    if (cursor < match.start) {
      segments.push({ type: 'text', text: input.slice(cursor, match.start) });
    }

    segments.push({ type: match.type, text: match.text, value: match.value });
    cursor = match.end;
  }

  // 마지막 텍스트
  if (cursor < input.length) {
    segments.push({ type: 'text', text: input.slice(cursor) });
  }

  return segments;
}

/**
 * 텍스트에서 모든 멘션 username 추출
 */
export function extractMentions(input: string): string[] {
  return parseRichText(input)
    .filter(s => s.type === 'mention')
    .map(s => s.value!);
}

/**
 * 텍스트에서 모든 해시태그 추출
 */
export function extractHashtags(input: string): string[] {
  return parseRichText(input)
    .filter(s => s.type === 'hashtag')
    .map(s => s.value!);
}
