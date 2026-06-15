﻿// src/native/MediaPipeNative.ts
//
//  이 파일은 하위 호환용 re-export 셔머입니다.
//     InferenceEngine을 직접 mediapipe 모드로 래핑하는 얇은 레이어였으나
//     InferenceManager가 이미 두 엔진(mediapipe / litert_lm)을 통합 관리합니다.
//
// 권장 사용법:
//   import { inferenceManager } from '../native/InferenceManager';
//   await inferenceManager.setup({ modelFileName: 'model.task', engineMode: 'mediapipe' });
//
// 기존 코드 호환을 위해 인터페이스는 유지합니다.

import inferenceEngine, { BackendInfo } from '../core/native/InferenceEngine';

export interface MediaPipeInterface {
  initialize(modelPath: string): Promise<BackendInfo>;
  generate(prompt: string, maxTokens?: number): Promise<string>;
  cleanup(): Promise<boolean>;
}

/** @deprecated inferenceManager 사용 권장 */
const MediaPipeNative: MediaPipeInterface = {
  initialize: (modelPath) => inferenceEngine.initialize(modelPath, { engineType: 'mediapipe' }),
  generate:   (prompt, maxTokens) => inferenceEngine.generate(prompt, maxTokens),
  cleanup:    () => inferenceEngine.cleanup() };

export default MediaPipeNative;
