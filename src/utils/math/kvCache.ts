/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/utils/math/kvCache.ts
 * KV 캐시 크기 계산
 *
 * ✅ [FIX] 모델별 파라미터 기본값 수정
 *    이전: layers=26 하드코딩 — 특정 모델 기준, 다른 모델에서 오계산
 *    수정: MODEL_KV_SPECS를 참조하여 모델별 정확한 파라미터 반환
 *
 * ✅ [FIX] K/V 각각의 양자화 비트수를 분리하여 정확한 크기 계산
 *    이전: dtypeBytes=1.5 단일 값 (K: q8_0=1byte, V: q4_0=0.5byte 합산)
 *    수정: kBytesPerElem / vBytesPerElem 분리 — 양자화 변경 시 개별 적용 가능
 */

import { MODEL_KV_SPECS } from '../../core/llama/kv-spec-constants';

// ── 양자화 타입별 바이트 수 ──────────────────────────────────────
// q8_0: 8비트 -> 1.0 byte/element
// q4_0: 4비트 -> 0.5 byte/element
// f16:  16비트 -> 2.0 byte/element
export const QUANT_BYTES: Record<string, number> = {
  q8_0: 1.0,
  q4_0: 0.5,
  q4_1: 0.5625,
  q5_0: 0.625,
  q5_1: 0.6875,
  f16:  2.0,
  f32:  4.0 } as const;

export interface KVCacheParams {
  /** 모델 레이어 수 (Transformer blocks) */
  layers: number;
  /** KV 헤드 수 (GQA의 경우 전체 헤드 수보다 작음) */
  kvHeads: number;
  /** 각 헤드의 차원 */
  headDim: number;
  /**
   * @deprecated dtypeBytes 대신 kQuantType / vQuantType 사용
   * 하위 호환성 유지용. kQuantType/vQuantType이 지정되면 무시됨.
   */
  dtypeBytes?: number;
  /** K 캐시 양자화 타입 (기본: q8_0) */
  kQuantType?: string;
  /** V 캐시 양자화 타입 (기본: q4_0) */
  vQuantType?: string;
}

// ── 모델별 기본 파라미터 ─────────────────────────────────────────
// kv-spec-constants.ts MODEL_KV_SPECS 와 맞춤
// 참고: GQA(Grouped-Query Attention) 모델은 kvHeads < numHeads
// [BUG-13 NOTE] 이 파일의 layers/kvHeads/headDim 값은 kv-spec-constants.ts와
// 독립적으로 관리되므로 모델 변경 시 반드시 두 파일을 동시에 수정해야 함.
// test-kv-regression.js 는 nCtx/ropeFreqBase 만 검증하므로 이 값들의 drift는
// 수동 리뷰로 잡아야 함.
// [BUG-12 FIX] DeviceProfiler.computeLlamaParams의 APPROX_BYTES_PER_TOKEN(13 하드코딩) 대신
// 이 파일의 resolveBytesPerToken()을 사용해 모델별 정확한 바이트 계산을 권장.
export interface ModelKVProfile {
  layers:     number;
  kvHeads:    number;
  headDim:    number;
  kQuantType: string;
  vQuantType: string;
}

export const MODEL_KV_PROFILES: Record<string, ModelKVProfile> = MODEL_KV_SPECS;


// 알 수 없는 모델의 폴백 기본값 (gemma-3n-E2B 기준)
const KV_DEFAULTS: Required<Omit<KVCacheParams, 'dtypeBytes'>> = {
  layers:     26,
  kvHeads:    4,
  headDim:    256,
  kQuantType: 'q8_0',
  vQuantType: 'q4_0' };

// ── 유틸리티: 파라미터 해석 ──────────────────────────────────────

/**
 * 각 토큰당 KV 캐시 점유 바이트 수 계산
 */
export function resolveBytesPerToken(params: KVCacheParams): number {
  const kBytes = QUANT_BYTES[params.kQuantType ?? 'q8_0'] ?? 1.0;
  const vBytes = QUANT_BYTES[params.vQuantType ?? 'q4_0'] ?? 0.5;
  // K+V 합산, 2 (K와 V 각각 1개씩)
  return params.layers * params.kvHeads * params.headDim * (kBytes + vBytes);
}

/**
 * 모델 ID로 KV 파라미터 조회
 * 알 수 없는 모델 ID이면 기본값 반환
 */
export function getModelKVParams(modelId: string): ModelKVProfile {
  return MODEL_KV_PROFILES[modelId] ?? { ...KV_DEFAULTS };
}

// ── 공개 API ─────────────────────────────────────────────────────

/**
 * KV 캐시 정밀 크기 추정 (MB)
 *
 * 실제 공식:
 *   bytes = layers × kvHeads × headDim × seqLen × (kBytes + vBytes)
 *
 * @param seqLen  시퀀스 길이 (토큰 수)
 * @param params  KV 파라미터. 미지정 시 기본값(gemma-3n-E2B) 사용
 */
export function estimateKVCacheMB(
  seqLen: number,
  params?: Partial<KVCacheParams>,
): number {
  const p: KVCacheParams = { ...KV_DEFAULTS, ...params };
  return resolveBytesPerToken(p) * seqLen / (1024 * 1024);
}

/**
 * 모델 ID 기준 KV 캐시 크기 추정 (MB)
 * MODEL_KV_PROFILES에 등록된 모델이면 정확한 파라미터 사용
 */
export function estimateKVCacheMBForModel(seqLen: number, modelId: string): number {
  const profile = getModelKVParams(modelId);
  return resolveBytesPerToken(profile) * seqLen / (1024 * 1024);
}

/**
 * 가용 RAM 내에서 최대 안전 nCtx 계산
 *
 * @param availMB    가용 RAM (MB)
 * @param modelMB    모델 가중치 사용 RAM (MB)
 * @param overheadMB 기타 오버헤드 (기본: 512MB — BUG-13 FIX: 이전 1024MB는 저사양 기기에서 nCtx가 과도하게 작아지는 문제)
 * @param params     KV 파라미터. 미지정 시 기본값 사용
 * @param snapTo     nCtx 정렬 단위 (기본: 2048). 모델 n_ubatch와 맞춤
 */
export function maxSafeNCtx(
  availMB: number,
  modelMB: number,
  overheadMB = 512,
  params?: Partial<KVCacheParams>,
  snapTo = 2048,
): number {
  const budgetMB = availMB - modelMB - overheadMB;
  if (budgetMB <= 0) return snapTo;

  const p: KVCacheParams = { ...KV_DEFAULTS, ...params };
  const bytesPerToken = resolveBytesPerToken(p);

  // [BUG FIX] bytesPerToken=0(layers=0 등 잘못된 파라미터) 시 division by zero -> Infinity
  // Math.floor(Infinity) = Infinity -> nCtx=Infinity -> initLlama 크래시
  // 수정: bytesPerToken <= 0이면 snapTo fallback 반환
  if (bytesPerToken <= 0) return snapTo;
  const maxTokens = Math.floor((budgetMB * 1024 * 1024) / bytesPerToken);
  // snapTo 단위로 내림 (n_ubatch와 맞춰야 효율적)
  return Math.max(snapTo, Math.floor(maxTokens / snapTo) * snapTo);
}

/**
 * 모델 ID 기준 최대 안전 nCtx 계산
 */
export function maxSafeNCtxForModel(
  availMB: number,
  modelMB: number,
  modelId: string,
  overheadMB = 512,
  snapTo = 2048,
): number {
  const profile = getModelKVParams(modelId);
  return maxSafeNCtx(availMB, modelMB, overheadMB, profile, snapTo);
}
