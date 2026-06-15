// src/core/llama/utils/SamplingParamsBuilder.ts
// Sampling parameter builder utilities.

import type { LlamaSamplingParams } from '../types/LlamaEngineTypes';

export function buildSamplingParams(options: {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  minKeep?: number;
  repeatPenalty?: number;
  repeatLastN?: number;
  seed?: number;
}): LlamaSamplingParams {
  return {
    temperature: options.temperature ?? 0.8,
    top_p: options.topP ?? 0.95,
    top_k: options.topK ?? 40,
    min_p: options.minP ?? 0.05,
    min_keep: options.minKeep ?? 0,
    repeat_penalty: options.repeatPenalty ?? 1.1,
    repeat_last_n: options.repeatLastN ?? 64,
    seed: options.seed };
}


