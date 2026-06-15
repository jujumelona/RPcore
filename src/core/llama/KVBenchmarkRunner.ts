// src/core/llama/KVBenchmarkRunner.ts
import llamaEngine from './LlamaEngine';
import { logger } from '../../utils/logger';
import RNFS from '../../utils/fileSystemCompat';

export type BenchmarkTier = 'low' | 'mid' | 'high';

export interface KVBenchmarkOptions {
  modelId: string;
  runs?: number;
  /**
   * ✅ [FIX] warmupRuns 실제 사용 — 이전에는 정의만 있고 무시됨
   * warmup 실행으로 JIT/캐시 워밍 후 실제 측정
   */
  warmupRuns?: number;
  virtual?: boolean; // 가상 모드 플래그
}

export interface KVBenchmarkReport {
  modelId: string;
  startedAtISO: string;
  finishedAtISO: string;
  device: {
    tier: BenchmarkTier;
  };
  summary: {
    avgTtftMs: number;
    avgTokPerSec: number;
    successRuns: number;
  };
}

/** 벤치마크용 짧은 고정 프롬프트 — 토큰 수 일정해야 TTFT 비교 가능 */
const BENCH_PROMPT = 'Write a short story about a brave knight.';

/** 기기 티어 판정 임계값 */
const TIER_THRESHOLDS = {
  HIGH_TOK_PER_SEC: 12,   // ≥ 12 tok/s -> high
  MID_TOK_PER_SEC:  6,    // ≥ 6 tok/s  -> mid
                          // < 6 tok/s  -> low
} as const;

/**
 * 실제 엔진 없이 결과를 시뮬레이션하는 가상 벤치마크
 */
export async function runVirtualBenchmark(modelId: string): Promise<KVBenchmarkReport> {
  logger.log(`[KVBenchmark] Starting VIRTUAL bench for ${modelId}`);

  // [BUG FIX] startedAtISO는 지연 이전에 기록해야 함
  // 이전: await 이후에 new Date() -> startedAtISO ≈ finishedAtISO (벤치마크 시간 0ms)
  // 수정: 시뮬레이션 시작 직전에 기록
  const startedAtISO = new Date().toISOString();

  // 시뮬레이션 지연 (2초)
  await new Promise<void>(resolve => { setTimeout(resolve, 2000); });

  return {
    modelId,
    startedAtISO,
    finishedAtISO: new Date().toISOString(),
    device: { tier: 'high' },
    summary: {
      avgTtftMs: 420.5 + Math.random() * 50,
      avgTokPerSec: 15.2 + Math.random() * 2,
      successRuns: 3 }
  };
}

/**
 * ✅ [FIX] 실제 TTFT + 토큰/초 측정 구현
 * 이전: ttft/tokPerSec 하드코딩 -> 기기 성능 판정 불가
 * 수정: 각 run에서 첫 토큰 시간(TTFT)과 전체 생성 시간으로 tok/s 계산
 */
export async function runKVTierBenchmark(options: KVBenchmarkOptions): Promise<KVBenchmarkReport> {
  if (options.virtual) {
    return runVirtualBenchmark(options.modelId);
  }

  const modelId    = options.modelId;
  const runs       = options.runs       ?? 3;
  const warmupRuns = options.warmupRuns ?? 1;
  const startedAtISO = new Date().toISOString();

  // [BUG FIX] 벤치마크 전 현재 세션 스냅샷 저장 -> 완료 후 복원
  // [BUG FIX] modelId 기반 경로 사용 — 고정 경로(bench_snap.bin)이면
  // 서로 다른 모델로 벤치마크가 연속 실행될 때 스냅샷이 덮어씌워져
  // 이전 모델 세션 복원 시 포맷 불일치로 loadSession 크래시 가능.
  // 수정: modelId를 파일명에 포함 → 모델별로 격리.
  // [BUG-012 FIX] DocumentDirectory 루트 대신 전용 서브디렉토리 사용.
  // 이전: DocumentDirectoryPath/bench_snap_{modelId}.bin → 루트에 파일 누적,
  //   _gcOrphanTmpFiles가 루트를 스캔하지 않아 crash 잔류 파일 미수거.
  // 수정: /kv_benchmarks/ 서브디렉토리에 저장 → gcTargetDirs에 추가 가능.
  const BENCH_DIR  = `${RNFS.DocumentDirectoryPath}/kv_benchmarks`;
  await RNFS.mkdir(BENCH_DIR).catch(() => {});
  const BENCH_SNAP = `${BENCH_DIR}/bench_snap_${modelId}.bin`;
  let _snapSaved = false;
  // [BUG FIX] 다른 모델이 로드된 경우 BENCH_SNAP은 이전 모델 KV 포맷 →
  // load(modelId) 후 새 모델에서 loadSession(BENCH_SNAP) 시도 시 포맷 불일치 크래시.
  // _snapSavedForSameModel: 같은 모델(모델 교체 없이 벤치마크)일 때만 복원 허용.
  let _snapSavedForSameModel = false;

  try {
  if (llamaEngine.getLoadedModelId() !== modelId) {
    // [BUG-38 FIX] 다른 모델이 로드된 경우에도 현재 세션 스냅샷 저장
    // 저장은 하되, 복원은 하지 않는다 (포맷 불일치 위험).
    // 스냅샷 파일은 finally에서 삭제해 다음 실행 오염 방지.
    if (llamaEngine.getState() === 'ready') {
      _snapSaved = await llamaEngine.saveSession(BENCH_SNAP).then(() => true).catch(() => false);
      _snapSavedForSameModel = false; // 모델이 다르므로 복원 불가
    }
    await llamaEngine.load(modelId);
  } else {
    // 이미 같은 모델이 로드된 경우 → 세션 저장 후 softReset
    _snapSaved = await llamaEngine.saveSession(BENCH_SNAP).then(() => true).catch(() => false);
    _snapSavedForSameModel = _snapSaved; // 같은 모델이므로 복원 가능
    await llamaEngine.softReset([]).catch(() => {});
  }

  // ✅ [FIX] warmupRuns 실제 실행 — JIT/KV 캐시 준비
  for (let i = 0; i < warmupRuns; i++) {
    try {
      await llamaEngine.generate(
        [{ role: 'user', content: BENCH_PROMPT }],
        { maxTokens: 20 },
      );
      logger.log(`[KVBenchmark] Warmup ${i + 1}/${warmupRuns} done`);
    } catch (e) {
      logger.warn(`[KVBenchmark] Warmup ${i + 1} 실패 (무시):`, e);
    }
  }

  // [BUG FIX] warmup -> 실제 측정 전 KV 리셋 누락
  // warmup 완료 후 KV 캐시에 warmup 내용이 남아있는 상태에서 측정하면
  // KV 재사용 효과로 TTFT가 실제보다 짧게 측정 -> 기기 티어 과대 평가.
  // softReset([]): KV flush + 재prefill 없이 빈 컨텍스트 상태로 초기화.
  await llamaEngine.softReset([]).catch(() => {});
  logger.log('[KVBenchmark] Pre-measurement KV reset 완료');

  // ✅ [FIX] 실제 측정 runs
  const ttftList: number[] = [];
  const tokPerSecList: number[] = [];
  let successRuns = 0;

  for (let i = 0; i < runs; i++) {
    // [BUG FIX] 각 run 사이 KV 리셋 누락
    // 이전 run의 KV가 남은 상태에서 다음 run 시작 -> KV 재사용으로 TTFT 단축 -> 측정 부정확.
    // 첫 번째 run(i=0)은 이미 상단에서 softReset 완료 -> 건너뜀.
    if (i > 0) {
      await llamaEngine.softReset([]).catch(() => {});
    }
    try {
      let firstTokenMs: number | null = null;
      let tokenCount = 0;
      const t0 = Date.now();

      await llamaEngine.generate(
        [{ role: 'user', content: BENCH_PROMPT }],
        {
          maxTokens: 50,
          onToken: (_tok: string) => {
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - t0;
            }
            tokenCount++;
          } },
      );

      const totalMs = Date.now() - t0;
      // [BUG FIX #10] totalMs=0 시 Infinity 방지 -> 항상 'high' 오판정
      if (firstTokenMs !== null && tokenCount > 0 && totalMs > 0) {
        ttftList.push(firstTokenMs);
        tokPerSecList.push((tokenCount / totalMs) * 1000);
        successRuns++;
        logger.log(
          `[KVBenchmark] Run ${i + 1}: ttft=${firstTokenMs}ms, ` +
          `tokPerSec=${((tokenCount / totalMs) * 1000).toFixed(1)}`
        );
      }
    } catch (e) {
      logger.warn(`[KVBenchmark] Run ${i + 1} 실패 (무시):`, e);
    }
  }

  const avgTtftMs    = ttftList.length > 0
    ? ttftList.reduce((a, b) => a + b, 0) / ttftList.length
    : 999;
  const avgTokPerSec = tokPerSecList.length > 0
    ? tokPerSecList.reduce((a, b) => a + b, 0) / tokPerSecList.length
    : 0;

  // 티어 판정
  const tier: BenchmarkTier =
    avgTokPerSec >= TIER_THRESHOLDS.HIGH_TOK_PER_SEC ? 'high'
    : avgTokPerSec >= TIER_THRESHOLDS.MID_TOK_PER_SEC  ? 'mid'
    : 'low';

  logger.log(
    `[KVBenchmark] 결과: tier=${tier}, avgTtft=${avgTtftMs.toFixed(1)}ms, ` +
    `avgTokPerSec=${avgTokPerSec.toFixed(1)}, success=${successRuns}/${runs}`
  );

  return {
    modelId,
    startedAtISO,
    finishedAtISO: new Date().toISOString(),
    device: { tier },
    summary: { avgTtftMs, avgTokPerSec, successRuns } };
  } finally {
    // [BUG FIX] 모델 교체 없이 벤치마크한 경우(_snapSavedForSameModel=true)만 복원.
    // 다른 모델이 로드됐던 경우(_snapSavedForSameModel=false)는 KV 포맷 불일치로
    // loadSession이 크래시할 수 있으므로 복원하지 않고 파일만 삭제.
    if (_snapSaved) {
      if (_snapSavedForSameModel) {
        await llamaEngine.loadSession(BENCH_SNAP).catch(() => {});
      }
      await RNFS.unlink(BENCH_SNAP).catch(() => {});
    }
  }
}

declare global {
  var __kvBench: {
    run: (opts: KVBenchmarkOptions) => Promise<KVBenchmarkReport>;
    runVirtual: (modelId: string) => Promise<KVBenchmarkReport>;
  } | undefined;
}

/**
 * ✅ [FIX] __DEV__ guard 추가 — production 빌드에서 globalThis 미노출
 * 이전: 항상 globalThis.__kvBench 설치 -> production APK에서 내부 API 노출
 * 수정: __DEV__ 환경에서만 설치
 */
export function installKVBenchmarkDevApi(): void {
  if (!__DEV__) return;
  globalThis.__kvBench = {
    run: runKVTierBenchmark,
    runVirtual: runVirtualBenchmark };
  logger.log('[KVBenchmark] Dev API installed (DEV only).');
}

export function installKVBenchmarkCommandBridge(): void {
  installKVBenchmarkDevApi();
}
