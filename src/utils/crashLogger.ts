﻿// src/utils/crashLogger.ts
import RNFS from './fileSystemCompat';
import { logger } from './logger';

function logDir(): string { return `${RNFS.DocumentDirectoryPath}/logs`; }
const LOG_PATH = `${logDir()}/runtime-crashes.log`;
const MAX_LOG_BYTES = 256 * 1024;

let writeQueue = Promise.resolve();

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return [
      `${error.name}: ${error.message}`,
      error.stack ?? '',
    ].filter(Boolean).join('\n');
  }
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error, null, 2); } catch { return String(error); }
}

async function trimLogIfNeeded(): Promise<void> {
  const exists = await RNFS.exists(LOG_PATH).catch(() => false);
  if (!exists) return;
  const stat = await RNFS.stat(LOG_PATH).catch(() => null);
  if (!stat || Number(stat.size) <= MAX_LOG_BYTES) return;
  const content = await RNFS.readFile(LOG_PATH, 'utf8').catch(() => '');
  if (!content) return;
  const tail = content.slice(-Math.floor(MAX_LOG_BYTES * 0.6));
  await RNFS.writeFile(LOG_PATH, tail, 'utf8');
}

async function appendCrashEntry(source: string, error: unknown, extra?: Record<string, unknown>): Promise<void> {
  const timestamp = new Date().toISOString();
  const payload = [
    `[${timestamp}] ${source}`,
    normalizeError(error),
    extra ? JSON.stringify(extra) : '',
    '',
  ].filter(Boolean).join('\n');

  await RNFS.mkdir(logDir()).catch(() => {});
  await trimLogIfNeeded();
  await RNFS.appendFile(LOG_PATH, `${payload}\n`, 'utf8');
}

export function recordCrash(
  source: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  writeQueue = writeQueue
    .catch(() => {})
    .then(() => appendCrashEntry(source, error, extra))
    .catch(logError => {
      logger.error('[crashLogger] failed to persist crash log:', logError);
    });
}

export function getCrashLogPath(): string {
  return LOG_PATH;
}

export async function flushCrashLogs(): Promise<void> {
  await writeQueue.catch(() => {});
}

// [FIX #8] 앱 시작 시 미전송 로그를 Sentry로 일괄 전송
export async function flushCrashLogsToSentry(): Promise<void> {
  await flushCrashLogs();
  try {
    const exists = await RNFS.exists(LOG_PATH).catch(() => false);
    if (!exists) return;

    const content = await RNFS.readFile(LOG_PATH, 'utf8').catch(() => '');
    if (!content.trim()) return;

    const Sentry = require('@sentry/react-native');
    // 로그를 최대 10개 항목으로 분리하여 전송
    const entries = content.split('\n\n').filter(Boolean).slice(-10);
    for (const entry of entries) {
      Sentry.captureMessage(`[CrashLog] ${entry.slice(0, 500)}`, 'error');
    }

    // [BUG FIX] 파일 초기화를 writeQueue 체인에 추가
    // 기존: writeFile을 writeQueue 밖에서 직접 호출 →
    //       읽기와 초기화 사이에 recordCrash가 writeQueue로 새 로그를 쓰면 유실
    // 수정: 초기화를 writeQueue에 enqueue → 직렬 실행 보장
    writeQueue = writeQueue
      .catch(() => {})
      .then(() => RNFS.writeFile(LOG_PATH, '', 'utf8'))
      .catch(() => {});
    await writeQueue;
    logger.log('[crashLogger] Sentry 전송 완료, 로그 초기화');
  } catch (e) {
    logger.error('[crashLogger] Sentry 전송 실패:', e);
  }
}
