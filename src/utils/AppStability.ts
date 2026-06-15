import { appStorage } from './storage';

import { AppState, type AppStateStatus } from 'react-native';

import llamaEngine from '../core/llama/LlamaEngine';
import { memoryManager } from '../core/memory/MemoryManager';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useModelStore } from '../store/modelStore';
import { flushCrashLogs } from './crashLogger';
import { logger } from './logger';
// [BUG FIX] flushAll 미호출 수정 — background 전환 시 진행 중 로그 파일 쓰기 완료 보장
import { chapterLogTracker } from './ChapterLogTracker';
import { getRuntimeInterferenceReasons, isRuntimeInterferenceSuspended } from './RuntimeInterferenceGuard';

type LifecyclePhase = 'active' | 'background' | 'inactive';

interface LifecycleSnapshot {
  phase: LifecyclePhase;
  updatedAt: string;
  recentStoryId: string | null;
  activeModelId: string | null;
  loadedModelId: string | null;
  engineState: string;
  userId: string | null;
}

const LIFECYCLE_KEY = '@app_stability:lifecycle_v1';

let installed = false;
let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let lastAppState: AppStateStatus = AppState.currentState;

function buildSnapshot(phase: LifecyclePhase): LifecycleSnapshot {
  const chatState = useChatStore.getState();
  const modelState = useModelStore.getState() as { activeModelId?: string | null };
  const authState = useAuthStore.getState();

  return {
    phase,
    updatedAt: new Date().toISOString(),
    recentStoryId: chatState.recentStoryId ?? null,
    activeModelId: modelState.activeModelId ?? null,
    loadedModelId: llamaEngine.getLoadedModelId?.() ?? null,
    engineState: String(llamaEngine.getState?.() ?? 'unknown'),
    userId: authState.user?.id ?? null };
}

// ✅ [FIX] async 변환 — 하단에서 .catch()를 호출하는데 void 반환 시
// "Cannot read properties of undefined (reading 'catch')" 크래시 발생
async function persistSnapshot(phase: LifecyclePhase): Promise<void> {
  appStorage.set(LIFECYCLE_KEY, JSON.stringify(buildSnapshot(phase)));
}

async function flushForSuspend(phase: Extract<LifecyclePhase, 'background' | 'inactive'>): Promise<void> {
  // [BUG FIX] await 없이 호출하면 예외를 catch 불가 → unhandled rejection 가능
  try { await persistSnapshot(phase); } catch (error) {
    logger.warn('[AppStability] failed to persist suspend snapshot:', error);
  }

  if (isRuntimeInterferenceSuspended()) {
    logger.log(
      `[AppStability] suspend flush skipped (${phase}) — runtime guard active: ${getRuntimeInterferenceReasons().join(', ')}`,
    );
    return;
  }

  const results = await Promise.allSettled([
    useChatStore.getState().flushPending(),
    memoryManager.awaitFlush(),
    llamaEngine.stopGeneration().catch(() => {}),
    flushCrashLogs(),
    // [BUG FIX] chapterLogTracker.flushAll() 미호출 수정
    // background 전환 시 진행 중인 파일 쓰기가 완료되지 않으면 마지막 로그 라인 유실
    chapterLogTracker.flushAll(),
  ]);
  // ✅ [BUG FIX] allSettled 결과 미검사 수정 — 실패 시 데이터 유실을 감지 불가했던 문제 수정
  // 기존: Promise.allSettled 결과를 무시 → flushPending 실패해도 로그조차 없어 디버그 불가
  // 수정: rejected 결과를 warn 레벨로 기록 (앱 동작은 계속, 로그로 추적 가능)
  const labels = ['flushPending', 'awaitFlush', 'stopGeneration', 'flushCrashLogs', 'chapterLogTracker'];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.warn(`[AppStability] flushForSuspend.${labels[i]} 실패:`, r.reason);
    }
  });
}

async function detectUncleanExit(): Promise<void> {
  try {
    const raw = appStorage.getString(LIFECYCLE_KEY) ?? null;
    if (!raw) return;

    const previous = JSON.parse(raw) as LifecycleSnapshot | null;
    if (!previous || previous.phase !== 'active') return;

    // ✅ [FIX] logger.warn으로 변경 — 정상적인 OS kill이나 개발 중 재시작에서도
    // 발생하는 의사(false positive) 에러. BugDetector global handler를 트리거하지 않도록
    // recordCrash(Error) 대신 warn 레벨 로그만 기록.
    logger.warn('[AppStability] Previous session ended without clean background transition', {
      phase: previous.phase,
      userId: previous.userId,
      engineState: previous.engineState,
      updatedAt: previous.updatedAt });
  } catch (error) {
    logger.warn('[AppStability] unclean-exit detection failed:', error);
  }
}

export async function installAppStabilityGuard(): Promise<void> {
  if (installed) return;
  installed = true;

  await detectUncleanExit();
  await persistSnapshot('active').catch(error => {
    logger.warn('[AppStability] failed to persist active snapshot:', error);
  });

  lastAppState = AppState.currentState;
  appStateSub?.remove();
  appStateSub = AppState.addEventListener('change', nextState => {
    const previousState = lastAppState;
    lastAppState = nextState;

    if (nextState === 'background' || nextState === 'inactive') {
      flushForSuspend(nextState).catch(error => {
        logger.warn('[AppStability] suspend flush failed:', error);
      });
      return;
    }

    if (nextState === 'active' && (previousState === 'background' || previousState === 'inactive')) {
      if (__DEV__) {
        try {
          const { PerformanceMonitor } = require('./PerformanceMonitor');
          PerformanceMonitor.startContinuousMonitoring();
        } catch { /* ignore */ }
      }
      persistSnapshot('active').catch(error => {
        logger.warn('[AppStability] failed to persist foreground snapshot:', error);
      });
    }
  });

  logger.log('[AppStability] installed');
}

export function uninstallAppStabilityGuard(): void {
  appStateSub?.remove();
  appStateSub = null;
  installed = false;
}

export async function check(): Promise<void> {
  await installAppStabilityGuard();
}

export const AppStability = {
  check,
  install: installAppStabilityGuard,
  uninstall: uninstallAppStabilityGuard };
