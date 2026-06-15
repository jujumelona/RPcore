/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/ErrorHandler.ts
// ══════════════════════════════════════════════════════════════
// 통합 에러 핸들러 — 일관된 에러 처리 및 로깅
// ══════════════════════════════════════════════════════════════

import { logger } from './logger';
import * as Sentry from '@sentry/react-native';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical' }

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  storyId?: string;
  metadata?: Record<string, any>;
}

export interface AppError {
  message: string;
  code?: string;
  severity: ErrorSeverity;
  context?: ErrorContext;
  originalError?: Error;
  timestamp: number;
}

class ErrorHandlerClass {
  private errorQueue: AppError[] = [];
  private maxQueueSize = 50;
  private listeners: Array<(error: AppError) => void> = [];

  /**
   * 에러 처리 및 로깅
   */
  handle(
    error: Error | string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext,
  ): void {
    const appError: AppError = {
      message: typeof error === 'string' ? error : error.message,
      severity,
      context,
      originalError: typeof error === 'string' ? undefined : error,
      timestamp: Date.now() };

    // 큐에 추가
    this.errorQueue.push(appError);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // 로깅
    this.logError(appError);

    // Sentry 전송 (CRITICAL 또는 HIGH)
    if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
      this.sendToSentry(appError);
    }

    // 리스너 알림
    this.notifyListeners(appError);
  }

  /**
   * 에러 로깅
   */
  private logError(error: AppError): void {
    const prefix = `[${error.severity.toUpperCase()}]`;
    const contextStr = error.context
      ? ` [${error.context.component || 'Unknown'}${error.context.action ? `:${error.context.action}` : ''}]`
      : '';

    const message = `${prefix}${contextStr} ${error.message}`;

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        logger.error(message, error.originalError);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(message, error.originalError);
        break;
      case ErrorSeverity.LOW:
        logger.log(message);
        break;
    }
  }

  /**
   * Sentry로 에러 전송
   */
  private sendToSentry(error: AppError): void {
    try {
      Sentry.captureException(error.originalError || new Error(error.message), {
        level: error.severity === ErrorSeverity.CRITICAL ? 'fatal' : 'error',
        tags: {
          component: error.context?.component,
          action: error.context?.action },
        extra: {
          ...error.context?.metadata,
          userId: error.context?.userId,
          storyId: error.context?.storyId } });
    } catch (e) {
      if (__DEV__) console.warn('[ErrorHandler] Sentry 전송 실패:', e);
    }
  }

  /**
   * 에러 리스너 등록
   */
  addListener(listener: (error: AppError) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 리스너에게 에러 알림
   */
  private notifyListeners(error: AppError): void {
    for (const listener of this.listeners) {
      try {
        listener(error);
      } catch (e) {
        if (__DEV__) console.warn('[ErrorHandler] 리스너 실행 실패:', e);
      }
    }
  }

  /**
   * 최근 에러 조회
   */
  getRecentErrors(count: number = 10): AppError[] {
    return this.errorQueue.slice(-count);
  }

  /**
   * 에러 큐 초기화
   */
  clearErrors(): void {
    this.errorQueue = [];
  }

  /**
   * 안전한 비동기 함수 실행 래퍼
   */
  async safeAsync<T>(
    fn: () => Promise<T>,
    context?: ErrorContext,
    fallback?: T,
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error as Error, ErrorSeverity.MEDIUM, context);
      return fallback;
    }
  }

  /**
   * 안전한 동기 함수 실행 래퍼
   */
  safeSync<T>(
    fn: () => T,
    context?: ErrorContext,
    fallback?: T,
  ): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.handle(error as Error, ErrorSeverity.MEDIUM, context);
      return fallback;
    }
  }

  /**
   * Promise 에러를 자동으로 처리
   */
  wrapPromise<T>(
    promise: Promise<T>,
    context?: ErrorContext,
  ): Promise<T> {
    return promise.catch(error => {
      this.handle(error as Error, ErrorSeverity.MEDIUM, context);
      throw error;
    });
  }
}

export const ErrorHandler = new ErrorHandlerClass();

/**
 * 에러 바운더리용 헬퍼
 */
export function handleComponentError(
  error: Error,
  errorInfo: { componentStack: string },
  componentName: string,
): void {
  ErrorHandler.handle(error, ErrorSeverity.HIGH, {
    component: componentName,
    metadata: {
      componentStack: errorInfo.componentStack } });
}
