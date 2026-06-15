/* eslint-disable @typescript-eslint/no-unused-vars */
// src/core/llama/LlamaEngine.ts
// ════════════════════════════════════════════════════════════════════════════════
//
// llama.rn 래퍼 — v9 llama.rn 0.11.x (llama.cpp b8095) 기준
//
//  ⚠️  경고: 이 파일의 KV 관련 설정은 함부로 수정하면 안 됩니다! ⚠️
//
//  버전 고정 이유 (중요 — 절대 ^범위 사용 금지):
//   llama.rn 버전과 GitHub Actions LLAMA_CPP_HASH 는 반드시 동일한
//   llama.cpp 빌드를 가리켜야 KV 캐시 바이너리 포맷이 호환됩니다.
//   LLAMA_CPP_HASH secret → b8095
//
// [KV SPEC 변경 v8 — Android OpenCL 환경 대응]:
//   ⛔ 절대 변경 금지 (OpenCL 호환성 필수):
//   1. flash_attn: false (llama.rn 공식: OpenCL에서 session 로드 시 OFF 필수)
//      참고: https://github.com/mybigday/llama.rn#opencl-gpu-acceleration
//      "State load/save are not fully supported on Android with OpenCL backend,
//       but you can set kv_unified: true and flash_attn_type: 'off' to enable it."
//   2. type_k: q8_0 (전 백엔드 통일)
//   3. type_v: f16 (서버 base.bin 생성 설정과 일치)
//   4. kv_unified: true (OpenCL session load/save 필수)
//   5. flash_attn_type: 'off' (OpenCL session load/save 필수)
//   6. n_ctx: 모델별 상이 — n_batch=2048 / n_ubatch=2048 공통 고정
//   7. spec_type: ngram-cache → ngram-map-k (b8095 기준)
//
// 업그레이드 절차 (KV 포맷 변경 시):
//   1. llama.rn 새 버전 CHANGELOG에서 번들 llama.cpp 해시 확인
//   2. package.json 버전 고정값 변경
//   3. LLAMA_CPP_HASH secret 동일 해시로 변경
//   4. KV_VERSION 올리기 (kv-spec-constants.ts)
//
// v8 변경사항 (llama.rn 0.11.0-rc.0 / llama.cpp b7779 기준):
//   ✅ [NEW] spec_type 'ngram-cache' + speculative.* 파라미터 3종 추가
//   ✅ [NEW] reasoning_in_content / thinking_forced_open 추가 (false 고정)
//   ✅ [FIX] DEFAULT_SAMPLERS_RP에서 top_n_sigma 제거
//
// v7 추가사항:
//   ✅ [NEW] DRY 샘플링 파라미터 (dry_multiplier=0.8, dry_base=1.75, dry_allowed_length=2)
//   ✅ [NEW] XTC 샘플러 (xtc_probability=0.1, xtc_threshold=0.1)
//   ✅ [NEW] top_n_sigma, dynatemp, samplers 배열, presence_penalty, min_keep
//   ✅ [NEW] reasoning_format, n_discard, timings_per_token
//
// v6 유지사항:
//   ✅ id_slot + slot_id 병기 (최신/구버전 llama.rn 호환)
//   ✅ n_cache_reuse = 256, PrefixKVManager / ctx-checkpoints 패턴
//   ✅ generateForCharacter() / resetCharacterSuffix()
//
// v5 유지사항:
//   ✅ use_mlock: RAM 8GB+ 기기만 활성화
//   ✅ RAM 티어별 동적 타임아웃 / n_parallel 슬롯
//
// DEPRECATED (llama.rn 0.11.0-rc.0 / b7779 이후):
//    --defrag-thold 는 DEPRECATED
//    penalty_repeat/penalty_last_n → repeat_penalty/repeat_last_n으로 교체
//       (구 API 호환성 유지 목적으로 둘 다 전달, 최신 필드 우선)
// ════════════════════════════════════════════════════════════════════════════════

import type { LlamaContextExtended as LlamaContextExtendedBase } from '../../types/llama.types';

import { MODELS } from '../../models/ModelConfig';
import { modelDownloader } from './ModelDownloader';
import deviceProfiler, { type BackendType, type LlamaTuningParams } from './DeviceProfiler';
import { engineBus } from './EngineEventBus';
import type { EngineState } from './EngineTypes';
import { logger } from '../../utils/logger';
import prefixKVManager from './PrefixKVManager';
import { WarmupManager } from './WarmupManager';
import { parseToolCalls, RPTool, RPToolCall } from './ToolCallHandler';
import type { StoryLoraAdapterSelection } from './StoryAdapterManager';
// KV 파라미터 고정값 — kv-spec.txt 와 일치해야 base.bin 재사용 가능
import { KV_FLASH_ATTN, KV_CACHE_TYPE_K, KV_CACHE_TYPE_V, MODEL_KV_SPECS } from './kv-spec-constants';
import kvOffsetTracker from './KVOffsetTracker';
import { extractTokenIdsFromTokenizeResult, normalizeLogitBiasEntries } from './LogitBiasNormalizer';

let initLlama:          typeof import('llama.rn').initLlama;
let loadLlamaModelInfo: typeof import('llama.rn').loadLlamaModelInfo;
let _llamaRnLoaded = false;

function _ensureLlamaRn(): void {
  if (_llamaRnLoaded) return;
  _llamaRnLoaded = true;
  try {
    ({ initLlama, loadLlamaModelInfo } = require('llama.rn'));
  } catch {
    logger.error('[LlamaEngine] llama.rn not installed');
  }
}

// ── llama.rn 타입 확장 ───────────────────────────────────────────────────────
// llama.rn 공식 타입에 없는 신규 API를 정식 타입 없이 사용해야 하는 경우
// ✅ [v7] completion params 공식 타입에 llama.cpp b7779 이후 API 추가
export interface LlamaCompletionParams {
  messages:        Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  n_predict?:      number;
  temperature?:    number;
  top_p?:          number;
  top_k?:          number;
  min_p?:          number;
  min_keep?:       number;
  cache_prompt?:   boolean;

  /** ── KV 슬롯 제어 ── */
  /** 최신 llama.cpp 공식 슬롯 지정 파라미터 */
  id_slot?:        number;
  /** llama.rn 이전 호환 파라미터 */
  slot_id?:        number;
  /**
   * KV 재사용 최소 토큰 수.
   * 기본값 256 — 너무 짧은 prefix 재사용으로 인한 오차 방지.
   */
  n_cache_reuse?:  number;
  n_keep?:         number;
  n_discard?:      number;

  /** ── 반복 억제 ── */
  repeat_penalty?:    number;
  repeat_last_n?:     number;
  penalty_repeat?:    number;
  penalty_last_n?:    number;
  presence_penalty?:  number;
  frequency_penalty?: number;

  /** ── DRY 샘플러 ✅ [v7] ── */
  dry_multiplier?:        number;
  dry_base?:              number;
  dry_allowed_length?:    number;
  dry_penalty_last_n?:    number;
  dry_sequence_breakers?: string[];

  /** ── XTC 샘플러 ✅ [v7] ── */
  xtc_probability?: number;
  xtc_threshold?:   number;
  typical_p?:       number;

  /** ── Top-N-Sigma ✅ [v7] ── */
  top_n_sigma?: number;

  /** ── Dynamic Temperature ✅ [v7] ── */
  dynatemp_range?:    number;
  dynatemp_exponent?: number;

  /** ── 샘플러 순서 ✅ [v7] ── */
  samplers?:   string[];
  logit_bias?: Array<[number, number | false]>;
  seed?:       number;

  /** ── 문법 제약 ── */
  grammar?:      string;
  grammar_lazy?: boolean;
  stop?:         string[];

  /**
   * spec_type: draftless speculative decoding 모드
   * 'ngram-map-k' — 해시맵 기반 m-gram draft (RP 최적값)
   */
  spec_type?: string;

  /** ── Speculative Decoding ✅ [v8] ── */
  'speculative.n_max'?: number;
  'speculative.n_min'?: number;
  'speculative.p_min'?: number;

  /** reasoning_format: ✅ [v7] ("none"|"chain"|"deepseek"|"auto") */
  reasoning_format?: string;
  /** reasoning_in_content: ✅ [v8] RP ?? false 고정 */
  reasoning_in_content?: boolean;
  /** thinking_forced_open: ✅ [v8] RP ?? false 고정 */
  thinking_forced_open?: boolean;
  /** timings_per_token: ✅ [v7] 토큰별 속도 정보 */
  timings_per_token?: boolean;
  tools?:             unknown;
  tool_choice?:       string;
  [key: string]:      unknown;
}

// ── RP 최적 DRY 파라미터 기본값 ──────────────────────────────────────────────
export const DEFAULT_DRY_PARAMS = {
  dry_multiplier:       1.0,   // [FIX] 0.8 → 1.0: 중복 표현 패널티 강화
  dry_base:             1.75,
  dry_allowed_length:   2,
  dry_penalty_last_n:   -1,
  dry_sequence_breakers: ['\n', ':', '"', '*'] } as const;

// RP_DRY_PARAMS 는 DEFAULT_DRY_PARAMS 의 alias
const RP_DRY_PARAMS = DEFAULT_DRY_PARAMS;

// [BUG FIX] 파일 어디에도 정의 없이 3곳에서 사용 → 컴파일 오류
/** 병렬 KV 슬롯 기본값 (DeviceProfiler 측정 실패 시 fallback) */
const DEFAULT_N_PARALLEL_SLOTS = 1;

// [BUG FIX] 마찬가지로 정의 없이 사용 → 컴파일 오류
const GRAMMAR_ERROR_PATTERNS = [
  'grammar',
  'parse error',
  'invalid grammar',
  'grammar failed',
] as const;

// ── llama.cpp 샘플러 순서 (b7779 기준) ──────────────────────────────────────
export const DEFAULT_SAMPLERS_RP = [
  'penalties', 'dry', 'top_k',
  'typ_p', 'top_p', 'min_p', 'xtc', 'temperature',
] as const;

export const DEFAULT_SAMPLERS_TOOL = [
  'penalties', 'top_k', 'top_p', 'min_p', 'temperature',
] as const;

// Temporary kill switch for crash isolation on device.
// Grammar is currently re-enabled so we can isolate it from runtime logit bias.
const ENABLE_RP_GRAMMAR_EXPERIMENT = true;

// LlamaContextExtended는 src/types/llama.types.ts로 이동 — WarmupManager 순환 import 방지
type LlamaContextExtended = LlamaContextExtendedBase;
export type { LlamaContextExtended };

// ── 타입 정의 ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LogitBiasToken = number | string;
export type LogitBiasEntry = [LogitBiasToken, number | false];
export type GenerationFinishReason = 'stop' | 'length' | 'cancelled' | 'context_full' | 'unknown';

export interface CompletionMetadata {
  finishReason: GenerationFinishReason;
  tokensPerSecond: number | null;
  tokensPredicted: number;
  tokensEvaluated: number;
  tokensCached: number;
  contextFull: boolean;
  interrupted: boolean;
  truncated: boolean;
  stopWord?: string;
}

interface CompletionResult {
  text?: string;
  timings?: {
    predicted_per_second?: number;
    prompt_n?: number;
    predicted_n?: number;
  };
  truncated?: boolean;
  stopped_eos?: boolean;
  stopped_word?: boolean | string;
  stopped_limit?: boolean;
  stopping_word?: string;
  context_full?: boolean;
  interrupted?: boolean;
  tokens_cached?: number;
  tokens_predicted?: number;
  tokens_evaluated?: number;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  typicalP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
  repeatLastN?: number;
  dryMultiplier?: number;
  dryBase?: number;
  dryAllowedLength?: number;
  dryPenaltyLastN?: number;
  xtcProbability?: number;
  xtcThreshold?: number;
  topNSigma?: number;
  seed?: number;
  stopSequences?: string[];
  suppressDefaultStopSequences?: boolean;
  logitBias?: LogitBiasEntry[];
  banTokens?: LogitBiasToken[];
  responseFormat?: 'text' | 'json_object';
  useRpGrammar?: boolean;
  disableSpeculativeDecoding?: boolean;
  onToken?: (token: string) => void;
  /**
   * 캐릭터 ID — 지정하면 해당 캐릭터 전용 KV 슬롯에서 생성.
   * PrefixKVManager.getSlotForCharacter(charId)로 슬롯 결정.
   * 지정하지 않으면 slot 0 (기본값, 단일 캐릭터).
   */
  charId?: number;
  /**
   * suffix 삭제 후 생성 — "분기 재시도" / "다른 결말" 시나리오용.
   * true면 생성 전 resetCharacterSuffix(charId) 호출.
   */
  resetSuffix?: boolean;
  /**
   * grammar fallback 진입 직전에 호출되는 콜백.
   * The caller should clear any buffered streamed tokens at this point so
   * 첫 번째 시도에서 이미 출력된 토큰이 두 번째 스트림과 중복되는 것을 방지해야 함.
   * [BUG FIX #1] grammar fallback 이중 스트리밍 방지
   */
  onStreamReset?: () => void;
  /** 호출자 storyId — 로깅/요약 연동용 (선택) */
  storyId?: string;
  /** softReset 후 re-prefill에 사용할 최근 메시지 목록 (선택) */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** grammar fallback 무한 재귀/재시도 방지 플래그 */
  _grammarFallbackAttempted?: boolean;
}

interface LoadedModelInfo {
  n_params?: number;
  n_ctx_train?: number;
  vocab_size?: number;
}

export function resolveCompletionGrammar(
  options: Pick<GenerateOptions, 'responseFormat' | 'useRpGrammar'>,
  rpGrammar: string,
): string | undefined {
  if (options.responseFormat === 'json_object') return undefined;
  if (!ENABLE_RP_GRAMMAR_EXPERIMENT) return undefined;
  return options.useRpGrammar ? rpGrammar : undefined;
}

export interface BackendInfo {
  engine:     'llama';
  backend:    BackendType;
  nGpuLayers: number;
  useHTP:     boolean;
  tokPerSec:  number | null;
  modelId:    string;
  devices?:   string[];
}

// EngineState moved to EngineTypes.ts — re-exported here for backward compatibility
export type { EngineState } from './EngineTypes';
class LlamaEngine {
  // ── 필드 ─────────────────────────────────────────────────────────────────
  private context:            LlamaContextExtended | null = null;
  private loadedModelId:      string | null = null;
  private backendInfo:        BackendInfo | null = null;
  private state:              EngineState = 'idle';
  // ✅ [FIX] Array → Set: includes() O(n) → has() O(1), 중복 등록 자동 dedup
  private stateListeners =    new Set<(s: EngineState) => void>();
  private static readonly MAX_LISTENERS = 10;
  private readonly warmupMgr = new WarmupManager();
  // ✅ [FIX] load() 완료 후 실제 nCtx 캐싱 → getNCtx() 공식 getter
  private _loadedNCtx:        number = 0;
  // ✅ [FIX #1] 현재 사용 토큰 수 캐싱 → getUsedTokens() getter로 공식화
  private _usedTokens:        number = 0;
  // 현재 생성 요청 ID — stopGeneration() 중단 처리를 위한 카운터
  private generationId:       number = 0;
  // ✅ [FIX] grammar fallback 타임아웃 계산을 위한 시작 시간 기록
  private _generationStartTime: number = 0;
  private lastCompletionMeta: CompletionMetadata | null = null;
  private storyLoraAdapterSelection: StoryLoraAdapterSelection | null = null;
  private lastLoggedStoryAdapterId: string | null = null;
  // ✅ [FIX #7] 동시 생성 요청 큐잉 — Promise 체이닝으로 직렬화 처리
  private _lastGeneration:    Promise<unknown> = Promise.resolve();
  private _queueDepth =       0;
  private static readonly MAX_QUEUE_DEPTH = 5;
  // ✅ [FIX] load() 중복 호출 dedup — 동시에 load()가 2회 이상 호출되면
  // 두 번째부터는 진행 중인 Promise를 재사용하여 이중 initLlama 방지
  private _loadingPromise:    Promise<BackendInfo> | null = null;
  // [BUG FIX] _loadingPromise가 어떤 modelId에 대한 것인지 추적
  // 이전: 다른 modelId로 load() 호출 시에도 진행 중 Promise를 재사용 → 잘못된 모델 BackendInfo 반환
  // 수정: _loadingModelId를 함께 관리해 동일 modelId일 때만 Promise 재사용
  private _loadingModelId:    string | null = null;
  // ✅ [v7] nParallelSlots: RAM 티어별 결정 (low:1 / mid:2 / high:4)
  private nParallelSlots =    DEFAULT_N_PARALLEL_SLOTS;
  private readonly _queueWatchdogs = new Set<ReturnType<typeof setTimeout>>();
  private readonly _logitBiasTokenCache = new Map<string, number[]>();
  private _didWarnMissingLogitBiasTokenizer = false;

  // ✅ [FIX] RP_GRAMMAR을 클래스 속성 readonly로 선언 — 매 생성마다 새 String.raw`` 생성 방지
  private readonly RP_GRAMMAR = String.raw`
root         ::= preface* char-line follow-line+ story-log ws
preface      ::= narrator-line
follow-line  ::= narrator-line | char-line
narrator-line::= "0: " line-content nl
char-line    ::= char-id ": " line-content nl
char-id      ::= [2-9] | [1-9][0-9]
line-content ::= (action-seg | thought-seg | text-seg)+
text-seg     ::= text-char+
text-char    ::= [^\n#*]
action-seg   ::= "#" [^#\n]+ "#"
thought-seg  ::= "*" [^*\n]+ "*"
story-log    ::= location-log state-log+ event-log nl
location-log ::= "[L: " slog-text "] "
state-log    ::= "[" char-id ": " slog-text "] "
event-log    ::= "[Ev: " slog-text "]"
slog-text    ::= slog-char+
slog-char    ::= [^\]\n]
nl           ::= "\n"
ws           ::= [ \n\t]*
`.trim();

  // ── Getter ────────────────────────────────────────────────────────────────
  getState():              EngineState          { return this.state; }
  getLoadedModelId():      string | null        { return this.loadedModelId; }
  getBackendInfo():        BackendInfo | null    { return this.backendInfo; }
  // ✅ [FIX #1] getNCtx/getUsedTokens 공식 getter — 외부에서 직접 필드 접근 불필요
  getNCtx():               number               { return this._loadedNCtx; }
  getUsedTokens():         number               { return this._usedTokens; }
  // ✅ [FIX] setUsedTokens — KV 로드 후 외부에서 토큰 수 업데이트 (chapter 로드 시 필요)
  setUsedTokens(tokens: number): void          { this._usedTokens = tokens; }
  getNativeContext():      LlamaContextExtended | null { return this.context; }
  getWarmupSystemPrompt(): string               { return this.warmupMgr.getSystemPrompt(); }
  getLastCompletionMeta(): CompletionMetadata | null { return this.lastCompletionMeta; }
  getStoryLoraAdapterSelection(): StoryLoraAdapterSelection | null {
    return this.storyLoraAdapterSelection ? { ...this.storyLoraAdapterSelection } : null;
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────

  private _mergeLogitBias(
    logitBias?: LogitBiasEntry[],
    banTokens?: LogitBiasToken[],
  ): Array<[LogitBiasToken, number | false]> | undefined {
    const merged: Array<[LogitBiasToken, number | false]> = [...(logitBias ?? [])];
    for (const token of banTokens ?? []) merged.push([token, false]);
    return merged.length > 0 ? merged : undefined;
  }

  private async _tokenizeLogitBiasString(token: string): Promise<number[]> {
    const cachedTokenIds = this._logitBiasTokenCache.get(token);
    if (cachedTokenIds) return cachedTokenIds;

    const tokenize = (this.context as { tokenize?: (text: string, addBos?: boolean) => Promise<unknown> } | null)
      ?.tokenize;

    if (typeof tokenize !== 'function') {
      if (!this._didWarnMissingLogitBiasTokenizer) {
        logger.warn('[LlamaEngine] logit_bias tokenizer unavailable; string bias entries will be skipped');
        this._didWarnMissingLogitBiasTokenizer = true;
      }
      return [];
    }

    try {
      const tokenIds = extractTokenIdsFromTokenizeResult(
        await tokenize.call(this.context, token, false),
      );
      this._logitBiasTokenCache.set(token, tokenIds);
      return tokenIds;
    } catch (error) {
      logger.warn(`[LlamaEngine] logit_bias tokenize failed for ${JSON.stringify(token)}:`, error);
      return [];
    }
  }

  private async _buildNormalizedLogitBias(
    options: Pick<GenerateOptions, 'logitBias' | 'banTokens'>,
  ): Promise<Array<[number, number | false]> | undefined> {
    const mergedLogitBias = this._mergeLogitBias(options.logitBias, options.banTokens);
    return normalizeLogitBiasEntries(
      mergedLogitBias,
      (token: string) => this._tokenizeLogitBiasString(token),
    );
  }

  private _mergeStopSequences(
    extraStops?: string[],
    isToolCall = false,
    suppressDefaults = false,
  ): string[] {
    const rpGuards = ['\n1:', '\n1 :'];
    const base = suppressDefaults
      ? []
      : (isToolCall
          ? ['<end_of_turn>', '<eos>', '<|im_end|>', '</tool_call>', '[CHOICE_POINT]']
          : ['<end_of_turn>', '<eos>', '<|im_end|>', '[CHOICE_POINT]']);
    return Array.from(new Set([...(extraStops ?? []), ...base, ...rpGuards].filter(Boolean)));
  }

  private _mapFinishReason(result: CompletionResult): GenerationFinishReason {
    if (result.context_full)                          return 'context_full';
    if (result.interrupted)                           return 'cancelled';
    if (result.stopped_limit || result.truncated)     return 'length';
    if (result.stopped_eos   || result.stopped_word)  return 'stop';
    return 'unknown';
  }

  private _updateCompletionMeta(result?: CompletionResult | null): void {
    if (!result) { this.lastCompletionMeta = null; return; }
    const tokensPerSecond = result.timings?.predicted_per_second ?? this.backendInfo?.tokPerSec ?? null;
    if (result.timings?.predicted_per_second && this.backendInfo) {
      this.backendInfo.tokPerSec = result.timings.predicted_per_second;
    }
    this.lastCompletionMeta = {
      finishReason:    this._mapFinishReason(result),
      tokensPerSecond,
      tokensPredicted: result.tokens_predicted ?? result.timings?.predicted_n ?? 0,
      tokensEvaluated: result.tokens_evaluated ?? result.timings?.prompt_n ?? 0,
      tokensCached:    result.tokens_cached ?? 0,
      contextFull:     Boolean(result.context_full),
      interrupted:     Boolean(result.interrupted),
      truncated:       Boolean(result.truncated || result.stopped_limit),
      stopWord:        result.stopping_word };
    // [BUG FIX #22] usedTokens 실시간 캐싱 업데이트
    this._usedTokens = result.tokens_cached ?? 0;
  }

  /**
   * ✅ [FIX #6] RAM 티어별 동적 생성 타임아웃
   *   flagship(8GB+)  : 20s — GPU/HTP 탑재로 더 빨리 생성
   *   high (6-8GB)    : 60s — 초기 모델 로드(워밍) 지연 포함해 넉넉히 설정
   *   mid  (4-6GB)    : 75s — 중간급 GPU 모드도 예측 가능한 지연
   *   low  (<4GB)     : 90s — CPU 모드 처리 속도 고려해 넉넉히 설정
   *
   * [FIX] high 티어 30s → 60s: 초기 첫 번째 생성 시 모델 워밍업(KV 캐시 구성)에
   *   실제로 20~40초가 소요될 수 있음. 생성 속도 자체는 정상이나 첫 응답까지
   *   로드 시간이 타임아웃을 초과하는 케이스를 방지.
   */
  private _getGenerationTimeoutMs(): number {
    const profile = deviceProfiler.getCachedProfile();
    const totalMB = profile?.totalMB ?? 0;
    // [BUG-22 FIX] 하드코딩된 ID 대신 MODEL_KV_SPECS 키 집합으로 reasoning 모델 판별.
    // 새 reasoning 모델이 추가될 때 이 파일을 수정하지 않아도 됨.
    // [BUG-25 FIX] 실제 구현도 MODEL_KV_SPECS 기반으로 동작하도록 수정.
    // 이전: new Set(['gemma-3n-e2b-reasoning']) 하드코딩 → 모델 추가 시 수동 동기화 필요
    // 수정: MODEL_KV_SPECS 키에 'reasoning' 포함 여부로 판별 (kv-spec-constants와 자동 동기화)
    const REASONING_MODEL_IDS: ReadonlySet<string> = new Set(
      Object.keys(MODEL_KV_SPECS).filter(id => id.includes('reasoning'))
    );
    const isReasoningModel = REASONING_MODEL_IDS.has(this.loadedModelId ?? '');
    if (isReasoningModel) {
      if (totalMB >= 8192) return 90_000;
      if (totalMB >= 6144) return 100_000;
      if (totalMB >= 4096) return 110_000;
      return 120_000;
    }
    if (totalMB >= 8192) return 20_000;
    if (totalMB >= 6144) return 120_000;  // [FIX] 60s → 120s: grammar 오버헤드 + 초기 워밍 지연 허용
    if (totalMB >= 4096) return 90_000;   // [FIX] 75s → 90s
    return 120_000;                        // [FIX] 90s → 120s
  }

  private async _stopCompletionSafely(reason: string): Promise<void> {
    if (!this.context?.stopCompletion) return;
    try { await this.context.stopCompletion(); }
    catch (e) { logger.warn(`[LlamaEngine] stopCompletion failed (${reason}):`, e); }
  }

  // ── 상태 관리 ─────────────────────────────────────────────────────────────

  private setState(s: EngineState): void {
    this.state = s;
    // ✅ [EventBus] UI 상태 변경 브리지 → DeviceEventEmitter 대신 engineBus로 전파
    engineBus.emitStateChanged(s);
    // Zustand 상태 업데이트 → 상태 변경 시에만 re-render (UI 효율 극대화)
    this.stateListeners.forEach(fn => fn(s));
  }

  /**
   * 워밍업 시스템 프롬프트 설정.
   * load() 호출 이전에 워밍업 시스템 프롬프트를 지정해두면 워밍업 효과 극대화.
   * ✅ [FIX] 워밍업 시스템 프롬프트 지정 권장
   */
  setWarmupSystemPrompt(prompt: string): void {
    this.warmupMgr.setSystemPrompt(prompt);
  }

  setStoryLoraAdapterSelection(selection: StoryLoraAdapterSelection | null): void {
    this.storyLoraAdapterSelection = selection ? { ...selection } : null;
    if (!selection) {
      this.lastLoggedStoryAdapterId = null;
      return;
    }
    this._applyPendingStoryAdapterSelection();
  }

  private _applyPendingStoryAdapterSelection(): void {
    const selection = this.storyLoraAdapterSelection;
    if (!selection || !this.loadedModelId) return;

    if (selection.modelId !== this.loadedModelId) {
      logger.log(
        `[LlamaEngine] story adapter deferred for ${selection.modelId}; currently loaded model is ${this.loadedModelId}`,
      );
      return;
    }

    if (this.lastLoggedStoryAdapterId === selection.adapterId) {
      return;
    }

    this.lastLoggedStoryAdapterId = selection.adapterId;
    if (!selection.engineSupportReady) {
      logger.log(
        `[LlamaEngine] story adapter prepared for future engine support: ${selection.adapterId} (${selection.storyStylePreset}/${selection.language})`,
      );
      return;
    }

    logger.log(
      `[LlamaEngine] story adapter selected: ${selection.adapterId} (${selection.storyStylePreset}/${selection.language})`,
    );
  }

  /**
   * 상태 변경 리스너 등록.
   * ✅ [FIX] Set.has()로 O(1) 중복 등록 dedup (Array.includes()는 O(n) 비효율)
   * ✅ [FIX] 등록 수가 MAX_LISTENERS 이상이면 요청 거부 (이전: slice(-5) 자르기)
   */
  onStateChange(fn: (s: EngineState) => void): () => void {
    // 이미 등록된 함수면 중복 등록 차단 → unsubscribe 함수만 반환
    if (this.stateListeners.has(fn)) {
      return () => this.offStateChange(fn);
    }
    // 등록 한도 초과 시 거부 + 에러 알림
    if (this.stateListeners.size >= LlamaEngine.MAX_LISTENERS) {
      const warnMsg =
        `[LlamaEngine] stateListeners 한도 초과 (최대 ${LlamaEngine.MAX_LISTENERS}). 리스너 누수 가능성.\n` +
        `  호출 스택: ${new Error().stack ?? '(unavailable)'}`;
      logger.warn(warnMsg);
      // ✅ [FIX] __DEV__ 여부 무관하게 항상 engineBus로 에러 알림
      engineBus.emitError(
        `[LlamaEngine] stateListeners 최대치 초과 (max ${LlamaEngine.MAX_LISTENERS}). UI 리스너 누수를 점검하세요.`,
        /* isFatal */ false,
      );
      return () => {};
    }
    this.stateListeners.add(fn);
    return () => this.offStateChange(fn);
  }

  offStateChange(fn: (s: EngineState) => void): void {
    this.stateListeners.delete(fn);
  }

  // ── 큐 관리 ───────────────────────────────────────────────────────────────
  /**
   * 단일 생성 요청에 대한 함수를 순서대로 직렬 실행 보장.
   * generate() / parallelGenerate() / generateWithTools() 모두 여기에 진입.
   * ✅ [FIX #8] MAX_QUEUE_DEPTH 초과 시 요청은 에러로 즉시 반환 (메모리 누수 방지)
   * ✅ [FIX] 큐 포화 에러 → engineBus.emitError()로 UI 에러 알림
   */
  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this._queueDepth >= LlamaEngine.MAX_QUEUE_DEPTH) {
      const msg = [
        `[LlamaEngine] 생성 큐 가득 참 (최대 ${LlamaEngine.MAX_QUEUE_DEPTH}). 잠시 후 다시 시도해 주세요.`,
        `Generation queue full (max ${LlamaEngine.MAX_QUEUE_DEPTH}) - please try again shortly`,
      ].join(' / ');
      logger.warn(msg);
      engineBus.emitError(msg, false);
      return Promise.reject(new Error(msg));
    }

    // [BUG FIX #17] 대기열 압력(Backpressure) 처리
    // 큐에 3개 이상 쌓이면 호출자에게 500ms 지연을 주어 UI 스레드 및 네이티브 부하 조절
    if (this._queueDepth >= 3) {
      // [BUG FIX #7] 고정 500ms 지연 대신 큐 맨 뒤에 줄을 서되, 
      // 스케줄링 간격 확보를 위해 microtask 한 템포(Promise.resolve) 쉬고 진입
      return Promise.resolve().then(() => this._enqueueInner(task));
    }
    return this._enqueueInner(task);
  }

  private _enqueueInner<T>(task: () => Promise<T>): Promise<T> {
    this._queueDepth++;
    logger.log(`[LlamaEngine] _enqueueInner: queueDepth=${this._queueDepth}, state=${this.state}`);
    // ✅ [FIX] _lastGeneration을 항상 최신 next로 교체해야 직렬화 동작
    // ✅ [FIX] task()는 정확히 1번만 실행 (이전: .then(task, task) 두 번 실행되는 버그)
    // ✅ [FIX] finally에서 _queueDepth-- (이전: 누락되어 영원히 증가)
    // ✅ [BUG FIX] 네이티브 hung task 시 _queueDepth 영구 고정 방지
    // 기존: task() 내부 타임아웃(generation timeout)이 reject되면 finally 호출됨.
    //       하지만 llama.rn 네이티브 레이어가 완전히 hung되면 JS Promise가 영원히
    //       resolve/reject 되지 않아 finally가 실행되지 않음 → _queueDepth 영구 고정
    //       → 다음 모든 generate 요청이 "queue full" 오류로 실패
    // 수정: 최대 generation timeout(90초) + 10초 여유를 준 외부 watchdog 타이머 추가
    //       네이티브가 응답 없으면 강제로 _queueDepth-- 처리
    const watchdogMs = 150_000; // 150초 (최대 90초 타임아웃 + 여유)
    // ✅ [BUG FIX #25] watchdog race condition 수정
    // 기존: watchdog 콜백과 finally가 동시에 실행되면 둘 다 null/비null 체크를 통과해
    //       _queueDepth 이중 감소 발생 가능 (JS는 단일 스레드지만 microtask/macrotask 경계에서 발생)
    // 수정: 감소 여부를 boolean 플래그로 관리 → 어느 쪽이 먼저 실행되든 정확히 1회만 감소
    let decremented = false;
    const doDecrement = () => {
      if (decremented) return;
      decremented = true;
      this._queueDepth = Math.max(0, this._queueDepth - 1);
      logger.log(`[LlamaEngine] _enqueueInner: task completed, queueDepth=${this._queueDepth}`);
    };

    let watchdogTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (watchdogTimer !== null) {
        this._queueWatchdogs.delete(watchdogTimer);
      }
      watchdogTimer = null;
      doDecrement();
      logger.error('[LlamaEngine] watchdog: hung native task detected, forced _queueDepth decrement');
    }, watchdogMs);
    if (watchdogTimer !== null) {
      this._queueWatchdogs.add(watchdogTimer);
    }

    logger.log('[LlamaEngine] _enqueueInner: waiting for _lastGeneration...');
    const next = this._lastGeneration
      .then(() => {
        logger.log('[LlamaEngine] _enqueueInner: executing task...');
        return task();
      }, () => {
        logger.log('[LlamaEngine] _enqueueInner: previous task failed, executing anyway...');
        return task();
      })   // 이전 실행 성공/실패 무관하게 항상 실행
      .finally(() => {
        // [BUG FIX #25] doDecrement()로 정확히 1회만 감소 보장
        if (watchdogTimer !== null) {
          clearTimeout(watchdogTimer);
          this._queueWatchdogs.delete(watchdogTimer);
          watchdogTimer = null;
        }
        doDecrement();
      });
    // 연결된 Promise 체인의 에러 전파 방지 (unhandled rejection 방지)
    this._lastGeneration = next.catch(() => {}) as Promise<unknown>;
    return next;
  }

  // ── 로드 ──────────────────────────────────────────────────────────────────
  /**
   * 모델 로딩 단계:
   *   'loading' — 모델 초기화 (initLlama)
   *   'warming'  — 워밍업 (세계관 prefill + KV 복원)
   *   'ready'    — 준비 완료
   */
  async load(modelId: string, forceReload = false): Promise<BackendInfo> {
    _ensureLlamaRn();
    if (!initLlama) throw new Error('llama.rn not installed');

    const normId = modelId.toLowerCase();
    if (!forceReload && this.loadedModelId?.toLowerCase() === normId && this.context && this.backendInfo) {
      logger.log(`[LlamaEngine] ${modelId} already loaded (case-insensitive)`);
      return this.backendInfo;
    }

    // [BUG FIX] 모델 로드 시 큐 초기화 — 이전 모델의 미완료 작업이 새 모델 생성을 막는 것 방지
    this._lastGeneration = Promise.resolve();
    this._queueDepth = 0;
    this.generationId = 0;

    // ✅ [FIX] 진행 중인 load() 동기화 — 동시 호출 시 큐잉
    if (this._loadingPromise) {
      if (this._loadingModelId === normId) {
        logger.log(`[LlamaEngine] 동일 모델(${normId}) 로드 중 — Promise 재사용`);
        return this._loadingPromise;
      }
      logger.log(`[LlamaEngine] 다른 모델(${this._loadingModelId}) 로드 중 — 완료 대기 후 ${normId} 진행`);
      try { await this._loadingPromise; } catch { /* 무시 */ }
    }

    this._loadingModelId = normId;
    this._loadingPromise = (async () => {
      try {
        return await this._doLoad(normId, forceReload);
      } finally {
        // [BUG FIX] 로드가 끝난 시점에 내가 그 로드 작업을 수행한 주체인 경우에만 nullify
        if (this._loadingModelId === normId) {
          this._loadingPromise = null;
          this._loadingModelId = null;
        }
      }
    })();
    return this._loadingPromise;
  }

  private async _doLoad(modelId: string, forceReload: boolean): Promise<BackendInfo> {
    const model = MODELS.find(m => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    if (!await modelDownloader.isModelDownloaded(modelId)) {
      throw new Error(`Model not downloaded: ${modelId}`);
    }

    await this.release(true);
    this.setState('loading');

    const modelPath = modelDownloader.getModelPath(modelId);

    // ── 파라미터 결정 (RAM/SoC, < 1ms) ──────────────────────────────────
    // [KV SPEC] fallback이든 spec 고정값이든 동일해야 함 (DeviceProfiler 측정 실패 시)
    // ✅ [FIX] MODEL_KV_SPECS에서 모델별 nCtx/ropeFreqBase fallback 조회
    // ModelConfig에 nCtxFallback/ropeFreqBase가 없더라도 kv-spec-constants의 정확한 값 사용
    const _kvSpec = MODEL_KV_SPECS[modelId as keyof typeof MODEL_KV_SPECS];
    let nCtx       = model.nCtxFallback   ?? _kvSpec?.nCtx      ?? 4096;
    // [BUG FIX] nBatch/nUbatch는 kv-spec 고정값 2048이며 nCtxFallback과 무관.
    // 이전: Math.min(nCtxFallback, 2048) → nCtxFallback < 2048 모델이 추가될 경우
    //       DeviceProfiler 실패 시 nBatch < 2048로 잘못 설정 → llama.cpp 성능 저하 및
    //       n_ubatch > n_batch 조건 위반 가능. kv-spec은 batch_size=2048 고정을 명시.
    // 수정: 항상 2048로 초기화. DeviceProfiler 성공 시 params.nBatch/nUbatch로 덮어씌워짐.
    let nBatch     = 2048;   // kv-spec: batch_size = 2048 고정
    let nUbatch    = 2048;   // kv-spec: ubatch_size = 2048 고정
    // ✅ [OPT] MainApplication이 Efficiency Core 수를 System Property로 노출
    // android.os.SystemProperties 대신 Java System.getProperty()로 읽기
    // MainApplication.applyThreadStrategy()에서 "ai.inference.threads" 설정됨
    // → AI 추론이 Efficiency Core에서만 실행되어 RenderThread와 CPU 경쟁 없음
    const _effCoresStr = typeof (globalThis as unknown as { __android?: { getSystemProperty: (k: string) => string } }).__android?.getSystemProperty === 'function'
      ? (globalThis as unknown as { __android: { getSystemProperty: (k: string) => string } }).__android.getSystemProperty('ai.inference.threads')
      : null;
    const _effCores = _effCoresStr ? parseInt(_effCoresStr, 10) : 0;
    // Efficiency Core 수가 유효하면 사용, 아니면 기존 DeviceProfiler 로직으로 결정
    let nThreads   = (_effCores >= 2 && _effCores <= 8) ? _effCores : 4;
    let nGpuLayers = 0;   // DeviceProfiler 측정 실패 시 GPU 비활성 fallback
    let nKeep      = 512;
    let resolvedBackend: BackendType = 'GPU';
    let useHTP       = false;
    let isOpenCLOnly = false;
    let ropeFreqBase = model.ropeFreqBase ?? _kvSpec?.ropeFreqBase ?? 10000;

    try {
      const profile = await deviceProfiler.measure();
      // DeviceProfiler로 기기별 파라미터 계산
      const params: LlamaTuningParams = deviceProfiler.computeLlamaParams(
        model.sizeMB, profile, ropeFreqBase,
        nCtx,  // [KV SPEC] 모델별 n_ctx 상한 적용
      );
      nCtx            = params.nCtx;
      nBatch          = params.nBatch;
      nUbatch         = params.nUbatch;
      nGpuLayers      = params.nGpuLayers;
      resolvedBackend = params.backend;
      // [FIX] HTP 완전 비활성화 - native hang 문제로 인해 강제 비활성화
      useHTP          = false;
      isOpenCLOnly    = params.isOpenCLOnly;
      nKeep           = params.nKeep;
      // ✅ [FIX] DeviceProfiler가 산출한 nThreads 반영 (이전: 갱신 누락 → 항상 fallback 4 사용)
      // Efficiency Core 힌트(_effCores)가 유효하면 그것을 우선, 아니면 DeviceProfiler 결과 사용
      if (!(_effCores >= 2 && _effCores <= 8)) {
        nThreads = (params as unknown as Record<string, unknown>).nThreads as number | undefined ?? nThreads;
      }
      // ✅ [v7] nParallelSlots: RAM 티어별 결정 (low:1 / mid:2 / high:4)
      this.nParallelSlots = (params as unknown as Record<string, unknown>).nParallelSlots as number | undefined ?? DEFAULT_N_PARALLEL_SLOTS;

      // OpenCL 모드 호환성 체크
      // IQ4_NL 등 일부 모델 → OpenCL 미지원 → CPU fallback
      if (isOpenCLOnly && model.openclCompatible === false) {
        logger.warn(
          `[LlamaEngine] 모델 '${model.hfFile ?? modelId}' OpenCL 미지원.` +
          ' GPU 비활성화 ?? CPU 폴백. Q4_0 또는 Q6_K 양자화 모델 권장.',
        );
        nGpuLayers   = 0;
        isOpenCLOnly = false;
      }

      logger.log(`[LlamaEngine] ${params.reason} | threads=${nThreads}`);
    } catch (e) {
      logger.warn('[LlamaEngine] DeviceProfiler 측정 실패, fallback:', e);
    }

    // ── 모델 파일 메타 사전 조회 (loadLlamaModelInfo) ───────────────────────
    // initLlama 이전 GGUF 파일 메타를 미리 조회해 두면 초기화 실패 원인을 쉽게 진단 가능.
    // [BUG FIX] 항상 호출하여 모델 파일 손상 여부 사전 확인
    try {
      logger.log(`[LlamaEngine] 🔍 모델 메타 읽기 시작: ${modelPath}`);
      const info = (await loadLlamaModelInfo(modelPath)) as unknown as LoadedModelInfo;
      logger.log(`[LlamaEngine] 🔍 모델 메타 읽기 완료:`, JSON.stringify(info));
      logger.log(
        `[LlamaEngine] 모델 파일 검증 OK | params=${info.n_params ?? '?'} ` +
        `ctx_train=${info.n_ctx_train ?? '?'} vocab=${info.vocab_size ?? '?'}`,
      );
    } catch (e) {
      logger.error(`[LlamaEngine] 모델 파일 검증 실패:`, e);
      this.setState('error');
      throw new Error(`[LlamaEngine] 모델 파일 손상 또는 미지원 형식: ${e}`);
    }

    // ── initLlama ──────────────────────────────────────────────────────────
    // ✅ [FIX] RAM >= 8GB인 경우 use_mlock 활성화 (모델 가중치 RAM 고정 → OOM killer 방지)
    const cachedProfile = deviceProfiler.getCachedProfile();
    const useMlock = (cachedProfile?.totalMB ?? 0) >= 8192;

    let actualGpuLayers = nGpuLayers;
    let actualDevices: string[] = [];
    // [FIX] HTP 완전 비활성화 - useHTP를 false로 강제 설정
    // [BUG FIX] n_parallel=1 고정 — PrefixKVManager와 서버 kv-prefill이 n_parallel=1로 생성
    // 이전: this.nParallelSlots(tier=high → 4) 전달 → KV 슬롯 16,384개 생성
    //       서버 base.bin은 n_parallel=1(4,096개)로 생성 → loadSession() 구조 불일치로 hung
    // 수정: n_parallel=1 고정 (PrefixKVManager.init에서 _nParallelSlots=1 강제 중)
    this.context = await this._initWithFallback(
      modelPath, nCtx, nBatch, nUbatch, nThreads, nGpuLayers, false, isOpenCLOnly, useMlock,
      nKeep, ropeFreqBase, 1,  // n_parallel=1 고정 (서버 kv-prefill과 일치)
      (used, devices) => { actualGpuLayers = used; actualDevices = devices; },
    );

    // initLlama 결과에서 실제 백엔드 정보 추출
    // [FIX] HTP 완전 비활성화 - useHTP를 항상 false로 설정
    const ctxGpu     = this.context.gpu ?? (actualGpuLayers !== 0);
    const ctxDevices = this.context.devices ?? actualDevices;
    const actualBackend: BackendType =
      ctxGpu ? 'GPU' : 'CPU';  // HTP 완전 제거

    if (resolvedBackend !== actualBackend) {
      logger.warn(
        `[LlamaEngine] 백엔드 불일치 — 요청: ${resolvedBackend}, 실제: ${actualBackend}`,
      );
    }

    // [FIX] HTP 완전 비활성화 - useHTP를 항상 false로 설정
    const hasHTP = false;
    // ✅ [FIX] devices 배열을 backendInfo에 포함 (HTP/GPU 실제 활성화 여부 확인용)
    this.backendInfo   = { 
      engine: 'llama', 
      backend: actualBackend, 
      nGpuLayers: actualGpuLayers, 
      useHTP: hasHTP, 
      tokPerSec: null, 
      modelId,
      devices: ctxDevices
    };
    this.loadedModelId = modelId;
    this._applyPendingStoryAdapterSelection();

    // ── PrefixKVManager 초기화 [v6] ────────────────────────────────────────
    // 모델 적재 완료 후 PrefixKVManager에 ctx 전달 / Prefix KV 저장·복원을 위한 초기화
    await prefixKVManager.init(this.context, this.nParallelSlots, nCtx);
    await prefixKVManager.restoreCheckpointMeta();

    // ── 핵심 메커니즘: Base 레이어 토큰 포인터 추적 ──────────────────────────
    kvOffsetTracker.init(this.context as import('./KVOffsetTracker').LlamaContextWithTokenize);

    // ── 워밍업 ────────────────────────────────────────────────────────────
    // [FIX] 워밍업 완전 비활성화 - 발열 및 RAM 누수 방지
    if (!this.warmupMgr.hasSystemPrompt()) {
      logger.warn('[LlamaEngine] setWarmupSystemPrompt() 미설정. cache_prompt 효과 없음 — 매 턴 재컴파일');
    }
    logger.log('[LlamaEngine] Warmup disabled to prevent overheating and RAM issues');
    this.setState('ready');

    // ✅ [FIX #1] _loadedNCtx 캐싱 → getNCtx() getter에서 로드된 ctx 크기 반환
    // 이전: nCtx를 load() 호출자에게만 전달 → getter 없음
    // OnDeviceSummarizer.adaptiveSummaryTrigger()에서 nCtx=0으로 fallback → 항상 요약 트리거됨.
    this._loadedNCtx = nCtx;

    logger.log(`[LlamaEngine] ✅ 모델 로드 완료: ${modelId} | ${actualBackend} | gpu=${actualGpuLayers}`);
    // [BUG FIX] Proxy를 통해 호출될 경우 this는 Proxy 객체임.
    // getLlamaInstance() 가 반환하는 실제 인스턴스와 비교하여 현재 실행 중인 load()가
    // 최신 싱글톤 인스턴스에 의해 실행 중인지 확인.
    const realInstance = getLlamaInstance();
    if (realInstance === this || (typeof this === 'object' && this !== null && !('_llamaInstance' in this))) {
      // Proxy 내부에서 호출되거나 이미 _llamaInstance인 경우
      // setState는 warmup 섹션에서 'ready'로 설정됨
    } else {
      logger.warn('[LlamaEngine] _doLoad 완료 시 인스턴스 교체 감지 — setState(ready) 생략');
    }
    return this.backendInfo;
  }

  // ── 메모리 해제 ─────────────────────────────────────────────────────────
  /**
   * ✅ [FIX] 명시적 리소스 해제 — 메모리 누수 방지
   * 모든 리스너 정리, 컨텍스트 해제, 상태 초기화
   */
  async release(skipAwait = false): Promise<void> {
    _ensureLlamaRn();
    if (!skipAwait && this._loadingPromise) {
      logger.log('[LlamaEngine] load() 진행 중 — 해제 전 완료 대기');
      try { await this._loadingPromise; } catch { logger.log('[LlamaEngine] load() 실패 (대기 중)'); }
    }
    try {
      if (this.state === 'generating') {
        await this._stopCompletionSafely('release cleanup');
      }

      // 컨텍스트 해제
      if (this.context) {
        try {
          // llama.rn 컨텍스트가 정리 메소드를 가지고 있다면 호출
          if (typeof (this.context as LlamaContextExtended).release === 'function') {
            await (this.context as LlamaContextExtended).release();
          }
        } catch (e) {
          logger.warn('[LlamaEngine] context release failed (ignored):', e);
        }
        this.context = null;
      }

      // ✅ [FIX] warmupMgr.cleanup — 모델 언로드 시 warmup_session.bin 삭제
      // 이전 _release()에만 있었으나 _release()가 dead code였으므로 실제 호출 안 됨
      // → 모델 교체 시 이전 모델의 warmup_session.bin 누적
      if (this.loadedModelId) {
        await this.warmupMgr.cleanup(this.loadedModelId).catch(() => {});
      }

      // PrefixKVManager 정리
      try {
        await prefixKVManager.release();
      } catch (e) {
        logger.warn('[LlamaEngine] prefixKVManager release failed (ignored):', e);
      }

      // ✅ [FIX] kvOffsetTracker dangling ref 방지
      // 이전 _release()에만 있었으나 dead code → dangling pointer 가능
      kvOffsetTracker.release();

      if (this._queueWatchdogs.size > 0) {
        for (const timer of this._queueWatchdogs) {
          clearTimeout(timer);
        }
        this._queueWatchdogs.clear();
      }

      // 상태 초기화
      this.loadedModelId = null;
      this.backendInfo = null;
      this._loadedNCtx = 0;
      this._usedTokens = 0;
      this.lastCompletionMeta = null;
      this.lastLoggedStoryAdapterId = null;
      this._logitBiasTokenCache.clear();
      this._didWarnMissingLogitBiasTokenizer = false;
      // [BUG FIX] generationId를 0으로 리셋하면 release 중이던 이전 생성의 state가 꼬일 수 있음
      // 기존 생성(myGenId)들이 무효화된 상태로 남기려면 generationId는 계속 증가(또는 유지)해야 함
      // [BUG FIX #8] _queueDepth를 0으로 강제 리셋하지 않고 순차 감소 대기
      // 강제 리셋 시, 이전에 큐에 들어있던 태스크들이 나중에 doDecrement()를 호출해 
      // _queueDepth를 음수(0으로 클램핑)로 만들어버려 새 요청이 큐 제한을 우회할 수 있음.
      // release() 호출 시에는 새로운 생성을 어차피 this.context 체크에서 거르므로 
      // 인위적인 카운터 조작 불필요.
      this._lastGeneration = Promise.resolve();
      // _loadingPromise는 load()의 .finally()에서만 null로 정리
      // release()에서 null 초기화하면 load() dedup 로직이 깨짐
      this.nParallelSlots = DEFAULT_N_PARALLEL_SLOTS;

      // [CRITICAL FIX] release() 시 stateListeners.clear()를 호출하면
      // InferenceEngine 등 앱 라이프사이클 동안 유지되어야 하는 리스너들이 모두 증발함.
      // 리스너 관리는 등록한 주체(unsub 반환값 호출)가 책임지도록 수정.
      // this.stateListeners.clear(); (삭제)

      // [CRITICAL FIX] _llamaInstance = null 호출 금지.
      // load() -> release() -> _doLoad 순서로 실행되는데, release()에서 null을 만들면
      // _doLoad의 후속 작업(this.setState)이 Proxy에 의해 새로운 LlamaEngine 인스턴스를
      // 생성하게 되어, 정작 모델이 로드된 인스턴스와 UI가 바라보는 인스턴스가 달라짐.
      // _llamaInstance = null; (삭제)
      // this.setState('idle'); (삭제 - load() 중에는 'loading'/'warming' 상태를 유지해야 함)

      logger.log('[LlamaEngine] ✅ 모든 리소스 해제 완료');
    } catch (e) {
      logger.error('[LlamaEngine] release 실패:', e);
      this.setState('error');
      throw e;
    }
  }

  /**
   * ✅ [FIX] 내부 리소스 정리 helper - 기존과 통합
   */
  /**
   * ✅ [FIX #7] 큐잉 처리 — 기존 생성이 완료될 때까지 자동 대기 → 직렬화 보장
   */
  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    if (!this.context) throw new Error('Model not loaded');
    
    return this._enqueue(() => this._doGenerate(messages, options));
  }

  /**
   * Raw string prompt 기반 생성 (메시지 포맷 없는 직접 생성용 — 임베딩/벤치 테스트용)
   */
  async generateRaw(prompt: string, maxTokens = 400): Promise<string> {
    return this.generate(
      [{ role: 'system', content: prompt }],
      { maxTokens },
    );
  }

  // ── [v6] 월드 프리픽스 + 캐릭터 병렬 생성 API ─────────────────────────────
  // 사용 순서:
  //   1. 최초 스토리 진입 시 lockWorldPrefix(systemPrompt) 호출
  //   2. 각 캐릭터에 대해 forkCharacterSlot(charId) 호출
  //   3. "분기 재시도" 시 resetCharacterSuffix(charId) 호출
  //   4. 매 턴 generateForCharacter(charId, messages) 로 생성

  /**
   * 월드 프리픽스 + 캐릭터 공통 KV 구성 — 이후 슬롯별 포크
   * 최초 스토리 진입 시 한 번만 호출해야 함.
   * @param systemPrompt        월드 프리픽스 + 캐릭터 공통 시스템 프롬프트
   * @param prefixTokenEstimate 예상 prefill 토큰 수
   */
  async lockWorldPrefix(
    systemPrompt: string,
    prefixTokenEstimate = 512,
  ): Promise<void> {
    if (!this.context) return;
    // ✅ [FIX] lockWorldPrefix를 _enqueue로 직렬화
    // initStory → loadBase → lockWorldPrefix 순으로 호출되지만
    // 이전 KV 세션이 남아있거나 이미 큐에 작업이 있으면 경쟁 가능
    return this._enqueue(() => this._doLockWorldPrefix(systemPrompt, prefixTokenEstimate));
  }

  private async _doLockWorldPrefix(
    systemPrompt: string,
    prefixTokenEstimate: number,
  ): Promise<void> {
    if (!this.context) return;
    // [BUG FIX #19] lockWorldPrefix 반환값 체크 추가
    // 이전: await prefixKVManager.lockWorldPrefix(...) 결과 무시
    //   lockWorldPrefix가 null을 반환(prefill 실패) 해도 measureBase가 실행됨
    //   → baseEnd = 추정 토큰 수로 설정되지만 KV에는 systemPrompt가 없는 상태
    //   → n_keep이 실제 KV보다 크게 설정 → llama.cpp 롤링윈도우가 없는 토큰 보호 시도
    // 수정: null 반환 시 measureBase 스킵 → baseEnd=0 유지 (MIN_N_KEEP=512 fallback)
    const checkpoint = await prefixKVManager.lockWorldPrefix(systemPrompt, prefixTokenEstimate);
    if (!checkpoint) {
      logger.warn('[LlamaEngine] lockWorldPrefix 실패 — n_keep=MIN_N_KEEP fallback');
      return;
    }
    this.setWarmupSystemPrompt(systemPrompt);
    
    // [BUG-ITEM53 FIX] PrefixKVManager.lockWorldPrefix 내부에서 이미 measureBase 및 meta 업데이트 완료됨
    logger.log(
      `[LlamaEngine] Base 레이어 구성 완료: 0 ~ ${checkpoint.prefixTokenCount}토큰 ` +
      `(prefixEstimate=${prefixTokenEstimate})`,
    );
  }

  /**
   * 캐릭터 전용 슬롯에 월드 프리픽스 KV를 복제.
   * 캐릭터 수가 많아지면 슬롯 초과 → 순환 할당.
   * @param charId 캐릭터 ID (2 이상)
   */
  async forkCharacterSlot(charId: number): Promise<void> {
    if (!this.context) return;
    await prefixKVManager.forkToCharacterSlot(charId);
  }

  /**
   * 캐릭터 슬롯의 suffix(직전 생성 결과) KV를 제거 → prefix 이후로 초기화.
   * "분기 재시도" / "다른 결말" 시나리오에서 호출.
   * @param charId suffix 삭제할 캐릭터 ID
   */
  async resetCharacterSuffix(charId: number): Promise<void> {
    if (!this.context) return;
    await prefixKVManager.resetCharacterSuffix(charId);
  }

  /**
   * 텍스트 전용 KV만 채우는 no-token 생성 — 실제 답변 없음.
   * n_predict:0 completion → 챕터 prefix(prevSummary + chapterInfo) prefill만 진행.
   * useKVSession.initChapter / changeChapter에서 호출.
   * lockWorldPrefix 이후 이 함수가 끝나야 KV 상태 완성 (호출 직후 saveChapter 권장).
   */
  async prefillOnly(text: string, chapterIdx = 0): Promise<void> {
    if (!this.context) return;
    // ✅ [FIX] prefillOnly를 _enqueue로 직렬화
    // 이전: prefillOnly가 큐 밖에서 실행 → triggerSingleChapterRollingKV 호출 후
    //       다음 generate()가 즉시 실행되면 prefillOnly와 KV 상태 경쟁
    // 수정: _enqueue로 래핑 → 큐 안에서 순차 실행 보장
    return this._enqueue(() => this._doPrefillOnly(text, chapterIdx));
  }

  /**
   * completion()과 동일한 messages 직렬화로 KV prefix를 prefill한다.
   * chapter snapshot을 생성할 때 system/user 경계까지 실제 생성 경로와 맞추기 위한 전용 경로.
   *
   * @returns prefill 직후 엔진이 인식한 총 prefix 토큰 수 (_usedTokens)
   */
  async prefillMessagesOnly(messages: ChatMessage[], chapterIdx = 0): Promise<number> {
    if (!this.context) return 0;
    return this._enqueue(() => this._doPrefillMessagesOnly(messages, chapterIdx));
  }

  private async _doPrefillMessagesOnly(messages: ChatMessage[], chapterIdx: number): Promise<number> {
    if (!this.context) return 0;

    const { n_keep, n_cache_reuse } = kvOffsetTracker.getBaseOnlyOffsets(this._loadedNCtx);

    try {
      const result = await this.context.completion({
        messages,
        n_predict: 0,
        temperature: 1.0,
        top_p: 1.0,
        cache_prompt: true,
        n_keep,
        n_cache_reuse,
        kv_unified: true,
        ...(this.backendInfo?.backend !== 'CPU' && { flash_attn_type: 'off' }),
      }).catch((e: unknown) => {
        logger.warn('[LlamaEngine] prefillMessagesOnly failed (ignored):', e);
        return null as CompletionResult | null;
      });

      if (result) {
        const promptTokens = result.tokens_evaluated ?? result.timings?.prompt_n ?? 0;
        const predictedTokens = result.tokens_predicted ?? result.timings?.predicted_n ?? 0;
        const cachedTokens = result.tokens_cached ?? 0;
        const nCtxCap = this._loadedNCtx > 0 ? this._loadedNCtx : 8192;
        const measuredTokens = Math.min(cachedTokens + promptTokens + predictedTokens, nCtxCap);
        if (measuredTokens > 0) {
          this._usedTokens = measuredTokens;
        }
      }

      logger.log(
        `[LlamaEngine] Chapter ${chapterIdx} exact-message prefill 완료 ` +
        `(_usedTokens=${this._usedTokens})`,
      );

      return this._usedTokens;
    } catch (e) {
      logger.warn('[LlamaEngine] prefillMessagesOnly failed:', e);
      return this._usedTokens;
    }
  }

  private async _doPrefillOnly(text: string, chapterIdx: number): Promise<void> {
    if (!this.context) return;

    // [BUG FIX #16] n_cache_reuse는 n_keep과 다른 하한(256 vs 512)을 가짐 — 별도 구조분해
    const { n_keep, n_cache_reuse } = kvOffsetTracker.getBaseOnlyOffsets(this._loadedNCtx);
    
    await this.context.completion({
      messages:      [{ role: 'user' as const, content: text }],
      n_predict:     0,
      temperature:   1.0,
      top_p:         1.0,
      cache_prompt:  true,
      n_keep,
      n_cache_reuse,
    }).catch((e: unknown) => {
      logger.warn('[LlamaEngine] prefillOnly failed (ignored):', e);
    });
    
    logger.log(
      `[LlamaEngine] Chapter ${chapterIdx} prefill 완료 (chapterEnd는 caller가 확정)`,
    );
  }

  /**
   * 챕터 이외의 전용 prefill → chapterIdx 지정 없이 현재 KV에 텍스트 추가.
   * Called by external prefill helpers that append extra context into KV.
   */
  async prefillCoreOnly(text: string): Promise<void> {
    if (!this.context) return;
    // ✅ [FIX] prefillCoreOnly도 큐로 직렬화
    // Serialize auxiliary prefill work so it does not race with the next generate().
    return this._enqueue(() => this._doPrefillCoreOnly(text));
  }

  private async _doPrefillCoreOnly(text: string): Promise<void> {
    if (!this.context) return;

    // [BUG FIX #16] n_cache_reuse는 n_keep과 다른 하한(256 vs 512) — 별도 구조분해
    const { n_keep, n_cache_reuse } = kvOffsetTracker.getBaseOnlyOffsets(this._loadedNCtx);
    await this.context.completion({
      messages:      [{ role: 'user' as const, content: text }],
      n_predict:     0,
      temperature:   1.0,
      top_p:         1.0,
      cache_prompt:  true,
      n_keep,
      n_cache_reuse,
      kv_unified: true,
      flash_attn_type: 'off',
    }).catch((e: unknown) =>
      logger.warn('[LlamaEngine] prefillCoreOnly 실패 (무시):', e),
    );
  }

  /**
   * 특정 캐릭터 전용 슬롯에서 대화를 생성.
   * 내부적으로 charId → slotId 변환 후 generate() 호출.
   */
  async generateForCharacter(
    charId: number,
    messages: ChatMessage[],
    options: Omit<GenerateOptions, 'charId'> = {},
  ): Promise<string> {
    return this.generate(messages, { ...options, charId });
  }

  // ── 공통 sampling params 빌드 ────────────────────────────────────────────
  // _doGenerate / _doGenerateWithTools / _generateSlot에서 공통 사용
  // ✅ [v7] 추가된 파라미터: DRY, XTC, top_n_sigma, dynatemp, presence_penalty, samplers
  private _buildSamplingParams(options: GenerateOptions, isToolCall = false): Record<string, unknown> {
    const {
      temperature = 1.0,
      topP        = 0.95,
      topK        = 40,
      minP        = 0.05,
      typicalP    = 1.0,
      frequencyPenalty = 0.0,
      presencePenalty  = 0.0,
      repeatPenalty,
      repeatLastN,
      dryMultiplier,
      dryBase          = RP_DRY_PARAMS.dry_base,
      dryAllowedLength = RP_DRY_PARAMS.dry_allowed_length,
      dryPenaltyLastN  = RP_DRY_PARAMS.dry_penalty_last_n,
      xtcProbability,
      xtcThreshold     = 0.1,
      topNSigma        = -1.0,
      seed } = options;

    const topKValue          = Number.isFinite(topK) ? Math.max(1, Math.round(topK)) : 40;
    const minPValue          = Number.isFinite(minP) ? Math.min(Math.max(minP, 0), 1) : 0.05;
    const repeatPenaltyValue = repeatPenalty  ?? (isToolCall ? 1.05 : 1.15);  // [FIX] 1.1 → 1.15: 반복 억제 강화
    const repeatLastNValue   = repeatLastN    ?? (isToolCall ? 0 : 128);       // [FIX] 64 → 128: 더 긴 컨텍스트 반복 체크
    const xtcProbabilityValue = xtcProbability ?? (isToolCall ? 0.0 : 0.1);
    const dryMultiplierValue  = dryMultiplier  ?? (isToolCall ? 0.0 : RP_DRY_PARAMS.dry_multiplier);

    const params: Record<string, unknown> = {
      temperature,
      top_k:              topKValue,
      min_p:              minPValue,
      typical_p:          typicalP,
      top_p:              topP,
      min_keep:           1,
      repeat_penalty:     repeatPenaltyValue,
      repeat_last_n:      repeatLastNValue,
      penalty_repeat:     repeatPenaltyValue,   // 구버전 호환 병기
      penalty_last_n:     repeatLastNValue,      // 구버전 호환 병기
      presence_penalty:   presencePenalty,
      frequency_penalty:  isToolCall ? 0.0 : frequencyPenalty,
      dry_multiplier:     dryMultiplierValue,
      dry_base:           dryBase,
      dry_allowed_length: dryAllowedLength,
      dry_penalty_last_n: isToolCall ? -1 : dryPenaltyLastN,
      dry_sequence_breakers: ['\n', ':', '"', '*'],
      xtc_probability:    xtcProbabilityValue,
      xtc_threshold:      xtcThreshold,
      top_n_sigma:        topNSigma,
      dynatemp_range:     0.0,
      dynatemp_exponent:  1.0,
      samplers: isToolCall ? [...DEFAULT_SAMPLERS_TOOL] : [...DEFAULT_SAMPLERS_RP] };

    if (seed !== undefined) params.seed = seed;
    return params;
  }

  // ── 핵심 생성 (_doGenerate) ───────────────────────────────────────────────
  private async _doGenerate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    if (!this.context) throw new Error('Model not loaded');

    const { maxTokens = 400, onToken, charId, resetSuffix, onStreamReset } = options;
    const myGenId = ++this.generationId;
    this.setState('generating');
    this.lastCompletionMeta = null;

    // [DEBUG] 생성 시작 로깅
    const userMessage = messages.find(m => m.role === 'user');
    console.log('[LlamaEngine] 생성 시작:', {
      generationId: myGenId,
      messageCount: messages.length,
      maxTokens,
      charId,
      resetSuffix,
      userContentLength: userMessage?.content?.length || 0,
      userContentPreview: userMessage?.content?.substring(0, 150) + (userMessage?.content && userMessage.content.length > 150 ? '...' : ''),
      timestamp: new Date().toISOString(),
    });

    // ── [v6] suffix 삭제 처리 ────────────────────────────────────────────
    if (resetSuffix && charId !== undefined) {
      await prefixKVManager.resetCharacterSuffix(charId).catch(e =>
        logger.warn('[LlamaEngine] suffix reset failed (ignored):', e),
      );
    }

    // ── [v6] 캐릭터 슬롯 결정 ───────────────────────────────────────────
    // charId 없으면 기본 캐릭터 전용 슬롯 → slot 0
    // id_slot = 최신 llama.cpp 공식 슬롯 지정 파라미터
    const assignedSlot = charId !== undefined
      ? prefixKVManager.getSlotForCharacter(charId)
      : 0;

    // ── 생성 타임아웃 (기기 RAM 티어별 동적 타임아웃) ─────────────────────
    const timeoutMs = this._getGenerationTimeoutMs();
    this._generationStartTime = Date.now(); // [BUG FIX #25] 시작 시간 기록
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // [BUG FIX #18] timeoutPromise에 빈 .catch() 연결 — Promise.race 완료 후
    // setTimeout이 발화하면 unhandled rejection이 발생하는 것을 방지.
    // clearTimeout이 먼저 실행되면 reject는 호출되지 않으므로 정상 경로엔 영향 없음.
    // [BUG FIX] _timeoutReject 데드 코드 제거 — 생성만 되고 외부에서 호출되지 않는
    //   불필요한 객체였음. reject는 setTimeout 콜백에서만 호출되므로 별도 참조 불필요.
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`[LlamaEngine] generation timeout (${timeoutMs / 1000}s) - auto-cancelled`));
      }, timeoutMs);
    });
    // unhandled rejection 방지 — race가 먼저 완료되면 이 catch가 timeout reject를 흡수
    timeoutPromise.catch(() => {});

    // [FIX] DeviceProfiler nPredict 상한 적용 → 저사양 기기 OOM 방지
    // [BUG-19 FIX] getCachedProfile()이 null이면 동기적으로 measure()를 시도해
    // 4GB 미만 기기에서 256 상한이 누락되는 엣지케이스를 방지.
    let _p = deviceProfiler.getCachedProfile();
    if (!_p) {
      try { _p = await deviceProfiler.measure(); } catch { /* fallback below */ }
    }
    const profileNPredict = _p ? (_p.totalMB < 4096 ? 256 : 400) : 400;
    // options.maxTokens가 명시된 경우에도 저사양 기기 상한(profileNPredict)을 적용해 OOM 방지
    const requestedMaxTokens = options.maxTokens !== undefined ? options.maxTokens : maxTokens;
    const effectiveMaxTokens = Math.min(requestedMaxTokens, profileNPredict);
    // ✅ [FIX] 요청 토큰이 기기 상한보다 클 때 호출자에게 명시적 경고
    // 이전: 조용히 truncate → 호출자가 응답이 잘린 이유를 알 수 없음
    if (requestedMaxTokens > profileNPredict) {
      logger.warn(
        `[LlamaEngine] maxTokens 요청(${requestedMaxTokens}) > 기기 상한(${profileNPredict}) ?? ${profileNPredict}로 제한. ` +
        `RAM: ${_p?.totalMB ?? '?'}MB`,
      );
    }

    const normalizedLogitBias = await this._buildNormalizedLogitBias(options);

    const speculativeParams = options.disableSpeculativeDecoding
      ? {}
      : {
          spec_type:            'ngram-map-k',
          'speculative.n_max':   16,
          'speculative.n_min':    3,
          'speculative.p_min':   0.1,
        };

    const resolvedStops = this._mergeStopSequences(
      options.stopSequences,
      false,
      options.suppressDefaultStopSequences === true,
    );

    const completionParams: LlamaCompletionParams = {
      messages,
      n_predict:       effectiveMaxTokens,
      ...this._buildSamplingParams(options),
      ...(normalizedLogitBias ? { logit_bias: normalizedLogitBias } : {}),
      ...speculativeParams,
      grammar:          resolveCompletionGrammar(options, this.RP_GRAMMAR),
      // ✅ [v6] cache_prompt 명시
      cache_prompt:     true,
      // ✅ [v6] id_slot: 최신 llama.cpp 공식 슬롯 지정 파라미터
      id_slot:          assignedSlot,
      slot_id:          assignedSlot,   // 구버전 호환 병기
      // ── 핵심 메커니즘: 정밀한 n_keep / n_cache_reuse ─────────────────────
      // n_keep = baseEnd → rolling window에서 Base 레이어를 절대 버리지 않음
      // n_cache_reuse = chapterEnd → Base+Chapter 이상이면 공통 prefix로 KV 재사용
      ...kvOffsetTracker.getCompletionOffsets(),
      // ✅ [v7] n_discard: context shift 시 auto(0) → llama.cpp에서 알아서 결정
      n_discard:        0,
      // ✅ [v7] reasoning_format: RP 모드에서 "none" 고정 (비추론 모드)
      reasoning_format:      'none',
      // ✅ [v8] b7779 서버 기본값으로 확인된 파라미터
      reasoning_in_content:  false,
      thinking_forced_open:  false,
      // ✅ [v8] timings_per_token: 완료 후 tokPerSec 업데이트에 사용
      timings_per_token: true,
      // ⛔ 절대 변경 금지: kv_unified = true (OpenCL session load/save 필수)
      // [KV REUSE FIX] kv_unified를 항상 전달 (HTP 여부 무관)
      // llama.rn b8095 기준: flash_attn=OFF(KV_VERSION=8)으로 로드된 session.bin 사용 시
      // completion params에 kv_unified가 없으면 엔진이 unified KV buffer 기대 상태와 불일치 → 재평가 강제
      kv_unified: true,
      // ⛔ 절대 변경 금지: flash_attn_type = 'off' (OpenCL session load/save 필수)
      // [BUG FIX] GPU 백엔드면 무조건 flash_attn_type: 'off' 전달
      // Android OpenCL 환경에서 session 로드 시 필수 (llama.rn 공식 문서)
      // 수정: backend !== 'CPU'면 무조건 전달 (prefillOnly/prefillCoreOnly와 일관성 유지)
      ...(this.backendInfo?.backend !== 'CPU' && { flash_attn_type: 'off' }),
      ...(resolvedStops.length > 0 ? { stop: resolvedStops } : {}) };

    // _usedTokens 업데이트 헬퍼
    const updateUsedTokens = (r: CompletionResult) => {
      const promptTokens    = r.tokens_evaluated ?? r.timings?.prompt_n ?? 0;
      const predictedTokens = r.tokens_predicted ?? r.timings?.predicted_n ?? 0;
      // [BUG-001 FIX] tokens_cached 포함: 실제 KV 점유 = cached + evaluated + predicted
      // 이전: evaluated + predicted 만 더함 → KV 사용량 과소 추정 → OOM 경고 지연
      const cachedTokens    = r.tokens_cached ?? 0;
      const nCtxCap = this._loadedNCtx > 0 ? this._loadedNCtx : 8192;
      this._usedTokens = Math.min(cachedTokens + promptTokens + predictedTokens, nCtxCap);
      // [BUG FIX #30] OOM_WARNING 발송 — 정의되어 있지만 어디서도 emit하지 않았던 dead code 수정
      // KV 사용률 85% 초과 시 UI에 경고 전파 (쓰로틀링/softReset 트리거용)
      if (nCtxCap > 0 && this._usedTokens / nCtxCap >= 0.85) {
        const profile = deviceProfiler.getCachedProfile();
        if (profile) {
          engineBus.emitOomWarning(profile.availMB, profile.totalMB);
        }
      }
    };

    // [DEBUG] completion params 로깅
    const completionOffsets = kvOffsetTracker.getCompletionOffsets();
    console.log('[LlamaEngine] 🔍 KV offsets:', completionOffsets);
    logger.log('[LlamaEngine] completion params:', {
      n_predict: completionParams.n_predict,
      grammar: completionParams.grammar ? 'enabled' : 'disabled',
      spec_type: completionParams.spec_type,
      kv_unified: (completionParams as Record<string, unknown>).kv_unified,
      flash_attn_type: (completionParams as Record<string, unknown>).flash_attn_type,
      useHTP: this.backendInfo?.useHTP,
      n_keep: completionParams.n_keep,
      n_cache_reuse: completionParams.n_cache_reuse,
    });
    
    // [DEBUG] 프롬프트 내용 출력 (KV 일치 검증용)
    console.log('[LlamaEngine] 🔍 ========== 프롬프트 검증 ==========');
    console.log('[LlamaEngine] 🔍 메시지 수:', completionParams.messages.length);
    if (completionParams.messages.length > 0) {
      const systemMsg = completionParams.messages[0];
      console.log('[LlamaEngine] 🔍 시스템 프롬프트 길이:', systemMsg.content?.length || 0);
      console.log('[LlamaEngine] 🔍 시스템 프롬프트 처음 200자:');
      console.log(systemMsg.content?.substring(0, 200) || '');
      console.log('[LlamaEngine] 🔍 시스템 프롬프트 마지막 200자:');
      console.log(systemMsg.content?.substring(Math.max(0, (systemMsg.content?.length || 0) - 200)) || '');
    }
    if (completionParams.messages.length > 1) {
      const userMsg = completionParams.messages[completionParams.messages.length - 1];
      console.log('[LlamaEngine] 🔍 유저 메시지 길이:', userMsg.content?.length || 0);
      console.log('[LlamaEngine] 🔍 유저 메시지 내용:');
      console.log(userMsg.content || '');
    }
    console.log('[LlamaEngine] 🔍 ========================================');
    
    console.log('[LlamaEngine] 🔍 Full completionParams:', JSON.stringify(completionParams, null, 2));

    // [BUG FIX A] 'full'을 try 블록 바깥으로 끌어올림.
    // 기존: let full = ''가 if(onToken) 블록 안에 선언되어 catch에서 참조 불가 → ReferenceError.
    // grammar fallback의 catch 블록이 full = ''로 버퍼를 초기화해야 하므로 상위 스코프 필요.
    let full = '';
    try {
      let result: string;
      logger.log('[LlamaEngine] Starting completion call...');
      console.log('[LlamaEngine] 🔍 ========== COMPLETION 디버깅 시작 ==========');
      console.log('[LlamaEngine] 🔍 context 객체 존재:', !!this.context);
      console.log('[LlamaEngine] 🔍 context.completion 함수 존재:', !!this.context?.completion);
      console.log('[LlamaEngine] 🔍 context.completion 타입:', typeof this.context?.completion);
      console.log('[LlamaEngine] 🔍 onToken 콜백 존재:', !!onToken);
      console.log('[LlamaEngine] 🔍 completionParams 메시지 수:', completionParams.messages?.length);
      console.log('[LlamaEngine] 🔍 n_predict:', completionParams.n_predict);
      console.log('[LlamaEngine] 🔍 n_keep:', completionParams.n_keep);
      console.log('[LlamaEngine] 🔍 n_cache_reuse:', completionParams.n_cache_reuse);
      console.log('[LlamaEngine] 🔍 현재 _usedTokens:', this._usedTokens);
      console.log('[LlamaEngine] 🔍 현재 _loadedNCtx:', this._loadedNCtx);
      const expectedPrefixTokens = kvOffsetTracker.chapterEnd > 0
        ? kvOffsetTracker.chapterEnd
        : kvOffsetTracker.baseEnd;
      console.log(
        '[LlamaEngine] 🔍 KV prefix 적재율:',
        expectedPrefixTokens > 0
          ? `${(Math.min(this._usedTokens, expectedPrefixTokens) / expectedPrefixTokens * 100).toFixed(1)}%`
          : 'N/A',
        `(${this._usedTokens}/${expectedPrefixTokens || 0})`,
      );
      console.log(
        '[LlamaEngine] 🔍 KV ctx 사용률:',
        this._loadedNCtx > 0 ? `${(this._usedTokens / this._loadedNCtx * 100).toFixed(1)}%` : 'N/A',
        `(${this._usedTokens}/${this._loadedNCtx || 0})`,
      );
      console.log('[LlamaEngine] 🔍 grammar 활성화:', !!completionParams.grammar);
      console.log('[LlamaEngine] 🔍 kv_unified:', (completionParams as any).kv_unified);
      console.log('[LlamaEngine] 🔍 flash_attn_type:', (completionParams as any).flash_attn_type);
      console.log('[LlamaEngine] 🔍 ========================================');
      
      if (onToken) {
        console.log('[LlamaEngine] 🔍 스트리밍 모드로 completion 호출 시작...');
        console.log('[LlamaEngine] 🔍 this.context.completion 호출 직전');
        
        let tokenCount = 0;
        let firstTokenTime: number | null = null;
        const startTime = Date.now();
        
        const completionPromise = this.context.completion(
          completionParams,
          (d: { token: string }) => {
            tokenCount++;
            if (tokenCount === 1) {
              firstTokenTime = Date.now();
              console.log('[LlamaEngine] 🟢 첫 토큰 수신! 지연시간:', firstTokenTime - startTime, 'ms');
              console.log('[LlamaEngine] 🟢 첫 토큰 내용:', JSON.stringify(d.token.substring(0, 100)));
            }
            if (tokenCount % 10 === 0) {
              console.log(`[LlamaEngine] 🔵 토큰 ${tokenCount}개 수신됨`);
            }
            full += d.token; 
            onToken(d.token); 
          },
        );
        
        console.log('[LlamaEngine] 🔍 completion Promise 생성 완료, Promise.race 시작...');
        console.log('[LlamaEngine] 🔍 타임아웃 설정:', timeoutMs, 'ms');
        
        const r = await Promise.race([
          completionPromise,
          timeoutPromise,
        ]) as CompletionResult;
        
        const totalTime = Date.now() - startTime;
        console.log('[LlamaEngine] 🟢 스트리밍 completion 완료');
        console.log('[LlamaEngine] 🟢 총 토큰 수:', tokenCount);
        console.log('[LlamaEngine] 🟢 총 소요 시간:', totalTime, 'ms');
        console.log('[LlamaEngine] 🟢 결과 길이:', full.length);
        
        const streamedResult = full.trim().length > 0 ? full : (r.text ?? '');
        if (!full && streamedResult) {
          logger.warn('[LlamaEngine] stream callback returned no tokens; using completion text fallback');
        }
        result = streamedResult;
        this._updateCompletionMeta(r);
        updateUsedTokens(r);
      } else {
        console.log('[LlamaEngine] 🔍 비스트리밍 모드로 completion 호출 시작...');
        const completionPromise = this.context.completion(completionParams as unknown as import('../../types/llama.types').LlamaCompletionParams);
        console.log('[LlamaEngine] 🔍 Promise.race 시작 (completion vs timeout)...');
        const r = await Promise.race([
          completionPromise,
          timeoutPromise,
        ]) as CompletionResult;
        console.log('[LlamaEngine] 🟢 비스트리밍 completion 완료');
        result = r.text ?? '';
        this._updateCompletionMeta(r);
        updateUsedTokens(r);
      }
      if (myGenId === this.generationId) this.setState('ready');
      
      // [DEBUG] 생성 완료 로깅
      console.log('[LlamaEngine] 🟢 생성 완료:', {
        generationId: myGenId,
        finishReason: this.lastCompletionMeta?.finishReason ?? 'unknown',
        resultLength: result.length,
        tokensEvaluated: this.lastCompletionMeta?.tokensEvaluated ?? 0,
        tokensCached: this.lastCompletionMeta?.tokensCached ?? 0,
        tokensPredicted: this.lastCompletionMeta?.tokensPredicted ?? 0,
        kvUsedTokens: this.getUsedTokens(),
        kvContextSize: this.getNCtx(),
        kvRatio: this.getNCtx() > 0 ? (this.getUsedTokens() / this.getNCtx()).toFixed(3) : 'N/A',
        kvCacheReuse: `${this.lastCompletionMeta?.tokensCached ?? 0}/${this.lastCompletionMeta?.tokensEvaluated ?? 0}`,
        contextFull: this.lastCompletionMeta?.contextFull ?? false,
        interrupted: this.lastCompletionMeta?.interrupted ?? false,
        stopWord: this.lastCompletionMeta?.stopWord ?? null,
        resultPreview: result.substring(0, 200) + (result.length > 200 ? '...' : ''),
        timestamp: new Date().toISOString(),
      });
      
      return result;
    } catch (e) {
      // ── 타임아웃/grammar fallback 처리 ────────────────────────────────
      console.log('[LlamaEngine] ❌ completion 에러 발생:', e);
      console.log('[LlamaEngine] ❌ 에러 타입:', typeof e);
      console.log('[LlamaEngine] ❌ 에러 메시지:', e instanceof Error ? e.message : String(e));
      console.log('[LlamaEngine] ❌ 에러 스택:', e instanceof Error ? e.stack : 'N/A');
      
      if (e instanceof Error && e.message.includes('timeout')) {
        console.log('[LlamaEngine] ⏱️ 타임아웃 감지 — 생성 중단 처리');
        logger.warn('[LlamaEngine]', e.message);
        await this._stopCompletionSafely('timeout recovery');
        if (myGenId === this.generationId) this.setState('error');
        throw e;
      }

      // ✅ [FIX #1] RP_GRAMMAR 실패 시 grammar 제거 후 재시도
      const isGrammarError =
        e instanceof Error &&
        GRAMMAR_ERROR_PATTERNS.some(p => e.message.toLowerCase().includes(p));

      // ✅ [BUG FIX] 무한 재귀/재시도 방지 플래그 검사
      if (isGrammarError && !options._grammarFallbackAttempted && this.context && myGenId === this.generationId) {
        logger.warn('[LlamaEngine] grammar 오류 → grammar 비활성화 후 재시도.', e);
        // [BUG FIX #18] grammar fallback 진입 즉시 원본 timeoutId 해제
        // fallback이 성공해도 원본 타이머가 살아있어 완료 후 _stopCompletionSafely가 호출될 수 있음
        if (timeoutId !== undefined) { clearTimeout(timeoutId); timeoutId = undefined; }
        // [BUG FIX #1] grammar fallback 진입 전 호출자의 streamingBuf를 초기화.
        // 첫 번째 시도에서 이미 onToken으로 전달된 토큰이 두 번째 스트림과 이중 출력되는 것을 방지.
        // The caller should clear any buffered streamed tokens from onStreamReset().
        if (onStreamReset) onStreamReset();
        full = '';
        await Promise.resolve(); // Allow React state to flush
        // ✅ [FIX #1] grammar 제거 + 포맷 힌트 강화 메시지 목록 구성
        const reinforcedMessages: ChatMessage[] = [...messages];
        let lastTargetIdx = -1;
        for (let i = reinforcedMessages.length - 1; i >= 0; i--) {
          if (reinforcedMessages[i].role === 'user' || reinforcedMessages[i].role === 'system') {
            lastTargetIdx = i;
            break;
          }
        }
        const reminderText = '\n\n[CRITICAL FORMAT REMINDER — MANDATORY]\n' +
              'Output ONLY in this exact format. No exceptions:\n' +
              '  Narrator : 0: text #action# *thought*\n' +
              '  Character: N: text #action# *thought*  (N = character ID >= 2)\n' +
              '  Story Log: [L: location] [N: state] [Ev: event]  <- ABSOLUTE LAST LINE\n' +
              'NEVER output plain text. ALWAYS end with Story Log line.';
        
        if (lastTargetIdx !== -1) {
          reinforcedMessages[lastTargetIdx] = {
            ...reinforcedMessages[lastTargetIdx],
            content: reinforcedMessages[lastTargetIdx].content + reminderText,
          };
        } else {
          reinforcedMessages.push({ role: 'system' as const, content: reminderText.trim() });
        }
        const fallbackParams = { ...completionParams, grammar: undefined, messages: reinforcedMessages };

        // ✅ [FIX #25] grammar fallback 타임아웃: 남은 시간의 50% 적용 (최소 15s)
        const elapsed = Date.now() - this._generationStartTime;
        const remaining = Math.max(0, timeoutMs - elapsed);
        const fallbackTimeoutMs = Math.max(15_000, remaining * 0.5);
        let fallbackTimeoutIdInternal: ReturnType<typeof setTimeout> | undefined;
        const fallbackTimeoutPromise = new Promise<never>((_, reject) => {
          fallbackTimeoutIdInternal = setTimeout(() => {
            reject(new Error(`[LlamaEngine] grammar fallback timeout (${fallbackTimeoutMs / 1000}s) - auto-cancelled`));
          }, fallbackTimeoutMs);
        });
        // [BUG FIX] fallbackTimeoutPromise unhandled rejection 방지
        fallbackTimeoutPromise.catch(() => {});

        try {
          let fallbackResult = '';
          let fallbackResponse: CompletionResult | null = null;
          if (onToken) {
            let _fallbackFull = '';
            fallbackResponse = await Promise.race([
              this.context.completion(
                fallbackParams,
                (d: { token: string }) => { _fallbackFull += d.token; onToken(d.token); },
              ),
              fallbackTimeoutPromise,
            ]) as CompletionResult;
            fallbackResult = _fallbackFull.trim().length > 0
              ? _fallbackFull
              : (fallbackResponse?.text ?? '');
            if (!_fallbackFull && fallbackResult) {
              logger.warn('[LlamaEngine] grammar fallback stream returned no tokens; using completion text fallback');
            }
          } else {
            // [BUG FIX] await 중 this.context가 null이 될 수 있으므로 확인
            if (!this.context || myGenId !== this.generationId) {
              if (myGenId === this.generationId) this.setState('ready');
              return '';
            }
            fallbackResponse = await Promise.race([
              this.context.completion(fallbackParams),
              fallbackTimeoutPromise,
            ]) as CompletionResult;
            // [BUG FIX] grammar fallback에서 this.context null 확인
            if (!this.context || myGenId !== this.generationId) {
              if (myGenId === this.generationId) this.setState('ready');
              return '';
            }
            fallbackResult = fallbackResponse?.text ?? '';
          }
          this._updateCompletionMeta(fallbackResponse ?? null);
          if (fallbackResponse) {
            const nCtxCap = this._loadedNCtx > 0 ? this._loadedNCtx : 8192;
            const promptTokens    = fallbackResponse.tokens_evaluated ?? fallbackResponse.timings?.prompt_n ?? 0;
            const predictedTokens = fallbackResponse.tokens_predicted ?? fallbackResponse.timings?.predicted_n ?? 0;
            const cachedTokens    = fallbackResponse.tokens_cached ?? 0;
            this._usedTokens = Math.min(cachedTokens + promptTokens + predictedTokens, nCtxCap);
            // [BUG FIX] grammar fallback에서도 85% OOM 경고 발송
            if (nCtxCap > 0 && this._usedTokens / nCtxCap >= 0.85) {
              const profile = deviceProfiler.getCachedProfile();
              if (profile) engineBus.emitOomWarning(profile.availMB, profile.totalMB);
            }
          }
          if (myGenId === this.generationId) this.setState('ready');
          return fallbackResult;
        } catch (fallbackErr) {
          if (fallbackErr instanceof Error && fallbackErr.message.includes('timeout')) {
            logger.warn('[LlamaEngine] grammar fallback timeout ?? 원본 에러로 재처리');
            await this._stopCompletionSafely('timeout recovery');
          } else {
            logger.error('[LlamaEngine] grammar fallback 재시도 실패:', fallbackErr);
          }
          if (myGenId === this.generationId) this.setState('error');
          throw fallbackErr;
        } finally {
          if (fallbackTimeoutIdInternal !== undefined) clearTimeout(fallbackTimeoutIdInternal);
        }
      }

      if (myGenId === this.generationId) this.setState('error');
      throw e;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  // ── Tool Call 지원 [v7] ──────────────────────────────────────────────────
  // use_jinja: true (기본 설정)로 Jinja 템플릿 엔진 활성화 → 모델 특화 대화 포맷 적용
  // function calling 형식으로 응답.
  /**
   * Tool Call 형식 생성
   * @param messages  대화 메시지 목록
   * @param tools     사용할 도구 목록
   * @param options   생성 옵션
   * @returns         { text, toolCalls } — toolCalls에 파싱된 도구 호출 결과
   */
  async generateWithTools(
    messages: ChatMessage[],
    tools:    RPTool[],
    options:  GenerateOptions = {},
  ): Promise<{ text: string; toolCalls: RPToolCall[] }> {
    if (!this.context) throw new Error('Model not loaded');
    // ✅ [FIX #7] 큐잉 처리
    return this._enqueue(() => this._doGenerateWithTools(messages, tools, options));
  }

  private async _doGenerateWithTools(
    messages: ChatMessage[],
    tools:    RPTool[],
    options:  GenerateOptions = {},
  ): Promise<{ text: string; toolCalls: RPToolCall[] }> {
    if (!this.context) throw new Error('Model not loaded');

    const { maxTokens = 400 } = options;
    const myGenId = ++this.generationId;
    this.setState('generating');
    this.lastCompletionMeta = null;

    // [BUG FIX] generateWithTools에 profileNPredict RAM 상한 적용 누락
    // _doGenerate에는 저사양 기기(<4GB) OOM 방지를 위해 profileNPredict 상한이 있지만
    // generateWithTools에는 동일한 처리가 없어 고부하 tool call 시 OOM 가능.
    // 수정: _doGenerate와 동일한 로직 적용.
    const _p = deviceProfiler.getCachedProfile() ?? await deviceProfiler.measure().catch(() => null);
    const _ptProfileNPredict = _p ? (_p.totalMB < 4096 ? 256 : 400) : 400;
    const _ptEffectiveMaxTokens = Math.min(maxTokens, _ptProfileNPredict);
    if (maxTokens > _ptProfileNPredict) {
      logger.warn(
        `[LlamaEngine] generateWithTools maxTokens(${maxTokens}) > 기기 상한(${_ptProfileNPredict}) ?? ${_ptProfileNPredict}로 제한.`,
      );
    }

    // ✅ [FIX #6] _doGenerate와 동일한 동적 타임아웃 적용
    const timeoutMs = this._getGenerationTimeoutMs();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`[LlamaEngine] generateWithTools timeout (${timeoutMs / 1000}s) - auto-cancelled`));
      }, timeoutMs);
    });
    // [BUG FIX] _doGenerate와 달리 .catch(() => {}) 누락
    // Promise.race가 먼저 완료된 뒤 timeout이 발화하면 unhandled rejection 발생.
    timeoutPromise.catch(() => {});

    try {
      const { onToken } = options;
      let streamedFull = '';
      // ── streaming tool call 오염 방지 ──────────────────────────────────
      // 모델이 <tool_call>{...}</tool_call> 블록을 생성할 때 해당 토큰을
      // UI 스트림에 그대로 흘리면 채팅창에 JSON이 표시됨.
      // in-tool-call 구간 토큰은 누적(streamedFull)은 하되 onToken에는 전달 안 함.
      let inToolCall = false;
      const TC_OPEN  = '<tool_call>';
      const TC_CLOSE = '</tool_call>';
      let tcBuf = '';
      const normalizedLogitBias = await this._buildNormalizedLogitBias(options);
      const tokenCallback = onToken
        ? (d: { token: string }) => {
            const tok = d.token;
            streamedFull += tok;
            
            // ✅ [FIX #44] tcBuf 개선: 최근 32바이트만 유지해 부분 태그 탐지 + 무한 누적 방지(2KB 상한)
            tcBuf += tok;
            if (tcBuf.length > 2048) {
              // character-safe slice from end for multibyte strings
              const chars = Array.from(tcBuf);
              tcBuf = chars.slice(-1024).join(''); 
            }

            if (!inToolCall && tcBuf.includes(TC_OPEN)) {
              inToolCall = true;
            }
            if (inToolCall && tcBuf.includes(TC_CLOSE)) {
              inToolCall = false;
              tcBuf = '';
              return;
            }
            // TC_OPEN을 기다리는 중(!inToolCall)일 때: 
            // 현재 버퍼가 TC_OPEN의 접두사이면 UI 전송을 보류하고 더 모음.
            // 접두사가 아니면 확실히 텍스트이므로 UI로 흘림.
            if (!inToolCall) {
              if (TC_OPEN.startsWith(tcBuf) || tcBuf.includes(TC_OPEN)) {
                // <tool_ 까지만 받은 경우 등: 누적 계속
              } else {
                tcBuf = '';
                onToken(tok);
              }
            }
          }
        : undefined;

      const r = await Promise.race([
        this.context.completion({
          messages,
          n_predict:        _ptEffectiveMaxTokens,
          ...this._buildSamplingParams(options, /* isToolCall */ true),
          ...(normalizedLogitBias ? { logit_bias: normalizedLogitBias } : {}),
          spec_type:            'ngram-map-k',
          'speculative.n_max':   16,
          'speculative.n_min':    3,
          'speculative.p_min':   0.1,
          cache_prompt:     true,
          id_slot:          0,
          slot_id:          0,
          ...kvOffsetTracker.getCompletionOffsets(),
          n_discard:        0,
          reasoning_format:      'none',
          reasoning_in_content:  false,
          thinking_forced_open:  false,
          timings_per_token:     true,
          stop:             this._mergeStopSequences(options.stopSequences, true),
          tools:            tools as unknown,
          tool_choice:      tools.length > 0 ? 'auto' : 'none' } as LlamaCompletionParams, tokenCallback),
        timeoutPromise,
      ]) as CompletionResult;

      this._updateCompletionMeta(r);
      const nCtxCap         = this._loadedNCtx > 0 ? this._loadedNCtx : 8192;
      const promptTokens    = r.tokens_evaluated ?? r.timings?.prompt_n ?? 0;
      const predictedTokens = r.tokens_predicted ?? r.timings?.predicted_n ?? 0;
      // [BUG-001 FIX] tokens_cached 포함 (_doGenerate와 동일 원칙)
      const cachedTokens    = r.tokens_cached ?? 0;
      this._usedTokens = Math.min(cachedTokens + promptTokens + predictedTokens, nCtxCap);

      // [BUG FIX] generateWithTools에 OOM 경고 발송 누락 수정.
      // _doGenerate에는 85% 초과 시 emitOomWarning이 있으나 generateWithTools에는 없었음.
      // 동일하게 적용해 툴콜 세션에서도 OOM 경고가 발송되도록.
      if (nCtxCap > 0 && this._usedTokens / nCtxCap >= 0.85) {
        const profile = deviceProfiler.getCachedProfile();
        if (profile) {
          engineBus.emitOomWarning(profile.availMB, profile.totalMB);
        }
      }

      const raw: string = tokenCallback ? streamedFull : (r.text ?? '');
      return { text: raw, toolCalls: parseToolCalls(raw) };

    } catch (e) {
      if (e instanceof Error && e.message.includes('timeout')) {
        logger.warn('[LlamaEngine]', e.message);
        await this._stopCompletionSafely('timeout recovery');
        // timeout은 엔진을 error 상태로 전환 (재시도 필요)
        if (myGenId === this.generationId) this.setState('error');
      } else {
        logger.warn('[LlamaEngine] generateWithTools 실패:', e);
        // [BUG FIX] non-timeout 오류 시 setState('error') 누락
        // _doGenerate catch 블록에서는 myGenId 비교 후 setState('error')를 호출하지만
        // generateWithTools catch에서는 누락 → 오류 후에도 'generating' 상태로 남아
        // 다음 호출이 '이미 생성 중' 판정을 받아 영구 잠금됨.
        if (myGenId === this.generationId) this.setState('error');
      }
      throw e;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      // ✅ [FIX] 'generating' 상태에서만 'ready'로 복귀 — catch에서 setState('error')와 중복 방지
      if (myGenId === this.generationId && this.state === 'generating') {
        this.setState('ready');
      }
    }
  }

  // ── 생성 제어 ─────────────────────────────────────────────────────────────

  async stopGeneration(): Promise<void> {
    if (this.context && this.state === 'generating') {
      // [BUG FIX #9] generationId를 먼저 증가시켜 _doGenerate catch의 myGenId 비교를 무력화
      // 이전: stopCompletion → completion reject → _doGenerate catch(myGenId===genId) setState('error')
      //       AND stopGeneration(genId===stoppedGenId) setState('ready') → 이중 setState
      // 수정: stop 전에 generationId 증가 → _doGenerate의 myGenId !== generationId
      //       → _doGenerate catch가 setState 스킵 → stopGeneration만 'ready'로 전환
      const stoppedGenId = ++this.generationId;
      await this.context.stopCompletion?.();
      if (this.generationId === stoppedGenId && this.state === 'generating') {
        this.setState('ready');
      }
    }
  }

  /**
   * 'error' 상태에서 'idle'로 복귀 (UI 재시작 버튼에서 호출)
   * load()로 재시작 없이 상태만 초기화.
   */
  resetError(): void {
    if (this.state === 'error') this.setState('idle');
  }

  // ── Soft Reset (부분 재초기화) ─────────────────────────────────────────
  // 모델 Weights(RAM/VRAM)는 유지하고 KV Cache만 초기화 → 메모리 압박 해소
  // OOM / 적응형 요약 트리거 시 호출 — 모델 재로드 없이 진행 가능 → 빠름
  /**
   * KV Cache를 부분 초기화 (모델 유지).
   * @param recentMessages  재초기화 후 이어받을 최근 메시지 2~3턴 (권장)
   */
  async softReset(recentMessages: ChatMessage[] = []): Promise<void> {
    if (!this.context) return;
    // ✅ [FIX] softReset을 _enqueue로 직렬화
    // 이전: softReset이 _enqueue 밖에서 실행 → 큐에 대기 중인 generate()와 KV 상태 경쟁
    //   시나리오: 생성 완료 → softReset fire-and-forget 시작 → 다음 generate()가
    //             큐에서 즉시 실행 → softReset의 KV flush + re-prefill과 동시 실행
    //             → KV 상태 오염 → 다음 응답 품질 저하 / 크래시
    // 수정: _enqueue로 래핑 → 이전 작업 완료 후 softReset 실행 보장
    return this._enqueue(() => this._doSoftReset(recentMessages));
  }

  private async _doSoftReset(recentMessages: ChatMessage[]): Promise<void> {
    if (!this.context) return;
    // ✅ [FIX #4] 생성 중 호출 요청 시 먼저 정지 후 softReset 수행
    // _enqueue 안에서도 state 확인 (enqueue 진입 전 외부에서 stopGeneration 됐을 수 있음)
    if (this.state === 'generating') {
      logger.log('[LlamaEngine] softReset: stopping active generation before soft reset');
      await this.stopGeneration();
    }
    // [BUG FIX] stopGeneration() await 후 release()가 끼어들어 context가 null이 될 수 있음
    if (!this.context) {
      logger.warn('[LlamaEngine] softReset: context released during stopGeneration — 중단');
      return;
    }
    this.setState('warming');
    // [BUG FIX] emitSoftReset() 미호출 수정
    // engineBus.emitSoftReset이 정의됐지만 어디서도 호출되지 않아 UI가 softReset 시작을 모름.
    // emitSoftResetDone()만 있고 시작 이벤트 없이 UI 오버레이 표시 불가.
    engineBus.emitSoftReset();
    try {
      const ctx = this.context as LlamaContextExtended;
      if (typeof ctx.resetKVCache === 'function') {
        await ctx.resetKVCache();
        logger.log('[LlamaEngine] softReset: resetKVCache() 완료');
      } else if (typeof ctx.clearKVCache === 'function') {
        await ctx.clearKVCache();
        logger.log('[LlamaEngine] softReset: clearKVCache() 완료');
      } else {
        // [BUG FIX] n_predict:0, cache_prompt:false는 기존 KV를 실제로 지우지 않음.
        // cache_prompt:false는 새 토큰을 KV에 추가하지 않을 뿐이며 기존 KV는 그대로 남음.
        // resetKVCache/clearKVCache가 없는 llama.rn 버전이라면 실제 flush가 불가능하므로
        // 경고를 남기고 re-prefill에서 n_keep/n_cache_reuse로 덮어씌우는 방식으로 fallback.
        // 모델을 완전히 재로드하는 것이 유일한 확실한 해결책이지만 성능 비용이 크므로
        // recentMessages re-prefill로 최대한 KV 상태를 정상화한다.
        logger.warn(
          '[LlamaEngine] softReset: resetKVCache/clearKVCache 미지원 — ' +
          'KV가 실제로 비워지지 않음. re-prefill로 KV 상태 정상화 시도.',
        );
        // 생성 없이 현재 KV를 무효화 신호: stopCompletion이 있으면 먼저 호출
        await this._stopCompletionSafely('softReset fallback flush');
      }

      // → 최근 메시지 re-prefill → 이어받아 복원
      if (recentMessages.length > 0) {
        // ── 핵심 메커니즘: softReset re-prefill에서 Base+Chapter 레이어 보존
        const softResetOffsets = kvOffsetTracker.getCompletionOffsets();
        try {
          await this.context.completion({
            messages:         recentMessages,
            n_predict:        0,
            temperature:      1.0,
            top_p:            1.0,
            cache_prompt:     true,
            ...softResetOffsets,
            n_discard:        0,
            reasoning_format: 'none' });
          // [BUG-23 FIX] re-prefill 성공 확인 후에만 _usedTokens를 chapterEnd 기준으로 설정.
          // 이전: KV flush 직후 re-prefill 전에 세팅 → re-prefill 실패 시 KV는 비어있지만
          //       _usedTokens는 chapterEnd를 가리켜 OnDeviceSummarizer가 매 턴 요약 트리거.
          this._usedTokens = kvOffsetTracker.chapterEnd > 0
            ? kvOffsetTracker.chapterEnd
            : kvOffsetTracker.baseEnd;
        } catch (e) {
          logger.warn('[LlamaEngine] softReset re-prefill 실패 (무시):', e);
          // re-prefill 실패: KV는 flush된 상태이므로 _usedTokens=0으로 유지
          this._usedTokens = 0;
        }
      } else {
        // re-prefill 없음: KV flush 완료 — _usedTokens를 baseEnd로 설정
        // [BUG-26 FIX] 이전: _usedTokens=0 → KV에 n_keep으로 보존된 Base 레이어 무시
        //              → OnDeviceSummarizer가 KV 사용량을 0으로 오판 → 요약 트리거 지연
        // 수정: resetKVCache 후에도 n_keep으로 Base 레이어는 보존되므로 baseEnd 기준으로 설정
        // [BUG FIX #5] 이전: chapterEnd로 설정 → KV는 비었는데 사용량 과대 → 요약 조기 트리거
        this._usedTokens = kvOffsetTracker.baseEnd > 0 ? kvOffsetTracker.baseEnd : 0;
      }

      this.setState('ready');
      engineBus.emitSoftResetDone();
      logger.log('[LlamaEngine] softReset 완료 (모델 유지, KV 초기화)');

    } catch (e) {
      logger.error('[LlamaEngine] softReset 실패:', e);
      engineBus.emitSoftResetDone();  // UI 오버레이는 에러 후에도 반드시 해제
      // ✅ [FIX] 소프트 리셋 실패 시 error 상태로 전환
      this.setState('error');
    }
  }

  // ── KV 세션 ───────────────────────────────────────────────────────────────
  async saveSession(path: string): Promise<void> {
    if (!this.context) return;
    // [BUG FIX #10] saveSession을 _enqueue로 직렬화
    // [BUG FIX] this.context! 비안전 non-null 단언 → 큐 실행 시점에 context가 해제될 수 있음
    // 외부 if(!this.context) 체크 후 _enqueue 람다가 실행되기까지 release()가 개입 가능.
    // 수정: 람다 내부에서도 null 체크 수행 → context 없으면 조용히 skip.
    return this._enqueue(() => {
      if (!this.context) return Promise.resolve();
      return this.context.saveSession(path);
    });
  }

  async loadSession(path: string): Promise<void> {
    if (!this.context) return;
    return this._enqueue(async () => {
      if (!this.context) return Promise.resolve();
      
      // ✅ [DEBUG] 로그 파일 저장 시작 - 앱 외부 저장소 (파일 탐색기 접근 가능)
      const RNFS = require('../../utils/fileSystemCompat').default;
      const debugDir = `${RNFS.ExternalDirectoryPath}/debug_logs`;
      await RNFS.mkdir(debugDir).catch(() => {}); // 폴더 없으면 생성
      const debugLogPath = `${debugDir}/loadSession_debug.txt`;
      const debugLogs: string[] = [];
      const addLog = (msg: string) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${msg}`;
        debugLogs.push(logLine);
        logger.log(msg);
      };
      
      addLog('[LlamaEngine] 📝 로그 저장 경로: ' + debugLogPath);
      
      addLog('[LlamaEngine] 🔍 loadSession 시작 —— 파일: ' + path);
      addLog('[LlamaEngine] 🔍 현재 _usedTokens: ' + this._usedTokens);
      addLog('[LlamaEngine] 🔍 현재 state: ' + this.state);
      
      try {
        addLog('[LlamaEngine] 🔍 context.loadSession() 네이티브 호출 시작...');
        addLog('[LlamaEngine] 🔍 파일 경로: ' + path);
        addLog('[LlamaEngine] 🔍 현재 백엔드: ' + JSON.stringify(this.backendInfo));
        
        const startTime = Date.now();
        
        // ✅ [BUG FIX] loadSession 타임아웃 추가 (30초)
        // 네이티브 레이어에서 무한 대기하는 경우 방지
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('loadSession timeout (30s)')), 30000);
        });
        
        addLog('[LlamaEngine] 🔍 Promise.race 시작 (loadSession vs timeout)...');
        
        try {
          await Promise.race([
            this.context.loadSession(path),
            timeoutPromise,
          ]);
        } catch (timeoutError) {
          addLog('[LlamaEngine] ❌ loadSession 타임아웃 또는 실패: ' + timeoutError);
          
          // 타임아웃 발생 시 base.bin 삭제하고 재생성 필요
          const RNFS = require('../../utils/fileSystemCompat').default;
          await RNFS.unlink(path).catch(() => {});
          addLog('[LlamaEngine] 🗑️ 손상된 base.bin 삭제 완료');
          
          throw new Error('loadSession timeout - base.bin may be corrupted');
        }
        
        const elapsed = Date.now() - startTime;
        addLog(`[LlamaEngine] ✅ context.loadSession() 완료 (${elapsed}ms)`);
        
        // ✅ [BUG FIX] getLoadedTokens가 구현되지 않았으므로 kvOffsetTracker에서 복원
        // 네이티브 모듈에 getLoadedTokens() 구현 전까지 임시 해결책
        const loadedTokens = (this.context as any).getLoadedTokens?.();
        addLog('[LlamaEngine] 🔍 getLoadedTokens() 결과: ' + loadedTokens);
        
        if (loadedTokens !== undefined && loadedTokens > 0) {
          this._usedTokens = loadedTokens;
          addLog('[LlamaEngine] 🔍 네이티브에서 토큰 수 복원: ' + loadedTokens);
        } else {
          // kvOffsetTracker에서 baseEnd를 가져와서 설정
          // (KVStateManager.loadBase에서 loadOffsets 호출 후 이 값이 설정됨)
          const baseEnd = kvOffsetTracker.baseEnd;
          addLog('[LlamaEngine] 🔍 kvOffsetTracker.baseEnd: ' + baseEnd);
          
          if (baseEnd > 0) {
            this._usedTokens = baseEnd;
            addLog('[LlamaEngine] 🔍 kvOffsetTracker에서 토큰 수 복원: ' + baseEnd);
          } else {
            addLog('[LlamaEngine] ⚠️ 토큰 수 복원 실패 — baseEnd=0, _usedTokens 유지: ' + this._usedTokens);
          }
        }
        addLog('[LlamaEngine] 🔍 최종 _usedTokens: ' + this._usedTokens);
        
        // ✅ [DEBUG] 로그 파일 저장
        await RNFS.writeFile(debugLogPath, debugLogs.join('\n'), 'utf8');
        logger.log('[LlamaEngine] 📝 디버그 로그 저장됨: ' + debugLogPath);
        
        // 공유 가능한 위치에도 복사
        const publicPath = '/storage/emulated/0/Download/loadSession_debug.txt';
        await RNFS.writeFile(publicPath, debugLogs.join('\n'), 'utf8').catch(() => {});
        logger.log('[LlamaEngine] 📝 공개 로그 저장됨: ' + publicPath);
        
      } catch (error) {
        addLog('[LlamaEngine] ❌ loadSession 실패: ' + error);
        addLog('[LlamaEngine] ❌ 에러 타입: ' + typeof error);
        addLog('[LlamaEngine] ❌ 에러 메시지: ' + (error instanceof Error ? error.message : String(error)));
        addLog('[LlamaEngine] ❌ 에러 스택: ' + (error instanceof Error ? error.stack : 'N/A'));
        
        // 에러 발생 시에도 로그 저장
        await RNFS.writeFile(debugLogPath, debugLogs.join('\n'), 'utf8').catch(() => {});
        logger.log('[LlamaEngine] 📝 에러 로그 저장됨: ' + debugLogPath);
        
        throw error;
      }
    });
  }

  // ── 내부: initLlama 3단계 fallback ─────────────────────────────────────
  // ⚠️ 경고: 아래 KV 파라미터는 절대 변경 금지! ⚠️
  // 
  // KV 파라미터 추천값 및 호환 설명 (kv-spec.txt 와 백엔드 일치 필요):
  //  ⛔ type_k = 'q8_0' (kv-spec: cache_type_k = q8_0) - 전 백엔드 통일
  //  ⛔ type_v = 'f16' (kv-spec: cache_type_v = f16) - 서버 base.bin과 일치
  //  ⛔ flash_attn = false (Android OpenCL 환경 필수)
  //  ⛔ n_ctx, n_batch, n_ubatch: 모델별 고정값 (변경 시 KV 포맷 불일치)
  //
  // 변경 시 영향:
  //  - 서버 R2의 모든 base.bin / chapter.bin 무효화
  //  - loadSession() 실패 → 앱 크래시
  //  - KV_VERSION 올리고 전체 재생성 필요
  //
  // GPU 우선 시도, 실패 시 CPU fallback (일부 기기 호환성)
  private async _initWithFallback(
    modelPath:    string,
    nCtx:         number,
    nBatch:       number,
    nUbatch:      number,
    nThreads:     number,
    nGpuLayers:   number,
    useHTP:       boolean,
    isOpenCLOnly: boolean,
    useMlock:     boolean,
    nKeep:        number,
    ropeFreqBase: number,
    nParallel:    number,   // RAM-tier-derived parallel KV slots
    onSuccess:    (usedLayers: number, devices: string[]) => void,
  ): Promise<LlamaContextExtended> {
    // type_k/type_v: [KV SPEC] 서버 base.bin과 반드시 일치해야 loadSession() 성공
    const kvTypeK = KV_CACHE_TYPE_K;  // kv-spec-constants.KV_CACHE_TYPE_K
    const kvTypeV = KV_CACHE_TYPE_V;  // kv-spec-constants.KV_CACHE_TYPE_V
    const half = nGpuLayers > 0 ? Math.floor(nGpuLayers / 2) : 0;

    // ✅ [FIX] nGpuLayers === 0 일 때 CPU 시도에서 GPU0 레이블 추가 버그 방지
    // nGpuLayers !== 0인 경우만 GPU 시도를 포함 → CPU 전용 기기에서는 GPU 시도 없이 CPU만 실행
    const attempts = [
      ...(nGpuLayers !== 0
        ? [{ l: nGpuLayers, label: nGpuLayers === -1 ? 'GPU전체' : `GPU${nGpuLayers}` }]
        : []),
      ...(half > 0 ? [{ l: half, label: `GPU절반(${half})` }] : []),
      { l: 0, label: 'CPU' },
    ].filter((a, i, arr) => arr.findIndex(x => x.l === a.l) === i);

    let lastErr: unknown;
    for (const { l, label } of attempts) {
      try {
        const htpLabel    = useHTP ? '+HTP' : '';
        const openclLabel = isOpenCLOnly && !useHTP ? '+OpenCL' : '';
        const backendDesc = `${label}${htpLabel}${openclLabel}`;
        logger.log(
          `[LlamaEngine] initLlama 시도: ${backendDesc} ` +
          `(ctx=${nCtx} ubatch=${nUbatch} typeK=${kvTypeK} nKeep=${nKeep})`,
        );

        // n_threads_batch: GPU/HTP면 decode=2 고정, CPU면 nThreads*2
        // [FIX #52] (useHTP && l !== 0) || l > 0 은 l=0인 CPU fallback 시도에서도 
        // l=0 || useHTP=true 에 의해 GPU 경로로 분기되는 버그 수정
        // [BUG FIX] l !== 0으로 변경하여 GPU 전체 시도(l=-1) 시에도 올바르게 분기
        const nThreadsBatch =
          l !== 0
            ? Math.min(4, nThreads * 2)
            : Math.min(nThreads * 2, 8);

        // ✅ [DEBUG] 메모리 사용량 체크 (initLlama 전)
        try {
          const ramInfo = await deviceProfiler.measure();
          const usedMB = ramInfo.totalMB - ramInfo.availMB;
          const usagePct = ramInfo.totalMB > 0 ? Math.round((usedMB / ramInfo.totalMB) * 100) : 0;
          logger.log(`[LlamaEngine] 🔍 [initLlama 전] RAM: 사용=${usedMB}MB / 가용=${ramInfo.availMB}MB / 전체=${ramInfo.totalMB}MB (${usagePct}% 사용 중)`);
          
          // 메모리 부족 경고
          if (ramInfo.availMB < 2048) {
            logger.warn(`[LlamaEngine] ⚠️ 가용 RAM 부족 (${ramInfo.availMB}MB) - 모델 로드 실패 가능성 높음`);
          }
        } catch (e) {
          logger.warn('[LlamaEngine] 🔍 [initLlama 전] RAM 측정 실패:', e);
        }

        // GPU 사용 설정 (HTP는 명시적으로 devices에 추가해야만 사용됨)
        // [FIX] devices 파라미터 제거 - llama.rn이 n_gpu_layers 기반으로 자동 선택하게 함
        // 명시적 ['GPUOpenCL'] 지정 시 OpenCL 초기화 실패 → SIGSEGV 크래시 발생
        //
        // ⚠️ 경고: 아래 initParams의 KV 관련 설정은 절대 변경 금지! ⚠️
        // n_ctx, n_batch, n_ubatch, type_k, type_v, flash_attn, kv_unified, flash_attn_type
        // 변경 시 서버 KV 파일과 호환 불가 → loadSession() 실패 → 앱 크래시
        const initParams = {
          model:           modelPath,
          use_mmap:        true,
          use_mlock:       useMlock,
          // ⛔ 절대 변경 금지: n_ctx (모델별 고정값, KV 포맷 결정)
          n_ctx:           nCtx,
          // ⛔ 절대 변경 금지: n_batch (2048 고정, kv-spec.txt 일치 필요)
          n_batch:         nBatch,
          // ⛔ 절대 변경 금지: n_ubatch (2048 고정, kv-spec.txt 일치 필요)
          n_ubatch:        nUbatch,
          n_threads:       nThreads,
          n_threads_batch: nThreadsBatch,
          n_gpu_layers:    l,
          n_keep:          nKeep,
          n_parallel:      nParallel,
          // ⛔ 절대 변경 금지: flash_attn = false (Android OpenCL 필수)
          flash_attn:      false,
          ctx_shift:       true,
          rope_freq_base:  ropeFreqBase,
          // ⛔ 절대 변경 금지: kv_unified = true (OpenCL session load/save 필수)
          kv_unified:      true,
          // ⛔ 절대 변경 금지: flash_attn_type = 'off' (OpenCL session load/save 필수)
          flash_attn_type: 'off',
        };
        
        logger.log(`[LlamaEngine] 🔍 initLlama 전체 파라미터:`);
        logger.log(`[LlamaEngine] 🔍   model: ${initParams.model}`);
        logger.log(`[LlamaEngine] 🔍   n_ctx: ${initParams.n_ctx}, n_batch: ${initParams.n_batch}, n_ubatch: ${initParams.n_ubatch}`);
        logger.log(`[LlamaEngine] 🔍   n_threads: ${initParams.n_threads}, n_threads_batch: ${initParams.n_threads_batch}`);
        logger.log(`[LlamaEngine] 🔍   n_gpu_layers: ${initParams.n_gpu_layers}, n_parallel: ${initParams.n_parallel}`);
        logger.log(`[LlamaEngine] 🔍   n_keep: ${initParams.n_keep}, rope_freq_base: ${initParams.rope_freq_base}`);
        logger.log(`[LlamaEngine] 🔍   flash_attn: ${initParams.flash_attn}`);
        logger.log(`[LlamaEngine] 🔍   kv_unified: ${initParams.kv_unified}, flash_attn_type: ${initParams.flash_attn_type}`);
        logger.log(`[LlamaEngine] 🔍   ctx_shift: ${initParams.ctx_shift}`);
        logger.log(`[LlamaEngine] 🔍   use_mmap: ${initParams.use_mmap}, use_mlock: ${initParams.use_mlock}`);
        logger.log(`[LlamaEngine] 🔍 initLlama 네이티브 호출 시작...`);
        
        const ctx = await initLlama(initParams as any);

        logger.log(`[LlamaEngine] 🔍 initLlama 네이티브 호출 완료`);
        
        // [DEBUG] ctx 객체 전체 구조 확인
        logger.log(`[LlamaEngine] 🔍 ctx 객체 키:`, Object.keys(ctx));
        logger.log(`[LlamaEngine] 🔍 ctx.gpu:`, (ctx as any).gpu);
        logger.log(`[LlamaEngine] 🔍 ctx.devices:`, (ctx as any).devices);
        logger.log(`[LlamaEngine] 🔍 ctx.reasonNoGPU:`, (ctx as any).reasonNoGPU);
        
        // ✅ [DEBUG] 메모리 사용량 체크 (initLlama 후)
        try {
          const ramInfo = await deviceProfiler.measure();
          const usedMB = ramInfo.totalMB - ramInfo.availMB;
          const usagePct = ramInfo.totalMB > 0 ? Math.round((usedMB / ramInfo.totalMB) * 100) : 0;
          logger.log(`[LlamaEngine] 🔍 [initLlama 후] RAM: avail=${ramInfo.availMB}MB / total=${ramInfo.totalMB}MB (${usagePct}% 사용 중)`);
        } catch (e) {
          logger.warn('[LlamaEngine] 🔍 [initLlama 후] RAM 측정 실패:', e);
        }
        
        // [DEBUG] 초기화 설정 확인
        logger.log(`[LlamaEngine] useHTP=${useHTP}, l=${l}`);

        const devices = (ctx as unknown as LlamaContextExtended).devices ?? [];
        logger.log(`[LlamaEngine] initLlama 성공: ${backendDesc} (devices: ${devices.join(', ')})`);
        
        // GPU 요청했는데 devices가 비어있으면 경고
        if (l !== 0 && devices.length === 0) {
          logger.error(`[LlamaEngine] ❌ GPU 요청했으나 devices 비어있음!`);
          logger.error(`[LlamaEngine] ❌ n_gpu_layers=${l}, useHTP=${useHTP}, isOpenCLOnly=${isOpenCLOnly}`);
          logger.error(`[LlamaEngine] ❌ 기기가 GPU/OpenCL을 지원하지 않거나 드라이버 문제일 수 있음`);
          
          // GPU 실패로 간주하고 다음 시도로
          throw new Error('GPU requested but no devices found');
        }
        
        onSuccess(l, devices);
        return ctx as unknown as LlamaContextExtended;
      } catch (e) {
        lastErr = e;
        logger.error(`[LlamaEngine] ❌ ${label} 초기화 실패:`, e);
        logger.error(`[LlamaEngine] ❌ 에러 타입: ${typeof e}`);
        logger.error(`[LlamaEngine] ❌ 에러 메시지: ${e instanceof Error ? e.message : String(e)}`);
        logger.error(`[LlamaEngine] ❌ 에러 스택: ${e instanceof Error ? e.stack : 'N/A'}`);
        
        // GPU 실패 시 상세 정보
        if (l !== 0) {
          logger.error(`[LlamaEngine] ❌ GPU 초기화 실패 상세:`);
          logger.error(`[LlamaEngine] ❌   n_gpu_layers: ${l}`);
          logger.error(`[LlamaEngine] ❌   useHTP: ${useHTP}`);
          logger.error(`[LlamaEngine] ❌   isOpenCLOnly: ${isOpenCLOnly}`);
          logger.error(`[LlamaEngine] ❌   type_k: ${kvTypeK}, type_v: ${kvTypeV}`);
        }
        
        logger.warn(`[LlamaEngine] ${label} 초기화 실패 (다음 시도가 있을 수 있음)`);
      }
    }
    this.setState('error');
    const finalErrorMessage = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '모든 시도 실패');
    throw new Error(`[LlamaEngine] 모든 초기화 시도가 실패했습니다: ${finalErrorMessage}`);
  }

}

let _llamaInstance: LlamaEngine | null = null;
function getLlamaInstance(): LlamaEngine {
  if (!_llamaInstance) _llamaInstance = new LlamaEngine();
  return _llamaInstance;
}
const _methodCache = new WeakMap<LlamaEngine, Record<string | symbol, any>>();

export const llamaEngine = new Proxy({} as LlamaEngine, {
  get(_t, prop) {
    const instance = getLlamaInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      let cache = _methodCache.get(instance);
      if (!cache) {
        cache = {};
        _methodCache.set(instance, cache);
      }
      if (!cache[prop]) {
        cache[prop] = value.bind(instance);
      }
      return cache[prop];
    }
    return value;
  },
  set(_t, prop, value) {
    (getLlamaInstance() as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  } });
export default llamaEngine;

// RPTool, RPToolCall, parseToolCalls → src/core/llama/ToolCallHandler.ts 로 위임
export { parseToolCalls as _parseToolCalls } from './ToolCallHandler'; // ✅ 구버전 호환
