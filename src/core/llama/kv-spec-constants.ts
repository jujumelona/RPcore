// src/core/llama/kv-spec-constants.ts
// ════════════════════════════════════════════════════════════════════
//  KV 캐시 호환 스펙 중앙 상수 파일
//
//  ⚠️  경고: 이 파일의 값은 함부로 수정하면 안 됩니다! ⚠️
//
//  이 파일의 값은 kv-spec.txt 와 반드시 동기화되어야 합니다.
//  아래 값 중 하나라도 변경하면 서버 R2의 base.bin 전체 재생성이 필요합니다.
//
//  ⛔ 절대 변경 금지 (OpenCL 호환성 필수):
//    - KV_FLASH_ATTN = false (Android OpenCL 환경 필수, llama.rn 공식)
//    - KV_CACHE_TYPE_K = 'q8_0' (전 백엔드 통일)
//    - KV_CACHE_TYPE_V = 'f16' (서버 base.bin 생성 설정과 일치)
//
//  변경 시 필수 절차:
//    1. kv-spec.txt 수정
//    2. 이 파일의 해당 값 수정
//    3. GitHub Actions LLAMA_CPP_HASH secret 수정 (해시 변경 시)
//    4. KV_VERSION 올리기 → 기존 .bin 자동 무효화
//    5. R2 삭제 + D1 DELETE + KV 전체 재생성
//    6. Actions 배포 먼저 → 앱 배포 순서 준수
//
//  참고: llama.rn GitHub - OpenCL 사용 조건
//    https://github.com/mybigday/llama.rn#opencl-gpu-acceleration
//    "State load/save are not fully supported on Android with OpenCL backend,
//     but you can set kv_unified: true and flash_attn_type: 'off' to enable it."
//
//   이 파일을 직접 편집하는 것을 막는 CI 검증이 없다면
//      PR 리뷰에서 반드시 kv-spec.txt 와 값이 일치하는지 확인하세요.
// ════════════════════════════════════════════════════════════════════

// ── 공통 KV 포맷 상수 ────────────────────────────────────────────
// ⚠️ 변경 시 KV 전체 재생성 필요 ⚠️

/** KV 캐시 버전 — KVCacheManager의 LLAMA_RN_VERSION 과 일치 */
export const KV_VERSION = '0.3.4' as const;

/** n_cache_reuse 기본값 — 최소 256토큰 일치해야 KV 재사용 시도 */
export const DEFAULT_N_CACHE_REUSE = 256;

/** 빌드에 사용된 llama.cpp 커밋 해시 — Actions LLAMA_CPP_HASH secret 과 일치 */
export const LLAMA_CPP_HASH = 'b8095' as const;

/**
 * ⛔ 절대 변경 금지: flash_attn = false (Android OpenCL 환경 필수)
 * 
 * flash_attn ON/OFF 전환은 KV 텐서 레이아웃(transposed) 변경을 유발합니다.
 * 변경하면 기존 .bin 전체 무효화 — 반드시 재생성 필요.
 * 
 * [FIX] Android OpenCL 환경에서는 OFF 필수 (llama.rn 공식 문서)
 * OpenCL에서 session load/save 사용 시 flash_attn_type: 'off' 필수
 */
export const KV_FLASH_ATTN = false as const;

/**
 * 양자화 타입별 바이트 수
 * RAMChecker.calcModelRunMemory() 가 이 값으로 KV 크기를 계산합니다.
 */
export const QUANT_BYTES: Record<string, number> = {
  q4_0:  0.5,
  q4_1:  0.5625,
  q5_0:  0.625,
  q5_1:  0.6875,
  q8_0:  1.0,
  f16:   2.0,
  f32:   4.0 } as const;

/**
 * ⛔ 절대 변경 금지: KV Key 캐시 양자화 타입 = 'q8_0'
 * 
 * 서버 base.bin 생성 시 --cache-type-k 값과 반드시 일치해야
 * loadSession() 이 성공합니다.
 * 
 * q8_0: 전 백엔드 통일 (CPU, Metal, OpenCL 모두 지원)
 */
export const KV_CACHE_TYPE_K = 'q8_0' as const;

/**
 * ⛔ 절대 변경 금지: KV Value 캐시 양자화 타입 = 'f16'
 * 
 * 서버 base.bin 생성 시 --cache-type-v 값과 반드시 일치해야
 * loadSession() 이 성공합니다.
 * 
 * f16: 서버 GitHub Actions 워크플로우에서 사용하는 설정
 * (CACHE_TYPE_V: f16)
 */
export const KV_CACHE_TYPE_V = 'f16' as const;

// ── 모델별 KV 호환 값 ─────────────────────────────────────────────
// n_ctx / rope_freq_base 변경 시 해당 모델 KV 재생성 필요

export interface ModelKVSpec {
  /** n_ctx — initLlama() 의 n_ctx 와 반드시 일치 */
  nCtx: number;
  /** rope_freq_base — initLlama() 의 rope_freq_base 와 반드시 일치 */
  ropeFreqBase: number;
  /** 모델 레이어 수 */
  layers: number;
  /** KV 헤드 수 */
  kvHeads: number;
  /** 각 헤드의 차원 */
  headDim: number;
  /** K 캐시 양자화 타입 (기본: q8_0) */
  kQuantType: string;
  /** V 캐시 양자화 타입 (기본: q4_0) */
  vQuantType: string;
}

/**
 * 모델 ID -> KV 호환 스펙 매핑.
 * ModelConfig.ts 의 nCtxFallback / ropeFreqBase 는 이 값에서 파생됩니다.
 *
 * 모델 추가/변경 시 kv-spec.txt 의 모델별 스펙 표와 동시에 수정하세요.
 */
export const MODEL_KV_SPECS = {
  'gemma-3n-e2b-reasoning': { nCtx: 8192,  ropeFreqBase: 500000,  layers: 26, kvHeads: 4, headDim: 256, kQuantType: 'q8_0', vQuantType: 'f16'  },
  'gemma-3-1b-qat':         { nCtx: 4096,  ropeFreqBase: 10000, layers: 26, kvHeads: 1, headDim: 256, kQuantType: 'q8_0', vQuantType: 'f16'  },
  'gemma-3-270m':           { nCtx: 4096,  ropeFreqBase: 10000,   layers: 12, kvHeads: 1, headDim: 128, kQuantType: 'q8_0', vQuantType: 'f16'  } } as const;

export type KnownModelId = keyof typeof MODEL_KV_SPECS;
