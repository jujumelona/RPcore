// [BUG FIX] 중복 타입 경고 방지:
// screens/chat/types/ChatTypes.ts가 ChatMessageTypes에서 ChoiceOption 등을 import하고
// 동시에 MessageGroup/MessageState를 재정의해 타입 충돌이 발생할 수 있음.
// 이 파일은 screens/chat/types/ChatTypes를 단일 진입점으로 재export.
// ChatMessageTypes의 확장 타입들만 추가 export.
export * from '../screens/chat/types/ChatTypes';

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
  MergeStrategy } from '../screens/chat/types/ChatMessageTypes';

export {
  MESSAGE_ROLES,
  MESSAGE_TYPES,
  MESSAGE_EXPORT_FORMATS,
  MESSAGE_IMPORT_FORMATS,
  MERGE_STRATEGIES } from '../screens/chat/types/ChatMessageTypes';
