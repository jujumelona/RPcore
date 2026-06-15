import { logger } from './logger';

const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
};

let installed = false;
let originalFetch: typeof fetch | null = null;

function createTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.name = 'RequestTimeoutError';
  (error as Error & { code?: string }).code = 'ETIMEDOUT';
  return error;
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return error.name === 'RequestTimeoutError' || code === 'ETIMEDOUT';
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const runner = originalFetch ?? fetch;
  const timeoutMs = init.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timeoutMs: _timeoutMs, signal, ...requestInit } = init;
  let timedOut = false;

  const onAbort = () => {
    controller.abort();
  };

  if (signal?.aborted) {
    controller.abort();
  } else if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const requestInput = input instanceof URL ? input.toString() : input;

  try {
    return await runner(requestInput, {
      ...requestInit,
      signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw createTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function installFetchTimeoutGuard(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): void {
  if (installed) return;

  const globalAny = globalThis as typeof globalThis & {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };

  if (typeof globalAny.fetch !== 'function') {
    logger.warn('[fetchRuntime] global fetch is not available');
    return;
  }

  originalFetch = globalAny.fetch.bind(globalAny) as typeof fetch;
  globalAny.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithTimeout(input, {
      ...init,
      timeoutMs: (init as FetchWithTimeoutInit | undefined)?.timeoutMs ?? timeoutMs });

  installed = true;
  logger.log(`[fetchRuntime] installed (timeout=${timeoutMs}ms)`);
}

/**
 * [BUG FIX] 테스트 환경에서 fetchRuntime guard 해제 및 원본 fetch 복원
 * 기존: teardown 함수 없음 → Jest 테스트 재실행 시 installed=true인 채로
 *       originalFetch가 교체된 상태가 유지되어 테스트 간 상태 오염
 * 수정: uninstall 시 원본 fetch 복원 + installed 플래그 리셋
 */
export function uninstallFetchTimeoutGuard(): void {
  if (!installed) return;

  const globalAny = globalThis as typeof globalThis & {
    fetch?: typeof fetch;
  };

  if (originalFetch) {
    globalAny.fetch = originalFetch;
    originalFetch = null;
  }

  installed = false;
  logger.log('[fetchRuntime] uninstalled, original fetch restored');
}
