// src/screens/chat/index.ts
// Barrel exports for modularized chat screen.

export { ChatScreenRefactored, ChatScreenRefactored as ChatScreen } from './ChatScreenRefactored';

export { ChatHeader } from './components/ChatHeader';
export { ChatMessage } from './components/ChatMessage';
export { ChatDrawer, CharacterPanel, SettingsPanel, HistoryPanel } from './components/ChatDrawer';
export { ChoicePanel } from './components/ChoicePanel';
export { BookmarkList } from './components/BookmarkList';

// ✅ ChatEngineCore만 사용 (ChatCore는 Dead Code - 제거됨)
export { useChatEngineCore } from './core/ChatEngineCore';

export * from './types/ChatTypes';
export type {
  MessageExport,
  MessageImport,
  MessageImportResult,
  MessageStatistics,
  CharacterMessageStats,
  MessageCache,
  MessageCacheConfig,
  MessageRole,
  MessageType,
  ExportFormat,
  ImportFormat,
  MergeStrategy } from './types/ChatMessageTypes';

export {
  MESSAGE_ROLES,
  MESSAGE_TYPES,
  MESSAGE_EXPORT_FORMATS,
  MESSAGE_IMPORT_FORMATS,
  MERGE_STRATEGIES } from './types/ChatMessageTypes';
export * from './utils/ChatMessageUtils';
export * from './utils/ChatUtils';
