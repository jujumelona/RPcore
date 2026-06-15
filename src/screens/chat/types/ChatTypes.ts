// src/screens/chat/types/ChatTypes.ts
// Shared chat contracts used across chat hooks, components, and utilities.

import type { EditorEmotions } from '../../../types/StoryContract';
import type { ChatMessage as BaseChatMessage, ChoiceOption } from './ChatMessageTypes';

export type {
  ChoiceOption,
  MessageMetadata,

  MessageValidation,
  MessageValidationError,
  MessageValidationWarning,
  MessageFilter,
  MessageSort,
  MessageSearch,
  MessageSearchResult,
  MessageEvent,
  MessageEventHandler } from './ChatMessageTypes';

export type SegType = 'text' | 'action' | 'thought';
export type DeviceTier = 'low' | 'mid' | 'high' | 'flagship';
export type DrawerTab = 'characters' | 'settings' | 'history';

// BaseChatMessage (= ChatMessageTypes.ts의 ChatMessage) 에 이미 선언된 필드:
//   speakerId, isIntro, bookmarked, reactions, replyTo, actionPrefix,
//   narratorType, chapterId, isChoiceResult, emotionDeltas
// Remove duplicate declarations and keep only chat-specific extension fields here.
export interface Message extends BaseChatMessage {
  /** Message group id used to tie consecutive intro/system messages together. */
  setId?: string;
}

export type ChatMessage = Message;
export type LocalMessage = Message;

export interface FullCharacter {
  id: number;
  name: string;
  imageUris: string[];
  profileUrl: string;
  personality: string;
  personalityExample: string;
  age: string;
  gender: string;
  traits: string;
  initialEmotions: EditorEmotions;
}

export interface ParsedLine {
  speakerId: number;
  speakerName: string;
  content: string;
  role: 'user' | 'ai' | 'narrator';
  narratorType?: 'scene' | 'action';
  actionPrefix?: string;
}

// [BUG FIX] ChatMessageTypes에도 MessageGroup/MessageState가 정의되어 중복 충돌 발생
// Message[] 기반 버전만 여기서 정의하고 ChatMessageTypes의 ChatMessage[] 버전은 별도 유지
export interface MessageGroup {
  id: string;
  type: 'turn' | 'chapter' | 'system';
  messages: Message[];
  timestamp: number;
  metadata?: {
    turnNumber?: number;
    chapterId?: string;
    isComplete?: boolean;
  };
}

export interface MessageState {
  messages: Message[];
  messageGroups: MessageGroup[];
  currentTurn: number;
  totalTurns: number;
  lastMessageId?: string;
  isProcessingMessage: boolean;
  pendingMessages: Message[];
}

export interface ParsedMessage {
  speakerId: number;
  speakerName: string;
  content: string;
  role: 'ai' | 'narrator';
}

export interface ParseResult {
  lines: ParsedMessage[];
  emotionDeltas: Record<number, Partial<EditorEmotions>>;
}

export interface ChoiceEvent {
  id: string;
  prompt: string;
  triggerConditions: unknown[];
  options: ChoiceOption[];
}

export interface ChapterProgress {
  currentChapterIdx: number;
  chapterTurnCount: number;
  minTurnsBeforeChoice: number;
  activeChoiceEvent?: ChoiceEvent;
}

export interface StreamingState {
  isActive: boolean;
  currentMessageId?: string;
  accumulatedText: string;
  startTime?: number;
}

export interface UIState {
  isScrolling: boolean;
  isAtBottom: boolean;
  showScrollToBottom: boolean;
  isDrawerOpen: boolean;
  isSettingsOpen: boolean;
  isEmotionPanelOpen: boolean;
}

export interface EmotionState {
  currentEmotions: Record<number, EditorEmotions>;
  pendingEmotionEffects: Record<number, EditorEmotions>;
  emotionHistory: Array<{ characterId: number; emotions: EditorEmotions; timestamp: number }>;
  isEmotionAnimating: boolean;
}

export interface SessionState {
  sessionId: string;
  storyId: string;
  startTime: number;
  lastActivityTime: number;
  totalMessages: number;
  totalTurns: number;
  isRestored: boolean;
  restorationSource?: 'local' | 'remote';
  isKVLoading: boolean;
  currentChapterIndex: number;
}

export interface ErrorInfo {
  code: string;
  message: string;
  timestamp: number;
  retryable: boolean;
}

export interface ErrorState {
  currentError?: ErrorInfo;
  errorHistory: ErrorInfo[];
  hasUnrecoverableError: boolean;
}

export interface ChatEvent {
  type:
    | 'message_sent'
    | 'message_received'
    | 'streaming_started'
    | 'streaming_completed'
    | 'choice_selected'
    | 'emotion_updated'
    | 'chapter_changed'
    | 'session_restored'
    | 'message_bookmarked'
    | 'message_unbookmarked'
    | 'message_reacted'
    | 'error_occurred';
  payload?: unknown;
  timestamp: number;
}

export type ChatEventHandler = (event: ChatEvent) => void;

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isTyping: boolean;
  hasMore: boolean;
  currentPage: number;
  selectedMessage?: Message;
  showLongPressMenu: boolean;
  showBookmarkList: boolean;
  showDrawer: boolean;
  showProfileModal: boolean;
  profileModalType?: 'character' | 'user';
  profileModalCharId?: number;
  activeChoiceEvent?: ChoiceEvent;
}

export interface ChatActions {
  sendMessage: (
    content: string,
    replyTo?: { id: string; text: string; senderName?: string } | null,
  ) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => void;
  scrollToMessage: (messageId: string) => void;
  loadMoreMessages: () => Promise<void>;
  toggleBookmark: (messageId: string) => void;
  copyMessage: (messageId: string) => void;
  deleteMessage: (messageId: string) => void;
  selectMessage: (message: Message) => void;
  clearSelection: () => void;
  showBookmarkList: () => void;
  hideBookmarkList: () => void;
  showDrawer: () => void;
  hideDrawer: () => void;
  showProfileModal: (type: 'character' | 'user', charId?: number) => void;
  hideProfileModal: () => void;
}

export interface ChatUIProps {
  chatState: ChatState;
  story: unknown;
  characters: FullCharacter[];
  resolvedUserName: string;
  narratorLabel: string;
  onSendMessage: (content: string) => void;
  onLoadMore: () => void;
  onMessagePress: (message: Message) => void;
  onBookmarkToggle: (messageId: string) => void;
  onCopy: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onShowDrawer: () => void;
  onHideDrawer: () => void;
  onShowProfile: (charId?: number) => void;
  onShowUserProfile: () => void;
  // [BUG FIX] onBack 누락 — ChatHeader에 전달 필요한데 ChatUIProps에 없어서 항상 no-op
  onBack?: () => void;
}

export interface ChatSettings {
  maxMessagesInMemory: number;
  maxMessagesForContext: number;
  messageTrimThreshold: number;
  maxDialogueHistory: number;
  minTurnsBeforeChoice: number;
}

