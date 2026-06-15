/* eslint-disable @typescript-eslint/no-unused-vars */
// src/types/llama.types.ts
// ════════════════════════════════════════════════════════════════════
//
//  llama.rn 타입 보강 레이어
//
//  문제: llama.rn 0.11.x의 공개 타입 정의(LlamaContext)가
//        실제 JS 런타임 API를 완전히 커버하지 않아
//        LlamaEngine.ts 전반에 `as any` 캐스팅이 누적됨.
//
//  해결책:
//    1. llama.rn이 공개하지 않는 메서드(stopCompletion, tokenize,
//       resetKVCache, clearKVCache, softReset, gpu, devices 등)를
//       이 파일에 타입으로 선언.
//    2. LlamaEngine.ts의 LlamaContextExtended 인터페이스를 이 파일로 이전.
//    3. 초기화 파라미터(initLlama options)도 여기서 타입 선언.
//
//  향후: llama.rn에 PR 기여 시 이 파일의 타입을 기반으로 작성.
//
// ════════════════════════════════════════════════════════════════════

// ── completion params (llama.rn 공개 타입보다 확장) ──────────────

export interface LlamaCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlamaCompletionTimings {
  predicted_per_second?: number;
  prompt_n?:             number;
  predicted_n?:          number;
}

export interface LlamaCompletionResult {
  text?:            string;
  timings?:         LlamaCompletionTimings;
  truncated?:       boolean;
  stopped_eos?:     boolean;
  stopped_word?:    boolean | string;
  stopped_limit?:   boolean;
  stopping_word?:   string;
  context_full?:    boolean;
  interrupted?:     boolean;
  tokens_cached?:   number;
  tokens_predicted?: number;
  tokens_evaluated?: number;
}

export interface LlamaLoraAdapter {
  path:    string;
  scaled?: number;
}

// ── LlamaContextExtended ─────────────────────────────────────────
//
// llama.rn LlamaContext + 런타임에 존재하지만 타입에 없는 멤버들.
//
// 각 멤버의 출처:
//   completion      — 공개 API (LlamaContext)
//   stopCompletion  — 공개 API (일부 버전에서 누락, 런타임 존재 확인)
//   saveSession     — 공개 API (KV 상태 영속화)
//   loadSession     — 공개 API (KV 상태 복원)
//   resetKVCache    — 런타임 존재, 타입 누락 (llama.rn 0.11.x)
//   clearKVCache    — 런타임 존재, 타입 누락 (일부 버전)
//   tokenize        — 런타임 존재, 타입 누락 (KVOffsetTracker 사용)
//   applyLoraAdapters     — 공개 API (llama.rn 0.11.5 런타임 존재)
//   removeLoraAdapters    — 공개 API (llama.rn 0.11.5 런타임 존재)
//   getLoadedLoraAdapters — 공개 API (llama.rn 0.11.5 런타임 존재)
//   release         — 공개 API
//   gpu             — initLlama 반환 객체 런타임 프로퍼티
//   devices         — initLlama 반환 객체 런타임 프로퍼티
//   reasonNoGPU     — initLlama 반환 객체 런타임 프로퍼티

export interface LlamaContextExtended {
  /** 메인 completion API */
  completion(
    params:   LlamaCompletionParams,
    onToken?: (d: { token: string }) => void,
  ): Promise<LlamaCompletionResult>;

  /** 진행 중인 completion 중단 (llama.rn 0.8+) */
  stopCompletion?(): Promise<void>;

  /** KV 세션 파일로 저장 */
  saveSession(path: string): Promise<void>;

  /** KV 세션 파일에서 복원 */
  loadSession(path: string): Promise<void>;

  /**
   * KV 캐시 전체 초기화 (llama.rn 0.11.x 런타임 존재, 타입 누락).
   * softReset()에서 우선 시도.
   */
  resetKVCache?(): Promise<void>;

  /**
   * KV 캐시 전체 초기화 — 일부 버전의 대체 메서드명.
   * resetKVCache 미존재 시 fallback.
   */
  clearKVCache?(): Promise<void>;

  /**
   * 텍스트 -> 토큰 ID 배열 변환.
   * KVOffsetTracker.measureBase/measureChapter에서 prefix 토큰 수 계산에 사용.
   * @param text    토크나이징할 텍스트
   * @param addBos  BOS 토큰 추가 여부 (기본 false)
   */
  tokenize?(text: string, addBos?: boolean): Promise<{ tokens: number[] }>;

  /** 런타임 LoRA 어댑터 적용/교체 */
  applyLoraAdapters?(loraList: LlamaLoraAdapter[]): Promise<void>;

  /** 현재 적용된 LoRA 어댑터 제거 */
  removeLoraAdapters?(): Promise<void>;

  /** 현재 로드된 LoRA 어댑터 목록 조회 */
  getLoadedLoraAdapters?(): Promise<LlamaLoraAdapter[]>;

  /** 모델 언로드 및 메모리 해제 */
  release(): Promise<void>;

  // ── initLlama 반환 객체 런타임 프로퍼티 ─────────────────────────

  /**
   * GPU/HTP 추론 활성 여부 (llama.rn initLlama 반환값).
   * context.gpu === true -> GPU 레이어 활성.
   */
  gpu?: boolean;

  /**
   * 사용 중인 추론 디바이스 목록 (llama.rn initLlama 반환값).
   * 예: ['HTP0'] -> Qualcomm HTP, ['GPU'] -> Adreno GPU
   */
  devices?: string[];

  /**
   * GPU 사용 불가 시 이유 문자열 (llama.rn initLlama 반환값).
   * GPU fallback -> CPU 전환 시 사용자에게 표시 가능.
   */
  reasonNoGPU?: string;
}

// ── initLlama params ──────────────────────────────────────────────
//
// llama.rn 0.11.x initLlama() 파라미터.
// 공식 타입이 `Parameters<typeof initLlama>[0]`이지만
// 일부 새 파라미터(n_parallel, use_jinja, flash_attn, kv_unified 등)가
// 타입에 누락되어 있어 여기서 완전한 인터페이스를 선언.

export interface LlamaInitParams {
  model:            string;
  use_mmap?:        boolean;
  use_mlock?:       boolean;
  n_ctx:            number;
  n_batch?:         number;
  n_ubatch?:        number;
  n_threads?:       number;
  n_threads_batch?: number;
  n_gpu_layers?:    number;
  n_keep?:          number;
  /** 병렬 KV 슬롯 수 (RAM 티어별 DeviceProfiler가 결정) */
  n_parallel?:      number;
  /** Jinja 템플릿 기반 chat format 활성화 */
  use_jinja?:       boolean;
  /** Flash Attention 활성화 (kv-spec: ON 권장) */
  flash_attn?:      boolean;
  /** KV 캐시 K 타입 ('q8_0' | 'q4_0' | 'f16') */
  type_k?:          string;
  /** KV 캐시 V 타입 ('q4_0' | 'q8_0' | 'f16') */
  type_v?:          string;
  /** context shift(rolling window) 활성화 */
  ctx_shift?:       boolean;
  /** OpenCL 전용 환경에서 unified KV 메모리 사용 */
  kv_unified?:      boolean;
  /** RoPE 기본 주파수 (Gemma-3n: 1M, 1B: 1M, 270m: 10K) */
  rope_freq_base?:  number;
  /** HTP 디바이스 지정 (예: ['HTP0']) */
  devices?:         string[];
  /** 단일 LoRA 경로 */
  lora?:            string;
  /** 단일 LoRA 스케일 */
  lora_scaled?:     number;
  /** 다중 LoRA 어댑터 */
  lora_list?:       LlamaLoraAdapter[];
  [key: string]:    unknown;
}

// ── LlamaCompletionParams ─────────────────────────────────────────
//
// 공개 타입에 없는 v7~v9 파라미터 포함.
// LlamaEngine.ts의 LlamaCompletionParams 인터페이스 단일 소스.

export interface LlamaCompletionParams {
  messages:         LlamaCompletionMessage[];
  n_predict?:       number;
  temperature?:     number;
  top_p?:           number;
  top_k?:           number;
  min_p?:           number;
  min_keep?:        number;
  cache_prompt?:    boolean;
  id_slot?:         number;
  slot_id?:         number;
  n_cache_reuse?:   number;
  n_keep?:          number;
  n_discard?:       number;
  repeat_penalty?:  number;
  repeat_last_n?:   number;
  penalty_repeat?:  number;
  penalty_last_n?:  number;
  presence_penalty?:   number;
  frequency_penalty?:  number;
  dry_multiplier?:      number;
  dry_base?:            number;
  dry_allowed_length?:  number;
  dry_penalty_last_n?:  number;
  dry_sequence_breakers?: string[];
  xtc_probability?:  number;
  xtc_threshold?:    number;
  typical_p?:        number;
  top_n_sigma?:      number;
  dynatemp_range?:   number;
  dynatemp_exponent?: number;
  samplers?:         string[];
  logit_bias?:       Array<[number | string, number | false]>;
  seed?:             number;
  grammar?:          string;
  grammar_lazy?:     boolean;
  stop?:             string[];
  spec_type?:        string;
  'speculative.n_max'?: number;
  'speculative.n_min'?: number;
  'speculative.p_min'?: number;
  reasoning_format?:     string;
  reasoning_in_content?: boolean;
  thinking_forced_open?: boolean;
  timings_per_token?:    boolean;
  tools?:                unknown;
  tool_choice?:          string;
  [key: string]:         unknown;
}
