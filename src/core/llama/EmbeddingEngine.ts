// src/core/llama/EmbeddingEngine.ts
// ══════════════════════════════════════════════════════════════════
//
//  임베딩 엔진 — 이중 백엔드 + 동적 RAM 게이트
//
//  백엔드 우선순위:
//    1순위: llama.rn (llama.cpp) + embeddinggemma-300m-Q4_K_M.gguf
//       - 기존 llama.rn 스택 재사용 → 추가 패키지 불필요
//       - Q4_K_M 양자화 → ~180MB VRAM/RAM, 추론 1~3ms/token
//       - llama.cpp embedding 모드: LlamaContext.embedding() API 사용
//       - 출력 차원: 768 (gemma-300m hidden_size)
//    2순위: react-native-executorch TextEmbeddingsModule (구 ALL-MiniLM)
//       - 기존 코드 유지 (ETModule)
//    3순위: 로컬 BM25 sparse 임베딩 폴백 (네트워크/RAM 없을 때)
//
//  RAM 게이트:
//    가용 RAM ≥ 2GB  → GGUF 백엔드 활성화
//    가용 RAM 1~2GB  → ExecuTorch 백엔드
//    가용 RAM < 1GB  → sparse 폴백 (embedding 비활성화)
//
//  자동 다운로드:
//    ModelDownloader가 기본 모델 다운로드 시작 시
//    triggerEmbeddingDownload()를 호출 → 병렬 다운로드
//    다운로드 완료 후 load() 자동 재시도
//
//  GGUF 모델 정보:
//    Repo:  second-state/embeddinggemma-300m-GGUF
//    File:  embeddinggemma-300m-Q4_K_M.gguf
//    Size:  ~180MB
//    Quant: Q4_K_M (4비트 k-quant, 혼합 정밀도) ← llama.cpp 완전 지원
//    Dim:   768
//    Note:  llama.cpp --embedding 플래그로 추론 → 마지막 레이어 pooled output 반환
//
// ══════════════════════════════════════════════════════════════════

import { db } from '../sqlite/Database';
import type { Conversation } from '../sqlite/Schemas';
import { RAMChecker } from '../../utils/RAMChecker';
import RNFS from '../../utils/fileSystemCompat';
import { MODELS_DIR } from '../../models/ModelConfig';

// ── llama.rn 동적 로드 ────────────────────────────────────────────
// 기존 추론 엔진과 동일한 패키지 → 추가 설치 불필요
let LlamaContext: {
  new(opts: {
    model: string;
    embedding: boolean;
    n_ctx: number;
    n_threads: number;
    n_batch: number;
    n_gpu_layers: number;
  }): {
    embedding(text: string, opts?: { pooling_type?: 'mean' | 'cls' | 'last' }): Promise<{ embedding: number[] }>;
    release(): Promise<void>;
  };
} | null = null;

// JSI 바인딩 가용 여부 (패키지는 설치됐지만 Expo Go / 링크 미완료 시 false)
let _llamaJsiAvailable = false;

try {
  const rn = require('llama.rn');
  // llama.rn v0.9.x: LlamaContext class
  LlamaContext = rn.LlamaContext ?? rn.default?.LlamaContext ?? null;
  if (!LlamaContext) {
    if (__DEV__) console.log('[EmbeddingEngine] llama.rn LlamaContext unavailable');
  } else {
    // JSI 바인딩 probe: 빈 생성자 호출 없이 네이티브 모듈 존재 여부로 판단
    try {
      const { NativeModules } = require('react-native');
      _llamaJsiAvailable = !!(NativeModules.RNLlama ?? NativeModules.Llama);
    } catch {
      _llamaJsiAvailable = false;
    }
    // NativeModules 이름이 다를 수 있으므로, 없어도 시도는 하되 에러 레벨을 낮춤
    if (!_llamaJsiAvailable && __DEV__) {
      console.log('[EmbeddingEngine] llama.rn JSI 바인딩 미확인 (커스텀 빌드 필요)');
    }
  }
} catch {
  if (__DEV__) console.log('[EmbeddingEngine] llama.rn not available');
}

// ── ExecuTorch 백엔드 (fallback) ──────────────────────────────────
interface TextEmbeddingsModuleType {
  load(opts: { modelSource: string; tokenizerSource: string }): Promise<void>;
  forward(text: string): Promise<number[]>;
  release(): Promise<void>;
}
interface TextEmbeddingsModuleClass {
  new(): TextEmbeddingsModuleType;
}

let ETModuleClass: TextEmbeddingsModuleClass | null = null;
let ETModule: TextEmbeddingsModuleType | null = null;
let ET_MODEL_OPTS: { modelSource: string; tokenizerSource: string } | null = null;

try {
  const etPkg = require('react-native-executorch');
  ETModuleClass = etPkg.TextEmbeddingsModule ?? null;
  ET_MODEL_OPTS = etPkg.ALL_MINILM_L6_V2 ?? null;
} catch {
  // not installed
}

// ── 상수 ─────────────────────────────────────────────────────────

// embeddinggemma-300m hidden_size = 768
export const EMBEDDING_DIM_GGUF = 768;
// ALL-MiniLM-L6-v2 dim = 384
export const EMBEDDING_DIM_ET = 384;
// sparse fallback dim
export const EMBEDDING_DIM_SPARSE = 384;

// 현재 활성 백엔드의 dim (런타임에 결정)
export let EMBEDDING_DIM = EMBEDDING_DIM_SPARSE;

const GGUF_EMBEDDING_MODEL = {
  hfRepo: 'second-state/embeddinggemma-300m-GGUF',
  hfFile: 'embeddinggemma-300m-Q4_K_M.gguf',
  dirName: 'embeddinggemma-300m',
  sizeMB: 180,
  /** Q4_K_M: 4비트 k-quant mixed precision — llama.cpp 완전 지원 ✅ */
  quantType: 'Q4_K_M' } as const;

// RAM 게이트 임계값 (MB)
const RAM_GATE_GGUF = 2048;  // GGUF 사용 가능한 최소 가용 RAM
const RAM_GATE_ET   = 1024;  // ExecuTorch 사용 가능한 최소 가용 RAM

const FALLBACK_MINILM_PTE = 'https://huggingface.co/software-mansion/react-native-executorch-all-MiniLM-L6-v2/resolve/main/all-MiniLM-L6-v2.pte';
const FALLBACK_MINILM_TOK = 'https://huggingface.co/software-mansion/react-native-executorch-all-MiniLM-L6-v2/resolve/main/tokenizer.json';

const PREFIX_DOCUMENT = 'search_document: ';
const PREFIX_QUERY    = 'search_query: ';

const DOCUMENT_CACHE_LIMIT = 400;
const QUERY_CACHE_LIMIT    = 100;

// ── 타입 ─────────────────────────────────────────────────────────

export type EmbeddingBackend = 'gguf' | 'executorch' | 'sparse';
export type EmbeddingState   = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

// ══════════════════════════════════════════════════════════════════
//  EmbeddingEngine
// ══════════════════════════════════════════════════════════════════

export class EmbeddingEngine {
  private static _instance: EmbeddingEngine;

  private state: EmbeddingState       = 'idle';
  private backend: EmbeddingBackend   = 'sparse';
  private activeDim: number           = EMBEDDING_DIM_SPARSE;

  private _loadPromise: Promise<boolean> | null = null;
  private _releasedDuringLoad                   = false;

  // llama.rn GGUF 컨텍스트 인스턴스
  private _llamaCtx: InstanceType<NonNullable<typeof LlamaContext>> | null = null;

  // LRU 캐시
  private readonly _documentCache = new Map<string, Float32Array>();
  private readonly _queryCache    = new Map<string, Float32Array>();
  private readonly _inflight      = new Map<string, Promise<Float32Array>>();

  // 다운로드 대기 리스너
  private _downloadResolvers: Array<(path: string) => void> = [];

  static getInstance(): EmbeddingEngine {
    if (!EmbeddingEngine._instance) {
      EmbeddingEngine._instance = new EmbeddingEngine();
      // 자동 로드 비활성화 - 명시적으로 load() 호출 필요
      if (__DEV__) console.log('[EmbeddingEngine] Instance created (lazy mode)');
    }
    return EmbeddingEngine._instance;
  }

  isReady():    boolean         { return this.state === 'ready'; }
  getState():   EmbeddingState  { return this.state; }
  getBackend(): EmbeddingBackend { return this.backend; }
  getDim():     number           { return this.activeDim; }

  // ── 로드 진입점 ──────────────────────────────────────────────

  async load(): Promise<boolean> {
    if (this.state === 'ready') return true;
    if (this._loadPromise)     return this._loadPromise;

    this._loadPromise = this._doLoad().finally(() => {
      this._loadPromise = null;
    });
    return this._loadPromise;
  }

  private async _doLoad(): Promise<boolean> {
    this.state               = 'loading';
    this._releasedDuringLoad = false;

    try {
      // ① RAM 게이트 체크
      const ram = await RAMChecker.getInstance().check();
      const availMB = ram.availableRAM;

      if (__DEV__) console.log(`[EmbeddingEngine] 가용 RAM: ${availMB}MB`);

      // ② GGUF 백엔드 시도 (우선)
      if (availMB >= RAM_GATE_GGUF && LlamaContext) {
        const ggufPath = await this._resolveGgufPath();
        if (ggufPath) {
          const ok = await this._loadGguf(ggufPath);
          if (ok) return true;
        } else {
          // 파일 없음 → 다운로드 큐에 등록 후 다운로드 완료 대기
          if (__DEV__) console.log('[EmbeddingEngine] GGUF 모델 없음 → 다운로드 대기');
          // 비동기로 다운로드 트리거 (ModelDownloader 연동)
          this._scheduleGgufDownload();
          // 일단 아래로 넘겨서 ExecuTorch 시도
        }
      }

      // ③ ExecuTorch 백엔드 시도
      if (availMB >= RAM_GATE_ET) {
        const ok = await this._loadExecuTorch();
        if (ok) return true;
      }

      // ④ 모두 실패 → sparse fallback
      this._activateSparse();
      return false;

    } catch (e) {
      console.warn('[EmbeddingEngine] load 실패, sparse fallback:', e);
      this._activateSparse();
      return false;
    }
  }

  // ── GGUF 경로 해결 ────────────────────────────────────────────

  private async _resolveGgufPath(): Promise<string | null> {
    try {
      const dir  = `${RNFS.DocumentDirectoryPath}/${MODELS_DIR}/${GGUF_EMBEDDING_MODEL.dirName}`;
      const path = `${dir}/${GGUF_EMBEDDING_MODEL.hfFile}`;
      const exists = await RNFS.exists(path);
      if (!exists) return null;

      // 파일 크기 검증 (최소 100MB = 다운로드 완료 간주)
      const stat = await RNFS.stat(path);
      if (!stat) return null;
      const sizeMB = Number(stat.size) / (1024 * 1024);
      if (sizeMB < 100) {
        if (__DEV__) console.log(`[EmbeddingEngine] GGUF 파일 불완전 (${sizeMB.toFixed(1)}MB)`);
        return null;
      }

      return path;
    } catch {
      return null;
    }
  }

  // ── GGUF 로드 (llama.rn) ─────────────────────────────────────

  private async _loadGguf(modelPath: string): Promise<boolean> {
    if (!LlamaContext) return false;

    try {
      // RAM 기반 n_threads 결정
      const ram = await RAMChecker.getInstance().check();
      const nThreads = ram.totalRAM >= 8192 ? 4 : ram.totalRAM >= 6144 ? 3 : 2;

      // llama.rn embedding 모드:
      //   embedding: true  → --embedding 플래그 활성화
      //   n_ctx: 512       → 임베딩용 짧은 컨텍스트 (메모리 절약)
      //   n_gpu_layers: 0  → 추론 모델과 GPU 공유 방지 (CPU 전용)
      //   n_batch: 512     → 배치 추론 지원
      this._llamaCtx = new LlamaContext({
        model:        modelPath,
        embedding:    true,
        n_ctx:        512,
        n_threads:    nThreads,
        n_batch:      512,
        n_gpu_layers: 0,   // 임베딩은 CPU — 추론 GPU 슬롯 보존
      });

      if (this._releasedDuringLoad) {
        await this._llamaCtx.release();
        this._llamaCtx = null;
        this.state = 'idle';
        return false;
      }

      // 로드 검증: 빈 쿼리로 차원 확인
      const testVec = await this._llamaCtx.embedding('test', { pooling_type: 'mean' });
      if (!testVec?.embedding || testVec.embedding.length === 0) {
        throw new Error('빈 임베딩 결과');
      }

      this.activeDim = testVec.embedding.length;
      EMBEDDING_DIM  = this.activeDim;
      this.backend   = 'gguf';
      this.state     = 'ready';

      if (__DEV__) console.log(`[EmbeddingEngine] GGUF 백엔드 준비 (dim=${this.activeDim}, Q4_K_M)`);
      return true;

    } catch (e) {
      // JSI 바인딩 미설치(Expo Go 등)는 예상된 실패 → warn 대신 dev log
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('JSI bindings not installed') || msg.includes('JSI') || msg.includes('bindings')) {
        if (__DEV__) console.log('[EmbeddingEngine] GGUF 스킵: JSI 바인딩 없음 (커스텀 dev client 필요)');
      } else {
        console.warn('[EmbeddingEngine] GGUF 로드 실패:', e);
      }
      if (this._llamaCtx) {
        try { await this._llamaCtx.release(); } catch {}
        this._llamaCtx = null;
      }
      return false;
    }
  }

  // ── ExecuTorch 로드 ───────────────────────────────────────────

  private async _loadExecuTorch(): Promise<boolean> {
    if (!ETModule && ETModuleClass) {
      try { ETModule = new ETModuleClass(); } catch { ETModule = null; }
    }
    if (!ETModule) return false;

    try {
      const opts = ET_MODEL_OPTS ?? {
        modelSource:     FALLBACK_MINILM_PTE,
        tokenizerSource: FALLBACK_MINILM_TOK };
      await ETModule.load(opts);

      if (this._releasedDuringLoad) {
        try { await ETModule.release(); } catch {}
        ETModule = null;
        this.state = 'idle';
        return false;
      }

      this.activeDim = EMBEDDING_DIM_ET;
      EMBEDDING_DIM  = EMBEDDING_DIM_ET;
      this.backend   = 'executorch';
      this.state     = 'ready';
      if (__DEV__) console.log('[EmbeddingEngine] ExecuTorch 백엔드 준비 (ALL-MiniLM-L6-v2)');
      return true;
    } catch (e) {
      console.warn('[EmbeddingEngine] ExecuTorch 로드 실패:', e);
      return false;
    }
  }

  // ── Sparse 활성화 ─────────────────────────────────────────────

  private _activateSparse(): void {
    this.activeDim = EMBEDDING_DIM_SPARSE;
    EMBEDDING_DIM  = EMBEDDING_DIM_SPARSE;
    this.backend   = 'sparse';
    this.state     = 'unavailable';
    if (__DEV__) console.log('[EmbeddingEngine] Sparse 폴백 활성화');
  }

  // ── 다운로드 스케줄 ───────────────────────────────────────────

  /**
   * 백그라운드에서 GGUF 임베딩 모델 다운로드.
   * ModelDownloader를 직접 import하면 순환참조 발생 → dynamic require 사용.
   */
  private _scheduleGgufDownload(): void {
    // 이미 다운로드 중이면 스킵
    Promise.resolve().then(async () => {
      try {
        const { modelDownloader } = require('./ModelDownloader') as {
          modelDownloader: {
            downloadEmbeddingModel(opts: {
              hfRepo: string;
              hfFile: string;
              dirName: string;
              sizeMB: number;
            }): Promise<string>;
          };
        };
        const path = await modelDownloader.downloadEmbeddingModel(GGUF_EMBEDDING_MODEL);
        if (path) {
          if (__DEV__) console.log('[EmbeddingEngine] 다운로드 완료, 자동 로드 재시도');
          // 기존 state 리셋 후 재로드
          this.state = 'idle';
          await this.load();
        }
      } catch (e) {
        if (__DEV__) console.warn('[EmbeddingEngine] GGUF 다운로드 실패:', e);
      }
    });
  }

  /**
   * ModelDownloader가 임베딩 모델 다운로드 완료를 알려주는 콜백.
   * ModelDownloader.ts에서 downloadEmbeddingModel() 완료 시 호출.
   */
  onDownloadComplete(modelPath: string): void {
    this._downloadResolvers.forEach(resolve => resolve(modelPath));
    this._downloadResolvers = [];

    // 현재 상태가 unavailable/idle이면 재로드 시도
    if (this.state === 'unavailable' || this.state === 'idle') {
      this.state = 'idle';
      this.load().catch(() => {});
    }
  }

  // ── 공개 임베딩 API ──────────────────────────────────────────

  async embedDocument(text: string): Promise<Float32Array> {
    return this._embedCached(
      PREFIX_DOCUMENT + text.slice(0, 512),
      this._documentCache,
      DOCUMENT_CACHE_LIMIT,
    );
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return this._embedCached(
      PREFIX_QUERY + text.slice(0, 256),
      this._queryCache,
      QUERY_CACHE_LIMIT,
    );
  }

  async embedDocumentBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // sparse 모드이거나 미준비 시 즉시 sparse 배치 반환
    if (!this.isReady() || this.backend === 'sparse') {
      return texts.map(t => _generateSparseEmbedding(PREFIX_DOCUMENT + t.slice(0, 512)));
    }

    const results = new Array<Float32Array>(texts.length);
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3; // 연속 에러 임계값
    const BATCH_CONCURRENCY = 4;      // 동시 처리 수

    for (let i = 0; i < texts.length; i += BATCH_CONCURRENCY) {
      // 연속 에러 3회 이상 → 엔진 불안정, 나머지 전부 sparse 폴백
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        if (__DEV__) console.warn('[EmbeddingEngine] 연속 에러 감지 — 나머지 sparse 폴백');
        for (let j = i; j < texts.length; j++) {
          const t = texts[j];
          results[j] = _generateSparseEmbedding(PREFIX_DOCUMENT + (t?.slice(0, 512) ?? ''));
        }
        break;
      }

      const chunk = texts.slice(i, Math.min(i + BATCH_CONCURRENCY, texts.length));
      const settled = await Promise.allSettled(
        chunk.map(text =>
          text.trim()
            ? this.embedDocument(text)
            : Promise.resolve(_generateSparseEmbedding(PREFIX_DOCUMENT + text.slice(0, 512)))
        ),
      );

      for (let j = 0; j < settled.length; j++) {
        const r = settled[j]!;
        if (r.status === 'fulfilled') {
          results[i + j] = r.value;
          consecutiveErrors = 0; // 성공 시 연속 에러 카운트 초기화
        } else {
          const t = chunk[j];
          results[i + j] = _generateSparseEmbedding(PREFIX_DOCUMENT + (t?.slice(0, 512) ?? ''));
          consecutiveErrors++;
        }
      }
    }

    return results;
  }

  async findSimilar(
    query:   string,
    sceneId: string,
    topK:    number = 5,
  ): Promise<Conversation[]> {
    const candidates = await db.getRecentConversationsByScene(sceneId, 50);
    if (candidates.length === 0) return [];

    if (!this.isReady() || this.backend === 'sparse') {
      return candidates
        .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
        .slice(0, topK);
    }

    try {
      const queryVec = await this.embedQuery(query);
      const docVecs  = await this.embedDocumentBatch(candidates.map(c => c.content));
      return candidates
        .map((conv, i) => ({ conv, score: _cosineSimilarity(queryVec, docVecs[i]!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(x => x.conv);
    } catch {
      return candidates
        .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
        .slice(0, topK);
    }
  }

  async rerank<T extends { text: string }>(query: string, docs: T[]): Promise<T[]> {
    if (!docs.length) return docs;
    if (!this.isReady() || this.backend === 'sparse') return docs;
    try {
      const queryVec = await this.embedQuery(query);
      const docVecs  = await this.embedDocumentBatch(docs.map(d => d.text));
      return docs
        .map((doc, i) => ({ doc, score: _cosineSimilarity(queryVec, docVecs[i]!) }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.doc);
    } catch {
      return docs;
    }
  }

  // ── 릴리즈 ───────────────────────────────────────────────────

  async release(): Promise<void> {
    this._releasedDuringLoad = true;
    this._documentCache.clear();
    this._queryCache.clear();
    this._inflight.clear();

    if (this._llamaCtx) {
      try { await this._llamaCtx.release(); } catch {}
      this._llamaCtx = null;
    }

    if (ETModule && (this.state === 'ready' || this.state === 'loading')) {
      try { await ETModule.release(); } catch {}
      ETModule = null;
    }

    this.state = 'idle';
    if (__DEV__) console.log('[EmbeddingEngine] released');
  }

  // ── 내부 캐시 헬퍼 ───────────────────────────────────────────

  private _cloneVec(vec: Float32Array): Float32Array {
    return new Float32Array(vec);
  }

  private _getCached(cache: Map<string, Float32Array>, key: string): Float32Array | null {
    const v = cache.get(key);
    if (!v) return null;
    // LRU: 최근 사용 항목을 맨 뒤로 이동
    cache.delete(key);
    cache.set(key, v);
    return this._cloneVec(v);
  }

  private _setCached(
    cache: Map<string, Float32Array>,
    key:   string,
    vec:   Float32Array,
    limit: number,
  ): void {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, this._cloneVec(vec));
    while (cache.size > limit) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cache.delete(oldest);
    }
  }

  private async _embedCached(
    prefixedText: string,
    cache:        Map<string, Float32Array>,
    limit:        number,
  ): Promise<Float32Array> {
    const cached = this._getCached(cache, prefixedText);
    if (cached) return cached;

    let inflight = this._inflight.get(prefixedText);
    if (!inflight) {
      inflight = this._embed(prefixedText)
        .then(vec => {
          this._setCached(cache, prefixedText, vec, limit);
          return vec;
        })
        .finally(() => {
          this._inflight.delete(prefixedText);
        });
      this._inflight.set(prefixedText, inflight);
    }

    return this._cloneVec(await inflight);
  }

  private async _embed(prefixedText: string): Promise<Float32Array> {
    // GGUF 백엔드
    if (this.backend === 'gguf' && this._llamaCtx && this.state === 'ready') {
      const result = await this._llamaCtx.embedding(prefixedText, { pooling_type: 'mean' });
      if (!result?.embedding || result.embedding.length === 0) {
        throw new Error('[EmbeddingEngine] GGUF: 빈 임베딩 결과');
      }
      return _normalizeL2(new Float32Array(result.embedding));
    }

    // ExecuTorch 백엔드
    if (this.backend === 'executorch' && ETModule && this.state === 'ready') {
      const raw = await ETModule.forward(prefixedText);
      if (!raw || raw.length === 0) {
        throw new Error('[EmbeddingEngine] ExecuTorch: 빈 임베딩 결과');
      }
      return _normalizeL2(new Float32Array(raw));
    }

    // sparse 폴백 (항상 사용 가능)
    return _generateSparseEmbedding(prefixedText);
  }

  /** [NEW] 앱 종료 시 리소스 정리 */
  async destroy(): Promise<void> {
    this._releasedDuringLoad = true;
    this.state = 'idle';

    if (this._llamaCtx) {
      try {
        await this._llamaCtx.release();
      } catch { /* ignore */ }
      this._llamaCtx = null;
    }

    if (ETModule) {
      try {
        await ETModule.release();
      } catch { /* ignore */ }
      ETModule = null;
    }

    this._documentCache.clear();
    this._queryCache.clear();
    this._inflight.clear();
    this.backend = 'sparse';
    
    if (__DEV__) console.log('[EmbeddingEngine] 리소스 정리 완료');
  }
}

// ── 공개 순수 함수 ────────────────────────────────────────────────

/**
 * Sparse (BM25-style character n-gram) 임베딩.
 * 실제 의미 유사도는 낮지만 RAM 제로 + 즉시 사용 가능.
 */
export function _generateSparseEmbedding(text: string): Float32Array {
  const dim        = EMBEDDING_DIM_SPARSE;
  const vec        = new Float32Array(dim);
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

  for (let i = 0; i < normalized.length; i++) {
    const c1 = normalized.charCodeAt(i);
    vec[c1 % dim] += 1;
    if (i + 1 < normalized.length) {
      const c2 = normalized.charCodeAt(i + 1);
      vec[(c1 * 31 + c2) % dim] += 0.7;
    }
  }

  for (const word of normalized.split(' ')) {
    if (!word) continue;
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = (h * 31 + word.charCodeAt(i)) % dim;
    }
    vec[Math.abs(h)] += 1.5;
  }

  return _normalizeL2(vec);
}

/** 코사인 유사도 (L2-normalized 벡터 전제 → 내적 = cosine) */
export function _cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** L2 정규화 */
export function _normalizeL2(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm < 1e-10) return vec;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i]! / norm;
  return out;
}

// ── base64 유틸 (Hermes 환경용 폴리필 포함) ─────────────────────

function _btoaSafe(binary: string): string {
  if (typeof (globalThis as unknown as { btoa?: (s: string) => string }).btoa === 'function') {
    return (globalThis as unknown as { btoa: (s: string) => string }).btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < binary.length) {
    const a = binary.charCodeAt(i++);
    const b = binary.charCodeAt(i++);
    const c = binary.charCodeAt(i++);
    /* eslint-disable no-bitwise */
    result +=
      chars[a >> 2] +
      chars[((a & 3) << 4) | (b >> 4)] +
      (isNaN(b) ? '=' : chars[((b & 15) << 2) | (c >> 6)]) +
      (isNaN(c) ? '=' : chars[c & 63]);
    /* eslint-enable no-bitwise */
  }
  return result;
}

function _atobSafe(b64: string): string {
  if (typeof (globalThis as unknown as { atob?: (s: string) => string }).atob === 'function') {
    return (globalThis as unknown as { atob: (s: string) => string }).atob(b64);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = '';
  let i = 0;
  const input = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < input.length) {
    const e1 = chars.indexOf(input[i++]!);
    const e2 = chars.indexOf(input[i++]!);
    const e3 = chars.indexOf(input[i++]!);
    const e4 = chars.indexOf(input[i++]!);
    // eslint-disable-next-line no-bitwise
    str += String.fromCharCode((e1 << 2) | (e2 >> 4));
    // eslint-disable-next-line no-bitwise
    if (e3 !== 64) str += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
    // eslint-disable-next-line no-bitwise
    if (e4 !== 64) str += String.fromCharCode(((e3 & 3) << 6) | e4);
  }
  return str;
}

export function float32ToBase64(vec: Float32Array): string {
  const bytes = new Uint8Array(vec.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return _btoaSafe(binary);
}

export function base64ToFloat32(b64: string): Float32Array {
  const binary = _atobSafe(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// ── 싱글톤 Proxy 내보내기 ─────────────────────────────────────────

let _embeddingInstance: EmbeddingEngine | null = null;
export const embeddingEngine = new Proxy({} as EmbeddingEngine, {
  get(_t, p) {
    if (!_embeddingInstance) _embeddingInstance = EmbeddingEngine.getInstance();
    return (_embeddingInstance as unknown as Record<string | symbol, unknown>)[p as string];
  },
  set(_t, p, v) {
    if (!_embeddingInstance) _embeddingInstance = EmbeddingEngine.getInstance();
    (_embeddingInstance as unknown as Record<string | symbol, unknown>)[p as string] = v;
    return true;
  } });
export default embeddingEngine;
