/* eslint-disable @typescript-eslint/no-unused-vars */
// src/core/orchestrator/SequentialGenerator.ts
// 순차 생성 — llamaEngine (llama.rn) 직접 사용

import llamaEngine from '../llama/LlamaEngine';
import { logger } from '../../utils/logger';
import { responseFilter } from '../../filter/ResponseFilter';
import { actionExecutor } from '../langgraph/ActionExecutor';

export interface GenerationAction {
  id: string;
  type: 'narration' | 'character' | 'state_update';
  characterId?: string;
  guide: string;
  style?: string;
}

export interface GenerationResult {
  actionId: string;
  content: string;
  duration: number;
  backend: string;
}

export type ProgressCallback = (
  currentIndex: number,
  total: number,
  result: GenerationResult,
) => void;

export class SequentialGenerator {
  private isGenerating: boolean = false;
  private shouldStop: boolean = false;

  async generateSequence(
    actions: GenerationAction[],
    onProgress?: ProgressCallback,
  ): Promise<GenerationResult[]> {
    const state = llamaEngine.getState();
    if (state !== 'ready') {
      throw new Error('[Sequential] llamaEngine이 준비되지 않았습니다. load()를 먼저 호출하세요.');
    }

    // [BUG FIX] 동시 호출 진입 가드 없음 수정
    // 이전: isGenerating 체크 없이 진입 → 두 번 연속 호출 시 두 스트림이 llamaEngine 경쟁
    // 수정: 이미 생성 중이면 에러로 빠르게 실패 (caller가 상태 확인 후 재시도 가능)
    if (this.isGenerating) {
      throw new Error('[Sequential] 이미 생성 중입니다. 완료 후 재시도하세요.');
    }

    const backendInfo = llamaEngine.getBackendInfo();
    const backend = backendInfo ? `${backendInfo.engine}/${backendInfo.backend}` : 'llama';

    this.isGenerating = true;
    this.shouldStop = false;
    const results: GenerationResult[] = [];

    try {
    for (let i = 0; i < actions.length; i++) {
      if (this.shouldStop) break;

      const action = actions[i];
      const startTime = Date.now();

      try {
        const prompt = this._buildPrompt(action);
        const maxTokens = action.type === 'narration' ? 200 : 300;
        // [BUG FIX] state_update는 생성 없이 바로 처리
        if (action.type === 'state_update') {
          await actionExecutor.executeAction({
            id: action.id,
            type: action.type,
            guide: action.guide,
            content: prompt });
          continue;
        }
        // character/narration: llamaEngine.generateRaw로 직접 생성
        // actionExecutor를 경유하면 내부에서 inferenceManager.generate()를 또 호출하므로
        // llamaEngine이 두 번 호출되는 이중 실행 버그 발생
        // [BUG FIX] actionExecutor 경유 제거 — llamaEngine 직접 호출
        const rawResponse = await llamaEngine.generateRaw(prompt, maxTokens);

        let cleaned = responseFilter.clean(rawResponse);
        if (action.style) {
          cleaned = responseFilter.applyStyleSuffix(cleaned, action.style);
        }

        const duration = Date.now() - startTime;
        const result: GenerationResult = { actionId: action.id, content: cleaned, duration, backend };
        results.push(result);
        onProgress?.(i + 1, actions.length, result);
      } catch (error) {
        logger.error(`[Sequential] ❌ ${action.id} 오류:`, error);
        results.push({ actionId: action.id, content: '[생성 오류]', duration: Date.now() - startTime, backend: 'ERROR' });
      }
    }
    } finally {
      // [BUG FIX #31] 예외 발생 시에도 isGenerating이 반드시 false로 리셋되도록 finally 사용
      this.isGenerating = false;
    }

    return results;
  }

  stop(): void {
    if (this.isGenerating) {
      this.shouldStop = true;
      // [BUG FIX] stop()은 동기 함수이므로 현재 실행 중인 llamaEngine.generateRaw()가
      // 완료된 이후에야 for 루프의 shouldStop 체크가 실행됨.
      // stopGeneration()을 fire-and-forget으로 호출해 네이티브 레이어 중단 신호 전송.
      // 완전한 즉시 중단이 필요하면 stop() 대신 await stopAsync()를 호출할 것.
      llamaEngine.stopGeneration().catch(() => {});
    }
  }

  /** stop()의 async 버전 — 중단 완료를 기다려야 할 때 사용 */
  async stopAsync(): Promise<void> {
    if (this.isGenerating) {
      this.shouldStop = true;
      await llamaEngine.stopGeneration().catch(() => {});
    }
  }

  getIsGenerating(): boolean { return this.isGenerating; }

  calculateProgress(current: number, total: number): number {
    return Math.round((current / total) * 100);
  }

  private _buildPrompt(action: GenerationAction): string {
    if (action.type === 'narration') {
      return `[Narration Generation]\nGenerate a vivid narration following this guide:\n${action.guide}\n\nWrite 7-10 sentences describing the scene, atmosphere, and characters' expressions.\nFocus on sensory details and emotional undertones.\n\nNarration:`;
    }
    return `[Character Response]\nYou are Character ${action.characterId}.\nGuide: ${action.guide}\n\nGenerate character's natural response following the guide.\nInclude inner thoughts, actions, and dialogue.\n\nResponse:`;
  }
}

export const sequentialGenerator = new SequentialGenerator();
