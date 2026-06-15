// src/core/llama/core/LlamaEngineCore.ts
// Compatibility shim for the renamed engine module.
// The authoritative implementation and API live in ../LlamaEngine.ts.

export { default } from '../LlamaEngine';
export * from '../LlamaEngine';
export { llamaEngine as llamaEngineCore } from '../LlamaEngine';
export type LlamaEngineCore = typeof import('../LlamaEngine').default;
