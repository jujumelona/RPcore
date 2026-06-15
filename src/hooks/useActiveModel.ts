// src/hooks/useActiveModel.ts
// ──────────────────────────────────────────────────────────────────
// useActiveModel, useModelSwitching — React hook 전용 파일
//
// plain async 유틸 함수(getActiveModelId, setActiveModelId, getDownloadedModels)는
// utils/modelUtils.ts 로 분리됨.
// 하위 호환성을 위해 re-export 유지.
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useSafeAsync } from './useSafe';
import { DEFAULT_MODEL_ID, ModelInfo } from '../models/ModelConfig';
import { getActiveModelId,
  setActiveModelId,
  getDownloadedModels,
  MODEL_SWITCH_LOCK_ERROR } from '../utils/modelUtils';

// 하위 호환 re-export (기존 import 경로 유지 지원)
export { getActiveModelId, setActiveModelId, getDownloadedModels, MODEL_SWITCH_LOCK_ERROR };

// ── 전역 스위칭 상태 (컴포넌트 간 공유) ─────────────────────────
let _isSwitching = false;
const _switchListeners = new Set<(v: boolean) => void>();
function setGlobalSwitching(v: boolean) {
  _isSwitching = v;
  _switchListeners.forEach(fn => fn(v));
}

export function useModelSwitching() {
  const [switching, setSwitching] = useState(_isSwitching);
  useEffect(() => {
    _switchListeners.add(setSwitching);
    return () => { _switchListeners.delete(setSwitching); };
  }, []);
  return switching;
}

export function useActiveModel() {
  const [activeId, setActiveId] = useState<string>(DEFAULT_MODEL_ID);
  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useSafeAsync(async isCancelled => {
    const [id, models] = await Promise.all([getActiveModelId(), getDownloadedModels()]);
    if (isCancelled()) return;
    setActiveId(id);
    setDownloadedModels(models);
    setLoading(false);
  }, []);

  const switchModel = async (modelId: string) => {
    setGlobalSwitching(true);
    try {
      const resolvedModelId = await setActiveModelId(modelId);
      setActiveId(resolvedModelId);
    } catch (error) {
      console.error('[useActiveModel] Failed to switch model:', error);
      // Optional: Toast message for user
    } finally {
      setGlobalSwitching(false);
    }
  };

  return { activeId, downloadedModels, loading, switchModel };
}
