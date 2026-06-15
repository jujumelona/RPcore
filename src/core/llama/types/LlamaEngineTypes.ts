// src/core/llama/types/LlamaEngineTypes.ts
// LlamaEngine type definitions for the modularized helpers.

export interface LlamaCompletionParams {
  messages: Array<{ role: string; content: string }>;
  n_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  min_keep?: number;
  cache_prompt?: boolean;

  // KV slot control
  id_slot?: number;
  slot_id?: number;
  n_cache_reuse?: number;

  stop?: string[];
}

export interface LlamaGenerationOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  repeat_last_n?: number;
  n_predict?: number;
  stop?: string[];
}

export interface LlamaModelInfo {
  id: string;
  name: string;
  size: number;
  quantization: string;
  context_length: number;
  embedding_length?: number;
  feed_forward_length?: number;
  attention_head_count?: number;
  block_count?: number;
  use_parallel_residual?: boolean;
}

export interface LlamaContextOptions {
  n_ctx: number;
  n_batch: number;
  n_ubatch: number;
  n_threads: number;
  n_threads_batch: number;
  use_mlock: boolean;
  use_mmap: boolean;
  embedding: boolean;
  rope_scaling_type?: number;
  yarn_ext_factor?: number;
  yarn_attn_factor?: number;
  yarn_beta_fast?: number;
  yarn_beta_slow?: number;
  yarn_orig_ctx?: number;
}

export interface LlamaSamplingParams {
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  min_keep: number;
  repeat_penalty: number;
  repeat_last_n: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  dry_multiplier?: number;
  dry_base?: number;
  dry_allowed_length?: number;
  xtc_probability?: number;
  xtc_threshold?: number;
  top_n_sigma?: number;
  dynatemp_range?: number;
  dynatemp_exponent?: number;
  seed?: number;
}

export interface LlamaKVSpec {
  cache_type_k: string;
  cache_type_v: string;
  flash_attn: boolean;
  spec_type: string;
  n_ctx: number;
  n_batch: number;
  n_ubatch: number;
}

export interface LlamaEngineConfig {
  modelPath: string;
  contextOptions: LlamaContextOptions;
  samplingParams: LlamaSamplingParams;
  kvSpec: LlamaKVSpec;
  gpuLayers?: number;
  mainGpu?: number;
  tensorSplit?: number[];
}

export interface LlamaEngineState {
  isInitialized: boolean;
  isModelLoaded: boolean;
  currentModel?: string;
  contextSize: number;
  gpuLayers: number;
  backend: string;
  memoryUsage: {
    model: number;
    context: number;
    kvCache: number;
  };
}

export interface LlamaGenerateOptions {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  streamCallback?: (token: string) => void;
  slotId?: number;
  idSlot?: number;
}

export interface LlamaTokenData {
  id: number;
  text: string;
  logprob?: number;
  prob?: number;
}

export interface LlamaGenerationResult {
  text: string;
  tokens: LlamaTokenData[];
  timings: {
    prompt_ms: number;
    prompt_per_token_ms: number;
    generation_ms: number;
    generation_per_token_ms: number;
  };
  stopped_eos: boolean;
  stopped_limit: boolean;
  stopped_word: boolean;
  stopping_word?: string;
}

export interface LlamaContextExtended {
  getContextSize: () => number;
  getGPUVRAMUsed: () => number;
  getRAMUsed: () => number;
  free: () => void;
  saveState: (path: string) => Promise<void>;
  loadState: (path: string) => Promise<void>;
  decode: (tokens: number[]) => string[];
  tokenize: (text: string) => number[];
  generate: (params: LlamaCompletionParams) => Promise<LlamaGenerationResult>;
  generateWithStream: (params: LlamaCompletionParams, callback: (token: string) => void) => Promise<LlamaGenerationResult>;
}
