// src/utils/KVTrace.ts
// KV 흐름 추적기 — DEV 빌드 + 릴리즈 에러 로깅
//
// adb로 실시간 확인:
//   adb shell "run-as com.rpplatform cat /data/data/com.rpplatform/files/logs/kv_trace.log"
//   adb pull /data/data/com.rpplatform/files/logs/kv_trace.log

import RNFS from './fileSystemCompat';
import { appStorage } from './storage';

// ✅ [NEW] KV 저장 상태 추적 — 저장 중 크래시로 인한 파일 손상 탐지용
// 앱 재시작에도 살아남아야 하므로 appStorage(MMKV)에 저장
const KV_MARK_PREFIX = '@kv_mark:';

export function markSaveStarted(key: string): void {
  appStorage.set(`${KV_MARK_PREFIX}${key}`, 'started');
}

export function markSaveCompleted(key: string): void {
  appStorage.set(`${KV_MARK_PREFIX}${key}`, 'completed');
}

export function getMarkValue(key: string): string | undefined {
  return appStorage.getString(`${KV_MARK_PREFIX}${key}`);
}

export function clearMark(key: string): void {
  appStorage.remove(`${KV_MARK_PREFIX}${key}`);
}

/** 
 * 구버전 코드 호환용 (사용 금지)
 * @deprecated Use markSaveStarted/markSaveCompleted instead
 */
export function cacheKVHash(key: string, _data: string): void {
  markSaveCompleted(key);
}

/** 
 * 구버전 코드 호환용 (사용 금지)
 * @deprecated Use clearMark instead
 */
export function clearKVHash(key?: string): void {
  if (key) clearMark(key);
}

/** 
 * 구버전 코드 호환용 (사용 금지)
 * @deprecated Use getMarkValue instead
 */
export function getKVHashValue(key: string): string | undefined {
  return getMarkValue(key);
}

/** 
 * 구버전 코드 호환용 (사용 금지)
 * @deprecated 
 */
export function verifyKVHash(_key: string, _data: string): boolean {
  return true;
}

const getLogPath = () => `${RNFS.DocumentDirectoryPath}/logs/kv_trace.log`;
const MAX_BYTES = 512 * 1024;

let _queue: Promise<void> = Promise.resolve();
let _buf: string[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;

function _serialize(data?: Record<string, unknown>): string {
  if (!data) return '';
  try {
    return ' ' + JSON.stringify(data, (_k, v) =>
      typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v
    );
  } catch { return ''; }
}

async function _flush(): Promise<void> {
  if (_buf.length === 0) return;
  const lines = _buf.join('');
  _buf = [];
  try {
    const dir = getLogPath().replace(/\/[^/]+$/, '');
    await RNFS.mkdir(dir).catch(() => { });
    const exists = await RNFS.exists(getLogPath()).catch(() => false);
    if (exists) {
      const stat = await RNFS.stat(getLogPath()).catch(() => null);
      if (stat && stat.size > MAX_BYTES) {
        const old = await RNFS.readFile(getLogPath(), 'utf8').catch(() => '');
        await RNFS.writeFile(getLogPath(), old.slice(-Math.floor(MAX_BYTES * 0.5)), 'utf8');
      }
    }
    await RNFS.appendFile(getLogPath(), lines, 'utf8');
  } catch { /* 로그 실패는 무시 */ }
}

export function trace(
  step: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
): void {
  // [BUG-7 FIX] 릴리즈에서도 에러 레벨은 기록하도록 허용
  // step 이름에 'FAIL' 또는 'error'가 포함되어 있으면 상위 레벨로 간주
  const isErr = level === 'error' || step.includes('FAIL') || step.includes('error');
  if (!__DEV__ && !isErr) return;

  const ts = new Date().toISOString().slice(11, 23);
  const prefix = isErr ? '[ERR] ' : '';
  const line = `${ts} ${prefix}${step}${_serialize(data)}\n`;

  if (__DEV__) console.log(`[KVTrace] ${step}`, data ?? '');

  _buf.push(line);
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    // [BUG FIX] 타이머 발화 후 _timer=null 미처리 -> clearTimeout(stale_id) 방지
    _timer = null;
    _queue = _queue.then(_flush).catch(() => { });
  }, 100);
}

export async function flushTrace(): Promise<void> {
  // [NOTE] 릴리즈에서도 에러 기록을 위해 flush 허용
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const pending = _queue.then(_flush).catch(() => { });
  _queue = pending;
  await pending;
}

export function getTracePath(): string { return getLogPath(); }
