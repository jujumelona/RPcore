// src/core/llama/SessionManager.ts
// ════════════════════════════════════════════════════════════════════
// 시스템 프롬프트 세션 캐시 — llama.rn context.saveSession / loadSession
//
// 왜 필요한가:
//   RP 앱은 매 채팅 시작 시 월드세팅 + 캐릭터 정보 등
//   수백~수천 토큰짜리 시스템 프롬프트를 prefill 해야 함.
//   -> 첫 prefill 후 세션 파일로 저장해두면 다음 실행 시 건너뜀.
//   -> TTFT (첫 토큰까지 대기 시간) 대폭 단축.
//
// 동작 흐름:
//   1. 세션 키 = SHA-256(storyId + systemPrompt) 앞 16자
//   2. 같은 시스템 프롬프트면 저장된 세션 재사용
//   3. 프롬프트가 바뀌면 구 세션 삭제 후 새 세션 저장
//
// OpenCL 백엔드에서 세션 사용 시 initLlama 파라미터에
//    kv_unified: true, flash_attn_type: 'off' 필수 (llama.rn 요구사항)
// ════════════════════════════════════════════════════════════════════

import type { LlamaContext } from 'llama.rn';
import RNFS from '../../utils/fileSystemCompat';
import { logger } from '../../utils/logger';
import { hashString } from '../../utils/hash';

// ── 타입 ──────────────────────────────────────────────────────────

export interface SessionInfo {
  /** 세션 파일 경로 */
  path: string;
  /** 세션 생성 시 사용한 시스템 프롬프트 해시 */
  promptHash: string;
  /** 세션 생성 시각 (ms) */
  savedAt: number;
}

// ── 상수 ──────────────────────────────────────────────────────────

/** 세션 파일 저장 디렉토리 */
function sessionDir(): string { return `${RNFS.DocumentDirectoryPath}/llama_sessions`; }

/** 세션 유효 기간 (ms) — 이 이상 지난 세션은 무효화 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// ── SessionManager ────────────────────────────────────────────────

class SessionManager {

  // ✅ [FIX #7] 주기적 GC를 위한 마지막 실행 시각 추적
  // AppBootstrap에서 앱 시작 시 1회 gcExpiredSessions()를 호출하지만,
  // 장시간 실행 앱이나 빈번한 세션 저장 시 디스크 파일이 누적될 수 있음.
  // saveSession()마다 경과 시간을 확인해 24시간 초과 시 백그라운드 GC 재실행.
  private _lastGcAt = Date.now();
  private readonly _GC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간
  // ── [FIX #5] GC 중복 실행 방지 ────────────────────────────
  // saveSession()이 빠르게 연속 호출되면 24시간 체크를 동시에 통과해
  // gcExpiredSessions()가 병렬로 실행될 수 있음.
  // _gcInProgress 플래그로 동시에 하나만 실행되도록 보호.
  private _gcInProgress = false;

  // ── 초기화 ───────────────────────────────────────────────────

  async ensureDir(): Promise<void> {
    const exists = await RNFS.exists(sessionDir());
    if (!exists) await RNFS.mkdir(sessionDir());
  }

  // ── 세션 로드 시도 ───────────────────────────────────────────
  //
  // 저장된 세션이 있고 시스템 프롬프트가 같으면 loadSession() 호출.
  // 성공 시 true 반환 -> InferenceEngine이 prefill 생략 가능.

  async tryLoadSession(
    context: LlamaContext,
    storyId: string,
    systemPrompt: string,
  ): Promise<boolean> {
    try {
      await this.ensureDir();
      const info = await this._readMeta(storyId);
      if (!info) return false;

      const currentHash = this._hash(systemPrompt);
      if (info.promptHash !== currentHash) {
        logger.log('[SessionManager] 시스템 프롬프트 변경 감지 -> 세션 무효화');
        await this._deleteMeta(storyId);
        await RNFS.unlink(info.path).catch(() => {});
        return false;
      }

      const age = Date.now() - info.savedAt;
      if (age > SESSION_TTL_MS) {
        logger.log('[SessionManager] 세션 만료 -> 삭제');
        await this._deleteMeta(storyId);
        await RNFS.unlink(info.path).catch(() => {});
        return false;
      }

      const fileExists = await RNFS.exists(info.path);
      if (!fileExists) {
        await this._deleteMeta(storyId);
        return false;
      }

      await context.loadSession(info.path);
      logger.log(`[SessionManager] 세션 로드 성공: ${info.path}`);
      return true;
    } catch (e) {
      logger.warn('[SessionManager] 세션 로드 실패 (무시):', e);
      return false;
    }
  }

  // ── 세션 저장 ────────────────────────────────────────────────
  //
  // 시스템 프롬프트 prefill 완료 후 호출.

  async saveSession(
    context: LlamaContext,
    storyId: string,
    systemPrompt: string,
  ): Promise<void> {
    try {
      await this.ensureDir();
      const hash = this._hash(systemPrompt);
      const path = `${sessionDir()}/${storyId}_${hash}.bin`;

      // ✅ [FIX] tmp->rename atomic 저장
      // 이전: context.saveSession(path) 직접 쓰기 -> 앱 kill 시 .bin 손상 + .meta.json 생성됨
      //       -> 다음 실행에서 tryLoadSession -> fileExists=true -> loadSession 크래시
      // 수정: .tmp에 먼저 쓰고 rename -> 부분 쓰기 상태로 .meta.json이 가리키는 일 없음
      const tmpPath = path + '.tmp';
      try {
        await context.saveSession(tmpPath);
        // dest 존재 시 삭제 후 이동 (Android moveFile 안전성)
        const destExists = await RNFS.exists(path).catch(() => false);
        if (destExists) await RNFS.unlink(path).catch(() => {});
        await RNFS.moveFile(tmpPath, path);
      } catch (saveErr) {
        await RNFS.unlink(tmpPath).catch(() => {});
        throw saveErr;
      }

      const info: SessionInfo = {
        path,
        promptHash: hash,
        savedAt: Date.now() };
      await this._writeMeta(storyId, info);
      logger.log(`[SessionManager] 세션 저장 완료: ${path}`);

      // ✅ [FIX #7] saveSession 시 주기적 GC 트리거
      // [BUG FIX] GC 레이스 컨디션 수정
      // 기존: 조건 체크 후 _gcInProgress = true 설정 전에 await 비동기 갭이 있으면 GC 중복 실행 가능
      // 수정: _gcInProgress 플래그를 동기적으로 즉시 설정하여 두 번째 진입을 원천 차단
      if (Date.now() - this._lastGcAt > this._GC_INTERVAL_MS) {
        this.gcExpiredSessions()
          .then(() => {
            // [BUG FIX #46] 성공 시에만 다음 24시간을 기약
            this._lastGcAt = Date.now();
          })
          .catch(e => {
            logger.warn('[SessionManager] 주기적 GC 실패 (다음 저장 시 재시도):', e);
            // 실패 시 _lastGcAt을 0으로 설정해 다음 saveSession에서 즉시 재시도하게 함
            this._lastGcAt = 0;
          });
      }
    } catch (e) {
      logger.warn('[SessionManager] 세션 저장 실패 (무시):', e);
    }
  }

  // ── 특정 스토리 세션 삭제 ────────────────────────────────────

  async clearSession(storyId: string): Promise<void> {
    try {
      const info = await this._readMeta(storyId);
      if (info) {
        await RNFS.unlink(info.path).catch(() => {});
        await this._deleteMeta(storyId);
      }
    } catch (e) {
      logger.warn('[SessionManager] 세션 삭제 실패:', e);
    }
  }

  // ── 전체 세션 삭제 ───────────────────────────────────────────

  async clearAll(): Promise<void> {
    try {
      const exists = await RNFS.exists(sessionDir());
      if (exists) {
        await RNFS.unlink(sessionDir());
        await RNFS.mkdir(sessionDir());
        logger.log('[SessionManager] 전체 세션 삭제 완료');
      }
    } catch (e) {
      logger.warn('[SessionManager] 전체 세션 삭제 실패:', e);
    }
  }

  // ── 만료 세션 GC ─────────────────────────────────────────────

  /**
   * ✅ [FIX #5] 만료 세션 파일 전체 GC
   *
   * 기존 문제: tryLoadSession()은 해당 스토리를 열 때만 만료 체크.
   *   -> 더 이상 플레이하지 않는 스토리의 세션 파일은 SESSION_TTL(7일) 이후에도
   *     디스크에 영구적으로 쌓임. 세션 파일 1개 ≈ 수십~수백 MB.
   *
   * 수정: sessionDir() 내 모든 .meta.json을 읽어 만료된 항목을 일괄 삭제.
   *   AppBootstrap.initApp()에서 await 없이 백그라운드로 호출 (UI 블로킹 없음).
   *
   * 삭제 대상:
   *   - SESSION_TTL_MS(7일) 초과한 세션
   *   - .meta.json은 있지만 실제 .bin 파일이 없는 고아 메타 파일
   */
  async gcExpiredSessions(): Promise<void> {
    if (this._gcInProgress) return;
    this._gcInProgress = true;
    try {
      await this.ensureDir();
      const items = await RNFS.readDir(sessionDir());
      const metaFiles = items.filter(f => f.name.endsWith('.meta.json'));

      // ✅ [FIX] for 루프 순차 I/O -> Promise.allSettled 병렬 삭제
      // 세션 파일이 많을 때 순차 unlink 대기 시간 제거.
      // allSettled: 개별 삭제 실패가 전체 GC를 중단시키지 않음.
      //
      // ✅ [FIX] removed 카운터 Race Condition 수정
      // 기존: let removed = 0 후 병렬 async 함수들이 removed++ -> non-atomic 증가
      //       JS 싱글 스레드라 데이터 손실은 없지만 로그 숫자가 부정확해질 수 있음
      // 수정: 각 작업이 boolean을 반환 -> allSettled 결과에서 fulfilled+true 수를 집계
      //       카운터 공유 없이 순수 함수형으로 처리
      const results = await Promise.allSettled(
        metaFiles.map(async (metaFile): Promise<boolean> => {
          try {
            const raw = await RNFS.readFile(metaFile.path, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return false;
            const info: SessionInfo = parsed as SessionInfo;

            const isExpired  = Date.now() - info.savedAt > SESSION_TTL_MS;
            const binMissing = !(await RNFS.exists(info.path));

            if (isExpired || binMissing) {
              // .bin 과 .meta.json 병렬 삭제
              await Promise.allSettled([
                RNFS.unlink(info.path),
                RNFS.unlink(metaFile.path),
              ]);
              return true;  // 삭제됨
            }
            return false;   // 유효한 세션 — 유지
          } catch {
            // 파싱 불가 메타 파일 -> 고아로 간주하고 삭제
            await RNFS.unlink(metaFile.path).catch(() => {});
            return true;    // 삭제됨
          }
        }),
      );

      // fulfilled + true인 항목만 집계 (원자적, 공유 변수 없음)
      const removed = results.filter(
        r => r.status === 'fulfilled' && r.value === true,
      ).length;

      if (removed > 0) {
        logger.log(`[SessionManager] GC 완료: ${removed}개 만료 세션 삭제`);
      }

      // ── 고아 .bin 수거 ───────────────────────────────────────
      // .meta.json 없이 남은 .bin 파일 삭제 (저장 도중 프로세스 kill, 재설치 등)
      // 세션 .bin 1개 = 수십~수백 MB이므로 반드시 수거 필요.
      // [BUG FIX #5] 만료 세션 삭제 후 디렉터리를 재읽어 freshItems로 전달.
      // 이전: 위의 병렬 삭제(unlink) 완료 전 items(스냅샷)로 _gcOrphanBins 호출 ->
      //       방금 삭제된 .bin이 orphan 목록에 포함 -> 이미 없는 파일 unlink 시도 (경고 로그)
      // 수정: unlink 완료 후 readDir 재호출 -> 실제 남아있는 파일만 전달.
      const freshItems = await RNFS.readDir(sessionDir());
      const orphanRemoved = await this._gcOrphanBins(freshItems);
      if (orphanRemoved > 0) {
        logger.log(`[SessionManager] GC: 고아 .bin ${orphanRemoved}개 추가 삭제`);
      }
    } catch (e) {
      logger.warn('[SessionManager] GC 실패:', e);
      throw e;
    } finally {
      this._gcInProgress = false;
    }
  }

  // ── 고아 .bin 파일 수거 ──────────────────────────────────────────
  //
  // meta 파일에 참조되지 않은 .bin 파일을 삭제.
  // RNFS.readDir 결과를 인자로 받아 중복 I/O 방지.
  //
  private async _gcOrphanBins(items: Awaited<ReturnType<typeof RNFS.readDir>>): Promise<number> {
    try {
      const metaFiles = items.filter(f => f.name.endsWith('.meta.json'));
      // [BUG FIX] .bin.tmp 파일도 수거 대상에 포함
      // 이전: f.name.endsWith('.bin') 만 검사 -> 앱 kill로 남은 *.bin.tmp 파일 미수거
      //       세션 파일 1개 = 수십~수백 MB -> 장시간 디스크 누적
      // 수정: .bin 과 .bin.tmp 모두 포함 (tmp는 meta에 절대 참조되지 않으므로 항상 삭제 대상)
      const binFiles  = items.filter(f => f.name.endsWith('.bin') || f.name.endsWith('.bin.tmp'));
      if (binFiles.length === 0) return 0;

      // 현재 meta 파일이 참조하는 bin 경로 수집
      const referencedPaths = new Set<string>();
      await Promise.allSettled(
        metaFiles.map(async (mf) => {
          try {
            const raw  = await RNFS.readFile(mf.path, 'utf8');
            const parsedMeta = JSON.parse(raw);
            if (!parsedMeta || typeof parsedMeta !== 'object') return;
            const info = parsedMeta as SessionInfo;
            referencedPaths.add(info.path);
          } catch { /* 파싱 실패 메타 -> meta GC 패스에서 이미 처리 */ }
        }),
      );

      // 참조되지 않은 .bin 삭제
      const orphans = binFiles.filter(f => !referencedPaths.has(f.path));
      await Promise.allSettled(orphans.map(f => RNFS.unlink(f.path).catch(() => {})));
      return orphans.length;
    } catch {
      return 0;
    }
  }

  // ── 내부: 메타 파일 R/W ──────────────────────────────────────

  private _metaPath(storyId: string): string {
    return `${sessionDir()}/${storyId}.meta.json`;
  }

  private async _readMeta(storyId: string): Promise<SessionInfo | null> {
    try {
      const p = this._metaPath(storyId);
      if (!(await RNFS.exists(p))) return null;
      const raw = await RNFS.readFile(p, 'utf8');
      const _parsed = JSON.parse(raw);
      return (_parsed && typeof _parsed === 'object') ? _parsed as SessionInfo : null;
    } catch {
      return null;
    }
  }

  private async _writeMeta(storyId: string, info: SessionInfo): Promise<void> {
    const path = this._metaPath(storyId);
    const tmp  = path + '.tmp';
    try {
      await RNFS.writeFile(tmp, JSON.stringify(info), 'utf8');
      const exists = await RNFS.exists(path).catch(() => false);
      if (exists) await RNFS.unlink(path).catch(() => {});
      await RNFS.moveFile(tmp, path);
    } catch (e) {
      await RNFS.unlink(tmp).catch(() => {});
      throw e;
    }
  }

  private async _deleteMeta(storyId: string): Promise<void> {
    await RNFS.unlink(this._metaPath(storyId)).catch(() => {});
  }

  // ── 내부: 간단한 해시 (djb2) ─────────────────────────────────
  //
  // ── 내부: 64비트 복합 해시 ──────────────────────────────────
  //
  // ✅ [FIX #13] djb2 32비트(8자 hex) -> 64비트 복합 해시로 교체
  //   djb2(seed=5381) + FNV-1a(seed=2166136261) 두 해시 16자 hex로 결합
  private _hash(str: string): string { return hashString(str); }
}

let _sessionMgrInstance: SessionManager | null = null;
function getSessionMgrInstance(): SessionManager {
  if (!_sessionMgrInstance) _sessionMgrInstance = new SessionManager();
  return _sessionMgrInstance;
}
export const sessionManager = new Proxy({} as SessionManager, {
  get(_t, p) {
    if (typeof p === 'symbol') return Reflect.get(getSessionMgrInstance(), p);
    return (getSessionMgrInstance() as unknown as Record<string, unknown>)[p];
  },
  set(_t, p, v) { (getSessionMgrInstance() as unknown as Record<string|symbol, unknown>)[p] = v; return true; } });
export default sessionManager;
