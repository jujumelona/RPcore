/* eslint-disable @typescript-eslint/no-unused-vars */
import { recordCrash } from './crashLogger';
import { logger } from './logger';

// React Native 전역 ErrorUtils 및 promiseRejectionTrackingOptions 타입 확장
declare global {
  var promiseRejectionTrackingOptions: {
    allRejections?: boolean;
    onUnhandled?: (id: unknown, rejection: unknown) => void;
    onHandled?: (id: unknown) => void;
  } | undefined;
}

let _savedPreviousHandler: ((error: unknown, isFatal?: boolean) => void) | null = null;
let _savedUnhandledRejection: typeof globalThis.promiseRejectionTrackingOptions | null = null;
let installed = false;

function installGlobalExceptionHandler(): void {
  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: { setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils as {
    setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | null;
  } | undefined;

  if (!errorUtils || typeof errorUtils.setGlobalHandler !== 'function') {
    logger.warn('[runtimeGuard] ErrorUtils is not available');
    return;
  }

  // ✅ [FIX] 이전 핸들러를 모듈 변수에 저장하여 uninstall 시 복구 가능하게 함
  if (!_savedPreviousHandler) {
    _savedPreviousHandler = typeof errorUtils.getGlobalHandler === 'function'
      ? errorUtils.getGlobalHandler()
      : null;
  }

  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    logger.error(`[runtimeGuard] Uncaught JS exception (fatal=${Boolean(isFatal)})`, error);
    recordCrash('uncaught-js-exception', error, { fatal: Boolean(isFatal) });

    if (typeof _savedPreviousHandler === 'function') {
      try {
        _savedPreviousHandler(error, Boolean(isFatal));
      } catch (handlerErr) {
        logger.error('[runtimeGuard] Previous global handler failed:', handlerErr);
      }
    }
  });
}

function installUnhandledRejectionHandler(): void {
  // [NEW] 한 번만 저장
  if (!_savedUnhandledRejection) {
    _savedUnhandledRejection = globalThis.promiseRejectionTrackingOptions ?? {};
  }

  globalThis.promiseRejectionTrackingOptions = {
    allRejections: true,
    onUnhandled: (id: unknown, rejection: unknown) => {
      const rej = rejection as { stack?: string; message?: string } | null;
      const reason = rej?.stack ?? rej?.message ?? rejection;
      logger.error('[runtimeGuard] Unhandled promise rejection:', id, reason);
      recordCrash('unhandled-promise-rejection', rejection, { id });
      if (typeof _savedUnhandledRejection?.onUnhandled === 'function') {
        _savedUnhandledRejection.onUnhandled(id, rejection);
      }
    },
    onHandled: (id: unknown) => {
      if (typeof _savedUnhandledRejection?.onHandled === 'function') {
        _savedUnhandledRejection.onHandled(id);
      }
    } };
}

export function installRuntimeGuard(): void {
  if (installed) return;
  installed = true;

  installGlobalExceptionHandler();
  installUnhandledRejectionHandler();
  logger.log('[runtimeGuard] installed');
}

/**
 * [NEW] 앱 종료/재시작 시 원본 에러 핸들러 복원
 */
export function uninstallRuntimeGuard(): void {
  if (!installed) return;
  
  const errorUtils = (globalThis as Record<string, unknown>).ErrorUtils;
  if (_savedPreviousHandler && errorUtils) {
    (errorUtils as { setGlobalHandler: (handler: unknown) => void }).setGlobalHandler(_savedPreviousHandler);
  }
  if (_savedUnhandledRejection) {
    globalThis.promiseRejectionTrackingOptions = _savedUnhandledRejection;
  }

  installed = false;
  logger.log('[runtimeGuard] uninstalled');
}


