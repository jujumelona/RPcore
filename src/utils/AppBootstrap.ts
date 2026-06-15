// src/utils/AppBootstrap.ts  v4
// ════════════════════════════════════════════════════════════════════════════════
// 앱 시작 시 1회 실행되어야 하는 초기화 로직 통합
//
// v3 -> v4 변경사항
//   ✅ [Fix #1] WarmState 중복 등록 제거
//      prewarmActiveModel()의 inferenceEngine.onWarmStateChange(warmListener) 제거
//      모델스토어 초기화 + 엔진 이벤트 리스너 부트스트랩
//        이미 다른 곳에서 등록된 EngineEventBus를 구독하도록 변경 -> 중복 방지
//   ✅ [Fix #1] bridgeLlamaEngineWarmState() 제거
//      llamaEngine.onStateChange()로 대체 -> _bootstrapEngineEventListeners에서 처리
//
// v4 -> v5 변경사항
//   ✅ [FIX-OOM] OOM 비상저장 이벤트 수신 등록
//      MainApplication MemoryGuard.register onCritical -> "engine:oom_emergency"
//      -> JS 레이어에서 KV 세션 + chatStore 즉시 flush
//   ✅ [FIX-GC1] gcStaleStories() 미호출 누락 수정
//      30일 TTL GC가 동작하지 않아 실행되지 않던 버그 수정
//   ✅ [FIX-GC2] .tmp 고아 파일 startup 정리 추가
//      OOM kill 시 session.bin.tmp / chapter_N.bin.tmp 잔류 -> 앱 재시작 시 정리
// ════════════════════════════════════════════════════════════════════════════════
export { bootstrapExecutorch } from '../core/llama/ExecutorchEngine';
import { resetAISDKAdapter } from '../core/ai/AISDKAdapter';
import { memoryManager } from '../core/memory/MemoryManager';
import { useModelStore, teardownModelStore } from '../store/modelStore';
import { useChatStore } from '../store/chatStore';
import { registerFlushCallback, stopAppStateListener, startAppStateListener } from './mmkvZustandStorage';
import { teardownDownloadQueue } from './DownloadQueue';
import { teardownDownloadManager } from './ChapterDownloadManager';
import retryQueue from './RetryQueue';
import { closeCacheDB } from './queryPersister';
import { uninstallDevLogCollector } from './DevLogCollector';
import { uninstallRuntimeGuard } from './runtimeGuard';
import { appStorage } from './storage';
import { db } from '../core/sqlite/Database';
import { logger } from './logger';
import { MIGRATION_V1_TO_V2, MIGRATION_V2_TO_V3, MIGRATION_V3_TO_V4, MIGRATION_V4_TO_V5, DB_VERSION } from '../core/sqlite/Schemas';
import { purgeExpiredQueryCache } from './queryPersister';
import kvCacheManager from '../core/llama/KVCacheManager';
import llamaEngine from '../core/llama/LlamaEngine';
import { kvStateManager } from '../core/llama/KVStateManager';
import { SERVER_BASE } from '../config/ApiConfig';
import { PerformanceMonitor } from './PerformanceMonitor';
import networkMonitor from './NetworkMonitor';
import { compressedCache } from './CompressedCache';
import notificationService from '../services/NotificationService';
import { DeviceEventEmitter } from 'react-native';
import RNFS from './fileSystemCompat';
import { installKVBenchmarkDevApi, installKVBenchmarkCommandBridge } from '../core/llama/KVBenchmarkRunner';
import { modelDownloader } from '../core/llama/ModelDownloader';
import { storyAdapterManager } from '../core/llama/StoryAdapterManager';
import { installDevLogCollector, flushDevLog } from './DevLogCollector';
import { engineBusListener } from '../core/llama/EngineEventBus';
import { deviceProfiler } from '../core/llama/DeviceProfiler';
import messageOutbox from '../core/chat/MessageOutbox';
import { AppStability } from './AppStability';
import { memoryLeakGuard } from './MemoryLeakGuard';
import { chapterLogTracker } from './ChapterLogTracker';
import { inferenceEngine } from '../core/native/InferenceEngine';
import { getRuntimeInterferenceReasons, isRuntimeInterferenceSuspended } from './RuntimeInterferenceGuard';
import { useLanguageStore } from '../store/languageStore';

function getSqlErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || '';
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const direct =
      record.message ??
      record.errorMessage ??
      record.nativeMessage ??
      record.description;
    if (typeof direct === 'string') return direct;
    if (record.cause) return getSqlErrorMessage(record.cause);
  }
  return String(error ?? '');
}

function isFtsUnavailableError(error: unknown): boolean {
  const message = getSqlErrorMessage(error).toLowerCase();
  return (
    message.includes('no such module: fts5') ||
    message.includes('no such table: conversations_fts') ||
    message.includes('no such table: main.conversations_fts')
  );
}

function deferStartupWork(
  label: string,
  task: () => Promise<void> | void,
  delayMs: number = 0,
): void {
  setTimeout(() => {
    Promise.resolve()
      .then(task)
      .catch(error => {
        logger.warn(`[AppBootstrap] ${label} deferred init failed (ignored):`, error);
      });
  }, delayMs);
}



// ── AppState flush 등록 ────────────────────────────────────────────────────────

let _flushSetupDone = false;

// ✅ [FIX] DEV 전용 AppState 리스너 subscription 재등록 방지
// initApp()이 HMR 재로드로 재실행되면 이전 리스너가 남아있을 수 있음
// undefined 초기값으로 방어하고 initApp() 내부에서 정리.
let _devAppStateSub: { remove: () => void } | null = null;

// ── [FIX-OOM] OOM 비상저장 이벤트 수신 ───────────────────────────────────────
// MainApplication.kt의 MemoryGuard.register onCritical 콜백이
// "engine:oom_emergency" DeviceEventEmitter 이벤트를 발송.
// JS 레이어에서 이를 수신해 KV 세션 + chatStore 즉시 flush.
//
// 등록은 앱이 다른 곳에서 1회만 실행 (중복 등록으로 인한 중복 flush 방지).
let _oomEmergencySub: { remove: () => void } | null = null;
// [BUG FIX] base.bin 손상 감지 시 자동 재다운로드 리스너
let _cacheCorruptedSub: { remove: () => void } | null = null;
let _staleStoryGcTimer: ReturnType<typeof setTimeout> | null = null;

// ✅ [FIX] setupAppStateFlush()의 unregChat/unregMemory를 모듈 변수에 보관
// teardownApp() 이후 re-init 시 콜백 레지스트리 누적 방지
let _unregFlushChat:   (() => void) | null = null;
let _unregFlushMemory: (() => void) | null = null;
let _unregFlushPerf:   (() => void) | null = null;
let _unregFlushDevLog: (() => void) | null = null;

/**
 * 앱 레벨 이벤트 리스너 전체 해제 (테스트 정리 / 앱 언마운트 시 호출)
 *
 * 일반적으로 React Native에서 OS 프로세스를 직접 kill하지 않으므로
 * 주로 Jest 테스트 정리 / Hot Reload 재기동에서 사용됩니다.
 * App.tsx의 최상단 컴포넌트 unmount useEffect에서 호출하면 이전의 cleanup이 보장됩니다.
 */
export async function teardownApp(): Promise<void> {
  _oomEmergencySub?.remove();
  _oomEmergencySub = null;

  _cacheCorruptedSub?.remove();
  _cacheCorruptedSub = null;

  if (_staleStoryGcTimer !== null) {
    clearTimeout(_staleStoryGcTimer);
    _staleStoryGcTimer = null;
  }

  _devAppStateSub?.remove();
  _devAppStateSub = null;
  PerformanceMonitor.stopContinuousMonitoring();
  PerformanceMonitor.stopFreezeDetection();
  if (PerformanceMonitor._pendingLeakTimerId !== null) {
    clearTimeout(PerformanceMonitor._pendingLeakTimerId);
    PerformanceMonitor._pendingLeakTimerId = null;
  }
  _flushSetupDone = false;

  // ✅ [FIX] mmkvZustandStorage flush 콜백 레지스트리에서 제거 (re-init 시 중복 누적 방지)
  _unregFlushChat?.();
  _unregFlushChat = null;
  _unregFlushMemory?.();
  _unregFlushMemory = null;
  _unregFlushPerf?.();
  _unregFlushPerf = null;
  _unregFlushDevLog?.();
  _unregFlushDevLog = null;

  // ✅ [FIX] mmkvZustandStorage AppState 리스너 해제
  stopAppStateListener();

  // ✅ [FIX] MessageOutbox 정리
  messageOutbox.stop();

  // ✅ [FIX] AppStability 리스너 및 플래그 초기화
  AppStability.uninstall();

  if (__DEV__) {
    try {
      const { teardownBugDetection } = require('./debug');
      teardownBugDetection();
    } catch { /* ignore */ }
  }


  // ── [NEW] 서비스 인스턴스 정리
  notificationService.destroy();
  networkMonitor.stop();
  compressedCache.destroy();

  // [v4 FIX] StreamingManager 스트리밍 중단
  llamaEngine.stopGeneration().catch(() => {});

  // ✅ [FIX] RAM 모니터링 중단
  memoryLeakGuard.stop();

  // ✅ [FIX] MemoryManager 및 임베딩 엔진 정리
  await memoryManager.destroy();

  teardownModelStore();

  teardownDownloadManager();

  // ✅ [FIX] DownloadQueue 리스너 해제
  teardownDownloadQueue();

  // ✅ [FIX] RetryQueue 정리
  retryQueue.stop();

  // ✅ [FIX] InferenceEngine 정리
  inferenceEngine.cleanup().catch(() => {});

  // ✅ [FIX] ChapterLogTracker 정리 (모든 쓰기 완료 후 리셋)
  try {
    await chapterLogTracker.flushAll(500);
    chapterLogTracker.reset();
  } catch { /* ignore */ }

  await closeCacheDB();
  if (__DEV__) {
    uninstallDevLogCollector();
  }
  uninstallRuntimeGuard();

  resetAISDKAdapter();

  logger.log('[AppBootstrap] teardownApp: 모든 리스너 및 타이머 해제 완료');
}

function _setupOomEmergencyHandler(): void {
  // ✅ [FIX] guard(return) -> remove-and-re-register 방식으로 변경
  // 이전: if (_oomEmergencySub) return -> HMR 재로드 시 이전에 새로 생성되면
  //       _oomEmergencySub = null(초기값)이라 guard를 통과 -> 이전 리스너를 해제하지 않아 남음
  //       -> 리스너가 중복되어 DeviceEventEmitter에서 이벤트 발생 시 두 번 호출
  // 수정: 항상 이전 리스너는 먼저 해제 -> 새 등록 시 리스너는 항상 1개만 존재.
  _oomEmergencySub?.remove();
  _oomEmergencySub = null;

  _oomEmergencySub = DeviceEventEmitter.addListener('engine:oom_emergency', () => {
    if (isRuntimeInterferenceSuspended()) {
      logger.warn(
        `[AppBootstrap] OOM emergency flush skipped by runtime guard: ${getRuntimeInterferenceReasons().join(', ')}`,
      );
      return;
    }
    logger.warn('[AppBootstrap]  OOM 비상저장 ?? KV + Chat 즉시 flush');

    // ── chatStore: 디바운스 만료 이전 대기 중인 저장 AsyncStorage 기록
    //   500ms 디바운스 만료 전에 남은 메시지를 잃지 않기 위한 비상 처리.
    useChatStore.getState().flushPending().catch(e =>
      logger.warn('[AppBootstrap] OOM flush - chatStore 에러 (무시):', e),
    );

    // ── KV 세션 즉시 저장 (프로세스 kill 대비)
    //   AppState background를 기다릴 수 없는 비상 상황이므로 즉시 저장 실행.
    const storyId = useChatStore.getState().recentStoryId;
    if (storyId) {
      kvStateManager.stopAndSave(storyId).catch(() => {});
    }

    // ── memoryManager: 진행 중인 요약/임베딩 완료 보장
    //   임베딩 이후 kill 시 잔류한 임베딩의 DB 데이터 손실 방지.
    memoryManager.awaitFlush().catch(() => {});

    // ── KV 세션은 KVStateManager가 AppState background 이벤트로 자동 처리.
    //   OOM kill 시 OS가 TRIM_MEMORY_RUNNING_CRITICAL -> onTrimMemory ->
    //   MemoryGuard onCritical에서 발송하므로 KV 저장은 별도 처리 없이 chatStore flush만 수행.
    // [UPDATE] OS가 AppState 이벤트를 보내기 전 죽을 수 있으므로 위에서 stopAndSave를 명시적으로 실행함.
  });

  logger.log('[AppBootstrap] OOM 비상저장 이벤트 리스너 등록 완료');
}

/**
 * 매 턴 AppState background flush 콜백 등록
 *
 * AppState가 'background'/'inactive'로 전환되면
 * 등록된 모든 콜백을 순서대로 실행하여 진행 중인 상태를 즉시 flush.
 *
 * 호출 시점: initApp() 내부에서 자동 실행 (중복 등록 방지).
 */
function setupAppStateFlush(): void {
  if (_flushSetupDone) return;
  _flushSetupDone = true;

  // ── chatStore: 디바운스(500ms) 보류 저장 즉시 flush ─────────────────────
  // chatStore는 Zustand persist 미들웨어를 사용하지 않고
  // 자체 debounce+writeQueue 방식으로 AsyncStorage에 저장.
  // background 진입 시 플러시해야 마지막 대화 내용 보존.
  _unregFlushChat = registerFlushCallback(() => {
    useChatStore.getState().flushPending().catch(e =>
      logger.warn('[AppBootstrap] chatStore flush 에러 (무시):', e),
    );
  });

  // ── memoryManager: 진행 중인 요약/임베딩 백그라운드 작업 완료 보장 ─────
  // ✅ [FIX] background 전환 시 awaitFlush() 미등록 문제 수정.
  // MemoryManager.awaitFlush() 주석("AppState 'background' 전환 이벤트에서 호출")대로
  // 등록되어야 하는데 누락되어 있었음.
  // 미등록 시 -> 요약/임베딩 작업 완료 후 background 진입 시 JS 쓰레드가 일시 중지
  // 작업 완료 후 DB에 기록하는 내용이 저장 안 됨
  _unregFlushMemory = registerFlushCallback(() =>
    memoryManager.awaitFlush().catch(e =>
      logger.warn('[AppBootstrap] memoryManager flush 에러 (무시):', e),
    ),
  );

  // ── PerformanceMonitor: DEV 연속 모니터링 background 진입 시 일시 중지 ──
  // ✅ [FIX] startContinuousMonitoring()은 DEV 전용(if (!__DEV__) return)이지만
  //   stopContinuousMonitoring()
  //   -> background 상태에서 실행되는 불필요한 CPU/메모리 모니터링.
  //   -> foreground 복귀 시 startContinuousMonitoring()으로 재시작 (HMR 중복 등록 방지).
  if (__DEV__) {
    _unregFlushPerf = registerFlushCallback(() => {
      PerformanceMonitor.stopContinuousMonitoring();
    });
  }

  // ── modelStore: MMKV 직접 저장 -> 동기 API -> 별도 flush 불필요
  // ── settingsStore: MMKV 직접 동기 저장 -> 별도 flush 불필요
  //    새 persist 스토어 추가 시 아래에 registerFlushCallback() 호출 추가할 것
  //    예시: registerFlushCallback(() => useNewStore.getState().flush())

  logger.log('[AppBootstrap] AppState flush 콜백 등록 완료');

  // ✅ [FIX] _unregFlushChat / _unregFlushMemory 모듈 변수에 저장됨
  // teardownApp() 호출 시 _flushRegistry에서 제거하여 콜백 누적 방지
}

// ── [FIX-GC2] .tmp 고아 파일 startup 정리 ──────────────────────────────────
//
// OOM kill 시나리오:
//   saveSession(session.bin.tmp) 완료 -> [OOM KILL] -> moveFile 미실행
//   -> 다음 실행: session.bin 없음 (정상 복원 불가)
//
// 정상 종료 시나리오:
//   saveSession + moveFile 모두 성공 -> .tmp 없음 (문제 없음)
//
// 이 함수는 앱 시작 시 kv_cache 디렉토리의 *.tmp 파일을 모두 삭제.
// 삭제해도 안전한 이유: .tmp는 항상 session.bin / chapter_N.bin의 임시 복사본
// moveFile이 완료됐다면 .tmp는 이미 없음. .tmp가 있다면 그것은 손상된 파일이므로
// 정리해야 다음 실행 시 올바른 복원 가능.
async function _gcOrphanTmpFiles(): Promise<void> {
  try {
    const base = RNFS.DocumentDirectoryPath;
    const gcTargetDirs = [
      `${base}/kv_cache`,
      `${base}/kv_core_snapshots`,
      `${base}/kv_prefix_checkpoints`,
      `${base}/kv_offsets`,
      `${base}/llama_sessions`,
      `${base}/models`,  // [FIX] warmup_session.bin.tmp, kv_base.bin.tmp 등 모델 디렉토리 .tmp 수거
      // [BUG-012/034 FIX] KVBenchmarkRunner 전용 디렉토리 추가
      `${base}/kv_benchmarks`,
    ];

    let removed = 0;

    for (const kvBase of gcTargetDirs) {
      const baseExists = await RNFS.exists(kvBase).catch(() => false);
      if (!baseExists) continue;

      const storyDirs = await RNFS.readDir(kvBase);

      for (const dir of storyDirs) {
        // [BUG FIX] isDirectory() 체크만 있어 루트에 직접 있는 .tmp 파일을 놓침
        // llama_sessions/*.bin.tmp, kv_prefix_checkpoints/*.bin.tmp,
        // kv_core_snapshots/*.bin.tmp 는 서브디렉토리 없이 루트에 직접 위치함.
        // 수정: 파일이면 직접 삭제 체크, 디렉토리면 내부 파일 스캔 (기존 동작 유지)
        if (!dir.isDirectory()) {
          if (dir.name.endsWith('.tmp')) {
            await RNFS.unlink(dir.path).catch(() => {});
            removed++;
            logger.log(`[AppBootstrap] .tmp 고아 파일 삭제 (루트): ${dir.name}`);
          }
          continue;
        }
        try {
          const files = await RNFS.readDir(dir.path);
          for (const f of files) {
            if (f.name.endsWith('.tmp')) {
              await RNFS.unlink(f.path).catch(() => {});
              removed++;
              logger.log(`[AppBootstrap] .tmp 고아 파일 삭제: ${dir.name}/${f.name}`);
            }
          }
        } catch { /* 스토리 디렉토리 목록 실패 ?? 다음 스토리로 */ }
      }
    }

    if (removed > 0) {
      logger.log(`[AppBootstrap] GC: .tmp 고아 파일 ${removed}개 삭제 완료`);
    }

    // [BUG-034 FIX] DocumentDirectoryPath 루트 직접 스캔 추가.
    // 이전: gcTargetDirs 서브디렉토리만 스캔 → 루트에 생성된 .tmp 파일 미수거
    //   예: bench_snap_{modelId}.bin.tmp (BUG-033), pre_core.bin.tmp 등
    // 수정: 루트의 .tmp 파일도 수거
    try {
      const rootEntries = await RNFS.readDir(base).catch(() => []);
      for (const f of rootEntries) {
        if (!f.isDirectory() && f.name.endsWith('.tmp')) {
          await RNFS.unlink(f.path).catch(() => {});
          logger.log(`[AppBootstrap] .tmp 루트 고아 파일 삭제: ${f.name}`);
        }
      }
    } catch { /* 루트 스캔 실패 무시 */ }
  } catch (e) {
    logger.warn('[AppBootstrap] .tmp GC 실패 (무시):', e);
  }
}

// ── 앱 레벨 초기화 ──────────────────────────────────────────────────────────

/**
 * 앱 레벨 비동기 초기화.
 * App.tsx useEffect에서 호출
 */
export async function initApp(): Promise<void> {
  try {
    logger.log('[AppBootstrap] ✅ 초기화 시작...');

    // [NEW] AppState 리스너 재활성화 (teardown 시 차단된 플래그 해제)
    startAppStateListener();

    // 1. AppState flush 등록 (모든 캐시 저장 이전에 가장 먼저 -> background 진입 대비)
    setupAppStateFlush();

    // 2. OOM 비상저장 이벤트 리스너 등록
    // MainApplication.kt MemoryGuard.register onCritical -> "engine:oom_emergency"
    _setupOomEmergencyHandler();

    // ── [FIX] 기기 성능 측정 (Device Profiling) ─────────────────────────────
    // 앱 초기화 단계에서 1회 측정하여 성능 티어를 결정.
    // ChatScreen 진입 시 모델별 최적의 파라미터(context-size 등) 선택에 사용됨.
    deviceProfiler.measure().catch(e => logger.warn('[AppBootstrap] profiling failed:', e));

    // ── [FIX] RAM 모니터링 (MemoryLeakGuard) 시작 ──────────────────────────
    // 크래시 덤프 및 RAM 누수 감지에 사용됨. 15초 주기로 샘플 수집.
    memoryLeakGuard.start({
      intervalMs: 15_000,
      pressureThresholdMB: 800,  // RAM 800MB 이하 시 pressure 콜백
      criticalThresholdMB: 400,  // RAM 400MB 이하 시 critical 콜백
    }, {
      onPressure: (info) => logger.warn(`[AppBootstrap] Memory Pressure: ${info.availableMB}MB left`),
      onCritical: (info) => logger.error(`[AppBootstrap] Memory Critical: ${info.availableMB}MB left!`),
      onLeakSuspected: (info) => logger.warn(`[AppBootstrap] Leak Suspected: dropped ${info.dropMB}MB in 2min`) });

    // [BUG FIX] base.bin 손상 감지 시 자동 재다운로드 리스너 등록.
    // WarmupManager가 base.bin 손상 시 emitCacheCorrupted({ cacheType: 'base' })를 발송.
    // 수신 후 백그라운드에서 re-download 시도 → 다음 실행부터 TTFT 정상화.
    _cacheCorruptedSub?.remove();
    _cacheCorruptedSub = engineBusListener.onCacheCorrupted((payload) => {
      // [BUG FIX #66] payload.modelId 사용 — activeModelId와 다를 경우에도 대응 가능
      const targetModelId = payload.modelId || useModelStore.getState().activeModelId;
      if (payload.cacheType === 'base' && targetModelId) {
        kvCacheManager.downloadBaseKVIfNeeded(targetModelId, SERVER_BASE).catch(() => {});
      }
    });

    // ── [DEV] 통합 로그 수집기 설치 ──────────────────────────────────────────
    // RAM누수 / KV흐름 / 크래시를 하나의 파일(dev_unified.log)에 모읍니다.
    // 릴리즈에서는 __DEV__ 가드로 완전 no-op.
    if (__DEV__) {
      installDevLogCollector();
    }

    // ── NetworkMonitor 시작 ──────────────────────────────────────────────────
    // ✅ [FIX] start()가 어디서도 호출되지 않던 버그 수정.
    // start() 없이는 NetInfo.addEventListener가 연결되지 않아
    // useNetworkStatus() 훅이 네트워크 변화를 수신하지 못함.
    // ※ [RE-FIX] addListener()로 등록한 콜백들이 이벤트를 받지 못하고 누적되는
    //   문제를 방지하기 위해, 모든 리스너 등록(DownloadQueue 등)보다 먼저 실행.
    networkMonitor.start();

    // ── NotificationService 초기화 ───────────────────────────────────────────
    // FCM 토큰 발급, 권한 요청, 포그라운드/백그라운드 알림 처리
    deferStartupWork('notification-service', async () => {
      await notificationService.initialize(
        async (token, lang) => {
          try {
            const { authedFetch } = await import('./authedFetch');
            await authedFetch(`${SERVER_BASE}/api/push/register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, language: lang }),
            });
          } catch (e) {
            logger.warn('[AppBootstrap] FCM token server registration failed:', e);
          }
        },
      );
    }, 120);

    // ✅ [FIX] MessageOutbox 시작
    // networkMonitor.start() 이후에 등록하여 첫 이벤트를 놓치지 않도록 보장
    // 초기에는 빈 함수나 null로 시작한 뒤 나중에 setSendFn 등으로 보정 가능.
    // 여기서는 일단 기본 싱글턴 flow를 활성화함.
    messageOutbox.start(async () => {
      logger.warn('[AppBootstrap] MessageOutbox pre-start: no sendFn yet');
      return false;
    });

    // ── [DEV] 연속 모니터링 자동 시작 ─────────────────────────────────────
    if (__DEV__) {
      PerformanceMonitor.startContinuousMonitoring();
    }


    // ✅ [FIX] RetryQueue 시작
    retryQueue.start();

    // [FIX] 앱 재시작 후 OS 큐에 남은 다운로드 복구
    // ModelDownloader.recoverActiveDownloads()는 initApp() 1회 호출 필수
    modelDownloader.recoverActiveDownloads().catch(e =>
      logger.warn('[AppBootstrap] recoverActiveDownloads 실패 (무시):', e),
    );

    // ── [FIX #1] DB 스키마 마이그레이션 ─────────────────────────────────────
    // MIGRATION_V1_TO_V2가 Schemas.ts에 정의되어 있었지만 실행 코드가 없던 버그 수정.
    // 기존 사용자: conversations_vec 256차원 -> 768차원 INSERT 시 오류 ->
    // 벡터 검색 전체가 조용히 고장나는 상황. 이 블록이 유일한 실행 지점.
    try {
      const savedVerStr = appStorage.getString('db_version') || db.getGlobalState('db_version');
      // [BUG FIX] '0' 또는 NaN 대응: Number.isNaN과 기본값 1 적용
      const parsedVer = parseInt(savedVerStr ?? '', 10);
      const storageVer = Number.isNaN(parsedVer) ? 1 : parsedVer;
      let pragmaVer = 0;
      try {
        pragmaVer = db.queryRaw<{ user_version?: number }>('PRAGMA user_version')[0]?.user_version ?? 0;
      } catch {
        pragmaVer = 0;
      }
      const savedVer = Math.max(storageVer, pragmaVer);
      if (savedVer < DB_VERSION) {
        logger.log(`[AppBootstrap] DB 마이그레이션: v${savedVer} ?? v${DB_VERSION}`);
        // [BUG-19 FIX] currentVer로 단계별 추적 — savedVer는 불변이므로
        // v1 DB에서 savedVer < 3 체크 시 v1->v2를 건너뛰고 바로 v2->v3만 실행하는 버그 수정
        // 기존: if (savedVer < 2) ... if (savedVer < 3) 두 블록 모두 savedVer 기준으로 체크
        //       -> v1 DB에서 v1->v2 완료 후에도 savedVer는 여전히 1 -> v2->v3도 실행됨 (정상)
        //       하지만 v1->v2 실패(duplicate column 에러) 시 currentVer가 2로 올라가지 않아
        //       v2->v3를 건너뜀. currentVer 추적으로 각 단계를 순서대로 정확히 제어.
        // [BUG FIX] forEach 내 SQL이 'duplicate column' 오류를 던지면 outer catch로 점프해
        // db_version이 저장되지 않고 다음 앱 실행 시 동일 마이그레이션이 재시도됨.
        // 각 SQL을 개별 try-catch로 감싸 무해한 오류는 무시하고 계속 진행.
        const runMigrationSql = async (sqls: string[], label: string): Promise<void> => {
          for (const sql of sqls) {
            try {
              await db.runRaw(sql);
            } catch (sqlErr: unknown) {
              const msg = getSqlErrorMessage(sqlErr);
              if (
                msg.toLowerCase().includes('duplicate column') ||
                msg.toLowerCase().includes('already exists')
              ) {
                logger.log(`[AppBootstrap] ${label} SQL skipped: ${msg}`);
              } else if (isFtsUnavailableError(sqlErr) && /fts5|conversations_fts/i.test(sql)) {
                logger.log(`[AppBootstrap] ${label} FTS SQL skipped: ${msg}`);
              } else {
                logger.warn(`[AppBootstrap] ${label} SQL failed, continuing: ${msg}`);
              }
            }
          }
        };

        const hasFtsTableNow = (): boolean =>
          db.queryRaw<{ name?: string }>(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations_fts' LIMIT 1`,
          )[0]?.name === 'conversations_fts';

        const dropOrphanFtsTriggers = async (label: string): Promise<void> => {
          for (const triggerName of ['conv_ai_fts', 'conv_ad_fts', 'conv_au_fts']) {
            try {
              await db.runRaw(`DROP TRIGGER IF EXISTS ${triggerName}`);
            } catch (sqlErr: unknown) {
              logger.warn(
                `[AppBootstrap] ${label} failed to drop orphan trigger ${triggerName}: ${getSqlErrorMessage(sqlErr)}`
              );
            }
          }
        };

        const runFtsMigration = async (label: string): Promise<boolean> => {
          const [createSql, ...restSql] = MIGRATION_V4_TO_V5;
          if (!createSql) return false;

          if (!hasFtsTableNow()) {
            await dropOrphanFtsTriggers(`${label}:cleanup`);
          }

          await runMigrationSql([createSql], `${label}:create`);
          if (!hasFtsTableNow()) {
            logger.warn(`[AppBootstrap] ${label} incomplete: conversations_fts missing after create`);
            return false;
          }

          if (restSql.length > 0) {
            await runMigrationSql(restSql, `${label}:rest`);
          }

          return hasFtsTableNow();
        };

        let currentVer = savedVer;
        if (currentVer < 2) {
          await runMigrationSql(MIGRATION_V1_TO_V2, 'v1→v2');
          currentVer = 2;
          db.setGlobalState('db_version', String(currentVer));
          logger.log('[AppBootstrap] DB migration v1->v2 complete');
        }
        if (currentVer < 3) {
          await runMigrationSql(MIGRATION_V2_TO_V3, 'v2→v3');
          currentVer = 3;
          db.setGlobalState('db_version', String(currentVer));
          logger.log('[AppBootstrap] DB migration v2->v3 complete (vector_memories created)');
        }
        if (currentVer < 4) {
          await runMigrationSql(MIGRATION_V3_TO_V4, 'v3→v4');
          currentVer = 4;
          db.setGlobalState('db_version', String(currentVer));
          logger.log('[AppBootstrap] DB migration v3->v4 complete (client_id column added)');
        }
        if (currentVer < 5) {
          const hasFtsTable = await runFtsMigration('v4->v5');
          if (hasFtsTable) {
            currentVer = 5;
            db.setGlobalState('db_version', String(currentVer));
            logger.log('[AppBootstrap] DB migration v4->v5 complete (FTS5 conversations_fts added)');
          } else {
            logger.warn('[AppBootstrap] DB migration v4->v5 incomplete: conversations_fts missing');
          }
        }
        // Persist the final schema version after any startup migration retries.
        appStorage.set('db_version', String(currentVer));
        db.setGlobalState('db_version', String(currentVer));
      }

      const hasStartupFtsTable =
        db.queryRaw<{ name?: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations_fts' LIMIT 1`,
        )[0]?.name === 'conversations_fts';
      if (!hasStartupFtsTable) {
        logger.warn('[AppBootstrap] conversations_fts missing on startup, retrying FTS migration');
        for (const triggerName of ['conv_ai_fts', 'conv_ad_fts', 'conv_au_fts']) {
          try {
            await db.runRaw(`DROP TRIGGER IF EXISTS ${triggerName}`);
          } catch (sqlErr: unknown) {
            logger.warn(
              `[AppBootstrap] startup cleanup failed for ${triggerName}: ${getSqlErrorMessage(sqlErr)}`,
            );
          }
        }

        const [createSql, ...restSql] = MIGRATION_V4_TO_V5;
        if (createSql) {
          try {
            await db.runRaw(createSql);
          } catch (sqlErr: unknown) {
            const msg = getSqlErrorMessage(sqlErr);
            if (!isFtsUnavailableError(sqlErr) && !msg.toLowerCase().includes('already exists')) {
              logger.warn(`[AppBootstrap] startup FTS create failed: ${msg}`);
            }
          }

          const hasFtsAfterCreate =
            db.queryRaw<{ name?: string }>(
              `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations_fts' LIMIT 1`,
            )[0]?.name === 'conversations_fts';

          if (hasFtsAfterCreate) {
            for (const sql of restSql) {
              try {
                await db.runRaw(sql);
              } catch (sqlErr: unknown) {
                const msg = getSqlErrorMessage(sqlErr);
                if (
                  !isFtsUnavailableError(sqlErr) &&
                  !msg.toLowerCase().includes('already exists') &&
                  !msg.toLowerCase().includes('duplicate')
                ) {
                  logger.warn(`[AppBootstrap] startup FTS step failed: ${msg}`);
                }
              }
            }
          }
        }
      }
    } catch (migErr) {
      // 마이그레이션 실패해도 앱은 계속 동작 — 벡터 검색 기능 비정상 가능성 기록
      logger.error('[AppBootstrap] DB 마이그레이션 실패 (벡터 검색 기능 비정상 가능):', migErr);
    }

    // ── [FIX-GC1] KV 만료 스토리 GC ──────────────────────────────────────────
    // [BUG FIX #38] GC를 setTimeout으로 지연 실행 — prewarmActiveModel()이 KV 파일을
    // 읽는 시점과 gcStaleStories()가 삭제하는 시점이 겹치면 파일 충돌 위험.
    // 5초 지연으로 prewarm이 먼저 완료되도록 보장.
    if (_staleStoryGcTimer !== null) {
      clearTimeout(_staleStoryGcTimer);
    }
    _staleStoryGcTimer = setTimeout(() => {
      _staleStoryGcTimer = null;
      kvStateManager.gcStaleStories().catch(e =>
        logger.warn('[AppBootstrap] KV 만료 스토리 GC 실패 (무시):', e),
      );
    }, 5000);

    // ── [FIX-GC2] .tmp 고아 파일 정리 + DEV 로그 ────────────────────────────
    _gcOrphanTmpFiles().catch(e =>
      logger.warn('[AppBootstrap] .tmp GC 실패 (무시):', e),
    );

    // ── [DEV] background 진입 시 로그 flush ──────────────────────────────────
    if (__DEV__) {
      _unregFlushDevLog = registerFlushCallback(() => { flushDevLog().catch(() => {}); });
    }

    // ── [FIX #5] 만료 세션 파일 백그라운드 GC ──────────────────────────────
    // tryLoadSession()은 해당 스토리 오픈 시에만 만료 체크 -> 미플레이 스토리 세션 누적.
    // 앱 시작 시 1회 비동기 실행 (UI 블로킹 없음).
    // [BUG-17 FIX] React Query 캐시 만료분 정리
    purgeExpiredQueryCache().catch(() => {});

    // 3. DB + 메모리 관리 초기화
    // VectorSearch는 MemoryManager.initialize() 내부에서 1회 준비한다.
    deferStartupWork('memory-manager', async () => {
      await memoryManager.initialize();
    }, 220);

    // ✅ [v2] Local-First 동기화 초기화 — 오프라인 큐 + D1 연동
    try {
      const { configureLegendSync } = require('../core/sync/SyncAdapter') as {
        configureLegendSync: (config: { baseUrl: string; getAuthToken: () => string | null; isOnline?: () => boolean }) => void;
      };
      configureLegendSync({
        baseUrl: SERVER_BASE,
        getAuthToken: () => {
          try {
            const { useAuthStore } = require('../store/authStore') as {
              useAuthStore: { getState: () => { token: string | null } };
            };
            return useAuthStore.getState().token;
          } catch { return null; }
        },
        isOnline: () => networkMonitor.getStatus().isConnected });
      logger.log('[AppBootstrap] ✅ SyncAdapter 초기화 완료');
    } catch (syncErr) {
      logger.warn('[AppBootstrap] SyncAdapter 초기화 실패 (무시):', syncErr);
    }

    logger.log('[AppBootstrap] ✅✅ 초기화 완료');

    // ── DEV 전용: 벤치마크/로그 도구만 등록 ────────────────────────────────
    // 연속 RAM 모니터링은 dev client 시작 직후 발열을 크게 만들 수 있어
    // 자동 시작하지 않고 필요 시 수동으로만 켠다.
    if (__DEV__) {
      installKVBenchmarkDevApi();
      installKVBenchmarkCommandBridge();
    }
  } catch (e) {
    logger.error('[AppBootstrap] 초기화 에러:', e);
  }
}

/**
 * 현재 사용 중인 모델 로딩 (ChatScreen 진입 시 호출)
 *
 * 모델은 실제 채팅 시작 시에만 로드 — 앱 시작 / foreground 복귀 시 선점 없음.
 * 이미 ready 상태면 즉시 반환.
 */
// ✅ [FIX] prewarmActiveModel 동시 실행 방지
let _isPrewarming = false;

export async function prewarmActiveModel(): Promise<void> {
  if (_isPrewarming) {
    logger.log('[AppBootstrap] prewarm: 이미 진행 중, 스킵');
    return;
  }
  _isPrewarming = true;
  try {
    const { activeModelId, downloadedModels, setEngineWarmState } = useModelStore.getState();

    if (!activeModelId) {
      logger.log('[AppBootstrap] prewarm: 활성 모델 없음, 스킵');
      return;
    }
    const isDownloaded = downloadedModels.some(m => m.id === activeModelId);
    if (!isDownloaded) {
      logger.log(`[AppBootstrap] prewarm: "${activeModelId}" 미다운로드, 스킵`);
      return;
    }
    if (llamaEngine.getState() === 'ready' && llamaEngine.getLoadedModelId() === activeModelId) {
      logger.log('[AppBootstrap] prewarm: 이미 준비 완료');
      setEngineWarmState('ready');
      return;
    }

    logger.log(`[AppBootstrap] prewarm: "${activeModelId}" 모델 워밍업 시작`);

    // [BUG-15 FIX] KV 버전 퍼지를 모델 초기화 이전에 실행해야 함.
    // 이전: initializeFromModelId → WarmupManager.warmup()이 구버전 base.bin 로드 후 퍼지 실행
    //       → 이미 오염된 KV 상태로 워밍업이 진행됨.
    // 수정: 먼저 퍼지 → 그 다음 초기화.
    await kvCacheManager.checkVersionAndPurgeIfNeeded(activeModelId).catch(e =>
      logger.warn('[AppBootstrap] KV version purge failed (ignored):', e),
    );

    await llamaEngine.load(activeModelId);

    // ── CI 생성 base.bin 백그라운드 다운로드 ────────────────────────────────
    // prewarm 완료(모델 초기화) 직후 base.bin을 조용히 내려받음.
    // await 없이 실행 — 네트워크 지연이 워밍업 시간에 영향 없음.
    // 성공: 다음 앱 시작부터 _warmup()이 base.bin을 우선 사용 -> TTFT 단축
    // 실패: warn 로그만 남기고 무시 (이전의 warmup_session 폴백)

    kvCacheManager.downloadBaseKVIfNeeded(activeModelId, SERVER_BASE).then(ok => {
      if (ok) logger.log(`[AppBootstrap] base KV 준비 완료: ${activeModelId}`);
    }).catch(e => logger.warn('[AppBootstrap] base KV 다운로드 실패 (무시):', e));

    const adapterLanguage = useLanguageStore.getState().appLanguage;
    storyAdapterManager.ensureLanguageAdapterPack({
      modelId: activeModelId,
      language: adapterLanguage,
      serverUrl: SERVER_BASE,
      bestEffort: true,
    }).then(manifest => {
      logger.log(
        `[AppBootstrap] story adapter language pack prepared: ${manifest.modelId}/${manifest.language}`,
      );
    }).catch(e => logger.warn('[AppBootstrap] story adapter prefetch failed (ignored):', e));

    logger.log('[AppBootstrap] prewarm: 완료');
  } catch (e) {
    logger.warn('[AppBootstrap] prewarm 실패 (무시 ?? ChatScreen에서 재시도):', e);
    useModelStore.getState().setEngineWarmState('idle');
  } finally {
    _isPrewarming = false;
  }
}
