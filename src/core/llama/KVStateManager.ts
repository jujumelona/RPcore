// src/core/llama/KVStateManager.ts
// ════════════════════════════════════════════════════════════════════
// llama.rn KV 세션 자동 저장 / 복원 (AppState 기반)

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS, { RNFSStatResult } from '../../utils/fileSystemCompat';
import { appStorage } from '../../utils/storage';
import llamaEngine from '../llama/LlamaEngine';
import { engineBus } from '../llama/EngineEventBus';
import { logger } from '../../utils/logger';
import kvOffsetTracker from './KVOffsetTracker';
import { trace, markSaveStarted, markSaveCompleted, clearMark, getMarkValue } from '../../utils/KVTrace';
import { chapterLogTracker } from '../../utils/ChapterLogTracker';
import { getRuntimeInterferenceReasons, isRuntimeInterferenceSuspended } from '../../utils/RuntimeInterferenceGuard';
import { KV_CACHE_TYPE_K, KV_CACHE_TYPE_V } from './kv-spec-constants';

const KV_BASE = `${RNFS.DocumentDirectoryPath}/kv_cache`;
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_FILE = '.last_access';
const LEGACY_STORY_BASE_MODEL_ID = 'gemma-3-1b-qat';

// ✅ [DUAL-BACKUP] 세션 파일 최소 유효 크기 (바이트)
// 0바이트 외에도 비정상적으로 작은 파일(크래시 중 부분 기록)을 오염으로 간주
const MIN_SESSION_SIZE_BYTES = 1024;
const sanitizeModelId = (modelId: string) => String(modelId).replace(/[^a-zA-Z0-9._-]/g, '_');
const baseMarkKey = (storyId: string, modelId?: string) =>
  modelId ? `base_${storyId}_${sanitizeModelId(modelId)}` : `base_${storyId}`;
const chapterMarkKey = (storyId: string, idx: number, modelId?: string) =>
  modelId ? `chapter_${storyId}_${idx}_${sanitizeModelId(modelId)}` : `chapter_${storyId}_${idx}`;
const sessionMarkKey = (storyId: string, modelId?: string) =>
  modelId ? `session_${storyId}_${sanitizeModelId(modelId)}` : `session_${storyId}`;

export const kvPath = {
  dir: (sid: string) => `${KV_BASE}/${sid}`,
  base: (sid: string, modelId?: string) =>
    modelId ? `${KV_BASE}/${sid}/base_${sanitizeModelId(modelId)}.bin` : `${KV_BASE}/${sid}/base.bin`,
  chapter: (sid: string, chapterIdOrIdx: string | number, modelId?: string) => {
    // chapterId가 문자열이면 그대로, 숫자면 chapter_N 형태로 변환
    const chapterId = typeof chapterIdOrIdx === 'string' ? chapterIdOrIdx : `chapter_${chapterIdOrIdx}`;
    return modelId ? `${KV_BASE}/${sid}/${chapterId}_${sanitizeModelId(modelId)}.bin` : `${KV_BASE}/${sid}/${chapterId}.bin`;
  },
  session: (sid: string, modelId?: string) =>
    modelId ? `${KV_BASE}/${sid}/session_${sanitizeModelId(modelId)}.bin` : `${KV_BASE}/${sid}/session.bin`,
  // ✅ [DUAL-BACKUP] 이전 세션 백업 경로 (session.bin 저장 전 기존 session.bin → 여기로 이동)
  sessionPrev: (sid: string, modelId?: string) =>
    modelId ? `${KV_BASE}/${sid}/session_${sanitizeModelId(modelId)}.prev.bin` : `${KV_BASE}/${sid}/session.prev.bin`,
  touch: (sid: string) => `${KV_BASE}/${sid}/${TOUCH_FILE}` };

async function _safeMoveFile(src: string, dest: string): Promise<void> {
  const destExists = await RNFS.exists(dest).catch(() => false);
  if (destExists) {
    await RNFS.unlink(dest).catch(() => { });
  }
  await RNFS.moveFile(src, dest);
}

class KVStateManager {
  private sub: ReturnType<typeof AppState.addEventListener> | null = null;
  private _activeStoryId: string | null = null;
  private _activeModelId: string | null = null;
  private _savingStories = new Set<string>();
  private _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _autoSaveSuspendCount = 0;

  // ✅ [BUG FIX #3] 저장/로드 뮤텍스 분리 — stopAndSave와 loadBase 데드락 방지
  // stopAndSave는 _saveMutex, loadBase/loadChapter/restoreSession은 _loadMutex 사용
  private _saveMutex: Promise<void> = Promise.resolve();
  private _loadMutex: Promise<void> = Promise.resolve();

  private async _withSaveMutex<T>(fn: () => Promise<T>): Promise<T> {
    const p = this._saveMutex.then(fn);
    this._saveMutex = p.then(() => { }).catch(() => { });
    return p;
  }

  private async _withLoadMutex<T>(fn: () => Promise<T>): Promise<T> {
    const p = this._loadMutex.then(fn);
    this._loadMutex = p.then(() => { }).catch(() => { });
    return p;
  }

  // installBase는 저장 작업이므로 _saveMutex 사용
  private async _withMutex<T>(fn: () => Promise<T>): Promise<T> {
    return this._withSaveMutex(fn);
  }

  private _periodicSaveTimer: ReturnType<typeof setInterval> | null = null;
  private _isAutoSaveSuspended(): boolean {
    return this._autoSaveSuspendCount > 0;
  }

  suspendAutoSave(reason: string = 'unknown'): () => void {
    this._autoSaveSuspendCount += 1;
    logger.log(`[KVStateManager] autosave suspend++ (${reason}) => ${this._autoSaveSuspendCount}`);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._autoSaveSuspendCount = Math.max(0, this._autoSaveSuspendCount - 1);
      logger.log(`[KVStateManager] autosave suspend-- (${reason}) => ${this._autoSaveSuspendCount}`);
    };
  }

  /** 주기적 자동저장 간격 (ms) — 갑작스러운 종료 대비 */
  private static readonly AUTO_SAVE_INTERVAL_MS = 60_000; // 60초

  mount(storyId: string, modelId?: string) {
    // ✅ [FIX] mount 시 이전 타이머 누수 방지
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = null;
    }
    // ✅ [FIX] 주기적 저장 타이머 초기화
    if (this._periodicSaveTimer) {
      clearInterval(this._periodicSaveTimer);
      this._periodicSaveTimer = null;
    }

    this.sub?.remove();
    this._activeStoryId = storyId;
    this._activeModelId = modelId ?? null;

    // ✅ [FIX] 스토리 전환 시 이전 오프셋 스냅샷 초기화
    kvOffsetTracker.reset();

    this.sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') {
        if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = setTimeout(() => {
          this._saveDebounceTimer = null;
          if (isRuntimeInterferenceSuspended()) {
            logger.log(
              `[KVStateManager] autosave skipped (AppState) — runtime guard active: ${getRuntimeInterferenceReasons().join(', ')}`,
            );
            return;
          }
          if (this._isAutoSaveSuspended()) {
            logger.log('[KVStateManager] autosave skipped (AppState) — init/build in progress');
            return;
          }
          if (this._activeStoryId === storyId) {
            this.stopAndSave(storyId, this._activeModelId ?? undefined);
          }
        }, 300);
      }
    });

    // ✅ [FIX] 주기적 자동저장 — 갑작스러운 종료(OOM/크래시) 대비
    // AppState 이벤트는 OOM kill / 강제 종료 시 발화하지 않음.
    // 60초마다 세션을 자동 저장해 최대 손실 범위를 1분 이내로 제한함.
    this._periodicSaveTimer = setInterval(() => {
      if (this._activeStoryId === storyId) {
        if (isRuntimeInterferenceSuspended()) {
          logger.log(
            `[KVStateManager] autosave skipped (interval) — runtime guard active: ${getRuntimeInterferenceReasons().join(', ')}`,
          );
          return;
        }
        if (this._isAutoSaveSuspended()) {
          logger.log('[KVStateManager] autosave skipped (interval) ??init/build in progress');
          return;
        }
        const engineState = llamaEngine.getState();
        if (engineState === 'generating') {
          logger.log('[KVStateManager] 주기적 저장 스킵 — 생성 중');
          return;
        }
        this.stopAndSave(storyId, this._activeModelId ?? undefined)
          .catch(() => { /* 주기적 저장 실패는 무시 */ });
      }
    }, KVStateManager.AUTO_SAVE_INTERVAL_MS);

    // ✅ [FIX] 시작 시 .tmp 잔류 파일 정리 — 이전 갑작스러운 종료로 남은 파일
    this._cleanupStaleTmpFiles(storyId).catch(() => { });

    this._touchStory(storyId).catch(() => { });
  }

  unmount() {
    this.sub?.remove();
    this.sub = null;
    this._activeStoryId = null;
    this._activeModelId = null;
    this._autoSaveSuspendCount = 0;
    // ✅ [FIX] unmount 시 타이머, 오프셋 정리 및 진행 중인 저장 잠금 해제
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = null;
    }
    // ✅ [FIX] 주기적 저장 타이머 해제
    if (this._periodicSaveTimer) {
      clearInterval(this._periodicSaveTimer);
      this._periodicSaveTimer = null;
    }
    this._savingStories.clear();
    // NOTE:
    // unmount()는 AppState/autosave 리스너 정리용으로도 자주 호출된다.
    // 여기서 offset까지 reset하면 React StrictMode effect replay나
    // 일시적인 화면 재정비 후 `kvInitKey`는 유지되는데 base/chapter offset만 0으로
    // 사라져 첫 generate에서 n_keep=512 fallback으로 내려가는 문제가 생긴다.
    // 실제 스토리/모델 전환 시에는 mount()에서 reset하고,
    // 모델 교체 시에는 LlamaEngine.release()가 tracker를 정리하므로 여기서는 보존한다.
    logger.log('[KVStateManager] unmount: listeners cleaned up, preserving KV offsets');
  }

  async stopAndSave(storyId: string, modelId?: string): Promise<void> {
    if (isRuntimeInterferenceSuspended()) {
      logger.log(
        `[KVStateManager] stopAndSave skipped — runtime guard active: ${getRuntimeInterferenceReasons().join(', ')}`,
      );
      return;
    }
    if (this._savingStories.has(storyId)) return;
    // ✅ [BUG FIX #3] stopAndSave는 _saveMutex 사용
    return this._withSaveMutex(async () => {
      if (this._savingStories.has(storyId)) return;
      this._savingStories.add(storyId);
    const resolvedModelId =
      modelId ?? (this._activeStoryId === storyId ? this._activeModelId ?? undefined : undefined);
    const path     = kvPath.session(storyId, resolvedModelId);
    const prevPath = kvPath.sessionPrev(storyId, resolvedModelId);
    try {
      await llamaEngine.stopGeneration().catch(() => { });
      trace('session:stop_and_save:start', { storyId });

      const engineState = llamaEngine.getState();
      if (engineState === 'loading' || engineState === 'error') {
        logger.warn(`[KVStateManager] 세션 저장 스킵 — 엔진 상태: ${engineState}`);
        return;
      }

      await RNFS.mkdir(kvPath.dir(storyId)).catch(() => { });
      const tmpPath = path + '.tmp';
      try {
        markSaveStarted(sessionMarkKey(storyId, resolvedModelId));
        await llamaEngine.saveSession(tmpPath);

        const savedStat = await RNFS.stat(tmpPath).catch(() => null);
        if (!savedStat || Number(savedStat.size) < MIN_SESSION_SIZE_BYTES) {
          throw new Error(`[KVStateManager] KV 세션 저장 실패 — 파일 크기 이상 (${savedStat?.size ?? 0} bytes)`);
        }

        // ✅ [DUAL-BACKUP] session.bin → session.prev.bin 회전 후 tmp → session.bin
        // 순서: 1) 기존 session.bin이 있으면 → session.prev.bin으로 이동 (백업)
        //       2) session.tmp → session.bin (새 최신 파일)
        // 이 순서를 지키면 크래시가 발생해도 session.prev.bin이 항상 이전의 유효한 상태를 보유함
        const existingSessionStat = await RNFS.stat(path).catch(() => null);
        if (existingSessionStat && Number(existingSessionStat.size) >= MIN_SESSION_SIZE_BYTES) {
          // 기존 session.bin이 유효한 경우에만 백업으로 이동 (손상된 파일을 prev로 올리지 않음)
          await _safeMoveFile(path, prevPath).catch(() => {
            logger.warn('[KVStateManager] session.bin → session.prev.bin 이동 실패 (무시)');
          });
          trace('session:backup_rotated', { storyId });
        }

        markSaveCompleted(sessionMarkKey(storyId, resolvedModelId));
        await _safeMoveFile(tmpPath, path);
        await kvOffsetTracker.saveOffsets(storyId).catch(() => { });
        await chapterLogTracker.flushAll().catch(() => { });
        trace('session:stop_and_save:ok', { storyId });
      } catch (saveErr) {
        await RNFS.unlink(tmpPath).catch(() => { });
        clearMark(sessionMarkKey(storyId, resolvedModelId));
        throw saveErr;
      }
    } catch (e) {
      logger.warn('[KVStateManager] 세션 저장 실패:', e);
    } finally {
      this._savingStories.delete(storyId);
    }
    });
  }

  /**
   * ✅ [FIX] 갑작스러운 종료로 남은 .tmp 잔류 파일 정리
   * mount() 시 호출 — 이전 크래시로 생긴 불완전한 .tmp 파일을 제거해
   * 디스크 낭비 및 혼동 방지.
   */
  private async _cleanupStaleTmpFiles(storyId: string): Promise<void> {
    try {
      const dir = kvPath.dir(storyId);
      if (!(await RNFS.exists(dir).catch(() => false))) return;
      const files = await RNFS.readDir(dir).catch(() => [] as RNFSStatResult[]);
      const tmpFiles = files.filter((f) => f.name.endsWith('.tmp'));
      if (tmpFiles.length === 0) return;
      await Promise.allSettled(tmpFiles.map((f) => RNFS.unlink(f.path).catch(() => {})));
      logger.log(`[KVStateManager] .tmp 잔류 파일 ${tmpFiles.length}개 정리 완료`);
    } catch { }
  }

  private async _touchStory(storyId: string): Promise<void> {
    try {
      await RNFS.mkdir(kvPath.dir(storyId)).catch(() => { });
      await RNFS.writeFile(kvPath.touch(storyId), String(Date.now()), 'utf8');
    } catch { }
  }

  async installBase(storyId: string, srcPath: string, modelId?: string): Promise<void> {
    return this._withMutex(async () => {
      await RNFS.mkdir(kvPath.dir(storyId)).catch(() => { });
      const dest = kvPath.base(storyId, modelId);
      logger.log(`[KVStateManager] installBase: src=${srcPath}, dest=${dest}`);
      
      // 소스 파일 크기 확인
      try {
        const srcStat = await RNFS.stat(srcPath);
        logger.log(`[KVStateManager] 소스 파일 크기: ${(Number(srcStat.size) / 1024 / 1024).toFixed(2)} MB`);
        
        if (Number(srcStat.size) === 0) {
          throw new Error('소스 kv_base.bin 파일이 비어있음');
        }
      } catch (e) {
        logger.error(`[KVStateManager] 소스 파일 확인 실패:`, e);
        throw e;
      }
      
      if (srcPath === dest) return;
      const tmpDest = dest + '.tmp';
      try {
        await RNFS.copyFile(srcPath, tmpDest);
        
        // 복사 후 크기 확인
        const tmpStat = await RNFS.stat(tmpDest);
        logger.log(`[KVStateManager] 복사된 파일 크기: ${(Number(tmpStat.size) / 1024 / 1024).toFixed(2)} MB`);
        
        await _safeMoveFile(tmpDest, dest);
        markSaveCompleted(baseMarkKey(storyId, modelId));
        await this._touchStory(storyId).catch(() => { });
      } catch (e) {
        await RNFS.unlink(tmpDest).catch(() => { });
        throw e;
      }
    });
  }

  async loadBase(storyId: string, modelId: string): Promise<'ok' | 'not_found' | 'corrupted'> {
    // ✅ [BUG FIX #3] loadBase는 _loadMutex 사용
    return this._withLoadMutex(async () => {
      const modelPath = kvPath.base(storyId, modelId);
      const legacyPath = kvPath.base(storyId);
      logger.log(`[KVStateManager] 🔍 loadBase 시도: storyId=${storyId}, modelId=${modelId}`);
      logger.log(`[KVStateManager] 🔍 로드 경로: ${modelPath}`);
      
      // ✅ [BUG FIX #2] 중복 exists 체크 제거 — 불필요한 파일시스템 I/O 제거
      const hasModelPath = await RNFS.exists(modelPath).catch(() => false);
      logger.log(`[KVStateManager] 🔍 파일 존재 여부: ${hasModelPath}`);
      
      const shouldUseLegacy = !hasModelPath && modelId === LEGACY_STORY_BASE_MODEL_ID;
      
      // 우선순위: 스토리 디렉토리 > 레거시
      const path = hasModelPath ? modelPath : shouldUseLegacy ? legacyPath : '';
      if (!path) {
        logger.warn('[KVStateManager] base.bin 없음');
        return 'not_found';
      }
      if (!(await RNFS.exists(path))) {
        logger.warn(`[KVStateManager] 최종 경로 확인 실패: ${path}`);
        return 'not_found';
      }
      
      logger.log(`[KVStateManager] 🔍 최종 로드 경로: ${path}`);
      
      const markKey = hasModelPath ? baseMarkKey(storyId, modelId) : baseMarkKey(storyId);
      const tmpPath = path + '.tmp';

      // ✅ [FIX] mark='started' 시 .tmp만 정리, main 파일(이전 정상 저장)은 유지
      const mark = getMarkValue(markKey);
      if (mark === 'started') {
        await RNFS.unlink(tmpPath).catch(() => { });
        clearMark(markKey);
        logger.warn('[KVStateManager] base: 이전 저장 중단 감지 — .tmp 정리, main 파일로 복원 시도');
        if (!(await RNFS.exists(path))) return 'not_found';
      }

      try {
        const stat = await RNFS.stat(path).catch(() => null);
        if (!stat || Number(stat.size) === 0) {
          await RNFS.unlink(path).catch(() => { });
          return 'corrupted';
        }
        
        logger.log(`[KVStateManager] 🔍 base.bin 파일 크기: ${(Number(stat.size) / 1024 / 1024).toFixed(2)} MB`);
        
        // ✅ [BUG FIX] KV 스펙 핑거프린트로 stale base.bin 사전 차단
        const FINGERPRINT_KEY = `kv_fingerprint_${storyId}_${modelId}`;
        const backendInfo = llamaEngine.getBackendInfo();
        const currentFingerprint = JSON.stringify({
          n_ctx: llamaEngine.getNCtx(),
          type_k: KV_CACHE_TYPE_K,
          type_v: KV_CACHE_TYPE_V,
          modelId,
          backend: backendInfo?.backend || 'CPU', // 백엔드 정보 추가
        });
        const savedFingerprint = await AsyncStorage.getItem(FINGERPRINT_KEY).catch(() => null);
        
        if (savedFingerprint && savedFingerprint !== currentFingerprint) {
          logger.warn('[KVStateManager] KV 스펙 변경 감지 — stale base.bin 삭제');
          logger.warn(`[KVStateManager] 저장된: ${savedFingerprint}`);
          logger.warn(`[KVStateManager] 현재: ${currentFingerprint}`);
          await RNFS.unlink(path).catch(() => {});
          await AsyncStorage.removeItem(FINGERPRINT_KEY).catch(() => {});
          return 'not_found'; // → 재생성 경로로 안전하게 폴백
        }
        
        // ✅ [HTP/KV 흐름 로그] 엔진 백엔드 정보 확인
        logger.log(`[KVStateManager] 🔍 현재 엔진 백엔드: ${JSON.stringify(backendInfo)}`);
        logger.log(`[KVStateManager] 🔍 HTP 활성화 여부: ${backendInfo?.useHTP ? 'true' : 'false'}`);
        logger.log(`[KVStateManager] 🔍 실제 디바이스: ${backendInfo?.devices?.join(', ') || 'unknown'}`);
        
        // ✅ [DEBUG] 로그 파일 저장 시작 - 앱 외부 저장소 (파일 탐색기 접근 가능)
        const debugDir = `${RNFS.ExternalDirectoryPath}/debug_logs`;
        await RNFS.mkdir(debugDir).catch(() => {}); // 폴더 없으면 생성
        const debugLogPath = `${debugDir}/loadBase_debug.txt`;
        const debugLogs: string[] = [];
        const addLog = (msg: string) => {
          const timestamp = new Date().toISOString();
          const logLine = `[${timestamp}] ${msg}`;
          debugLogs.push(logLine);
          logger.log(msg);
        };
        
        addLog('[KVStateManager] 📝 로그 저장 경로: ' + debugLogPath);
        
        // ✅ [BUG FIX] loadSession 전에 오프셋 메타데이터 복원 시도
        // 이렇게 하면 loadSession 후 LlamaEngine에서 kvOffsetTracker.baseEnd를 사용 가능
        addLog(`[KVStateManager] 🔍 오프셋 메타데이터 복원 시도...`);
        const offsetRestored = await kvOffsetTracker.loadOffsets(storyId).catch((e) => {
          addLog(`[KVStateManager] 오프셋 복원 중 에러: ${e}`);
          return false;
        });
        if (offsetRestored) {
          addLog(`[KVStateManager] ✅ 오프셋 메타 복원 성공: baseEnd=${kvOffsetTracker.baseEnd}`);
        } else {
          addLog(`[KVStateManager] ⚠️ 오프셋 메타 없음 — loadSession 후 재측정 필요`);
        }
        
        addLog(`[KVStateManager] 🔍 loadSession 호출 직전 — 메모리 로드 시작`);
        
        // ✅ [BUG FIX] loadSession 전에 KV 캐시 클리어
        // llama.rn 0.11.5에서 loadSession 전에 KV 캐시를 깨끗하게 비워야 함
        // 이전 시도(더미 completion)는 실패했으므로 직접 clearKVCache 호출
        addLog(`[KVStateManager] 🔍 KV 캐시 클리어 시작 (loadSession 전)`);
        try {
          const ctx = llamaEngine.getNativeContext();
          if (ctx && ctx.clearKVCache) {
            await ctx.clearKVCache();
            addLog(`[KVStateManager] ✅ KV 캐시 클리어 완료`);
          } else {
            addLog(`[KVStateManager] ⚠️ clearKVCache 메서드 없음 — 스킵`);
          }
        } catch (e) {
          addLog(`[KVStateManager] ⚠️ KV 캐시 클리어 실패 (무시): ${e}`);
        }
        
        const loadStartTime = Date.now();
        
        await llamaEngine.loadSession(path);
        
        const loadElapsed = Date.now() - loadStartTime;
        addLog(`[KVStateManager] ✅ loadSession 완료 (${loadElapsed}ms) — base.bin 로드 성공`);
        
        // ✅ [DEBUG] 로그 파일 저장
        await RNFS.writeFile(debugLogPath, debugLogs.join('\n'), 'utf8').catch(() => {});
        logger.log(`[KVStateManager] 📝 디버그 로그 저장됨: ${debugLogPath}`);
        
        // 공유 가능한 위치에도 복사
        const publicPath = '/storage/emulated/0/Download/loadBase_debug.txt';
        await RNFS.writeFile(publicPath, debugLogs.join('\n'), 'utf8').catch(() => {});
        logger.log(`[KVStateManager] 📝 공개 로그 저장됨: ${publicPath}`);
        
        // 성공 후 핑거프린트 저장
        await AsyncStorage.setItem(FINGERPRINT_KEY, currentFingerprint).catch(() => {});
        
        await this._touchStory(storyId).catch(() => { });
        trace('base:load:ok', { storyId, size: stat.size });
        
        return 'ok';
      } catch (err) {
        logger.error(`[KVStateManager] ❌ base.bin 로드 실패:`, err);
        logger.error(`[KVStateManager] ❌ 에러 상세: ${err instanceof Error ? err.message : String(err)}`);
        logger.error(`[KVStateManager] ❌ 에러 스택: ${err instanceof Error ? err.stack : 'N/A'}`);
        await RNFS.unlink(path).catch(() => { });
        logger.warn('[KVStateManager] base.bin 로드 실패 — 손상 파일 제거');
        engineBus.emitCacheCorrupted({ cacheType: 'base', storyId, modelId });
        return 'corrupted';
      }
    });
  }

  async saveChapter(storyId: string, chapterIdOrIdx: string | number, modelId: string, isJump: boolean = false): Promise<void> {
    // ✅ [BUG FIX #3] saveChapter는 _saveMutex 사용
    return this._withSaveMutex(async () => {
      const chapterId = typeof chapterIdOrIdx === 'string' ? chapterIdOrIdx : `chapter_${chapterIdOrIdx}`;
      trace('chapter:save:start', { storyId, chapterId });
      await RNFS.mkdir(kvPath.dir(storyId)).catch(() => { });
      const dest = kvPath.chapter(storyId, chapterIdOrIdx, modelId);
      const tmpDest = dest + '.tmp';
      try {
        markSaveStarted(chapterMarkKey(storyId, typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx : 0, modelId));
        await llamaEngine.saveSession(tmpDest);
        const savedStat = await RNFS.stat(tmpDest).catch(() => null);
        if (!savedStat || Number(savedStat.size) < MIN_SESSION_SIZE_BYTES) {
          await RNFS.unlink(tmpDest).catch(() => { });
          throw new Error(`[KVStateManager] ${chapterId} KV 저장 실패 — 빈 파일`);
        }
        markSaveCompleted(chapterMarkKey(storyId, typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx : 0, modelId));
        await _safeMoveFile(tmpDest, dest);
      } catch (e) {
        await RNFS.unlink(tmpDest).catch(() => { });
        clearMark(chapterMarkKey(storyId, typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx : 0, modelId));
        throw e;
      }
      await this._touchStory(storyId).catch(() => { });

      const idx = typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx : parseInt(chapterIdOrIdx.replace(/^chapter_/, ''), 10);
      const keepFrom = typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx - 1 : -1;
      const safeModelId = sanitizeModelId(modelId);
      if (keepFrom < 0 || isJump) {
        try {
          const files = await RNFS.readDir(kvPath.dir(storyId));
          await Promise.allSettled(
            files
              .filter(f => {
                const m = f.name.match(/^chapter_(\d+)(?:_([^.]+))?\.bin$/);
                if (!m) return false;
                if (m[2] !== safeModelId) return false;
                const n = parseInt(m[1], 10);
                return n !== idx;
              })
              .map(async f => {
                await RNFS.unlink(f.path).catch(() => { });
              }),
          );
        } catch (e) {
          logger.warn('[KVStateManager] 구 챕터 정리 실패 (무시):', e);
        }
        return;
      }

      try {
        const files = await RNFS.readDir(kvPath.dir(storyId));
        await Promise.allSettled(
          files
            .filter(f => {
              const m = f.name.match(/^chapter_(\d+)(?:_([^.]+))?\.bin$/);
              if (!m || m[2] !== safeModelId) return false;
              const n = m ? parseInt(m[1], 10) : -1;
              return n >= 0 && (n < keepFrom || n > idx);
            })
            .map(async f => {
              await RNFS.unlink(f.path).catch(() => { });
            }),
        );
      } catch (e) {
        logger.warn('[KVStateManager] 구 챕터 정리 실패 (무시):', e);
      }
    });
  }

  async loadChapter(storyId: string, chapterIdOrIdx: string | number, modelId: string): Promise<'ok' | 'not_found' | 'corrupted'> {
    // ✅ [BUG FIX #3] loadChapter는 _loadMutex 사용
    return this._withLoadMutex(async () => {
      const idx = typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx : parseInt(chapterIdOrIdx.replace(/^chapter_/, ''), 10);
      const chapterId = typeof chapterIdOrIdx === 'string' ? chapterIdOrIdx : `chapter_${chapterIdOrIdx}`;
      const path = kvPath.chapter(storyId, chapterIdOrIdx, modelId);
      logger.log(`[KVStateManager] 🔍 loadChapter 시도: ${chapterId}, storyId=${storyId}`);
      logger.log(`[KVStateManager] 🔍 chapter 경로: ${path}`);
      
      if (!(await RNFS.exists(path))) {
        logger.log(`[KVStateManager] 🔍 ${chapterId}.bin 파일 없음`);
        return 'not_found';
      }
      
      const tmpPath = path + '.tmp';
      const markKey = chapterMarkKey(storyId, typeof chapterIdOrIdx === 'number' ? chapterIdOrIdx : 0, modelId);

      // ✅ [FIX] mark='started' 시 .tmp만 정리, main 파일은 유지
      const mark = getMarkValue(markKey);
      if (mark === 'started') {
        await RNFS.unlink(tmpPath).catch(() => { });
        clearMark(markKey);
        logger.warn(`[KVStateManager] chapter[${idx}]: 이전 저장 중단 감지 — .tmp 정리, main 파일로 복원 시도`);
        if (!(await RNFS.exists(path))) return 'not_found';
      }

      try {
        const stat = await RNFS.stat(path).catch(() => null);
        if (!stat || Number(stat.size) === 0) {
          await RNFS.unlink(path).catch(() => { });
          return 'corrupted';
        }
        
        logger.log(`[KVStateManager] 🔍 ${chapterId}.bin 파일 크기: ${(Number(stat.size) / 1024 / 1024).toFixed(2)} MB`);
        
        // ✅ [HTP/KV 흐름 로그] 엔진 백엔드 정보 확인
        const backendInfo = llamaEngine.getBackendInfo();
        logger.log(`[KVStateManager] 🔍 현재 엔진 백엔드: ${JSON.stringify(backendInfo)}`);
        logger.log(`[KVStateManager] 🔍 HTP 활성화 여부: ${backendInfo?.useHTP ? 'true' : 'false'}`);
        logger.log(`[KVStateManager] 🔍 실제 디바이스: ${backendInfo?.devices?.join(', ') || 'unknown'}`);
        
        logger.log(`[KVStateManager] 🔍 loadSession 호출 직전 — ${chapterId} 메모리 로드 시작`);
        
        // ✅ [BUG FIX] loadSession 전에 오프셋 복원
        // 이렇게 해야 loadSession 후 chapterEnd 값을 사용할 수 있음
        logger.log(`[KVStateManager] 🔍 오프셋 메타데이터 복원 시도...`);
        const offsetRestored = await kvOffsetTracker.loadOffsets(storyId).catch((e) => {
          logger.warn(`[KVStateManager] ⚠️ 오프셋 메타 로드 실패:`, e);
          return false;
        });
        
        if (offsetRestored) {
          logger.log(`[KVStateManager] ✅ 오프셋 메타 복원 성공: baseEnd=${kvOffsetTracker.baseEnd}, chapterEnd=${kvOffsetTracker.chapterEnd}`);
        } else {
          logger.log(`[KVStateManager] ⚠️ 오프셋 메타 없음 — loadSession 후 재측정 필요`);
        }
        
        const loadStartTime = Date.now();
        
        await llamaEngine.loadSession(path);
        
        const loadElapsed = Date.now() - loadStartTime;
        logger.log(`[KVStateManager] ✅ loadSession 완료 (${loadElapsed}ms) — chapter_${idx}.bin 로드 성공`);
        
        // ✅ [BUG FIX] chapter 로드 후 _usedTokens를 chapterEnd로 업데이트
        // loadSession은 baseEnd만 복원하므로 chapter 로드 시 명시적으로 chapterEnd 설정 필요
        logger.log(`[KVStateManager] 🔍 현재 kvOffsetTracker 상태: baseEnd=${kvOffsetTracker.baseEnd}, chapterEnd=${kvOffsetTracker.chapterEnd}`);
        
        if (kvOffsetTracker.chapterEnd > 0) {
          llamaEngine.setUsedTokens(kvOffsetTracker.chapterEnd);
          logger.log(`[KVStateManager] ✅ _usedTokens 업데이트: ${kvOffsetTracker.chapterEnd} (chapterEnd)`);
        } else {
          logger.warn(`[KVStateManager] ⚠️ chapterEnd=0, _usedTokens 업데이트 스킵`);
        }
        
        await this._touchStory(storyId).catch(() => { });
        return 'ok';
      } catch (err) {
        logger.error(`[KVStateManager] ❌ chapter_${idx}.bin 로드 실패:`, err);
        logger.error(`[KVStateManager] ❌ 에러 상세: ${err instanceof Error ? err.message : String(err)}`);
        logger.error(`[KVStateManager] ❌ 에러 스택: ${err instanceof Error ? err.stack : 'N/A'}`);
        await RNFS.unlink(path).catch(() => { });
        engineBus.emitCacheCorrupted({ cacheType: 'chapter', storyId, chapterIdx: idx, modelId });
        return 'corrupted';
      }
    });
  }

  async restoreSession(storyId: string, modelId: string): Promise<'ok' | 'not_found' | 'corrupted'> {
    // ✅ [BUG FIX #3] restoreSession은 _loadMutex 사용
    return this._withLoadMutex(async () => {
      const path     = kvPath.session(storyId, modelId);
      const prevPath = kvPath.sessionPrev(storyId, modelId);
      const tmpPath  = path + '.tmp';

      // ✅ [DUAL-BACKUP] 크래시 후 재시작 흐름:
      //   mark='started' → 이전 쓰기가 tmp 단계에서 중단됨 → tmp 정리, session.bin은 유효 가능
      //   mark='completed'/'undefined' → session.bin이 정상 완료된 파일
      //
      // 복원 우선순위:
      //   1순위: session.bin (최신, 유효한 크기)
      //   2순위: session.prev.bin (한 번 이전 저장, session.bin 오염 시 폴백)
      //   3순위: not_found / corrupted

      const mark = getMarkValue(sessionMarkKey(storyId, modelId));
      if (mark === 'started') {
        // .tmp 잔류 파일 정리 (불완전한 쓰기 결과물)
        await RNFS.unlink(tmpPath).catch(() => { });
        clearMark(sessionMarkKey(storyId, modelId));
        logger.warn('[KVStateManager] session: 이전 저장 중단 감지 — .tmp 정리, 백업 파일들로 복원 시도');
      } else {
        // 정상 종료 또는 mark 없음 — 혹시 남은 tmp도 정리
        await RNFS.unlink(tmpPath).catch(() => { });
      }

      // ── 1순위: session.bin 시도 ─────────────────────────────────────────
      const primaryResult = await this._tryLoadSessionFile(path, storyId, modelId, 'session');
      if (primaryResult === 'ok') return 'ok';

      // ── 2순위: session.prev.bin 폴백 ────────────────────────────────────
      if (primaryResult === 'corrupted' || primaryResult === 'not_found') {
        const reason = primaryResult === 'corrupted' ? '오염 감지' : '파일 없음';
        logger.warn(`[KVStateManager] session.bin ${reason} — session.prev.bin 폴백 시도`);
        const prevResult = await this._tryLoadSessionFile(prevPath, storyId, modelId, 'session_prev');
        if (prevResult === 'ok') {
          logger.log('[KVStateManager] ✅ session.prev.bin 폴백 복원 성공');
          trace('session:prev_fallback_ok', { storyId });
          return 'ok';
        }
        logger.warn('[KVStateManager] session.prev.bin 폴백도 실패 — 세션 복원 불가');
        return primaryResult === 'corrupted' ? 'corrupted' : 'not_found';
      }

      return primaryResult;
    });
  }

  /**
   * ✅ [ROLLBACK] 생성 실패 시 이전 세션으로 강제 복원
   * session.prev.bin → session.bin 복사 후 로드
   */
  async restoreFromPrevSession(storyId: string, modelId: string): Promise<'ok' | 'not_found' | 'corrupted'> {
    return this._withLoadMutex(async () => {
      const sessionPath = kvPath.session(storyId, modelId);
      const prevPath = kvPath.sessionPrev(storyId, modelId);

      logger.log('[KVStateManager] 🔄 생성 실패 롤백 — session.prev.bin 복원 시도');

      // session.prev.bin 존재 확인
      if (!(await RNFS.exists(prevPath).catch(() => false))) {
        logger.warn('[KVStateManager] ❌ session.prev.bin 없음 — 롤백 불가');
        return 'not_found';
      }

      // session.prev.bin 크기 검증
      const stat = await RNFS.stat(prevPath).catch(() => null);
      if (!stat || Number(stat.size) < MIN_SESSION_SIZE_BYTES) {
        logger.warn(`[KVStateManager] ❌ session.prev.bin 크기 이상 (${stat?.size ?? 0} bytes) — 롤백 불가`);
        return 'corrupted';
      }

      // session.prev.bin을 session.bin으로 복사
      try {
        await RNFS.copyFile(prevPath, sessionPath);
        logger.log('[KVStateManager] ✅ session.prev.bin → session.bin 복사 완료');
      } catch (err) {
        logger.error('[KVStateManager] ❌ 파일 복사 실패:', err);
        return 'corrupted';
      }

      // 복사된 session.bin 로드
      const result = await this._tryLoadSessionFile(sessionPath, storyId, modelId, 'session_rollback');
      if (result === 'ok') {
        logger.log('[KVStateManager] ✅ 롤백 완료 — 이전 세션 복원됨');
        trace('session:rollback:ok', { storyId });
      } else {
        logger.error('[KVStateManager] ❌ 롤백 실패 — 세션 로드 불가');
      }

      return result;
    });
  }

  /**
   * ✅ [DUAL-BACKUP] 단일 세션 파일 로드 시도 헬퍼
   * 존재 확인 → 크기 검증 → loadSession → 실패 시 파일 제거
   */
  private async _tryLoadSessionFile(
    filePath: string,
    storyId: string,
    modelId: string,
    label: string,
  ): Promise<'ok' | 'not_found' | 'corrupted'> {
    try {
      if (!(await RNFS.exists(filePath).catch(() => false))) return 'not_found';

      const stat = await RNFS.stat(filePath).catch(() => null);
      if (!stat || Number(stat.size) < MIN_SESSION_SIZE_BYTES) {
        logger.warn(`[KVStateManager] ${label}: 파일 크기 이상 (${stat?.size ?? 0} bytes) — 손상 파일 제거`);
        await RNFS.unlink(filePath).catch(() => { });
        engineBus.emitCacheCorrupted({ cacheType: 'session', storyId, modelId });
        return 'corrupted';
      }

      logger.log(`[KVStateManager] 🔍 ${label} 파일 크기: ${(Number(stat.size) / 1024 / 1024).toFixed(2)} MB`);
      logger.log(`[KVStateManager] 🔍 loadSession 호출 직전 — ${label} 메모리 로드 시작`);
      
      await llamaEngine.loadSession(filePath);
      logger.log(`[KVStateManager] 🔍 session 복원 후 kvOffsetTracker 상태: baseEnd=${kvOffsetTracker.baseEnd}, chapterEnd=${kvOffsetTracker.chapterEnd}`);
      const restoredTokens = kvOffsetTracker.chapterEnd > 0
        ? kvOffsetTracker.chapterEnd
        : kvOffsetTracker.baseEnd;
      if (restoredTokens > 0) {
        llamaEngine.setUsedTokens(restoredTokens);
        logger.log(
          `[KVStateManager] ✅ session _usedTokens 업데이트: ${restoredTokens} ` +
          `(${kvOffsetTracker.chapterEnd > 0 ? 'chapterEnd' : 'baseEnd'})`,
        );
      } else {
        logger.warn('[KVStateManager] ⚠️ session offset 없음 — _usedTokens 업데이트 스킵');
      }
      
      logger.log(`[KVStateManager] ✅ loadSession 완료 — ${label} 로드 성공`);
      await this._touchStory(storyId).catch(() => { });
      trace(`${label}:load:ok`, { storyId, size: stat.size });
      return 'ok';
    } catch (err) {
      logger.error(`[KVStateManager] ❌ ${label} 로드 실패:`, err);
      await RNFS.unlink(filePath).catch(() => { });
      engineBus.emitCacheCorrupted({ cacheType: 'session', storyId, modelId });
      return 'corrupted';
    }
  }

  async resetStoryRuntime(storyId: string): Promise<void> {
    const dir = kvPath.dir(storyId);
    if (await RNFS.exists(dir)) {
      const entries = await RNFS.readDir(dir).catch(() => []);
      await Promise.allSettled(
        entries
          // ✅ [DUAL-BACKUP] session.bin, session.prev.bin, session_MODEL.bin, session_MODEL.prev.bin 전부 제거
          .filter(entry => entry.isFile() && /^session(?:_|\.bin|\.prev\.bin|$)/.test(entry.name))
          .map(async entry => {
            await RNFS.unlink(entry.path).catch(() => { });
            // session_MODEL.bin or session_MODEL.prev.bin에서 MODEL 추출
            const modelMatch = entry.name.match(/^session_(.+?)(?:\.prev)?\.bin$/);
            if (modelMatch?.[1]) {
              clearMark(sessionMarkKey(storyId, modelMatch[1]));
            }
          }),
      );
    }

    await kvOffsetTracker.deleteOffsets(storyId).catch(() => { });
    clearMark(`session_${storyId}`);

    if (this._activeStoryId === storyId) {
      kvOffsetTracker.reset();
    }
  }

  async deleteStory(storyId: string): Promise<void> {
    const dir = kvPath.dir(storyId);
    if (await RNFS.exists(dir)) {
      await RNFS.unlink(dir);
    }
    await kvOffsetTracker.deleteOffsets(storyId).catch(() => { });
    clearMark(`session_${storyId}`);
  }

  async gcStaleStories(): Promise<void> {
    try {
      const baseExists = await RNFS.exists(KV_BASE).catch(() => false);
      if (!baseExists) return;
      const entries = await RNFS.readDir(KV_BASE);
      const storyDirs = entries.filter(e => e.isDirectory());
      let removed = 0;
      for (const dir of storyDirs) {
        try {
          const touchPath = `${dir.path}/${TOUCH_FILE}`;
          const hasTouchFile = await RNFS.exists(touchPath).catch(() => false);
          let lastAccess: number;
          if (hasTouchFile) {
            const raw = await RNFS.readFile(touchPath, 'utf8');
            const ts = parseInt(raw, 10);
            lastAccess = Number.isNaN(ts) ? 0 : ts;
          } else {
            const stat = await RNFS.stat(dir.path);
            const mt = stat?.mtime;
            lastAccess = mt instanceof Date ? mt.getTime()
              : typeof mt === 'number' ? mt
              : typeof mt === 'string' ? new Date(mt).getTime()
                : 0;
          }
          const ageMs = Date.now() - lastAccess;
          const isActive = (this._activeStoryId !== null && dir.name === this._activeStoryId) || (lastAccess > 0 && ageMs < 24 * 60 * 60 * 1000);
          if (!isActive && lastAccess > 0 && ageMs > STALE_TTL_MS) {
            await RNFS.unlink(dir.path);
            await kvOffsetTracker.deleteOffsets(dir.name).catch(() => { });
            clearMark(`session_${dir.name}`);
            clearMark(`base_${dir.name}`);
            // ch_kv_ver 챕터 버전 키 정리
            try {
              const allKeys = appStorage.getAllKeys?.();
              if (Array.isArray(allKeys)) {
                const prefix = `ch_kv_ver:`;
                const staleKeys = allKeys.filter((k: string) =>
                  k.startsWith(prefix) && k.includes(`:${dir.name}:`)
                );
                staleKeys.forEach((k: string) => { try { appStorage.remove(k); } catch {} });
              }
            } catch { /* ignore */ }
            removed++;
          }
        } catch { }
      }
      if (removed > 0) logger.log(`[KVStateManager] GC complete: ${removed} removed`);
    } catch { }
  }
}

let _kvStateInstance: KVStateManager | null = null;
function getKvStateInstance(): KVStateManager {
  if (!_kvStateInstance) _kvStateInstance = new KVStateManager();
  return _kvStateInstance;
}
export const kvStateManager = new Proxy({} as KVStateManager, {
  get(_t, p) {
    if (typeof p === 'symbol') return Reflect.get(getKvStateInstance(), p);
    return (getKvStateInstance() as unknown as Record<string, unknown>)[p];
  },
  set(_t, p, v) { (getKvStateInstance() as unknown as Record<string | symbol, unknown>)[p] = v; return true; } });
export default kvStateManager;
