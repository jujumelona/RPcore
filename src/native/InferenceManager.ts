﻿// src/native/InferenceManager.ts
// 추론 통합 매니저
//
// ═══════════════════════════════════════════════════════════════════════════
//  [BUG FIX] 다운로드 완전 재구현
//
//  기존 downloadWithProgress():
//    - fetch() + ReadableStream으로 청크를 메모리(Uint8Array[])에 누적
//    - LLM 파일(1~8GB) 전체를 RAM에 올려 앱 크래시 유발
//    - TODO 주석 상태로 실제 파일 저장 코드 없음 → 다운로드 미작동
//
//  수정:
//    - fileSystemCompat(RNFS 호환 shim) downloadFile() 사용 (내부: expo-file-system)
//    - 스트리밍 방식으로 디스크에 직접 저장 (메모리 O(1))
//    - 진행률 콜백 내장 지원
//
//  기존 fileExists():
//    - fetch('file://...') 방식은 Android에서 CORS/권한 문제로 불안정
//    - RNFS.exists() 로 교체 (신뢰성 높음)
// ═══════════════════════════════════════════════════════════════════════════

import RNFS from '../utils/fileSystemCompat';
import { logger } from '../utils/logger';

import inferenceEngine, {
  BackendInfo,
  InitOptions } from '../core/native/InferenceEngine';

export type EngineMode = 'mediapipe' | 'litert_lm';

export interface ModelConfig {
  modelUrl: string;
  modelFileName: string;
  engineMode?: EngineMode;
  maxTokens?: number;
  temperature?: number;
}

export interface InferenceStatus {
  isReady: boolean;
  engine: string;
  backend: string;
  modelPath: string | null;
  downloadProgress: number;
  error: string | null;
}

type StatusListener = (status: InferenceStatus) => void;

export class InferenceManager {
  private status: InferenceStatus = {
    isReady: false,
    engine: 'NONE',
    backend: 'NONE',
    modelPath: null,
    downloadProgress: 0,
    error: null };

  private listeners = new Set<StatusListener>();
  private config: ModelConfig | null = null;

  // ── 공개 API ──────────────────────────────────────────────────────────────

  async setup(config: ModelConfig): Promise<void> {
    this.config = config;
    const engineMode = config.engineMode ?? 'mediapipe';
    this.updateStatus({ error: null, isReady: false });

    try {
      const modelPath = await this.ensureModel(config);
      this.updateStatus({ modelPath, downloadProgress: 100 });

      logger.log('[InferenceManager] 엔진 초기화:', engineMode);

      const info: BackendInfo = await inferenceEngine.initialize(
        modelPath,
        { engineType: engineMode } as InitOptions,
      );

      logger.log(`[InferenceManager] ✅ 엔진=${info.engine}, 백엔드=${info.backend}`);

      this.updateStatus({
        isReady: true,
        engine: info.engine,
        backend: info.backend });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[InferenceManager] setup 오류:', msg);
      this.updateStatus({ error: msg, isReady: false });
      throw err;
    }
  }

  async generate(prompt: string, maxTokens?: number): Promise<string> {
    this.assertReady();
    return inferenceEngine.generate(
      prompt,
      maxTokens ?? this.config?.maxTokens ?? 512,
    );
  }

  async generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    maxTokens?: number,
  ): Promise<void> {
    this.assertReady();
    return inferenceEngine.generateStream(
      prompt,
      maxTokens ?? this.config?.maxTokens ?? 512,
      onChunk,
      onDone,
    );
  }

  getStatus(): InferenceStatus {
    return { ...this.status };
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async cleanup(): Promise<void> {
    await inferenceEngine.cleanup();
    this.updateStatus({ isReady: false, engine: 'NONE', backend: 'NONE' });
  }

  // ── 내부 로직 ─────────────────────────────────────────────────────────────

  private assertReady() {
    if (!this.status.isReady) {
      throw new Error('[InferenceManager] 초기화되지 않음. setup()을 먼저 호출하세요.');
    }
  }

  private async ensureModel(config: ModelConfig): Promise<string> {
    // RNFS.DocumentDirectoryPath: Android에서 /data/user/0/<pkg>/files
    const modelPath = `${RNFS.DocumentDirectoryPath}/${config.modelFileName}`;

    const exists = await this.fileExists(modelPath);
    if (exists) {
      logger.log('[InferenceManager] 모델 이미 존재:', modelPath);
      return modelPath;
    }

    logger.log('[InferenceManager] 다운로드 시작:', config.modelUrl);
    await this.downloadWithProgress(config.modelUrl, modelPath);
    return modelPath;
  }

  // [BUG FIX] RNFS.exists() 로 교체
  // 기존: fetch('file://...') → Android에서 CORS/보안 정책으로 불안정
  private async fileExists(path: string): Promise<boolean> {
    try {
      return await RNFS.exists(path);
    } catch {
      return false;
    }
  }

  // [BUG FIX] RNFS.downloadFile() 로 완전 재구현
  // 기존:
  //   - fetch() + ReadableStream 청크를 Uint8Array[]에 전부 누적 (메모리 O(n))
  //   - LLM 파일(1~8GB)은 RAM 부족으로 앱 크래시
  //   - 파일 저장 코드 없음 (TODO 상태) → 다운로드 미작동
  //
  // 수정:
  //   - RNFS.downloadFile()이 내부적으로 디스크에 스트리밍 저장 (메모리 O(1))
  //   - progressCb throttling: 1% 단위만 업데이트 (100번 이하)
  //   - 마지막 진행률을 추적하여 불필요한 상태 업데이트 최소화
  private async downloadWithProgress(url: string, destPath: string): Promise<void> {
    let lastReportedPct = -1;
    this.updateStatus({ downloadProgress: 0 });

    const { promise } = RNFS.downloadFile({
      fromUrl: url,
      toFile: destPath,
      progress: (res) => {
        // [BUG FIX] contentLength=0 (서버가 Content-Length 헤더 미제공) 시
        // 0으로 나누기 → NaN/Infinity 방지. 진행률을 indeterminate(-1)로 표시.
        if (res.contentLength > 0) {
          const pct = Math.round((res.bytesWritten / res.contentLength) * 100);
          // Only update when crossing 1% boundary to reduce re-renders
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            this.updateStatus({ downloadProgress: Math.min(99, pct) });
          }
        } else {
          // Content-Length 없는 경우 — 진행률을 indeterminate로 표시
          if (lastReportedPct !== -1) {
            lastReportedPct = -1;
            this.updateStatus({ downloadProgress: -1 });
          }
        }
      } });

    const result = await promise;

    if (result.statusCode < 200 || result.statusCode >= 300) {
      // 실패 시 불완전한 파일 삭제
      try { await RNFS.unlink(destPath); } catch {}
      throw new Error(`다운로드 실패: HTTP ${result.statusCode}`);
    }

    this.updateStatus({ downloadProgress: 100 });
    logger.log('[InferenceManager] 다운로드 완료:', destPath);
  }

  private updateStatus(partial: Partial<InferenceStatus>): void {
    this.status = { ...this.status, ...partial };
    this.listeners.forEach(fn => fn(this.getStatus()));
  }
}

// Singleton
export const inferenceManager = new InferenceManager();
export default inferenceManager;


