// src/core/sqlite/DatabasePool.ts
// ═══════════════════════════════════════════════════════════════
// op-sqlite Connection Pool (직렬화 큐 방식)
//
// ✅ [BUG4 FIX] transaction()에 실제 SQL 트랜잭션 추가
//   - 기존: 큐 직렬화만, BEGIN/COMMIT/ROLLBACK 없음
//           -> 중간 실패 시 부분 쓰기(partially written state) 발생 가능
//   - 수정: db.runRaw('BEGIN') / COMMIT / ROLLBACK으로 원자성 보장
//
// ✅ [FIX] readAsync / write 큐 분리 (핵심 수정)
//   - 기존: readAsync()와 write()가 동일한 SerialQueue를 공유
//           -> 무거운 SELECT(getRecentConversationsBySceneAsync 등)가 실행 중이면
//              write()가 최대 10초간 블로킹 -> 대화 저장/요약 저장 타임아웃 연쇄
//   - 수정: _writeQueue(10s) / _readQueue(30s) 분리
//           · 쓰기는 읽기 완료를 기다리지 않음 -> 스트리밍 중 저장 지연 제거
//           · 읽기는 느린 JOIN/다건 SELECT를 30초까지 허용
//           · WAL 모드(pragma journal_mode=WAL) 활성화 시 동시성 완전 보장
//             미활성화 시에도 op-sqlite C++ 레이어가 순서를 직렬화하므로 안전
//
// ✅ [FIX] SerialQueue 타이머 누수 수정
//   - 기존: Promise.race 완료 후에도 타이머가 잔존 -> 타이머 누적
//   - 수정: timerId 저장 -> finally에서 clearTimeout으로 즉시 정리
//
// op-sqlite는 C++ 레이어에서 단일 연결이므로 전통적 pool보다
// 동시 쓰기 충돌을 막는 직렬화 큐가 실질적으로 더 효과적.
// ═══════════════════════════════════════════════════════════════

import { Database } from './Database';
import { logger } from '../../utils/logger';

type DBTask<T> = () => Promise<T>;

interface QueueEntry {
  task:      () => Promise<any>;
  onTimeout?: () => Promise<void>;
  resolve:   (val: any) => void;
  reject:    (err: unknown) => void;
}

// ✅ [FIX] 큐별 타임아웃 개별 설정 가능하도록 생성자 파라미터화
class SerialQueue {
  private queue:   QueueEntry[] = [];
  private running: boolean      = false;
  private isCorrupted: boolean  = false; // [BUG-ITEM5 FIX] Circuit breaker for broken serialization

  // ✅ [FIX #5] maxSize 추가 — 큐 크기 무제한 증가 방지
  // 기존: 크기 제한 없음 -> DB 처리 지연 시 큐가 무한히 쌓여 메모리 압박 및
  //       오래된 작업이 수백 ms 뒤에야 실행되는 "배압(backpressure)" 부재 문제.
  // 수정: 상한 초과 시 즉시 reject — 호출자가 적절히 재시도하거나 사용자에게 알릴 수 있음.
  //   쓰기 큐(500개): 일반 INSERT 폭발 방지, 읽기 큐(200개): 무거운 SELECT 집중 방지
  constructor(
    private readonly timeoutMs: number,
    private readonly maxSize: number = 500,
  ) {}

  enqueue<T>(task: DBTask<T>, onTimeout?: () => Promise<void>): Promise<T> {
    // ✅ [FIX #5] 큐 포화 시 즉시 reject (오래된 작업 지연 누적 방지)
    if (this.isCorrupted) {
      return Promise.reject(
        new Error(`[SerialQueue] 큐가 중단됨 (Dangling Task로 인해 일관성 파괴됨) — 앱 재시작 필요`),
      );
    }
    if (this.queue.length >= this.maxSize) {
      return Promise.reject(
        new Error(`[SerialQueue] 큐 포화 (최대 ${this.maxSize}개) — 잠시 후 재시도`),
      );
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, onTimeout, resolve, reject });
      this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift()!;
        let timerId: ReturnType<typeof setTimeout> | null = null;
        try {
          const timeoutPromise = new Promise<never>((_, rej) => {
            timerId = setTimeout(
              () => rej(new Error(`[SerialQueue] 작업 타임아웃 (${this.timeoutMs}ms)`)),
              this.timeoutMs,
            );
          });
          // timeoutPromise unhandled rejection 방지
          timeoutPromise.catch(() => {});
          // [BUG FIX] cancelled 플래그는 dead code였음.
          // task().then(result => { if (!cancelled) ... }) 에서
          // Promise.race가 timeoutPromise로 reject되면 taskPromise의 .then 콜백은
          // resolve에 의해 실행되지 않으므로 실제로는 아무 효과 없음.
          // 더 큰 문제: 타임아웃 후 task가 백그라운드에서 계속 실행되는 동안
          // drain()은 다음 entry로 진행 → 두 DB 작업이 동시 실행 가능.
          // 수정: taskPromise를 별도 변수에 저장하고, 타임아웃 시 drain이 잠시 대기해
          //   dangling task 완료 후 다음 entry 처리 (백그라운드 동시 실행 방지).
          const taskPromise = entry.task();
          const result = await Promise.race([
            taskPromise,
            timeoutPromise,
          ]).catch(async (err) => {
            if (err instanceof Error && err.message.includes('타임아웃')) {
              // [BUG FIX] 트랜잭션 타임아웃 시 5초 대기 대신 즉시 ROLLBACK 시도
              if (entry.onTimeout) {
                try {
                  await entry.onTimeout();
                  if (__DEV__) console.log('[SerialQueue] Timeout cleanup (e.g. ROLLBACK) executed');
                } catch (cleanupErr) {
                  if (__DEV__) console.warn('[SerialQueue] Timeout cleanup failed:', cleanupErr);
                }
              } else {
                // 일반 작업은 여전히 5초 dangling wait (DB 오염 방지)
                // [BUG-13 FIX] danglingTimerId 저장 후 clearTimeout 호출해 타이머 누수 방지
                let danglingTimerId: ReturnType<typeof setTimeout> | null = null;
                const danglingTimeout = new Promise<void>(resolve => {
                  danglingTimerId = setTimeout(resolve, 5_000);
                });
                
                const finished = await Promise.race([
                  taskPromise.then(() => true).catch(() => true),
                  danglingTimeout.then(() => false),
                ]);
                
                if (danglingTimerId) clearTimeout(danglingTimerId);
                
                // [BUG-4 FIX] 5초 후에도 dangling task가 종료되지 않으면 로그 남기고 큐 중단
                if (!finished) {
                  this.isCorrupted = true;
                  logger.error('[SerialQueue] Dangling task failed to complete within 5s grace period. Database serialization is broken. Circuit breaker activated.');
                }
              }
            }
            throw err;
          });
          entry.resolve(result);
        } catch (err) {
          entry.reject(err);
        } finally {
          if (timerId !== null) clearTimeout(timerId);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

// ── 실제 Pool 클래스 ─────────────────────────────────────────

export class DatabasePool {
  private static instance: DatabasePool;
  private db: Database;

  // ✅ [FIX] 읽기/쓰기 큐 분리
  //   _writeQueue: INSERT/UPDATE/DELETE/BEGIN-COMMIT — 10초 타임아웃
  //                쓰기는 빠른 단건 작업이 대부분이므로 엄격한 시한 적용
  //   _readQueue : SELECT 다건 조회 / JOIN — 30초 타임아웃
  //                무거운 getRecentConversations 류가 여기 진입
  //                읽기가 느려도 _writeQueue 는 독립적으로 진행
  private readonly _writeQueue: SerialQueue;
  private readonly _readQueue:  SerialQueue;

  private constructor() {
    this.db          = Database.getInstance();
    this._writeQueue = new SerialQueue(10_000, 500); // 쓰기: 10초, 최대 500개
    this._readQueue  = new SerialQueue(30_000, 200); // 읽기: 30초, 최대 200개 (무거운 SELECT)
  }

  static getInstance(): DatabasePool {
    if (!DatabasePool.instance) {
      DatabasePool.instance = new DatabasePool();
    }
    return DatabasePool.instance;
  }

  /**
   * ✅ [OPT] op-sqlite 15.x executeAsync 직접 활용
   * 무거운 JOIN/다건 SELECT를 네이티브 스레드에서 실행 -> JS 스레드 완전 비차단.
   * readAsync()가 JS Promise 큐를 통한 직렬화라면,
   * readQueryAsync()는 op-sqlite C++ 레이어에서 비동기 실행 -> 더 낮은 지연.
   */
  readQueryAsync<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this._readQueue.enqueue(() => this.db.queryAsync<T>(sql, params));
  }

  /**
   * 읽기 전용 쿼리 — 단건 조회 / PRAGMA 등 가볍고 빠른 SELECT에 사용.
   * 큐를 우회하므로 오버헤드가 없지만, 동시 쓰기와 경쟁 가능성이 있음.
   * 무거운 SELECT (다건 rows, 복잡한 JOIN)는 readAsync()를 사용할 것.
   *
   * ✅ [FIX] DEV 환경에서 실행 시간이 긴 read() 호출을 경고 로그로 감지.
   *   기존: 잘못된 사용(무거운 SELECT를 read()로 실행)을 막을 장치 없음
   *         -> WAL 미활성 환경에서 write()와 경쟁 시 undefined behavior 가능
   *   수정: DEV에서 5ms 초과 시 경고 로그 출력 -> readAsync()로 마이그레이션 안내
   *         PROD에서는 오버헤드 없이 그대로 실행 (성능 영향 없음)
   */
  read<T = any>(fn: (db: Database) => T): T {
    if (__DEV__) {
      const start = Date.now();
      const result = fn(this.db);
      const elapsed = Date.now() - start;
      if (elapsed > 30) {
        logger.warn(
          `[DatabasePool] read()가 ${elapsed}ms 소요 — 무거운 SELECT는 readAsync()를 사용하세요.\n` +
          '  현재 호출 스택을 확인하고 dbPool.readAsync()로 교체하는 것을 권장합니다.',
        );
      }
      return result;
    }
    return fn(this.db);
  }

  /**
   * ✅ [FIX] 무거운 읽기 전용 쿼리 — 독립 읽기 큐를 통해 실행.
   * getRecentConversationsByScene, getMemorySummaries 등 다건 SELECT에 사용.
   *
   * 쓰기 큐(_writeQueue)와 완전히 분리되어 있으므로,
   * 긴 SELECT가 실행 중이어도 write() / transaction() 은 즉시 시작 가능.
   * 타임아웃 30초 (무거운 JOIN 허용).
   */
  readAsync<T = any>(fn: (db: Database) => Promise<T> | T): Promise<T> {
    return this._readQueue.enqueue(() => Promise.resolve(fn(this.db)));
  }

  /**
   * 쓰기 쿼리 — 독립 쓰기 큐를 통해 직렬화 실행.
   * readAsync() 실행 여부와 무관하게 즉시 큐잉 -> 타임아웃 10초.
   */
  write<T = any>(fn: (db: Database) => T): Promise<T> {
    return this._writeQueue.enqueue(() => Promise.resolve(fn(this.db)));
  }

  /**
   * 트랜잭션 — 연속 쓰기를 원자적으로 실행
   *
   * ✅ [BUG4 FIX] 실제 SQL 트랜잭션 적용
   *   - BEGIN: 트랜잭션 시작
   *   - COMMIT: 성공 시 전체 커밋
   *   - ROLLBACK: 실패 시 전체 롤백 -> 부분 쓰기 방지
   *
   * ✅ [FIX] 쓰기 큐(_writeQueue)에서만 실행 — readAsync()와 독립
   */
  transaction<T = any>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    return this._writeQueue.enqueue(
      async () => {
        let begun = false;
        try {
          await this.db.runRaw('BEGIN');
          begun = true;
          const result = await Promise.resolve(fn(this.db));
          await this.db.runRaw('COMMIT');
          return result;
        } catch (err) {
          if (begun) {
            try {
              await this.db.runRaw('ROLLBACK');
            } catch (rollbackErr) {
              logger.error('[DatabasePool] ROLLBACK 실패:', rollbackErr);
            }
          }
          throw err;
        }
      },
      async () => {
        // [BUG FIX] 타임아웃 시 즉시 ROLLBACK
        await this.db.runRaw('ROLLBACK').catch(e => logger.warn('[DatabasePool] Timeout ROLLBACK fail:', e));
      }
    );
  }
}

// 편의 싱글톤 export
export const dbPool = DatabasePool.getInstance();

// ── 사용 예시 ────────────────────────────────────────────────
// 쓰기: await dbPool.write(db => db.insertCharacter(char))
// 읽기: dbPool.read(db => db.getCharacter(id))
// 트랜잭션 (원자적):
//   await dbPool.transaction(db => {
//     db.insertCharacter(char1);
//     db.insertCharacter(char2);
//   });
