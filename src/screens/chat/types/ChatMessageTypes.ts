/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/chat/types/ChatMessageTypes.ts
 *
 * [변경] replyTo — 스와이프 답장 인용 필드 추가
 * [변경] reactions — 더블탭 리액션 목록
 * [변경] isChoiceResult, emotionDeltas — EmotionFlash 연동
 * [변경] chapterId, narratorType, actionPrefix, speakerId — 구 ChatScreen 호환
 */

import type { EditorEmotions } from '../../../types/StoryContract';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'narrator' | 'image_card';
  content: string;
  characterId?: string;
  characterName?: string;
  characterProfileUrl?: string;
  timestamp?: number;
  bookmarked?: boolean;
  isImportant?: boolean;
  isStreaming?: boolean;
  choices?: ChoiceOption[];
  metadata?: MessageMetadata;

  // ── 신규 필드 ────────────────────────────────────────────────────────────
  /** 스와이프 답장: 인용 대상 메시지 */
  replyTo?: { id: string; text: string; senderName?: string; role?: string } | null;
  /** 더블탭 이모지 리액션 */
  reactions?: string[];
  /** 선택지 결과 메시지 여부 */
  isChoiceResult?: boolean;
  /** 감정 변화 델타 Record<charId, Partial<EditorEmotions>> */
  emotionDeltas?: Record<string, Partial<EditorEmotions>>;
  chapterId?: string;
  narratorType?: 'scene' | 'action';
  actionPrefix?: string;
  speakerId?: number;
  isIntro?: boolean;
  genre?: string;
  /** image_card 역할일 때 표시할 이미지 URL */
  imageCardUrl?: string;
}

export interface MessageMetadata {
  turnNumber?: number;
  chapterId?: string;
  generationTime?: number;
  tokenCount?: number;
  modelUsed?: string;
  temperature?: number;
}

// [BUG FIX] ChoiceOption을 StoryContract의 정의와 일치하도록 수정
export interface ChoiceOption {
  id: string;
  label: string;
  targetChapterId?: string;
  isEnding?: boolean;
  isSelected?: boolean;
}

export interface MessageGroup {
  id: string;
  type: 'turn' | 'chapter' | 'system';
  messages: ChatMessage[];
  timestamp?: number;
  metadata?: { turnNumber?: number; chapterId?: string; isComplete?: boolean };
}

// [BUG FIX] ChatTypes.ts에도 MessageState가 있어 import 경로 혼동 위험
// ChatEngineCore는 ChatTypes.MessageState(Message[]) 사용 — 이 타입은 내부용
/** @internal ChatMessageTypes 전용 MessageState — ChatTypes.MessageState 사용 권장 */
export interface ChatMessageTypesMessageState {
  messages: ChatMessage[];
  messageGroups: MessageGroup[];
  currentTurn: number;
  totalTurns: number;
  lastMessageId?: string;
  isProcessingMessage: boolean;
  pendingMessages: ChatMessage[];
}
/** @deprecated ChatTypes.MessageState 사용 권장 */
export type MessageState = ChatMessageTypesMessageState;

export interface MessageValidation {
  isValid: boolean;
  errors: MessageValidationError[];
  warnings: MessageValidationWarning[];
}
export interface MessageValidationError { field: string; message: string; code: string; }
export interface MessageValidationWarning { field: string; message: string; code: string; }

export interface MessageFilter {
  role?: ChatMessage['role'][];
  characterId?: string[];
  hasChoices?: boolean;
  timeRange?: { start: number; end: number };
  chapterId?: string[];
  turnRange?: { start: number; end: number };
}
export interface MessageSort { field: 'timestamp' | 'turnNumber' | 'characterId'; order: 'asc' | 'desc'; }
export interface MessageSearch { query: string; filter?: MessageFilter; sort?: MessageSort; limit?: number; offset?: number; }
export interface MessageSearchResult { messages: ChatMessage[]; totalCount: number; hasMore: boolean; query: string; }

export interface MessageExport {
  format: 'json' | 'txt' | 'csv' | 'html';
  includeMetadata: boolean;
  includeEmotions: boolean;
  includeChoices: boolean;
  timeRange?: { start: number; end: number };
}
export interface MessageImport { format: 'json' | 'csv'; data: any; mergeStrategy: 'replace' | 'append' | 'merge'; validateBeforeImport: boolean; }
export interface MessageImportResult { success: boolean; importedCount: number; skippedCount: number; errors: string[]; warnings: string[]; }

export interface MessageStatistics {
  totalMessages: number; userMessages: number; aiMessages: number;
  narratorMessages: number; bookmarkedMessages: number; messagesWithChoices: number;
  averageMessageLength: number; totalCharacters: number; totalTurns: number;
  averageTurnsPerChapter: number; emotionChanges: number; sessionDuration: number; messagesPerHour: number;
}
export interface CharacterMessageStats { characterId: string; characterName: string; messageCount: number; totalCharacters: number; averageMessageLength: number; emotionChanges: number; lastMessageTime: number; }

export interface MessageEvent {
  type: 'message_added' | 'message_updated' | 'message_deleted' |
        'message_bookmarked' | 'message_unbookmarked' | 'messages_cleared';
  messageId?: string; messageIds?: string[]; message?: ChatMessage;
  messages?: ChatMessage[]; timestamp?: number; metadata?: any;
}
export interface MessageEventHandler { (event: MessageEvent): void; }

export interface MessageCache { key: string; messages: ChatMessage[]; timestamp?: number; size: number; version: string; }
export interface MessageCacheConfig { maxSize: number; maxAge: number; compressionEnabled: boolean; encryptionEnabled: boolean; }

export const MESSAGE_ROLES = { USER: 'user', AI: 'ai', NARRATOR: 'narrator' } as const;
export const MESSAGE_TYPES = { TEXT: 'text', CHOICE: 'choice', EMOTION: 'emotion', SYSTEM: 'system' } as const;
export const MESSAGE_EXPORT_FORMATS = { JSON: 'json', TXT: 'txt', CSV: 'csv', HTML: 'html' } as const;
export const MESSAGE_IMPORT_FORMATS = { JSON: 'json', CSV: 'csv' } as const;
export const MERGE_STRATEGIES = { REPLACE: 'replace', APPEND: 'append', MERGE: 'merge' } as const;

export type MessageRole = typeof MESSAGE_ROLES[keyof typeof MESSAGE_ROLES];
export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];
export type ExportFormat = typeof MESSAGE_EXPORT_FORMATS[keyof typeof MESSAGE_EXPORT_FORMATS];
export type ImportFormat = typeof MESSAGE_IMPORT_FORMATS[keyof typeof MESSAGE_IMPORT_FORMATS];
export type MergeStrategy = typeof MERGE_STRATEGIES[keyof typeof MERGE_STRATEGIES];
