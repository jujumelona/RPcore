import { AppState, type AppStateStatus } from 'react-native';
import { DEFAULT_MODEL_ID, MODELS } from '../../models/ModelConfig';
import deviceProfiler, {
  type BackendType as RoutedBackendType,
  type LlamaTuningParams } from '../llama/DeviceProfiler';
import llamaEngine, {
  type BackendInfo as LlamaBackendInfo,
  type ChatMessage,
  type GenerateOptions,
  type GenerationFinishReason } from '../llama/LlamaEngine';
import { modelDownloader } from '../llama/ModelDownloader';
import { resolveReasoningAssistPreference } from '../ai/ModelRouter';
import { detectVirtualDevice } from '../../utils/deviceDetector';
import { logger } from '../../utils/logger';

export type BackendType = RoutedBackendType;
export type ChatFinishReason = GenerationFinishReason;

export interface BackendInfo {
  engine: 'MLC' | 'llama';
  backend: BackendType;
  modelId: string;
  nGpuLayers?: number;
  useHTP?: boolean;
  tokPerSec?: number | null;
}

export type WarmState = 'idle' | 'loading' | 'warming' | 'ready' | 'error';

export interface InitOptions {
  engineType?: 'mediapipe' | 'litert_lm' | 'mlc' | string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  typicalP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
  repeatLastN?: number;
  dryMultiplier?: number;
  dryBase?: number;
  dryAllowedLength?: number;
  dryPenaltyLastN?: number;
  xtcProbability?: number;
  xtcThreshold?: number;
  topNSigma?: number;
  stopSequences?: string[];
  logitBias?: Array<[number | string, number | false]>;
  banTokens?: Array<number | string>;
  seed?: number;
  responseFormat?: 'text' | 'json_object';
  /** [NEW] storyId for session-linked logging/summarization */
  storyId?: string;
  skipHistory?: boolean;
}

export interface ChatResult {
  content: string;
  shouldTrim: boolean;
  historyTurns: number;
  finishReason?: ChatFinishReason;
}

const RP_DEFAULTS: ChatOptions = {
  maxTokens: 400,
  temperature: 1.15,
  topP: 0.92,
  frequencyPenalty: 0.1 };

class InferenceEngine {
  private initialized = false;
  private requestedModelId: string | null = null;
  private loadedModelId: string | null = null;
  private cachedBackendInfo: BackendInfo | null = null;
  private currentSystemPrompt = '';
  private history: ChatMessage[] = [];
  private _initPromise: Promise<BackendInfo> | null = null;
  private lastTuningParams: LlamaTuningParams | null = null;
  private currentStoryId: string | null = null;
  private warmState: WarmState = 'idle';
  private warmStateListeners = new Set<(state: WarmState) => void>();
  private streaming = false;
  private appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
  // [BUG FIX] llamaEngine.onStateChange 구독 해제 함수 저장 — cleanup() 시 리스너 누수 방지
  private _engineStateUnsub: (() => void) | null = null;

  constructor() {
    const deviceInfo = detectVirtualDevice();
    if (deviceInfo.isVirtual) {
      logger.log(`[InferenceEngine] virtual device detected: ${deviceInfo.deviceType}`);
    }

    this.appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        deviceProfiler.invalidate();
      }
    });

    // [BUG FIX] 구독 해제 함수 저장 — cleanup()에서 리스너 제거 가능
    this._engineStateUnsub = llamaEngine.onStateChange(state => {
      if (state === 'loading' || state === 'warming' || state === 'ready' || state === 'error') {
        this.setWarmState(state);
      } else if (state === 'idle' && !this.streaming) {
        this.setWarmState('idle');
      }
      this.streaming = state === 'generating';
    });
  }

  private setWarmState(state: WarmState): void {
    this.warmState = state;
    this.warmStateListeners.forEach(fn => fn(state));
  }

  private mapBackendInfo(info: LlamaBackendInfo): BackendInfo {
    return {
      engine: 'llama',
      backend: info.backend,
      modelId: info.modelId,
      nGpuLayers: info.nGpuLayers,
      useHTP: info.useHTP,
      tokPerSec: info.tokPerSec };
  }

  private async resolveRequestedModelId(modelId: string): Promise<string> {
    if (!MODELS.some(model => model.id === modelId)) {
      return DEFAULT_MODEL_ID;
    }

    if (modelId === 'gemma-3n-e2b-reasoning') {
      const route = await resolveReasoningAssistPreference(modelId).catch(() => null);
      return route?.selectedModelId ?? modelId;
    }

    return modelId;
  }

  private buildMessages(prompt: string, skipHistory: boolean): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (this.currentSystemPrompt) {
      messages.push({ role: 'system', content: this.currentSystemPrompt });
    }
    if (!skipHistory && this.history.length > 0) {
      messages.push(...this.history);
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private toGenerateOptions(
    options: ChatOptions,
    onToken?: (token: string) => void,
  ): GenerateOptions {
    return {
      maxTokens: options.maxTokens ?? RP_DEFAULTS.maxTokens,
      temperature: options.temperature ?? RP_DEFAULTS.temperature,
      topP: options.topP ?? RP_DEFAULTS.topP,
      topK: options.topK,
      minP: options.minP,
      typicalP: options.typicalP,
      frequencyPenalty: options.frequencyPenalty ?? RP_DEFAULTS.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      repeatPenalty: options.repeatPenalty,
      repeatLastN: options.repeatLastN,
      dryMultiplier: options.dryMultiplier,
      dryBase: options.dryBase,
      dryAllowedLength: options.dryAllowedLength,
      dryPenaltyLastN: options.dryPenaltyLastN,
      xtcProbability: options.xtcProbability,
      xtcThreshold: options.xtcThreshold,
      topNSigma: options.topNSigma,
      stopSequences: options.stopSequences,
      logitBias: options.logitBias,
      banTokens: options.banTokens,
      seed: options.seed,
      responseFormat: options.responseFormat,
      onToken };
  }

  private updateHistory(userMessage: string, assistantMessage: string): void {
    this.history.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantMessage },
    );
  }

  private getHistoryTurns(): number {
    return Math.floor(this.history.length / 2);
  }

  private shouldTrim(): boolean {
    const nCtx = llamaEngine.getNCtx();
    const usedTokens = llamaEngine.getUsedTokens();
    return nCtx > 0 && usedTokens / nCtx >= 0.85;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.initialize(this.loadedModelId ?? this.requestedModelId ?? DEFAULT_MODEL_ID);
  }

  async initialize(modelId: string, _options?: InitOptions): Promise<BackendInfo> {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      const requestedModelId = modelId.toLowerCase();
      const effectiveModelId = (await this.resolveRequestedModelId(requestedModelId)).toLowerCase();

      if (
        this.initialized &&
        this.loadedModelId?.toLowerCase() === effectiveModelId &&
        this.cachedBackendInfo
      ) {
        return this.cachedBackendInfo;
      }

      const model = MODELS.find(entry => entry.id === effectiveModelId);
      if (model) {
        const profile = await deviceProfiler.measure().catch(() => null);
        if (profile) {
          this.lastTuningParams = deviceProfiler.computeLlamaParams(
            model.sizeMB,
            profile,
            model.ropeFreqBase ?? 10000,
            model.nCtxFallback ?? model.nCtx,
          );
        }
      }

      if (this.currentSystemPrompt) {
        llamaEngine.setWarmupSystemPrompt(this.currentSystemPrompt);
      }

      this.setWarmState('loading');
      const backendInfo = await llamaEngine.load(effectiveModelId);
      this.initialized = true;
      this.requestedModelId = requestedModelId;
      this.loadedModelId = effectiveModelId;
      this.cachedBackendInfo = this.mapBackendInfo(backendInfo);
      this.setWarmState('ready');
      return this.cachedBackendInfo;
    })()
      .catch(error => {
        this.setWarmState('error');
        throw error;
      })
      .finally(() => {
        this._initPromise = null;
      });

    return this._initPromise;
  }

  async setSystemPrompt(staticPrompt: string): Promise<boolean> {
    const nextPrompt = staticPrompt.trim();
    const changed = this.currentSystemPrompt !== nextPrompt;
    this.currentSystemPrompt = nextPrompt;
    // [BUG FIX #4] systemPrompt가 변경되지 않았다면 history도 유지
    // 이전: changed 반환(false)과 무관하게 무조건 this.history = [] 캐시 날림
    if (changed) {
      this.history = [];
    }
    if (nextPrompt) {
      llamaEngine.setWarmupSystemPrompt(nextPrompt);
    }
    return changed;
  }

  async chat(
    userMessage: string,
    options: ChatOptions = {},
  ): Promise<ChatResult> {
    const skipHistory = options.skipHistory ?? false;
    await this.ensureInitialized();
    const messages = this.buildMessages(userMessage, skipHistory);
    const content = await llamaEngine.generate(
      messages,
      this.toGenerateOptions({ ...RP_DEFAULTS, ...options }),
    );

    if (!skipHistory) {
      this.updateHistory(userMessage, content);
    }

    return {
      content,
      shouldTrim: this.shouldTrim(),
      historyTurns: this.getHistoryTurns(),
      finishReason: llamaEngine.getLastCompletionMeta()?.finishReason ?? 'unknown' };
  }

  async generate(prompt: string, maxTokens?: number): Promise<string> {
    await this.ensureInitialized();
    const messages = this.buildMessages(prompt, true);
    return llamaEngine.generate(
      messages,
      this.toGenerateOptions({ ...RP_DEFAULTS, maxTokens, skipHistory: true }),
    );
  }

  async chatStream(
    userMessage: string,
    options: ChatOptions = {},
    onChunk: (chunk: string) => void,
    onDone: (result: { shouldTrim: boolean; historyTurns: number; finishReason?: ChatFinishReason }) => void,
  ): Promise<void> {
    const skipHistory = options.skipHistory ?? true;
    await this.ensureInitialized();
    const messages = this.buildMessages(userMessage, skipHistory);
    this.streaming = true;

    try {
      const content = await llamaEngine.generate(
        messages,
        this.toGenerateOptions({ ...RP_DEFAULTS, ...options }, onChunk),
      );

      if (!skipHistory) {
        this.updateHistory(userMessage, content);
      }

      onDone({
        shouldTrim: this.shouldTrim(),
        historyTurns: this.getHistoryTurns(),
        finishReason: llamaEngine.getLastCompletionMeta()?.finishReason ?? 'unknown' });
    } finally {
      this.streaming = false;
    }
  }

  async trimHistory(keepLastTurns: number): Promise<{ remainingTurns: number }> {
    const keepMessages = Math.max(keepLastTurns, 0) * 2;
    this.history = keepMessages > 0 ? this.history.slice(-keepMessages) : [];
    return { remainingTurns: this.getHistoryTurns() };
  }

  async resetHistory(): Promise<void> {
    this.history = [];
    if (!this.initialized) return;
    await llamaEngine.softReset([]).catch(() => {});
  }

  async getHistoryStats(): Promise<{
    turns: number;
    totalChars: number;
    estimatedTokens: number;
  } | null> {
    return {
      turns: this.getHistoryTurns(),
      totalChars: this.history.reduce((sum, message) => sum + message.content.length, 0),
      estimatedTokens: Math.ceil(
        this.history.reduce((sum, message) => sum + message.content.length, 0) / 4,
      ) };
  }

  async cleanup(): Promise<boolean> {
    // [BUG FIX] AppState / llamaEngine 리스너 누수 수정
    // 이전: cleanup()에서 리스너 해제 없음 → 재초기화마다 리스너 누적
    this.appStateSub?.remove();
    this.appStateSub = null;
    this._engineStateUnsub?.();
    this._engineStateUnsub = null;

    this.initialized = false;
    this.requestedModelId = null;
    this.loadedModelId = null;
    this.cachedBackendInfo = null;
    this.currentSystemPrompt = '';
    this.history = [];
    this.lastTuningParams = null;
    this.streaming = false;
    this.warmStateListeners.clear();
    this.setWarmState('idle');
    await llamaEngine.release().catch(() => {});
    return true;
  }

  generateStream(
    prompt: string,
    maxTokens: number,
    onChunk: (chunk: string) => void,
    onDone: () => void,
  ): Promise<void> {
    return this.chatStream(
      prompt,
      { maxTokens, ...RP_DEFAULTS, skipHistory: true },
      onChunk,
      () => onDone(),
    );
  }

  async initializeFromModelId(modelId: string, systemPrompt?: string, options?: ChatOptions): Promise<BackendInfo> {
    const downloaded = await modelDownloader.isModelDownloaded(modelId).catch(() => false);
    if (!downloaded) {
      throw new Error(`Model not downloaded: ${modelId}`);
    }

    // [BUG FIX] setSystemPrompt를 initialize 이후에 호출
    // 기존: setSystemPrompt → initialize 순서로 호출
    //   initialize 내부에서도 this.currentSystemPrompt가 있으면
    //   llamaEngine.setWarmupSystemPrompt()를 한 번 더 호출 → 이중 호출
    // 수정: initialize 먼저 → 모델 로드 완료 후 setSystemPrompt
    const backendInfo = await this.initialize(modelId);
    if (systemPrompt) {
      this.currentStoryId = options?.storyId ?? null;
      await this.setSystemPrompt(systemPrompt);
    }
    return backendInfo;
  }

  cancelPrewarm(): void {}

  cancelStream(): void {
    this.streaming = false;
    // eslint-disable-next-line no-void
    void llamaEngine.stopGeneration().catch(() => {});
  }

  isInitialized() { return this.initialized; }
  isReady() { return this.initialized && this.warmState === 'ready'; }
  isStreaming() { return this.streaming; }
  getLoadedModelId() { return this.loadedModelId; }
  getBackendInfo() { return this.cachedBackendInfo; }
  getTuningParams() { return this.lastTuningParams; }
  getWarmState() { return this.warmState; }

  onWarmStateChange(fn: (state: WarmState) => void): () => void {
    this.warmStateListeners.add(fn);
    return () => this.warmStateListeners.delete(fn);
  }

  skipIfBusy<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (this.streaming || this._initPromise || this.warmState === 'loading' || this.warmState === 'warming') {
      return Promise.resolve(undefined);
    }
    return task();
  }
}

let _instance: InferenceEngine | null = null;

function getInstance(): InferenceEngine {
  if (!_instance) _instance = new InferenceEngine();
  return _instance;
}

export const inferenceEngine = new Proxy({} as InferenceEngine, {
  get(_target, prop) {
    const instance = getInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(_target, prop, value) {
    (getInstance() as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  } });
export default inferenceEngine;
