// src/core/llama/utils/LlamaEngineUtils.ts
// Shared helpers used by modularized LlamaEngine code.

import { logger } from '../../../utils/logger';
import type { LlamaCompletionParams, LlamaGenerateOptions, LlamaSamplingParams } from '../types/LlamaEngineTypes';

// Optional lazy binding to llama.rn
let _llamaRnLoaded = false;

export function ensureLlamaRn(): void {
  if (_llamaRnLoaded) return;
  _llamaRnLoaded = true;
  try {
    require('llama.rn');
  } catch {
    logger.error('[LlamaEngine] llama.rn not installed');
  }
}

// Convert app-level options to llama.rn completion params
export function convertGenerationOptions(
  options: LlamaGenerateOptions,
): LlamaCompletionParams {
  const params: LlamaCompletionParams = {
    messages: options.messages,
    n_predict: options.maxTokens,
    temperature: options.temperature,
    top_p: options.topP,
    top_k: options.topK,
    cache_prompt: true };

  // Slot selection (prefer id_slot when available)
  if (options.idSlot !== undefined) {
    params.id_slot = options.idSlot;
  } else if (options.slotId !== undefined) {
    params.slot_id = options.slotId;
  }

  if (options.stopSequences && options.stopSequences.length > 0) {
    params.stop = options.stopSequences;
  }

  return params;
}

// Default sampling parameters
export const DEFAULT_SAMPLING_PARAMS: LlamaSamplingParams = {
  temperature: 0.7,
  top_p: 0.95,
  top_k: 40,
  min_p: 0.05,
  min_keep: 1,
  repeat_penalty: 1.1,
  repeat_last_n: 64,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  dry_multiplier: 0.8,
  dry_base: 1.75,
  dry_allowed_length: 2,
  xtc_probability: 0.1,
  xtc_threshold: 0.1,
  top_n_sigma: 0.0,
  dynatemp_range: 0.0,
  dynatemp_exponent: 1.0 };

export function mergeSamplingParams(
  base: LlamaSamplingParams,
  override: Partial<LlamaSamplingParams>,
): LlamaSamplingParams {
  return { ...base, ...override };
}

export function validateMessages(messages: Array<{ role: string; content: string }>): boolean {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  return messages.every(msg =>
    typeof msg === 'object' &&
    typeof msg.role === 'string' &&
    typeof msg.content === 'string' &&
    ['system', 'user', 'assistant'].includes(msg.role),
  );
}

// Rough token estimator (Korean chars count differently)
export function estimateTokens(text: string): number {
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 2 + otherChars / 4);
}

export function calculateMemoryUsage(
  modelSize: number,
  contextSize: number,
  gpuLayers: number,
  kvCacheSize: number = 0,
): {
  model: number;
  context: number;
  kvCache: number;
  total: number;
} {
  const modelMemory = modelSize * (1 - gpuLayers * 0.1);
  const contextMemory = contextSize * 2 * 1024;

  return {
    model: modelMemory,
    context: contextMemory,
    kvCache: kvCacheSize,
    total: modelMemory + contextMemory + kvCacheSize };
}

export class LlamaEngineError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'LlamaEngineError';
  }
}

export class PerformanceMonitor {
  private startTime: number = 0;
  private checkpoints: Map<string, number> = new Map();

  start(): void {
    this.startTime = Date.now();
    this.checkpoints.clear();
  }

  checkpoint(name: string): void {
    this.checkpoints.set(name, Date.now());
  }

  getDuration(from?: string): number {
    const fromTime = from ? this.checkpoints.get(from) || this.startTime : this.startTime;
    return Date.now() - fromTime;
  }

  getCheckpointDuration(name: string): number {
    const checkpointTime = this.checkpoints.get(name);
    if (!checkpointTime) return 0;
    return Date.now() - checkpointTime;
  }

  getReport(): Record<string, number> {
    const report: Record<string, number> = {};
    let prevTime = this.startTime;

    for (const [name, time] of this.checkpoints) {
      report[name] = time - prevTime;
      prevTime = time;
    }

    return report;
  }
}

export function validateSamplingParams(params: Partial<LlamaSamplingParams>): string[] {
  const errors: string[] = [];

  if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }

  if (params.top_p !== undefined && (params.top_p < 0 || params.top_p > 1)) {
    errors.push('Top_p must be between 0 and 1');
  }

  if (params.top_k !== undefined && params.top_k < 0) {
    errors.push('Top_k must be non-negative');
  }

  if (params.repeat_penalty !== undefined && params.repeat_penalty < 0) {
    errors.push('Repeat penalty must be non-negative');
  }

  return errors;
}

export function parseModelInfo(modelPath: string): {
  name: string;
  size: string;
  quantization: string;
} | null {
  try {
    const filename = modelPath.split('/').pop() || modelPath;
    const parts = filename.split('-');

    if (parts.length < 3) return null;

    const quantization = parts[parts.length - 1].replace('.gguf', '');
    const size = parts[parts.length - 2];
    const name = parts.slice(0, -2).join('-');

    return { name, size, quantization };
  } catch {
    return null;
  }
}



