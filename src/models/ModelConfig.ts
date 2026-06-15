// src/models/ModelConfig.ts
// GGUF (llama.cpp / llama.rn) 온디바이스 모델 정의
// ─────────────────────────────────────────────────────────────────
// 모델 ID는 kv-spec-constants.ts의 MODEL_KV_SPECS 키와 반드시 일치해야 합니다.
// nCtxFallback / ropeFreqBase 는 DeviceProfiler 측정 실패 시에만 사용되며,
// 정상적으로는 kv-spec-constants.MODEL_KV_SPECS 에서 파생된 값을 사용합니다.

export interface ModelInfo {
  id: string;
  nameKey: string;
  descKey: string;
  summaryKeys: { line1: string; line2: string; line3: string };
  name: string;
  description: string;
  summary: { line1: string; line2: string; line3: string };
  /** HuggingFace 레포 (다운로드 경로) */
  hfRepo: string;
  /** GGUF 파일명 */
  hfFile: string;
  /** 로컬 저장 디렉터리명 (models/{dirName}/) */
  dirName: string;
  /** 모델 파일 크기 (MB) — 다운로드 완료 판정에 사용 */
  sizeMB: number;
  /** 컨텍스트 최대 길이 (표시용) */
  contextLength: number;
  /**
   * nCtx 폴백값 — DeviceProfiler 실패 시 사용.
   * 실제 값은 kv-spec-constants.MODEL_KV_SPECS[id].nCtx 에서 파생됩니다.
   */
  nCtxFallback: number;
  /** rope_freq_base 폴백값 — DeviceProfiler 실패 시 사용 */
  ropeFreqBase: number;
  /**
   * InferenceEngine.toPublicBackendInfo()에서 사용하는 컨텍스트 크기.
   * nCtxFallback 과 동일하게 유지하세요.
   */
  nCtx: number;
  /** OpenCL GPU 호환 여부 (false = CPU 폴백 강제) */
  openclCompatible?: boolean;
  prefillChunkSize?: number;
  contextWindowOverride?: number;
  recommended: boolean;
  minRAM: number;
}

export const MODELS: ModelInfo[] = [
  // ── 추론 모델 (E2B) — 고품질 RP 권장 ──────────────────────────
  {
    id: 'gemma-3n-e2b-reasoning',
    nameKey: 'modelNameReasoning',
    descKey: 'modelDescReasoning',
    summaryKeys: {
      line1: 'modelSummaryReasoning1',
      line2: 'modelSummaryReasoning2',
      line3: 'modelSummaryReasoning3' },
    name: 'Reasoning Model (E2B)',
    description: 'High quality RP rebadgeRecommended: Recommended for most devices.',
    summary: {
      line1: 'RAM 12GB+ · HTP / GPU Accelerated',
      line2: 'Best Quality · Recommended',
      line3: '~2.5GB · Context 8K' },
    hfRepo: 'bartowski/google_gemma-3n-E2B-it-GGUF',
    hfFile: 'google_gemma-3n-E2B-it-Q4_K_M.gguf',
    dirName: 'gemma-3n-e2b',
    sizeMB: 2850,
    contextLength: 8192,
    nCtxFallback: 8192,
    ropeFreqBase: 10000,
    nCtx: 8192,
    recommended: true,
    minRAM: 12288 },

  // ── 인터랙티브 모델 (1B QAT) — 범용 ──────────────────────────
  {
    id: 'gemma-3-1b-qat',
    nameKey: 'modelNameLight',
    descKey: 'modelDescLight',
    summaryKeys: {
      line1: 'modelSummaryLight1',
      line2: 'modelSummaryLight2',
      line3: 'modelSummaryLight3' },
    name: 'Interactive Model (1B)',
    description: 'Lightweight model for mid-range devices. Fast response.',
    summary: {
      line1: 'RAM 6GB+ · GPU(OpenCL) Accelerated',
      line2: 'Fast Response · Good RP Quality',
      line3: '~700MB · Context 4K' },
    hfRepo: 'stduhpf/google-gemma-3-1b-it-qat-q4_0-gguf-small',
    hfFile: 'gemma-3-1b-it-q4_0_s.gguf',
    dirName: 'gemma-3-1b-qat',
    sizeMB: 700,
    contextLength: 4096,
    nCtxFallback: 4096,
    ropeFreqBase: 10000,
    nCtx: 4096,
    recommended: false,
    minRAM: 6144 },

  // ── 비상 모델 (270M) — 저사양 폴백 ───────────────────────────
  {
    id: 'gemma-3-270m',
    nameKey: 'modelNameEmergency',
    descKey: 'modelDescEmergency',
    summaryKeys: {
      line1: 'modelSummaryEmergency1',
      line2: 'modelSummaryEmergency2',
      line3: 'modelSummaryEmergency3' },
    name: 'Emergency Model (270M)',
    description: 'Ultra-lightweight fallback for low-end devices.',
    summary: {
      line1: 'RAM 4GB+ · CPU Mode',
      line2: 'Battery Efficient · Basic Quality',
      line3: '~200MB · Context 4K' },
    hfRepo: 'bartowski/google_gemma-3-270m-it-qat-GGUF',
    hfFile: 'google_gemma-3-270m-it-qat-Q8_0.gguf',
    dirName: 'gemma-3-270m',
    sizeMB: 200,
    contextLength: 4096,
    nCtxFallback: 4096,
    ropeFreqBase: 10000,
    nCtx: 4096,
    recommended: false,
    minRAM: 4096 },
];

export const MODELS_BY_SIZE = [...MODELS].sort((a, b) => a.sizeMB - b.sizeMB);
export const DEFAULT_MODEL_ID  = 'gemma-3-1b-qat';
export const MODELS_DIR = 'models';

