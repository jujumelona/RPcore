﻿// src/utils/MathUtils.ts
// ════════════════════════════════════════════════════════════════════
// MathUtils - 재export 중심 파일 (모듈화됨)
// 원래 기능들은 utils/math/ 디렉토리로 분리됨
// ════════════════════════════════════════════════════════════════════

export {
  // vectorUtils
  cosineSim,
  toFloat32,
  mmrSelect,
  // emotionAnalysis
  emotionSoftmax,
  dominantEmotion,
  emotionEntropy,
  emotionAnalysis,
  // contextBudget
  allocateContextBudget,
  type ContextBudget,
  // kvCache
  estimateKVCacheMB,
  maxSafeNCtx,
  type KVCacheParams,
  // adaptiveTrigger
  EMATracker,
  adaptiveSummaryTrigger,
  // temporalDecay
  temporalDecayScore,
  rankByDecayedImportance,
  // rrf
  rrfFuse,
  optimalThreads,
  // BM25
  BM25Index } from './math';

export type { EmotionDistribution } from './math/emotionAnalysis';
