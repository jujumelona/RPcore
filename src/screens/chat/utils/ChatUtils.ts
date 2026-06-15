/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/chat/utils/ChatUtils.ts
// [sanitized comment]
// 공통 유틸리티 — ChatEngineCore와 ChatCore에서 공유

import { getTranslations } from '../../../i18n/translations';
import type { ParsedMessage, ParseResult, Message } from '../types/ChatTypes';
import type { StoryCharacter } from '../../../types/StoryContract';
import { extractCharactersFull as extractCharactersFullUtil } from '../../../utils/characterUtils';

const _defaultT = getTranslations('ko');

// 상수 정의 (외부에서 필요한 것만 export)
export { UI_MESSAGE_LIMIT as MAX_MESSAGES_IN_MEMORY, UI_TRIM_THRESHOLD as MESSAGE_TRIM_THRESHOLD } from '../../../constants/chatLimits';
export const MAX_MESSAGES_FOR_CONTEXT = 20; // callGemma recentMessages 기본값
export const MAX_DIALOGUE_HISTORY = 24;
export const MIN_TURNS_BEFORE_CHOICE = 3;

// ✅ ChatEngineCore와 공유: 메시지 → 스토어 포맷 변환
export function storedToMessage(stored: any, _characters: StoryCharacter[]): Message {
  return {
    id: stored.id,
    role: stored.role,
    content: stored.content,
    characterId: stored.characterId,
    characterName: stored.characterName,
    characterProfileUrl: stored.characterProfileUrl,
    timestamp: stored.timestamp,
    bookmarked: stored.bookmarked ?? stored.isImportant ?? false,
    isIntro: stored.isIntro ?? false,
    setId: stored.setId,
    replyTo: stored.replyTo ?? null,
    reactions: stored.reactions,
    isChoiceResult: stored.isChoiceResult ?? false };
}

// ✅ ChatEngineCore와 공유: 메시지 → 스토어 포맷 변환 (llama.rn 호환)
// legacy alias for ChatCore
export const messageToStored = (m: any, _u?: any, _n?: any) => toStoredMessageFromCore(m);

export function toStoredMessageFromCore(
  message: import('../types/ChatTypes').ChatMessage,
): import('../../../store/chatStore').ChatMessage {
  const speaker = message.role === 'user'
    ? 1
    : message.role === 'narrator'
      ? 0
      : Number.parseInt(message.characterId ?? '2', 10) || 2;

  // [BUG-2 FIX] role 필드를 저장 시점에 같이 기록
  // DB에서 재로드(dbRowToChatMessage)할 때 speaker→role 재계산을 보완하는 역할
  const role = message.role ?? (speaker === 1 ? 'user' : speaker === 0 ? 'narrator' : 'ai');

  return {
    id: message.id,
    speaker,
    role: role === 'image_card' ? 'ai' : role,
    speakerName: message.characterName ?? (speaker === 1 ? '나' : speaker === 0 ? '내레이터' : `캐릭터 ${speaker}`),
    content: message.content,
    timestamp: message.timestamp ?? Date.now(),
    bookmarked: message.bookmarked ?? false,
    isImportant: message.isImportant ?? message.bookmarked ?? false,
    characterProfileUrl: message.characterProfileUrl,
    isIntro: message.isIntro ?? false,
    setId: message.setId,
    chapter_id: message.chapterId ?? message.metadata?.chapterId,
    replyTo: message.replyTo
      ? { ...message.replyTo, senderName: message.replyTo.senderName ?? '' }
      : null,
    reactions: message.reactions,
    isChoiceResult: message.isChoiceResult,
    choices: message.choices,
    genre: (message as any).genre };
}

// ✅ ChatEngineCore와 공유: 스토어 → 메시지 포맷 변환
export function fromStoredMessageToCore(
  message: import('../../../store/chatStore').ChatMessage,
  characters: StoryCharacter[] = [],
): import('../types/ChatTypes').ChatMessage {
  // [BUG-2/BUG-3 FIX] 저장된 role 필드를 우선 사용.
  // toStoredMessageFromCore 에서 role 을 함께 저장하므로, DB 재로드 후에도
  // speaker 숫자→role 문자열 재계산 없이 올바른 role 을 그대로 쓸 수 있다.
  // role 필드가 없는 구버전 데이터는 speaker 로 fallback.
  const role: 'user' | 'ai' | 'narrator' = message.role
    ?? (message.speaker === 1 ? 'user' : message.speaker === 0 ? 'narrator' : 'ai');
  const resolvedCharacter = message.speaker >= 2
    ? characters.find(character => Number(character.id) === Number(message.speaker))
    : undefined;
  return {
    id: message.id,
    role,
    content: message.content,
    speakerId: message.speaker,
    characterId: message.speaker >= 2 ? String(message.speaker) : undefined,
    characterName: message.speaker >= 2
      ? (resolvedCharacter?.name ?? message.speakerName)
      : undefined,
    characterProfileUrl: resolvedCharacter
      ? (resolvedCharacter.profileUrl ?? '')
      : message.characterProfileUrl,
    timestamp: message.timestamp ?? Date.now(),
    bookmarked: message.bookmarked ?? message.isImportant ?? false,
    isImportant: message.isImportant ?? message.bookmarked ?? false,
    isIntro: message.isIntro ?? false,
    setId: message.setId,
    chapterId: message.chapter_id,
    replyTo: message.replyTo ?? null,
    reactions: message.reactions,
    isChoiceResult: message.isChoiceResult ?? false,
    choices: message.choices,
    genre: (message as any).genre };
}

// ✅ ChatEngineCore와 공유: 대화 히스토리 구성 (llama.rn 포맷)
export function buildDialogueHistoryFromCore(
  messages: import('../types/ChatTypes').Message[],
  maxMessages = 20,
): string[] {
  if (!messages.length) return [];
  
  const next: string[] = [];
  for (const m of messages) {
    // [BUG FIX #21] isIntro 플래그 또는 setId 접두사 기반으로 인트로 스킵
    if (m.isIntro || m.setId?.startsWith('intro_') || m.setId?.startsWith('chapter_')) continue;

    if (m.role === 'user') {
      const nextLine = `1:${m.content}`;
      if (next[next.length - 1]?.startsWith('1:')) {
        next[next.length - 1] = nextLine;
      } else {
        next.push(nextLine);
      }
    } else if (m.role === 'narrator') {
      if (/^\s*\[L:\s*/.test(m.content)) continue;
      next.push(`0:${m.content}`);
    } else if (m.role === 'ai') {
      const charId = m.characterId ?? '2';
      if (charId === '1') continue;
      if (/^\s*\[L:\s*/.test(m.content)) continue;
      next.push(`${charId}:${m.content}`);
    }
  }

  return next.slice(-maxMessages);
}

// 캐릭터 정보 추가
export function extractCharactersFullFromStory(story: any): StoryCharacter[] {
  return extractCharactersFullUtil(story);
}

// 챕터 시스템 메시지 구성
export function buildChapterPrompt(chapter: any, characters: StoryCharacter[], chapterIdx: number): string {
  if (!chapter) return '';

  const parts = [];

  if (chapter.title?.trim())
    parts.push(`Chapter ${chapterIdx + 1}: ${chapter.title.trim()}`);

  if (chapter.aiGoal?.trim())
    parts.push(`Goal: ${chapter.aiGoal.trim()}`);

  if (chapter.chapterInfo?.trim() && chapter.chapterInfo !== chapter.aiGoal)
    parts.push(`Context: ${chapter.chapterInfo.trim()}`);

  const charGoals = Object.entries(chapter.characterGoals ?? {})
    .map(([charId, goal]: [string, any]) => {
      const char = characters.find(c => c.id === Number(charId));
      return char ? `${char.name}: ${goal}` : `Char${charId}: ${goal}`;
    });

  if (charGoals.length > 0)
    parts.push(`[CHARACTER GOALS]\n${charGoals.join('\n')}`);

  return parts.join('\n');
}

// 챕터 컨텍스트로 메시지 구성
export function buildChapterIntroMessages(story: any, chapterIdx: number, _characters: StoryCharacter[], _appLanguage: string): Message[] {
  // story가 StoryResponse(서버 래퍼)인 경우 story_config.chapters, StoryConfig인 경우 chapters 직접 접근
  const chapter = story?.story_config?.chapters?.[chapterIdx] ?? story?.chapters?.[chapterIdx];
  if (!chapter) return [];
  // Chapter title message.
  const messages: Message[] = [];
  const now = Date.now();

  // 챕터 제목 메시지
  if (chapter.title) {
    messages.push({
      id: `intro_chapter_${chapterIdx}`,
      role: 'narrator',
      content: `=== ${chapter.title} ===`,
      timestamp: now,
      setId: `intro_chapter_${chapterIdx}` });
  }

  // 챕터 정보 메시지
  if (chapter.chapterInfo) {
    messages.push({
      id: `intro_chapter_info_${chapterIdx}`,
      role: 'narrator',
      content: chapter.chapterInfo,
      timestamp: now + 1,
      setId: `intro_chapter_${chapterIdx}` });
  }

  // AI 목표 메시지
  if (chapter.aiGoal) {
    messages.push({
      id: `intro_chapter_goal_${chapterIdx}`,
      role: 'narrator',
      content: `[목표: ${chapter.aiGoal}]`,
      timestamp: now + 2,
      setId: `intro_chapter_${chapterIdx}` });
  }

  return messages;
}

export function parseAIOutputMultiLocal(
  raw: string,
  characters: StoryCharacter[],
): ParseResult {
  // Strip AI artifacts fences, lone bold markers, CHOICE_POINT tag
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*\*{1,2}([^*]+)\*{1,2}\s*$/gm, '$1')
    .replace(/\[CHOICE_POINT\]/gi, '') // [BUG-1 FIX] CHOICE_POINT 태그 제거 후 재처리
    .trim();

  const rawLines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // Collect all emotion deltas regardless of where the AI placed them, then normalize ordering later.
  const lines: ParsedMessage[] = [];
  const metaLineRe = /^(?:speaker(?:id|name)?|characterid|emotion|metadata|meta|role|narration)\s*:/i;

  let pendingLine: ParsedMessage | null = null;
  const flushPending = () => {
    if (pendingLine) {
      lines.push(pendingLine);
      pendingLine = null;
    }
  };

  for (const line of rawLines) {
    if (metaLineRe.test(line)) {
      continue;
    }

    // 감정 상태 업데이트 (@N: e1+val|e2-val 형식 — 실제 AI 출력 포맷)
    if (/^@\d+:\s*/.test(line)) continue;

    const speakerMatch = line.match(/^(\d+):\s*(.+)$/);
    if (speakerMatch) {
      flushPending();

      const rawSpeakerId = Number(speakerMatch[1]);
      const content = speakerMatch[2].trim();

      // [BUG FIX] speakerId=1(플레이어)를 AI 말풍선으로 표시하는 버그
      // AI가 "1: text"를 출력하면 플레이어 발화가 AI 말풍선으로 추가됨.
      // PromptEngine 버전은 speaker===1 필터가 있지만 이 버전에는 누락됨.
      if (rawSpeakerId === 1) continue;
      
      const defaultChar = characters.find(c => c.id >= 2) ?? characters[0];
      const defaultSpeakerId = defaultChar?.id ?? 2;
      const defaultName = defaultChar?.name ?? 'Character';

      const speakerId = rawSpeakerId === 0 || characters.some(c => c.id === rawSpeakerId)
        ? rawSpeakerId
        : defaultSpeakerId;

      if (speakerId === 0) {
        // 내레이터
        lines.push({
          speakerId,
          speakerName: (_defaultT as any).speakerNarrator ?? 'Narrator',
          content,
          role: 'narrator' });
      } else {
        const char = characters.find(c => c.id === speakerId);
        lines.push({
          speakerId,
          speakerName: char?.name ?? defaultName,
          content,
          role: 'ai' });
      }
    } else {
      // [sanitized comment]
      if (pendingLine) {
        pendingLine.content += '\n' + line;
      } else if (lines.length > 0) {
        // [sanitized comment]
        const lastLine = lines[lines.length - 1];
        lastLine.content += '\n' + line;
      } else {
        // 기본 화자
        const defaultChar = characters.find(c => c.id >= 2) ?? characters[0];
        const defaultSpeakerId = defaultChar?.id ?? 2;
        const defaultName = defaultChar?.name ?? 'Character';
        
        pendingLine = {
          speakerId: defaultSpeakerId,
          speakerName: defaultName,
          content: line,
          role: 'ai' };
      }
    }
  }

  flushPending();
  return { lines, emotionDeltas: {} };
}

// 선택지 번역
export function getTranslatedChoice(
  event: any,
  _story: any,
  _chapterIdx: number,
  _langCode: string,
): { prompt: string; options: any[] } {
  const prompt = event.prompt || '';
  const options = event.options || [];

  return {
    prompt,
    options: options.map((opt: any) => ({
      ...opt,
      label: opt.label || '' })) };
}

// 이미 각 함수/변수에 export 키워드가 있으므로 별도 export 블록 불필요
// (중복 export 제거: TS2323/TS2484 방지)
