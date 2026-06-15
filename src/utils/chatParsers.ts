/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/chatParsers.ts
// ─────────────────────────────────────────────────────────────
// AI 출력 파싱 + 세그먼트 파싱 유틸리티
// ChatScreen에서 분리 — 순수 함수이므로 테스트·재사용 용이
// ─────────────────────────────────────────────────────────────

import type { FullCharacter, ParsedLine, SegType } from '../screens/chat/types/ChatTypes';
import type { EditorEmotions } from '../types/StoryContract';

type EmotionDelta = Partial<Pick<EditorEmotions, 'e1' | 'e2' | 'e3' | 'e4' | 'e5'>>;

// ──────────────────────────────────────────────────────────────
// 콘텐츠 세그먼트 파서
// #행동묘사# -> type:'action'  (회색 이탤릭, 블록 줄 분리)
// *속마음*   -> type:'thought' (라벤더 이탤릭, 괄호 표시)
// 나머지     -> type:'text'    (흰색 기본)
// ──────────────────────────────────────────────────────────────

export function parseContentSegments(
  text: string,
): Array<{ text: string; type: SegType }> {
  const segments: Array<{ text: string; type: SegType }> = [];
  const regex = /#([^#\n]+)#|\*([^*\n]+)\*/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx)
      segments.push({ text: text.slice(lastIdx, match.index), type: 'text' });
    if (match[1] !== undefined)
      segments.push({ text: match[1], type: 'action' });
    else if (match[2] !== undefined)
      segments.push({ text: match[2], type: 'thought' });
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length)
    segments.push({ text: text.slice(lastIdx), type: 'text' });
  return segments.filter(s => s.text.trim() !== '');
}

// ──────────────────────────────────────────────────────────────
// AI 응답 -> 멀티메시지 파싱
// 나레이터(0:) / 캐릭터(2:) 라인을 각각 별도 ParsedLine으로 분리
// ──────────────────────────────────────────────────────────────

// 유효한 감정 키 집합 — 런타임 타입 가드용 (EditorEmotions: e1~e5)
const META_LINE_RE = /^(?:speaker(?:id|name)?|characterid|emotion|metadata|meta|role|narration)\s*:/i;
const STRUCTURED_LINE_RE = /^(?:@?\d+|speaker(?:id|name)?|characterid|emotion|metadata|meta|role|narration)\s*:/i;
const STORY_LOG_FRAGMENT_RE = /^(?:L|N|Ev)\s*:/i;

function normalizeStructuredMarkdownLine(rawLine: string): string {
  let normalized = rawLine.trim();
  if (!normalized) return normalized;

  const headingStripped = normalized.replace(/^#{1,2}\s+/, '');
  if (STRUCTURED_LINE_RE.test(headingStripped)) {
    normalized = headingStripped;
  }

  for (const marker of ['**', '*'] as const) {
    if (normalized.startsWith(marker) && normalized.endsWith(marker) && normalized.length > marker.length * 2) {
      const inner = normalized.slice(marker.length, -marker.length).trim();
      if (STRUCTURED_LINE_RE.test(inner)) {
        normalized = inner;
      }
    }
  }

  return normalized;
}

function normalizeSpeakerToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[[\](){}<>【】「」]+|[[\](){}<>【】「」]+$/g, '')
    .replace(/\s+/g, '');
}

function buildSpeakerLookup(characters: FullCharacter[]) {
  const byId = new Map<number, FullCharacter>();
  const byName = new Map<string, FullCharacter>();

  characters.forEach(character => {
    const numericId = Number(character.id);
    if (!Number.isFinite(numericId)) return;
    byId.set(numericId, character);

    const candidates = [
      character.name,
      `${numericId}`,
      `char${numericId}`,
      `character${numericId}`,
      `npc${numericId}`,
    ];

    candidates.forEach(candidate => {
      const key = normalizeSpeakerToken(String(candidate ?? ''));
      if (!key) return;
      byName.set(key, character);
    });
  });

  return { byId, byName };
}

function parseSpeakerLine(
  line: string,
  lookup: ReturnType<typeof buildSpeakerLookup>,
): { speakerId: number; speakerName?: string; content: string } | null {
  const wrappedRoleMatch = line.match(/^(Narrator|Character)\s*:\s*(.+)$/i);
  if (wrappedRoleMatch) {
    const wrappedRole = normalizeSpeakerToken(wrappedRoleMatch[1] ?? '');
    const inner = wrappedRoleMatch[2]?.trim() ?? '';
    if (!inner) return null;

    const reparsedInner = parseSpeakerLine(inner, lookup);
    if (reparsedInner) {
      return reparsedInner;
    }

    if (wrappedRole === 'narrator') {
      return { speakerId: 0, speakerName: 'narrator', content: inner };
    }
  }

  const numericPatterns = [
    /^\[(\d+)\]\s*(?::|：|-)?\s*(.+)$/,
    /^\((\d+)\)\s*(?::|：|-)?\s*(.+)$/,
    /^(\d+)\s*(?::|：|\)|\.|-)\s*(.+)$/,
  ];

  for (const pattern of numericPatterns) {
    const match = line.match(pattern);
    if (!match) continue;
    const speakerId = Number(match[1]);
    const content = match[2]?.trim() ?? '';
    if (!Number.isFinite(speakerId) || !content) return null;
    const character = lookup.byId.get(speakerId);
    return {
      speakerId,
      speakerName: character?.name,
      content,
    };
  }

  const namedMatch = line.match(/^([^:：]{1,48})\s*[:：]\s*(.+)$/);
  if (!namedMatch) return null;

  const rawSpeaker = namedMatch[1]?.trim() ?? '';
  const content = namedMatch[2]?.trim() ?? '';
  if (!rawSpeaker || !content) return null;

  const normalizedSpeaker = normalizeSpeakerToken(rawSpeaker);
  if (!normalizedSpeaker) return null;
  if (normalizedSpeaker === '1' || normalizedSpeaker === 'user' || normalizedSpeaker === 'player' || normalizedSpeaker === 'you') {
    return { speakerId: 1, speakerName: rawSpeaker, content };
  }
  if (
    normalizedSpeaker === '0' ||
    normalizedSpeaker === 'narrator' ||
    normalizedSpeaker === 'scene' ||
    normalizedSpeaker === 'system'
  ) {
    return { speakerId: 0, speakerName: rawSpeaker, content };
  }

  const character = lookup.byName.get(normalizedSpeaker);
  if (!character) return null;

  return {
    speakerId: Number(character.id),
    speakerName: character.name,
    content,
  };
}

export function parseAIOutputMulti(
  raw: string,
  characters: FullCharacter[],
): {
  lines: ParsedLine[];
  emotionDeltas: Record<number, EmotionDelta>;
  logLine: string;   // [L:...][N:...][Ev:...] 구조화 로그 라인 (없으면 '')
} {
  // [BUG FIX] characters[0]은 내레이터(id=0)일 수 있음 -> id>=2인 첫 캐릭터 사용
  const defaultChar = characters.find(c => c.id >= 2) ?? characters[0];
  const defaultSpeakerId = defaultChar?.id ?? 2;
  const defaultName = defaultChar?.name ?? 'Character';

  if (!raw?.trim()) {
    return {
      lines: [],
      emotionDeltas: {},
      logLine: '' };
  }

  const lines: ParsedLine[] = [];
  const emotionDeltas: Record<number, EmotionDelta> = {};
  const speakerLookup = buildSpeakerLookup(characters);

  // [BUG FIX] _cleaned 계산 후 미사용(_cleaned;) + markdownSafeCleaned에 ## 제거 누락
  // 기존: _cleaned에는 ^#{1,2}\s* 제거 로직이 있었으나 실제 파싱엔 markdownSafeCleaned 사용
  //       → "## 0: narrator text" 같은 AI 출력에서 ## 가 제거되지 않아 화자 인식 실패
  // 수정: 단일 markdownSafeCleaned로 통일하고 ## 제거 로직 포함
  const markdownSafeCleaned = raw
    .replace(/^#{1,2}\s*/gm, '')           // ## 나레이터:: 등 ## 제거 (기존 _cleaned 로직 통합)
    .replace(/^[""]|[""]$/gm, '')
    .replace(/\[CHOICE_POINT\]/gi, '')
    .trim();

  const rawLines = markdownSafeCleaned.split('\n').map(l => l.trim()).filter(Boolean);

  let pendingLine: ParsedLine | null = null;
  let pendingActionPrefix: string | null = null;

  const flushPending = () => {
    if (pendingLine) { lines.push(pendingLine); pendingLine = null; }
  };

  // 나레이터 라인이 순수 #행동# 패턴만으로 이루어졌는지 판별
  const isPureAction = (content: string) =>
    content.replace(/#[^#\n]+#/g, '').trim() === '';

  for (const rawLine of rawLines) {
    const line = normalizeStructuredMarkdownLine(rawLine);
    if (!line) continue;

    if (META_LINE_RE.test(line)) {
      continue;
    }

    if (line.startsWith('@')) {
      continue;
    }

    if (/^\[(?:CORE KNOWLEDGE|CORE MEMO|INTRO|CHARACTERS|USER(?:\s*[—-]\s*CHAR\s*\d+)?|WORLD|RULES?|SYSTEM)\]\s*$/i.test(line)) {
      continue;
    }

    if (STORY_LOG_FRAGMENT_RE.test(line)) {
      continue;
    }

    // [Story Log] 라인 — 대화가 아닌 구조화 로그, 파싱 루프에서 건너뜀
    // ex: [L: Classroom] [2: Running] [Ev: Confrontation begins]
    if (/^\[L:\s*[^\]]+\]/.test(line)) {
      continue;
    }

    const parsedSpeaker = parseSpeakerLine(line, speakerLookup);
    if (parsedSpeaker) {
      flushPending();
      const rawSid = Number(parsedSpeaker.speakerId);
      const sid = rawSid === 1
        ? defaultSpeakerId
        : (rawSid === 0 || speakerLookup.byId.has(rawSid) ? rawSid : defaultSpeakerId);
      const content = parsedSpeaker.content.trim();
      if (!content) continue;
      const char = speakerLookup.byId.get(sid);
      const sName = sid === 0
        ? 'narrator'
        : (rawSid === 1 ? (char?.name ?? defaultName) : (parsedSpeaker.speakerName ?? char?.name ?? defaultName));
      const role: ParsedLine['role'] = sid === 0 ? 'narrator' : 'ai';

      if (role === 'narrator') {
        if (isPureAction(content)) {
          pendingActionPrefix = content;
          continue;
        }
        const narratorType: 'scene' | 'action' = content.includes('#') ? 'action' : 'scene';
        pendingLine = { speakerId: sid, speakerName: sName, content, role, narratorType };
        continue;
      }

      pendingLine = {
        speakerId: sid,
        speakerName: sName,
        content,
        role,
        actionPrefix: pendingActionPrefix ?? undefined };
      pendingActionPrefix = null;
      continue;
    }

    // Continuation line — ONLY if line has NO "Name:" pattern that would be an unknown speaker
    // [BUG FIX #6] "Unknown: text" 형태 줄이 이전 캐릭터 대사에 continuation으로 붙는 버그 수정
    // Name: 패턴이 있지만 parseSpeakerLine에서 인식 못한 경우 → 나레이터로 처리
    const unknownSpeakerPattern = /^[^:：]{1,48}\s*[:：]\s*.+$/;
    const isUnknownSpeakerLine = unknownSpeakerPattern.test(line) && !META_LINE_RE.test(line);

    if (pendingLine && line.length > 1 && !/^[@\d]/.test(line) && !isUnknownSpeakerLine) {
      pendingLine = { ...pendingLine, content: pendingLine.content + '\n' + line };
      continue;
    }

    // Unformatted fallback — unknown "Name: text" → narrator; plain text → default char
    flushPending();
    if (line.length > 2 && !/^[@\d]/.test(line)) {
      if (isUnknownSpeakerLine) {
        // [BUG FIX #3] 미인식 "Name: text" → 나레이터로 귀속 (방어적 렌더링)
        const colonIdx = line.search(/[:：]/);
        const content = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : line;
        if (content) {
          pendingLine = { speakerId: 0, speakerName: 'narrator', content, role: 'narrator', narratorType: 'scene' };
        }
      } else {
        // [BUG FIX] pendingActionPrefix가 있어도 fallback 화자에는 붙이지 않음
        lines.push({
          speakerId: defaultSpeakerId, speakerName: defaultName, content: line, role: 'ai' });
        // pendingActionPrefix는 보존 — 다음 정상 화자 줄에서 처리
      }
    }
  }

  flushPending();

  if (lines.length === 0) {
    const compactRaw = raw.trim();
    const looksLikePromptOrLogOnly = /^(?:\[(?:L:|CORE KNOWLEDGE|CORE MEMO|INTRO|CHARACTERS|USER(?:\s*[—-]\s*CHAR\s*\d+)?|WORLD|RULES?|SYSTEM|RETRY_FIX|응답\s*지시|답변\s*지시|규칙\s*끝)\]|target_language=|reasons=)/i.test(compactRaw);
    if (!looksLikePromptOrLogOnly) {
      lines.push({
        speakerId: defaultSpeakerId,
        speakerName: defaultName,
        content: compactRaw.slice(0, 300),
        role: 'ai' });
    }
  }

  // [Story Log] 마지막 줄에서 [L:...][N:...][Ev:...] 추출
  const LOG_LINE_RE = /^\[L:\s*[^\]]+\](\s*\[\d+:[^\]]+\])*(\s*\[Ev:[^\]]+\])?\s*$/;
  let logLine = '';
  const allRawLines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = allRawLines.length - 1; i >= 0; i--) {
    if (LOG_LINE_RE.test(allRawLines[i])) {
      logLine = allRawLines[i];
      break;
    }
  }

  return { lines, emotionDeltas, logLine };
}

// ──────────────────────────────────────────────────────────────
// 견고한 태그 파서 (EnhancedMessageParser 통합)
// #행동# / *속마음* 태그가 닫히지 않아도 안전하게 복구
// ──────────────────────────────────────────────────────────────

export interface ContentPart {
  type: 'text' | 'action' | 'thought' | 'heading' | 'bold' | 'code';
  text: string;
  lang?: string;
}

/**
 * parseContentSegments의 견고한 버전
 * - 열린 태그가 닫히지 않아도 crash 없이 텍스트로 복구
 * - 빈 파트 자동 제거
 */
export function parseContentSegmentsRobust(
  rawText: string,
  _speakerId = 2,
): ContentPart[] {
  // 사전 정리: 앞뒤 따옴표 제거 (## 은 heading으로 변환)
  const text = rawText
    .replace(/^[\u201c\u201d]|[\u201c\u201d]$/gm, '')
    .trim();
  const parts: ContentPart[] = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // ``` 코드 블록
    if (ch === '`' && i + 2 < text.length && text[i + 1] === '`' && text[i + 2] === '`') {
      if (current.trim()) parts.push({ type: 'text', text: current });
      current = '';
      i += 3; // '```' 스킵
      let lang = '';
      while (i < text.length && text[i] !== '\n') {
        lang += text[i];
        i++;
      }
      if (text[i] === '\n') i++;

      let code = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === '`' && i + 2 < text.length && text[i + 1] === '`' && text[i + 2] === '`') {
          closed = true;
          i += 3;
          break;
        }
        code += text[i];
        i++;
      }

      if (code.trim() || lang.trim()) {
        parts.push({ type: 'code', text: code, lang: lang.trim() });
      } else if (!closed) {
        // empty and not closed
        parts.push({ type: 'text', text: '```' + lang + '\n' + code });
      }
      continue;
    }

    // ## 헤딩 — 줄 시작에서만 (위아래 줄바꿈 + 강조)
    if (ch === '#' && (i === 0 || text[i - 1] === '\n')) {
      while (i < text.length && text[i] === '#') i++;
      while (i < text.length && text[i] === ' ') i++;
      let headingText = '';
      while (i < text.length && text[i] !== '\n') headingText += text[i++];
      headingText = headingText.replace(/\*\*/g, '').trim();
      // [BUG 15 FIX] 나레이터 일반 텍스트는 'action' 아닌 'text' 타입 — #...# 마커만 'action'으로 처리
      if (current.trim()) parts.push({ type: 'text', text: current });
      current = '';
      if (headingText) parts.push({ type: 'heading', text: headingText });
      continue;
    }

    // **볼드**
    if (ch === '*' && i + 1 < text.length && text[i + 1] === '*') {
      // [BUG 15 FIX] 나레이터 일반 텍스트는 'action' 아닌 'text' 타입
      if (current.trim()) parts.push({ type: 'text', text: current });
      current = '';
      i += 2;
      let bold = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === '*' && i + 1 < text.length && text[i + 1] === '*') { closed = true; i += 2; break; }
        bold += text[i++];
      }
      if (bold.trim()) parts.push({ type: closed ? 'bold' : 'text', text: bold });
      continue;
    }

    // #행동#
    if (ch === '#') {
      // [BUG 15 FIX] 나레이터 일반 텍스트는 'action' 아닌 'text' 타입
      if (current.trim()) parts.push({ type: 'text', text: current });
      current = '';
      i++;
      let action = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === '#') { closed = true; i++; break; }
        action += text[i++];
      }
      if (!closed) {
        // 닫힌 태그 없음 -> 그냥 텍스트로 폴백
        if (__DEV__) console.warn('[chatParsers] unclosed #action tag, fallback to text');
        if (action.trim()) {
          parts.push({ type: 'text', text: action });
        }
      } else if (action.trim()) {
        parts.push({ type: 'action', text: action.trim() });
      }
      continue;
    }

    // *속마음*
    if (ch === '*') {
      if (current.trim()) parts.push({ type: 'text', text: current });
      current = '';
      i++;
      let thought = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === '*') { closed = true; i++; break; }
        thought += text[i++];
      }
      if (!closed) {
        if (__DEV__) console.warn('[chatParsers] unclosed *thought tag, fallback to text');
        parts.push({ type: 'text', text: '*' + thought });
      } else if (thought.trim()) {
        parts.push({ type: 'thought', text: thought.trim() });
      }
      continue;
    }

    current += ch;
    i++;
  }
  // [BUG 15 FIX] 최종 누적 텍스트는 항상 'text' 타입 (나레이터 포함)
  if (current.trim()) parts.push({ type: 'text', text: current });
  return parts.filter(p => p.text.trim() !== '');
}

// EnhancedMessageParser와의 호환 re-export
// (기존 import { EnhancedMessageParser } from utils/EnhancedMessageParser 를
//  이 파일로 통일 가능)
export { parseContentSegmentsRobust as parseContentRobust };

// ══════════════════════════════════════════════════════════════
// CHOICE_POINT 태그 파싱
//
// AI 응답 끝에 [CHOICE_POINT] 태그가 붙으면:
//   · 태그를 제거한 깨끗한 텍스트 반환
//   · hasChoicePoint = true 반환
//
// ══════════════════════════════════════════════════════════════

const CHOICE_POINT_TAG = '[CHOICE_POINT]';

export function extractChoicePoint(text: string): {
  clean: string;
  hasChoicePoint: boolean;
} {
  // 태그 변형 허용: 대소문자, 공백, 줄바꿈 포함
  const normalized = text.trimEnd();
  const upperNorm  = normalized.toUpperCase();
  const tagUpper   = CHOICE_POINT_TAG.toUpperCase();

  const idx = upperNorm.lastIndexOf(tagUpper);
  if (idx === -1) return { clean: text, hasChoicePoint: false };

  // 태그 앞 텍스트만 유지 (태그 이후 잔여 텍스트는 버림)
  const clean = normalized.slice(0, idx).trimEnd();
  return { clean, hasChoicePoint: true };
}
