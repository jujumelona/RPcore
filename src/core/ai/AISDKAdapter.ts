import type { ChatOptions } from '../native/InferenceEngine';
import llamaEngine from '../llama/LlamaEngine';
import { logger } from '../../utils/logger';
import { getRpSamplingDefaults } from './RPGenerationConfig';
import { z } from 'zod';

type AIModule = {
  generateText?: (options: Record<string, unknown>) => Promise<{ text: string }>;
  streamText?: (options: Record<string, unknown>) => Promise<{ textStream?: AsyncIterable<string> }>;
  generateObject?: (options: Record<string, unknown>) => Promise<{ object: unknown }>;
};

let _aiModule: AIModule | null = null;

/** HMR/teardown 시 모듈 캐시 초기화 */
export function resetAISDKAdapter(): void {
  _aiModule = null;
}

function _getAIModule(): AIModule {
  if (!_aiModule) {
    try {
      _aiModule = require('ai') as AIModule;
    } catch (e) {
      logger.warn('[AISDKAdapter] ai SDK load failed, using local fallback:', e);
      _aiModule = {};
    }
  }

  return _aiModule ?? {};
}

const defaultRpSampling = getRpSamplingDefaults();

type LlamaStreamChunk =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'finish'; finishReason: string };

type LlamaFinishReason = 'stop' | 'length' | 'cancelled' | 'context_full' | 'unknown' | undefined;

export type OnDeviceSamplingOptions = Partial<Omit<ChatOptions, 'skipHistory'>>;

export type OnDeviceMessageInput = {
  role: string;
  content: unknown;
};

export type OnDeviceTextRequest = OnDeviceSamplingOptions & {
  inputFormat?: 'prompt' | 'messages';
  prompt?: string;
  messages?: OnDeviceMessageInput[];
  system?: string;
};

function toAISDKFinishReason(
  finishReason: LlamaFinishReason,
  shouldTrim = false,
): 'stop' | 'length' | 'error' {
  if (finishReason === 'length' || finishReason === 'context_full' || shouldTrim) {
    return 'length';
  }
  if (finishReason === 'stop') {
    return 'stop';
  }
  return 'error';
}

export const RPEmotionSchema = z.object({
  e1: z.number().int().min(-100).max(100).describe('Affinity delta'),
  e2: z.number().int().min(-100).max(100).describe('Trust delta'),
  e3: z.number().int().min(-100).max(100).describe('Joy delta'),
  e4: z.number().int().min(-100).max(100).describe('Arousal delta'),
  e5: z.number().int().min(-100).max(100).describe('Acceptance delta') });

export const RPCharacterOutputSchema = z.object({
  id: z.number().int().min(2).describe('Character ID'),
  dialogue: z.string().describe('Character dialogue'),
  action: z.string().optional().describe('Action block'),
  thought: z.string().optional().describe('Thought block'),
  emotion: RPEmotionSchema.optional().describe('Emotion delta') });

export const RPOutputSchema = z.object({
  narration: z.string().describe('Narration by speaker 0'),
  characters: z.array(RPCharacterOutputSchema).describe('Character outputs') });

export type RPOutput = z.infer<typeof RPOutputSchema>;

export interface OnDeviceModelConfig extends OnDeviceSamplingOptions {
  systemPrompt?: string;
}

export class LlamaAIModel {
  readonly specificationVersion = 'v1' as const;
  readonly provider = 'llama.rn';
  readonly modelId: string;
  readonly defaultObjectGenerationMode = 'json' as const;

  private config: OnDeviceModelConfig;

  constructor(modelId: string, config: OnDeviceModelConfig = {}) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: OnDeviceTextRequest): Promise<{
    text: string;
    finishReason: 'stop' | 'length' | 'error';
    usage: { promptTokens: number; completionTokens: number };
  }> {
    const userMessage = this._extractMessage(options);
    const chatOpts = this._resolveChatOptions(options);
    await this._applySystemPrompt(options.system);

    const text = await llamaEngine.generate(
      [{ role: 'user', content: userMessage }],
      { ...chatOpts, maxTokens: chatOpts.maxTokens ?? 400 },
    );
    const meta = llamaEngine.getLastCompletionMeta();

    // [BUG FIX] 토큰 추정 개선: length/3은 한국어에서 매우 부정확
    // 한국어 1글자 ≈ 1.5~2토큰, 영어 1글자 ≈ 0.25토큰 (4글자/토큰)
    // 실제 메타가 있으면 사용, 없으면 혼합 텍스트 기준 추정
    const estimateTokens = (str: string) => {
      if (!str) return 0;
      const korean = (str.match(/[가-힣]/g) ?? []).length;
      const other = str.length - korean;
      return Math.round(korean * 1.7 + other * 0.3);
    };

    return {
      text,
      finishReason: toAISDKFinishReason(meta?.finishReason),
      usage: {
        promptTokens: meta?.tokensEvaluated ?? estimateTokens(userMessage),
        completionTokens: meta?.tokensPredicted ?? estimateTokens(text) } };
  }

  async doStream(options: OnDeviceTextRequest): Promise<ReadableStream<LlamaStreamChunk>> {
    const userMessage = this._extractMessage(options);
    const chatOpts = this._resolveChatOptions(options);
    await this._applySystemPrompt(options.system);

    return new ReadableStream<LlamaStreamChunk>({
      start: (controller: ReadableStreamDefaultController<any>) => {
        llamaEngine.generate(
          [{ role: 'user', content: userMessage }],
          {
            ...chatOpts,
            maxTokens: chatOpts.maxTokens ?? 400,
            onToken: (token: string) => {
              controller.enqueue({ type: 'text-delta', textDelta: token });
            } },
        ).then(() => {
          const meta = llamaEngine.getLastCompletionMeta();
          controller.enqueue({
            type: 'finish',
            finishReason: toAISDKFinishReason(meta?.finishReason) });
          controller.close();
        }).catch((err) => {
          controller.enqueue({ type: 'finish', finishReason: 'error' });
          controller.close();
          logger.error('[LlamaAIModel] doStream failed:', err);
        });
      },
      cancel: () => {
        llamaEngine.stopGeneration().catch(() => {});
      } });
  }

  private _extractMessage(options: Pick<OnDeviceTextRequest, 'prompt' | 'messages'>): string {
    if (options.prompt) {
      return options.prompt;
    }
    if (options.messages?.length) {
      const last = options.messages[options.messages.length - 1];
      return typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
    }
    return '';
  }

  private async _applySystemPrompt(systemPrompt?: string): Promise<void> {
    const prompt = systemPrompt ?? this.config.systemPrompt;
    if (!prompt) {
      return;
    }
    // [BUG FIX] 시스템 프롬프트를 실제로 엔진에 적용
    // 기존: prompt 변수만 설정하고 아무 동작도 하지 않아 시스템 프롬프트가 무시됨
    // 수정: llamaEngine.setWarmupSystemPrompt()로 실제 적용
    llamaEngine.setWarmupSystemPrompt(prompt);
  }

  private _resolveChatOptions(overrides: OnDeviceSamplingOptions = {}): ChatOptions {
    const stopSequences = overrides.stopSequences ?? this.config.stopSequences;
    const logitBias = overrides.logitBias ?? this.config.logitBias;
    const banTokens = overrides.banTokens ?? this.config.banTokens;

    return {
      maxTokens: overrides.maxTokens ?? this.config.maxTokens,
      temperature: overrides.temperature ?? this.config.temperature,
      topP: overrides.topP ?? this.config.topP,
      topK: overrides.topK ?? this.config.topK,
      minP: overrides.minP ?? this.config.minP,
      typicalP: overrides.typicalP ?? this.config.typicalP,
      frequencyPenalty: overrides.frequencyPenalty ?? this.config.frequencyPenalty,
      presencePenalty: overrides.presencePenalty ?? this.config.presencePenalty,
      repeatPenalty: overrides.repeatPenalty ?? this.config.repeatPenalty,
      repeatLastN: overrides.repeatLastN ?? this.config.repeatLastN,
      dryMultiplier: overrides.dryMultiplier ?? this.config.dryMultiplier,
      dryBase: overrides.dryBase ?? this.config.dryBase,
      dryAllowedLength: overrides.dryAllowedLength ?? this.config.dryAllowedLength,
      dryPenaltyLastN: overrides.dryPenaltyLastN ?? this.config.dryPenaltyLastN,
      xtcProbability: overrides.xtcProbability ?? this.config.xtcProbability,
      xtcThreshold: overrides.xtcThreshold ?? this.config.xtcThreshold,
      topNSigma: overrides.topNSigma ?? this.config.topNSigma,
      seed: overrides.seed ?? this.config.seed,
      responseFormat: overrides.responseFormat ?? this.config.responseFormat,
      stopSequences: stopSequences ? [...stopSequences] : undefined,
      logitBias: logitBias ? [...logitBias] : undefined,
      banTokens: banTokens ? [...banTokens] : undefined };
  }
}

export const llamaAIModel = new LlamaAIModel('llama-local', {
  temperature: 0.8,
  topP: 0.95 });

export const llamaRPModel = new LlamaAIModel('llama-rp', {
  ...defaultRpSampling });

export async function generateOnDevice(
  prompt: string,
  options: ChatOptions = {},
): Promise<string> {
  if (llamaEngine.getState() !== 'ready') {
    throw new Error('[AISDKAdapter] model not initialized');
  }

  return llamaEngine.generateRaw(prompt, options.maxTokens ?? 400);
}

export async function streamOnDevice(
  prompt: string,
  onChunk: (chunk: string) => void,
  options: ChatOptions = {},
): Promise<void> {
  if (llamaEngine.getState() !== 'ready') {
    throw new Error('[AISDKAdapter] model not initialized');
  }

  await llamaEngine.generate(
    [{ role: 'user', content: prompt }],
    {
      ...options,
      maxTokens: options.maxTokens ?? 400,
      onToken: (token: string) => onChunk(token) },
  );
}

type GenerateTextRequest = {
  model?: LlamaAIModel;
  prompt: string;
  system?: string;
} & OnDeviceSamplingOptions;

export async function aiGenerateText(options: GenerateTextRequest): Promise<{ text: string }> {
  const { model = llamaAIModel, prompt, system, ...samplingOptions } = options;

  try {
    const { generateText } = _getAIModule();
    if (!generateText) {
      throw new Error('ai SDK unavailable');
    }

    return await generateText({
      model,
      prompt,
      system,
      ...samplingOptions });
  } catch (e) {
    logger.warn('[AISDKAdapter] generateText failed, falling back to local model:', e);
  }

  const result = await model.doGenerate({
    prompt,
    system,
    ...samplingOptions });

  return { text: result.text };
}

type StreamTextRequest = {
  model?: LlamaAIModel;
  prompt: string;
  system?: string;
  onChunk: (chunk: string) => void;
} & OnDeviceSamplingOptions;

export async function aiStreamText(options: StreamTextRequest): Promise<void> {
  const { model = llamaAIModel, prompt, system, onChunk, ...samplingOptions } = options;

  try {
    const { streamText } = _getAIModule();
    if (!streamText) {
      throw new Error('ai SDK unavailable');
    }

    const result = await streamText({
      model,
      prompt,
      system,
      ...samplingOptions });

    const textStream = result?.textStream;
    if (textStream && Symbol.asyncIterator in Object(textStream)) {
      for await (const chunk of textStream as AsyncIterable<string>) {
        onChunk(chunk);
      }
      return;
    }
  } catch (e) {
    logger.warn('[AISDKAdapter] streamText failed, falling back to local stream:', e);
  }

  const stream = await model.doStream({
    prompt,
    system,
    ...samplingOptions });

  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      if (value.type === 'text-delta') {
        onChunk(value.textDelta);
      }
    }
  }
}

type StructuredRPOutputRequest = {
  model?: LlamaAIModel;
  prompt: string;
  system?: string;
} & OnDeviceSamplingOptions;

export async function generateStructuredRPOutput(
  options: StructuredRPOutputRequest,
): Promise<RPOutput> {
  const {
    prompt,
    system,
    model = llamaRPModel,
    ...samplingOptions
  } = options;

  const requestOptions: OnDeviceSamplingOptions = {
    ...samplingOptions,
    maxTokens: samplingOptions.maxTokens ?? 700,
    temperature: samplingOptions.temperature ?? defaultRpSampling.temperature };

  try {
    const { generateObject } = _getAIModule();
    if (!generateObject) {
      throw new Error('ai SDK unavailable');
    }

    const result = await generateObject({
      model,
      schema: RPOutputSchema,
      prompt,
      system,
      ...requestOptions });

    return RPOutputSchema.parse(result.object);
  } catch (e) {
    logger.warn('[AISDKAdapter] generateObject failed, falling back to JSON mode:', e);
  }

  const jsonPrompt =
    `${prompt}\n\n` +
    'Respond ONLY with a valid JSON object matching this structure, no markdown:\n' +
    '{"narration":"...","characters":[{"id":2,"dialogue":"...","emotion":{"e1":0,"e2":0,"e3":0,"e4":0,"e5":0}}]}';

  const { text: raw } = await model.doGenerate({
    prompt: jsonPrompt,
    system,
    ...requestOptions,
    responseFormat: 'json_object' });

  try {
    const clean = raw.replace(/```json\s*|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return RPOutputSchema.parse(parsed);
  } catch (e) {
    logger.warn('[AISDKAdapter] JSON parsing failed, returning narration fallback:', e);
    return {
      narration: raw.trim(),
      characters: [] };
  }
}
