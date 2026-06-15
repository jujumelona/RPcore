/**
 * CrashIntelligence.ts  v1.0
 * ════════════════════════════════════════════════════════════════════════════
 * 크래시 발생 시 "정확히 어디서, 무슨 상태에서 터졌는지" 를 한 폴더에 모읍니다.
 *
 * ┌─ 제공 기능 ──────────────────────────────────────────────────────────────┐
 * │  1. RingLog         — logger를 intercept, 최근 200줄 메모리 링 버퍼 유지  │
 * │  2. CrashDumper     — 크래시 시 crashes/YYYYMMDD_HHMMSS_<hash>/ 폴더에   │
 * │                        crash.log / context.log / state.json / memory.json │
 * │  3. zodSafe()       — Zod parse wrapper, 실패 시 자동 dump + 에러 위치   │
 * │  4. createMachine() — 경량 상태머신, 허용 안 된 전이 시 dump + throw     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 사용법:
 *   // index.js (진입점) 맨 위에
 *   import { installCrashIntelligence } from './src/utils/CrashIntelligence';
 *   installCrashIntelligence();
 *
 *   // Zod 검증
 *   import { zodSafe } from './src/utils/CrashIntelligence';
 *   const result = zodSafe(MySchema, rawData, 'ServerAPI.fetchStory');
 *
 *   // 상태머신
 *   import { createMachine } from './src/utils/CrashIntelligence';
 *   const chatMachine = createMachine('ChatSession', {
 *     initial: 'IDLE',
 *     states: {
 *       IDLE:       { LOAD: 'LOADING' },
 *       LOADING:    { LOADED: 'READY', ERROR: 'FAILED' },
 *       READY:      { SEND: 'SENDING', CLOSE: 'IDLE' },
 *       SENDING:    { DONE: 'READY', ERROR: 'FAILED' },
 *       FAILED:     { RETRY: 'LOADING', CLOSE: 'IDLE' },
 *     },
 *   });
 *   chatMachine.send('LOAD');   // 허용된 전이
 *   chatMachine.send('SEND');   // LOADING 상태에서 SEND -> dump + throw!
 * ════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// 의존성 (React Native 프로젝트에서 사용하는 기존 모듈)
// ─────────────────────────────────────────────────────────────────────────────
import RNFS from './fileSystemCompat';
import { logger as baseLogger } from './logger';
import { recordCrash, flushCrashLogs } from './crashLogger';

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

interface RingEntry {
  /** ISO 8601 타임스탬프 */
  ts: string;
  /** 'LOG' | 'WARN' | 'ERROR' */
  level: 'LOG' | 'WARN' | 'ERROR';
  /** 로그 메시지 (JSON 직렬화) */
  msg: string;
}

/** zodSafe() 성공 결과 */
export interface ZodSafeOk<T> {
  ok: true;
  data: T;
}

/** zodSafe() 실패 결과 */
export interface ZodSafeFail {
  ok: false;
  error: string;
  dumpPath: string | null;
}

export type ZodSafeResult<T> = ZodSafeOk<T> | ZodSafeFail;

/** createMachine 설정 */
export interface MachineDefinition<S extends string, E extends string> {
  initial: S;
  /** states[현재상태][이벤트] = 다음상태 */
  states: Record<S, Partial<Record<E, S>>>;
}

/** createMachine 반환 인스턴스 */
export interface StateMachine<S extends string, E extends string> {
  /** 현재 상태 반환 */
  current(): S;
  /**
   * 이벤트 전송.
   * 현재 상태에서 허용된 전이이면 상태 변경 후 새 상태 반환.
   * 허용되지 않은 전이이면 덤프 파일 생성 후 Error throw.
   */
  send(event: E, context?: Record<string, unknown>): S;
  /** 이벤트가 현재 상태에서 허용되는지 사전 확인 (throw 없음) */
  can(event: E): boolean;
  /** 전이 히스토리 반환 (최근 50개) */
  history(): Array<{ from: S; event: E; to: S; ts: string }>;
  /** 외부 상태를 강제 설정 (테스트/복원용, 이력에 기록됨) */
  forceState(state: S, reason?: string): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1. RingLog — 최근 200줄 링 버퍼
// ─────────────────────────────────────────────────────────────────────────────

const RING_CAPACITY = 200;
const _ring: RingEntry[] = [];

function _push(level: RingEntry['level'], args: unknown[]): void {
  const msg = args
    .map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');

  if (_ring.length >= RING_CAPACITY) _ring.shift();
  _ring.push({ ts: new Date().toISOString(), level, msg });
}

/**
 * 링 버퍼 전체 스냅샷 반환 (오래된 것 -> 최신 순)
 */
export function getRingSnapshot(): RingEntry[] {
  return [..._ring];
}

/**
 * logger는 `as const` 읽기 전용이라 monkey-patch 불가.
 * 대신 console.* 를 wrapping 해서 RingLog에 기록한다.
 * installCrashIntelligence()에서 자동 호출됨.
 */
let _consolePatched = false;
function _patchLogger(): void {
  if (_consolePatched) return;
  _consolePatched = true;

  const origLog   = console.log.bind(console);
  const origWarn  = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => { _push('LOG',   args); origLog(...args);   };
  console.warn = (...args: unknown[]) => { _push('WARN',  args); origWarn(...args);  };
  console.error = (...args: unknown[]) => { _push('ERROR', args); origError(...args); };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. CrashDumper — 타임스탬프 폴더에 파일 자동 수집
// ─────────────────────────────────────────────────────────────────────────────

function _dumpRoot(): string { return `${RNFS.DocumentDirectoryPath}/crashes`; }

/** YYYYMMDD_HHMMSS */
function _fmtTimestamp(d = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

/** 짧은 4자리 해시 (충돌 방지용) */
function _shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.trunc(Math.imul(31, h) + s.charCodeAt(i));
    // clamp to int32 range without bitwise
    if (h > 2147483647)  h -= 4294967296;
    if (h < -2147483648) h += 4294967296;
  }
  return (h < 0 ? h + 4294967296 : h).toString(16).slice(0, 4);
}

/**
 * 현재 앱 상태 스냅샷 수집.
 * Zustand store 접근은 선택적(lazy require)으로 처리해 순환 의존성 방지.
 */
function _safeState(getState: () => unknown): unknown {
  try {
    const st = getState();
    if (!st || typeof st !== 'object') return '(empty)';
    const cleaned = { ...(st as Record<string, unknown>) };
    delete cleaned.token;
    delete cleaned.password;
    return cleaned;
  } catch { return '(unavailable)'; }
}

function _collectAppState(): Record<string, unknown> {
  // 각 store를 독립적으로 try/catch — 하나 실패해도 나머지 수집 계속
  // require('문자열 리터럴') — Metro 정적 분석 통과 (변수 require 아님)
  const snapshot: Record<string, unknown> = {};
  try { snapshot.auth     = _safeState((require('../store/authStore')     as {useAuthStore:     {getState:()=>unknown}}).useAuthStore.getState);     } catch { snapshot.auth = '(unavailable)'; }
  try { snapshot.chat     = _safeState((require('../store/chatStore')     as {useChatStore:     {getState:()=>unknown}}).useChatStore.getState);     } catch { snapshot.chat = '(unavailable)'; }
  try { snapshot.model    = _safeState((require('../store/modelStore')    as {useModelStore:    {getState:()=>unknown}}).useModelStore.getState);    } catch { snapshot.model = '(unavailable)'; }
  try { snapshot.settings = _safeState((require('../store/settingsStore') as {useSettingsStore: {getState:()=>unknown}}).useSettingsStore.getState); } catch { snapshot.settings = '(unavailable)'; }
  try { snapshot.emotion  = _safeState((require('../store/emotionStore')  as {useEmotionStore:  {getState:()=>unknown}}).useEmotionStore.getState);  } catch { snapshot.emotion = '(unavailable)'; }
  return snapshot;
}

/**
 * 메모리 샘플 수집 (MemoryLeakGuard 연동)
 */
function _collectMemorySamples(): unknown[] {
  try {
    const { memoryLeakGuard: mlg } = require('./MemoryLeakGuard') as {
      memoryLeakGuard: { getSamples: () => unknown[] };
    };
    return mlg.getSamples().slice(-20);
  } catch {
    return [];
  }
}

/**
 * 마지막 UI 액션 수집 (uiActionLog 연동)
 */
function _collectLastUiAction(): unknown {
  try {
    const { getLastUiAction } = require('./uiActionLog') as {
      getLastUiAction: () => unknown;
    };
    return getLastUiAction();
  } catch {
    return null;
  }
}

/**
 * 크래시 덤프 폴더를 생성하고 파일들을 씁니다.
 *
 * 생성 파일:
 *   crash.log    — 에러 메시지 + 스택 + 소스 위치
 *   context.log  — 크래시 직전 최근 200개 로그 (RingBuffer)
 *   state.json   — 크래시 시점 Zustand 스토어 스냅샷
 *   memory.json  — 최근 20개 RAM 샘플
 *
 * @returns 생성된 폴더 경로 (실패 시 null)
 */
export async function dumpCrash(
  source: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<string | null> {
  // 기존 crashLogger에도 함께 기록 (Sentry 연동 유지)
  try {
    recordCrash(source, error, extra);
  } catch { /* ignore */ }

  const ts = _fmtTimestamp();
  const errMsg = error instanceof Error ? error.message : String(error);
  const hash = _shortHash(`${ts}${errMsg}`);
  const dir = `${_dumpRoot()}/${ts}_${hash}`;

  try {
    await RNFS.mkdir(dir);

    // ── crash.log ─────────────────────────────────────────────────────────
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    const crashText = [
      `[${new Date().toISOString()}] SOURCE: ${source}`,
      `ERROR: ${errMsg}`,
      stack ? `STACK:\n${stack}` : '',
      extra ? `EXTRA: ${JSON.stringify(extra, null, 2)}` : '',
      `LAST_UI_ACTION: ${JSON.stringify(_collectLastUiAction())}`,
    ].filter(Boolean).join('\n');

    await RNFS.writeFile(`${dir}/crash.log`, crashText, 'utf8');

    // ── context.log ───────────────────────────────────────────────────────
    const ringLines = _ring
      .map(e => `${e.ts} [${e.level}] ${e.msg}`)
      .join('\n');
    await RNFS.writeFile(`${dir}/context.log`, ringLines, 'utf8');

    // ── state.json ────────────────────────────────────────────────────────
    const appState = _collectAppState();
    await RNFS.writeFile(
      `${dir}/state.json`,
      JSON.stringify({ capturedAt: new Date().toISOString(), ...appState }, null, 2),
      'utf8',
    );

    // ── memory.json ───────────────────────────────────────────────────────
    const memorySamples = _collectMemorySamples();
    await RNFS.writeFile(
      `${dir}/memory.json`,
      JSON.stringify({ capturedAt: new Date().toISOString(), samples: memorySamples }, null, 2),
      'utf8',
    );

    // 기존 crashLogger 큐도 flush
    await flushCrashLogs().catch(() => {});

    baseLogger.error(`[CrashIntelligence] 덤프 생성 완료: ${dir}`);
    return dir;

  } catch (fsErr) {
    baseLogger.error('[CrashIntelligence] 덤프 쓰기 실패:', fsErr);
    return null;
  }
}

/**
 * 오래된 덤프 폴더 정리 (기본 7일 이상).
 * AppBootstrap.ts 의 initApp() 에서 호출 권장.
 */
export async function purgeStaleDumps(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const exists = await RNFS.exists(_dumpRoot()).catch(() => false);
    if (!exists) return;

    const items = await RNFS.readDir(_dumpRoot()).catch(() => []);
    const cutoff = Date.now() - maxAgeMs;

    for (const item of items) {
      if (!item.isDirectory()) continue;
      const mtime = item.mtime ? new Date(item.mtime).getTime() : 0;
      if (mtime < cutoff) {
        await RNFS.unlink(item.path).catch(() => {});
      }
    }
  } catch (e) {
    baseLogger.warn('[CrashIntelligence] purgeStaleDumps 실패:', e);
  }
}

/**
 * 저장된 덤프 폴더 목록 반환 (최신 순).
 * 디버그 화면이나 설정 화면에서 "충돌 기록 보기" 기능 구현 시 사용.
 */
export async function listDumps(): Promise<Array<{ path: string; name: string; createdAt: Date }>> {
  try {
    const exists = await RNFS.exists(_dumpRoot()).catch(() => false);
    if (!exists) return [];

    const items = await RNFS.readDir(_dumpRoot()).catch(() => []);
    return items
      .filter(i => i.isDirectory())
      .map(i => ({
        path: i.path,
        name: i.name,
        createdAt: i.mtime ? new Date(i.mtime) : new Date(0) }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. zodSafe() — Zod 런타임 검증 + 실패 시 자동 덤프
// ─────────────────────────────────────────────────────────────────────────────

type ZodSchema<T> = {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { message: string } };
};

/**
 * Zod schema를 안전하게 실행하고, 실패 시 CrashDumper를 호출합니다.
 *
 * @param schema  Zod 스키마 (z.object(...), z.array(...) 등)
 * @param data    검증할 데이터
 * @param source  "어디서 검증했는지" 레이블 (예: 'ServerAPI.fetchStory')
 *
 * @example
 * const result = zodSafe(StorySchema, rawJson, 'StoryAPI.parse');
 * if (!result.ok) {
 *   // 이미 dumps/ 에 기록됨 — result.dumpPath 에 경로
 *   return showFriendlyError();
 * }
 * const story = result.data;  // 타입 안전
 */
export function zodSafe<T>(
  schema: ZodSchema<T>,
  data: unknown,
  source: string,
): ZodSafeResult<T> {
  const parsed = schema.safeParse(data);

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const errMsg = parsed.success ? '' : (parsed as any).error?.message || 'Unknown error';

  // 비동기 덤프를 fire-and-forget 으로 실행 (실패해도 앱이 멈추지 않음)
  let dumpPath: string | null = null;
  dumpCrash(`zodSafe:${source}`, new Error(`Zod validation failed: ${errMsg}`), {
    inputPreview: (() => {
      try { return JSON.stringify(data).slice(0, 500); } catch { return '(not serializable)'; }
    })(),
    schemaSource: source }).then(p => { dumpPath = p; });

  baseLogger.warn(`[zodSafe] 검증 실패 @ ${source}:`, errMsg);
  return { ok: false, error: errMsg, dumpPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4. createMachine() — 경량 상태머신 (XState 없이 동일한 보증)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 경량 상태머신 생성.
 *
 * XState와 달리 React 없이 순수 TypeScript로 작동하며,
 * 허용되지 않은 전이(transition)가 발생하면:
 *   1. CrashDumper 호출 -> dumps/ 에 crash.log + context.log + state.json 생성
 *   2. Error throw -> ErrorBoundary 또는 runtimeGuard 가 잡음
 *
 * @example
 * const m = createMachine('InferenceEngine', {
 *   initial: 'IDLE',
 *   states: {
 *     IDLE:     { START: 'RUNNING' },
 *     RUNNING:  { COMPLETE: 'IDLE', ERROR: 'IDLE', CANCEL: 'IDLE' },
 *   },
 * });
 *
 * m.send('START');    // OK: IDLE -> RUNNING
 * m.send('START');    // ❌ RUNNING 에서 START 불허 -> dump + throw
 * m.can('COMPLETE');  // true (throw 없이 사전 확인)
 */
export function createMachine<S extends string, E extends string>(
  machineName: string,
  definition: MachineDefinition<S, E>,
): StateMachine<S, E> {

  let current: S = definition.initial;
  const _history: Array<{ from: S; event: E; to: S; ts: string }> = [];
  const HISTORY_LIMIT = 50;

  return {
    current: () => current,

    send(event: E, context?: Record<string, unknown>): S {
      const transitions = definition.states[current];
      const next = transitions?.[event];

      if (next === undefined) {
        // ──── 허용되지 않은 전이 감지 ────────────────────────────────────
        const allowed = Object.keys(transitions ?? {});
        const errMsg = [
          `[StateMachine:${machineName}] 허용되지 않은 전이!`,
          `  현재 상태: "${current}"`,
          `  시도한 이벤트: "${event}"`,
          `  허용된 이벤트: [${allowed.join(', ') || '없음'}]`,
        ].join('\n');

        // fire-and-forget 덤프
        dumpCrash(`machine:${machineName}`, new Error(errMsg), {
          machineName,
          currentState: current,
          event,
          allowedEvents: allowed,
          recentHistory: _history.slice(-10),
          callerContext: context ?? {} });

        throw new Error(errMsg);
      }

      // ──── 정상 전이 ───────────────────────────────────────────────────
      const entry = { from: current, event, to: next, ts: new Date().toISOString() };
      if (_history.length >= HISTORY_LIMIT) _history.shift();
      _history.push(entry);

      baseLogger.log(
        `[StateMachine:${machineName}] ${current} ──[${event}]──▶ ${next}`,
      );

      current = next;
      return current;
    },

    can(event: E): boolean {
      return definition.states[current]?.[event] !== undefined;
    },

    history(): Array<{ from: S; event: E; to: S; ts: string }> {
      return [..._history];
    },

    forceState(state: S, reason = 'forced'): void {
      baseLogger.warn(
        `[StateMachine:${machineName}] forceState: ${current} -> ${state} (reason: ${reason})`,
      );
      const entry = {
        from: current,
        event: `__force__:${reason}` as E,
        to: state,
        ts: new Date().toISOString() };
      if (_history.length >= HISTORY_LIMIT) _history.shift();
      _history.push(entry);
      current = state;
    } };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. installCrashIntelligence() — 전역 설치 (index.js 맨 위에서 호출)
// ─────────────────────────────────────────────────────────────────────────────

let _installed = false;

/**
 * CrashIntelligence를 전역에 설치합니다.
 * index.js 또는 App.tsx 의 최상단(다른 import 이전)에서 1회만 호출하세요.
 *
 * 설치 내용:
 *   - logger monkey-patch -> RingLog 활성화
 *   - 전역 ErrorUtils 핸들러 -> dumpCrash 자동 호출
 *   - Promise rejection 핸들러 -> dumpCrash 자동 호출
 *   - dumps/ 폴더 사전 생성
 *   - 7일 이상 된 오래된 덤프 자동 정리
 */
export function installCrashIntelligence(): void {
  if (_installed) return;
  _installed = true;

  // 1) 링 버퍼 활성화
  _patchLogger();

  // 2) dumps 폴더 미리 생성
  RNFS.mkdir(_dumpRoot()).catch(() => {});

  // 3) 전역 JS 예외 핸들러
  const ErrorUtils = (globalThis as typeof globalThis & {
    ErrorUtils?: {
      setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void;
      getGlobalHandler?: () => ((e: Error, fatal?: boolean) => void) | null;
    };
  }).ErrorUtils;

  if (ErrorUtils?.setGlobalHandler) {
    const prev = ErrorUtils.getGlobalHandler?.() ?? null;
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      dumpCrash('global-exception', error, { fatal: Boolean(isFatal) });
      prev?.(error, isFatal);
    });
  }

  // 4) 전역 Promise rejection 핸들러
  const prevOptions = (globalThis as typeof globalThis & {
    promiseRejectionTrackingOptions?: {
      allRejections?: boolean;
      onUnhandled?: (id: unknown, rejection: unknown) => void;
      onHandled?: (id: unknown) => void;
    };
  }).promiseRejectionTrackingOptions ?? {};

  (globalThis as typeof globalThis & {
    promiseRejectionTrackingOptions?: typeof prevOptions;
  }).promiseRejectionTrackingOptions = {
    allRejections: true,
    onUnhandled: (id: unknown, rejection: unknown) => {
      dumpCrash('unhandled-promise-rejection', rejection, { promiseId: id });
      prevOptions.onUnhandled?.(id, rejection);
    },
    onHandled: (id: unknown) => {
      prevOptions.onHandled?.(id);
    } };

  // 5) 오래된 덤프 정리 (비동기, 실패해도 무시)
  purgeStaleDumps().catch(() => {});

  baseLogger.log('[CrashIntelligence] 설치 완료 — 덤프 위치:', _dumpRoot());
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. 프로젝트별 상태머신 예시 모음
//      (실제 사용 시 별도 파일로 분리 권장)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 추론 엔진 상태머신.
 *
 * IDLE 상태에서 절대로 CANCEL, COMPLETE 이벤트가 실행될 수 없음.
 * 위반 시 dumps/ 에 자동 기록됩니다.
 */
export const inferenceEngineMachine = createMachine<
  'IDLE' | 'LOADING_MODEL' | 'READY' | 'INFERRING' | 'ERROR',
  'LOAD' | 'LOADED' | 'INFER' | 'COMPLETE' | 'CANCEL' | 'ERROR' | 'RESET'
>('InferenceEngine', {
  initial: 'IDLE',
  states: {
    IDLE:          { LOAD: 'LOADING_MODEL' },
    LOADING_MODEL: { LOADED: 'READY', ERROR: 'ERROR' },
    READY:         { INFER: 'INFERRING', LOAD: 'LOADING_MODEL' },
    INFERRING:     { COMPLETE: 'READY', CANCEL: 'READY', ERROR: 'ERROR' },
    ERROR:         { RESET: 'IDLE', LOAD: 'LOADING_MODEL' } } });

/**
 * 채팅 세션 상태머신.
 *
 * IDLE 상태에서 SEND 이벤트 발생 -> 즉시 덤프 + throw.
 */
export const chatSessionMachine = createMachine<
  'IDLE' | 'LOADING_HISTORY' | 'READY' | 'SENDING' | 'STREAMING' | 'ERROR',
  'LOAD' | 'LOADED' | 'SEND' | 'STREAM_START' | 'STREAM_END' | 'ERROR' | 'RESET'
>('ChatSession', {
  initial: 'IDLE',
  states: {
    IDLE:            { LOAD: 'LOADING_HISTORY' },
    LOADING_HISTORY: { LOADED: 'READY', ERROR: 'ERROR' },
    READY:           { SEND: 'SENDING', LOAD: 'LOADING_HISTORY' },
    SENDING:         { STREAM_START: 'STREAMING', ERROR: 'ERROR' },
    STREAMING:       { STREAM_END: 'READY', ERROR: 'ERROR' },
    ERROR:           { RESET: 'IDLE', LOAD: 'LOADING_HISTORY' } } });

/**
 * 모델 다운로드 상태머신.
 */
export const modelDownloadMachine = createMachine<
  'IDLE' | 'DOWNLOADING' | 'VERIFYING' | 'READY' | 'ERROR',
  'START' | 'PROGRESS' | 'DONE' | 'VERIFY_OK' | 'VERIFY_FAIL' | 'ERROR' | 'CANCEL' | 'RESET'
>('ModelDownload', {
  initial: 'IDLE',
  states: {
    IDLE:        { START: 'DOWNLOADING' },
    DOWNLOADING: { PROGRESS: 'DOWNLOADING', DONE: 'VERIFYING', ERROR: 'ERROR', CANCEL: 'IDLE' },
    VERIFYING:   { VERIFY_OK: 'READY', VERIFY_FAIL: 'ERROR' },
    READY:       { RESET: 'IDLE' },
    ERROR:       { RESET: 'IDLE', START: 'DOWNLOADING' } } });
