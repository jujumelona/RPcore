// src/core/llama/KVCacheManager.ts
// llama.rn KV cache 세션 저장/로드/버전 관리
//
//  사용 흐름:
//    [앱 최초 설치 / 모델 다운로드 후]
//      1. downloadBaseKVIfNeeded(modelId) -> base.bin 1회 다운로드
//         R2 kv_cache/base/{modelId}.bin -> 로컬 저장
//    [스토리 시작]
//      1. hasKV(storyId, chapterId) -> true면 loadKV()
//      2. false면 일반 prefill (폴백)
//
//    [챕터 전환]
//      1. 이전 챕터 KV는 그대로 유지
//      2. 새 챕터 KV가 있으면 loadKV()로 교체
//      3. 없으면 현재 context 그대로 이어서 사용
//
//    [앱 종료/재시작]
//      1. saveKV(storyId, chapterId) -> 현재 진행 상태 저장
//      2. 재시작 후 loadKV()로 복원
//
//  버전 주의사항
//    llama.rn 버전이 바뀌면 KV 포맷 변경 가능
//    - 버전 불일치 감지 시 폴백 (크래시 없이 재prefill)
//  [v7] llama.cpp b8095 변경사항 (kv-spec.txt 전면 준수):
//    - flash_attn ON 전환 시 KV 포맷 전치(transposed) 변경
//      ON/OFF 전환 시 포맷 불일치 -> 기존 .bin 파일 전부 무효화
//    - cache_type_k = q8_0 (전 백엔드 통일)
//    - base.bin 서버 생성 명령 (llama-cli) 업데이트:
//        --cache-reuse 256, --no-context-shift 추가
//    - spec_type: ngram-map-k (b8095 이후 RP 최적)
//
//  ※  base.bin 서버 생성 명령 (v7 기준, b8095):
//    모델별 --ctx-size 와 --rope-freq-base 는 kv-spec.txt의 값으로 지정
//
//    [gemma-3n-E2B] --ctx-size 8192, --rope-freq-base 500000
//    llama-cli \
//      -m gemma-3n-E2B-it-Q4_K_M.gguf \
//      --ctx-size 8192 \
//      --batch-size 2048 \
//      --ubatch-size 2048 \
//      --cache-type-k q8_0 \
//      --cache-type-v q4_0 \
//      --flash-attn \
//      --keep 512 \
//      --rope-freq-base 500000 \
//      --cache-reuse 256 \
//      --no-context-shift \
//      --threads 4 \
//      --file prompt.txt \
//      --prompt-cache kv_output.bin \
//      --prompt-cache-all \
//      -n 0
//
//    [gemma-3-1b-qat / gemma-3-270m] --ctx-size 4096, --rope-freq-base 10000
//    llama-cli \
//      -m model.gguf \
//      --ctx-size 4096 \
//      --batch-size 2048 \
//      --ubatch-size 2048 \
//      --cache-type-k q8_0 \
//      --cache-type-v q4_0 \
//      --flash-attn \
//      --keep 512 \
//      --rope-freq-base 10000 \
//      --cache-reuse 256 \
//      --no-context-shift \
//      --threads 4 \
//      --file prompt.txt \
//      --prompt-cache kv_output.bin \
//      --prompt-cache-all \
//      -n 0
// ════════════════════════════════════════════════════════════════════════════════

import RNFS from '../../utils/fileSystemCompat';
import { storage, appStorage } from '../../utils/storage';
import modelDownloader from './ModelDownloader';
import { logger } from '../../utils/logger';
import { KV_VERSION } from './kv-spec-constants';
import { MODELS, MODELS_DIR } from '../../models/ModelConfig';
import { useAuthStore } from '../../store/authStore';

// ── 상수 ─────────────────────────────────────────────────────────────────────
//
// KV 포맷 변경 시 반드시 버전 올릴 것 (구 bin 자동 무효화됨)
//    버전 값은 kv-spec-constants.ts 의 KV_VERSION 에서 중앙 관리됩니다.
//
// 버전 이력:
//   '1' — type_k=Q4_0, type_v=Q4_0 (구버전, 호환 불가)
//   '2' — type_k=Q8_0, type_v=Q4_0, flash_attn=OFF
//   '3' — type_k=Q8_0, type_v=Q4_0, flash_attn=ON, n_ubatch 조정
//   '4' — use_mmap=true 명시, n_keep=512, rope_freq_base 동적
//   '5' — flash_attn OFF 전역 고정
//   '6' — 프롬프트 구조 변경 (고정룰 앞으로 이동),
//          base.bin 지원 추가 (고정룰 사전 prefill KV),
//          id_slot + n_cache_reuse=256 적용
//   '7' — flash_attn OFF → ON 전환 (kv-spec: flash_attn = ON)
//          flash_attn ON/OFF 시 KV 포맷 전치(transposed) 변경 → 포맷 불일치
//          → 기존 v6 .bin 파일 전부 무효화 필요
//          cache_type_k = q8_0 전 백엔드 통일 (kv-spec)
//   '8' — flash_attn ON → OFF 재전환 (Android OpenCL 환경 필수)
//          llama.rn 공식: OpenCL에서 session 로드 시 flash_attn_type: 'off' 필수
//          → 기존 v7 .bin 파일 전부 무효화 필요

// 위 값을 직접 수정하지 말 것. kv-spec-constants.ts 에서 중앙 관리됩니다.
const LLAMA_RN_VERSION = KV_VERSION;  // kv-spec-constants.KV_VERSION
const VERSION_KEY         = 'llama_rn_kv_version';
const BASE_KV_VERSION_KEY = 'llama_rn_base_kv_version';

/** 다운로드 타임아웃: 120초 (대용량 base.bin 고려) */
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MIN_BASE_KV_BYTES = 5 * 1024 * 1024;
// ─────────────────────────────────────────────────────────────────────────────

export interface KVLoadResult {
  /** 로드 성공 여부 */
  loaded: boolean;
  /** 실패 이유 (디버그용) */
  reason?: 'not_found' | 'version_mismatch' | 'load_error';
}

// ── KVCacheManager ───────────────────────────────────────────────────────────

class KVCacheManager {
  // [BUG FIX #3] 챕터 다운로드 진행 상태를 클래스 필드로 관리.
  // 이전: downloadAllChapterKVsIfNeeded 함수 스코프 Set -> 호출마다 새로 생성되어
  //       initStory + initChapter에서 동시 호출 시 중복 다운로드 / 파일 충돌 발생.
  // 수정: 인스턴스 수명 동안 유지되는 클래스 필드로 교체 -> 교차 호출 간 중복 방지.
  private _inProgressDownloads = new Set<string>();
  // [BUG FIX] base KV 다운로드 중복 방지 가드 (진행 중인 다운로드 Promise 공유)
  private _inProgressBaseDownloads = new Map<string, { promise: Promise<boolean>, progressCallbacks: Set<(pct: number) => void> }>();

  private _getModelDirSafe(modelId: string): string {
    try {
      return modelDownloader.getModelDir(modelId);
    } catch {
      const safeModelId = String(modelId).replace(/[^a-zA-Z0-9._-]/g, '_');
      return `${RNFS.DocumentDirectoryPath}/${MODELS_DIR}/${safeModelId}`;
    }
  }

  // ── 버전 체크 ────────────────────────────────────────────────────────────────

  /**
   * 현재 앱의 llama.rn 버전과 저장된 버전이 일치하는지 확인
   * 불일치 시 기존 KV 파일 전부 무효화
   */
  async checkVersionAndPurgeIfNeeded(modelId: string): Promise<void> {
    const saved = await storage.getItem(VERSION_KEY);

    if (saved === LLAMA_RN_VERSION) return;

    // [BUG FIX #13] storage가 in-memory fallback이면 getItem은 항상 undefined 반환.
    // undefined !== '7' -> 매 앱 시작마다 전체 KV 퍼지 반복하는 버그 방지.
    // MMKV 초기화 실패 상황(버그2 연쇄)에서 로컬 파일 기반으로 버전 확인.
    if (saved === undefined || saved === null) {
      // storage 쓰기 테스트: 쓰고 바로 읽어서 실제 작동하는지 확인
      // [BUG-10 FIX] setItem 실패 시 .catch(() => {}) 대신 probe = null 처리해 오판 방지
      const probeVal = `probe_${Date.now()}`;
      let probe: string | null = null;
      try {
        await storage.setItem('__kv_ver_probe__', probeVal);
        probe = await storage.getItem('__kv_ver_probe__') as string | null;
        await storage.removeItem('__kv_ver_probe__').catch(() => {});
      } catch {
        probe = null;
      }

      if (probe !== probeVal) {
        // storage가 작동 안 함 → 퍼지 스킵 (중복 퍼지 방지)
        // ✅ [BUG FIX #12] probe 실패 시 VERSION_KEY 저장 없이 return
        // → 매 앱 시작마다 동일한 purge 시도 반복하는 버그는 이미 존재하나,
        //   storage 자체가 작동 안 하므로 VERSION_KEY를 저장해도 의미 없음
        //   (storage가 작동할 때는 아래 setItem 호출로 정상 저장됨)
        logger.warn('[KVCacheManager] storage 비작동 — version purge 스킵');
        return;
      }
    }

    logger.warn(
      `[KVCacheManager] version mismatch (saved=${saved ?? 'none'} current=${LLAMA_RN_VERSION}) -> purging local KV files`,
    );
    await this._purgeAllModelsForVersionUpgrade(modelId);
    await storage.setItem(VERSION_KEY, LLAMA_RN_VERSION);
  }

  // ── Base KV (고정룰 사전 prefill) ──────────────────────────────────────────

  /**
   * 모델 base.bin 저장 경로
   */
  getBaseKVPath(modelId: string): string {
    const dir = this._getModelDirSafe(modelId);
    return `${dir}/kv_base.bin`;
  }

  async hasBaseKV(modelId: string): Promise<boolean> {
    const path = this.getBaseKVPath(modelId);
    return RNFS.exists(path).catch(() => false);
  }

  private _getServerBaseKVUrl(serverUrl: string, modelId: string): string {
    const trimmedServerUrl = serverUrl.replace(/\/$/, '');
    return `${trimmedServerUrl}/r2/download/beta/kv_cache/base/kv_base_${encodeURIComponent(modelId)}.bin`;
  }

  /**
   * 서버에서 base.bin 다운로드 (없을 때만)
   *
   * @param modelId    모델 ID
   * @param serverUrl  워커 서버 URL
   * @returns          true = 성공/이미 최신, false = 없음/실패
   *
   * ✅ [FIX] 다운로드 타임아웃 추가 (120초)
   *    이전: 느린 네트워크에서 downloadFile이 무한 대기 가능
   *    수정: AbortController + setTimeout으로 타임아웃 처리
   */
  async downloadBaseKVIfNeeded(
    modelId: string,
    serverUrl: string,
    // ✅ [FIX] 서버에 실제로 파일 요청하는 순간 호출되는 콜백 — recordPlay 카운트용
    onServerRequest?: () => void,
    // [FIX #7] 다운로드 진행률 콜백 — UI 블로킹 없이 진행률 표시 가능
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    // [BUG-6 FIX] base KV 중복 다운로드 시 기존 Promise 반환 + 새 콜백 등록
    const existing = this._inProgressBaseDownloads.get(modelId);
    if (existing) {
      if (onProgress) existing.progressCallbacks.add(onProgress);
      logger.log(`[KVCacheManager] base KV 다운로드 이미 진행 중 — 기존 작업에 대기: ${modelId}`);
      return existing.promise;
    }

    const callbacks = new Set<(pct: number) => void>();
    if (onProgress) callbacks.add(onProgress);

    // 통합 프로그레스 콜백: 모든 등록된 리스너에게 전송
    const multiProgress = (pct: number) => {
      callbacks.forEach(cb => cb(pct));
    };

    const p = (async () => {
      try {
        return await this._downloadBaseKVIfNeededInner(modelId, serverUrl, onServerRequest, multiProgress, signal);
      } finally {
        callbacks.clear(); // [BUG FIX #2] 외부 콜백 리스너들의 클로저 참조 해제
        this._inProgressBaseDownloads.delete(modelId);
      }
    })();

    this._inProgressBaseDownloads.set(modelId, { promise: p, progressCallbacks: callbacks });
    return p;
  }

  private async _downloadBaseKVIfNeededInner(
    modelId: string,
    serverUrl: string,
    onServerRequest?: () => void,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      // [BUG FIX #11] info fetch에 타임아웃 추가
      // 이전: fetch()에 AbortSignal 없음 -> 느린/오프라인 네트워크에서 무한 대기
      //       다운로드 자체에는 _withTimeout이 있지만 info 요청 단계가 누락됨
      // 수정: AbortController + 10초 타임아웃으로 info fetch 보호
      // [BUG FIX #20] 타이머를 fetch() 이후에 클리어하면 .json() body 수신 중 무한 대기 가능
      // 이전: try { infoRes = await fetch(...) } finally { clearTimeout(infoTimer) }
      //       -> 서버가 헤더만 빠르게 보내고 body를 지연하면 json()에서 무한 대기
      //       AbortSignal이 body stream에도 연결되지만 타이머가 이미 취소됨
      // 수정: fetch() + json() 전체를 타이머 내에서 처리
      const info: { exists: boolean; url?: string; llamaRnVersion?: string } = {
        exists: true,
        url: this._getServerBaseKVUrl(serverUrl, modelId),
        llamaRnVersion: LLAMA_RN_VERSION,
      };
      logger.log(`[KVCacheManager] base KV URL 확인: ${info.url}`);
      if (false) {
      const infoAbort = new AbortController();
      const infoTimer = setTimeout(() => infoAbort.abort(), 5_000);
      const [joinedSignal, cleanup] = this._joinSignals(infoAbort.signal, signal);
      let infoRes: Response;
      let info: { exists: boolean; url?: string; llamaRnVersion?: string };
      try {
        const token = useAuthStore.getState().user?.jwtToken ?? useAuthStore.getState().user?.token ?? '';
        logger.log(`[KVCacheManager] base KV URL 확인: ${this._getServerBaseKVUrl(serverUrl, modelId)}`);
        infoRes = await fetch(this._getServerBaseKVUrl(serverUrl, modelId), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: joinedSignal,
        });
        if (infoRes.status === 401 || infoRes.status === 403) {
          logger.warn(`[KVCacheManager] base KV access denied: ${infoRes.status}`);
          return false;
        }
        if (!infoRes.ok) {
          logger.warn(`[KVCacheManager] base KV 정보 조회 실패: ${infoRes.status}`);
          return false;
        }
        // json() body 수신도 동일 AbortSignal로 보호 -> 타이머 살아있는 상태에서 실행
        info = {
          exists: true,
          url: this._getServerBaseKVUrl(serverUrl, modelId),
          llamaRnVersion: LLAMA_RN_VERSION,
        };
      } finally {
        cleanup(); // [BUG FIX #1 & #12] 리스너 해제
        clearTimeout(infoTimer);
      }
      }

      if (!info.exists || !info.url) {
        logger.log('[KVCacheManager] base KV 없음 (서버 미생성) — 폴백: 풀 prefill');
        return false;
      }

      const savedVersion = await storage.getItem(BASE_KV_VERSION_KEY + '_' + modelId);
      const serverVersion = info.llamaRnVersion ?? '';
      const localExists   = await this.hasBaseKV(modelId);

      // [TEMP DEBUG] 파일 크기 검증 - 5MB 이하면 무조건 재다운로드
      let needsRedownload = false;
      if (localExists) {
        try {
          const destPath = this.getBaseKVPath(modelId);
          const stat = await RNFS.stat(destPath);
          const fileSizeMB = Number(stat.size) / (1024 * 1024);
          logger.log(`[KVCacheManager] 기존 파일 크기: ${fileSizeMB.toFixed(2)}MB`);
          /*
          if (fileSizeMB < 5) {
            logger.warn(`[KVCacheManager] 파일 크기 이상 (${fileSizeMB.toFixed(2)}MB < 5MB) - 재다운로드`);
            needsRedownload = true;
            await RNFS.unlink(destPath).catch(() => {});
          }
          */
          if (fileSizeMB < 5) {
            logger.warn(`[KVCacheManager] base KV file too small (${fileSizeMB.toFixed(2)}MB < 5MB) - redownloading`);
            needsRedownload = true;
            await RNFS.unlink(destPath).catch(() => {});
          }
        } catch (e) {
          logger.warn('[KVCacheManager] 파일 크기 확인 실패:', e);
          needsRedownload = true;
        }
      }

      // 파일이 없거나 크기가 이상하면 다운로드
      if (!localExists || needsRedownload) {
        logger.log(`[KVCacheManager] base KV 다운로드 필요 (exists=${localExists}, needsRedownload=${needsRedownload})`);
      } else if (serverVersion !== '' && savedVersion === serverVersion) {
        logger.log('[KVCacheManager] base KV 이미 최신 — 재다운로드 불필요');
        return true;
      } else {
        logger.log(`[KVCacheManager] 버전 불일치 - 재다운로드 (saved=${savedVersion}, server=${serverVersion})`);
      }

      if (signal?.aborted) return false;

      logger.log(`[KVCacheManager] base KV 다운로드 시작: ${modelId} v${serverVersion}`);
      logger.log(`[KVCacheManager] 다운로드 URL: ${info.url}`);
      const destPath = this.getBaseKVPath(modelId);
      logger.log(`[KVCacheManager] 다운로드 대상 경로: ${destPath}`);

      // ✅ [FIX] 불완전 다운로드 파일 cleanup
      // 이전: 다운로드 실패 시 destPath에 잔류한 .bin이 남아
      //       다음 실행 시 exists=true 로 버전 체크를 통과해 버려
      //       손상된 파일로 loadSession()이 크래시
      // 수정: try/catch 구조로 실패 시 반드시 destPath 삭제
      // [BUG FIX #3] finally + return false -> try/catch 구조로 교체
      // ✅ [FIX] 서버에서 파일을 실제로 내려받기 시작하는 순간 -> 카운트
      onServerRequest?.();
      // [FIX #7] progress 콜백으로 UI 진행률 업데이트 (10~30초 무반응 방지)
      try {
        // ✅ [FIX] 타임아웃 래퍼 — RNFS.downloadFile에 타임아웃 없음
        // [BUG-10 FIX] downloadTask 변수 선언 전에 타임아웃 콜백이 클로저로 캡처되는
        // hoisting 엣지케이스 방지: let 으로 선언 후 즉시 할당하고 타임아웃은 그 다음에 생성.
        const downloadTask = RNFS.downloadFile({
          fromUrl: info.url,
          toFile: destPath,
          progress: onProgress
            ? (res) => {
                if (res.contentLength > 0) {
                  const pct = Math.min(99, Math.round((res.bytesWritten / res.contentLength) * 100));
                  onProgress(pct);
                }
              }
            : undefined });

        const abortWatcher = () => {
          try { RNFS.stopDownload(downloadTask.jobId); } catch {}
        };
        if (signal) signal.addEventListener('abort', abortWatcher);

        try {
          const downloadResult = await this._withTimeout(
            downloadTask.promise,
            DOWNLOAD_TIMEOUT_MS,
            'base KV 다운로드 타임아웃',
          ).catch(err => {
            // 타임아웃/오류 시 RNFS 백그라운드 다운로드 즉시 취소
            try { RNFS.stopDownload(downloadTask.jobId); } catch {}
            throw err;
          });
          if (downloadResult.statusCode < 200 || downloadResult.statusCode >= 300) {
            throw new Error(`base KV HTTP ${downloadResult.statusCode}`);
          }
        } finally {
          if (signal) signal.removeEventListener('abort', abortWatcher);
        }
      } catch (downloadErr) {
        // 다운로드 실패: 부분 파일 정리 후 false 반환 (에러 로그는 바깥 catch에서 처리됨)
        await RNFS.unlink(destPath).catch(() => {});
        logger.warn('[KVCacheManager] base KV 다운로드 실패 (부분 파일 제거):', downloadErr);
        return false;
      }

      const exists = await RNFS.exists(destPath);
      if (!exists) {
        logger.warn('[KVCacheManager] base KV 다운로드 후 파일 없음');
        return false;
      }

      const stat = await RNFS.stat(destPath).catch(() => null);
      const sizeBytes = Number(stat?.size ?? 0);
      
      // [BUG FIX] 0 바이트 파일 다운로드 감지 및 명확한 에러 처리
      if (sizeBytes < MIN_BASE_KV_BYTES) {
        await RNFS.unlink(destPath).catch(() => {});
        logger.error('[KVCacheManager] ❌ base KV downloaded as 0 bytes - 서버 응답 확인 필요');
        logger.error('[KVCacheManager] URL:', info.url);
        onProgress?.(-1);
        return false;
      }

      await storage.setItem(BASE_KV_VERSION_KEY + '_' + modelId, serverVersion);
      onProgress?.(100);
      
      try {
        const sizeKB = Math.round(sizeBytes / 1024);
        logger.log(`[KVCacheManager] ✅ base KV 다운로드 완료: ${sizeKB} KB`);
      } catch {
        logger.log(`[KVCacheManager] ✅ base KV 다운로드 완료 (stat 실패 무시)`);
      }
      return true;

    } catch (e) {
      logger.warn('[KVCacheManager] base KV 다운로드 실패 (폴백: 풀 prefill):', e);
      // [BUG FIX] 실패 시 -1 전달하여 UI 다운로드 중단 표시
      onProgress?.(-1);
      return false;
    }
  }

  // ── 서버 chapter bin 경로 (다운로드된 경우만 반환) ─────────────────────────

  async getServerChapterKVPath(
    modelId:   string,
    storyId:   string,
    chapterId: string | number,
  ): Promise<string | null> {
    const path   = modelDownloader.getKVPath(modelId, storyId, chapterId);
    const exists = await RNFS.exists(path).catch(() => false);
    return exists ? path : null;
  }

  // ── 스토리별 전체 챕터 KV 병렬 다운로드 ──────────────────────────────────

  async downloadAllChapterKVsIfNeeded(
    _modelId: string,
    _storyId: string,
    _serverUrl: string,
    _config: { chapters?: Array<{ id: string }> },
    _onServerRequest?: () => void,
    _signal?: AbortSignal,
  ): Promise<void> {
    return;
  }

  // ── 정리 ────────────────────────────────────────────────────────────────────

  async deleteStoryKV(modelId: string, storyId: string): Promise<void> {
    await modelDownloader.deleteKVCache(modelId, storyId);
    
    // ✅ [BUG-C FIX] MMKV 챕터 버전 키도 함께 삭제
    // 이전: bin 파일만 삭제 → ch_kv_ver:{modelId}:{storyId}:{chapterId} 키 잔류
    //       → 재다운로드 시 "이미 있음"으로 오판
    // 수정: 해당 storyId의 모든 챕터 버전 키 삭제
    await this._purgeStoryChapterVersionKeys(modelId, storyId);
    
    const dir = this._getModelDirSafe(modelId);
    try {
      const files = await RNFS.readDir(dir);
      await Promise.all(
        files
          .filter(f => 
            // [BUG-7 FIX] separator를 '_#_'로 통일
            // 구버전 '__' 파일들도 함께 정리 (Migration/Cleanup)
            f.name.startsWith(`kv_${storyId}_#_`) ||
            f.name.startsWith(`kv_${storyId}__`)
          )
          .map(f => RNFS.unlink(f.path).catch(() => {})),
      );
    } catch {}
  }

  // ── 내부 ────────────────────────────────────────────────────────────────────

  private async _purgeAllKV(modelId: string): Promise<void> {
    const dir = this._getModelDirSafe(modelId);
    try {
      const files = await RNFS.readDir(dir);
      const kvFiles = files.filter(f =>
        f.name.startsWith('kv_') ||
        f.name.startsWith('chapter_') ||
        f.name === 'kv_base.bin' || // [BUG FIX #20] base KV도 여기서 함께 정리
        f.name === 'warmup_session.bin' ||
        f.name === 'warmup_session.bin.tmp',
      );
      await Promise.all(kvFiles.map(f => RNFS.unlink(f.path).catch(() => {})));
      logger.log(`[KVCacheManager] KV+warmup 파일 ${kvFiles.length}개 삭제 완료`);
    } catch (e) {
      logger.warn('[KVCacheManager] KV 정리 실패:', e);
    }
  }

  private async _purgeBaseKV(modelId: string): Promise<void> {
    const path = this.getBaseKVPath(modelId);
    try {
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
        logger.log('[KVCacheManager] base KV 삭제 완료 (버전 변경)');
      }
    } catch (e) {
      logger.warn('[KVCacheManager] base KV 삭제 실패:', e);
    }
  }

  /**
   * KV 포맷 버전 변경 시 모든 모델의 로컬 KV/base를 일괄 정리.
   *
   * ✅ [순차 처리] AI 모델은 동시에 하나만 운용 -> 모델별 purge도 순차 실행.
   *    병렬화 금지: 모바일 파일시스템 I/O 경쟁 방지 + 부분 삭제 상태 방지.
   */
  private async _purgeAllModelsForVersionUpgrade(primaryModelId: string): Promise<void> {
    let allModelIds: string[] = [];
    try {
      // ✅ [BUG-10 FIX] MODELS 배열에 없는 고아 모델 디렉토리도 정리할 수 있도록 실제 디스크 스캔
      const modelsDir = `${RNFS.DocumentDirectoryPath}/${MODELS_DIR}`;
      if (await RNFS.exists(modelsDir)) {
        const entries = await RNFS.readDir(modelsDir);
        allModelIds = entries.filter(e => e.isDirectory()).map(e => e.name);
      }
    } catch (e) {
      logger.warn('[KVCacheManager] 모델 디렉토리 스캔 실패 — 상수 기반 정리 수행:', e);
      allModelIds = MODELS.map(m => m.id);
    }

    const uniqIds = Array.from(new Set([primaryModelId, ...allModelIds]));

    for (const id of uniqIds) {
      await this._purgeAllKV(id);
      await this._purgeBaseKV(id);
      await storage.removeItem(BASE_KV_VERSION_KEY + '_' + id).catch(() => {});
      // [BUG FIX] 챕터별 KV 버전 키 삭제 누락 수정
      await this._purgeChapterVersionKeys(id).catch(() => {});
    }

    logger.log(`[KVCacheManager] KV version purge completed for ${uniqIds.length} models`);
  }

  /**
   * ✅ [FIX] getAllKeys 없을 때 폴백 구현
   * 이전: getAllKeys가 없으면 조용히 스킵 -> 챕터 버전 키 누적
   * 수정:
   *   1. getAllKeys가 있으면 prefix 필터 일괄 삭제 (기존)
   *   2. 없으면 ModelDownloader에서 스토리 디렉토리 목록을 읽어 챕터 파일명으로 키 유추 삭제
   */
  private async _purgeChapterVersionKeys(modelId: string): Promise<void> {
    try {
      const prefix = `ch_kv_ver:${modelId}:`;

      // 방법 1: getAllKeys 지원 시 (MMKV 등) — appStorage 직접 사용
      try {
        const allKeys = appStorage.getAllKeys();
        if (Array.isArray(allKeys)) {
          const toDelete = allKeys.filter((k: string) => k.startsWith(prefix));
          await Promise.all(toDelete.map((k: string) => storage.removeItem(k).catch(() => {})));
          if (toDelete.length > 0) {
            logger.log(`[KVCacheManager] 챕터 KV 버전 키 ${toDelete.length}개 삭제 (${modelId})`);
          }
          return;
        }
      } catch (e) {
        logger.warn('[KVCacheManager] appStorage.getAllKeys failed, falling back to dir-scan:', e);
      }

      // ✅ [FIX] 방법 2: getAllKeys 미지원 시 디렉토리 스캔으로 키 유추
      // 모델 디렉토리의 kv_*.bin 파일에서 storyId:chapterId 패턴 추출
      const modelDir = this._getModelDirSafe(modelId);
      const dirExists = await RNFS.exists(modelDir).catch(() => false);
      if (!dirExists) return;

      const files = await RNFS.readDir(modelDir);
      const kvFiles = files.filter(f => f.name.startsWith('kv_') && f.name.endsWith('.bin'));
      const toDelete: string[] = [];

      for (const f of kvFiles) {
        // [BUG FIX #9] getKVPath는 kv_${storyId}_#_${chapterId}.bin 형식. (구분자 _#_ 사용)
        // 서버가 storyId에 '_#_'를 포함하지 않도록 보장한다는 전제 하에
        const nameNoExt = f.name.endsWith('.bin') ? f.name.slice(0, -4) : f.name;
        if (!nameNoExt.startsWith('kv_')) continue;
        const inner = nameNoExt.slice(3); // 'kv_' 제거
        
        // [BUG-7 FIX] separator를 '_#_'로 변경 (storyId에 '__' 포함 시 오파싱 방지)
        // [BUG-ITEM33 FIX] separator _#_ 와 __ 둘 다 대응 (migration 지원)
        let sepIdx = inner.lastIndexOf('_#_');
        let sepLen = 3;
        if (sepIdx < 0) {
          sepIdx = inner.lastIndexOf('__');
          sepLen = 2;
        }
        if (sepIdx < 0) continue;

        const fStoryId   = inner.slice(0, sepIdx);
        const fChapterId = inner.slice(sepIdx + sepLen);
        // storyId나 chapterId가 비어있으면 파싱 실패로 간주해 스킵
        if (!fStoryId || !fChapterId) continue;
        toDelete.push(`${prefix}${fStoryId}:${fChapterId}`);
      }

      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(k => storage.removeItem(k).catch(() => {})));
        logger.log(`[KVCacheManager] 챕터 KV 버전 키 ${toDelete.length}개 삭제 (dir-scan, ${modelId})`);
      }
    } catch (e) {
      logger.warn('[KVCacheManager] 챕터 KV 버전 키 삭제 실패 (무시):', e);
    }
  }

  /**
   * ✅ [FIX] Promise에 타임아웃 적용 헬퍼
   */
  private _withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`[KVCacheManager] ${label} (${ms}ms)`)),
        ms,
      );
      promise.then(
        v => { clearTimeout(timer); resolve(v); },
        e => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /**
   * ✅ [BUG-C FIX] 특정 storyId의 챕터 버전 키만 삭제
   */
  private async _purgeStoryChapterVersionKeys(modelId: string, storyId: string): Promise<void> {
    try {
      const prefix = `ch_kv_ver:${modelId}:${storyId}:`;

      // 방법 1: getAllKeys 지원 시
      try {
        const allKeys = appStorage.getAllKeys();
        if (Array.isArray(allKeys)) {
          const toDelete = allKeys.filter((k: string) => k.startsWith(prefix));
          await Promise.all(toDelete.map((k: string) => storage.removeItem(k).catch(() => {})));
          if (toDelete.length > 0) {
            logger.log(`[KVCacheManager] 스토리 챕터 KV 버전 키 ${toDelete.length}개 삭제 (${storyId})`);
          }
          return;
        }
      } catch (e) {
        logger.warn('[KVCacheManager] appStorage.getAllKeys failed for story purge:', e);
      }

      // 방법 2: 디렉토리 스캔으로 해당 storyId의 챕터 파일만 찾기
      const modelDir = this._getModelDirSafe(modelId);
      const dirExists = await RNFS.exists(modelDir).catch(() => false);
      if (!dirExists) return;

      const files = await RNFS.readDir(modelDir);
      const toDelete: string[] = [];

      for (const f of files) {
        if (!f.name.startsWith('kv_') || !f.name.endsWith('.bin')) continue;
        const nameNoExt = f.name.slice(0, -4);
        const inner = nameNoExt.slice(3);

        let sepIdx = inner.lastIndexOf('_#_');
        let sepLen = 3;
        if (sepIdx < 0) {
          sepIdx = inner.lastIndexOf('__');
          sepLen = 2;
        }
        if (sepIdx < 0) continue;

        const fStoryId = inner.slice(0, sepIdx);
        const fChapterId = inner.slice(sepIdx + sepLen);

        if (fStoryId === storyId && fChapterId) {
          toDelete.push(`${prefix}${fChapterId}`);
        }
      }

      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(k => storage.removeItem(k).catch(() => {})));
        logger.log(`[KVCacheManager] 스토리 챕터 KV 버전 키 ${toDelete.length}개 삭제 (${storyId})`);
      }
    } catch (e) {
      logger.warn('[KVCacheManager] 스토리 챕터 KV 버전 키 삭제 실패:', e);
    }
  }

  private _joinSignals(...signals: (AbortSignal | undefined)[]): [AbortSignal | undefined, () => void] {
    const valid = signals.filter((s): s is AbortSignal => !!s);
    if (valid.length === 0) return [undefined, () => {}];
    if (valid.length === 1) return [valid[0], () => {}];
    const ctrl = new AbortController();
    const abort = () => ctrl.abort();
    for (const s of valid) {
      if (s.aborted) { abort(); break; }
      s.addEventListener('abort', abort);
    }
    const cleanup = () => {
      for (const s of valid) {
        s.removeEventListener('abort', abort);
      }
    };
    return [ctrl.signal, cleanup];
  }
}

let _kvCacheInstance: KVCacheManager | null = null;
function getKvCacheInstance(): KVCacheManager {
  if (!_kvCacheInstance) _kvCacheInstance = new KVCacheManager();
  return _kvCacheInstance;
}
export const kvCacheManager = new Proxy({} as KVCacheManager, {
  get(_t, p) {
    if (typeof p === 'symbol') return Reflect.get(getKvCacheInstance(), p);
    return (getKvCacheInstance() as unknown as Record<string, unknown>)[p];
  },
  set(_t, p, v) { (getKvCacheInstance() as unknown as Record<string|symbol, unknown>)[p] = v; return true; } });
export default kvCacheManager;

// ── LCP(Longest Common Prefix) 유사도 유틸리티 ──────────────────────────────

/**
 * 두 문자열의 LCP 유사도 계산 (0.0 ~ 1.0)
 *
 * ✅ [FIX] 분모를 Math.min -> Math.max 로 변경
 * 이전: Math.min(a.length, b.length) 기준
 *   문제: currentPrompt가 cachedPrompt보다 짧으면 1.0으로 잘못 판정
 *         실제로 KV와 완전히 다른 내용인데 full-match로 착각
 *   예시: current="hello"(5자), cached="hello world"(11자), 공통=5
 *         Math.min -> 5/5=1.0 (잘못된 full-match 판정)
 *         Math.max -> 5/11=0.45 (실제 유사도 반영)
 * 수정: Math.max(a.length, b.length) -> 실제 유사도 기준으로 판정
 */
export function lcpSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  let common = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) break;
    common++;
  }
  return common / Math.max(a.length, b.length);
}

/**
 * KV 재사용 여부 판단
 * [BUG FIX] threshold 0.80 -> 0.99 상향 (공통 시스템 프롬프트 오염 방지)
 */
export function shouldReuseKV(
  currentPrompt: string,
  cachedPrompt:  string,
  threshold = 0.99,
): boolean {
  return lcpSimilarity(currentPrompt, cachedPrompt) >= threshold;
}

/**
 * 현재 LLAMA_RN_VERSION 반환 (외부에서 확인 용도)
 */
export function getCurrentKVVersion(): string {
  return LLAMA_RN_VERSION;
}

/**
 * base.bin 서버 생성 시 사용해야 할 llama-cli 플래그 목록 반환
 * (CI/서버 스크립트 자동화용)
 *
 * ※  opts.ctxSize / opts.ropeFreqBase 는 kv-spec.txt 모델별 값과 맞춰야 합니다.
 *     gemma-3n-E2B  : ctxSize=8192, ropeFreqBase=500000
 *     gemma-3-1b-qat: ctxSize=4096, ropeFreqBase=10000
 *     gemma-3-270m  : ctxSize=4096, ropeFreqBase=10000
 */
export function getBaseKVBuildFlags(opts: {
  ctxSize?:      number;
  keepTokens?:   number;
  ropeFreqBase?: number;
  threads?:      number;
} = {}): string[] {
  const {
    ctxSize      = 8192,    // 기본값: gemma-3n-E2B 기준
    keepTokens   = 512,
    ropeFreqBase = 500000,  // 기본값: gemma-3n-E2B 기준
    threads      = 4 } = opts;

  return [
    '--ctx-size',        String(ctxSize),
    '--batch-size',     '2048',           // kv-spec: batch_size = 2048 고정
    '--ubatch-size',    '2048',           // kv-spec: ubatch_size = 2048 고정
    '--cache-type-k',   'q8_0',           // kv-spec: cache_type_k = q8_0
    '--cache-type-v',   'q4_0',           // kv-spec: cache_type_v = q4_0
    // [FIX] flash_attn OFF (Android OpenCL 환경 필수) - 플래그 제거
    '--keep',            String(keepTokens),
    '--rope-freq-base',  String(ropeFreqBase),
    '--cache-reuse',    '256',
    '--no-context-shift',
    '--threads',         String(threads),
    '--prompt-cache-all',                  // kv-spec: --prompt-cache-all = ON
    '-n', '0',
  ];
}
