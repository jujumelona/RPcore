/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/chat/core/ChatEngineCore.ts
 * Chat screen state orchestration for the refactored chat UI.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { UI_MESSAGE_LIMIT, UI_TRIM_THRESHOLD, SESSION_RESTORE_LIMIT } from '../../../constants/chatLimits';
import { nanoid } from 'nanoid/non-secure';
import { useModelStore } from '../../../store/modelStore';
import llamaEngine from '../../../core/llama/LlamaEngine';
import type { GenerateOptions } from '../../../core/llama/LlamaEngine';
import kvOffsetTracker from '../../../core/llama/KVOffsetTracker';
import type {
  ChatMessage,
  ChoiceOption,
  MessageState,
  StreamingState,
  UIState,
  EmotionState,
  SessionState,
  ErrorState,
  ChatEvent,
  ChatEventHandler } from '../types/ChatTypes';
import type { EditorEmotions, StoryConfig } from '../../../types/StoryContract';
import type { Story } from '../../../types/navigation';
import { useChatStore, type ChatSession, type ChatMessage as StoredChatMessage } from '../../../store/chatStore';
import { createUserMessage,
  createAIMessage } from '../utils/ChatMessageUtils';
import { normalizeEmotion, updateEmotionWithSpring, releaseStorySharedValues } from '../../../store/emotionSharedStore';
import { logger } from '../../../utils/logger';
import { toStoredMessageFromCore,
  fromStoredMessageToCore,
  buildDialogueHistoryFromCore,
  extractCharactersFullFromStory } from '../utils/ChatUtils';
import {
  buildKVCompletionPayload,
  buildKVPromptLayers,
  getPromptFingerprint,
} from '../../../utils/PromptEngine';
import { buildLocalizedIntroMessages } from '../utils/buildLocalizedIntroMessages';
import { checkContentSafety, checkStreamingSafety } from '../../../filter/ContentSafetyLayer';
import { parseAIOutputMulti } from '../../../utils/chatParsers';
import { useKVSession } from '../../../hooks/useKVSession';
import { ApiConfig } from '../../../config/ApiConfig';
import { chapterLogTracker } from '../../../utils/ChapterLogTracker';
import { useLanguageStore } from '../../../store/languageStore';
import { applyUserNameStr } from '../../../store/userProfileStore';
import { getNormalizedChatStoryConfig,
  normalizeChatStoryPayload } from '../utils/normalizeStoryForChat';
import { CHAT_USER_PLACEHOLDER } from '../../../utils/chatUserName';
import { resolveStoryModelId } from '../../../utils/storyModelMeta';

import { StoryConfigSchema,
  StoryResponseSchema } from '../../../types/schemas';
import { ToastService } from '../../../components/Toast';
import { MODEL_GENERATION_BUDGET,
  DEFAULT_N_PREDICT,
  type ModelGenerationBudgetKey } from '../../../core/ai/RPGenerationConfig';
import { buildRuntimeLanguageControls } from './languageRuntimeControls';
import { isRuntimeInterferenceSuspended, suspendRuntimeInterference } from '../../../utils/RuntimeInterferenceGuard';
import {
  storyAdapterManager,
  type StoryLoraAdapterSelection,
} from '../../../core/llama/StoryAdapterManager';

const DEFAULT_EMOTIONS: EditorEmotions = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };

function pickStoryText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function shouldInjectCoreKnowledgeForTurn(userInput: string): boolean {
  const compact = userInput.replace(/\s+/g, '').trim();
  if (!compact) return false;

  const semanticChars = compact.replace(/[^0-9A-Za-z\uAC00-\uD7AF]/g, '');
  if (/^(?:\uC548\uB155|hello|hi|hey)\b/i.test(compact) && compact.length < 16) return false;
  return semanticChars.length >= 14;
}

function compactCoreKnowledgeText(content: string, maxChars = 180): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxChars) return compact;

  const sliced = compact.slice(0, maxChars);
  const lastSentenceBoundary = Math.max(
    sliced.lastIndexOf('.'),
    sliced.lastIndexOf('!'),
    sliced.lastIndexOf('?'),
    sliced.lastIndexOf('??'),
  );

  if (lastSentenceBoundary >= Math.floor(maxChars * 0.45)) {
    return sliced.slice(0, lastSentenceBoundary + 1).trim();
  }

  return `${sliced.trim()}...`;
}

const STORY_LOG_TERMINAL_RE = /^\[L:\s*[^\]]+\](?:\s*\[(?:[2-9]|[1-9][0-9]):[^\]]+\])+\s*\[Ev:\s*[^\]]+\]\s*$/;
const STRUCTURED_DIALOGUE_LINE_RE = /(^|\n)\s*(?:0|[2-9]|[1-9][0-9])\s*:\s*\S+/;
const MAX_INVALID_OUTPUT_RETRIES = 0;
const RUNTIME_CONTROL_LINE_PATTERNS = [
  /^\[(?:RETRY_FIX|RESPONSE RULE|END RULE|LANGUAGE RULE|\uC751\uB2F5\s*\uC9C0\uC2DC|\uB2F5\uBCC0\s*\uC9C0\uC2DC|\uADDC\uCE59\s*\uB05D)\]/i,
  /^(?:target_language|reasons|must_match_target_language|continue_scene_in_character|forbid_char_1_dialogue|allowed_speakers|require_character_dialogue|require_terminal_story_log|forbid_brief_acknowledgement|forbid_meta_text|forbid_language_drift|format_example|output_language|mode|forbid_assistant_tone|forbid_intro_repeat|min_ai_lines|min_ai_chars|require_scene_texture|forbid_story_log_only|require_character_dialogue_before_story_log|story_log_example|forbid_story_log_placeholders)=/i,
];
const GENERIC_ASSISTANT_PATTERNS = [
  /how can i help/i,
  /what do you need/i,
  /tell me more/i,
  /i can help/i,
];
const META_RECAP_PATTERNS = [
  /(?:^|\n)\s*(?:\uC774\uC804|\uBC29\uAE08)\s*\uB2F5\uBCC0(?:\uC740|\uC744)?\s*\uB2E4\uC74C\uACFC\s*\uAC19\uC2B5\uB2C8\uB2E4[:：]?/i,
  /(?:^|\n)\s*(?:previous|prior|earlier)\s+(?:answer|response)\b[^:\n]*[:：]?/i,
];

function resolveKvPressureAdjustedNPredict(baseNPredict: number, kvRatio: number): number {
  if (!Number.isFinite(baseNPredict) || baseNPredict <= 0) return DEFAULT_N_PREDICT;
  if (!Number.isFinite(kvRatio) || kvRatio <= 0) return baseNPredict;

  if (kvRatio >= 0.9) return Math.max(220, Math.floor(baseNPredict * 0.55));
  if (kvRatio >= 0.85) return Math.max(260, Math.floor(baseNPredict * 0.65));
  if (kvRatio >= 0.75) return Math.max(320, Math.floor(baseNPredict * 0.8));
  return baseNPredict;
}

function getLastNonEmptyLine(text: string): string {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i]?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

const LEAKED_USER_PREFIX_RE = /^(?:\[\s*user\s*\]\s*:?\s*|user\s*:\s*|you\s*:\s*|player\s*:\s*|1\s*:\s*)+/i;
const PROMPT_ARTIFACT_HEADER_RE = /^\[(?:CORE KNOWLEDGE|CORE MEMO|INTRO|CHARACTERS|USER(?:\s*[??]\s*CHAR\s*\d+)?|WORLD|RULES?|SYSTEM)\]\s*$/i;
const PROMPT_ARTIFACT_INLINE_RE = /\[(?:CORE KNOWLEDGE|CORE MEMO|INTRO|CHARACTERS|USER(?:\s*[??]\s*CHAR\s*\d+)?|WORLD|RULES?|SYSTEM)\]/i;

function stripLeakedUserSpeakerPrefix(text: string): string {
  let current = text.trim();

  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(LEAKED_USER_PREFIX_RE, '').trim();
    if (next === current) break;
    current = next;
  }

  return current;
}

function stripInjectedKnowledgeBlocks(text: string): string {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  let skippingKnowledgeBlock = false;

  for (const originalLine of lines) {
    const trimmed = originalLine.trim();

    if (PROMPT_ARTIFACT_HEADER_RE.test(trimmed)) {
      skippingKnowledgeBlock = true;
      continue;
    }

    if (skippingKnowledgeBlock) {
      if (/^(?:\d+\s*:|\[L:\s*)/.test(trimmed)) {
        skippingKnowledgeBlock = false;
      } else if (!trimmed) {
        continue;
      } else {
        continue;
      }
    }

    cleaned.push(originalLine);
  }

  return cleaned.join('\n').trim();
}

function stripRuntimeControlText(text: string): string {
  const withoutRetryBlock = text.replace(/\n?\[RETRY_FIX\][\s\S]*$/i, '').trim();
  if (!withoutRetryBlock) return '';

  return withoutRetryBlock
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !RUNTIME_CONTROL_LINE_PATTERNS.some(pattern => pattern.test(line)))
    .join('\n')
    .trim();
}

function containsPromptEcho(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\[RETRY_FIX\]/i.test(trimmed)) return true;
  if (PROMPT_ARTIFACT_INLINE_RE.test(trimmed)) return true;
  if (META_RECAP_PATTERNS.some(pattern => pattern.test(trimmed))) return true;
  if ((trimmed.match(/(?:^|\n)\s*\d+\.\s*(?:0|[1-9][0-9]*)\s*:/g) ?? []).length >= 2) return true;
  return trimmed
    .split('\n')
    .some(line => RUNTIME_CONTROL_LINE_PATTERNS.some(pattern => pattern.test(line.trim())));
}

function shouldRetryInvalidRpOutput(reasons: string[]): boolean {
  return reasons.includes('missing_character_dialogue')
    || reasons.includes('language_mismatch')
    || reasons.includes('generic_assistant_tone')
    || reasons.includes('prompt_echo_generated')
    || reasons.includes('repeated_scene_content')
    || reasons.includes('underdeveloped_response');
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function detectLanguageMismatch(raw: string, targetLanguage: string): boolean {
  const normalized = stripInjectedKnowledgeBlocks(stripRuntimeControlText(raw))
    .replace(/^\[L:\s*[^\]]+\](?:\s*\[(?:[2-9]|[1-9][0-9]):[^\]]+\])+\s*\[Ev:\s*[^\]]+\]\s*$/gm, ' ')
    .replace(/(^|\n)\s*(?:0|[1-9][0-9]*)\s*:\s*/g, ' ')
    .replace(/[#*][^#*\n]+[#*]/g, ' ')
    .replace(/\{u\}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length < 24) return false;

  const englishWords = normalized.toLowerCase().match(/\b[a-z][a-z'-]{1,}\b/g) ?? [];
  const englishWordCount = englishWords.length;
  const englishFunctionWordHits = englishWords.filter(word => new Set([
    'the', 'and', 'that', 'with', 'from', 'this', 'have', 'your', 'you', 'into',
    'they', 'them', 'their', 'there', 'then', 'still', 'only', 'just', 'what',
    'when', 'where', 'which', 'while', 'door', 'room', 'hallway', 'quiet', 'empty',
  ]).has(word)).length;

  const hangulCount = countMatches(normalized, /[\uAC00-\uD7AF]/g);
  const kanaCount = countMatches(normalized, /[\u3040-\u30FF]/g);
  const hanCount = countMatches(normalized, /[\u3400-\u9FFF]/g);
  const cyrillicCount = countMatches(normalized, /[\u0400-\u04FF]/g);
  const thaiCount = countMatches(normalized, /[\u0E00-\u0E7F]/g);
  const devanagariCount = countMatches(normalized, /[\u0900-\u097F]/g);
  const arabicCount = countMatches(normalized, /[\u0600-\u06FF]/g);
  const nonLatinScriptCount = hangulCount + kanaCount + hanCount + cyrillicCount + thaiCount + devanagariCount + arabicCount;

  switch (targetLanguage) {
    case 'ko':
      return hangulCount < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'ja':
      return (kanaCount + hanCount) < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'zh-CN':
    case 'zh-TW':
      return hanCount < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'ru':
      return cyrillicCount < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'th':
      return thaiCount < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'hi':
      return devanagariCount < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'ar':
      return arabicCount < 3 && englishWordCount >= 3 && englishFunctionWordHits >= 1;
    case 'en':
      return englishWordCount < 4 && nonLatinScriptCount >= 4;
    default:
      return englishWordCount >= 6 && englishFunctionWordHits >= 2 && nonLatinScriptCount < 4;
  }
}

function sanitizeDialogueHistoryForTargetLanguage(
  historyLines: string[],
  targetLanguage: string,
): string[] {
  return historyLines
    .map(line => stripInjectedKnowledgeBlocks(stripRuntimeControlText(line)))
    .filter((trimmed) => {
      if (!trimmed) return false;
      if (containsPromptEcho(trimmed)) return false;
      if (/^1\s*:/.test(trimmed)) return true;
      if (!/^(?:0|[2-9]|[1-9][0-9])\s*:/.test(trimmed)) return true;
      return !detectLanguageMismatch(trimmed, targetLanguage);
    });
}

function shouldForceLongformRecovery(
  content: string,
  completionMeta: ReturnType<typeof llamaEngine.getLastCompletionMeta>,
  reasons: string[],
): boolean {
  const compactLength = content.replace(/\s+/g, '').length;
  const predictedTokens = completionMeta?.tokensPredicted ?? 0;
  return (
    reasons.includes('underdeveloped_response')
    || reasons.includes('repeated_scene_content')
    || (
      (completionMeta?.finishReason === 'stop' || completionMeta?.finishReason === 'unknown')
      && predictedTokens > 0
      && predictedTokens <= 24
      && compactLength <= 40
    )
  );
}

function normalizeRepeatComparableText(text: string): string {
  return stripInjectedKnowledgeBlocks(stripRuntimeControlText(text))
    .replace(/^\s*(?:0|[1-9][0-9]*)\s*:\s*/gm, '')
    .replace(/^\s*\[L:\s*[^\]]+\](?:\s*\[(?:[2-9]|[1-9][0-9]):[^\]]+\])+\s*\[Ev:\s*[^\]]+\]\s*$/gm, ' ')
    .replace(/\{u\}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasRepeatedSceneContent(
  parsed: ReturnType<typeof parseAIOutputMulti>,
  referenceTexts: string[],
): boolean {
  const referenceSet = new Set(
    referenceTexts
      .map(normalizeRepeatComparableText)
      .filter(text => text.length >= 32),
  );

  if (referenceSet.size === 0) return false;

  const generatedCandidates = parsed.lines
    .filter(line => line.role === 'ai' || line.role === 'narrator')
    .map(line => normalizeRepeatComparableText(line.content))
    .filter(text => text.length >= 32);

  return generatedCandidates.some((candidate) => {
    if (referenceSet.has(candidate)) return true;
    return Array.from(referenceSet).some((reference) => {
      const minLen = Math.min(candidate.length, reference.length);
      const maxLen = Math.max(candidate.length, reference.length);
      if (minLen < 32 || maxLen === 0) return false;
      if (maxLen - minLen > 12) return false;
      if (minLen / maxLen < 0.97) return false;
      return candidate.startsWith(reference) || reference.startsWith(candidate);
    });
  });
}

function normalizeRepeatTailToken(token: string): string {
  return token
    .replace(/^[^0-9A-Za-z\uAC00-\uD7AF]+/g, '')
    .replace(/[^0-9A-Za-z\uAC00-\uD7AF]+$/g, '')
    .toLowerCase();
}

function trimDegenerateRepeatLine(line: string): string {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return line;

  const normalizedTokens = tokens.map(normalizeRepeatTailToken);
  const lastToken = normalizedTokens[normalizedTokens.length - 1];
  if (!lastToken || lastToken.length < 2) return line;

  let runStart = normalizedTokens.length - 1;
  while (runStart > 0 && normalizedTokens[runStart - 1] === lastToken) {
    runStart -= 1;
  }

  const runLength = normalizedTokens.length - runStart;
  if (runLength < 6) return line;

  return [...tokens.slice(0, runStart + 3)].join(' ').trim();
}

function trimDegenerateRepeatTail(text: string): string {
  const trimmedLines = text
    .split('\n')
    .map(line => trimDegenerateRepeatLine(line));
  return trimmedLines.join('\n').trim();
}

function collectRepeatReferenceTexts(messages: ChatMessage[]): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];

  for (const message of messages) {
    if (!message?.content?.trim()) continue;
    if (message.role === 'user') continue;
    if (/^\s*\[L:\s*/.test(message.content)) continue;
    const normalized = normalizeRepeatComparableText(message.content);
    if (normalized.length < 24) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    refs.push(message.content);
  }

  return refs.slice(-20);
}

function validateStrictRpOutput(
  raw: string,
  parsed: ReturnType<typeof parseAIOutputMulti>,
  targetLanguage: string,
  repeatReferenceTexts: string[] = [],
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sanitizedRaw = stripInjectedKnowledgeBlocks(stripRuntimeControlText(raw));
  const lastLine = getLastNonEmptyLine(sanitizedRaw);
  const hasSceneTexture = /[#*]/.test(sanitizedRaw) || parsed.lines.some(line => line.role === 'narrator');
  const aiLines = parsed.lines.filter(line => Number(line.speakerId) >= 2 && line.role === 'ai');
  const totalAiChars = aiLines.reduce(
    (sum, line) => sum + stripLeakedUserSpeakerPrefix(line.content).replace(/\s+/g, '').length,
    0,
  );
  const hasStructuredDialogueLine = STRUCTURED_DIALOGUE_LINE_RE.test(sanitizedRaw);
  const hasSubstantialDialogue = aiLines.length > 0 && totalAiChars >= 20;

  if (containsPromptEcho(raw)) {
    reasons.push('prompt_echo_generated');
  }

  if (!STORY_LOG_TERMINAL_RE.test(lastLine)) {
    reasons.push('missing_story_log');
  }

  if (!parsed.lines.some(line => Number(line.speakerId) >= 2 && line.role === 'ai')) {
    reasons.push('missing_character_dialogue');
  }

  if (detectLanguageMismatch(sanitizedRaw, targetLanguage)) {
    reasons.push('language_mismatch');
  }

  if (hasRepeatedSceneContent(parsed, repeatReferenceTexts)) {
    reasons.push('repeated_scene_content');
  }

  if (!hasSceneTexture && GENERIC_ASSISTANT_PATTERNS.some(pattern => pattern.test(sanitizedRaw))) {
    reasons.push('generic_assistant_tone');
  }

  if (
    !hasSceneTexture
    && (
      (!hasStructuredDialogueLine && !hasSubstantialDialogue)
      || (aiLines.length <= 1 && totalAiChars <= 10)
    )
  ) {
    reasons.push('underdeveloped_response');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

function buildRetryUserTurnContent(
  baseUserTurn: string,
  _reasons: string[],
  _targetLanguage: string,
): string {
  return stripInjectedKnowledgeBlocks(stripRuntimeControlText(baseUserTurn))
    || stripRuntimeControlText(baseUserTurn)
    || baseUserTurn.trim();
}

function normalizeInvalidRpOutput(
  raw: string,
  parsed: ReturnType<typeof parseAIOutputMulti>,
  fallbackSpeakerId: number,
): string {
  const normalizedDialogue = parsed.lines
    .map((line) => {
      const compact = stripLeakedUserSpeakerPrefix(line.content).replace(/\s+/g, ' ').trim();
      const normalizedSpeakerId = Number(line.speakerId) === 1
        ? fallbackSpeakerId
        : Number(line.speakerId);
      return {
        speakerId: normalizedSpeakerId,
        compact,
      };
    })
    .filter(line => line.compact && !line.compact.startsWith('[L:'))
    .map(line => `${line.speakerId}: ${line.compact}`)
    .filter(Boolean);

  const terminalLine = getLastNonEmptyLine(raw);
  const logLine = STORY_LOG_TERMINAL_RE.test(terminalLine)
    ? terminalLine
    : `[L: scene] [${fallbackSpeakerId}: tense] [Ev: response]`;

  return `${normalizedDialogue.join('\n')}\n${logLine}`.trim();
}

function canSalvageInvalidOutput(
  raw: string,
  parsed: ReturnType<typeof parseAIOutputMulti>,
  reasons: string[],
): boolean {
  if (!raw.trim()) return false;
  if (reasons.includes('language_mismatch')) return false;
  if (reasons.includes('generic_assistant_tone')) return false;
  if (reasons.includes('prompt_echo_generated')) return false;

  const hasMeaningfulDialogue = parsed.lines.some((line) => {
    const compact = stripLeakedUserSpeakerPrefix(line.content).replace(/\s+/g, ' ').trim();
    return compact && !compact.startsWith('[L:') && compact !== '...';
  });
  const meaningfulDialogueChars = parsed.lines.reduce((sum, line) => {
    const compact = stripLeakedUserSpeakerPrefix(line.content).replace(/\s+/g, '').trim();
    return compact && !compact.startsWith('[L:') && compact !== '...'
      ? sum + compact.length
      : sum;
  }, 0);

  if (!hasMeaningfulDialogue || meaningfulDialogueChars < 12) {
    return false;
  }

  if (reasons.includes('repeated_scene_content')) {
    const salvageableRepeatOnly = reasons.every((reason) => (
      reason === 'missing_story_log'
      || reason === 'repeated_scene_content'
      || reason === 'underdeveloped_response'
    ));
    if (!salvageableRepeatOnly || meaningfulDialogueChars < 20) {
      return false;
    }
  }

  return true;
}

function buildSessionStoryMeta(
  rawStory: unknown,
  config: StoryConfig | undefined,
  modelId?: string,
): ChatSession['storyMeta'] {
  const storyRecord = rawStory && typeof rawStory === 'object'
    ? rawStory as Record<string, unknown>
    : {};
  const coverCandidate = Array.isArray(storyRecord.cover_urls)
    ? storyRecord.cover_urls[0]
    : undefined;
  const configRecord = config && typeof config === 'object'
    ? config as unknown as Record<string, unknown>
    : {};
  const configCoverCandidate = Array.isArray(configRecord.cover_urls)
    ? configRecord.cover_urls[0]
    : undefined;

  return {
    title: pickStoryText(storyRecord.title, config?.title, 'Story'),
    coverUrl: pickStoryText(
      storyRecord.coverUrl,
      storyRecord.cover_url,
      coverCandidate,
      configRecord.coverUrl,
      configRecord.cover_url,
      configCoverCandidate,
    ),
    authorName: pickStoryText(
      storyRecord.author,
      storyRecord.authorName,
      storyRecord.author_name,
    ),
    charNames: (config?.characters ?? [])
      .filter(character => Number((character as any).id) >= 2)
      .map(character => String((character as any).name ?? '').trim())
      .filter(Boolean)
      .slice(0, 5),
    genre: pickStoryText(storyRecord.genre) || undefined,
    modelId };
}

function normalizeStoryPayload(rawStory: any): any {
  return normalizeChatStoryPayload(rawStory);
}

function getStoryConfig(rawStory: any): StoryConfig {
  return getNormalizedChatStoryConfig(rawStory);
}

function findChapterIndexById(config: StoryConfig | undefined, chapterId: string): number {
  if (!config?.chapters?.length) return -1;
  return config.chapters.findIndex(chapter => String(chapter.id) === String(chapterId));
}

function toEmotionRecord(emotions: Record<string | number, EditorEmotions>): Record<number, EditorEmotions> {
  return Object.entries(emotions).reduce<Record<number, EditorEmotions>>((acc, [key, value]) => {
    const numericKey = Number(key);
    if (Number.isFinite(numericKey)) acc[numericKey] = value;
    return acc;
  }, {});
}

function buildInitialEmotionRecord(config: StoryConfig | undefined): Record<number, EditorEmotions> {
  void config;
  return {};
}

async function ensureGenerationOffsetsReady(params: {
  storyId: string;
  chapterIndex: number;
  systemPrompt: string;
  chapterPrompt: string;
}): Promise<void> {
  const { storyId, chapterIndex, systemPrompt, chapterPrompt } = params;
  const hasBaseOffsets = kvOffsetTracker.baseEnd > 0;
  const hasChapterOffsets = kvOffsetTracker.chapterEnd > 0;

  if (hasBaseOffsets && (hasChapterOffsets || !chapterPrompt.trim())) {
    return;
  }

  let recovered = false;
  const restoredFromFile = await kvOffsetTracker.loadOffsets(storyId, chapterIndex).catch(() => false);
  if (restoredFromFile) {
    recovered = true;
  }

  if (!restoredFromFile && systemPrompt.trim()) {
    const measuredBase = await kvOffsetTracker.measureBase(systemPrompt).catch(() => 0);
    if (measuredBase > 0) {
      if (chapterPrompt.trim()) {
        await kvOffsetTracker.measureChapter(chapterPrompt, chapterIndex).catch(() => 0);
      } else {
        kvOffsetTracker.applyMeasuredChapterEnd(measuredBase, chapterIndex);
      }
      recovered = true;
    }
  }

  if (kvOffsetTracker.baseEnd > 0 && kvOffsetTracker.chapterEnd <= 0) {
    if (chapterPrompt.trim()) {
      const chapterTokens = await kvOffsetTracker.measureChapter(chapterPrompt, chapterIndex).catch(() => 0);
      if (chapterTokens <= 0) {
        kvOffsetTracker.applyMeasuredChapterEnd(kvOffsetTracker.baseEnd, chapterIndex);
      }
    } else {
      kvOffsetTracker.applyMeasuredChapterEnd(kvOffsetTracker.baseEnd, chapterIndex);
    }
    recovered = true;
  }

  const effectiveOffsetEnd = kvOffsetTracker.chapterEnd > 0
    ? kvOffsetTracker.chapterEnd
    : kvOffsetTracker.baseEnd;
  if (effectiveOffsetEnd > 0 && llamaEngine.getUsedTokens() < effectiveOffsetEnd) {
    llamaEngine.setUsedTokens(effectiveOffsetEnd);
  }

  if (recovered && kvOffsetTracker.baseEnd > 0) {
    await kvOffsetTracker.saveOffsets(storyId).catch(() => { });
    logger.log('[ChatEngineCore] KV offsets recovered before generation', {
      storyId,
      chapterIndex,
      baseEnd: kvOffsetTracker.baseEnd,
      chapterEnd: kvOffsetTracker.chapterEnd,
      usedTokens: llamaEngine.getUsedTokens(),
      restoredFromFile,
    });
  }
}

export function useChatEngineCore(
  storyId: string,
  storyConfig?: StoryConfig | Story,
  initialOptions?: {
    initialChapterIndex?: number;
    initialEmotions?: Record<string, EditorEmotions>;
    displayUserName?: string;
    resumeMode?: boolean;
    story?: Story;
    adapterSelection?: StoryLoraAdapterSelection;
    enabled?: boolean;
  },
) {
  useEffect(() => {
    if (__DEV__ && storyConfig) {
      const normalizedStory = normalizeStoryPayload(storyConfig) ?? storyConfig;
      const isFullStory = (normalizedStory as any).story_config || (normalizedStory as any).chapters;
      const schema = isFullStory ? StoryResponseSchema : StoryConfigSchema;
      const result = schema.safeParse(normalizedStory);
      if (!result.success) {
        console.warn('[ChatEngineCore] Story data validation failed:', result.error.issues.slice(0, 3));
      }
    }
  }, [storyConfig]);
  const addMessage = useChatStore((state) => state.addMessage);
  const addMessages = useChatStore((state) => state.addMessages);
  const updateMessageInStore = useChatStore((state) => state.updateMessage);
  const loadSession = useChatStore((state) => state.loadSession);
  const saveSession = useChatStore((state) => state.saveSession);
  const createSession = useChatStore((state) => state.createSession);
  const advanceChapter = useChatStore((state) => state.advanceChapter);
  const activeModelId = useModelStore((state) => state.activeModelId);
  const t = useLanguageStore((state) => state.t);
  const appLanguage = useLanguageStore((state) => state.appLanguage);
  const displayUserNameRef = useRef<string>(CHAT_USER_PLACEHOLDER);
  const getDisplayUserName = useCallback(
    () => displayUserNameRef.current || CHAT_USER_PLACEHOLDER,
    [],
  );

  useEffect(() => {
    displayUserNameRef.current = typeof initialOptions?.displayUserName === 'string' && initialOptions.displayUserName.trim()
      ? initialOptions.displayUserName.trim()
      : CHAT_USER_PLACEHOLDER;
  }, [initialOptions?.displayUserName]);

  const storyConfigRef = useRef(storyConfig);
  useEffect(() => { storyConfigRef.current = storyConfig; }, [storyConfig]);
  const normalizedStory = useMemo(
    () => normalizeStoryPayload(initialOptions?.story ?? storyConfig ?? storyConfigRef.current),
    [initialOptions?.story, storyConfig],
  );
  const normalizedConfig = useMemo(
    () => getStoryConfig(normalizedStory),
    [normalizedStory],
  );
  const resolvedModelId = useMemo(
    () => activeModelId || resolveStoryModelId(normalizedStory as Record<string, unknown> | undefined) || undefined,
    [activeModelId, normalizedStory],
  );
  const seededInitialEmotions = useMemo(() => {
    if (initialOptions?.initialEmotions && Object.keys(initialOptions.initialEmotions).length > 0) {
      return toEmotionRecord(initialOptions.initialEmotions);
    }
    return buildInitialEmotionRecord(normalizedConfig);
  }, [initialOptions?.initialEmotions, normalizedConfig]);
  const buildStoryMeta = useCallback(() => {
    return buildSessionStoryMeta(normalizedStory, normalizedConfig, resolvedModelId);
  }, [normalizedConfig, normalizedStory, resolvedModelId]);
  const resolvedAdapterSelection = useMemo(() => {
    if (!resolvedModelId) return null;
    const normalizedAppLanguage = appLanguage || 'en';
    const routeSelection = initialOptions?.adapterSelection;
    if (
      routeSelection &&
      routeSelection.modelId === resolvedModelId &&
      routeSelection.language === normalizedAppLanguage
    ) {
      return routeSelection;
    }

    return storyAdapterManager.resolveStoryAdapterSelection({
      story: normalizedStory,
      modelId: resolvedModelId,
      appLanguage: normalizedAppLanguage,
      storyId,
      serverUrl: ApiConfig.workerBaseUrl,
    });
  }, [appLanguage, initialOptions?.adapterSelection, normalizedStory, resolvedModelId, storyId]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Reset intro seeding only when the story actually changes.
  // This avoids duplicate intro inserts when StrictMode replays the effect.
  //
  //
  //
  //
  const prevStoryIdRef = useRef<string>('');

  const eventHandlersRef = useRef<ChatEventHandler[]>([]);
  const flatListRef = useRef<import('react-native').FlatList>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const firstCharIdRef = useRef<string | undefined>(undefined);
  const firstCharNameRef = useRef<string | undefined>(undefined);
  const currentChapterIndexRef = useRef<number>(initialOptions?.initialChapterIndex ?? 0);
  const handleSaveSessionRef = useRef<() => Promise<void>>(async () => { });
  const startupInterferenceReleaseRef = useRef<(() => void) | null>(null);
  const startupInterferenceKeyRef = useRef('');
  const introSeededKeysRef = useRef<Set<string>>(new Set());
  const loadSessionKeyRef = useRef('');
  const seedIntroMessagesRef = useRef<(
    targetStory: any,
    chapterIndex: number,
    options?: { append?: boolean; prepend?: boolean },
  ) => Promise<ChatMessage[]>>(async () => []);

  const [messageState, setMessageState] = useState<MessageState>({
    messages: [],
    messageGroups: [],
    currentTurn: 0,
    totalTurns: 0,
    lastMessageId: undefined,
    isProcessingMessage: false,
    pendingMessages: [] });

  const messageStateRef = useRef(messageState);
  useEffect(() => { messageStateRef.current = messageState; }, [messageState]);

  const [streamingState, setStreamingState] = useState<StreamingState>({
    isActive: false,
    accumulatedText: '',
    currentMessageId: undefined,
    startTime: undefined });

  const [uiState, setUIState] = useState<UIState>({
    isScrolling: false,
    isAtBottom: true,
    showScrollToBottom: false,
    isDrawerOpen: false,
    isSettingsOpen: false,
    isEmotionPanelOpen: false });

  const [emotionState, setEmotionState] = useState<EmotionState>({
    currentEmotions: seededInitialEmotions,
    pendingEmotionEffects: {},
    emotionHistory: [],
    isEmotionAnimating: false });
  const [sessionLoadReady, setSessionLoadReady] = useState(false);

  const [sessionState, setSessionState] = useState<SessionState>({
    sessionId: `session_${Date.now()}`,
    storyId,
    startTime: Date.now(),
    lastActivityTime: Date.now(),
    totalMessages: 0,
    totalTurns: 0,
    isRestored: false,
    isKVLoading: !!initialOptions?.enabled,
    currentChapterIndex: initialOptions?.initialChapterIndex ?? 0 });

  // Mirror KV loading state in a ref so send/generate paths do not read stale state.
  //
  //
  const isKVLoadingRef = useRef(!!initialOptions?.enabled);

  const [errorState, _setErrorState] = useState<ErrorState>({
    currentError: undefined,
    errorHistory: [],
    hasUnrecoverableError: false });

  const kvSession = useKVSession();
  // Keep the latest KV session in a ref.
  // Rebinding heavy bootstrap logic directly to session changes can tear down in-flight loads.
  //
  const kvSessionRef = useRef(kvSession);
  kvSessionRef.current = kvSession;
  const kvInitKeyRef = useRef('');
  const kvBootstrapInFlightKeyRef = useRef('');
  const kvBootstrapRunIdRef = useRef(0);
  const generationRequestIdRef = useRef(0);
  // Guard sendMessage with a ref as well as state to block duplicate submits.
  //
  //
  const isSendingRef = useRef(false);
  const transitionLockRef = useRef(false);

  useEffect(() => {
    if (!resolvedModelId || !appLanguage) {
      llamaEngine.setStoryLoraAdapterSelection(null);
      return;
    }

    if (resolvedAdapterSelection) {
      llamaEngine.setStoryLoraAdapterSelection(resolvedAdapterSelection);
    } else {
      llamaEngine.setStoryLoraAdapterSelection(null);
    }

    storyAdapterManager.ensureLanguageAdapterPack({
      modelId: resolvedModelId,
      language: appLanguage,
      serverUrl: ApiConfig.workerBaseUrl,
      bestEffort: !resolvedAdapterSelection?.engineSupportReady,
    }).catch((error) => {
      logger.warn('[ChatEngineCore] story adapter pack prefetch failed:', error);
    });

    return () => {
      llamaEngine.setStoryLoraAdapterSelection(null);
    };
  }, [appLanguage, resolvedAdapterSelection, resolvedModelId]);

  useEffect(() => { messagesRef.current = messageState.messages; }, [messageState.messages]);

  const emotionStateRef = useRef(emotionState);
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);
  useEffect(() => { emotionStateRef.current = emotionState; }, [emotionState]);
  useEffect(() => {
    if (!initialOptions?.enabled || !storyId) {
      startupInterferenceKeyRef.current = '';
      startupInterferenceReleaseRef.current?.();
      startupInterferenceReleaseRef.current = null;
      return;
    }

    const nextKey = `${storyId}:startup`;
    if (startupInterferenceKeyRef.current === nextKey) return;

    startupInterferenceReleaseRef.current?.();
    startupInterferenceReleaseRef.current = suspendRuntimeInterference(nextKey);
    startupInterferenceKeyRef.current = nextKey;

    return () => {
      if (startupInterferenceKeyRef.current !== nextKey) return;
      startupInterferenceKeyRef.current = '';
      startupInterferenceReleaseRef.current?.();
      startupInterferenceReleaseRef.current = null;
    };
  }, [initialOptions?.enabled, storyId]);

  useEffect(() => {
    if (!startupInterferenceReleaseRef.current) return;
    if (!sessionLoadReady || sessionState.isKVLoading || !kvInitKeyRef.current) return;

    logger.log('[ChatEngineCore] startup interference guard released');
    startupInterferenceKeyRef.current = '';
    startupInterferenceReleaseRef.current();
    startupInterferenceReleaseRef.current = null;
  }, [sessionLoadReady, sessionState.isKVLoading]);

  useEffect(() => {
    // A real story switch clears intro/KV bootstrap state before the next load begins.
    if (prevStoryIdRef.current === storyId) return;
    prevStoryIdRef.current = storyId;

    introSeededKeysRef.current = new Set();
    loadSessionKeyRef.current = '';
    kvInitKeyRef.current = '';
    kvBootstrapInFlightKeyRef.current = '';
    transitionLockRef.current = false;
    isKVLoadingRef.current = !!initialOptions?.enabled;
    setSessionLoadReady(false);
    setSessionState(prev => ({
      ...prev,
      storyId,
      isKVLoading: !!initialOptions?.enabled,
      currentChapterIndex: initialOptions?.initialChapterIndex ?? 0,
    }));
    generationRequestIdRef.current += 1;
    currentChapterIndexRef.current = initialOptions?.initialChapterIndex ?? 0;
    const resetEmotionState: EmotionState = {
      currentEmotions: seededInitialEmotions,
      pendingEmotionEffects: {},
      emotionHistory: [],
      isEmotionAnimating: false,
    };
    emotionStateRef.current = resetEmotionState;
    setEmotionState(resetEmotionState);
    
    // Reset Story Core state when the base story session is rebuilt.
  }, [initialOptions?.initialChapterIndex, seededInitialEmotions, storyId]);

  useEffect(() => {
    const keys = Object.keys(emotionState.currentEmotions);
    if (keys[0]) {
      const charIdStr = keys[0];
      const existingMsg = messagesRef.current
        .slice()
        .reverse()
        .find((m) => m.characterId === charIdStr && m.characterName);
      firstCharIdRef.current = charIdStr;
      firstCharNameRef.current = existingMsg?.characterName ?? `Character ${charIdStr}`;
    }
  }, [emotionState.currentEmotions]);

  const emitEvent = useCallback((type: ChatEvent['type'], payload?: unknown) => {
    const event: ChatEvent = { type, payload, timestamp: Date.now() };
    eventHandlersRef.current.forEach((handler) => {
      try { handler(event); } catch (error) { console.error('Event handler error:', error); }
    });
  }, []);

  const addEventHandler = useCallback((handler: ChatEventHandler) => {
    eventHandlersRef.current.push(handler);
  }, []);

  const removeEventHandler = useCallback((handler: ChatEventHandler) => {
    eventHandlersRef.current = eventHandlersRef.current.filter((item) => item !== handler);
  }, []);

  const invalidateGenerationRequests = useCallback(() => {
    generationRequestIdRef.current += 1;
  }, []);

  const stopActiveGeneration = useCallback(async (reason: string) => {
    if (llamaEngine.getState() !== 'generating') return;
    try {
      await llamaEngine.stopGeneration();
    } catch (error) {
      console.warn(`[ChatEngineCore] stopGeneration failed (${reason}):`, error);
    }
  }, []);

  const buildContext = useCallback((userMessage: ChatMessage, targetLanguage: string): string => {
    const alreadyIncluded = messagesRef.current.some(message => message.id === userMessage.id);
    const sourceMessages = alreadyIncluded
      ? messagesRef.current
      : [...messagesRef.current, userMessage];
    const history = sanitizeDialogueHistoryForTargetLanguage(
      buildDialogueHistoryFromCore(sourceMessages),
      targetLanguage,
    );
    return `${history.join('\n')}`;
  }, []);

  const applyChapterIntroEmotionDeltas = useCallback((targetStory: any, chapterIndex: number) => {
    void targetStory;
    void chapterIndex;
    return emotionStateRef.current.currentEmotions;
  }, [storyId]);

  const changeChapter = useCallback(async (chapterId: string) => {
    if (!storyId || !chapterId || !initialOptions?.enabled) return;
    if (transitionLockRef.current) return;

    const config = normalizedConfig;
    const nextChapterIndex = findChapterIndexById(config, chapterId);
    const currentChapterIndex = currentChapterIndexRef.current;

    if (nextChapterIndex < 0 || nextChapterIndex === currentChapterIndex) {
      return;
    }

    const currentChapterId = config.chapters?.[currentChapterIndex]?.id ?? '';
    const storyLogBlock = currentChapterId
      ? chapterLogTracker.toKVBlock(storyId, String(currentChapterId))
      : undefined;

    try {
      transitionLockRef.current = true;
      invalidateGenerationRequests();
      await stopActiveGeneration('chapter_change');
      if (isMountedRef.current) {
        isKVLoadingRef.current = true; setSessionState(prev => ({ ...prev, isKVLoading: true }));
      }

      await kvSessionRef.current.changeChapter(storyId, nextChapterIndex, config, storyLogBlock);
      if (currentChapterId) {
        chapterLogTracker.onChapterAdvance(storyId, String(currentChapterId), String(chapterId)).catch(() => { });
      }

      const nextEmotions = applyChapterIntroEmotionDeltas(normalizedStory, nextChapterIndex);
      introSeededKeysRef.current.delete(`intro_${nextChapterIndex}`);
      currentChapterIndexRef.current = nextChapterIndex;
      if (resolvedModelId) {
        kvInitKeyRef.current = `${storyId}:${resolvedModelId}:${nextChapterIndex}`;
      }

      if (isMountedRef.current) {
        isKVLoadingRef.current = false;
        setSessionState(prev => ({
          ...prev,
          currentChapterIndex: nextChapterIndex,
          isKVLoading: false }));
        setMessageState(prev => ({
          ...prev,
          currentTurn: 0 }));
      }

      advanceChapter(storyId, nextChapterIndex, toEmotionRecord(nextEmotions));
      const introMessages = await seedIntroMessagesRef.current(normalizedStory, nextChapterIndex, { append: true });
      emitEvent('chapter_changed', {
        chapterId,
        chapterIndex: nextChapterIndex,
        messages: introMessages });
    } catch (error) {
      console.error('[ChatEngineCore] changeChapter failed:', error);
      if (isMountedRef.current) {
        isKVLoadingRef.current = false; setSessionState(prev => ({ ...prev, isKVLoading: false }));
      }
    } finally {
      transitionLockRef.current = false;
    }
  }, [resolvedModelId, advanceChapter, applyChapterIntroEmotionDeltas, emitEvent, initialOptions?.enabled, invalidateGenerationRequests, normalizedConfig, normalizedStory, stopActiveGeneration, storyId]);

  const seedIntroMessages = useCallback(async (
    targetStory: any,
    chapterIndex: number,
    options?: { append?: boolean; prepend?: boolean },
  ) => {
    if (!storyId || !targetStory) {
      return [] as ChatMessage[];
    }

    const normalizedTargetStory = normalizeStoryPayload(targetStory) ?? targetStory;
    const introSetId = `intro_${chapterIndex}`;
    if (introSeededKeysRef.current.has(introSetId)) {
      return [] as ChatMessage[];
    }

    const resolvedUserName = getDisplayUserName();
    const introCharacters = extractCharactersFullFromStory(normalizedTargetStory);
    console.log('[ChatEngine] seedIntroMessages - characters for intro:', introCharacters.map(c => ({
      id: c.id,
      name: c.name,
      hasImage: !!(c.imageUris?.[0] || c.profileUrl),
      imageUri: c.imageUris?.[0]?.slice(0, 60),
    })));

    // Also log the intro message data to see speakerCharId values
    const introConfig = (normalizedTargetStory?.story_config ?? normalizedTargetStory) as any;
    const introChapter = introConfig?.chapters?.[chapterIndex];
    const rawIntro = introChapter?.introMessages ?? introChapter?.intro ?? [];
    console.log('[ChatEngine] seedIntroMessages - raw intro data:', rawIntro.map((m: any, i: number) => ({
      index: i,
      speakerType: m?.speakerType ?? m?.speaker_type,
      speakerCharId: m?.speakerCharId ?? m?.speaker_char_id,
      speakerName: m?.speakerName ?? m?.speaker_name,
      contentPreview: (m?.content ?? '').slice(0, 40),
    })));

    const introMessages = buildLocalizedIntroMessages(
      normalizedTargetStory,
      chapterIndex,
      introCharacters,
      appLanguage,
    ).map(message => ({
      ...message,
      content: applyUserNameStr(message.content ?? '', resolvedUserName),
      characterName: message.characterName
        ? applyUserNameStr(message.characterName, resolvedUserName)
        : message.characterName }));

    console.log('[ChatEngine] seedIntroMessages - built messages:', introMessages.map(m => ({
      role: m.role,
      characterId: m.characterId,
      characterName: m.characterName,
      hasProfileUrl: !!m.characterProfileUrl,
      profileUrlPreview: m.characterProfileUrl?.slice(0, 60),
      contentPreview: m.content?.slice(0, 40),
    })));

    const existingKeys = new Set(
      messagesRef.current.map(message =>
        `${message.role}:${message.characterId ?? ''}:${message.setId ?? ''}:${message.content}`,
      ),
    );
    const dedupedIntroMessages = introMessages.filter(message => {
      const dedupeKey = `${message.role}:${message.characterId ?? ''}:${message.setId ?? ''}:${message.content}`;
      if (existingKeys.has(dedupeKey)) {
        return false;
      }
      existingKeys.add(dedupeKey);
      return true;
    });

    if (dedupedIntroMessages.length === 0) {
      introSeededKeysRef.current.add(introSetId);
      return [];
    }

    introSeededKeysRef.current.add(introSetId);

    if (isMountedRef.current) {
      setMessageState(prev => {
        // Dedupe intro messages locally because store writes and local state can race.
        //
        //
        const existingMsgIds = new Set(prev.messages.map(m => m.id));
        const toInsert = dedupedIntroMessages.filter(m => !existingMsgIds.has(m.id));
        if (toInsert.length === 0) return prev;
        return {
          ...prev,
          messages: options?.prepend
            ? [...toInsert, ...prev.messages]
            : options?.append
              ? [...prev.messages, ...toInsert]
              : toInsert,
          lastMessageId: options?.prepend
            ? (prev.messages[prev.messages.length - 1]?.id ?? toInsert[toInsert.length - 1]?.id)
            : toInsert[toInsert.length - 1]?.id,
        };
      });
    }

    await addMessages(
      storyId,
      dedupedIntroMessages.map(message => toStoredMessageFromCore(message)),
    );

    return dedupedIntroMessages;
  }, [addMessages, appLanguage, getDisplayUserName, storyId]);
  seedIntroMessagesRef.current = seedIntroMessages;

  const updateEmotions = useCallback((characterId: string, emotions: EditorEmotions) => {
    const charIdNum = Number(characterId);
    if (storyId) {
      if (Number.isFinite(charIdNum)) {
        const normalized = [
          normalizeEmotion(emotions.e1),
          normalizeEmotion(emotions.e2),
          normalizeEmotion(emotions.e3),
          normalizeEmotion(emotions.e4),
          normalizeEmotion(emotions.e5),
        ];
        updateEmotionWithSpring(storyId, charIdNum, normalized);
      }
    }
    setEmotionState((prev) => ({
      ...prev,
      currentEmotions: { ...prev.currentEmotions, [charIdNum]: emotions },
      emotionHistory: [
        ...prev.emotionHistory,
        { characterId: charIdNum, emotions, timestamp: Date.now() },
      ].slice(-50) }));
    emitEvent('emotion_updated', { characterId, emotions });
  }, [emitEvent, storyId]);

  const generateAIResponse = useCallback(async (userMessage: ChatMessage) => {
    if (transitionLockRef.current || isKVLoadingRef.current) {
      throw new Error('[ChatEngineCore] Story transition is still in progress');
    }

    const requestId = generationRequestIdRef.current + 1;
    generationRequestIdRef.current = requestId;

    const _streamingCfg = storyConfigRef.current;
    const _streamingActualCfg: StoryConfig = (_streamingCfg as any)?.story_config ?? (_streamingCfg as StoryConfig);
    const _streamingChars = extractCharactersFullFromStory(_streamingActualCfg);
    const _streamingDefaultChar = _streamingChars.find((c: any) => Number(c.id) >= 2);
    const _streamingCharId = firstCharIdRef.current
      ?? (_streamingDefaultChar ? String(_streamingDefaultChar.id) : undefined);
    const _streamingCharName = firstCharNameRef.current
      ?? _streamingDefaultChar?.name;
    const _streamingCharProfileUrl = _streamingDefaultChar?.profileUrl
      ?? _streamingDefaultChar?.imageUris?.[0];

    const aiMessage = createAIMessage('', _streamingCharId, _streamingCharName, {
      isStreaming: true,
      characterProfileUrl: _streamingCharProfileUrl,
      speakerId: _streamingCharId ? Number(_streamingCharId) : 2,
      metadata: { turnNumber: userMessage.metadata?.turnNumber } });
    const isCurrentRequest = () => requestId === generationRequestIdRef.current;
    const shouldAbortRequest = () => !isCurrentRequest() || !isMountedRef.current;
    const clearOwnStreamingState = () => {
      if (!isMountedRef.current) return;
      setStreamingState(prev => {
        if (prev.currentMessageId !== aiMessage.id) return prev;
        return { isActive: false, accumulatedText: '', currentMessageId: undefined, startTime: undefined };
      });
    };
    const discardPlaceholder = () => {
      if (!isMountedRef.current) return;
      setMessageState(prev => {
        const nextMessages = prev.messages.filter(message => message.id !== aiMessage.id);
        return {
          ...prev,
          messages: nextMessages,
          totalMessages: nextMessages.length,
          lastMessageId: nextMessages[nextMessages.length - 1]?.id } as MessageState;
      });
    };

    const startTime = Date.now();
    let streamingAccumulated = '';
    let accumulated = '';
    let stopRequested = false;

    if (isMountedRef.current) {
      setStreamingState({ isActive: true, accumulatedText: '', currentMessageId: aiMessage.id, startTime });
      setMessageState((prev) => ({
        ...prev,
        messages: [...prev.messages, aiMessage],
        lastMessageId: aiMessage.id }));
    }
    emitEvent('streaming_started');

    try {
      const cfg = storyConfigRef.current;
      const actualCfg: StoryConfig = (cfg as Story)?.story_config ?? (cfg as StoryConfig);
      const budget = MODEL_GENERATION_BUDGET[resolvedModelId as ModelGenerationBudgetKey] || { nPredict: DEFAULT_N_PREDICT, contentBudget: DEFAULT_N_PREDICT - 80 };
      const nPredict = budget.nPredict;
      const contentBudget = budget.contentBudget;
      const kvUserName = '';

      const promptLayerFallback = actualCfg
        ? buildKVPromptLayers(actualCfg, {
          chapterIndex: currentChapterIndexRef.current,
          userName: kvUserName,
        })
        : null;
      const systemPrompt = kvSessionRef.current.currentBasePromptRef.current
        || promptLayerFallback?.basePrompt
        || '';
      const chapterPrompt = kvSessionRef.current.currentChapterPromptRef.current
        || promptLayerFallback?.chapterPrompt
        || '';

      const context = buildContext(userMessage, appLanguage ?? 'en');
      const languageControls = buildRuntimeLanguageControls(context, appLanguage);

      const completionPayload = buildKVCompletionPayload({
        config: actualCfg,
        chapterIndex: currentChapterIndexRef.current,
        userName: kvUserName,
        context: languageControls.wrappedContext,
        contentBudget,
        basePromptOverride: systemPrompt,
        chapterPromptOverride: chapterPrompt,
      });
      const turnPrompt = [
        completionPayload.reusableUserPrefix,
        languageControls.wrappedContext,
      ].filter(Boolean).join('\n\n');
      if (
        completionPayload.systemPrompt !== systemPrompt ||
        completionPayload.chapterPrompt !== chapterPrompt
      ) {
        logger.warn('[KVPromptCheck] completion payload drift detected', {
          systemPrompt: {
            manual: getPromptFingerprint(systemPrompt),
            helper: getPromptFingerprint(completionPayload.systemPrompt),
          },
          chapterPrompt: {
            manual: getPromptFingerprint(chapterPrompt),
            helper: getPromptFingerprint(completionPayload.chapterPrompt),
          },
          turnPrompt: {
            manual: getPromptFingerprint(turnPrompt),
            helper: getPromptFingerprint(completionPayload.turnPrompt),
          },
        });
      }
      logger.log('[KVPromptCheck] completion fingerprints:', {
        systemPrompt: getPromptFingerprint(completionPayload.systemPrompt),
        chapterPrompt: getPromptFingerprint(completionPayload.chapterPrompt),
        userNameOverlay: getPromptFingerprint(completionPayload.userNameOverlay),
        reusableUserPrefix: getPromptFingerprint(completionPayload.reusableUserPrefix),
        turnPrompt: getPromptFingerprint(completionPayload.turnPrompt),
        targetLanguage: languageControls.targetLanguage,
        languageBiasCount: languageControls.logitBias.length,
      });

      if (llamaEngine.getState() !== 'ready') {
        if (!resolvedModelId) throw new Error('[ChatEngineCore] activeModelId not set');
        if (systemPrompt) llamaEngine.setWarmupSystemPrompt(systemPrompt);
        await llamaEngine.load(resolvedModelId);
      }
      await ensureGenerationOffsetsReady({
        storyId,
        chapterIndex: currentChapterIndexRef.current,
        systemPrompt,
        chapterPrompt,
      });
      if (shouldAbortRequest()) {
        discardPlaceholder();
        return;
      }

      const kvRatioBeforeGenerate = llamaEngine.getNCtx() > 0
        ? (llamaEngine.getUsedTokens() / llamaEngine.getNCtx())
        : 0;
      const effectiveNPredict = resolveKvPressureAdjustedNPredict(nPredict, kvRatioBeforeGenerate);
      if (effectiveNPredict !== nPredict) {
        logger.warn('[ChatEngineCore] high KV usage reducing generation budget', {
          kvRatio: Number(kvRatioBeforeGenerate.toFixed(3)),
          baseNPredict: nPredict,
          adjustedNPredict: effectiveNPredict,
          usedTokens: llamaEngine.getUsedTokens(),
          nCtx: llamaEngine.getNCtx(),
        });
      }

      let lastRenderMs = 0;

      const runGenerateAttempt = async (
        messages: typeof completionPayload.messages,
        generateOverrides: Partial<GenerateOptions> = {},
      ): Promise<string> => {
        streamingAccumulated = '';
        accumulated = '';
        stopRequested = false;
        lastRenderMs = 0;

        if (isMountedRef.current) {
          setStreamingState({ isActive: true, accumulatedText: '', currentMessageId: aiMessage.id, startTime });
          setMessageState((prev) => {
            const nextMessages = [...prev.messages];
            const lastMessage = nextMessages[nextMessages.length - 1];
            if (lastMessage?.id === aiMessage.id) {
              nextMessages[nextMessages.length - 1] = {
                ...lastMessage,
                content: '',
                isStreaming: true,
              };
            }
            return { ...prev, messages: nextMessages };
          });
        }

        accumulated = await llamaEngine.generate(
          messages,
          {
            maxTokens: effectiveNPredict,
            repeatPenalty: 1.1,
            repeatLastN: 128,
            presencePenalty: 0.0,
            frequencyPenalty: 0.05,
            dryMultiplier: 0.2,
            disableSpeculativeDecoding: true,
            suppressDefaultStopSequences: true,
            ...generateOverrides,
            useRpGrammar: false,
            onToken: (token: string) => {
              if (shouldAbortRequest()) {
                if (!stopRequested) {
                  stopRequested = true;
                  llamaEngine.stopGeneration().catch(() => { });
                }
                return;
              }

              const prevLen = streamingAccumulated.length;
              streamingAccumulated += token;
              const length = streamingAccumulated.length;

              if (length > 0 && Math.floor(length / 200) > Math.floor(prevLen / 200)) {
                const { shouldStop } = checkStreamingSafety(streamingAccumulated);
                if (shouldStop) {
                  if (!stopRequested) {
                    stopRequested = true;
                    llamaEngine.stopGeneration().catch(() => { });
                  }
                  return;
                }
              }

              const nowMs = Date.now();
              if (nowMs - lastRenderMs < 16) return;
              lastRenderMs = nowMs;
              setMessageState((prev) => {
                const nextMessages = [...prev.messages];
                const lastMessage = nextMessages[nextMessages.length - 1];
                if (lastMessage?.id === aiMessage.id) {
                  nextMessages[nextMessages.length - 1] = {
                    ...lastMessage,
                    content: streamingAccumulated,
                    isStreaming: true,
                  };
                }
                return { ...prev, messages: nextMessages };
              });
            },
          },
        );
        return (accumulated || streamingAccumulated).trim();
      };
      let effectiveContent = stripRuntimeControlText(
        trimDegenerateRepeatTail(await runGenerateAttempt(completionPayload.messages)),
      );
      if (shouldAbortRequest()) {
        discardPlaceholder();
        return;
      }
      const genre = useChatStore.getState().sessions[storyId ?? '']?.storyMeta?.genre;
      const charCfg = getStoryConfig(cfg);
      const characters = extractCharactersFullFromStory(charCfg);
      const fallbackCharacter = characters.find((c: any) => Number(c.id) >= 2);
      const fallbackSpeakerId = Number(fallbackCharacter?.id ?? 2);
      const repeatReferenceTexts = collectRepeatReferenceTexts(messagesRef.current);

      let parsed = parseAIOutputMulti(effectiveContent, characters as any);
      let validation = validateStrictRpOutput(
        effectiveContent,
        parsed,
        languageControls.targetLanguage,
        repeatReferenceTexts,
      );
      let completionMeta = llamaEngine.getLastCompletionMeta();
      if (completionMeta?.finishReason === 'length') {
        logger.warn('[ChatEngineCore] generation cut off at token limit, consider trimming context', {
          kvRatio: llamaEngine.getNCtx() > 0
            ? Number((llamaEngine.getUsedTokens() / llamaEngine.getNCtx()).toFixed(3))
            : 0,
          requestedNPredict: effectiveNPredict,
          finishReason: completionMeta.finishReason,
          tokensPredicted: completionMeta.tokensPredicted,
          usedTokens: llamaEngine.getUsedTokens(),
          nCtx: llamaEngine.getNCtx(),
        });
      }

      const tryNormalizeCurrentOutput = () => {
        const normalizedContent = normalizeInvalidRpOutput(
          effectiveContent,
          parsed,
          fallbackSpeakerId,
        );
        const normalizedParsed = parseAIOutputMulti(normalizedContent, characters as any);
        const normalizedValidation = validateStrictRpOutput(
          normalizedContent,
          normalizedParsed,
          languageControls.targetLanguage,
          repeatReferenceTexts,
        );

        if (normalizedValidation.valid) {
          logger.warn('[ChatEngineCore] invalid AI output normalized before persistence', {
            reasons: validation.reasons,
            finishReason: completionMeta?.finishReason,
            preview: effectiveContent.slice(0, 240),
            normalizedPreview: normalizedContent.slice(0, 240),
          });
          effectiveContent = normalizedContent;
          parsed = normalizedParsed;
          validation = normalizedValidation;
          return true;
        }

        return false;
      };

      const restoreKvForRetry = async () => undefined;
      let retryAttempt = 0;
      while (
        !validation.valid
        && shouldRetryInvalidRpOutput(validation.reasons)
        && retryAttempt < MAX_INVALID_OUTPUT_RETRIES
      ) {
        retryAttempt += 1;
        const useLongformRecovery = shouldForceLongformRecovery(
          effectiveContent,
          completionMeta,
          validation.reasons,
        );
        const isZeroTokenRecovery = !effectiveContent.trim()
          || (completionMeta?.tokensPredicted ?? 0) === 0;
        const shouldRetryThisFailure = isZeroTokenRecovery;
        logger.warn('[ChatEngineCore] retrying invalid AI output before normalization', {
          attempt: retryAttempt,
          maxAttempts: MAX_INVALID_OUTPUT_RETRIES,
          reasons: validation.reasons,
          finishReason: completionMeta?.finishReason,
          useLongformRecovery,
          isZeroTokenRecovery,
          preview: effectiveContent.slice(0, 240),
        });

        if (!shouldRetryThisFailure) {
          logger.warn('[ChatEngineCore] skipping invalid-output retry to avoid drift', {
            attempt: retryAttempt,
            reasons: validation.reasons,
            preview: effectiveContent.slice(0, 240),
          });
          break;
        }

        await restoreKvForRetry();
        if (shouldAbortRequest()) {
          discardPlaceholder();
          return;
        }

        const retryMessages = completionPayload.messages.map((message, index) => (
          index === completionPayload.messages.length - 1
            ? {
                ...message,
                content: buildRetryUserTurnContent(
                  languageControls.wrappedContext,
                  validation.reasons,
                  languageControls.targetLanguage,
                ),
              }
            : message
        ));

        const retryGenerateOverrides: Partial<GenerateOptions> = useLongformRecovery
          ? (isZeroTokenRecovery
              ? {
                  useRpGrammar: false,
                  disableSpeculativeDecoding: true,
                  suppressDefaultStopSequences: true,
                }
              : {
                  useRpGrammar: false,
                })
          : {
              useRpGrammar: false,
            };

        effectiveContent = stripRuntimeControlText(
          trimDegenerateRepeatTail(await runGenerateAttempt(retryMessages, retryGenerateOverrides)),
        );
        if (shouldAbortRequest()) {
          discardPlaceholder();
          return;
        }

        parsed = parseAIOutputMulti(effectiveContent, characters as any);
        validation = validateStrictRpOutput(
          effectiveContent,
          parsed,
          languageControls.targetLanguage,
          repeatReferenceTexts,
        );
        completionMeta = llamaEngine.getLastCompletionMeta();
        if (completionMeta?.finishReason === 'length') {
          logger.warn('[ChatEngineCore] generation cut off at token limit, consider trimming context', {
            kvRatio: llamaEngine.getNCtx() > 0
              ? Number((llamaEngine.getUsedTokens() / llamaEngine.getNCtx()).toFixed(3))
              : 0,
            requestedNPredict: effectiveNPredict,
            finishReason: completionMeta.finishReason,
            tokensPredicted: completionMeta.tokensPredicted,
            usedTokens: llamaEngine.getUsedTokens(),
            nCtx: llamaEngine.getNCtx(),
          });
        }

        if (!validation.valid && !validation.reasons.includes('generic_assistant_tone')) {
          tryNormalizeCurrentOutput();
        }
      }

      const canNormalizeInvalidOutput = canSalvageInvalidOutput(
        effectiveContent,
        parsed,
        validation.reasons,
      );

      if (!validation.valid && canNormalizeInvalidOutput) {
        tryNormalizeCurrentOutput();
      }

      if (!validation.valid) {
        logger.warn('[ChatEngineCore] invalid AI output dropped before persistence', {
          reasons: validation.reasons,
          finishReason: completionMeta?.finishReason,
          preview: effectiveContent.slice(0, 240),
        });
        discardPlaceholder();
        emitEvent('streaming_completed');
        return;
      }

      const finalAiMessages: ChatMessage[] = [];
      const aiDialogueLines: string[] = [];

      if (parsed.lines.length > 0) {
        parsed.lines.forEach((line, idx) => {
          const rawSpeaker = Number(line.speakerId);
          const char = characters.find((c: any) => Number(c.id) === rawSpeaker);
          const resolvedSpeaker = rawSpeaker === 0 || char ? rawSpeaker : fallbackSpeakerId;
          const resolvedChar = resolvedSpeaker >= 2
            ? (char ?? fallbackCharacter)
            : undefined;
          const msg: ChatMessage = {
            id: `msg_${nanoid()}_ai_${idx}`,
            role: line.role === 'narrator' || resolvedSpeaker === 0 ? 'narrator' : 'ai',
            content: line.content,
            speakerId: resolvedSpeaker,
            characterId: resolvedSpeaker >= 2 ? String(resolvedSpeaker) : undefined,
            characterName: resolvedSpeaker >= 2
              ? (resolvedChar?.name ?? line.speakerName ?? fallbackCharacter?.name ?? 'Character')
              : undefined,
            characterProfileUrl: resolvedSpeaker >= 2
              ? (resolvedChar?.imageUris?.[0] ?? resolvedChar?.profileUrl ?? resolvedChar?.profile_url)
              : undefined,
            narratorType: line.role === 'narrator' ? line.narratorType : undefined,
            actionPrefix: line.actionPrefix,
            timestamp: Date.now() + idx,
            isStreaming: false,
            metadata: {
              turnNumber: userMessage.metadata?.turnNumber,
              generationTime: idx === 0 ? (Date.now() - startTime) : undefined } };
          finalAiMessages.push(msg);
          aiDialogueLines.push(`${resolvedSpeaker}:${line.content}`);
        });
      } else {
        logger.warn('[ChatEngineCore] no renderable AI lines after generation; finishing without assistant bubble', {
          finishReason: completionMeta?.finishReason,
          preview: effectiveContent.slice(0, 240),
        });
        discardPlaceholder();
        emitEvent('streaming_completed');
        return;
      }

      const currentChapterId = getStoryConfig(cfg)?.chapters?.[currentChapterIndexRef.current]?.id;
      if (storyId && currentChapterId && effectiveContent) {
        chapterLogTracker.appendFromAIResponse(storyId, String(currentChapterId), effectiveContent);
      }

      if (shouldAbortRequest()) {
        discardPlaceholder();
        return;
      }

      // Persist the final AI messages before returning so DB and UI stay in sync.
      // setMessageState renders immediately, but addMessages is still the source of truth.
      // Waiting here prevents the next restore path from seeing a partial conversation.
      //
      if (storyId) {
        const storedMsgs: StoredChatMessage[] = finalAiMessages.map(m => ({ ...toStoredMessageFromCore(m), genre } as StoredChatMessage));
        await addMessages(storyId, storedMsgs, aiDialogueLines);
      }

      const firstAIMessage = finalAiMessages.find(message => message.role === 'ai');
      // [PERF] Legacy turn-result persistence was removed because story setup is injected natively

      if (shouldAbortRequest()) {
        discardPlaceholder();
        return;
      }

      if (isMountedRef.current) {
        setMessageState((prev) => {
          const existingIds = new Set(prev.messages.map(m => m.id));
          const placeholderPresent = existingIds.has(aiMessage.id);
          const newFinalMsgs = finalAiMessages.filter(m => !existingIds.has(m.id));

          if (!placeholderPresent && newFinalMsgs.length === 0) {
            return prev;
          }

          const withoutPlaceholder = placeholderPresent
            ? prev.messages.filter(m => m.id !== aiMessage.id)
            : prev.messages;

          const nextMessages = [...withoutPlaceholder, ...newFinalMsgs];
          const lastMsgId = newFinalMsgs.length > 0
            ? newFinalMsgs[newFinalMsgs.length - 1]?.id
            : (finalAiMessages[finalAiMessages.length - 1]?.id ?? aiMessage.id);
          return { ...prev, messages: nextMessages, totalMessages: nextMessages.length, lastMessageId: lastMsgId } as MessageState;
        });
      }

      if (shouldAbortRequest()) return;

      emitEvent('message_received', { messages: finalAiMessages });
      emitEvent('streaming_completed');
    } catch (error) {
      // Timeouts can still leak late token callbacks from the abandoned generation.
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      if (isTimeout) {
        generationRequestIdRef.current += 1;
      }

      if (shouldAbortRequest()) {
        discardPlaceholder();
        clearOwnStreamingState();
        return;
      }
      console.error('AI response generation error:', error);
      const isInvalidAiOutput = error instanceof Error && error.message === 'INVALID_AI_OUTPUT';

      // For invalid AI output, keep the user turn and only remove the placeholder AI message.
      if (isMountedRef.current && storyId) {
        setMessageState((prev) => {
          const nextMessages = prev.messages.filter(
            (m) => isInvalidAiOutput
              ? m.id !== aiMessage.id
              : (m.id !== userMessage.id && m.id !== aiMessage.id),
          );
          return { ...prev, messages: nextMessages };
        });

        const { removeMessage } = await import('../../../store/chatStore');
        if (!isInvalidAiOutput) {
          removeMessage(storyId, userMessage.id);
        }
        removeMessage(storyId, aiMessage.id);

        if (!isInvalidAiOutput) {
          try {
            const { kvStateManager } = await import('../../../core/llama/KVStateManager');
            if (resolvedModelId) {
              await kvStateManager.restoreFromPrevSession(storyId, resolvedModelId);
            }
            logger.log('[ChatEngineCore] generation failure rollback completed - KV restored');
          } catch (rollbackError) {
            logger.error('[ChatEngineCore] generation rollback failed:', rollbackError);
          }
        } else {
          logger.log('[ChatEngineCore] invalid AI output - skipping KV rollback');
        }
      }

      emitEvent('error_occurred', {
        code: isInvalidAiOutput ? 'INVALID_AI_OUTPUT' : 'GENERATE_AI_RESPONSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate AI response.',
        timestamp: Date.now(),
        retryable: true,
      });
      throw error;
    } finally {
      clearOwnStreamingState();
    }
  }, [addMessages, resolvedModelId, buildContext, emitEvent, storyId, updateMessageInStore]);

  const sendMessage = useCallback(async (content: string, replyTo?: { id: string; text: string; senderName?: string } | null) => {
    if (!initialOptions?.enabled) return;
    if (!storyId || !content.trim()) return;
    if (!checkContentSafety(content)) return;
    if (isKVLoadingRef.current) return;
    if (transitionLockRef.current) return;

    // Guard sendMessage with an immediate ref lock before async state updates land.
    //
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const currentTurn = messageStateRef.current.currentTurn;
    const alreadyProcessing = messageStateRef.current.isProcessingMessage;
    if (alreadyProcessing) {
      isSendingRef.current = false;
      return;
    }

    const userMessage = createUserMessage(content.trim(), {
      metadata: { turnNumber: currentTurn + 1 },
      replyTo: replyTo ?? null });

    try {
      setMessageState((prev) => {
        // Avoid inserting the same optimistic user message twice under StrictMode.
        if (prev.messages.some(m => m.id === userMessage.id)) return prev;
        return {
          ...prev,
          isProcessingMessage: true,
          messages: [...prev.messages, userMessage],
          currentTurn: prev.currentTurn + 1,
          totalTurns: prev.totalTurns + 1,
          lastMessageId: userMessage.id,
        };
      });

      const genre = useChatStore.getState().sessions[storyId ?? '']?.storyMeta?.genre;
      await addMessage(storyId, { ...toStoredMessageFromCore(userMessage), genre } as StoredChatMessage);
      emitEvent('message_sent', { message: userMessage });
      await generateAIResponse(userMessage);
    } catch (error) {
      console.error('Send message error:', error);
      const isInvalidAiOutput = error instanceof Error && error.message === 'INVALID_AI_OUTPUT';
      if (isInvalidAiOutput) {
        console.log('[ChatEngineCore] invalid AI output; preserving user message for retry');
        ToastService.error(t?.aiResponseFail ?? '');
        return;
      }
      // Roll back the optimistic user message if sendMessage fails before the AI turn commits.
      setMessageState((prev) => ({
        ...prev,
        messages: prev.messages.filter(m => m.id !== userMessage.id),
        currentTurn: Math.max(0, prev.currentTurn - 1),
        totalTurns: Math.max(0, prev.totalTurns - 1),
      }));
      // Mirror the rollback in the persisted chat store.
      try {
        const { deleteMessages } = useChatStore.getState();
        deleteMessages(storyId, [userMessage.id]);
      } catch (dbError) {
        console.error('[ChatEngineCore] failed to remove unsent message from DB:', dbError);
      }
      ToastService.error(t?.outbox_failedToSend ?? '');
    } finally {
      isSendingRef.current = false;
      setMessageState((prev) => ({ ...prev, isProcessingMessage: false }));
    }
  }, [addMessage, emitEvent, generateAIResponse, initialOptions?.enabled, storyId, t?.aiResponseFail, t?.outbox_failedToSend]);

  const selectChoice = useCallback(async (choice: ChoiceOption) => {
    if (!initialOptions?.enabled) return;
    if (isKVLoadingRef.current) return;
    if (transitionLockRef.current) return;
    const alreadyProcessing = messageStateRef.current.isProcessingMessage;
    if (alreadyProcessing) return;
    setMessageState(prev => ({ ...prev, isProcessingMessage: true }));
    let choiceMessage: ChatMessage | null = null;
    try {
      setMessageState((prev) => {
        const messages = [...prev.messages];
        const lastAIIdx = [...messages].reverse().findIndex(m => m.role === 'ai');
        if (lastAIIdx < 0) return prev;
        const realIdx = messages.length - 1 - lastAIIdx;
        const lastAI = messages[realIdx];
        if (!lastAI?.choices?.length) return prev;
        messages[realIdx] = { ...lastAI, choices: lastAI.choices.map(c => ({ ...c, isSelected: c.id === choice.id })) };
        return { ...prev, messages };
      });

      const currentTurn = messageStateRef.current.currentTurn;
      choiceMessage = createUserMessage(choice.label, { choices: [choice], metadata: { turnNumber: currentTurn + 1 } });
      const genre = useChatStore.getState().sessions[storyId ?? '']?.storyMeta?.genre;
      if (storyId) await addMessage(storyId, { ...toStoredMessageFromCore(choiceMessage), genre } as StoredChatMessage);
      setMessageState((prev) => ({
        ...prev,
        messages: [...prev.messages, choiceMessage],
        currentTurn: prev.currentTurn + 1,
        totalTurns: prev.totalTurns + 1 }));
      emitEvent('choice_selected', { choice });
      if (choice.targetChapterId) await changeChapter(choice.targetChapterId);
      if (transitionLockRef.current || isKVLoadingRef.current) return;
      await generateAIResponse(choiceMessage);
    } catch (error) {
      console.error('Select choice error:', error);
      if (choiceMessage && storyId) {
        setMessageState((prev) => ({
          ...prev,
          messages: prev.messages.filter(m => m.id !== choiceMessage?.id),
          currentTurn: Math.max(0, prev.currentTurn - 1),
          totalTurns: Math.max(0, prev.totalTurns - 1),
        }));
        try {
          const { deleteMessages } = useChatStore.getState();
          deleteMessages(storyId, [choiceMessage.id]);
        } catch (dbError) {
          console.error('[ChatEngineCore] choice rollback DB failed:', dbError);
        }
      }
    } finally {
      setMessageState(prev => ({ ...prev, isProcessingMessage: false }));
    }
  }, [addMessage, changeChapter, emitEvent, generateAIResponse, initialOptions?.enabled, storyId]);

  const bookmarkMessage = useCallback((messageId: string) => {
    const current = messagesRef.current.find((m) => m.id === messageId);
    if (!current) return;
    const nextBookmarked = !(current.bookmarked ?? false);
    setMessageState((prev) => ({
      ...prev,
      messages: prev.messages.map((message) => message.id === messageId ? { ...message, bookmarked: nextBookmarked } : message) }));
    if (storyId) updateMessageInStore(storyId, messageId, { bookmarked: nextBookmarked, isImportant: nextBookmarked });
    emitEvent(nextBookmarked ? 'message_bookmarked' : 'message_unbookmarked', { messageId });
  }, [emitEvent, storyId, updateMessageInStore]);

  const editMessage = useCallback((messageId: string, content: string) => {
    const nextContent = content.trim();
    if (!nextContent) return;
    setMessageState((prev) => ({
      ...prev,
      messages: prev.messages.map((message) => message.id === messageId ? { ...message, content: nextContent } : message) }));
    if (storyId) updateMessageInStore(storyId, messageId, { content: nextContent });
  }, [storyId, updateMessageInStore]);

  const reactToMessage = useCallback((messageId: string, emoji: string) => {
    const current = messagesRef.current.find((m) => m.id === messageId);
    if (!current) return;
    const prevReactions = current.reactions ?? [];
    const hasReaction = prevReactions.includes(emoji);
    const nextReactions = hasReaction ? prevReactions.filter((r) => r !== emoji) : [...prevReactions, emoji];
    setMessageState((prev) => ({
      ...prev,
      messages: prev.messages.map((message) => message.id === messageId ? { ...message, reactions: nextReactions } : message) }));
    if (storyId) updateMessageInStore(storyId, messageId, { reactions: nextReactions });
    emitEvent('message_reacted', { messageId, emoji, reactions: nextReactions });
  }, [emitEvent, storyId, updateMessageInStore]);

  const scrollToBottom = useCallback(() => {
    const runScroll = (animated: boolean) => {
      flatListRef.current?.scrollToEnd?.({ animated });
    };
    runScroll(false);
    requestAnimationFrame(() => runScroll(true));
    setTimeout(() => runScroll(false), 48);
    setTimeout(() => runScroll(true), 160);
    setUIState((prev) => ({ ...prev, isAtBottom: true, showScrollToBottom: false }));
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const idx = messagesRef.current.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    try {
      flatListRef.current?.scrollToIndex?.({ index: idx, animated: true, viewPosition: 0.3 });
    } catch {
      flatListRef.current?.scrollToEnd?.({ animated: false });
    }
  }, []);

  const handleLoadSession = useCallback(async () => {
    if (!storyId || !initialOptions?.enabled) return;
    const targetStory = normalizedStory;
    const config = normalizedConfig;
    if (!config?.chapters?.length) return;

    const chapterIndex = Math.max(0, initialOptions?.initialChapterIndex ?? 0);
    const loadSessionKey = `${storyId}:${initialOptions?.resumeMode !== false ? 'resume' : 'fresh'}:${chapterIndex}`;
    if (loadSessionKeyRef.current === loadSessionKey) return;
    loadSessionKeyRef.current = loadSessionKey;

    try {
      const shouldResume = initialOptions?.resumeMode !== false;
      if (!shouldResume) {
        emotionStateRef.current = { ...emotionStateRef.current, currentEmotions: seededInitialEmotions };
        setEmotionState(prev => ({ ...prev, currentEmotions: seededInitialEmotions }));
        createSession(storyId, {}, buildStoryMeta());
        introSeededKeysRef.current = new Set();
        await seedIntroMessagesRef.current(targetStory, chapterIndex);
        return;
      }
      const session = await loadSession(storyId);
      if (!session) {
        emotionStateRef.current = { ...emotionStateRef.current, currentEmotions: seededInitialEmotions };
        setEmotionState(prev => ({ ...prev, currentEmotions: seededInitialEmotions }));
        createSession(storyId, {}, buildStoryMeta());
        introSeededKeysRef.current = new Set();
        await seedIntroMessagesRef.current(targetStory, chapterIndex);
        return;
      }

      const visibleSessionMessages = session.messages.slice(-SESSION_RESTORE_LIMIT);
      const restoredCharacters = extractCharactersFullFromStory(targetStory);
      const restoredMessages = visibleSessionMessages.map(message =>
        fromStoredMessageToCore(message, restoredCharacters),
      );
      introSeededKeysRef.current = new Set(
        session.messages
          .filter(message => message.isIntro && message.setId)
          .map(message => String(message.setId)),
      );
      const restoredEmotions: Record<string, EditorEmotions> = {};
      emotionStateRef.current = { ...emotionStateRef.current, currentEmotions: restoredEmotions };

      const activeChapterIdx = session.currentChapterIndex ?? 0;

      setMessageState((prev) => ({
        ...prev,
        messages: restoredMessages,
        currentTurn: session.turnCount,
        totalTurns: session.turnCount,
        lastMessageId: restoredMessages.length > 0 ? restoredMessages[restoredMessages.length - 1].id : undefined }));
      setEmotionState((prev) => ({ ...prev, currentEmotions: restoredEmotions }));
      setSessionState((prev) => ({
        ...prev,
        totalMessages: restoredMessages.length,
        totalTurns: session.turnCount,
        isRestored: true,
        currentChapterIndex: activeChapterIdx }));
      currentChapterIndexRef.current = activeChapterIdx;
      emitEvent('session_restored', {
        storyId,
        messageCount: restoredMessages.length,
        chapterIndex: activeChapterIdx,
      });

      // Some restored sessions lose intro metadata on DB fallback.
      // Check both intro flags and legacy intro ids before reseeding this chapter.
      //
      const introSetId = `intro_${activeChapterIdx}`;
      const hasIntroForChapter = introSeededKeysRef.current.has(introSetId)
        || restoredMessages.some(m =>
          (m.isIntro && m.setId === introSetId)
          || m.id?.startsWith(`intro_${activeChapterIdx}_`)
          || m.id === `chapter_${activeChapterIdx}_start`
          || m.id === `chapter_${activeChapterIdx}_title`
        );

      if (restoredMessages.length === 0 || !hasIntroForChapter) {
        // If intro markers are missing, seed the chapter intro again and prepend it when needed.
        await seedIntroMessagesRef.current(targetStory, activeChapterIdx, { prepend: restoredMessages.length > 0 });
      }
    } catch (error) {
      loadSessionKeyRef.current = '';
      console.error('Load session error:', error);
      emitEvent('error_occurred', {
        code: 'LOAD_SESSION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to load chat session',
        timestamp: Date.now(),
        retryable: true
      });
    } finally {
      if (isMountedRef.current) {
        setSessionLoadReady(true);
      }
    }
  }, [buildStoryMeta, createSession, emitEvent, loadSession, initialOptions?.enabled, initialOptions?.resumeMode, storyId, initialOptions?.initialChapterIndex, normalizedConfig, normalizedStory, seededInitialEmotions]);

  useEffect(() => {
    if (!initialOptions?.enabled) {
      kvInitKeyRef.current = '';
      setSessionLoadReady(false);
      isKVLoadingRef.current = false; setSessionState(prev => prev.isKVLoading ? { ...prev, isKVLoading: false } : prev);
      return;
    }

    const config = normalizedConfig;
    if (!sessionLoadReady || !config?.chapters?.length || !resolvedModelId || !storyId) return;
    if (kvBootstrapInFlightKeyRef.current) {
      return;
    }

    const currentChapterIdx = sessionState.currentChapterIndex;
    const kvInitKey = `${storyId}:${resolvedModelId}:${currentChapterIdx}`;
    if (kvInitKeyRef.current === kvInitKey || kvBootstrapInFlightKeyRef.current === kvInitKey) return;

    const runId = kvBootstrapRunIdRef.current + 1;
    kvBootstrapRunIdRef.current = runId;
    kvBootstrapInFlightKeyRef.current = kvInitKey;
    const isCurrentRun = () =>
      isMountedRef.current &&
      kvBootstrapRunIdRef.current === runId &&
      kvBootstrapInFlightKeyRef.current === kvInitKey;
    isKVLoadingRef.current = true; setSessionState(prev => ({ ...prev, isKVLoading: true }));

    (async () => {
      try {
        invalidateGenerationRequests();
        await stopActiveGeneration('kv_bootstrap');
        if (!isCurrentRun()) return;

        const promptLayers = config
          ? buildKVPromptLayers(config, {
            chapterIndex: currentChapterIdx,
            userName: '',
          })
          : null;
        const systemPrompt = kvSessionRef.current.currentBasePromptRef.current
          || promptLayers?.basePrompt
          || '';
        if (systemPrompt) {
          llamaEngine.setWarmupSystemPrompt(systemPrompt);
        }
        await llamaEngine.load(resolvedModelId);
        if (!isCurrentRun()) return;

        await kvSessionRef.current.initStory({
          modelId: resolvedModelId,
          storyId,
          serverUrl: ApiConfig.workerBaseUrl,
          config,
          userName: '',
          resumeMode: initialOptions?.resumeMode,
        });
        if (!isCurrentRun()) return;

        const chapterList = config.chapters ?? [];
        const restoredIdx = kvSessionRef.current.restoredChapterIdxRef.current;
        const targetChapterIdx = restoredIdx >= 0 ? restoredIdx : currentChapterIdx;
        const chId = chapterList[targetChapterIdx]?.id ?? '';
        const logBlock = chId ? chapterLogTracker.toKVBlock(storyId, chId) : undefined;

        await kvSessionRef.current.initChapter(storyId, targetChapterIdx, config, logBlock);

        if (!isCurrentRun()) return;

        kvInitKeyRef.current = kvInitKey;
        isKVLoadingRef.current = false;
        setSessionState(prev => ({
          ...prev,
          isKVLoading: false,
          ...(restoredIdx >= 0 && restoredIdx !== currentChapterIdx
            ? { currentChapterIndex: restoredIdx }
            : {}),
        }));
        if (restoredIdx >= 0 && restoredIdx !== currentChapterIdx) {
          currentChapterIndexRef.current = restoredIdx;
        }
      } catch (err) {
        console.error('[ChatEngineCore] KV background init failed:', err);
        if (isCurrentRun()) {
          isKVLoadingRef.current = false;
          setSessionState(prev => ({ ...prev, isKVLoading: false }));
        }
      } finally {
        // Only clear the in-flight bootstrap marker if this finishing run still owns it.
        // A newer bootstrap may already be running for the same story/model/chapter key.
        // Clearing the flag unconditionally here would allow overlapping bootstrap work.
        //
        //
        //
        //
        //
        //
        //
        //
        if (kvBootstrapInFlightKeyRef.current === kvInitKey) {
          kvBootstrapInFlightKeyRef.current = '';
        }
      }
    })();
  }, [resolvedModelId, initialOptions?.enabled, invalidateGenerationRequests, normalizedConfig, sessionLoadReady, sessionState.currentChapterIndex, stopActiveGeneration, storyId]);

  useEffect(() => {
    return () => {
      invalidateGenerationRequests();
      transitionLockRef.current = false;
      stopActiveGeneration('story_scope_cleanup').catch(() => { });
    };
  }, [resolvedModelId, invalidateGenerationRequests, stopActiveGeneration, storyId]);

  const handleSaveSession = useCallback(async () => {
    if (!storyId) return;
    if (isRuntimeInterferenceSuspended()) {
      logger.log('[ChatEngineCore] handleSaveSession skipped - runtime guard active');
      return;
    }
    try {
      const state = messageStateRef.current;
      const turnCount = state.currentTurn;
      const messagesToSave = state.messages
        .filter(m => !m.isStreaming)
        .map(m => toStoredMessageFromCore(m));

      const session: ChatSession = {
        storyId,
        messages: messagesToSave as StoredChatMessage[],
        emotions: {},
        turnCount,
        currentChapterIndex: currentChapterIndexRef.current,
        lastUpdated: Date.now(),
        dialogueHistory: buildDialogueHistoryFromCore(state.messages),
        modelId: resolvedModelId,
        storyMeta: buildStoryMeta() };

      await saveSession(session);
    } catch (error) {
      console.error('Save session error:', error);
    }
  }, [resolvedModelId, buildStoryMeta, storyId, saveSession]);

  useEffect(() => { handleSaveSessionRef.current = handleSaveSession; }, [handleSaveSession]);

  useEffect(() => {
    return () => {
      invalidateGenerationRequests();
      transitionLockRef.current = false;
      stopActiveGeneration('chat_unmount').catch(() => { });
      handleSaveSessionRef.current().catch(() => { });
      if (storyId) {
        releaseStorySharedValues(storyId);
      }
    };
  }, [invalidateGenerationRequests, stopActiveGeneration, storyId]);

  useEffect(() => {
    handleLoadSession();
  }, [handleLoadSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleSaveSessionRef.current().catch(() => { });
    }, 30000);
    return () => clearInterval(interval);
  }, [storyId]);

  useEffect(() => {
    const TRIM_THRESHOLD = UI_TRIM_THRESHOLD;
    if (messageState.messages.length <= TRIM_THRESHOLD) return;
    setMessageState((prev) => ({ ...prev, messages: prev.messages.slice(-UI_MESSAGE_LIMIT) }));
  }, [messageState.messages]);

  return {
    messageState,
    streamingState,
    uiState,
    emotionState,
    sessionState,
    errorState,
    sendMessage,
    selectChoice,
    bookmarkMessage,
    editMessage,
    reactToMessage,
    updateEmotions,
    changeChapter,
    scrollToBottom,
    scrollToMessage,
    handleLoadSession,
    handleSaveSession,
    addEventHandler,
    removeEventHandler,
    emitEvent,
    flatListRef };
}


