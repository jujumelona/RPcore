import { REASONING_MODEL_ID } from './ModelRouter';

const DEFAULT_RP_STOP_SEQUENCES = ['<end_of_turn>', '<eos>', '<|im_end|>'] as const;

export interface RpSamplingDefaults {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  topK: number;
  minP: number;
  typicalP: number;
  presencePenalty: number;
  repeatPenalty: number;
  repeatLastN: number;
  dryMultiplier: number;
  dryBase: number;
  dryAllowedLength: number;
  dryPenaltyLastN: number;
  xtcProbability: number;
  xtcThreshold: number;
  topNSigma: number;
  stopSequences: string[];
}

const COMPACT_MODEL_RP_DEFAULTS: RpSamplingDefaults = {
  temperature: 1.1,
  topP: 0.9,
  frequencyPenalty: 0.08,
  topK: 40,
  minP: 0.05,
  typicalP: 1.0,
  presencePenalty: 0.0,
  repeatPenalty: 1.1,
  repeatLastN: 64,
  dryMultiplier: 0.8,
  dryBase: 1.75,
  dryAllowedLength: 2,
  dryPenaltyLastN: -1,
  xtcProbability: 0.1,
  xtcThreshold: 0.1,
  topNSigma: -1.0,
  stopSequences: [...DEFAULT_RP_STOP_SEQUENCES] };

const REASONING_MODEL_RP_DEFAULTS: RpSamplingDefaults = {
  temperature: 1.15,
  topP: 0.92,
  frequencyPenalty: 0.06,
  topK: 40,
  minP: 0.05,
  typicalP: 1.0,
  presencePenalty: 0.0,
  repeatPenalty: 1.1,
  repeatLastN: 64,
  dryMultiplier: 0.8,
  dryBase: 1.75,
  dryAllowedLength: 2,
  dryPenaltyLastN: -1,
  xtcProbability: 0.1,
  xtcThreshold: 0.1,
  topNSigma: -1.0,
  stopSequences: [...DEFAULT_RP_STOP_SEQUENCES] };

export function getRpSamplingDefaults(modelId?: string | null): RpSamplingDefaults {
  const defaults = modelId === REASONING_MODEL_ID
    ? REASONING_MODEL_RP_DEFAULTS
    : COMPACT_MODEL_RP_DEFAULTS;

  return {
    ...defaults,
    stopSequences: [...defaults.stopSequences] };
}

export function resolveRpSamplingOptions(
  modelId?: string | null,
  overrides: Partial<RpSamplingDefaults> = {},
): RpSamplingDefaults {
  const defaults = getRpSamplingDefaults(modelId);
  return {
    temperature: overrides.temperature ?? defaults.temperature,
    topP: overrides.topP ?? defaults.topP,
    frequencyPenalty: overrides.frequencyPenalty ?? defaults.frequencyPenalty,
    topK: overrides.topK ?? defaults.topK,
    minP: overrides.minP ?? defaults.minP,
    typicalP: overrides.typicalP ?? defaults.typicalP,
    presencePenalty: overrides.presencePenalty ?? defaults.presencePenalty,
    repeatPenalty: overrides.repeatPenalty ?? defaults.repeatPenalty,
    repeatLastN: overrides.repeatLastN ?? defaults.repeatLastN,
    dryMultiplier: overrides.dryMultiplier ?? defaults.dryMultiplier,
    dryBase: overrides.dryBase ?? defaults.dryBase,
    dryAllowedLength: overrides.dryAllowedLength ?? defaults.dryAllowedLength,
    dryPenaltyLastN: overrides.dryPenaltyLastN ?? defaults.dryPenaltyLastN,
    xtcProbability: overrides.xtcProbability ?? defaults.xtcProbability,
    xtcThreshold: overrides.xtcThreshold ?? defaults.xtcThreshold,
    topNSigma: overrides.topNSigma ?? defaults.topNSigma,
    stopSequences: overrides.stopSequences ? [...overrides.stopSequences] : [...defaults.stopSequences] };
}

export const MODEL_GENERATION_BUDGET = {
  'gemma-3-270m':           { nPredict: 420, contentBudget: 340 },
  'gemma-3-1b-qat':         { nPredict: 660, contentBudget: 580 },
  'gemma-3n-e2b-reasoning': { nPredict: 960, contentBudget: 880 } } as const;

export type ModelGenerationBudgetKey = keyof typeof MODEL_GENERATION_BUDGET;
export const DEFAULT_N_PREDICT = 420;