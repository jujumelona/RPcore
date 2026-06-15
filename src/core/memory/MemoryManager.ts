// src/core/memory/MemoryManager.ts
// RAM 기반 동적 임계값 + KV History 트리밍 연동
// ════════════════════════════════════════════════════════════
//
// Kotlin conversation history가 TRIM_THRESHOLD_TURNS 초과하면
// shouldTrim=true 반환 → 여기서 요약 후 trimHistory() 호출
//
// RAM 기반 keep_turns 계산:
//   12GB+ → 20턴 유지
//   8GB   → 15턴
//   6GB   → 10턴
//   4GB   → 6턴
//
// RAG 파이프라인 (3-way hybrid):
//   BM25    : 인메모리 pool 키워드 랭킹 (최근 120개 범위)
//   Vector  : EmbeddingEngine 코사인 유사도 (GGUF/ExecuTorch/sparse)
//   FTS5    : SQLite 전체 이력 BM25 (pool 밖 오래된 대화까지 발굴)
//   RRF     : Reciprocal Rank Fusion으로 세 신호 합산
//   Recency : 시간 감쇠 보정 (temporalDecayScore)
//
//   EmbeddingEngine 백엔드별 동작:
//     GGUF(embeddinggemma-300m) : 768차원 실제 의미 유사도 (최고 품질)
//     ExecuTorch(ALL-MiniLM)    : 384차원 의미 유사도 (중간)
//     sparse fallback           : BM25 우선, vec 결과 가중치 낮춤
// ════════════════════════════════════════════════════════════

import { db } from '../sqlite/Database';
import { Conversation } from '../sqlite/Schemas';
import { RAMChecker } from '../../utils/RAMChecker';
import { BM25Index } from '../../BM25Index/BM25Index';
import { embeddingEngine } from '../llama/EmbeddingEngine';
import { vectorSearch } from '../vector/VectorSearch';
import { rrfFuse, temporalDecayScore } from '../../utils/MathUtils';
// [BUG-026 FIX] onDeviceSummarizer import 추가 — _handleShouldTrim에서 실제 요약 호출
import { onDeviceSummarizer } from './OnDeviceSummarizer';

const SHORT_TERM_FETCH    = 12;
const RECENT_POOL_LIMIT   = 120;
const IMPORTANT_POOL_LIMIT = 40;
const MIDTERM_LIMIT        = 6;
const BM25_TOP_K           = 10;
const VEC_TOP_K            = 8;
const FTS_TOP_K            = 8;
const RRF_K                = 60;
const RECENCY_LAMBDA       = 0.05;
const RECENCY_WEIGHT       = 0.12;
const QUERY_MIN_LEN        = 2;

// Sparse 폴백 시 벡터 RRF 가중치 감소 (BM25/FTS5 신뢰도 높임)
const VEC_WEIGHT_SEMANTIC = 1.0;   // GGUF/ExecuTorch
const VEC_WEIGHT_SPARSE   = 0.35;  // sparse fallback

export interface MemoryContext {
  shortTerm: Conversation[];
  midTerm:   string[];
  longTerm:  string;
}

interface MemoryScope {
  sceneId?: string;
  storyId?: string;
}

export class MemoryManager {
  private static instance: MemoryManager;
  // [REMOVED] summarizing flag (use onDeviceSummarizer.getSummarizing())
  private keepTurns   = 10;
  private readonly pending = new Set<Promise<void>>();
  private initialized = false;
  private initializePromise: Promise<void> | null = null;

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  // ── RAM 기반 초기화 ─────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = this._initialize();
    try {
      await this.initializePromise;
      this.initialized = true;
    } finally {
      this.initializePromise = null;
    }
  }

  private async _initialize(): Promise<void> {
    const ramInfo = await RAMChecker.getInstance().check();
    const gb = ramInfo.totalRAM / 1024;

    if      (gb >= 12) this.keepTurns = 20;
    else if (gb >= 8)  this.keepTurns = 15;
    else if (gb >= 6)  this.keepTurns = 10;
    else               this.keepTurns = 6;

    if (__DEV__) console.log(`[MemoryManager] RAM=${gb.toFixed(1)}GB keepTurns=${this.keepTurns}`);

    // VectorSearch FTS5 초기화 (DB 준비 완료 전제)
    try {
      await vectorSearch.init();
    } catch (e) {
      if (__DEV__) console.warn('[MemoryManager] VectorSearch init 실패 (FTS5 미지원 환경):', e);
    }

    // 임베딩 엔진은 실제 의미 검색이 필요한 시점에만 lazy load 된다.
    // 앱 시작 직후 자동 로드는 발열과 초기 버벅임을 키우므로 제거한다.
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise as Promise<void>;
    this.pending.add(tracked);
    tracked.finally(() => { this.pending.delete(tracked); });
    return promise;
  }

  async awaitFlush(): Promise<void> {
    await Promise.allSettled(Array.from(this.pending));
  }

  async onChapterTransition(_storyId?: string): Promise<void> {
    await this.awaitFlush();
  }

  /** [NEW] 앱 종료 시 리소스 정리 */
  async destroy(): Promise<void> {
    await this.awaitFlush();
    await embeddingEngine.destroy();
    this.pending.clear();
    this.initialized = false;
    this.initializePromise = null;
  }

  // ── shouldTrim 처리 ─────────────────────────────────────────

  async handleShouldTrim(sceneId: string, baseTrigger: number = this.keepTurns): Promise<void> {
    if (!sceneId || onDeviceSummarizer.getSummarizing()) return;
    const task = this._handleShouldTrim(sceneId, baseTrigger);
    this.track(task);
    await task;
  }

  private async _handleShouldTrim(sceneId: string, baseTrigger: number): Promise<void> {
    if (onDeviceSummarizer.getSummarizing()) return;
    // Note: onDeviceSummarizer.maybeRunSummary sets its own flag
    try {
      if (__DEV__) console.log(`[MemoryManager] trimHistory ${baseTrigger}턴 유지`);
      await onDeviceSummarizer.maybeRunSummary(sceneId, baseTrigger);
    } catch (e) {
      console.error('[MemoryManager] trimHistory 실패:', e);
    } finally {
      // Flag cleared inside OnDeviceSummarizer
    }
  }

  // ── 메모리 컨텍스트 조회 ────────────────────────────────────

  async getMemoryContext(referenceId: string, query: string = ''): Promise<MemoryContext> {
    await this.initialize();
    const scope = this.resolveScope(referenceId);

    const shortTerm  = this.getRecentConversations(scope, SHORT_TERM_FETCH);
    const important  = this.getImportantConversations(scope, IMPORTANT_POOL_LIMIT);

    const midTermConvs = await this.selectMidTerm(scope, query, important);
    const midTerm      = midTermConvs.map(c => `${c.speaker_type}: ${c.content}`);

    const summaries = scope.sceneId ? db.getMemorySummaries(scope.sceneId, 'long') : [];
    const longTerm  = summaries.map(s => s.content).join(' ');

    return { shortTerm, midTerm, longTerm };
  }

  // ── 내부 유틸 ───────────────────────────────────────────────

  private resolveScope(referenceId: string): MemoryScope {
    if (!referenceId) return {};

    const scene = db.getScene(referenceId);
    if (scene) return { sceneId: scene.id, storyId: scene.story_id };

    const currentScene = db.getCurrentScene();
    if (currentScene && currentScene.story_id === referenceId) {
      return { sceneId: currentScene.id, storyId: currentScene.story_id };
    }

    return { storyId: referenceId };
  }

  private getRecentConversations(scope: MemoryScope, limit: number): Conversation[] {
    if (scope.sceneId) return db.getRecentConversationsByScene(scope.sceneId, limit);
    if (scope.storyId) return db.getRecentConversationsByStory(scope.storyId, limit);
    return db.getRecentConversations(limit);
  }

  private getImportantConversations(scope: MemoryScope, limit: number): Conversation[] {
    if (scope.sceneId) return db.getImportantConversations(scope.sceneId, limit);
    if (scope.storyId) return db.getImportantConversationsByStory(scope.storyId, limit);
    return db.getImportantConversations(undefined, limit);
  }

  private buildConvId(conv: Conversation, fallback?: number): string {
    if (conv.id != null)   return `id:${conv.id}`;
    if (conv.client_id)    return `client:${conv.client_id}`;
    if (typeof fallback === 'number') return `idx:${fallback}`;
    return `ts:${conv.timestamp ?? 0}`;
  }

  private dedupeConversations(list: Conversation[]): Conversation[] {
    const seen   = new Set<string>();
    const result: Conversation[] = [];
    list.forEach((conv, idx) => {
      const key = this.buildConvId(conv, idx);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(conv);
    });
    return result;
  }

  private rankByRecency(list: Conversation[]): Conversation[] {
    return list
      .map(conv => {
        const importance = conv.importance_score ?? (conv.is_important ? 7 : 5);
        const ts         = conv.timestamp ?? 0;
        const score      = temporalDecayScore(importance / 10, ts, RECENCY_LAMBDA);
        return { conv, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MIDTERM_LIMIT)
      .map(x => x.conv);
  }

  // ── 3-way Hybrid RAG ────────────────────────────────────────

  private async selectMidTerm(
    scope:     MemoryScope,
    query:     string,
    important: Conversation[],
  ): Promise<Conversation[]> {
    const queryText = query.trim();
    const hasQuery  = queryText.length >= QUERY_MIN_LEN;

    const recentPool = this.getRecentConversations(scope, RECENT_POOL_LIMIT);
    const pool       = this.dedupeConversations([...important, ...recentPool]);
    if (!pool.length) return [];

    if (!hasQuery) {
      return this.rankByRecency(important.length ? important : pool);
    }

    const candidateMap = new Map<string, Conversation>();
    pool.forEach((conv, idx) => {
      candidateMap.set(this.buildConvId(conv, idx), conv);
    });

    // ── 1. BM25 (인메모리 pool) ─────────────────────────────────
    const bm25        = new BM25Index(pool.map(c => c.content));
    const bm25Results = bm25.topK(queryText, Math.min(BM25_TOP_K, pool.length))
      .map(r => ({
        id:    this.buildConvId(pool[r.index]!, r.index),
        score: r.score }));

    // ── 2. Vector (EmbeddingEngine) ─────────────────────────────
    let vecResults: Array<{ id: string; score: number }> = [];
    const embeddingReady  = embeddingEngine.isReady();
    const embeddingBackend = embeddingEngine.getBackend?.() ?? 'sparse';
    const vecWeight       = embeddingBackend === 'sparse' ? VEC_WEIGHT_SPARSE : VEC_WEIGHT_SEMANTIC;

    if (scope.sceneId && embeddingReady) {
      try {
        const vecConvs = await embeddingEngine.findSimilar(queryText, scope.sceneId, VEC_TOP_K);
        vecResults = vecConvs.map((conv, idx) => {
          const id = conv.id != null ? `id:${conv.id}` : this.buildConvId(conv, idx);
          if (!candidateMap.has(id)) candidateMap.set(id, conv);
          return { id, score: (VEC_TOP_K - idx) * vecWeight };
        });
      } catch (e) {
        if (__DEV__) console.warn('[MemoryManager] Vector 검색 실패, BM25/FTS5만 사용:', e);
      }
    }

    // ── 3. FTS5 (SQLite 전체 이력) ──────────────────────────────
    let ftsResults: Array<{ id: string; score: number }> = [];
    if (vectorSearch.isAvailable()) {
      try {
        const ftsConvs = await vectorSearch.search(
          queryText,
          FTS_TOP_K,
          0,
          scope.storyId ? { storyId: scope.storyId } : {},
        );
        ftsResults = ftsConvs.map((mem, idx) => {
          const convId = `fts:${mem.conversationId}`;
          if (!candidateMap.has(convId)) {
            const fetched = db.getConversationById(mem.conversationId);
            if (fetched) candidateMap.set(convId, fetched);
          }
          return { id: convId, score: FTS_TOP_K - idx };
        });
      } catch {
        // FTS5 실패 시 조용히 무시
      }
    }

    // ── 4. RRF Fusion ───────────────────────────────────────────
    const fused = rrfFuse([bm25Results, vecResults, ftsResults], RRF_K);
    if (!fused.size) {
      return this.rankByRecency(important.length ? important : pool);
    }

    // ── 5. 시간 감쇠 보정 후 최종 랭킹 ──────────────────────────
    const ranked = Array.from(fused.entries())
      .map(([id, score]) => {
        const conv = candidateMap.get(id);
        if (!conv) return null;
        const importance = conv.importance_score ?? (conv.is_important ? 7 : 5);
        const ts         = conv.timestamp ?? 0;
        const recency    = temporalDecayScore(importance / 10, ts, RECENCY_LAMBDA);
        return { conv, score: score + RECENCY_WEIGHT * recency };
      })
      .filter((x): x is { conv: Conversation; score: number } => Boolean(x));

    return ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, MIDTERM_LIMIT)
      .map(x => x.conv);
  }

  // ── DB 대화 저장 ────────────────────────────────────────────

  async addConversation(conv: Omit<Conversation, 'id' | 'timestamp'>): Promise<void> {
    db.insertConversation(conv);
    // FTS5 인덱스는 content='conversations' 트리거로 자동 업데이트됨
  }

  isSummarizing() { return onDeviceSummarizer.getSummarizing(); }
  getKeepTurns()  { return this.keepTurns; }
}

let _memoryMgrInstance: MemoryManager | null = null;
export const memoryManager = new Proxy({} as MemoryManager, {
  get(_t, p) {
    if (!_memoryMgrInstance) _memoryMgrInstance = MemoryManager.getInstance();
    return (_memoryMgrInstance as unknown as Record<string | symbol, unknown>)[p as string];
  },
  set(_t, p, v) {
    if (!_memoryMgrInstance) _memoryMgrInstance = MemoryManager.getInstance();
    (_memoryMgrInstance as unknown as Record<string | symbol, unknown>)[p as string] = v;
    return true;
  } });
