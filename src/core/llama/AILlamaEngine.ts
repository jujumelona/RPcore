﻿// src/core/llama/AILlamaEngine.ts
// ═══════════════════════════════════════════════════════════════════
// Vercel AI SDK 스타일 래퍼 — llamaEngine(llama.rn) 직접 위임
//
// 장점:
//   ✅ 단일 llama.rn 바이너리 사용 — 버전 충돌 없음
//   ✅ Vercel AI SDK 스타일 generateText / streamText 유지
//   ✅ AbortController 기반 스트림 취소
//
// 사용처:
//   - AIStoryChatScreen.tsx (외부 AI API 콜 대신 온디바이스)
//   - 테스트 / 빠른 프로토타입 화면
//
// 메인 RP 엔진 (LlamaEngine.ts)는 별도로 유지
// ═══════════════════════════════════════════════════════════════════

import llamaEngine, { type ChatMessage } from './LlamaEngine';
import { MODELS, DEFAULT_MODEL_ID } from '../../models/ModelConfig';
import modelDownloader from './ModelDownloader';
export { generateStructuredRPOutput, llamaRPModel } from '../ai/AISDKAdapter';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  maxTokens?:   number;
  temperature?: number;
  onChunk?:     (chunk: string) => void;
  signal?:      AbortSignal;
}

export interface GenerateResult {
  text: string;
}

// ── AILlamaEngine ─────────────────────────────────────────────────

class AILlamaEngine {
  private _loadedModelId: string | null = null;

  /** 모델 로드 (이미 로드된 경우 재사용) */
  async load(modelId = DEFAULT_MODEL_ID): Promise<void> {
    // [BUG FIX] this._loadedModelId 체크만으로는 불충분
    // LlamaEngine이 다른 코드 경로로 다른 모델을 로드했을 때
    // _loadedModelId가 stale 상태로 남아 실제 모델과 불일치할 수 있음.
    // llamaEngine.getLoadedModelId() === modelId 도 함께 확인해야
    // 실제 LlamaEngine 상태가 요청 모델과 일치함을 보장할 수 있음.
    if (
      this._loadedModelId === modelId &&
      llamaEngine.getLoadedModelId() === modelId &&
      llamaEngine.getState() === 'ready'
    ) return;

    const exists = await modelDownloader.isModelDownloaded(modelId);
    if (!exists) throw new Error(`모델 미다운로드: ${modelId}`);

    const modelInfo = MODELS.find(m => m.id === modelId);
    llamaEngine.setWarmupSystemPrompt(
      `Vercel AI SDK 호환 온디바이스 추론. Model: ${modelInfo?.name ?? modelId}`,
    );

    // LlamaEngine.load()가 내부적으로 DeviceProfiler 호출 + 파라미터 결정
    await llamaEngine.load(modelId);
    this._loadedModelId = modelId;
  }

  /**
   * 텍스트 생성 (Vercel AI SDK generateText 스타일)
   */
  async generateText(
    messages: AIMessage[],
    opts: Omit<StreamOptions, 'onChunk' | 'signal'> = {},
  ): Promise<GenerateResult> {
    if (!this._loadedModelId) throw new Error('모델 미로드 — load()를 먼저 호출하세요');

    const chatMessages: ChatMessage[] = messages.map(m => ({
      role:    m.role,
      content: m.content }));

    const text = await llamaEngine.generate(chatMessages, {
      maxTokens:   opts.maxTokens   ?? 400,
      temperature: opts.temperature ?? 0.7 });

    return { text };
  }

  /**
   * 스트리밍 텍스트 생성 (Vercel AI SDK streamText 스타일)
   */
  async streamText(
    messages: AIMessage[],
    opts: StreamOptions = {},
  ): Promise<GenerateResult> {
    if (!this._loadedModelId) throw new Error('모델 미로드 — load()를 먼저 호출하세요');

    const { maxTokens = 400, temperature = 0.7, onChunk, signal } = opts;
    const chatMessages: ChatMessage[] = messages.map(m => ({
      role:    m.role,
      content: m.content }));

    let aborted = false;
    // ✅ [FIX] AbortSignal 리스너 누수 수정
    // 기존: signal?.addEventListener('abort', handler) 만 등록하고
    //       streamText() 완료 후 removeEventListener를 호출하지 않음.
    //       -> AbortController가 살아있는 동안 handler 클로저가
    //         llamaEngine 레퍼런스를 붙잡아 GC 수거 지연.
    // 수정: handler를 named 변수로 분리 -> try/finally로 항상 제거.
    //
    // ✅ [FIX] signal 이미 aborted 상태 조기 처리
    // signal?.aborted가 true인 채로 진입하면 addEventListener가 즉시 handler를
    // 동기 호출하지 않으므로 generate()가 시작된 후에야 abort를 감지함.
    // 진입 시점에 aborted 상태면 즉시 throw -> generate() 호출 자체를 생략.
    if (signal?.aborted) {
      throw new Error('[AILlamaEngine] AbortSignal already aborted before generation');
    }
    const abortHandler = () => {
      aborted = true;
      // stopGeneration()은 Promise를 반환하지만 abort 콜백에서 await 불가.
      // reject 시 unhandled rejection이 되지 않도록 .catch(() => {}) 처리 (의도적 무시).
      llamaEngine.stopGeneration().catch(() => {});
    };
    signal?.addEventListener('abort', abortHandler);

    try {
      const text = await llamaEngine.generate(chatMessages, {
        maxTokens,
        temperature,
        onToken: (token) => {
          if (aborted) return;
          onChunk?.(token);
        } });

      return { text };
    } finally {
      // signal이 이미 aborted 상태여도 removeEventListener는 안전하게 no-op
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  async release(): Promise<void> {
    this._loadedModelId = null;
    // LlamaEngine은 앱 수명 내내 공유됨 — 여기서 직접 release하지 않음
  }
}

export const aiLlamaEngine = new AILlamaEngine();
export default aiLlamaEngine;
