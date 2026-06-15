﻿// src/core/llama/EngineTypes.ts
// ──────────────────────────────────────────────────────────────────────
// Shared engine type definitions — imported by both LlamaEngine.ts and
// EngineEventBus.ts to break the circular dependency between them.
//
// Previously EngineState was defined in LlamaEngine.ts and
// EngineEventBus.ts had to import it from there, while LlamaEngine.ts
// simultaneously imported engineBus from EngineEventBus.ts.
// Metro's module-evaluation order would sometimes resolve that cycle
// with one side seeing an empty object — causing
// "Property 'Color' doesn't exist" crashes at startup.
// ──────────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of the on-device inference engine.
 *   idle       — not loaded
 *   loading    — model weights being loaded into memory
 *   warming    — KV-cache prefill / warm-up pass running
 *   ready      — fully initialised, accepts generation requests
 *   generating — active token generation in progress
 *   error      — unrecoverable error; requires reload
 */
export type EngineState =
  | 'idle'
  | 'loading'
  | 'warming'
  | 'ready'
  | 'generating'
  | 'error';
