// src/core/openSourceModules.ts
// ═══════════════════════════════════════════════════════════════════
// 오픈소스 이식 모듈 통합 인덱스
// — 기존 화면에서 단일 import로 모든 모듈 접근
//
// 사용법:
//   import { messageOutbox, downloadQueue, ... } from '../core/openSourceModules';
// ═══════════════════════════════════════════════════════════════════

// ── Chat ──────────────────────────────────────────────────────────
export { messageOutbox } from './chat/MessageOutbox';
export type { OutboxMessage, OutboxStatus } from './chat/MessageOutbox';
export { ChatPaginationManager } from './chat/ChatPaginationManager';

// ── AI ────────────────────────────────────────────────────────────
export { PromptChain, createEmotionAwareChain, createNarrativeChain } from './ai/PromptChain';
export type { ChainStep, ChainContext, ChainResult } from './ai/PromptChain';

// ── Memory ────────────────────────────────────────────────────────
export { ContextCompressor } from './memory/ContextCompressor';

// ── Components ────────────────────────────────────────────────────
export {
  DateSeparator,
  useMessageGroups,
  groupMessages,
  formatMessageTime } from '../components/chat/MessageDateSeparator';
export type { MessageGroup, GroupableMessage } from '../components/chat/MessageDateSeparator';

export {
  StreamingMarkdownRenderer,
  useStreamingText } from '../components/chat/StreamingMarkdownRenderer';

export { OptimizedFeedList } from '../components/feed/OptimizedFeedList';
export { PagedTextView } from '../components/reader/PagedTextView';

// ── Store ─────────────────────────────────────────────────────────
export { useAgentPresetStore } from '../store/agentPresetStore';

// ── Utils ─────────────────────────────────────────────────────────
export { useDownloadQueueStore } from '../utils/DownloadQueue';
export { useNovelUpdateStore } from '../utils/NovelUpdateTracker';
export { compressedCache, CompressedCache } from '../utils/CompressedCache';

// ── Hooks ─────────────────────────────────────────────────────────
export {
  useOptimisticAction,
  useOptimisticToggle,
  useOptimisticBookmark,
  useOptimisticFollow } from '../hooks/useOptimisticAction';

// ── Navigation ────────────────────────────────────────────────────
export {
  linkingConfig,
  createDeepLink,
  parseDeepLink,
  ROUTE_MAP } from '../navigation/DeepLinkConfig';
export type { DeepLinkParamList } from '../navigation/DeepLinkConfig';

// ── Native (v2 — Nitro C++ 마크다운 파서) ────────────────────────
export {
  nitroParseMarkdown,
  nitroParseMarkdownAsync,
  nitroParseIncremental,
  isNitroMarkdownAvailable } from '../native/NitroMarkdownParser';
export type { ParsedSegment, ParseResult } from '../native/NitroMarkdownParser';

// ── Skia Effects (v2) ─────────────────────────────────────────────
export { SkiaParticleSystem, SkiaChapterBurst } from '../components/SkiaParticleSystem';
export { SkiaPageTurn } from '../components/reader/SkiaPageTurn';

// ── Sync (v2 — Local-First 동기화) ────────────────────────────────
export {
  configureLegendSync,
  syncManager,
  OfflineQueue,
  SyncManager } from './sync/SyncAdapter';
export type { QueuedChange, SyncConfig } from './sync/SyncAdapter';
