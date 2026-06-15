/**
 * src/core/llama/constants/LlamaEngineConstants.ts
 * LlamaEngine constants
 */

// RP DRY params
export const DEFAULT_DRY_PARAMS = {
  dry_multiplier: 0.8,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: -1,
  dry_sequence_breakers: ['\n', ':', '"', '*'] } as const;

export const RP_DRY_PARAMS = DEFAULT_DRY_PARAMS;

// Parallel slots
export const DEFAULT_N_PARALLEL_SLOTS = 1;
export const MAX_QUEUE_DEPTH = 5;
export const MAX_LISTENERS = 10;

// Grammar error patterns
export const GRAMMAR_ERROR_PATTERNS = [
  'grammar',
  'parse error',
  'invalid grammar',
  'grammar failed',
] as const;

// Sampler order (b7779)
export const DEFAULT_SAMPLERS_RP = [
  'penalties', 'dry', 'top_k',
  'typ_p', 'top_p', 'min_p', 'xtc', 'temperature',
] as const;

export const DEFAULT_SAMPLERS_TOOL = [
  'penalties', 'top_k', 'top_p', 'min_p', 'temperature',
] as const;
