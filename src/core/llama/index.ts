// src/core/llama/index.ts
// Central barrel exports for modular llama engine structure.

// Core runtime singletons and managers
export { default as llamaEngine } from './LlamaEngine';
export { default as deviceProfiler } from './DeviceProfiler';
export { default as embeddingEngine, EmbeddingEngine, type EmbeddingState } from './EmbeddingEngine';
export { default as kvCacheManager } from './KVCacheManager';
export { kvStateManager } from './KVStateManager';
export { kvOffsetTracker } from './KVOffsetTracker';
export { prefixKVManager } from './PrefixKVManager';
export { sessionManager } from './SessionManager';
export { engineBus } from './EngineEventBus';
export { modelDownloader } from './ModelDownloader';
export { WarmupManager } from './WarmupManager';
export { parseToolCalls, type RPTool, type RPToolCall } from './ToolCallHandler';
export { DEFAULT_DRY_PARAMS } from './constants/LlamaEngineConstants';

// Legacy llama engine types still used across hooks/screens
export type {
  ChatMessage,
  GenerateOptions,
  CompletionMetadata,
  BackendInfo } from './LlamaEngine';
export type { EngineState } from './EngineTypes';
export {
  type DeviceProfile,
  type LlamaTuningParams,
  type SoCVendor,
  type BackendType } from './DeviceProfiler';

// Modularized constants/types/helpers
export * from './constants/LlamaEngineConstants';
export * from './types/LlamaEngineTypes';
export * from './utils/LlamaEngineUtils';
export * from './utils/SamplingParamsBuilder';
export * from './kv-spec-constants';

