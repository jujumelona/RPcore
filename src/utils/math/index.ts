/**
 * src/utils/math/index.ts
 * Math 유틸리티 모듈 export
 */

export { cosineSim, toFloat32, mmrSelect } from './vectorUtils';
export { emotionSoftmax, dominantEmotion, emotionEntropy, emotionAnalysis } from './emotionAnalysis';
export { allocateContextBudget, type ContextBudget } from './contextBudget';
export { estimateKVCacheMB, maxSafeNCtx, type KVCacheParams } from './kvCache';
export { EMATracker, adaptiveSummaryTrigger } from './adaptiveTrigger';
export { temporalDecayScore, rankByDecayedImportance } from './temporalDecay';
export { rrfFuse, optimalThreads } from './rrf';

// BM25Index re-export (기존 호환성 유지)
export { BM25Index } from '../../BM25Index/BM25Index';
