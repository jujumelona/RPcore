import { create } from 'zustand';
import { logger } from '../utils/logger';
import { immer } from 'zustand/middleware/immer';
import { getActiveModelId,
  getDownloadedModels,
  setActiveModelId as persistActiveModelId } from '../utils/modelUtils';
import { ModelInfo, MODELS } from '../models/ModelConfig';
import { engineBusListener,
  type EngineStateChangedPayload,
  type EngineCacheCorruptedPayload,
  type EngineOomWarningPayload } from '../core/llama/EngineEventBus';
import { EmitterSubscription } from 'react-native';

export type EngineWarmState = 'idle' | 'warming' | 'ready' | 'error';

export interface ModelStore {
  activeModelId: string;
  downloadedModels: ModelInfo[];
  isLoaded: boolean;
  isSwitching: boolean;
  engineWarmState: EngineWarmState;
  /** KV 캐시 손상 감지 — UI에서 재다운로드 안내 표시용 */
  cacheCorruptedPayload: EngineCacheCorruptedPayload | null;
  clearCacheCorrupted: () => void;
  setEngineWarmState: (_state: EngineWarmState) => void;
  initialize: () => Promise<void>;
  switchModel: (_modelId: string, _shouldLoad?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  getActiveModel: () => ModelInfo | undefined;
}

let isBootstrapped = false;
let engineStateSub: EmitterSubscription | null = null;
let cacheCorruptedSub: EmitterSubscription | null = null;
// [BUG FIX] OOM 경고 구독자 없음 수정 — emitOomWarning은 발송되지만 수신자가 없었음
let oomWarningSub: EmitterSubscription | null = null;

function bootstrapEngineEventListeners(): void {
  if (isBootstrapped) return;
  isBootstrapped = true;

  engineStateSub?.remove();
  engineStateSub = engineBusListener.onStateChanged((payload: EngineStateChangedPayload) => {
    const warmState: EngineWarmState =
      payload.state === 'ready' || payload.state === 'generating'
        ? 'ready'
        : payload.state === 'error'
          ? 'error'
          : payload.state === 'loading' || payload.state === 'warming'
            ? 'warming'
            : 'idle';

    useModelStore.getState().setEngineWarmState(warmState);
  });

  cacheCorruptedSub?.remove();
  cacheCorruptedSub = engineBusListener.onCacheCorrupted((payload: EngineCacheCorruptedPayload) => {
    useModelStore.setState({ cacheCorruptedPayload: payload });
  });

  // [BUG FIX] OOM 경고 구독자 추가
  // emitOomWarning()이 발송되지만 수신자가 없어 UI 쓰로틀링·softReset 트리거가 동작 안 함.
  // engineWarmState에 'oom_warning' 상태 추가 대신, error로 전환해 UI가 인지하도록 처리.
  oomWarningSub?.remove();
  oomWarningSub = engineBusListener.onOomWarning((payload: EngineOomWarningPayload) => {
    // [DISABLED] OOM 경고 시 자동 softReset 비활성화
    // 이전: softReset 호출 → KV 초기화 → 대화 히스토리 손실
    // 수정: 경고만 로그에 기록하고 KV는 유지
    logger.warn(`[ModelStore] OOM warning: avail=${payload.availMB}MB total=${payload.totalMB}MB usage=${payload.systemUsagePct}% (softReset 비활성화)`);
    // softReset 호출 제거 - 대화 컨텍스트 유지를 위해
  });
}

export function teardownModelStore(): void {
  engineStateSub?.remove();
  engineStateSub = null;
  cacheCorruptedSub?.remove();
  cacheCorruptedSub = null;
  // [BUG FIX] OOM 구독자 teardown에 포함
  oomWarningSub?.remove();
  oomWarningSub = null;
  isBootstrapped = false;
}

async function syncActiveModelFallback(activeId: string, models: ModelInfo[]): Promise<string> {
  if (activeId) {
    return activeId;
  }

  // [BUG FIX] 다운로드된 모델이 없을 때 MODELS 상수 배열 첫 번째를 기본값으로 사용.
  // 기존: models.length === 0 이면 '' 반환 -> activeModelId='' -> UI가 모델 없음으로 표시.
  // 수정: 설치 전 상태에서도 MODELS[0]을 기본값으로 설정해 모델 선택 화면을 올바르게 안내.
  const fallbackModels = models.length > 0 ? models : MODELS;
  if (fallbackModels.length === 0) {
    return '';
  }

  try {
    return await persistActiveModelId(fallbackModels[0].id);
  } catch {
    return fallbackModels[0].id;
  }
}

export const useModelStore = create<ModelStore>()(immer((set, get) => ({
  activeModelId: '',
  downloadedModels: [],
  isLoaded: false,
  isSwitching: false,
  engineWarmState: 'idle',
  cacheCorruptedPayload: null,

  clearCacheCorrupted: () => { set({ cacheCorruptedPayload: null }); },

  setEngineWarmState: (state: EngineWarmState) => {
    set({ engineWarmState: state });
  },

  initialize: async () => {
    bootstrapEngineEventListeners();
    try {
      const [id, models] = await Promise.all([getActiveModelId(), getDownloadedModels()]);
      const activeModelId = await syncActiveModelFallback(id, models);
      set({ activeModelId, downloadedModels: models, isLoaded: true });
    } catch (error) {
      logger.warn('[ModelStore] initialize failed:', error);
      set({ isLoaded: true });
    }
  },

  switchModel: async (modelId: string, shouldLoad = true) => {
    if (get().isSwitching) return;
    set({ isSwitching: true, engineWarmState: 'idle' });
    // [BUG-14 FIX] 타임아웃 발화 후 finally에서 isSwitching=false 재설정 경쟁 방지
    // 타임아웃이 발화하면 즉시 isSwitching=false로 설정하고 timeoutFired 플래그 기록.
    // finally에서는 타임아웃 미발화 시에만 isSwitching=false 처리.
    let timeoutFired = false;
    const timeoutId = setTimeout(() => {
      if (get().isSwitching) {
        logger.warn('[ModelStore] switchModel timeout — force resetting isSwitching');
        // [BUG FIX] 타임아웃 시 engineWarmState 'error'로 설정 — 'idle' stuck 방지
        set({ isSwitching: false, engineWarmState: 'error' });
        timeoutFired = true;
      }
    }, 20000);
    try {
      const resolvedModelId = await persistActiveModelId(modelId, shouldLoad);
      const models = await getDownloadedModels();
      set({ activeModelId: resolvedModelId, downloadedModels: models });
    } catch (error) {
      // [BUG FIX] 에러 시 engineWarmState 'error'로 명시 설정 — 'idle' stuck 방지
      logger.warn('[ModelStore] switchModel failed:', error);
      set({ engineWarmState: 'error' });
      throw error;
    } finally {
      clearTimeout(timeoutId);
      // [BUG-14 FIX] 타임아웃이 이미 발화해 isSwitching=false를 처리했으면 중복 set 방지
      if (!timeoutFired) {
        set({ isSwitching: false });
      }
    }
  },

  refresh: async () => {
    try {
      const [id, models] = await Promise.all([getActiveModelId(), getDownloadedModels()]);
      const activeModelId = await syncActiveModelFallback(id, models);
      set({ activeModelId, downloadedModels: models, isLoaded: true });
    } catch (error) {
      logger.warn('[ModelStore] refresh failed:', error);
    }
  },

  getActiveModel: () => {
    const { activeModelId, downloadedModels } = get();
    return (
      downloadedModels.find(model => model.id === activeModelId) ??
      MODELS.find(model => model.id === activeModelId)
    );
  } })));
