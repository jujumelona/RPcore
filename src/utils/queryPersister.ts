/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  PersistedClient,
  Persister,
  PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

type SQLiteOpen = typeof import('@op-engineering/op-sqlite').open;
type SQLiteDB = ReturnType<SQLiteOpen>;

const CACHE_DB_NAME = 'rq-cache.db';
const TABLE = 'query_cache';

let _openSQLite: SQLiteOpen | null = null;
let _db: SQLiteDB | null = null;
// [BUG-11 FIX] op-sqlite 로드 실패 시 매 쿼리마다 throw를 반복하는 것을 방지.
// 30초 쿨다운 후 재시도하도록 타임스탬프 저장.
let _dbFailedAt = 0;
// [BUG FIX] VACUUM 실행 중 close() 호출 방지
let _vacuumPromise: Promise<void> | null = null;
let _vacuumTimer: ReturnType<typeof setTimeout> | null = null;

function getSQLiteOpen(): SQLiteOpen {
  if (_openSQLite) return _openSQLite;

  const mod = require('@op-engineering/op-sqlite') as { open?: SQLiteOpen };
  if (typeof mod?.open !== 'function') {
    throw new Error('op-sqlite open() is unavailable');
  }

  _openSQLite = mod.open;
  return _openSQLite;
}

function getCacheDB(): SQLiteDB | null {
  if (_dbFailedAt > 0 && Date.now() - _dbFailedAt < 30_000) return null;
  if (_db) return _db;

  try {
    const open = getSQLiteOpen();
    _db = open({ name: CACHE_DB_NAME });

    _db.executeSync('PRAGMA journal_mode = WAL;');
    _db.executeSync('PRAGMA synchronous = NORMAL;');
    _db.executeSync('PRAGMA cache_size = -4000;');
    _db.executeSync(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      ts    INTEGER DEFAULT (strftime('%s','now'))
    )`,
    );
    _db.executeSync(`CREATE INDEX IF NOT EXISTS idx_rq_ts ON ${TABLE}(ts)`);
    return _db;
  } catch (e) {
    if (__DEV__) console.warn('[queryPersister] getCacheDB 초기화 실패 — 30초 후 재시도:', e);
    _dbFailedAt = Date.now();
    _db = null;
    return null;
  }
}

export const sqliteQueryPersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      const db = getCacheDB();
      if (!db) return;
      const serialized = JSON.stringify(client);
      db.executeSync(
        `INSERT OR REPLACE INTO ${TABLE}(key, value, ts) VALUES(?, ?, strftime('%s','now'))`,
        ['rq-client', serialized],
      );
    } catch (e) {
      if (__DEV__) console.warn('[sqliteQueryPersister] persistClient failed:', e);
    }
  },

  restoreClient: async () => {
    try {
      const db = getCacheDB();
      if (!db) return undefined;
      const res = db.executeSync(
        `SELECT value, ts FROM ${TABLE} WHERE key = ?`,
        ['rq-client'],
      );
      const rows = Array.isArray(res.rows) ? res.rows : (res.rows as any)?._array || res.rows;
      const row = rows?.[0] as { value: string; ts: number } | undefined;
      if (!row?.value) return undefined;

      // [BUG-17 FIX] SQLite timestamp 가 maxAge 보다 오래되었으면 undefined 반환 (Cache Expire)
      // ts: sqlite strftime('%s') -> seconds. Date.now() -> milliseconds.
      if (row.ts) {
        const ageMs = Date.now() - (row.ts * 1000);
        // queryPersistOptions.maxAge = 24h
        if (ageMs > 24 * 60 * 60 * 1000) {
          if (__DEV__) console.log('[sqliteQueryPersister] Cache expired (age > 24h)');
          return undefined;
        }
      }

      return JSON.parse(row.value);
    } catch (e) {
      if (__DEV__) console.warn('[sqliteQueryPersister] restoreClient failed:', e);
      return undefined;
    }
  },

  removeClient: async () => {
    try {
      const db = getCacheDB();
      if (!db) return;
      db.executeSync(`DELETE FROM ${TABLE} WHERE key = ?`, ['rq-client']);
    } catch { /* ignore */ }
  } };

export async function purgeExpiredQueryCache(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const db = getCacheDB();
    if (!db) return;
    const cutoff = Math.floor((Date.now() - maxAgeMs) / 1000);
    db.executeSync(`DELETE FROM ${TABLE} WHERE ts < ?`, [cutoff]);
    // ✅ [BUG FIX] setTimeout 내 executeSync('VACUUM') 도 JS 스레드 블로킹
    // 기존: setTimeout(callback, 0) — macro task queue에 넣어도 내부는 동기 SQLite 재작성
    //       VACUUM은 DB 전체를 재작성하므로 수십~수백ms 소요 → 렌더 프레임 drop
    // 수정: executeAsync가 있으면 사용(네이티브 스레드 실행), 없으면 skip
    //       VACUUM은 필수적이지 않으므로 실패해도 무시
    if (_vacuumTimer) {
      clearTimeout(_vacuumTimer);
      _vacuumTimer = null;
    }
    _vacuumTimer = setTimeout(() => {
      _vacuumTimer = null;
      try {
        const currentDb = _db;
        if (currentDb && 'executeAsync' in currentDb && typeof currentDb.executeAsync === 'function') {
          _vacuumPromise = currentDb.executeAsync('VACUUM')
            .catch(() => { /* ignore */ })
            .finally(() => { _vacuumPromise = null; });
        }
      } catch { /* ignore */ }
    }, 5000); // 5초 지연 — 앱 시작 직후 실행 방지
  } catch (e) {
    if (__DEV__) console.warn('[queryPersister] purgeExpiredQueryCache failed:', e);
  }
}

/**
 * [NEW] 앱 종료/재시작 시 SQLite 연결 해제
 */
export async function closeCacheDB(): Promise<void> {
  if (_vacuumTimer) {
    clearTimeout(_vacuumTimer);
    _vacuumTimer = null;
  }

  // [FIX] VACUUM 완료 대기 (use-after-close 방지)
  if (_vacuumPromise) {
    try { await _vacuumPromise; } catch { /* ignore */ }
  }

  if (_db) {
    try {
      _db.close?.();
    } catch { /* ignore */ }
    _db = null;
  }
  _dbFailedAt = 0;
}

export const queryPersistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: sqliteQueryPersister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: '2.0.0',
  dehydrateOptions: {
    shouldDehydrateQuery: query => query.state.status === 'success' } };

export { sqliteQueryPersister as mmkvQueryPersister };
