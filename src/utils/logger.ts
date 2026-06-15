﻿// src/utils/logger.ts
// __DEV__ === true  -> console.* 출력
// __DEV__ === false -> log 차단, warn -> Sentry breadcrumb, error 유지

const noop = (): void => {};

// [FIX #10] warn: 프로덕션에서도 Sentry breadcrumb로 전달
function sentryWarn(...args: unknown[]): void {
  try {
    // 동적 import로 순환 의존성 방지
    const Sentry = require('@sentry/react-native');
    Sentry.addBreadcrumb({
      category: 'warn',
      message: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
      level: 'warning' });
  } catch {
    // Sentry 없으면 조용히 무시
  }
}

export const logger = {
  log:   __DEV__ ? console.log.bind(console)  : noop,
  warn:  __DEV__ ? console.warn.bind(console) : sentryWarn,
  error: console.error.bind(console) } as const;

export default logger;
