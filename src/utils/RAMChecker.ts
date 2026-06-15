/**
 * src/utils/RAMChecker.ts
 *
 * 순수 구동 필요 RAM 계산 (시스템/앱 오버헤드 제외)
 * ─────────────────────────────────────────────────
 * 엔진이 실제로 점유하는 메모리만 계산:
 *   1. 모델 가중치  (MODELS.sizeMB)
 *   2. KV K 캐시   (layers × kvHeads × headDim × nCtx × kBytes)  ← kv-spec nCtx 사용
 *   3. KV V 캐시   (layers × kvHeads × headDim × nCtx × vBytes)
 *   4. 엔진 버퍼   (~200 MB, llama.cpp compute/scratch)
 *
 * ※ nCtx 는 MODEL_KV_SPECS[modelId].nCtx 를 사용합니다.
 *    외부에서 tokenCount 를 주입하는 방식을 제거했습니다.
 */

import React from 'react';
import { NativeModules } from 'react-native';
import { MODEL_KV_SPECS, QUANT_BYTES, type KnownModelId } from '../core/llama/kv-spec-constants';
import { MODELS } from '../models/ModelConfig';

// ── 내부 상수 ────────────────────────────────────────────────────────────────

/** llama.cpp compute / scratch 버퍼 실측 근사값 */
const ENGINE_BUFFER_MB = 200;

const CACHE_TTL_MS = 5_000;

// ── Native 브릿지 ─────────────────────────────────────────────────────────────

// NativeModules destructured inside methods for lazy access to prevent race conditions during early module load

// ── 공개 타입 ─────────────────────────────────────────────────────────────────

export interface RAMInfo {
  totalRAM:      number;   // MB
  availableRAM:  number;   // MB (현재 여유 공간)
  usedRAM:       number;   // MB
  usagePercent:  number;   // 0–100
  isRAMPlus:     boolean;  // 12 GB 초과
  isSufficient:  boolean;  // 4 GB 이상
}

/** 모델 구동에 필요한 메모리 내역 */
export interface ModelRunMemory {
  modelId:       string;
  /** 모델 가중치 (MB) */
  weightsMB:     number;
  /** KV K 캐시 (q8_0, MB) */
  kvKMB:         number;
  /** KV V 캐시 (q4_0, MB) */
  kvVMB:         number;
  /** KV 합계 (MB) */
  kvTotalMB:     number;
  /** llama.cpp 엔진 버퍼 (MB) */
  engineMB:      number;
  /** ── 합계 (MB): 시스템/앱 제외 ── */
  totalMB:       number;
  /** 계산에 사용된 nCtx */
  nCtx:          number;
}

/** canRunModel 결과 */
export interface ModelRunCheck {
  canRun:        boolean;
  required:      ModelRunMemory;
  availableMB:   number;
  shortfallMB:   number;   // 0이면 여유 있음, 양수면 부족량
}

// ── 핵심 계산 함수 (순수 함수, 테스트 가능) ──────────────────────────────────

/**
 * 모델 ID 기준 순수 구동 필요 RAM 계산
 *
 * nCtx 는 kv-spec-constants.MODEL_KV_SPECS[modelId].nCtx 를 사용합니다.
 */
export function calcModelRunMemory(modelId: string): ModelRunMemory {
  const spec  = MODEL_KV_SPECS[modelId as KnownModelId];
  const model = MODELS.find(m => m.id === modelId);

  if (!spec || !model) {
    // 알 수 없는 모델 — 보수적 기본값
    return {
      modelId, weightsMB: 3000, kvKMB: 208, kvVMB: 104,
      kvTotalMB: 312, engineMB: ENGINE_BUFFER_MB,
      totalMB: 3000 + 312 + ENGINE_BUFFER_MB, nCtx: 8192 };
  }

  const kBytesPerElem = QUANT_BYTES[spec.kQuantType] ?? 1.0;   // q8_0 = 1.0
  const vBytesPerElem = QUANT_BYTES[spec.vQuantType] ?? 0.5;   // q4_0 = 0.5

  //  bytes = layers × kvHeads × headDim × nCtx × bytesPerElem
  const kvKMB = spec.layers * spec.kvHeads * spec.headDim * spec.nCtx * kBytesPerElem / 1024 / 1024;
  const kvVMB = spec.layers * spec.kvHeads * spec.headDim * spec.nCtx * vBytesPerElem / 1024 / 1024;
  const kvTotalMB = kvKMB + kvVMB;

  const weightsMB   = model.sizeMB;
  const engineMB    = ENGINE_BUFFER_MB;
  const totalMB     = weightsMB + kvTotalMB + engineMB;

  return {
    modelId,
    weightsMB,
    kvKMB:    Math.ceil(kvKMB),
    kvVMB:    Math.ceil(kvVMB),
    kvTotalMB: Math.ceil(kvTotalMB),
    engineMB,
    totalMB:  Math.ceil(totalMB),
    nCtx:     spec.nCtx };
}

// ── RAMChecker 클래스 ─────────────────────────────────────────────────────────

export class RAMChecker {
  private static instance: RAMChecker;
  private static _fallbackWarnShown = false;
  private cached:    RAMInfo | null = null;
  private cachedAt = 0;

  static getInstance(): RAMChecker {
    if (!this.instance) this.instance = new RAMChecker();
    return this.instance;
  }

  invalidateCache(): void {
    this.cached   = null;
    this.cachedAt = 0;
  }

  // ── RAM 측정 ───────────────────────────────────────────────────────────────

  async check(): Promise<RAMInfo> {
    if (this.cached && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }
    try {
      // ✅ [FIX] 네이티브 RAM 측정 행(Hung) 방지용 10초 타임아웃
      const info = await Promise.race([
        this.measureMemory(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('RAM measurement timeout')), 10000)
        ),
      ]);
      this.cached = info;
      this.cachedAt = Date.now();
      return info;
    } catch (e) {
      console.error('[RAMChecker] RAM check failed or timed out:', e);
      // 실패 시 캐시가 있으면 반환, 없으면 기본값(4GB/2GB) 반환
      if (this.cached) return this.cached;
      
      if (!RAMChecker._fallbackWarnShown) {
        RAMChecker._fallbackWarnShown = true;
        console.warn('[RAMChecker] RAM check timed out and no cache available, using 4GB/2GB fallback');
      }
      return this.buildInfo(4096, 2048);
    }
  }

  private async measureMemory(): Promise<RAMInfo> {
    try {
      // ✅ [FIX] NativeModules 레이지 접근 — 모듈 초기 로드 시점의 레이스 컨디션 방지
      const { DeviceInfo, MemoryInfoModule } = NativeModules;
      const memModule = MemoryInfoModule || DeviceInfo;

      if (memModule) {
        let totalMB = 0;
        let availMB = 0;

        // 1. getRAMInfo (한 번에 모든 정보 반환) 시도
        if (typeof memModule.getRAMInfo === 'function') {
          const info = await memModule.getRAMInfo();
          if (info && typeof info.totalMem === 'number') {
            totalMB = Math.round(info.totalMem);
            availMB = Math.round(info.availMem);
            return this.buildInfo(totalMB, availMB);
          }
        }

        // 2. 개별 메서드 시도
        const getTotal = memModule.getTotalMemory || memModule.getTotalRAM;
        const getAvail = memModule.getAvailableMemory || memModule.getAvailableRAM;

        if (typeof getTotal === 'function') {
          totalMB = Math.round(await getTotal.call(memModule));
          
          if (typeof getAvail === 'function') {
            availMB = Math.round(await getAvail.call(memModule));
          } else {
            // [FALLBACK] 가용 메모리 측정 불가 시 25% 추정 (이전: 40% — OS 오버헤드 감안)
            availMB = Math.round(totalMB * 0.25);
          }
          return this.buildInfo(totalMB, availMB);
        }
      }

      if (!RAMChecker._fallbackWarnShown) {
        RAMChecker._fallbackWarnShown = true;
        if (__DEV__) console.warn('[RAMChecker] Native RAM module unavailable, using fallback 4GB/2GB');
      }
      return this.buildInfo(4096, 2048);
    } catch (e) {
      console.error('[RAMChecker] RAM measurement failed:', e);
      return this.cached ?? this.buildInfo(4096, 2048);
    }
  }

  private buildInfo(totalRAM: number, availableRAM: number): RAMInfo {
    const usedRAM = totalRAM - availableRAM;
    return {
      totalRAM,
      availableRAM,
      usedRAM,
      usagePercent:  totalRAM > 0 ? Math.round((usedRAM / totalRAM) * 100) : 0,
      isRAMPlus:     totalRAM > 12288,
      isSufficient:  totalRAM >= 4096 };
  }

  // ── 모델 구동 가능 여부 체크 ──────────────────────────────────────────────

  /**
   * 현재 여유 RAM 으로 해당 모델을 구동할 수 있는지 확인합니다.
   *
   * required.totalMB = 모델 가중치 + KV 캐시(kv-spec nCtx 기준) + 엔진 버퍼
   * 시스템/앱 오버헤드는 포함하지 않습니다.
   *
   * @example
   *   const result = await ramChecker.canRunModel('gemma-3n-e2b-reasoning');
   *   // result.required.totalMB  → 3362 MB  (weights 2850 + KV 312 + engine 200)
   *   // result.required.nCtx     → 8192     (kv-spec 그대로)
   *   // result.canRun            → availableMB >= 3362
   */
  async canRunModel(modelId: string): Promise<ModelRunCheck> {
    const ramInfo  = await this.check();
    const required = calcModelRunMemory(modelId);
    const shortfallMB = Math.max(0, required.totalMB - ramInfo.availableRAM);

    return {
      canRun:       ramInfo.availableRAM >= required.totalMB,
      required,
      availableMB:  ramInfo.availableRAM,
      shortfallMB };
  }

  /**
   * 모든 모델을 순서대로 확인하여 구동 가능한 첫 번째 모델 ID 반환.
   * 우선순위: E2B → 1B QAT → 270M
   */
  async pickBestAvailableModel(
    orderedModelIds: string[] = [
      'gemma-3n-e2b-reasoning',
      'gemma-3-1b-qat',
      'gemma-3-270m',
    ],
  ): Promise<{ modelId: string; check: ModelRunCheck } | null> {
    const ramInfo = await this.check();

    for (const modelId of orderedModelIds) {
      const required = calcModelRunMemory(modelId);
      const shortfallMB = Math.max(0, required.totalMB - ramInfo.availableRAM);
      if (ramInfo.availableRAM >= required.totalMB) {
        return { modelId, check: { canRun: true, required, availableMB: ramInfo.availableRAM, shortfallMB } };
      }
    }
    return null; // 아무 모델도 불가
  }

  // ── 경고 메시지 ───────────────────────────────────────────────────────────

  getWarningMessage(ramInfo: RAMInfo): string | null {
    if (!ramInfo.isSufficient)     return `RAM 부족: 최소 4GB 필요 (현재 ${ramInfo.totalRAM}MB)`;
    if (ramInfo.availableRAM < 2048) return `여유 RAM 부족: ${ramInfo.availableRAM}MB\n다른 앱을 종료해 주세요.`;
    return null;
  }

  // ── 레거시 호환: 삭제 예정 ────────────────────────────────────────────────
  /** @deprecated canRunModel() 로 교체 예정 */
  async canHandle(tokenCount: number, modelSizeMB = 500): Promise<{
    canHandle: boolean; requiredRAM: number; availableRAM: number; message: string;
  }> {
    const ramInfo    = await this.check();
    const kvCacheSize = tokenCount * 26 * 4 * 256 * 1.5 / 1024 / 1024; // 구 방식 (deprecated)
    const requiredRAM = modelSizeMB + kvCacheSize + 1024;
    const canHandle   = ramInfo.availableRAM >= requiredRAM;
    return {
      canHandle, requiredRAM, availableRAM: ramInfo.availableRAM,
      message: canHandle ? '' : `RAM 부족: ${Math.round(requiredRAM)}MB 필요, ${ramInfo.availableRAM}MB 가용` };
  }
}

// ── React Hook ────────────────────────────────────────────────────────────────

export function useRAMCheck() {
  const [ramInfo, setRamInfo]   = React.useState<RAMInfo | null>(null);
  const [warning, setWarning]   = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const checker = RAMChecker.getInstance();
    checker.invalidateCache();
    checker.check().then(info => {
      if (cancelled) return;
      setRamInfo(info);
      setWarning(checker.getWarningMessage(info));
    });
    return () => { cancelled = true; };
  }, []);

  return { ramInfo, warning };
}

/**
 * 모델 구동 가능 여부 훅
 *
 * @example
 *   const { check, loading } = useModelRunCheck('gemma-3n-e2b-reasoning');
 *   // check.canRun       → true/false
 *   // check.required     → { totalMB: 3362, nCtx: 8192, ... }
 *   // check.availableMB  → 현재 여유 RAM
 */
export function useModelRunCheck(modelId: string) {
  const [check,   setCheck]   = React.useState<ModelRunCheck | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    RAMChecker.getInstance().canRunModel(modelId).then(result => {
      if (cancelled) return;
      setCheck(result);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [modelId]);

  return { check, loading };
}
