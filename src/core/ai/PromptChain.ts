// src/core/ai/PromptChain.ts
// ═══════════════════════════════════════════════════════════════════
// Lobe Chat Plugin / LangChain 프롬프트 체이닝 패턴 이식
//
// ✅ 복수 프롬프트를 순차 실행
// ✅ 이전 출력을 다음 입력 컨텍스트로 자동 전달
// ✅ 템플릿 변수 바인딩 ({{variable}})
// ✅ 단계별 에러 핸들링 + 폴백
// ✅ 실행 로그 / 소요 시간 추적
// ═══════════════════════════════════════════════════════════════════

import { aiGenerateText } from './AISDKAdapter';
import { logger } from '../../utils/logger';

// ── Types ──────────────────────────────────────────────────────────

export interface ChainStep {
  /** 스텝 이름 (로그용) */
  name: string;
  /** 프롬프트 템플릿 — {{previous_output}}, {{user_input}} 등 변수 사용 가능 */
  promptTemplate: string;
  /** 시스템 프롬프트 (선택) */
  systemPrompt?: string;
  /** 최대 토큰 수 (기본 400) */
  maxTokens?: number;
  /** temperature (기본 스텝별 커스텀 가능) */
  temperature?: number;
  /** 출력 후처리 함수 */
  postProcess?: (output: string) => string;
  /** 조건부 실행 — false 반환 시 이 스텝 건너뜀 */
  condition?: (context: ChainContext) => boolean;
  /** 이 스텝 실패 시 폴백 텍스트 */
  fallback?: string;
}

export interface ChainContext {
  /** 현재까지의 모든 스텝 출력 (스텝 이름 → 텍스트) */
  outputs: Record<string, string>;
  /** 가장 최근 스텝의 출력 */
  previousOutput: string;
  /** 사용자 입력 (체인 시작 시 전달) */
  userInput: string;
  /** 커스텀 변수 (체인 시작 시 전달) */
  variables: Record<string, string>;
}

export interface ChainResult {
  /** 최종 출력 텍스트 */
  finalOutput: string;
  /** 각 스텝의 출력 */
  stepOutputs: Record<string, string>;
  /** 실행된 스텝 수 */
  stepsExecuted: number;
  /** 건너뛴 스텝 수 */
  stepsSkipped: number;
  /** 실패한 스텝 수 (폴백 사용) */
  stepsFailed: number;
  /** 총 소요 시간 (ms) */
  totalDurationMs: number;
  /** 각 스텝의 소요 시간 */
  stepDurations: Record<string, number>;
}

// ── Template Engine ───────────────────────────────────────────────

function resolveTemplate(template: string, context: ChainContext): string {
  let result = template;

  // 빌트인 변수
  result = result.replace(/\{\{previous_output\}\}/g, context.previousOutput);
  result = result.replace(/\{\{user_input\}\}/g, context.userInput);

  // 스텝별 출력 변수: {{step:감정분석}}
  result = result.replace(/\{\{step:([^}]+)\}\}/g, (_match, stepName: string) => {
    return context.outputs[stepName.trim()] ?? '';
  });

  // 커스텀 변수
  for (const [key, value] of Object.entries(context.variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return result;
}

// ── PromptChain ───────────────────────────────────────────────────

export class PromptChain {
  private steps: ChainStep[] = [];
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  /** 스텝 추가 (빌더 패턴) */
  addStep(step: ChainStep): PromptChain {
    this.steps.push(step);
    return this;
  }

  /** 체인 실행 */
  async execute(
    userInput: string,
    variables: Record<string, string> = {},
  ): Promise<ChainResult> {
    const startTime = Date.now();

    const context: ChainContext = {
      outputs: {},
      previousOutput: '',
      userInput,
      variables };

    const stepDurations: Record<string, number> = {};
    let stepsExecuted = 0;
    let stepsSkipped = 0;
    let stepsFailed = 0;

    logger.log(`[PromptChain:${this._name}] 시작 — ${this.steps.length}스텝`);

    for (const step of this.steps) {
      // 조건부 실행 체크
      if (step.condition && !step.condition(context)) {
        logger.log(`[PromptChain] ⏭ "${step.name}" 건너뜀 (조건 미충족)`);
        stepsSkipped++;
        continue;
      }

      const stepStart = Date.now();

      try {
        // 프롬프트 빌드
        const prompt = resolveTemplate(step.promptTemplate, context);

        // AI 호출
        const { text } = await aiGenerateText({
          prompt,
          system: step.systemPrompt,
          maxTokens: step.maxTokens ?? 400,
          temperature: step.temperature });

        // 후처리
        const output = step.postProcess ? step.postProcess(text) : text;

        // 컨텍스트 업데이트
        context.outputs[step.name] = output;
        context.previousOutput = output;
        stepsExecuted++;

        stepDurations[step.name] = Date.now() - stepStart;
        logger.log(
          `[PromptChain] ✅ "${step.name}" 완료 (${stepDurations[step.name]}ms, ${output.length}자)`,
        );
      } catch (e) {
        stepDurations[step.name] = Date.now() - stepStart;
        stepsFailed++;

        if (step.fallback !== undefined) {
          context.outputs[step.name] = step.fallback;
          context.previousOutput = step.fallback;
          logger.warn(`[PromptChain] ⚠️ "${step.name}" 실패 → 폴백 사용:`, e);
        } else {
          logger.error(`[PromptChain] ❌ "${step.name}" 실패 (폴백 없음):`, e);
          // 폴백 없으면 이전 출력 유지
        }
      }
    }

    const totalDurationMs = Date.now() - startTime;
    logger.log(
      `[PromptChain:${this._name}] 완료 — ` +
      `실행 ${stepsExecuted}, 건너뜀 ${stepsSkipped}, 실패 ${stepsFailed}, ` +
      `총 ${totalDurationMs}ms`,
    );

    return {
      finalOutput: context.previousOutput,
      stepOutputs: context.outputs,
      stepsExecuted,
      stepsSkipped,
      stepsFailed,
      totalDurationMs,
      stepDurations };
  }
}

// ── 프리셋 체인 팩토리 ────────────────────────────────────────────

/** RP(롤플레이) 감정 분석 → 대사 생성 2단계 체인 */
export function createEmotionAwareChain(): PromptChain {
  return new PromptChain('emotion-aware-response')
    .addStep({
      name: '감정분석',
      promptTemplate:
        'Analyze the emotional context of this interaction.\n\n' +
        'User said: "{{user_input}}"\n\n' +
        'Output a brief JSON: {"mood":"...", "intensity":1-10, "trigger":"..."}',
      maxTokens: 100,
      temperature: 0.3,
      postProcess: (output) => {
        // JSON 추출
        const match = output.match(/\{[\s\S]*\}/);
        return match ? match[0] : output;
      },
      fallback: '{"mood":"neutral","intensity":5,"trigger":"unknown"}' })
    .addStep({
      name: '대사생성',
      promptTemplate:
        'Based on the emotional analysis:\n{{step:감정분석}}\n\n' +
        'Generate a character response to: "{{user_input}}"\n\n' +
        'The response should match the detected mood and intensity.',
      maxTokens: 400,
      temperature: 0.85 });
}

/** 스토리 요약 → 다음 전개 분석 → 서술 생성 3단계 체인 */
export function createNarrativeChain(): PromptChain {
  return new PromptChain('narrative-generation')
    .addStep({
      name: '상황요약',
      promptTemplate:
        'Summarize the current story situation in 2 sentences:\n\n{{user_input}}',
      maxTokens: 80,
      temperature: 0.3 })
    .addStep({
      name: '전개분석',
      promptTemplate:
        'Given this situation: {{step:상황요약}}\n\n' +
        'Suggest 2-3 possible narrative directions. Output as a comma-separated list.',
      maxTokens: 100,
      temperature: 0.7 })
    .addStep({
      name: '서술생성',
      promptTemplate:
        'Situation: {{step:상황요약}}\n' +
        'Possible directions: {{step:전개분석}}\n' +
        'User input: {{user_input}}\n\n' +
        'Write the next scene using the most fitting direction.',
      maxTokens: 500,
      temperature: 0.85 });
}
