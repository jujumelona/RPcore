import RNFS from './fileSystemCompat';

const getLogPath = () => `${RNFS.DocumentDirectoryPath}/logs/dev_unified.log`;
const MAX_BYTES = 1024 * 1024;

type LogCategory = 'CRASH' | 'RAM' | 'KV' | 'APP' | 'WARN' | 'ERR';

let queue: Promise<void> = Promise.resolve();
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
let inDevLog = false;

const nativeLog = console.log.bind(console);
const nativeWarn = console.warn.bind(console);
const nativeError = console.error.bind(console);

function formatData(data?: Record<string, unknown>): string {
  if (!data) return '';
  try {
    return ' ' + JSON.stringify(data, (_key, value) => {
      if (typeof value === 'string' && value.length > 200) {
        return `${value.slice(0, 200)}...`;
      }
      return value;
    });
  } catch {
    return '';
  }
}

async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;

  const chunk = buffer.join('');
  buffer = [];

  try {
    const dir = getLogPath().replace(/\/[^/]+$/, '');
    await RNFS.mkdir(dir).catch(() => {});

    const exists = await RNFS.exists(getLogPath()).catch(() => false);
    if (exists) {
      const stat = await RNFS.stat(getLogPath()).catch(() => null);
      if (stat && stat.size > MAX_BYTES) {
        const old = await RNFS.readFile(getLogPath(), 'utf8').catch(() => '');
        await RNFS.writeFile(getLogPath(), old.slice(-Math.floor(MAX_BYTES * 0.5)), 'utf8');
      }
    }

    await RNFS.appendFile(getLogPath(), chunk, 'utf8');
  } catch {
    // Ignore logging failures in dev collector.
  }
}

export function devLog(
  category: LogCategory,
  step: string,
  data?: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  if (inDevLog) return;
  inDevLog = true;

  try {
    const ts = new Date().toISOString().slice(11, 23);
    const line = `${ts} [${category}] ${step}${formatData(data)}\n`;

    if (category === 'CRASH' || category === 'ERR') {
      nativeError(`[DevLog:${category}] ${step}`, data ?? '');
    } else if (category === 'WARN' || category === 'RAM') {
      nativeWarn(`[DevLog:${category}] ${step}`, data ?? '');
    } else {
      nativeLog(`[DevLog:${category}] ${step}`, data ?? '');
    }

    buffer.push(line);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      queue = queue.then(flushBuffer).catch(() => {});
    }, 150);
  } finally {
    inDevLog = false;
  }
}

export async function flushDevLog(): Promise<void> {
  if (!__DEV__) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue = queue.then(flushBuffer).catch(() => {});
  await queue;
}

export function getDevLogPath(): string {
  return getLogPath();
}

export async function readDevLog(): Promise<string> {
  if (!__DEV__) return '';
  try {
    const exists = await RNFS.exists(getLogPath()).catch(() => false);
    if (!exists) return '(no log)';
    return await RNFS.readFile(getLogPath(), 'utf8');
  } catch (error) {
    return `(read failed: ${String(error)})`;
  }
}

export async function clearDevLog(): Promise<void> {
  if (!__DEV__) return;
  try {
    await RNFS.writeFile(getLogPath(), '', 'utf8');
  } catch {
    // Ignore clear failures.
  }
}

export function installDevLogCollector(): void {
  if (!__DEV__) return;
  if (installed) return;
  installed = true;

  devLog('APP', 'app:start', { ts: new Date().toISOString() });

  console.log = (...args: unknown[]) => {
    nativeLog(...args);
    const msg = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    if (msg.includes('[KVTrace]') || msg.includes('[KVDiag')) {
      devLog('KV', msg.replace('[KVTrace] ', '').replace('[KVDiag:', '').slice(0, 200));
    } else if (msg.includes('[AppBootstrap]') || msg.includes('[initApp]')) {
      devLog('APP', msg.slice(0, 200));
    }
  };

  console.warn = (...args: unknown[]) => {
    nativeWarn(...args);
    const msg = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    if (msg.includes('[KVTrace]') || msg.includes('[KVDiag') || msg.includes('KV')) {
      devLog('KV', `WARN: ${msg.slice(0, 200)}`);
    } else {
      devLog('WARN', msg.slice(0, 200));
    }
  };

  console.error = (...args: unknown[]) => {
    nativeError(...args);
    const msg = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    if (msg.includes('[CrashIntelligence]') || msg.includes('crash') || msg.includes('Error')) {
      devLog('CRASH', msg.slice(0, 300));
    } else {
      devLog('ERR', msg.slice(0, 200));
    }
  };

  try {
    const { kvDiag } = require('../core/llama/KVDiagnostics') as {
      kvDiag: { install: () => void; assertNoTmpFiles: () => Promise<void> };
    };
    kvDiag.install();
    kvDiag.assertNoTmpFiles().catch(() => {});
    devLog('KV', 'kv_diag:installed');
  } catch {
    // Optional in some environments.
  }

  devLog('APP', 'DevLogCollector:installed');
}

/**
 * [NEW] 앱 종료/재시작 시 원본 console 복원 및 타이머 정리
 */
export function uninstallDevLogCollector(): void {
  if (!installed) return;
  // 원본 console 복합
  console.log = nativeLog;
  console.warn = nativeWarn;
  console.error = nativeError;
  // 타이머 정리
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue = Promise.resolve();
  installed = false;
  
  if (__DEV__) nativeLog('[DevLogCollector] uninstalled');
}
