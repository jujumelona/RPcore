// src/core/llama/ModelDownloader.ts
// GGUF 모델 + KV cache 파일 다운로드
// ════════════════════════════════════════════════════════════
//
// [v2] @kesha-antonov/react-native-background-downloader 적용
// [v3] 임베딩 모델 자동 다운로드 추가
//
//   기존: expo-file-system downloadFile()
//     - 앱이 백그라운드로 가면 다운로드 중단
//     - 일시정지/재개 없음
//     - 대용량(2.5GB) 다운로드 시 앱 포그라운드 유지 필수
//
//   변경: react-native-background-downloader
//     ✅ 앱 백그라운드 진입 후에도 OS 레벨 다운로드 계속
//     ✅ pause() / resume() — 와이파이 전환 시 이어받기
//     ✅ 앱 재시작 후 checkForExistingDownloads() 로 진행 중 작업 복구
//     ✅ isAllowedOverMetered: false — 셀룰러에서 2.5GB 다운로드 차단
//
//   임베딩 모델 (embeddinggemma-300m-Q4_K_M.gguf):
//     - 기본 모델 downloadModel() 완료 직후 자동 병렬 다운로드 트리거
//     - 완료 시 EmbeddingEngine.onDownloadComplete() 콜백 호출
//     - 크기 ~180MB, 셀룰러 허용 (작은 크기)
//
//   KV cache 다운로드는 크기가 작으므로 RNFS 유지
//
// ════════════════════════════════════════════════════════════

import RNBackgroundDownloader, {
  type DownloadTask } from '@kesha-antonov/react-native-background-downloader';

if (!RNBackgroundDownloader || typeof RNBackgroundDownloader.download !== 'function') {
  console.error(
    '[ModelDownloader] ❌ @kesha-antonov/react-native-background-downloader 네이티브 모듈이 링크되지 않았습니다.\n' +
    '  → Expo Go가 아닌 `npx expo run:android` 로 빌드된 앱에서 실행하세요.',
  );
}
import { logger } from '../../utils/logger';
import RNFS, { type DownloadOptions } from '../../utils/fileSystemCompat';
import { MODELS, ModelInfo, MODELS_DIR } from '../../models/ModelConfig';
import networkMonitor from '../../utils/NetworkMonitor';

const HF_RAW = 'https://huggingface.co';

import { SERVER_BASE } from '../../config/ApiConfig';
import { getFreshAuthToken, isJwtExpired, useAuthStore } from '../../store/authStore';

// ── 임베딩 모델 상수 ──────────────────────────────────────────────
// second-state/embeddinggemma-300m-GGUF
// Q4_K_M 양자화 (4비트 k-quant) — llama.cpp 완전 지원
const EMBEDDING_MODEL_ID   = 'embeddinggemma-300m';
const EMBEDDING_GGUF_URL   =
  'https://huggingface.co/second-state/embeddinggemma-300m-GGUF/resolve/main/embeddinggemma-300m-Q4_K_M.gguf';
const EMBEDDING_DIR_NAME   = 'embeddinggemma-300m';
const EMBEDDING_FILE_NAME  = 'embeddinggemma-300m-Q4_K_M.gguf';

// ── 서버 프록시 URL 취득 ──────────────────────────────────────────

// ✅ [BUG FIX 다운로드] getDownloadUrl 전략 수정
// 문제 분석:
//   1. 서버 프록시가 반환하는 CDN signed URL은 50분 후 만료 → 2.5GB 다운로드 중 403
//   2. HF가 200/206으로 응답하면 서버는 hfUrl 그대로 반환 → RNBackgroundDownloader가
//      HF의 302 redirect chain을 못 따라가면 실패
//   3. gemma-3n-E2B는 공개 모델이므로 HF 직접 URL이 항상 작동함
// 수정: 직접 HF URL을 우선 사용 (expiresAt 없음 = 만료 걱정 없음)
//       서버 프록시는 게이티드(비공개) 모델 전용 fallback으로 유지
async function getDownloadUrl(modelId: string): Promise<{ url: string; expiresAt?: number }> {
  const model = MODELS.find(m => m.id === modelId);
  if (!model) throw new Error(`모델 없음: ${modelId}`);

  // 1차: 직접 HF URL (공개 모델 — XetHub/LFS 리다이렉트를 가로채기 위해 /resolve 사용)
  const directUrl = `${HF_RAW}/${model.hfRepo}/resolve/main/${model.hfFile}?download=true`;

  // ✅ [BUG FIX] e2b 모델은 웹에서 토큰 없이 잘 되므로, 앱에서도 인증 프록시를 완전히 건너뜀
  if (modelId === 'gemma-3n-e2b-reasoning') {
    return { url: directUrl };
  }

  // 서버 프록시는 HF_TOKEN이 필요한 게이티드 모델에서만 의미 있음
  // 공개 모델은 직접 URL로 충분하며 더 안정적임
  try {
    const jwtToken = useAuthStore.getState().user?.jwtToken;
    if (!jwtToken) {
      logger.log('[ModelDownloader] 인증 토큰 없음 — 직접 HF URL 사용');
      return { url: directUrl };
    }

    const res = await fetch(
      `${SERVER_BASE}/api/hf-download?modelId=${encodeURIComponent(modelId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'User-Agent': 'RPcore-App/3.0' } },
    );
    if (!res.ok) {
      logger.warn(`[ModelDownloader] 프록시 응답 ${res.status} — 직접 URL fallback`);
      return { url: directUrl };
    }
    const data = await res.json() as { url: string; expiresAt?: number };
    if (!data.url?.startsWith('http')) {
      logger.warn('[ModelDownloader] 프록시 URL 유효하지 않음 — 직접 URL fallback');
      return { url: directUrl };
    }

    // ✅ [BUG FIX #14] 만료 시간이 너무 짧으면 직접 URL 사용
    // 2.5GB 파일을 느린 와이파이로 받으면 50분 이상 걸릴 수 있음
    // signed URL이 다운로드 완료 전에 만료되면 중간에 403 → 직접 URL이 안전함
    if (data.expiresAt) {
      const remainingMs = data.expiresAt - Date.now();
      const remainingMin = remainingMs / 60_000;
      const estimatedMinutes = (model.sizeMB ?? 2500) / 50; // 50Mbps 기준 추정
      if (remainingMin < estimatedMinutes + 10) {
        logger.warn(`[ModelDownloader] signed URL 잔여 ${remainingMin.toFixed(0)}분 — 예상 다운로드 ${estimatedMinutes.toFixed(0)}분 → 직접 URL 사용`);
        return { url: directUrl };
      }
    }

    // [BUG-11 FIX] expiresAt이 누락됐는데 signed URL로 추정되는 경우 경계
    if (!data.expiresAt && data.url.includes('Expires=') || data.url.includes('X-Amz-Expires')) {
      logger.warn('[ModelDownloader] 프록시가 signed URL을 줬으나 expiresAt 누락됨. 직접 URL이 더 안전할 수 있음.');
    }

    logger.log(`[ModelDownloader] 프록시 URL 사용 (expiresAt: ${data.expiresAt ? new Date(data.expiresAt).toISOString() : 'none'})`);
    return { url: data.url, expiresAt: data.expiresAt };
  } catch (e) {
    logger.warn('[ModelDownloader] 서버 프록시 실패 — 직접 HF URL 사용:', e);
    return { url: directUrl };
  }
}


function hfHeaders(modelId?: string): Record<string, string> {
  const model = modelId ? MODELS.find(m => m.id === modelId) : null;
  const referer = model 
    ? `https://huggingface.co/${model.hfRepo}/tree/main`
    : 'https://huggingface.co';

  // ✅ [BUG FIX] 브라우저 환경을 100% 모방하여 XetHub/CDN 차단 우회
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Referer': referer,
    'Connection': 'keep-alive' };
}

export interface DownloadProgress {
  modelId: string;
  progress: number; // 0–100, -1 = 미확인
  status: 'idle' | 'downloading' | 'completed' | 'error' | 'paused';
  currentFile?: string;
  error?: string;
}

type ProgressListener = (p: DownloadProgress) => void;

class LlamaModelDownloader {
  private listeners    = new Set<ProgressListener>();
  private modelsDir:     string;
  private activeTasks  = new Map<string, DownloadTask>();
  private urlExpiresAt = new Map<string, number>();

  // 임베딩 모델 다운로드 중복 방지 플래그
  private _embeddingDownloading = false;
  /** KV cache 다운로드 중복 방지 (폴링 제거 -> Promise 시그널링) */
  private _chapterKVDownloadingJobs = new Map<string, Promise<string>>();

  constructor() {
    this.modelsDir = `${RNFS.DocumentDirectoryPath}/${MODELS_DIR}`;
  }

  addListener(fn: ProgressListener)    { this.listeners.add(fn); }
  removeListener(fn: ProgressListener) { this.listeners.delete(fn); }
  private emit(p: DownloadProgress)    { this.listeners.forEach(fn => fn(p)); }

  // ── 경로 헬퍼 ──────────────────────────────────────────────

  getModelDir(modelId: string): string {
    return `${this.modelsDir}/${this._model(modelId).dirName}`;
  }

  getModelPath(modelId: string): string {
    const model = this._model(modelId);
    // ✅ [BUG FIX] 장문 파일명으로 인한 안드로이드 OS 차단 방지 (Shorten filename)
    const localFile = (modelId === 'gemma-3n-e2b-reasoning') ? 'e2b.gguf' : model.hfFile;
    return `${this.getModelDir(modelId)}/${localFile}`;
  }

  getKVPath(modelId: string, storyId: string, chapterId: string | number): string {
    // [BUG-7 FIX] separator를 '_#_'로 변경 (storyId에 '__' 포함 시 오파싱 방지)
    // [FIX] kv_cache 폴더로 경로 변경 (KVStateManager와 일치)
    const KV_BASE = `${RNFS.DocumentDirectoryPath}/kv_cache`;
    // chapterId를 그대로 사용 (서버에서 받은 이름 유지)
    const normalizedChapterId = String(chapterId);
    return `${KV_BASE}/${storyId}/${normalizedChapterId}_${modelId}.bin`;
  }

  /** 임베딩 모델 저장 경로 */
  getEmbeddingModelPath(): string {
    return `${this.modelsDir}/${EMBEDDING_DIR_NAME}/${EMBEDDING_FILE_NAME}`;
  }

  // ── 완료 판정 ──────────────────────────────────────────────

  async isModelDownloaded(modelId: string): Promise<boolean> {
    try {
      const path = this.getModelPath(modelId);
      // ✅ [REMOVED] 용량 검증 제거 — 파일 존재만 확인 (사용자 요청)
      return await RNFS.exists(path);
    } catch {
      return false;
    }
  }

  async isEmbeddingModelDownloaded(): Promise<boolean> {
    try {
      const path = this.getEmbeddingModelPath();
      // ✅ [REMOVED] 용량 검증 제거 — 파일 존재만 확인 (사용자 요청)
      return await RNFS.exists(path);
    } catch {
      return false;
    }
  }

  async isKVDownloaded(modelId: string, storyId: string, chapterId: string | number): Promise<boolean> {
    try {
      return await RNFS.exists(this.getKVPath(modelId, storyId, chapterId));
    } catch {
      return false;
    }
  }

  // ── 앱 재시작 후 진행 중 다운로드 복구 ─────────────────────

  async recoverActiveDownloads(): Promise<void> {
    try {
      const existing = await RNBackgroundDownloader.checkForExistingDownloads();
      for (const task of existing) {
        const taskId = (task as { id: string }).id;

        // 임베딩 모델 — signed URL 재발급 후 재시작
        if (taskId === EMBEDDING_MODEL_ID) {
          logger.log('[ModelDownloader] 임베딩 모델 재시작 (signed URL 재발급)');
          (task as { stop?: () => void }).stop?.();
          this.downloadEmbeddingModel({
            hfRepo: 'second-state/embeddinggemma-300m-GGUF',
            hfFile: 'embeddinggemma-300m-Q4_K_M.gguf',
            dirName: 'embeddinggemma-300m',
            sizeMB:  180 }).catch(() => {});
          continue;
        }

        if (!MODELS.find(m => m.id === taskId)) {
          (task as { stop?: () => void }).stop?.();
          continue;
        }

        // [BUG FIX] 앱 재시작 시 signed URL은 이미 만료됨
        // 기존 task 그대로 resume → CDN 403 → 다운로드 무한 멈춤
        // 해결: 기존 task 중단 + 새 signed URL로 downloadModel 재시작
        logger.log(`[ModelDownloader] 재시작 (signed URL 재발급): ${taskId}`);
        (task as { stop?: () => void }).stop?.();
        this.downloadModel(taskId, 0).catch(e =>
          this.emit({ modelId: taskId, progress: 0, status: 'error', error: String(e) })
        );
      }
    } catch (e) {
      logger.warn('[ModelDownloader] recoverActiveDownloads 오류:', e);
    }
  }

  // ── GGUF 모델 다운로드 ─────────────────────────────────────
  
  /**
   * 모델 다운로드
   * [BUG FIX #42] _retryCount 매개변수 추가 → 무한 재귀 방지
   */
  async downloadModel(modelId: string, _retryCount = 0): Promise<string | undefined> {
    const model   = this._model(modelId);
    const destDir = this.getModelDir(modelId);
    const dest    = this.getModelPath(modelId);

    // ✅ [REMOVED] 사전 검증 제거 (사용자 요청: 그냥 무조건 시도하게)
    // 기존에 파일이 있더라도 사용자가 버튼을 눌렀다면 새로 받거나 이어받도록 함

    const netStatus = networkMonitor.getStatus();
    if (!netStatus.isConnected) {
      const err = '네트워크가 연결되어 있지 않습니다.';
      this.emit({ modelId, progress: 0, status: 'error', error: err });
      throw new Error(err);
    }

    const dlWarning = networkMonitor.getDownloadWarning(model.sizeMB ?? 2500);
    if (dlWarning) logger.warn('[ModelDownloader] 다운로드 경고:', dlWarning);

    if (!RNBackgroundDownloader || typeof RNBackgroundDownloader.download !== 'function') {
      const err = '다운로드 모듈이 초기화되지 않았습니다. Expo Go가 아닌 정식 빌드를 사용해주세요.';
      this.emit({ modelId, progress: 0, status: 'error', error: err });
      throw new Error(err);
    }

    if (this.activeTasks.has(modelId)) {
      logger.warn(`[ModelDownloader] 이미 진행 중: ${modelId}`);
      return undefined;
    }

    await RNFS.mkdir(destDir);

    let downloadUrl: string;
    let urlExpiresAt: number | undefined;
    try {
      const { url: initialUrl, expiresAt } = await getDownloadUrl(modelId);
      urlExpiresAt = expiresAt;

      // E2B 모델 등은 RNFS 네이티브 다운로더가 내부적으로 완벽하게 리다이렉트를 처리하므로
      // 별도의 사전 URL 확보(resolveFinalUrl) 과정 없이 다이렉트 주소 그대로 넘김
      downloadUrl = initialUrl;

      if (__DEV__) logger.log(`[ModelDownloader] 다운로드 시작 URL: ${downloadUrl}`);
      if (expiresAt) logger.log(`[ModelDownloader] signed URL 만료: ${new Date(expiresAt).toISOString()}`);
    } catch (e) {
      const errMsg = `다운로드 URL 취득 실패: ${e instanceof Error ? e.message : String(e)}`;
      this.emit({ modelId, progress: 0, status: 'error', error: errMsg });
      throw new Error(errMsg);
    }

    return new Promise<string | undefined>((resolve, reject) => {
      // URL이 이미 만료됐으면 즉시 재발급 후 재시도
      if (urlExpiresAt && Date.now() >= urlExpiresAt) {
        if (_retryCount >= 3) {
           const err = `[ModelDownloader] signed URL 만료 재시도 횟수 초과: ${modelId}`;
           this.emit({ modelId, progress: 0, status: 'error', error: err });
           reject(new Error(err));
           return;
        }
        logger.warn(`[ModelDownloader] signed URL 이미 만료 — 재발급 후 재시작 (시도: ${_retryCount + 1}): ${modelId}`);
        this.downloadModel(modelId, _retryCount + 1).then(resolve).catch(reject);
        return;
      }

      let didBegin = false;
      let task: any; // DownloadTask 또는 그 호환 객체

      // ✅ E2B 모델은 결함이 있는 백그라운드 다운로더 대신 네이티브 RNFS 다운로더 사용
      if (modelId === 'gemma-3n-e2b-reasoning') {
        try {
          const ret = RNFS.downloadFile({
            fromUrl: downloadUrl,
            toFile: dest,
            headers: hfHeaders(modelId),
            background: true,
            progressDivider: 1,
            begin: (res: any) => {
              didBegin = true;
              logger.log(`[ModelDownloader:RNFS] 시작: ${model.hfFile} (${(res.contentLength / 1024 / 1024).toFixed(0)}MB)`);
              this._triggerEmbeddingDownloadIfNeeded();
            },
            progress: (res: any) => {
              if (res.contentLength > 0) {
                const pct = Math.min(99, Math.round((res.bytesWritten / res.contentLength) * 100));
                this.emit({ modelId, progress: pct, status: 'downloading', currentFile: model.hfFile });
              }
            }
          } as DownloadOptions);

          task = {
            stop: () => RNFS.stopDownload(ret.jobId),
            pause: () => RNFS.stopDownload(ret.jobId),
            resume: () => {} };

          this.activeTasks.set(modelId, task);
          if (urlExpiresAt) this.urlExpiresAt.set(modelId, urlExpiresAt);
          this.emit({ modelId, progress: 0, status: 'downloading', currentFile: model.hfFile });

          ret.promise.then((res) => {
            this.activeTasks.delete(modelId);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              this.emit({ modelId, progress: 100, status: 'completed' }); // 완료 상태 업데이트
              resolve(dest);
            } else {
              const msg = `RNFS 다운로드 실패 (${res.statusCode})`;
              this.emit({ modelId, progress: 0, status: 'error', error: msg });
              reject(new Error(msg));
            }
          }).catch((e: any) => {
            this.activeTasks.delete(modelId);
            const msg = `RNFS 에러: ${e.message}`;
            this.emit({ modelId, progress: 0, status: 'error', error: msg });
            reject(new Error(msg));
          });
          
          return; // RNFS 블록 종료
        } catch (e: any) {
          const syncErr = `RNFS 시작 실패: ${e instanceof Error ? e.message : String(e)}`;
          logger.error(`[ModelDownloader] ${syncErr}`);
          this.emit({ modelId, progress: 0, status: 'error', error: syncErr });
          reject(new Error(syncErr));
          return;
        }
      }

      // --- 일반 모델 로직 유지 ---
      try {
        task = RNBackgroundDownloader.download({
          id:          modelId,
          url:         downloadUrl,
          destination: dest,
          headers:     hfHeaders(modelId),
          isAllowedOverMetered: true,
          isAllowedOverRoaming: false });
      } catch (e: any) {
        const syncErr = `다운로드 명령 실패: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(`[ModelDownloader] ${syncErr}`);
        this.emit({ modelId, progress: 0, status: 'error', error: syncErr });
        reject(new Error(syncErr));
        return;
      }

      this.activeTasks.set(modelId, task);
      if (urlExpiresAt) this.urlExpiresAt.set(modelId, urlExpiresAt);
      this.emit({ modelId, progress: 0, status: 'downloading', currentFile: model.hfFile });

      task
        .begin(({ expectedBytes }: { expectedBytes: number }) => {
          didBegin = true;
          logger.log(`[ModelDownloader] 시작: ${model.hfFile} (${(expectedBytes / 1024 / 1024).toFixed(0)}MB)`);
          // ✅ 기본 모델 다운로드 시작과 동시에 임베딩 모델도 병렬 다운로드 트리거
          this._triggerEmbeddingDownloadIfNeeded();
        })
        .progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
          const pct = bytesTotal > 0
            ? Math.min(99, Math.round((bytesDownloaded / bytesTotal) * 100))
            : -1;
          this.emit({ modelId, progress: pct, status: 'downloading', currentFile: model.hfFile });
        })
        .done(async () => {
          this.activeTasks.delete(modelId);
          // ✅ [REMOVED] 불완전 파일 삭제 로직 제거 (사용자 요청)
          this.emit({ modelId, progress: 100, status: 'completed' });
          resolve(dest);
        })
        .error(({ error, errorCode }: { error: string; errorCode: number }) => {
          this.activeTasks.delete(modelId);
          // ✅ [BUG FIX] 에러 메시지를 더 상세히 전달 (사용자가 원인 파악 가능하게)
          const msg = `다운로드 실패 (${errorCode}): ${error}\n(링크: ${downloadUrl?.substring(0, 50)}...)`;
          this.emit({ modelId, progress: 0, status: 'error', error: msg });
          reject(new Error(msg));
        });
      setTimeout(() => {
        if (!didBegin && this.activeTasks.get(modelId) === task) {
          try { task.stop(); } catch {}
          this.activeTasks.delete(modelId);
          this.emit({ modelId, progress: 0, status: 'error', error: 'download did not start (timeout)' });
        }
      }, 30000);
    });
  }

  // ── 임베딩 모델 다운로드 ─────────────────────────────────────
  //
  // EmbeddingEngine에서 직접 호출하거나
  // 기본 모델 다운로드 시작/완료 시 자동 트리거됨.
  //
  // 셀룰러 허용 (180MB로 작기 때문)

  async downloadEmbeddingModel(opts?: {
    hfRepo:  string;
    hfFile:  string;
    dirName: string;
    sizeMB:  number;
  }): Promise<string> {
    const destDir = `${this.modelsDir}/${opts?.dirName ?? EMBEDDING_DIR_NAME}`;
    const dest    = `${destDir}/${opts?.hfFile ?? EMBEDDING_FILE_NAME}`;

    // 이미 완료된 경우
    if (await this.isEmbeddingModelDownloaded()) {
      logger.log('[ModelDownloader] 임베딩 모델 이미 존재');
      // EmbeddingEngine에 완료 알림
      this._notifyEmbeddingComplete(dest);
      return dest;
    }

    if (this._embeddingDownloading) {
      logger.log('[ModelDownloader] 임베딩 모델 다운로드 중');
      return dest;
    }

    const netStatus = networkMonitor.getStatus();
    if (!netStatus.isConnected) {
      throw new Error('네트워크가 연결되어 있지 않습니다.');
    }

    this._embeddingDownloading = true;
    await RNFS.mkdir(destDir);

    const downloadUrl = EMBEDDING_GGUF_URL; // public 모델, 인증 불필요

    if (__DEV__) logger.log(`[ModelDownloader] 임베딩 모델 다운로드 시작: ${EMBEDDING_FILE_NAME}`);

    this.emit({
      modelId:     EMBEDDING_MODEL_ID,
      progress:    0,
      status:      'downloading',
      currentFile: EMBEDDING_FILE_NAME });

    return new Promise<string>((resolve, reject) => {
      const task = RNBackgroundDownloader.download({
        id:          EMBEDDING_MODEL_ID,
        url:         downloadUrl,
        destination: dest,
        headers:     hfHeaders(),
        // 임베딩 모델은 작으므로 셀룰러 허용
        isAllowedOverMetered: true,
        isAllowedOverRoaming: false });

      this.activeTasks.set(EMBEDDING_MODEL_ID, task);

      task
        .begin(({ expectedBytes }: { expectedBytes: number }) => {
          logger.log(`[ModelDownloader] 임베딩 모델: ${(expectedBytes / 1024 / 1024).toFixed(0)}MB`);
        })
        .progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
          const pct = bytesTotal > 0
            ? Math.min(99, Math.round((bytesDownloaded / bytesTotal) * 100))
            : -1;
          this.emit({ modelId: EMBEDDING_MODEL_ID, progress: pct, status: 'downloading' });
        })
        .done(async () => {
          this.activeTasks.delete(EMBEDDING_MODEL_ID);
          this._embeddingDownloading = false;

          // ✅ [REMOVED] 불완전 파일 삭제 로직 제거 (사용자 요청)
          this.emit({ modelId: EMBEDDING_MODEL_ID, progress: 100, status: 'completed' });
          logger.log('[ModelDownloader] 임베딩 모델 다운로드 완료');

          // EmbeddingEngine에 완료 알림 → 자동 로드 트리거
          this._notifyEmbeddingComplete(dest);
          resolve(dest);
        })
        .error(({ error, errorCode }: { error: string; errorCode: number }) => {
          this.activeTasks.delete(EMBEDDING_MODEL_ID);
          this._embeddingDownloading = false;
          const msg = `임베딩 모델 다운로드 실패 (${errorCode}): ${error}`;
          this.emit({ modelId: EMBEDDING_MODEL_ID, progress: 0, status: 'error', error: msg });
          reject(new Error(msg));
        });
    });
  }

  /** 필요하면 임베딩 모델 다운로드를 백그라운드로 트리거 */
  private _triggerEmbeddingDownloadIfNeeded(): void {
    if (this._embeddingDownloading) return;

    this.isEmbeddingModelDownloaded().then(exists => {
      if (!exists) {
        this.downloadEmbeddingModel().catch(e => {
          if (__DEV__) logger.warn('[ModelDownloader] 임베딩 모델 자동 다운로드 실패:', e);
        });
      }
    }).catch(() => {});
  }

  /** EmbeddingEngine.onDownloadComplete 호출 (dynamic require로 순환참조 방지) */
  private _notifyEmbeddingComplete(path: string): void {
    try {
      const { embeddingEngine } = require('./EmbeddingEngine') as {
        embeddingEngine: { onDownloadComplete(path: string): void };
      };
      embeddingEngine.onDownloadComplete(path);
    } catch (e) {
      if (__DEV__) logger.warn('[ModelDownloader] EmbeddingEngine notify 실패:', e);
    }
  }

  private _attachEmbeddingListeners(task: DownloadTask): void {
    const dest = this.getEmbeddingModelPath();
    this.activeTasks.set(EMBEDDING_MODEL_ID, task);
    this._embeddingDownloading = true;

    task
      .progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
        const pct = bytesTotal > 0
          ? Math.min(99, Math.round((bytesDownloaded / bytesTotal) * 100))
          : -1;
        this.emit({ modelId: EMBEDDING_MODEL_ID, progress: pct, status: 'downloading' });
      })
      .done(async () => {
        this.activeTasks.delete(EMBEDDING_MODEL_ID);
        this._embeddingDownloading = false;
        // ✅ [REMOVED] 검증 및 삭제 제거
        this.emit({ modelId: EMBEDDING_MODEL_ID, progress: 100, status: 'completed' });
        this._notifyEmbeddingComplete(dest);
      })
      .error(({ error, errorCode }: { error: string; errorCode: number }) => {
        this.activeTasks.delete(EMBEDDING_MODEL_ID);
        this._embeddingDownloading = false;
        this.emit({ modelId: EMBEDDING_MODEL_ID, progress: 0, status: 'error', error: `(${errorCode}) ${error}` });
      });
  }

  // ── 일시정지 / 재개 ────────────────────────────────────────

  pauseDownload(modelId: string): void {
    const task = this.activeTasks.get(modelId);
    if (!task) return;
    task.pause();
    this.emit({ modelId, progress: -1, status: 'paused' });
  }

  resumeDownload(modelId: string): void {
    const expiry = this.urlExpiresAt.get(modelId);
    if (expiry && Date.now() >= expiry) {
      logger.warn(`[ModelDownloader] signed URL 만료 — 재다운로드 필요: ${modelId}`);
      const task = this.activeTasks.get(modelId);
      if (task) { task.stop(); this.activeTasks.delete(modelId); }
      this.urlExpiresAt.delete(modelId);
      this.downloadModel(modelId, 0).catch(e =>
        this.emit({ modelId, progress: 0, status: 'error', error: String(e) })
      );
      return;
    }
    const task = this.activeTasks.get(modelId);
    if (!task) return;
    task.resume();
    this.emit({ modelId, progress: -1, status: 'downloading' });
  }

  cancelDownload(modelId: string): void {
    const task = this.activeTasks.get(modelId);
    if (task) {
      task.stop();
      this.activeTasks.delete(modelId);
    }
    if (modelId === EMBEDDING_MODEL_ID) {
      this._embeddingDownloading = false;
      RNFS.unlink(this.getEmbeddingModelPath()).catch(() => {});
    } else {
      RNFS.unlink(this.getModelPath(modelId)).catch(() => {});
    }
    this.emit({ modelId, progress: 0, status: 'idle' });
  }

  // ── KV cache 다운로드 ──────────────────────────────────────

  private _chapterKVDownloading = new Set<string>(); // Legacy check (safeguard)

  /**
   * KV 캐시 다운로드
   * [BUG FIX #38] 폴링 루프 제거 → Promise 시그널링으로 합리적 대기 구현
   */
  async downloadKVCache(
    modelId: string,
    storyId: string,
    chapterId: string | number,
    url: string,
    signal?: AbortSignal,
    retryCount = 0,
  ): Promise<string> {
    const dest = this.getKVPath(modelId, storyId, chapterId);
    const key  = `${modelId}:${storyId}:${chapterId}`;

    // 이미 진행 중인 동일한 다운로드 작업이 있으면 그 결과를 기다림 (시그널링)
    const existingJob = this._chapterKVDownloadingJobs.get(key);
    if (existingJob) {
      logger.log(`[ModelDownloader] KV cache 다운로드 중복 요청 → 기존 작업 대기: ${key}`);
      return existingJob;
    }

    if (await RNFS.exists(dest)) return dest;

    // 새 작업 등록
    const downloadPromise = this._doDownloadKVCache(modelId, storyId, chapterId, url, signal, retryCount);
    this._chapterKVDownloadingJobs.set(key, downloadPromise);

    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this._chapterKVDownloadingJobs.delete(key);
    }
  }

  private async _doDownloadKVCache(
    modelId: string,
    storyId: string,
    chapterId: string | number,
    url: string,
    signal?: AbortSignal,
    retryCount = 0,
  ): Promise<string> {
    const dest    = this.getKVPath(modelId, storyId, chapterId);
    const destTmp = dest + '.tmp';

    await RNFS.mkdir(this.getModelDir(modelId));
    const key = `${modelId}:${storyId}:${chapterId}`;
    this._chapterKVDownloading.add(key); // Legacy Set 호환 (타 모듈 참조 가능성 대비)

    let jwtToken = await getFreshAuthToken();
    if (jwtToken && isJwtExpired(jwtToken)) {
      const refreshedUser = await useAuthStore.getState().tryRefreshToken();
      jwtToken = refreshedUser?.jwtToken ?? refreshedUser?.token ?? '';
    }
    const kvHeaders = jwtToken
      ? { ...hfHeaders(), Authorization: `Bearer ${jwtToken}` }
      : hfHeaders();

    const DOWNLOAD_TIMEOUT_MS = 120_000;
    const downloadTask = RNFS.downloadFile({ fromUrl: url, toFile: destTmp, headers: kvHeaders });
    let _kvTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      _kvTimeoutId = setTimeout(
        () => reject(new Error('[ModelDownloader] KV cache 다운로드 타임아웃')),
        DOWNLOAD_TIMEOUT_MS,
      );
    });

    const abortWatcher = () => {
      try { RNFS.stopDownload(downloadTask.jobId); } catch {}
    };
    if (signal) {
      if (signal.aborted) {
        abortWatcher();
        if (_kvTimeoutId) clearTimeout(_kvTimeoutId);
        throw new Error('[ModelDownloader] KV download aborted');
      }
      signal.addEventListener('abort', abortWatcher);
    }

    try {
      const dlResult = await Promise.race([downloadTask.promise, timeoutPromise]);
      if ((dlResult.statusCode === 401 || dlResult.statusCode === 403) && retryCount < 1) {
        const refreshedUser = await useAuthStore.getState().tryRefreshToken();
        const refreshedToken = refreshedUser?.jwtToken ?? refreshedUser?.token ?? '';
        if (refreshedToken && refreshedToken !== jwtToken) {
          await RNFS.unlink(destTmp).catch(() => {});
          return this.downloadKVCache(modelId, storyId, chapterId, url, signal, retryCount + 1);
        }
      }
      if (dlResult.statusCode < 200 || dlResult.statusCode >= 300) {
        throw new Error(`[ModelDownloader] KV cache 다운로드 HTTP 오류: ${dlResult.statusCode}`);
      }
      const tmpStat = await RNFS.stat(destTmp).catch(() => null);
      const sizeBytes = Number(tmpStat?.size ?? 0);
      if (sizeBytes <= 0) {
        throw new Error('[ModelDownloader] KV cache downloaded as 0 bytes');
      }
      const destExists = await RNFS.exists(dest).catch(() => false);
      if (destExists) await RNFS.unlink(dest).catch(() => {});
      await RNFS.moveFile(destTmp, dest);
      return dest;
    } catch (e) {
      try { RNFS.stopDownload(downloadTask.jobId); } catch {}
      await RNFS.unlink(destTmp).catch(() => {});
      throw e;
    } finally {
      if (signal) signal.removeEventListener('abort', abortWatcher);
      if (_kvTimeoutId !== undefined) clearTimeout(_kvTimeoutId);
      this._chapterKVDownloading.delete(key);
    }
  }

  // ── 삭제 ──────────────────────────────────────────────────

  async deleteKVCache(modelId: string, storyId: string, chapterId?: string | number): Promise<void> {
    if (chapterId !== undefined) {
      const path = this.getKVPath(modelId, storyId, chapterId);
      if (await RNFS.exists(path)) await RNFS.unlink(path).catch(() => {});
      if (await RNFS.exists(`${path}.tmp`)) await RNFS.unlink(`${path}.tmp`).catch(() => {});
      return;
    }
    const files = await RNFS.readDir(this.getModelDir(modelId)).catch(() => []);
    await Promise.all(
      files.filter(f => f.name.startsWith(`kv_${storyId}_#_`)).map(f => RNFS.unlink(f.path).catch(() => {})),
    );
  }

  async deleteModel(modelId: string): Promise<void> {
    this.cancelDownload(modelId);
    const dir = this.getModelDir(modelId);
    try {
      if (await RNFS.exists(dir)) {
        const files = await RNFS.readDir(dir).catch(() => []);
        await Promise.all(files.map(f => RNFS.unlink(f.path).catch(() => {})));
        await RNFS.unlink(dir).catch(() => {});
      }
    } catch (e) {
      logger.warn('[ModelDownloader] deleteModel 오류:', e);
    }
    this.emit({ modelId, progress: 0, status: 'idle' });
  }

  getModelInfo(modelId: string): ModelInfo { return this._model(modelId); }

  private _model(modelId: string): ModelInfo {
    const found = MODELS.find(m => m.id === modelId);
    if (!found) throw new Error(`모델 없음: ${modelId}`);
    return found;
  }

  private _attachTaskListeners(modelId: string, task: DownloadTask): void {
    this.activeTasks.set(modelId, task);
    task
      .progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
        const pct = bytesTotal > 0
          ? Math.min(99, Math.round((bytesDownloaded / bytesTotal) * 100))
          : -1;
        this.emit({ modelId, progress: pct, status: 'downloading' });
      })
      .done(async () => {
        this.activeTasks.delete(modelId);
        // ✅ [REMOVED] 복구 시 불완전 파일 삭제 제거 (사용자 요청)
        this.emit({ modelId, progress: 100, status: 'completed' });
        // 기본 모델 복구 완료 시에도 임베딩 트리거
        this._triggerEmbeddingDownloadIfNeeded();
      })
      .error(({ error, errorCode }: { error: string; errorCode: number }) => {
        this.activeTasks.delete(modelId);
        this.emit({ modelId, progress: 0, status: 'error', error: `(${errorCode}) ${error}` });
      });
  }
}

let _modelDlInstance: LlamaModelDownloader | null = null;
function getModelDlInstance(): LlamaModelDownloader {
  if (!_modelDlInstance) _modelDlInstance = new LlamaModelDownloader();
  return _modelDlInstance;
}
export const modelDownloader = new Proxy({} as LlamaModelDownloader, {
  get(_t, p) { return (getModelDlInstance() as unknown as Record<string | symbol, unknown>)[p as string]; },
  set(_t, p, v) { (getModelDlInstance() as unknown as Record<string | symbol, unknown>)[p as string] = v; return true; } });
export default modelDownloader;
