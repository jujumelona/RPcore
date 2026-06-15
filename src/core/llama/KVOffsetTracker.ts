/* eslint-disable @typescript-eslint/no-unused-vars */
// src/core/llama/KVOffsetTracker.ts
// ════════════════════════════════════════════════════════════════════
// KV 레이어별 정확한 토큰 포인터(Offset) 관리
//
// ┌──────────────────────────────────────────────────────────────────┐
// │  KV 슬롯 레이아웃 (n_ctx = 8192 예시)                           │
// │                                                                  │
// │  [0 ─────────── baseEnd]  Base 레이어 (불변)                     │
// │    worldSetting + characters + rules                             │
// │    ~ 800~1,500 토큰 / n_keep = baseEnd → 롤링윈도우에서 보존    │
// │                                                                  │
// │  [baseEnd ─── chapterEnd]  Chapter 레이어                        │
// │    prevSummary + chapterInfo + aiGoal                            │
// │    ~ 300~600 토큰 / 챕터 전환 시 이 범위부터 교체                │
// │                                                                  │
// │  [chapterEnd ─────── ...]  Turn 레이어 (매 턴 축적)              │
// │    dialogueHistory + 유저입력 + AI응답                           │
// │    ctx 꽉 차면 [baseEnd..chapterEnd] 보존하며 앞부분 슬라이딩    │
// │                                                                  │
// └──────────────────────────────────────────────────────────────────┘
//
// 핵심 메커니즘:
//   1. prefill 후 context.tokenize(text) → 정확한 토큰 수 측정
//   2. 각 레이어 끝 토큰 위치를 baseEnd / chapterEnd 로 추적
//   3. n_keep = baseEnd → llama.cpp 롤링윈도우가 Base를 절대 버리지 않음
//   4. n_cache_reuse = baseEnd → 최소 base 전체가 공통 prefix여야 KV 재사용
//   5. saveSession 직전 오프셋을 직렬화하여 파일로 저장
//      → 앱 재시작/챕터 로드 후 정확한 포인터 복원
//
// llama.rn 0.8.x에서 tokenize()는 LlamaContext에 실제 존재하지만
// LlamaContextExtended 타입 정의에 누락되어 있으므로 여기서 추가 선언함.
// ════════════════════════════════════════════════════════════════════

import RNFS from '../../utils/fileSystemCompat';
import { logger } from '../../utils/logger';
import { DEFAULT_N_CACHE_REUSE } from './kv-spec-constants';
import { trace } from '../../utils/KVTrace';

// ── 타입 ──────────────────────────────────────────────────────────

/** context.tokenize()가 반환하는 형태 (llama.rn 0.8.x) */
export interface TokenizeResult {
  tokens: number[];
}

/** LlamaContextExtended에 tokenize를 추가한 확장 타입 */
export interface LlamaContextWithTokenize {
  tokenize(text: string, addBos?: boolean): Promise<TokenizeResult>;
  completion(params: Record<string, unknown>, onToken?: (d: { token: string }) => void): Promise<{ text: string }>;
  saveSession(path: string): Promise<void>;
  loadSession(path: string): Promise<void>;
  resetKVCache?: () => Promise<void>;
  clearKVCache?: () => Promise<void>;
}

/** 레이어별 토큰 오프셋 스냅샷 */
export interface KVOffsetSnapshot {
  /** Base 레이어 마지막 토큰 위치 (exclusive) */
  baseEnd:    number;
  /** Chapter 레이어 마지막 토큰 위치 (exclusive) */
  chapterEnd: number;
  /** 스냅샷 생성 시각 */
  savedAt:    number;
  /** 어떤 챕터 인덱스에 대한 스냅샷인지 */
  chapterIdx: number;
}

// ── 상수 ──────────────────────────────────────────────────────────

/** n_keep 최솟값 — DeviceProfiler nKeep(512)보다 실제 base 토큰 수가 더 클 수 있음 */
const MIN_N_KEEP = 512;

/** 오프셋 메타 파일 디렉토리 */
const OFFSET_DIR = `${RNFS.DocumentDirectoryPath}/kv_offsets`;

// ── KVOffsetTracker ────────────────────────────────────────────────

export class KVOffsetTracker {
  private _snapshot: KVOffsetSnapshot = { baseEnd: 0, chapterEnd: 0, savedAt: 0, chapterIdx: -1 };
  private _cachedSnapshot: KVOffsetSnapshot | null = null;
  private _ctx: LlamaContextWithTokenize | null = null;

  // ── 초기화 ─────────────────────────────────────────────────────

  init(ctx: LlamaContextWithTokenize): void {
    this._ctx = ctx;
    this.reset();
  }

  reset(): void {
    // [BUG FIX] 모델 교체 시 stale _snapshot 방지
    // release() → 새 모델 load() → init() 순서에서 이전 모델의 baseEnd/chapterEnd가
    // _snapshot에 남아 n_keep 과대 설정 가능. init() 호출 시 항상 초기화.
    this._snapshot = { baseEnd: 0, chapterEnd: 0, savedAt: 0, chapterIdx: -1 };
    this._cachedSnapshot = null;
  }

  release(): void {
    this._ctx = null;
    this.reset();
  }

  // ── 핵심: 레이어별 토큰 수 측정 ────────────────────────────────

  /**
   * Base 레이어 prefill 완료 후 호출.
   * systemPrompt 텍스트를 tokenize → baseEnd 확정.
   *
   * @returns 실제 측정된 base 토큰 수 (n_keep 값으로 사용)
   */
  async measureBase(systemPromptText: string): Promise<number> {
    const count = await this._tokenCount(systemPromptText);
    this._snapshot.baseEnd = count;
    this._cachedSnapshot = null; // 인밸리데이터
    trace('offset:measure_base:ok', { baseEnd: count });
    logger.log(`[KVOffsetTracker] Base 레이어: 0 ~ ${count}토큰 (n_keep=${count})`);
    return count;
  }

  /**
   * Chapter 레이어 prefill 완료 후 호출.
   * chapterPrefixText 토큰 수를 측정 → chapterEnd = baseEnd + chapter 토큰 수.
   *
   * @returns 실제 측정된 chapter prefix 토큰 수
   */
  applyMeasuredBaseEnd(totalPrefixTokens: number): number {
    const normalizedTotal = Math.max(totalPrefixTokens, 0);
    this._snapshot.baseEnd = normalizedTotal;
    if (this._snapshot.chapterEnd > 0 && this._snapshot.chapterEnd < normalizedTotal) {
      this._snapshot.chapterEnd = normalizedTotal;
    }
    this._snapshot.savedAt = Date.now();
    this._cachedSnapshot = null;
    trace('offset:apply_measured_base:ok', {
      baseEnd: this._snapshot.baseEnd,
      chapterEnd: this._snapshot.chapterEnd,
    });
    logger.log(
      `[KVOffsetTracker] Base layer actual prefix end=${this._snapshot.baseEnd} ` +
      `(chapter=${this._snapshot.chapterEnd})`,
    );
    return this._snapshot.baseEnd;
  }

  async measureChapter(
    chapterPrefixText: string,
    chapterIdx: number,
  ): Promise<number> {
    if (this._snapshot.baseEnd === 0) {
      logger.warn('[KVOffsetTracker] measureChapter called before measureBase (baseEnd=0)');
    }
    const chapterTokens = await this._tokenCount(chapterPrefixText);
    this._snapshot.chapterEnd  = this._snapshot.baseEnd + chapterTokens;
    this._snapshot.chapterIdx  = chapterIdx;
    this._snapshot.savedAt     = Date.now();
    this._cachedSnapshot       = null;
    trace('offset:measure_chapter:ok', {
      chapterIdx,
      baseEnd: this._snapshot.baseEnd,
      chapterEnd: this._snapshot.chapterEnd });
    logger.log(
      `[KVOffsetTracker] Chapter ${chapterIdx}: ` +
      `${this._snapshot.baseEnd} ~ ${this._snapshot.chapterEnd}토큰 ` +
      `(${chapterTokens}토큰 추가)`,
    );
    return chapterTokens;
  }

  /**
   * 실제 completion-style prefill 결과로 얻은 총 prefix 토큰 수를 chapterEnd에 직접 반영한다.
   */
  applyMeasuredChapterEnd(totalPrefixTokens: number, chapterIdx: number): number {
    const normalizedTotal = Math.max(totalPrefixTokens, this._snapshot.baseEnd, 0);
    this._snapshot.chapterEnd = normalizedTotal;
    this._snapshot.chapterIdx = chapterIdx;
    this._snapshot.savedAt = Date.now();
    this._cachedSnapshot = null;
    trace('offset:apply_measured_chapter:ok', {
      chapterIdx,
      baseEnd: this._snapshot.baseEnd,
      chapterEnd: this._snapshot.chapterEnd,
    });
    logger.log(
      `[KVOffsetTracker] Chapter ${chapterIdx}: actual prefix end=${this._snapshot.chapterEnd} ` +
      `(base=${this._snapshot.baseEnd})`,
    );
    return this._snapshot.chapterEnd;
  }

  // ── 오프셋 → completion params 변환 ────────────────────────────

  /**
   * 현재 오프셋으로 completion params 생성.
   *
   * n_keep   = baseEnd  → 롤링윈도우(ctx_shift)가 Base를 절대 버리지 않음
   * n_cache_reuse = Math.min(baseEnd, 256)
   *            → 최소 base가 공통 prefix여야 KV 재사용 (KV miss 방지)
   *
   * 이 값들을 모든 completion 호출에 spread해야 오프셋이 동작함.
   */
  getCompletionOffsets(): {
    n_keep:        number;
    n_cache_reuse: number;
  } {
    const baseEnd = this._snapshot.baseEnd;
    // [BUG-2 FIX] chapterEnd=0(챕터 미초기화) 시 baseEnd를 기준으로 사용하되,
    // baseEnd도 0(measureBase 미완료)이면 MIN_N_KEEP(512) 최솟값으로 보호.
    const effectiveBase = Math.max(baseEnd, MIN_N_KEEP);

    // [BUG FIX] chapter 레이어 전체 재사용을 위해 n_keep은 chapterEnd를 포함하도록 확장.
    const nKeep = this._snapshot.chapterEnd > 0 
      ? Math.max(effectiveBase, this._snapshot.chapterEnd)
      : effectiveBase;

    // [BUG-ITEM3 FIX] n_cache_reuse는 baseEnd 기준으로 리셋해야 대화 중 KV 재사용 활성가능
    // [KV REUSE FIX] KV 캐시 로드 후에는 chapterEnd 또는 baseEnd를 재사용
    // chapterEnd > 0이면 chapter까지 로드된 상태 → chapterEnd 사용
    // 그렇지 않으면 baseEnd 사용 (최소 256)
    const nCacheReuse = this._snapshot.chapterEnd > 0
      ? Math.max(this._snapshot.chapterEnd, DEFAULT_N_CACHE_REUSE)
      : Math.max(baseEnd, DEFAULT_N_CACHE_REUSE);

    // [DEBUG] 디버깅용 로그 추가
    console.log('[KVOffsetTracker] 🔍 getCompletionOffsets 호출:', {
      baseEnd,
      chapterEnd: this._snapshot.chapterEnd,
      effectiveBase,
      nKeep,
      nCacheReuse,
      DEFAULT_N_CACHE_REUSE,
    });

    return {
      n_keep:         nKeep,
      n_cache_reuse:  nCacheReuse };
  }

  /**
   * Base만 잠긴 상태 (챕터 미진입)의 completion params.
   * initChapter 전에 임시로 사용.
   */
  getBaseOnlyOffsets(nCtx: number): {
    n_keep:        number;
    n_cache_reuse: number;
  } {
    const baseEnd = this._snapshot.baseEnd;
    const nKeep = Math.min(Math.max(baseEnd, MIN_N_KEEP), nCtx);
    const nCacheReuse = Math.min(Math.max(baseEnd, DEFAULT_N_CACHE_REUSE), nKeep - 1);

    return {
      n_keep:        nKeep,
      n_cache_reuse: nCacheReuse };
  }

  // ── 현재 오프셋 조회 ────────────────────────────────────────────

  getSnapshot(): Readonly<KVOffsetSnapshot> {
    if (!this._cachedSnapshot) {
      this._cachedSnapshot = { ...this._snapshot };
    }
    return this._cachedSnapshot;
  }

  get baseEnd():    number { return this._snapshot.baseEnd; }
  get chapterEnd(): number { return this._snapshot.chapterEnd; }
  get chapterIdx(): number { return this._snapshot.chapterIdx; }

  /**
   * 현재 전체 context 사용량 추정 (Turn 레이어 포함).
   * dialogueHistory 텍스트를 tokenize해서 정확한 사용량을 얻거나,
   * 빠른 추정치가 필요하면 approxTurnTokens를 직접 전달.
   */
  estimateTotalUsage(approxTurnTokens: number): number {
    return this._snapshot.chapterEnd + approxTurnTokens;
  }

  /**
   * 남은 KV 슬롯 수 (Turn 레이어에 쓸 수 있는 토큰 수).
   * context window 크기를 전달하면 정확히 계산됨.
   */
  remainingSlots(nCtx: number, approxTurnTokens: number): number {
    return nCtx - this.estimateTotalUsage(approxTurnTokens);
  }

  // ── 오프셋 영속화 ────────────────────────────────────────────────

  /**
   * 현재 오프셋 스냅샷을 파일로 저장.
   * kvStateManager.saveChapter() 직후 호출해야 두 파일이 동기화됨.
   */
  async saveOffsets(storyId: string): Promise<void> {
    // [BUG FIX #7] chapterIdx=-1(measureChapter 미호출 상태)로 저장하면
    // 복원 시 expectedChapterIdx 불일치 → 항상 재측정 유발 (성능 낭비).
    // baseEnd=0이면 아직 measureBase도 안 된 상태이므로 저장 불필요.
    if (this._snapshot.baseEnd <= 0) {
      logger.log('[KVOffsetTracker] saveOffsets 스킵 — baseEnd=0 (측정 미완료)');
      return;
    }
    // [BUG-11 FIX] chapterIdx=-1인 상태로 저장하면 복원 시 항상 재측정 발생.
    // measureChapter가 완료되지 않은 상태에서는 저장을 스킵해 불필요한 재측정 방지.
    if (this._snapshot.chapterIdx < 0) {
      logger.log('[KVOffsetTracker] saveOffsets 스킵 — chapterIdx=-1 (챕터 측정 미완료)');
      return;
    }
    try {
      await RNFS.mkdir(OFFSET_DIR).catch(() => {});
      const path = this._offsetPath(storyId);
      await RNFS.writeFile(path, JSON.stringify(this._snapshot), 'utf8');
      logger.log(`[KVOffsetTracker] 오프셋 저장: base=${this._snapshot.baseEnd} chapter=${this._snapshot.chapterEnd}`);
    } catch (e) {
      logger.warn('[KVOffsetTracker] 오프셋 저장 실패 (무시):', e);
    }
  }

  /**
   * 저장된 오프셋 복원.
   * kvStateManager.loadChapter() 또는 restoreSession() 직후 호출.
   *
   * @returns true = 복원 성공, false = 파일 없음/손상
   */
  async loadOffsets(storyId: string, expectedChapterIdx?: number): Promise<boolean> {
    try {
      const path = this._offsetPath(storyId);
      if (!(await RNFS.exists(path))) {
        trace('offset:load:not_found', { storyId });
        return false;
      }

      const raw  = await RNFS.readFile(path, 'utf8');
      const snap = JSON.parse(raw) as KVOffsetSnapshot;

      if (expectedChapterIdx !== undefined && snap.chapterIdx !== expectedChapterIdx) {
        trace('offset:load:chapter_mismatch', { storyId, saved: snap.chapterIdx, expected: expectedChapterIdx });
        logger.log(`[KVOffsetTracker] 챕터 불일치 (저장=${snap.chapterIdx}, 요청=${expectedChapterIdx}) — 재측정 필요`);
        return false;
      }

      if (
        typeof snap.baseEnd    !== 'number' || snap.baseEnd    <= 0 ||
        typeof snap.chapterEnd !== 'number' || snap.chapterEnd <  0 ||
        typeof snap.chapterIdx !== 'number' || snap.chapterIdx < -1 ||
        // [BUG-12 FIX] savedAt 검증 완화 — 0이거나 너무 먼 미래(24시간+) 시각이면 손상으로 간주
        typeof snap.savedAt    !== 'number' || snap.savedAt <= 0 || snap.savedAt > Date.now() + 24 * 60 * 60 * 1000
      ) {
        trace('offset:load:invalid_fields', { storyId, baseEnd: snap.baseEnd, chapterEnd: snap.chapterEnd });
        logger.warn(`[KVOffsetTracker] 스냅샷 필드 이상 (base=${snap.baseEnd}, chapter=${snap.chapterEnd}) — 재측정 필요`);
        return false;
      }

      if (snap.chapterEnd > 0 && snap.chapterEnd < snap.baseEnd) {
        trace('offset:load:chapter_lt_base', { storyId, baseEnd: snap.baseEnd, chapterEnd: snap.chapterEnd });
        logger.warn(
          `[KVOffsetTracker] chapterEnd(${snap.chapterEnd}) < baseEnd(${snap.baseEnd}) — 구조 불일치, 재측정 필요`,
        );
        return false;
      }

      this._snapshot = snap;
      this._cachedSnapshot = null;
      trace('offset:load:ok', { storyId, baseEnd: snap.baseEnd, chapterEnd: snap.chapterEnd, chapterIdx: snap.chapterIdx });
      logger.log(
        `[KVOffsetTracker] 오프셋 복원: base=${snap.baseEnd} ` +
        `chapter=${snap.chapterEnd} (챕터 ${snap.chapterIdx})`,
      );
      return true;
    } catch (e) {
      trace('offset:load:FAIL', { storyId, err: String(e) });
      logger.warn('[KVOffsetTracker] 오프셋 복원 실패:', e);
      return false;
    }
  }

  async deleteOffsets(storyId: string): Promise<void> {
    await RNFS.unlink(this._offsetPath(storyId)).catch(() => {});
  }

  // ── 내부 ────────────────────────────────────────────────────────

  /**
   * 텍스트 토큰 수 측정.
   * llama.rn 0.8.x: context.tokenize(text, addBos=false) → { tokens: number[] }
   *
   * tokenize 미지원 시 fallback: 한글 0.7 토큰/자, 영어 1.3 토큰/단어 추정.
   * 실제 llama.cpp 토크나이저(SentencePiece/BPE)보다 ±15% 오차 있으나
   * n_keep / n_cache_reuse 계산 목적으로는 충분히 정확함.
   */
  private async _tokenCount(text: string): Promise<number> {
    if (!this._ctx) return this._estimateTokens(text);

    try {
      // llama.rn tokenize API (BOS 토큰 미포함으로 호출)
      const result = await this._ctx.tokenize(text, false);
      // ✅ [FIX #13] result parsing safety
      // llama.rn 버전에 따라 number[] 또는 { tokens: number[] } 반환 가능
      const tokens: number[] = Array.isArray(result) ? result : (result?.tokens ?? []);
      
      if (!Array.isArray(tokens) || tokens.length === 0) {
        return this._estimateTokens(text);
      }
      return tokens.length;
    } catch {
      return this._estimateTokens(text);
    }
  }

  /**
   * 토큰 수 빠른 추정 (tokenize 실패 시 fallback).
   * 한글: 0.7 토큰/자, 영어: 1.3 토큰/단어, 기타: 1 토큰/단어.
   * PromptBuilder.estimateTokens()와 동일 공식.
   */
  private _estimateTokens(text: string): number {
    // [BUG-20 FIX] CJK(한/중/일) 전체 범위를 korean 가중치(0.7)로 처리하도록 확장
    // 한글: 가-힣(AC00-D7AF), 자모(3130-318F)
    // 한자: Unified Ideographs(4E00-9FFF)
    // 일본어: 히라가나(3040-309F), 가타카나(30A0-30FF)
    const cjk     = (text.match(/[\uAC00-\uD7AF\u3130-\u318F\u4E00-\u9FFF\u3040-\u30FF]/g)?.length) ?? 0;
    const english = (text.match(/[a-zA-Z]+/g)?.length)         ?? 0;
    const numbers = (text.match(/\d/g)?.length)                ?? 0;
    const spaces  = (text.match(/[\s]+/g)?.length)             ?? 0;
    // [BUG-20 FIX] 이모지는 개당 약 2-4토큰을 차지하므로 가중치 상향 (2.5)
    // [FIX] u 플래그와 \p{Emoji_Presentation} 속성 사용하여 정확한 이모지 판정
    const emojis  = (text.match(/\p{Emoji_Presentation}/gu)?.length) ?? 0;
    
    // [BUG FIX] special에서 직접 제외해 계산 왜곡 방지
    // [BUG-18 FIX] emojis에 u 플래그가 있고 other에 없으면 이모지가 중복 카운트되는 문제 수정.
    // other 패턴에도 u 플래그를 추가하고, 이미 emojis에서 카운팅된 \p{Emoji_Presentation}도 제외 범위에 추가.
    const otherChars = text.match(/[^a-zA-Z0-9\s\uAC00-\uD7AF\u3130-\u318F\u4E00-\u9FFF\u3040-\u30FF\uD800-\uDFFF\p{Emoji_Presentation}]/gu);
    const other = otherChars?.length ?? 0;

    return Math.ceil(cjk * 0.7 + english * 1.3 + numbers * 0.5 + spaces * 0.25 + emojis * 2.5 + other * 0.3);
  }

  /**
   * context shift 발생 시 버릴 토큰 수 추천값.
   *
   * 전략: Chapter 레이어 끝 이후(Turn 레이어 앞부분)를 우선 버림.
   * llama.cpp ctx_shift + n_discard=0(auto)이면 자동 처리되지만,
   * 명시적으로 계산해두면 로그/모니터링에 활용 가능.
   *
   * @param nCtx         현재 context 크기
   * @param approxUsed   현재 사용 토큰 수 추정
   * @returns            권장 n_discard 값 (0 = auto에 위임)
   */
  recommendNDiscard(nCtx: number, approxUsed: number): number {
    const overflow = approxUsed - nCtx;
    if (overflow <= 0) return 0;  // 아직 꽉 차지 않음 → auto

    // Turn 레이어의 앞 절반을 버리는 전략
    const turnLayerSize = Math.max(0, this._snapshot.chapterEnd > 0
      ? approxUsed - this._snapshot.chapterEnd
      : approxUsed - this._snapshot.baseEnd);
    return Math.ceil(Math.max(overflow, turnLayerSize * 0.5));
  }

  private _offsetPath(storyId: string): string {
    return `${OFFSET_DIR}/${storyId}_offset.json`;
  }
}

let _kvOffsetInstance: KVOffsetTracker | null = null;
export function getKvOffsetInstance(): KVOffsetTracker {
  if (!_kvOffsetInstance) _kvOffsetInstance = new KVOffsetTracker();
  return _kvOffsetInstance;
}
export const kvOffsetTracker = new Proxy({} as KVOffsetTracker, {
  get(_t, p) {
    const instance = getKvOffsetInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[p];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(_t, p, v) {
    (getKvOffsetInstance() as unknown as Record<string | symbol, unknown>)[p] = v;
    return true;
  } });
export default kvOffsetTracker;
