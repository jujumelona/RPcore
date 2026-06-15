import { MODELS } from '../../models/ModelConfig';
import { RAMChecker, calcModelRunMemory, type RAMInfo } from '../../utils/RAMChecker';
import modelDownloader from '../llama/ModelDownloader';

export const INTERACTIVE_MODEL_ID = 'gemma-3-1b-qat';
export const REASONING_MODEL_ID = 'gemma-3n-e2b-reasoning';
export const EMERGENCY_MODEL_ID = 'gemma-3-270m';

export type ModelPressure = 'normal' | 'warning' | 'critical';
export type RoutingIntent =
  | 'startup'
  | 'interactive'
  | 'recovery'
  | 'reasoning_assist'
  | 'emergency';

export interface ModelRouteInput {
  requestedModelId?: string | null;
  downloadedModelIds?: string[];
  ramInfo?: RAMInfo | null;
}

export interface ModelRouteDecision {
  requestedModelId: string | null;
  selectedModelId: string;
  downloadedModelIds: string[];
  ramInfo: RAMInfo | null;
  pressure: ModelPressure;
  reason: string;
}

function toAvailableSet(downloadedModelIds: string[]): Set<string> {
  return new Set(downloadedModelIds.filter(Boolean));
}

function getPressure(ramInfo: RAMInfo | null): ModelPressure {
  if (!ramInfo) return 'normal';
  if (ramInfo.availableRAM < 1800) return 'critical';
  if (ramInfo.availableRAM < 2600) return 'warning';
  return 'normal';
}

function canUseReasoning(ramInfo: RAMInfo | null, pressure: ModelPressure): boolean {
  if (!ramInfo) return true;
  if (pressure !== 'normal') return false;

  // RAMChecker 기준 가용 메모리 확인
  const required = calcModelRunMemory(REASONING_MODEL_ID);
  return ramInfo.availableRAM >= required.totalMB;
}

function canUseInteractive(ramInfo: RAMInfo | null): boolean {
  if (!ramInfo) return true;
  const required = calcModelRunMemory(INTERACTIVE_MODEL_ID);
  return ramInfo.availableRAM >= required.totalMB;
}

function chooseFirstAvailable(available: Set<string>, fallbackId: string): string {
  for (const model of MODELS) {
    if (available.has(model.id)) return model.id;
  }
  return fallbackId;
}

export function decideInteractiveModelRoute(input: ModelRouteInput = {}): ModelRouteDecision {
  const requestedModelId = input.requestedModelId ?? null;
  const downloadedModelIds = [...(input.downloadedModelIds ?? [])];
  const available = toAvailableSet(downloadedModelIds);
  const ramInfo = input.ramInfo ?? null;
  const pressure = getPressure(ramInfo);

  if (requestedModelId && available.has(requestedModelId)) {
    if (requestedModelId === EMERGENCY_MODEL_ID) {
      return {
        requestedModelId,
        selectedModelId: EMERGENCY_MODEL_ID,
        downloadedModelIds,
        ramInfo,
        pressure,
        reason: 'explicit 270M selection' };
    }

    if (requestedModelId === INTERACTIVE_MODEL_ID && canUseInteractive(ramInfo)) {
      return {
        requestedModelId,
        selectedModelId: INTERACTIVE_MODEL_ID,
        downloadedModelIds,
        ramInfo,
        pressure,
        reason: 'explicit 1B selection' };
    }

    if (requestedModelId === REASONING_MODEL_ID && canUseReasoning(ramInfo, pressure)) {
      return {
        requestedModelId,
        selectedModelId: REASONING_MODEL_ID,
        downloadedModelIds,
        ramInfo,
        pressure,
        reason: 'explicit reasoning selection on capable device' };
    }
  }

  if (pressure === 'critical' && available.has(EMERGENCY_MODEL_ID)) {
    return {
      requestedModelId,
      selectedModelId: EMERGENCY_MODEL_ID,
      downloadedModelIds,
      ramInfo,
      pressure,
      reason: requestedModelId && requestedModelId !== EMERGENCY_MODEL_ID
        ? `critical memory pressure — requested "${requestedModelId}" is unavailable, fell back to emergency model`
        : 'critical memory pressure fallback' };
  }

  if (available.has(INTERACTIVE_MODEL_ID) && canUseInteractive(ramInfo)) {
    return {
      requestedModelId,
      selectedModelId: INTERACTIVE_MODEL_ID,
      downloadedModelIds,
      ramInfo,
      pressure,
      reason: requestedModelId && requestedModelId !== INTERACTIVE_MODEL_ID
        ? `requested "${requestedModelId}" not available or not suitable — fell back to interactive 1B default`
        : 'balanced interactive 1B default' };
  }

  if (available.has(REASONING_MODEL_ID) && canUseReasoning(ramInfo, pressure)) {
    return {
      requestedModelId,
      selectedModelId: REASONING_MODEL_ID,
      downloadedModelIds,
      ramInfo,
      pressure,
      reason: requestedModelId && requestedModelId !== REASONING_MODEL_ID
        ? `requested "${requestedModelId}" not available — fell back to reasoning model`
        : 'reasoning fallback when 1B is unavailable' };
  }

  if (available.has(EMERGENCY_MODEL_ID)) {
    return {
      requestedModelId,
      selectedModelId: EMERGENCY_MODEL_ID,
      downloadedModelIds,
      ramInfo,
      pressure,
      reason: requestedModelId && requestedModelId !== EMERGENCY_MODEL_ID
        ? `requested "${requestedModelId}" not available — fell back to emergency model`
        : 'low-end or low-memory fallback' };
  }

  return {
    requestedModelId,
    selectedModelId: chooseFirstAvailable(available, INTERACTIVE_MODEL_ID),
    downloadedModelIds,
    ramInfo,
    pressure,
    reason: requestedModelId
      ? `requested "${requestedModelId}" not available — using best available downloaded model`
      : 'best available downloaded model' };
}

export function decideReasoningAssistRoute(input: ModelRouteInput = {}): ModelRouteDecision {
  const requestedModelId = input.requestedModelId ?? null;
  const downloadedModelIds = [...(input.downloadedModelIds ?? [])];
  const available = toAvailableSet(downloadedModelIds);
  const ramInfo = input.ramInfo ?? null;
  const pressure = getPressure(ramInfo);

  if (available.has(REASONING_MODEL_ID) && canUseReasoning(ramInfo, pressure)) {
    return {
      requestedModelId,
      selectedModelId: REASONING_MODEL_ID,
      downloadedModelIds,
      ramInfo,
      pressure,
      reason: 'reasoning assist on capable device' };
  }

  return decideInteractiveModelRoute(input);
}

export async function getDownloadedModelIds(): Promise<string[]> {
  const checks = await Promise.all(
    MODELS.map(async model => ({
      modelId: model.id,
      exists: await modelDownloader.isModelDownloaded(model.id) })),
  );

  return checks.filter(check => check.exists).map(check => check.modelId);
}

async function buildRoute(
  intent: RoutingIntent,
  requestedModelId: string | null = null,
): Promise<ModelRouteDecision> {
  const [downloadedModelIds, ramInfo] = await Promise.all([
    getDownloadedModelIds(),
    RAMChecker.getInstance().check().catch(() => null),
  ]);

  const input: ModelRouteInput = { requestedModelId, downloadedModelIds, ramInfo };
  let decision: ModelRouteDecision;

  if (intent === 'reasoning_assist') {
    decision = decideReasoningAssistRoute(input);
  } else {
    decision = decideInteractiveModelRoute(input);
  }

  if (
    requestedModelId &&
    decision.selectedModelId !== requestedModelId
  ) {
    console.warn(
      `[ModelRouter] 요청 모델 "${requestedModelId}" 대신 ` +
      `"${decision.selectedModelId}"로 폴백됨. 사유: ${decision.reason}`,
    );
  }

  return decision;
}

export async function resolveInteractiveModelPreference(
  requestedModelId: string | null = null,
): Promise<ModelRouteDecision> {
  return buildRoute('interactive', requestedModelId);
}

export async function resolveReasoningAssistPreference(
  requestedModelId: string | null = null,
): Promise<ModelRouteDecision> {
  return buildRoute('reasoning_assist', requestedModelId);
}

export function isEmergencyModel(modelId: string | null | undefined): boolean {
  return modelId === EMERGENCY_MODEL_ID;
}

export function shouldPreferEmergencyModel(ramInfo: RAMInfo | null): boolean {
  return getPressure(ramInfo) === 'critical';
}