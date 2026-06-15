﻿// src/core/llama/ExecutorchEngine.ts
// ═══════════════════════════════════════════════════════════════════
// react-native-executorch v0.7
//
//  v0.7 신규:
//    ✅ TTS (Text to Speech) — Kokoro 모델 지원 (감정 표현 나레이션 가능)
//    ✅ ExecuTorch Runtime v1.0.0 (안정화 버전)
//    ✅ Android 16kB 메모리 페이지 지원
//    ✅ temperature / topp 파라미터 직접 제어 가능
//
//  v0.7 변경사항 (v0.5 대비):
//    - expo-file-system 의존성 추가 필요: npx expo install expo-file-system
//    - BareResourceFetcher는 @react-native-executorch/bare-adapter에서 제공 (동일)
//    - initExecutorch API 변경 없음
//    - useLLM API 변경 없음 (v0.5에서 이미 단순화됨)
//
//  포함 기능:
//    ✅ bootstrapExecutorch()     — App.tsx 최상단 1회 호출 필수
//    ✅ useExecutorchLLM()        — LLM 훅 (Zod 구조화 출력)
//    ✅ ExecutorchLLMInstance     — 명령형 인스턴스 (멀티턴 히스토리)
//    ✅ executorchSummaryEngine   — 챕터 전환 요약 전용 싱글톤
//    ✅ executorchTTS             — v0.7 Kokoro TTS 싱글톤 (감정 나레이션)
//    ✅ Zod 구조화 출력            — responseSchema에 z.ZodType 직접 전달
//    ✅ 백그라운드 다운로드         — @kesha-antonov/react-native-background-downloader
// ═══════════════════════════════════════════════════════════════════

import RNFS from '../../utils/fileSystemCompat';
import { logger } from '../../utils/logger';
import type { ZodType as ZodSchema } from 'zod';

// ── react-native-executorch v0.7 런타임 타입 정의 ─────────────────
// 패키지가 optional 이므로 lazy import. 실제 타입은 인터페이스로 명세.

interface ETLLMHookParams {
  model:           unknown;              // LLAMA3_2_1B / LLAMA3_2_3B 상수
  systemPrompt?:   string;
  responseSchema?: ZodSchema;
}

interface ETLLMHookResult {
  generate:           (prompt: string) => void;
  stop?:              () => void;
  response?:          string;
  isModelGenerating?: boolean;
  isModelReady?:      boolean;
  error?:             string | null;
  downloadProgress?:  number;
}

interface ETTTSHookParams {
  modelSource: { url: string };
}

interface ETTTSHookResult {
  speak?:        (text: string, opts?: { style?: string; speed?: number }) => void;
  stop?:         () => void;
  isSpeaking?:   boolean;
  isModelReady?: boolean;
  error?:        string | null;
}

interface ETLLMInstance {
  load():     Promise<void>;
  generate(prompt: string, opts?: {
    maxTokens?:           number;
    temperature?:         number;
    topP?:                number;
    conversationHistory?: ConversationMessage[];
  }): Promise<string>;
  release?(): Promise<void>;
}

interface ETTTSInstance {
  load?():     Promise<void>;
  speak?(text: string, opts?: { style?: string; speed?: number }): Promise<void>;
  stop?():     void;
  release?():  Promise<void>;
}

type ETLLMHookFn = (params: ETLLMHookParams)   => ETLLMHookResult;
type ETTTSHookFn = (params: ETTTSHookParams)   => ETTTSHookResult;
type ETModelRef  = unknown;  // 모델 상수 (LLAMA3_2_1B 등) — 런타임 구조 비공개

// ── v0.7 lazy imports ─────────────────────────────────────────────
let useLLMHook:  ETLLMHookFn | null = null;
let useTTSHook:  ETTTSHookFn | null = null;
let LLAMA3_2_1B: ETModelRef  | null = null;
let LLAMA3_2_3B: ETModelRef  | null = null;

try {
  const pkg   = require('react-native-executorch');
  useLLMHook  = pkg.useLLM    as ETLLMHookFn   ?? null;
  useTTSHook  = (pkg.useTTS   as ETTTSHookFn)  ?? null;
  LLAMA3_2_1B = pkg.LLAMA3_2_1B ?? null;
  LLAMA3_2_3B = pkg.LLAMA3_2_3B ?? null;
} catch {
  logger.warn('[ExecutorchEngine] react-native-executorch 미설치 (v0.7 필요)');
}

type BackgroundDownloadTask = {
  progress(cb: (pct: number) => void): BackgroundDownloadTask;
  done(cb: () => void): BackgroundDownloadTask;
  error(cb: (e: string) => void): BackgroundDownloadTask;
  stop(): void;
};

let RNBackgroundDownloader: {
  download(opts: { id: string; url: string; destination: string }): BackgroundDownloadTask;
} | null = null;
try {
  RNBackgroundDownloader = require('@kesha-antonov/react-native-background-downloader').default;
} catch {
  logger.warn('[ExecutorchEngine] background-downloader 미설치 — RNFS 폴백');
}

// ── 앱 초기화 ─────────────────────────────────────────────────────

/**
 * ExecuTorch 런타임 초기화
 * App.tsx 최상단에서 반드시 1회 호출 (어떤 렌더링보다 먼저)
 */
/**
 * v0.7에서는 initExecutorch 불필요 — 하위 호환용으로 유지
 */
export function bootstrapExecutorch(): void {
  logger.log('[ExecutorchEngine] ✅ v0.7 — bootstrapExecutorch 불필요 (no-op)');
}

// ── 모델 정의 ─────────────────────────────────────────────────────

export interface ExecutorchModelInfo {
  id:           string;
  name:         string;
  pteUrl:       string;
  tokenizerUrl: string;
  sizeMB:       number;
  minRAM:       number;
  description:  string;
}

export const EXECUTORCH_MODELS: ExecutorchModelInfo[] = [
  {
    id:           'llama-3.2-1b-executorch',
    name:         'Llama 3.2 1B (ExecuTorch)',
    pteUrl:       'https://huggingface.co/software-mansion/react-native-executorch-llama3.2-1B/resolve/main/llama3_2-1B-instruct-q8_0.pte',
    tokenizerUrl: 'https://huggingface.co/software-mansion/react-native-executorch-llama3.2-1B/resolve/main/tokenizer.bin',
    sizeMB:       1200,
    minRAM:       3072,
    description:  '초경량 1B — 챕터 전환 요약 전용' },
  {
    id:           'llama-3.2-3b-executorch',
    name:         'Llama 3.2 3B (ExecuTorch)',
    pteUrl:       'https://huggingface.co/software-mansion/react-native-executorch-llama3.2-3B/resolve/main/llama3_2-3B-instruct-q8_0.pte',
    tokenizerUrl: 'https://huggingface.co/software-mansion/react-native-executorch-llama3.2-3B/resolve/main/tokenizer.bin',
    sizeMB:       3200,
    minRAM:       5120,
    description:  '3B 균형 모델 — 메인 엔진 폴백' },
  {
    id:           'qwen3-1.7b-executorch',
    name:         'Qwen3 1.7B (ExecuTorch)',
    pteUrl:       'https://huggingface.co/software-mansion/react-native-executorch-qwen3-1.7B/resolve/main/qwen3-1.7B-q8_0.pte',
    tokenizerUrl: 'https://huggingface.co/software-mansion/react-native-executorch-qwen3-1.7B/resolve/main/tokenizer.bin',
    sizeMB:       1800,
    minRAM:       3500,
    description:  'Qwen3 1.7B — 한국어 강화 (v0.7 정식 지원)' },
];

// ── 백그라운드 다운로드 ───────────────────────────────────────────

export interface DownloadModelOptions {
  onProgress?: (progress: number) => void;
  onDone?:     () => void;
  onError?:    (error: string) => void;
}

/**
 * ExecuTorch 모델 백그라운드 다운로드
 * 앱이 백그라운드/종료되어도 다운로드가 끊기지 않음
 * background-downloader 미설치 시 RNFS 자동 폴백
 */
export function downloadExecutorchModelInBackground(
  modelId:  string,
  destPath: string,
  options:  DownloadModelOptions = {},
): { cancel: () => void } {
  const model = EXECUTORCH_MODELS.find(m => m.id === modelId);
  if (!model) {
    options.onError?.(`알 수 없는 모델: ${modelId}`);
    return { cancel: () => {} };
  }

  if (RNBackgroundDownloader) {
    const task = RNBackgroundDownloader
      .download({ id: `executorch_${modelId}`, url: model.pteUrl, destination: destPath })
      .progress((percent: number) => options.onProgress?.(Math.round(percent * 100)))
      .done(() => { logger.log(`[ExecutorchEngine] 다운로드 완료: ${modelId}`); options.onDone?.(); })
      .error((err: string) => { logger.error(`[ExecutorchEngine] 다운로드 실패: ${err}`); options.onError?.(err); });
    return { cancel: () => task.stop() };
  }

  // RNFS 폴백
  let jobId: number | null = null;
  let cancelled = false;
  (async () => {
    try {
      const { jobId: jid, promise } = RNFS.downloadFile({
        fromUrl: model.pteUrl, toFile: destPath,        headers: { 'User-Agent': 'RPcore/1.0' },
        progress: (res: { bytesWritten: number; contentLength: number; jobId: number }) => {
          if (res.contentLength > 0)
            options.onProgress?.(Math.round((res.bytesWritten / res.contentLength) * 100));
        } });
      jobId = jid;
      const result = await promise;
      if (!cancelled) {
        if (result.statusCode === 200) options.onDone?.();
        else options.onError?.(`HTTP ${result.statusCode}`);
      }
    } catch (e: unknown) {
      if (!cancelled) options.onError?.(e instanceof Error ? e.message : '다운로드 실패');
    }
  })();
  return {
    cancel: () => {
      cancelled = true;
      if (jobId !== null) try { RNFS.stopDownload(jobId); } catch {}
    } };
}

// ── Hook: LLM ─────────────────────────────────────────────────────

export interface UseExecutorchLLMOptions {
  modelId:      string;
  systemPrompt?: string;
  maxTokens?:   number;
  temperature?: number;
  topP?:        number;
  /**
   * Zod 스키마 — 구조화 JSON 출력 (v0.6)
   * @example
   * import { z } from 'zod';
   * const schema = z.object({ emotion: z.string(), intensity: z.number() });
   * useExecutorchLLM({ modelId: '...', outputSchema: schema });
   */
  outputSchema?: ZodSchema;
}

export interface UseExecutorchLLMResult {
  generate:         (prompt: string) => void;
  stop:             () => void;
  response:         string;
  isLoading:        boolean;
  isReady:          boolean;
  error:            string | null;
  downloadProgress: number;
}

export function useExecutorchLLM(opts: UseExecutorchLLMOptions): UseExecutorchLLMResult {
  const unavailable: UseExecutorchLLMResult = {
    generate: () => logger.warn('[ExecutorchEngine] v0.7 미설치'),
    stop: () => {},
    response: '', isLoading: false, isReady: false,
    error: 'react-native-executorch v0.7 미설치', downloadProgress: 0 };

  if (!useLLMHook) return unavailable;

  const model = EXECUTORCH_MODELS.find(m => m.id === opts.modelId);
  if (!model) return { ...unavailable, error: `알 수 없는 모델: ${opts.modelId}` };

  // eslint-disable-next-line
  const llm: ETLLMHookResult = useLLMHook({
    model:       opts.modelId === 'llama-3.2-3b-executorch' ? LLAMA3_2_3B : LLAMA3_2_1B,
    systemPrompt: opts.systemPrompt ?? '',
    ...(opts.outputSchema ? { responseSchema: opts.outputSchema } : {}) });

  return {
    generate:         llm.generate,
    stop:             llm.stop              ?? (() => {}),
    response:         llm.response          ?? '',
    isLoading:        llm.isModelGenerating ?? false,
    isReady:          llm.isModelReady      ?? false,
    error:            llm.error             ?? null,
    downloadProgress: llm.downloadProgress  ?? (llm.isModelReady ? 1 : 0) };
}

// ── 명령형 인스턴스 (멀티턴 히스토리) ────────────────────────────

export interface ConversationMessage {
  role:    'user' | 'assistant';
  content: string;
}

export interface ExecutorchGenerateOptions {
  maxTokens?:   number;
  temperature?: number;
  topP?:        number;
}

/**
 * ExecutorchLLMInstance — Hook 외부 명령형 인스턴스
 *
 * v0.6 conversationHistory 내장 히스토리 관리:
 *   매 generate 시 자동 전달 -> 멀티턴 컨텍스트 유지
 *
 * 챕터 전환 시 clearHistory() 호출
 */
export class ExecutorchLLMInstance {
  private opts:     { modelId: string; systemPrompt?: string; temperature?: number; topP?: number };
  private llm:      ETLLMInstance | null = null;
  private _ready        = false;
  private _history: ConversationMessage[] = [];

  constructor(opts: { modelId: string; systemPrompt?: string; temperature?: number; topP?: number }) {
    this.opts = opts;
  }

  async load(): Promise<void> {
    const model = EXECUTORCH_MODELS.find(m => m.id === this.opts.modelId);
    if (!model) throw new Error(`알 수 없는 모델: ${this.opts.modelId}`);

    let LLMClass: new (opts: {
      modelSource:     { url: string };
      tokenizerSource: { url: string };
      systemPrompt?:   string;
      temperature?:    number;
      topP?:           number;
    }) => ETLLMInstance;
    try { LLMClass = require('react-native-executorch').LLM; }
    catch { throw new Error('[ExecutorchLLMInstance] LLM 클래스 없음 — v0.7 필요'); }

    this.llm = new LLMClass({
      modelSource:     { url: model.pteUrl },
      tokenizerSource: { url: model.tokenizerUrl },
      systemPrompt:    this.opts.systemPrompt ?? '',
      temperature:     this.opts.temperature  ?? 0.8,
      topP:            this.opts.topP         ?? 0.95 });

    await this.llm.load();
    this._ready = true;
    logger.log(`[ExecutorchLLMInstance] ✅ 로드완료: ${this.opts.modelId}`);
  }

  isReady() { return this._ready; }

  async generate(prompt: string, genOpts: ExecutorchGenerateOptions = {}): Promise<string> {
    if (!this.llm || !this._ready) throw new Error('[ExecutorchLLMInstance] 모델 미로드');

    // [BUG-44 FIX] generate 실패 시 히스토리 롤백을 위해 이전 히스토리 길이 저장
    let response: string;
    try {
      response = await this.llm.generate(prompt, {
        maxTokens:           genOpts.maxTokens   ?? 256,
        temperature:         genOpts.temperature ?? this.opts.temperature ?? 0.8,
        topP:                genOpts.topP        ?? this.opts.topP        ?? 0.95,
        conversationHistory: this._history });
    } catch (e) {
      // generate 실패 시 히스토리는 변경하지 않고 예외 재발생
      throw e;
    }

    this._history.push({ role: 'user',      content: prompt });
    this._history.push({ role: 'assistant', content: response });

    return response;
  }

  /** 챕터 전환 시 호출 — MemoryManager.onChapterTransition()에서 사용 */
  clearHistory(): void {
    this._history = [];
    logger.log(`[ExecutorchLLMInstance] 히스토리 초기화 (${this.opts.modelId})`);
  }

  getHistory(): ConversationMessage[] { return [...this._history]; }

  async release(): Promise<void> {
    if (this.llm) {
      await this.llm.release?.();
      this.llm     = null;
      this._ready  = false;
      this._history = [];
    }
  }
}

// ── 챕터 전환 요약 전용 싱글톤 ───────────────────────────────────

let _executorchSummaryInstance: ExecutorchLLMInstance | null = null;
function getExecutorchSummaryInstance(): ExecutorchLLMInstance {
  if (!_executorchSummaryInstance) {
    _executorchSummaryInstance = new ExecutorchLLMInstance({
      modelId:      'llama-3.2-1b-executorch',
      systemPrompt: 'You are a concise summarizer. Summarize story chapters in 2-3 sentences.',
      temperature:  0.3,
      topP:         0.9 });
  }
  return _executorchSummaryInstance;
}
// [BUG-45 FIX] as unknown as YOUR_FIXME_INTERFACE 대신 타입 안전한 Proxy 패턴으로 교체 (다른 매니저와 동일)
export const executorchSummaryEngine = new Proxy({} as ExecutorchLLMInstance, {
  get(_t, p) {
    if (typeof p === 'symbol') return Reflect.get(getExecutorchSummaryInstance(), p);
    return (getExecutorchSummaryInstance() as unknown as Record<string, unknown>)[p as string];
  },
  set(_t, p, v) { (getExecutorchSummaryInstance() as unknown as Record<string|symbol, unknown>)[p] = v; return true; } });

// ── v0.7 TTS (Kokoro) — 감정 표현 나레이션 ───────────────────────
//
//  Kokoro TTS 모델: 감정 스타일 제어 가능
//  사용처: 씬 전환 / 나레이션 텍스트를 음성으로 출력
//
//  useTTS 훅은 React 컴포넌트 내부에서만 사용 가능
//  명령형 사용이 필요하면 ExecutorchTTSInstance 사용

export interface UseTTSOptions {
  /** 나레이션 텍스트 */
  text: string;
  /** 감정 스타일 (Kokoro 지원 스타일) */
  style?: 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful';
  /** 음성 속도 (0.5 ~ 2.0, 기본 1.0) */
  speed?: number;
}

export interface UseTTSResult {
  speak:     (opts: UseTTSOptions) => void;
  stop:      () => void;
  isSpeaking: boolean;
  isReady:   boolean;
  error:     string | null;
}

/**
 * useTTS — v0.7 Kokoro TTS 훅
 *
 * @example
 * const { speak, stop, isSpeaking } = useExecutorchTTS();
 * speak({ text: '어둠이 깔린 복도를 따라 발소리가 울렸다.', style: 'neutral' });
 */
export function useExecutorchTTS(): UseTTSResult {
  const unavailable: UseTTSResult = {
    speak: () => logger.warn('[ExecutorchEngine] TTS: react-native-executorch v0.7 미설치'),
    stop: () => {},
    isSpeaking: false,
    isReady:    false,
    error:      'react-native-executorch v0.7 미설치' };

  if (!useTTSHook) return unavailable;

  try {
    // eslint-disable-next-line
    const tts: ETTTSHookResult = useTTSHook({
      modelSource: {
        url: 'https://huggingface.co/software-mansion/react-native-executorch-kokoro/resolve/main/kokoro.pte' } });

    return {
      speak: ({ text, style = 'neutral', speed = 1.0 }: UseTTSOptions) => {
        tts.speak?.(text, { style, speed });
      },
      stop:       () => tts.stop?.(),
      isSpeaking: tts.isSpeaking  ?? false,
      isReady:    tts.isModelReady ?? false,
      error:      tts.error        ?? null };
  } catch (e) {
    logger.warn('[ExecutorchEngine] useTTS 초기화 실패:', e);
    return unavailable;
  }
}

/**
 * ExecutorchTTSInstance — Hook 외부 명령형 TTS (v0.7)
 *
 * 씬 전환 시 나레이션 텍스트를 음성으로 읽을 때 사용
 * React 컴포넌트 외부(서비스 레이어)에서 호출 가능
 */
export class ExecutorchTTSInstance {
  private tts: ETTTSInstance | null = null;
  private _ready = false;

  async load(): Promise<void> {
    let TTSClass: new (opts: { modelSource: { url: string } }) => ETTTSInstance;
    try {
      TTSClass = require('react-native-executorch').TTS;
      if (!TTSClass) throw new Error('TTS 클래스가 undefined');
    } catch (e) {
      const msg = '[ExecutorchTTSInstance] TTS 클래스 로드 실패 — react-native-executorch v0.7 필요';
      logger.error(msg, e);
      throw new Error(msg);
    }

    try {
      this.tts = new TTSClass({
        modelSource: {
          url: 'https://huggingface.co/software-mansion/react-native-executorch-kokoro/resolve/main/kokoro.pte' } });

      await this.tts.load?.();
      this._ready = true;
      logger.log('[ExecutorchTTSInstance] ✅ Kokoro TTS 로드 완료');
    } catch (e) {
      this.tts    = null;
      this._ready = false;
      logger.error('[ExecutorchTTSInstance] Kokoro TTS 초기화 실패:', e);
      throw e;
    }
  }

  isReady() { return this._ready; }

  async speak(text: string, style: 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' = 'neutral', speed = 1.0): Promise<void> {
    if (!this.tts || !this._ready) throw new Error('[ExecutorchTTSInstance] TTS 미로드');
    await this.tts.speak?.(text, { style, speed });
  }

  stop(): void {
    this.tts?.stop?.();
  }

  async release(): Promise<void> {
    this.tts?.release?.();
    this.tts    = null;
    this._ready = false;
  }
}

/** 나레이션 TTS 싱글톤 — 씬 전환 / 독백 나레이션 전용 */
export const executorchTTS = new ExecutorchTTSInstance();


