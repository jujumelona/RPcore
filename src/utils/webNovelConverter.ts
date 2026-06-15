/* eslint-disable @typescript-eslint/no-unused-vars */
import type { LocalMessage } from '../screens/chat/types/ChatTypes';
import type { WNParagraph, WNEmotionData, WNCharacter, WNEmotions } from './webNovelStorage';

const EMOTION_KEYS: Array<keyof WNEmotions> = ['e1', 'e2', 'e3', 'e4', 'e5'];

const DEFAULT_MAX_TURNS_PER_BATCH = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_INPUT_CHARS = 7200;
const FALLBACK_PARAGRAPH_CHAR_LIMIT = 900;

export interface WNTurn {
  paragraphId: number;
  messages: LocalMessage[];
  emotionDeltas: Record<number, Partial<WNEmotions>>;
}

export interface BuiltChapter {
  paragraphs: WNParagraph[];
  emotionData: WNEmotionData;
}

export interface TurnBatchOptions {
  maxTurnsPerBatch?: number;
  maxInputChars?: number;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildFallbackParagraph(turn: WNTurn): string {
  const raw = turn.messages
    .map(m => (m.role === 'user' ? `"${m.content}"` : m.content))
    .join(' ');
  const compact = normalizeText(raw);
  if (!compact) return '(empty)';
  if (compact.length <= FALLBACK_PARAGRAPH_CHAR_LIMIT) return compact;
  return `${compact.slice(0, FALLBACK_PARAGRAPH_CHAR_LIMIT - 3)}...`;
}

function estimateTurnChars(turn: WNTurn): number {
  return turn.messages.reduce((sum, msg) => sum + (msg.content?.length ?? 0), 0) + 48;
}

function cloneTurnWithParagraphId(turn: WNTurn, paragraphId: number): WNTurn {
  return {
    paragraphId,
    messages: turn.messages,
    emotionDeltas: turn.emotionDeltas };
}

function makeTurn(paragraphId: number, messages: LocalMessage[]): WNTurn {
  const emotionDeltas: Record<number, Partial<WNEmotions>> = {};

  for (const message of messages) {
    if (!message.emotionDeltas) continue;

    for (const [charIdStr, delta] of Object.entries(message.emotionDeltas)) {
      const charId = Number(charIdStr);
      if (!Number.isFinite(charId)) continue;
      if (!emotionDeltas[charId]) emotionDeltas[charId] = {};

      for (const key of EMOTION_KEYS) {
        const value = (delta as Partial<WNEmotions>)[key];
        if (value === undefined) continue;
        if (!emotionDeltas[charId]) emotionDeltas[charId] = {};
        const entry = emotionDeltas[charId] as Partial<WNEmotions>;
        (entry[key] as number) = ((entry[key] ?? 0) as number) + value;
      }
    }
  }

  return { paragraphId, messages, emotionDeltas };
}

export function groupTurns(messages: LocalMessage[]): WNTurn[] {
  const turns: WNTurn[] = [];
  const filtered = messages.filter(message => !message.isIntro);

  let current: LocalMessage[] = [];
  let paragraphId = 0;

  for (const message of filtered) {
    if (message.role === 'user' && current.length > 0) {
      turns.push(makeTurn(paragraphId++, current));
      current = [];
    }
    current.push(message);
  }

  if (current.length > 0) {
    turns.push(makeTurn(paragraphId, current));
  }

  return turns;
}

export function batchTurns(turns: WNTurn[], options: TurnBatchOptions = {}): WNTurn[][] {
  if (turns.length === 0) return [];

  const maxTurnsPerBatch = Math.max(1, options.maxTurnsPerBatch ?? DEFAULT_MAX_TURNS_PER_BATCH);
  const maxInputChars = Math.max(400, options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS);

  const batches: WNTurn[][] = [];
  let current: WNTurn[] = [];
  let currentChars = 0;

  for (const turn of turns) {
    const turnChars = estimateTurnChars(turn);
    const turnLimitReached = current.length >= maxTurnsPerBatch;
    const charLimitReached = current.length > 0 && currentChars + turnChars > maxInputChars;

    if (turnLimitReached || charLimitReached) {
      batches.push(current.map((item, idx) => cloneTurnWithParagraphId(item, idx)));
      current = [];
      currentChars = 0;
    }

    current.push(turn);
    currentChars += turnChars;
  }

  if (current.length > 0) {
    batches.push(current.map((item, idx) => cloneTurnWithParagraphId(item, idx)));
  }

  return batches;
}

export function buildChapterNovelPrompt(
  turns: WNTurn[],
  chapterTitle: string,
  characters: WNCharacter[],
  storyTitle: string,
): string {
  const characterNames = characters
    .filter(character => character.id >= 2)
    .map(character => `ID${character.id}=${character.name}`)
    .join(', ');

  const turnsText = turns
    .map(turn => {
      const lines = turn.messages
        .map(message => {
          if (message.role === 'user') return `[USER] ${message.content}`;
          if (message.role === 'narrator') return `[NARRATOR] ${message.content}`;
          return `[${message.characterName ?? 'CHAR'}] ${message.content}`;
        })
        .join('\n');
      return `[TURN_${turn.paragraphId}]\n${lines}`;
    })
    .join('\n\n');

  return `<start_of_turn>user
You convert chat turns into web-novel paragraphs.

Story: ${storyTitle}
Chapter: ${chapterTitle}
Characters: ${characterNames || '(none)'}

Rules:
1) For every [TURN_N], output exactly one paragraph beginning with [N].
2) Keep dramatic, novel-like narration. No meta commentary.
3) After all paragraphs, append:
===DELTAS===
@paragraphId|charId: e1+X e2-Y ...
4) If no delta for a turn, skip that line.

Input:
${turnsText}
<end_of_turn>
<start_of_turn>model
`;
}

function parseModelParagraphs(rawBody: string): WNParagraph[] {
  const parsed: WNParagraph[] = [];
  const paraRegex = /\[(\d+)\]([\s\S]*?)(?=\[\d+\]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = paraRegex.exec(rawBody)) !== null) {
    const id = Number.parseInt(match[1], 10);
    const text = normalizeText(match[2] ?? '');
    if (!Number.isFinite(id) || !text) continue;
    parsed.push({ id, text });
  }

  if (parsed.length > 0) return parsed;

  return rawBody
    .split(/\n{2 }/)
    .map((piece, idx) => ({ id: idx, text: normalizeText(piece) }))
    .filter(piece => piece.text.length > 0);
}

function parseModelDeltas(deltaPart: string | undefined): WNEmotionData {
  const emotionData: WNEmotionData = {};
  if (!deltaPart) return emotionData;

  const lines = deltaPart
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const headerMatch = line.match(/^@(\d+)\|(\d+):\s*(.+)$/);
    if (!headerMatch) continue;

    const paragraphId = Number.parseInt(headerMatch[1], 10);
    const charId = Number.parseInt(headerMatch[2], 10);
    if (!Number.isFinite(paragraphId) || !Number.isFinite(charId)) continue;

    const delta: Partial<WNEmotions> = {};
    const chunks = headerMatch[3].split(/\s+/).map(item => item.trim()).filter(Boolean);

    for (const chunk of chunks) {
      const normalized = chunk.replace(/[,;]+$/g, '');
      const deltaMatch = normalized.match(/^(e[1-5])([+-])(\d+)$/i);
      if (!deltaMatch) continue;
      const key = deltaMatch[1].toLowerCase() as keyof WNEmotions;
      const sign = deltaMatch[2] === '-' ? -1 : 1;
      const value = sign * Number.parseInt(deltaMatch[3], 10);
      if (!Number.isFinite(value)) continue;
      (delta[key] as number) = value;
    }

    if (!emotionData[paragraphId]) emotionData[paragraphId] = {};
    emotionData[paragraphId][charId] = {
      ...(emotionData[paragraphId][charId] ?? {}),
      ...delta };
  }

  return emotionData;
}

export function parseChapterNovelOutput(raw: string, turns: WNTurn[]): BuiltChapter {
  const safeRaw = raw ?? '';
  const [bodyPart, deltaPart] = safeRaw.split('===DELTAS===');

  const parsedParagraphs = parseModelParagraphs(bodyPart ?? safeRaw);
  const parsedById = new Map<number, string>();
  for (const paragraph of parsedParagraphs) {
    if (!parsedById.has(paragraph.id)) {
      parsedById.set(paragraph.id, paragraph.text);
    }
  }

  const paragraphs: WNParagraph[] = turns.map((turn, idx) => {
    const direct = parsedById.get(turn.paragraphId);
    const indexed = parsedById.get(idx);
    const text = direct ?? indexed ?? buildFallbackParagraph(turn);
    return { id: turn.paragraphId, text };
  });

  const emotionData: WNEmotionData = parseModelDeltas(deltaPart);

  for (const turn of turns) {
    if (!turn.emotionDeltas || Object.keys(turn.emotionDeltas).length === 0) continue;
    const paragraphId = turn.paragraphId;
    if (!emotionData[paragraphId]) emotionData[paragraphId] = {};

    for (const [charIdStr, delta] of Object.entries(turn.emotionDeltas ?? {})) {
      const charId = Number(charIdStr);
      if (!Number.isFinite(charId)) continue;

      const merged: Partial<WNEmotions> = { ...(emotionData[paragraphId][charId] ?? {}) };
      for (const key of EMOTION_KEYS) {
        const stored = (delta as Partial<WNEmotions>)[key];
        if (stored !== undefined) {
          (merged[key] as number) = stored;
        }
      }
      emotionData[paragraphId][charId] = merged;
    }
  }

  return { paragraphs, emotionData };
}

export function mergeChapters(chapters: BuiltChapter[]): BuiltChapter {
  let offset = 0;
  const paragraphs: WNParagraph[] = [];
  const emotionData: WNEmotionData = {};

  for (const chapter of chapters) {
    for (const paragraph of chapter.paragraphs) {
      const id = paragraph.id + offset;
      paragraphs.push({ id, text: paragraph.text });
    }

    for (const [paragraphIdStr, charMap] of Object.entries(chapter.emotionData ?? {})) {
      const paragraphId = Number.parseInt(paragraphIdStr, 10);
      if (!Number.isFinite(paragraphId)) continue;
      emotionData[paragraphId + offset] = charMap;
    }

    const maxParagraphId = (chapter.paragraphs ?? []).reduce((max, paragraph) => Math.max(max, paragraph.id), -1);
    offset += maxParagraphId + 1;
  }

  return { paragraphs, emotionData };
}

export function buildPlainText(paragraphs: WNParagraph[]): string {
  return paragraphs.map(paragraph => paragraph.text).join('\n\n');
}

