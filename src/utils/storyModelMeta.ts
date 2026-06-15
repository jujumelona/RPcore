/* eslint-disable @typescript-eslint/no-unused-vars */
import { MODELS } from '../models/ModelConfig';

type TranslationMap = Record<string, string | undefined> | undefined;

export type ModelBadgeTone = 'gold' | 'silver' | 'red' | 'neutral';

export interface ModelBadgeMeta {
  id: string;
  label: string;
  fullLabel: string;
  tone: ModelBadgeTone;
}

function parseStoryConfig(raw: Record<string, unknown>): Record<string, unknown> {
  try {
    if (typeof raw.story_config === 'string') {
      return JSON.parse(raw.story_config) as Record<string, unknown>;
    }
    if (raw.story_config && typeof raw.story_config === 'object') {
      return raw.story_config as Record<string, unknown>;
    }
  } catch { /* ignore */ }
  return {};
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function trimModelSuffix(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function getModelTone(modelId?: string): ModelBadgeTone {
  if (modelId === 'gemma-3n-e2b-reasoning') return 'gold';
  if (modelId === 'gemma-3-1b-qat') return 'silver';
  if (modelId === 'gemma-3-270m') return 'red';
  return 'neutral';
}

function getShortModelLabel(modelId: string, t?: TranslationMap): string {
  if (modelId === 'gemma-3n-e2b-reasoning') {
    return t?.modelTypeReasoning ?? 'Reasoning';
  }
  if (modelId === 'gemma-3-1b-qat') {
    return t?.modelTypeLight ?? 'Light';
  }
  if (modelId === 'gemma-3-270m') {
    return trimModelSuffix(t?.modelNameEmergency ?? 'Emergency');
  }

  const matched = MODELS.find(model => model.id === modelId);
  if (!matched) return modelId;

  return trimModelSuffix(t?.[matched.nameKey] ?? matched.name);
}

function getFullModelLabel(modelId: string, t?: TranslationMap): string {
  const matched = MODELS.find(model => model.id === modelId);
  if (!matched) return modelId;
  return t?.[matched.nameKey] ?? matched.name;
}

export function resolveStoryModelId(raw?: Record<string, unknown> | null): string {
  if (!raw) return '';
  const cfg = parseStoryConfig(raw);
  return pickString(
    raw.started_model_id,
    raw.startedModelId,
    raw.model_id,
    raw.modelId,
    cfg.started_model_id,
    cfg.startedModelId,
    cfg.model_id,
    cfg.modelId,
  );
}

export function getModelBadgeMeta(modelId?: string, t?: TranslationMap): ModelBadgeMeta | null {
  if (!modelId) return null;
  const shortLabel = getShortModelLabel(modelId, t);
  return {
    id: modelId,
    label: shortLabel,
    fullLabel: getFullModelLabel(modelId, t),
    tone: getModelTone(modelId) };
}
