﻿/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/ChapterSummarizer.ts
// ════════════════════════════════════════════════════════════════════
//
//  챕터 전환 전용 극도 압축 요약기
//
//  전략: 2단계 파이프라인
//
//  [1단계] 순수 로직 사전 필터 (LLM 없음, 즉시)
//    - @N: 감정 블록 제거    -> 이미 별도 저장됨, 완전 불필요
//    - 짧은 리액션 제거      -> "응", "알겠어", "그래?" 등 정보 없음
//    - 중복 나레이터 제거    -> 반복 묘사 줄임
//    - 중요도 점수로 상위만  -> 행동/선택/감정변화가 있는 턴만 추출
//
//  [2단계] 구조화 LLM 요약 (포맷 강제)
//    - 산문 요약 금지 -> 키-값 구조체만 출력
//    - 목표 출력: 40~60토큰
//    - 포맷: event:X|who:N|result:Y$event:...
//
//  결과:
//    기존: 200토큰 자유 요약
//    신규: 40~60토큰 구조체
//    압축률 개선: 3~5배 추가
//
// ════════════════════════════════════════════════════════════════════

import { logger } from './logger';
import { mmrSelect } from './MathUtils';
import { embeddingEngine } from '../core/llama/EmbeddingEngine';

// ── 포맷 상수 ─────────────────────────────────────────────────────

/**
 * LLM 출력 포맷 구분자.
 * 파싱이 단순하고 모델이 따르기 쉬운 구조.
 * 예: "event:고백|who:2|result:거절됨$event:도주|who:2,3|result:헤어짐"
 */
const EVENT_SEP  = '$';  // 이벤트 간 구분
const FIELD_SEP  = '|';  // 필드 간 구분
const KV_SEP     = ':';  // 키-값 구분

/** 최대 출력 토큰 (LLM generate maxTokens) */
const MAX_OUTPUT_TOKENS = 60;

/** 1단계 필터 후 LLM에 넘길 최대 입력 줄 수 */
const MAX_FILTERED_LINES = 15;

/** 짧은 리액션으로 간주할 최대 글자 수 */
const REACTION_MAX_CHARS = 15;

// ── 타입 ─────────────────────────────────────────────────────────

export interface ParsedEvent {
  event:  string;
  who:    string;
  result: string;
}

export interface ChapterSummaryResult {
  /** 구조체 raw 문자열 (저장/전달용) */
  raw:    string;
  /** 파싱된 이벤트 배열 (ContextBuilder 주입용) */
  events: ParsedEvent[];
  /** 입력 메시지 수 */
  inputCount: number;
  /** 필터 후 LLM에 넘긴 줄 수 */
  filteredCount: number;
  /** 출력 토큰 수 추정 */
  outputTokensEstimate: number;
}

// ── 1단계: MMR 기반 사전 필터 ────────────────────────────────────

/**
 * MMR(Maximal Marginal Relevance)로 메시지를 선택.
 *
 * 기존 휴리스틱 대비 개선:
 *   - 관련성: 다음 챕터 쿼리와 실제 의미적 유사도 (임베딩)
 *   - 다양성: 이미 선택된 것과 중복되는 메시지 자동 제외
 *   - 중복 대화가 많아도 핵심만 뽑힘
 *
 * 임베딩 엔진 미준비 시 -> 휴리스틱 폴백 (서비스 중단 없음)
 *
 * @param messages      전체 메시지
 * @param nextChapterHint 다음 챕터 목표/키워드 (MMR 쿼리로 사용)
 */
async function preFilterMMR(
  messages: Array<{ speaker: string | number; content: string }>,
  nextChapterHint = '',
): Promise<string[]> {
  // 감정 블록 제거 + 짧은 리액션 제거 (공통 전처리)
  const cleaned = messages
    .map(m => ({
      speaker: String(m.speaker),
      content: m.content.replace(/@\d+:[^\n]+/g, '').trim() }))
    .filter(m => m.content.length > REACTION_MAX_CHARS);

  if (cleaned.length === 0) return [];

  // ── 임베딩 준비 여부 확인 ───────────────────────────────────
  if (!embeddingEngine.isReady()) {
    // 폴백: 간단한 중요도 점수 필터
    return _heuristicFilter(cleaned);
  }

  try {
    // 쿼리: 다음 챕터 힌트 or 마지막 3줄 (미래 관련성 근사)
    // [BUG FIX #5] cleaned 내용이 모두 공백이거나 nextChapterHint가 없으면 queryText가 ''가 됨.
    // embedQuery('')는 throw할 수 있으므로 빈 문자열일 경우 _heuristicFilter로 조기 반환.
    const queryText = (nextChapterHint.trim() ||
      cleaned.slice(-3).map(m => m.content).filter(Boolean).join(' ')).trim();

    if (!queryText) return _heuristicFilter(cleaned);

    const queryVec = await embeddingEngine.embedQuery(queryText);

    // 후보 임베딩 (배치)
    const texts = cleaned.map(m => m.content);
    const vecs  = await embeddingEngine.embedDocumentBatch(texts);

    // [BUG FIX] 배치 결과 길이 불일치 또는 undefined 항목 방어
    // embedDocumentBatch가 부분 실패 시 vecs.length !== texts.length 또는 vecs[i] === undefined
    if (!vecs || vecs.length !== texts.length) {
      logger.warn('[ChapterSummarizer] embedDocumentBatch 길이 불일치 → 휴리스틱 폴백');
      return _heuristicFilter(cleaned);
    }

    // MMR 선택 (λ=0.6: 관련성 60%, 다양성 40%)
    const indices = Array.from({ length: cleaned.length }, (_, i) => i);
    const selected = mmrSelect(
      queryVec,
      indices,
      (i) => {
        const v = vecs[i];
        if (!v) throw new Error(`vecs[${i}] undefined`);
        return v;
      },
      MAX_FILTERED_LINES,
      0.6,
    );

    // 원래 시간 순서 복원
    selected.sort((a, b) => a - b);
    return selected.map(i => `${cleaned[i].speaker}:${cleaned[i].content}`);

  } catch (e) {
    logger.warn('[ChapterSummarizer] MMR 실패 -> 휴리스틱 폴백:', e);
    return _heuristicFilter(cleaned);
  }
}

function _heuristicFilter(cleaned: { speaker: string; content: string }[]): string[] {
  return cleaned
    .filter(m => {
      const c = m.content;
      return (
        // 행동 묘사 (#...#) — 언어 무관
        /#[^#\n]+#/.test(c) ||
        // 속마음 (*...*) — 언어 무관
        /\*[^*\n]+\*/.test(c) ||
        // 유저(1번) 발화는 항상 포함 — 플레이어 선택이 스토리 핵심
        m.speaker === '1' ||
        // 충분히 긴 발화 — 짧은 리액션("응", "ok", "I see") 제외
        c.length > 40
        // [BUG FIX] 기존: /사랑|미움|화가|슬프|기쁘|두렵|놀라|실망|고백|거절|용서|배신/ 한국어 하드코딩
        // -> 영어/일어/중국어 등 다국어 대화에서 매칭 안 되어 중요 장면 요약 누락
        // -> 구조 기반(#행동#, *속마음*, 발화 길이)으로 교체하여 언어 무관하게 동작
      );
    })
    .slice(-MAX_FILTERED_LINES)
    .map(m => `${m.speaker}:${m.content}`);
}

// ── 2단계: 구조화 LLM 프롬프트 빌더 ────────────────────────────

/**
 * 필터된 줄을 극도로 압축하는 LLM 프롬프트.
 *
 * 핵심 원칙:
 *   - 산문 출력 완전 금지
 *   - 키-값 구조체만 허용
 *   - 감정 수치 언급 금지 (별도 저장됨)
 *   - 최대 60토큰
 */
function buildCompressedPrompt(filteredLines: string[]): string {
  const dialogue = filteredLines.join('\n');

  return (
    `Output ONLY in this exact format, no prose, no explanation:\n` +
    `event:X|who:N|result:Y${EVENT_SEP}event:X|who:N|result:Y\n` +
    `Rules:\n` +
    `- event: one verb phrase (max 4 words)\n` +
    `- who: character ID number only\n` +
    `- result: outcome in 3 words max\n` +
    `- max 3 events total\n` +
    `- NO emotions (stored separately)\n` +
    `- NO full sentences\n\n` +
    `Dialogue:\n${dialogue}\n\n` +
    `Output:`
  );
}

// ── 파서 ────────────────────────────────────────────────────────

/**
 * Parse a compact chapter summary string into ParsedEvent[].
 *
 * Example:
 * "event:confession|who:2|result:rejected$event:escape|who:2|result:success"
 */
export function parseChapterSummary(raw: string): ParsedEvent[] {
  return raw
    .split(EVENT_SEP)
    .map(chunk => {
      const fields: Record<string, string> = {};
      chunk.split(FIELD_SEP).forEach(f => {
        const idx = f.indexOf(KV_SEP);
        if (idx > 0) {
          fields[f.slice(0, idx).trim()] = f.slice(idx + 1).trim();
        }
      });
      return {
        event:  fields.event  ?? '',
        who:    fields.who    ?? '',
        result: fields.result ?? '' };
    })
    .filter(e => e.event.length > 0);
}

// ── ContextBuilder 주입용 포맷 변환 ─────────────────────────────

/**
 * Convert ParsedEvent[] into a short context string for the next chapter prompt.
 *
 * Example: "[CH2] confession(2)->rejected|escape(2)->success"
 */
export function eventsToContextString(events: ParsedEvent[], chapterNum: number): string {
  if (events.length === 0) return '';
  const eventStr = events
    .map(e => `${e.event}(${e.who})->${e.result}`)
    .join('|');
  return `[CH${chapterNum}] ${eventStr}`;
}

// ── 메인 클래스 ──────────────────────────────────────────────────

export class ChapterSummarizer {
  private static instance: ChapterSummarizer;

  static getInstance(): ChapterSummarizer {
    if (!ChapterSummarizer.instance) {
      ChapterSummarizer.instance = new ChapterSummarizer();
    }
    return ChapterSummarizer.instance;
  }

  /**
   * 챕터 전환 시 호출. 2단계 파이프라인 실행.
   *
   * @param messages   현재 챕터 전체 메시지
   * @param llmGenerate  llamaEngine.generateRaw 또는 동등한 함수
   * @param chapterNum 현재 챕터 번호 (태그용)
   */
  async summarize(
    messages: Array<{ speaker: string | number; content: string }>,
    llmGenerate: (prompt: string, maxTokens: number) => Promise<string>,
    chapterNum: number,
    nextChapterHint = '',
  ): Promise<ChapterSummaryResult> {
    const inputCount = messages.length;

    // ── 1단계: MMR 필터 (임베딩 기반, 폴백 포함) ─────────────
    const filtered = await preFilterMMR(messages, nextChapterHint);
    const filteredCount = filtered.length;

    logger.log(
      `[ChapterSummarizer] 1단계 필터: ${inputCount}개 -> ${filteredCount}줄`,
    );

    // 필터 후 아무것도 없으면 빈 결과
    if (filteredCount === 0) {
      return {
        raw: '', events: [],
        inputCount, filteredCount, outputTokensEstimate: 0 };
    }

    // ── 2단계: 구조화 LLM 요약 ───────────────────────────────
    const prompt = buildCompressedPrompt(filtered);
    const raw    = await llmGenerate(prompt, MAX_OUTPUT_TOKENS);
    const clean  = raw.trim().replace(/^Output:\s*/i, '');

    const events = parseChapterSummary(clean);
    const outputTokensEstimate = Math.ceil(clean.length / 3.5);

    logger.log(
      `[ChapterSummarizer] 2단계 완료: ${outputTokensEstimate}tok | ` +
      `${events.length}개 이벤트 | "${clean.slice(0, 60)}"`,
    );

    return { raw: clean, events, inputCount, filteredCount, outputTokensEstimate };
  }

  /**
   * 다음 챕터 시스템 프롬프트에 주입할 문자열 반환.
   * ContextBuilder.buildPrompt()의 [Long-term Memory] 섹션 대체.
   */
  toContextString(result: ChapterSummaryResult, chapterNum: number): string {
    return eventsToContextString(result.events, chapterNum);
  }
}

export const chapterSummarizer = ChapterSummarizer.getInstance();
