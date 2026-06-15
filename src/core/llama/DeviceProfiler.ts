import { NativeModules, Platform } from 'react-native';
// [BUG FIX] MODEL_KV_PROFILES import for accurate per-model KV memory calculation
// DeviceProfiler와 kvCache.ts가 독립적으로 headDim을 관리하면 drift 발생
import { MODEL_KV_PROFILES, resolveBytesPerToken } from '../../utils/math/kvCache';

type MemoryInfoBridge = {
  getAvailableRAM?: () => Promise<number>;
  getTotalRAM?: () => Promise<number>;
  getAvailableMemory?: () => Promise<number>;
  getTotalMemory?: () => Promise<number>;
  getSoCModel?: () => Promise<string>;
};

const memoryInfo = (NativeModules.DeviceInfo ?? null) as MemoryInfoBridge | null;

export type SoCVendor = 'qualcomm' | 'mediatek' | 'exynos' | 'apple' | 'unknown';
export type BackendType = 'CPU' | 'GPU' | 'HTP';

export interface DeviceProfile {
  availMB: number;
  totalMB: number;
  socVendor: SoCVendor;
  socModel: string;
  measuredAt: number;
}

export interface LlamaTuningParams {
  nCtx: number;
  nBatch: number;
  nUbatch: number;
  nThreads: number;
  nGpuLayers: number;
  backend: BackendType;
  useHTP: boolean;
  isOpenCLOnly: boolean;
  nKeep: number;
  ropeFreqBase: number;
  nParallelSlots: number;
  reason: string;
}

const RAM_TIER = {
  LOW: 4 * 1024,
  MID: 6 * 1024,
  HIGH: 8 * 1024 } as const;

const PROFILE_TTL_MS = 5 * 60 * 1000;

// ⚠️ 경고: 아래 상수들은 절대 변경 금지! ⚠️
// KV 캐시 포맷을 결정하는 핵심 파라미터
// 변경 시 서버 R2의 모든 base.bin / chapter.bin 무효화 → 전체 재생성 필요

// ⛔ 절대 변경 금지: SPEC_BATCH = 2048 (kv-spec.txt 일치 필요)
const SPEC_BATCH = 2048;
// ⛔ 절대 변경 금지: SPEC_UBATCH = 2048 (kv-spec.txt 일치 필요)
const SPEC_UBATCH = 2048;

const SPEC_N_KEEP = 512;

type Tier = 'low' | 'mid' | 'high' | 'flagship';

interface TierParams {
  prefill: number;
  context: number;
  maxNew: number;
  nParallelSlots: number;
}

const PARAMS_1B: Record<Tier, TierParams> = {
  low: { prefill: 256, context: 8192, maxNew: 256, nParallelSlots: 1 },
  mid: { prefill: 512, context: 16384, maxNew: 512, nParallelSlots: 2 },
  high: { prefill: 768, context: 24576, maxNew: 512, nParallelSlots: 4 },
  flagship: { prefill: 1024, context: 32768, maxNew: 512, nParallelSlots: 4 } };

const PARAMS_4B: Record<Tier, TierParams> = {
  low: { prefill: 256, context: 6144, maxNew: 256, nParallelSlots: 1 },
  mid: { prefill: 512, context: 12288, maxNew: 512, nParallelSlots: 2 },
  high: { prefill: 768, context: 20480, maxNew: 512, nParallelSlots: 4 },
  flagship: { prefill: 1024, context: 32768, maxNew: 512, nParallelSlots: 4 } };

class DeviceProfiler {
  private cachedProfile: DeviceProfile | null = null;

  async measure(forceRefresh = false): Promise<DeviceProfile> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedProfile &&
      now - this.cachedProfile.measuredAt < PROFILE_TTL_MS
    ) {
      return this.cachedProfile;
    }

    const { availMB, totalMB } = await this.fetchRAM();
    const { vendor, model } = await this.fetchSoC();
    let resolvedVendor = vendor;

    if (resolvedVendor === 'unknown' && Platform.OS === 'android') {
      const platformConstants = (Platform as typeof Platform & {
        constants?: Record<string, unknown>;
        Brand?: string;
        Manufacturer?: string;
        Model?: string;
      }).constants ?? {};
      const hint = [
        (platformConstants as any).Brand,
        (platformConstants as any).Manufacturer,
        (platformConstants as any).Model,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ');

      if (hint) {
        resolvedVendor = this.parseSoCVendor(hint);
      }
    }

    this.cachedProfile = {
      availMB,
      totalMB,
      socVendor: resolvedVendor,
      socModel: model,
      measuredAt: now };
    return this.cachedProfile;
  }

  computeLlamaParams(
    modelSizeMB: number,
    profile: DeviceProfile,
    ropeFreqBase: number,
    nCtxFallback: number,
  ): LlamaTuningParams {
    // [BUG FIX] totalMB만으로 tier를 결정하면 availMB가 낮을 때 너무 높은
    // nParallelSlots/nCtx가 적용되어 OOM이 발생할 수 있음.
    // availMB * 2를 totalMB의 보수적 상한으로 사용하되, totalMB를 초과하지 않도록 min() 처리.
    // 예) totalMB=8192, availMB=1800 -> effective=3600 -> tier='low' (안전)
    //     totalMB=8192, availMB=4096 -> effective=8192 -> tier='flagship' (정상)
    const effectiveMB = Math.min(profile.totalMB, profile.availMB * 2);
    const tier = this.ramTier(effectiveMB);
    const table = modelSizeMB <= 1500 ? PARAMS_1B : PARAMS_4B;
    const row = table[tier];

    const canUseHtp = false; // [FIX] HTP 강제 비활성화 - KV 파일 로드 크래시 방지
      // Platform.OS === 'android' &&
      // profile.socVendor === 'qualcomm' &&
      // profile.totalMB >= 8192 &&
      // ✅ [OPT] 2800→2500MB: Snapdragon 8xx 기기 중 백그라운드 앱 많아도
      //   HTP 접근 허용. 2500MB 이상이면 HTP 드라이버 초기화 충분히 안전.
      // profile.availMB >= 2500;

    const canUseGpu =
      Platform.OS === 'android' &&
      // ✅ [OPT] 2300->2000MB: mid-range 기기(4-6GB RAM)도 GPU 가속 수혜.
      //   llama.cpp OpenCL/Vulkan 레이어는 2GB avail에서도 안정적으로 동작.
      profile.availMB >= 2000;

    const backend: BackendType = canUseHtp ? 'HTP' : canUseGpu ? 'GPU' : 'CPU';
    const useHTP = backend === 'HTP';
    const isOpenCLOnly = backend === 'GPU' && profile.socVendor === 'qualcomm' && !useHTP;
    
    // [DEBUG] HTP 설정 확인 로그
    console.log('[DeviceProfiler] canUseHtp:', canUseHtp, 'backend:', backend, 'useHTP:', useHTP);
    // [BUG FIX] CPU fallback 시 low tier(4GB 이하) 기기에서 쓰레드 수를 6으로 설정하면 OS/백그라운드 앱과 코어 경합이 발생해 
    //   Context Switch 비용으로 성능이 극도로 저하되고 (Thrashing) 기기가 멈출 수 있음. 
    //   low tier는 2로 낮추어 안정성(안정된 high-performance) 도모.
    const nThreads = backend === 'CPU' ? (tier === 'low' ? 2 : 4) : 2;

    // [BUG-16 FIX] nCtx 계산 수정.
    //
    // 기존 코드: nCtx = row.context >= nCtxFallback ? row.context : nCtxFallback
    //   → PARAMS_4B.low.context(6144) < gemma-3n-e2b nCtxFallback(8192) 이면
    //     저사양 4GB 기기에서도 8192 강제 → OOM 위험.
    //   → tier별 메모리 절약 테이블(PARAMS_4B/PARAMS_1B)이 사실상 dead code.
    //
    // 수정: Math.min 으로 tier 상한을 우선 적용.
    //   - tier_nCtx < nCtxFallback 이면 base.bin(nCtxFallback으로 빌드됨)과 포맷 불일치 가능.
    //   - 그러나 WarmupManager는 loadSession() 실패 시 base.bin을 즉시 삭제하고
    //     fresh prefill로 안전하게 폴백하므로 OOM보다 TTFT 증가가 훨씬 나은 트레이드오프.
    // [BUG-3 FIX] availMB 기반 안전 상한 추가.
    // total=8GB 기기라도 avail=1.5GB이면 flagship tier → nCtx=32768 → KV 수 GB → OOM.
    // avail에서 모델 크기와 기본 오버헤드를 뺀 여유 메모리로 실제 수용 가능한 nCtx를 계산해 상한 적용.
    // [BUG-29 FIX] 하드코딩된 13바이트/토큰 → 모델별 정확한 계산 함수 사용
    // [BUG-30 FIX] modelOverheadMB를 nCtxFallback 추정 대신 실제 modelSizeMB 사용
    const OVERHEAD_MB = 512; // OS + runtime 기본 오버헤드
    // 실제 모델 크기에 30% 런타임 오버헤드를 더해 추정
    const modelOverheadMB = Math.round(modelSizeMB * 1.3);
    const availForKV = Math.max(0, profile.availMB - OVERHEAD_MB - modelOverheadMB);
    // 모델별 바이트/토큰 계산: gemma-3n-E2B(q8_0+q4_0, 26layers, 4kvHeads, 256headDim) 기준
    // layers(26) * kvHeads(4) * headDim(256) * (kBytes(1.0) + vBytes(0.5)) = 26*4*256*1.5 = 39936 bytes/token
    // 단순화: nCtxFallback 크기로 모델 구분해 근사값 사용 (정밀도 개선)
    // [BUG FIX] gemma-3-270m의 headDim은 128이지 256이 아님 (MODEL_KV_PROFILES 참조).
    // 이전: nCtxFallback<=4096 이면 18*1*256*1.5 사용 → 270m 모델에서 2배 과대 추정
    //       → maxNCtxByAvail이 실제보다 절반으로 나와 nCtx 과소 설정.
    // 수정: 270m(headDim=128)와 1b(headDim=256)를 별도 분기로 계산.
    //       MODEL_KV_PROFILES에 등록된 정확한 값을 사용해야 하나, 여기서는
    //       nCtxFallback=4096 모델 중 sizeMB로 구분(270m≈0.5GB, 1b≈1.5GB)하기 어려우므로

    const _profileByCtx = Object.values(MODEL_KV_PROFILES).find(
      p => p.layers > 0 && (nCtxFallback <= 4096 ? p.headDim < 256 : p.headDim > 128)
    );

    // [BUG-29 FIX] MODEL_KV_PROFILES에서 모델별 정확한 파라미터로 bytes/token 계산
    const _profileParams = {
      layers:     _profileByCtx?.layers     ?? (nCtxFallback <= 4096 ? 18 : 26),
      kvHeads:    _profileByCtx?.kvHeads    ?? (nCtxFallback <= 4096 ? 1 : 4),
      headDim:    _profileByCtx?.headDim    ?? (nCtxFallback <= 4096 ? 128 : 256),
      kQuantType: _profileByCtx?.kQuantType ?? 'q8_0',
      vQuantType: _profileByCtx?.vQuantType ?? 'q4_0' };
    
    // [OPT] GPU 레이어 계산: 발열 관리 및 UI 반응성을 위한 비율 기반 계산
    // -1 = 전체 레이어 GPU 사용 → 발열 심함 + UI 버벅임 가능
    // 85% 사용 → 발열 관리 + UI 반응성 유지 + 대부분 GPU 가속 혜택
    let nGpuLayers = 0;
    if (backend === 'CPU') {
      nGpuLayers = 0;
    } else {
      const totalLayers = _profileParams.layers;
      // tier별 GPU 사용 비율 조정
      const gpuRatio = tier === 'flagship' ? 0.85 : tier === 'mid' ? 0.75 : 0.65;
      nGpuLayers = Math.floor(totalLayers * gpuRatio);
      console.log(`[DeviceProfiler] GPU 레이어 최적화: ${nGpuLayers}/${totalLayers} (${Math.round(gpuRatio * 100)}%, tier=${tier})`);
    }
    
    // [BUG FIX] 하드코딩된 식 대신 kvCache.ts의 집중화된 계산 함수 사용
    const approxBytesPerToken = resolveBytesPerToken(_profileParams);
    const maxNCtxByAvail = availForKV > 0 && approxBytesPerToken > 0
      ? Math.max(2048, Math.floor((availForKV * 1024 * 1024) / approxBytesPerToken / 2048) * 2048)
      : 2048;
    // [BUG FIX] nCtx 동적 계산 유지 — useKVSession에서 engineNCtx >= specNCtx 체크로 호환성 보장
    const nCtx = Math.min(row.context, nCtxFallback, maxNCtxByAvail);

    const reason = [
      `avail=${profile.availMB}MB`,
      `total=${profile.totalMB}MB`,
      `tier=${tier}`,
      `soc=${profile.socVendor}`,
      `backend=${backend}`,
      `nCtx=${nCtx}(spec=${nCtxFallback},tier=${row.context})`,
      `batch=${SPEC_BATCH}`,
      `parallel=${row.nParallelSlots}`,
    ].join(' | ');

    return {
      nCtx,
      nBatch: SPEC_BATCH,
      nUbatch: SPEC_UBATCH,
      nThreads,
      nGpuLayers,
      backend,
      useHTP,
      isOpenCLOnly,
      nKeep: SPEC_N_KEEP,
      ropeFreqBase,
      nParallelSlots: row.nParallelSlots,
      reason };
  }

  invalidate(): void {
    this.cachedProfile = null;
  }

  getCachedProfile(): DeviceProfile | null {
    return this.cachedProfile;
  }

  overrideCachedVendor(vendor: SoCVendor): void {
    if (!this.cachedProfile) return;
    this.cachedProfile = {
      ...this.cachedProfile,
      socVendor: vendor,
      measuredAt: Date.now(),
    };
  }

  private ramTier(effectiveMB: number): Tier {
    if (effectiveMB < RAM_TIER.LOW) return 'low';
    if (effectiveMB < RAM_TIER.MID) return 'mid';
    if (effectiveMB < RAM_TIER.HIGH) return 'high';
    return 'flagship';
  }

  private async fetchRAM(): Promise<{ availMB: number; totalMB: number }> {
    try {
      if (Platform.OS === 'android' && memoryInfo) {
        const readAvail = memoryInfo.getAvailableRAM ?? memoryInfo.getAvailableMemory;
        const readTotal = memoryInfo.getTotalRAM ?? memoryInfo.getTotalMemory;

        if (readAvail && readTotal) {
          const [avail, total] = await Promise.all([
            readAvail.call(memoryInfo),
            readTotal.call(memoryInfo),
          ]);

    // [BUG-33 FIX] Number(null)=0, 0||2048=2048 → null 반환을 풍족한 메모리로 오판.
    // null/undefined 를 별도로 체크해 실제 0 값(극저메모리)과 구분.
    const toMB = (v: unknown, fallback: number) => {
      const n = v == null ? null : Number(v);
      return (n != null && isFinite(n) && n > 0) ? Math.round(n) : fallback;
    };

          return {
            availMB: toMB(avail, 2048),
            totalMB: toMB(total, 4096) };
        }
      }
    } catch {
      // Fall through to safe defaults.
    }

    return { availMB: 3072, totalMB: 6144 };
  }

  private async fetchSoC(): Promise<{ vendor: SoCVendor; model: string }> {
    try {
      if (Platform.OS === 'android' && memoryInfo) {
        const soc = (await memoryInfo.getSoCModel?.()) ?? '';
        return { vendor: this.parseSoCVendor(soc), model: soc || 'unknown' };
      }
    } catch {
      // Fall through to defaults.
    }

    return { vendor: 'unknown', model: 'unknown' };
  }

  private parseSoCVendor(socStr: string): SoCVendor {
    const s = socStr.toLowerCase();
    if (
      s.includes('snapdragon') ||
      s.includes('qualcomm') ||
      s.includes('qcom') ||
      s.includes('msm') ||
      s.includes('sdm') ||
      s.includes('sm8') ||
      s.includes('sm7') ||
      s.includes('sm6')
    ) {
      return 'qualcomm';
    }
    if (s.includes('dimensity') || s.includes('mediatek') || s.includes('helio') ||
        s.includes('mt68') || s.includes('mt69') ||
        // Helio G/P/X 시리즈: mt6[5-7]xx 범위 (예: mt6765, mt6762, mt6785 등)
        /mt6[5-7]\d{2}/.test(s)) {
      return 'mediatek';
    }
    if (s.includes('exynos')) return 'exynos';
    if (s.includes('apple') || /\ba\d{1,2}[x-z]?\b/.test(s) || /\bm[123]\b/.test(s)) return 'apple';
    return 'unknown';
  }
}

export const deviceProfiler = new DeviceProfiler();
export default deviceProfiler;
