// src/utils/modelUtils.ts
// ──────────────────────────────────────────────────────────────────
// 모델 관련 순수 유틸리티 함수 (React hook 아님 — 스토어·유틸 어디서든 사용 가능)
//
// 기존에 hooks/useActiveModel.ts 안에 plain async function으로 섞여 있던 코드를
// 분리하여 "hook이 아닌 함수를 hooks/ 폴더에서 import" 하는 구조적 혼란을 제거.
//
//  hooks/useActiveModel.ts -> React hook만 유지 (useActiveModel, useModelSwitching)
//  utils/modelUtils.ts     -> 이 파일 (plain 함수: store, ui, utils 어디서든 import 가능)
// ──────────────────────────────────────────────────────────────────

import { appStorage } from './storage';
import { modelDownloader } from '../core/llama/ModelDownloader';
import { MODELS, ModelInfo, DEFAULT_MODEL_ID } from '../models/ModelConfig';
import llamaEngine from '../core/llama/LlamaEngine';
import { hasChatSessionLock, useChatStore } from '../store/chatStore';
import { getDownloadedModelIds as getDownloadedModelIdsSnapshot,
  resolveInteractiveModelPreference } from '../core/ai/ModelRouter';

export const MODEL_SWITCH_LOCK_ERROR = 'MODEL_SWITCH_LOCK_ERROR';
export const MODEL_INSUFFICIENT_RAM_ERROR = 'MODEL_INSUFFICIENT_RAM_ERROR';

const ACTIVE_MODEL_KEY = 'active_model_id';

/** 현재 저장된 활성 모델 ID를 읽어 라우팅 결과로 반환 */
export async function getActiveModelId(): Promise<string> {
  let saved: string | null = null;
  try {
    saved = appStorage.getString(ACTIVE_MODEL_KEY) ?? null;
  } catch {
    saved = null;
  }

  const downloadedModelIds = await getDownloadedModelIdsSnapshot().catch(() => []);
  const route = await resolveInteractiveModelPreference(saved);

  if (downloadedModelIds.length === 0) {
    return DEFAULT_MODEL_ID;
  }

  return route.selectedModelId;
}

/** 활성 모델을 변경하고 (선택적으로) 엔진을 로드한 뒤 실제로 선택된 모델 ID를 반환 */
export async function setActiveModelId(modelId: string, shouldLoad = true): Promise<string> {
  const route = await resolveInteractiveModelPreference(modelId);

  const { recentStoryId, sessions } = useChatStore.getState();
  const recentSession = recentStoryId ? sessions[recentStoryId] : undefined;
  if (
    recentSession &&
    hasChatSessionLock() &&
    recentSession.modelId !== route.selectedModelId
  ) {
    const error = new Error('Restart the current story to use a different model.');
    (error as Error & { code?: string }).code = MODEL_SWITCH_LOCK_ERROR;
    throw error;
  }

  // ✅ [FIX] 모델 로드 전 메모리 체크 — RAMChecker를 통한 정밀 검사
  if (route.selectedModelId) {
    try {
      const { RAMChecker } = require('./RAMChecker');
      const checker = RAMChecker.getInstance();
      const check = await checker.canRunModel(route.selectedModelId);

      if (!check.canRun) {
        const error = new Error(
          `요구 램: ${check.required.totalMB}MB, 현재 남은 램: ${check.availableMB}MB (부족: ${check.shortfallMB}MB)`
        );
        (error as Error & { code?: string }).code = MODEL_INSUFFICIENT_RAM_ERROR;
        throw error;
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === MODEL_INSUFFICIENT_RAM_ERROR) throw e;
      console.warn('[modelUtils] RAM check failed (ignored):', e);
    }
  }

  if (shouldLoad) {
    await llamaEngine.load(route.selectedModelId);
  }
  appStorage.set(ACTIVE_MODEL_KEY, route.selectedModelId);
  return route.selectedModelId;
}

/** 기기에 다운로드된 모델 목록 반환 */
export async function getDownloadedModels(): Promise<ModelInfo[]> {
  const checks = await Promise.all(
    MODELS.map(async m => ({ model: m, exists: await modelDownloader.isModelDownloaded(m.id) })),
  );
  return checks.filter(c => c.exists).map(c => c.model);
}
