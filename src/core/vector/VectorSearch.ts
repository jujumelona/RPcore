// src/core/vector/VectorSearch.ts
// ═══════════════════════════════════════════════════════════════════
// v2 — FTS5 + Embedding 하이브리드 검색
//
// ── 변경 이유 ──────────────────────────────────────────────────
//   v1: FTS5 키워드 검색만 사용 → 의미 기반 유사도 0
//       EmbeddingEngine.ts는 존재하지만 VectorSearch와 통합 안 됨
//
//   v2: FTS5(키워드) + EmbeddingEngine(의미) 하이브리드
//       RRF (Reciprocal Rank Fusion)로 두 스코어 결합
//       → "옛날 그 카페" 검색 시 "이전에 갔던 커피숍" 관련 대화도 반환
//
// ── 아키텍처 ──────────────────────────────────────────────────
 
//   검색 흐름:
//     ① FTS5 → topK×3 후보 추출 (키워드 BM25 랭킹)
//     ② EmbeddingEngine → 쿼리/문서 임베딩 → 코사인 유사도
//     ③ RRF 점수 = 1/(k+fts_rank) + 1/(k+cosine_rank) 로 결합
//     ④ EmbeddingEngine 미준비 → FTS5 전용 경로 (폴백)
//
//   참고: SillyTavern RAG 시스템, OP-SQLite + sqlite-vss 패턴
// ═══════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { db } from '../sqlite/Database';
import { dbPool } from '../sqlite/DatabasePool';

// ── 임베딩 엔진 동적 로드 (순환참조 방지) ─────────────────────────
let _embeddingEngine: {
  isReady(): boolean;
  embedQuery(text: string): Promise<Float32Array>;
  embedDocumentBatch(texts: string[]): Promise<Float32Array[]>;
} | null = null;

function getEmbeddingEngine() {
  if (!_embeddingEngine) {
    try {
      const { embeddingEngine } = require('../llama/EmbeddingEngine') as {
        embeddingEngine: typeof _embeddingEngine;
      };
      _embeddingEngine = embeddingEngine;
    } catch {
      // EmbeddingEngine 미사용 환경
    }
  }
  return _embeddingEngine;
}

// ── RRF 상수 ──────────────────────────────────────────────────────
// k=60은 RRF 논문 기본값 — FTS 순위와 임베딩 순위의 균형점
const RRF_K = 60;

export interface VectorMemory {
  id: string;
  conversationId: number;
  text: string;
  timestamp: number;
  importance: number;
  score?: number;
}

export interface VectorSearchOptions {
  storyId?: string;
  sceneId?: string;
}

export class VectorSearch {
  private initialized = false;
  private initializing = false;
  private unavailable = false;
  private warnedUnavailable = false;
  private ensureReadyPromise: Promise<boolean> | null = null;

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || '';
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      const direct =
        record.message ??
        record.errorMessage ??
        record.nativeMessage ??
        record.description;
      if (typeof direct === 'string') return direct;
      if (record.cause) return this.getErrorMessage(record.cause);
    }
    return String(error ?? '');
  }

  private isFtsUnavailable(error: unknown): boolean {
    const message = this.getErrorMessage(error);
    return /no such module: fts5|no such table: (main\.)?conversations_fts/i.test(message);
  }

  private markUnavailable(error: unknown): void {
    this.initialized = false;
    this.initializing = false;
    this.unavailable = true;
    this.ensureReadyPromise = null;
    if (__DEV__ && !this.warnedUnavailable) {
      const message = this.getErrorMessage(error);
      console.warn('[VectorSearch] FTS unavailable, disabling vector search:', message);
      this.warnedUnavailable = true;
    }
  }

  private async ensureFtsReady(): Promise<boolean> {
    if (this.unavailable) return false;
    if (this.initialized) return true;
    if (this.ensureReadyPromise) return this.ensureReadyPromise;
    this.initializing = true;

    this.ensureReadyPromise = (async () => {
      try {
        const existing = await dbPool.readQueryAsync<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations_fts' LIMIT 1`,
          [],
        );
        let hasFtsTable = existing.length > 0;

        if (!hasFtsTable) {
          await dbPool.write(tx => tx.runRaw(`
            CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts
            USING fts5(
              content,
              speaker_id,
              story_id,
              content='conversations',
              content_rowid='id'
            );
          `));
          const recreated = await dbPool.readQueryAsync<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations_fts' LIMIT 1`,
            [],
          );
          hasFtsTable = recreated.length > 0;
        }

        if (!hasFtsTable) {
          this.initialized = false;
          this.unavailable = true;
          return false;
        }

        try {
          const ftsCount = await dbPool.readQueryAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM conversations_fts', []);
          const convCount = await dbPool.readQueryAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM conversations', []);
          const ftsEmpty = (ftsCount[0]?.cnt ?? 0) === 0;
          const hasConvData = (convCount[0]?.cnt ?? 0) > 0;
          if (ftsEmpty && hasConvData) {
            await dbPool.write(tx => tx.runRaw(`INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild');`));
          }
        } catch (rebuildError) {
          if (this.isFtsUnavailable(rebuildError)) {
            this.markUnavailable(rebuildError);
            return false;
          }
          await dbPool.write(tx => tx.runRaw(`INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild');`));
        }

        this.initialized = true;
        this.initializing = false;
        this.unavailable = false;
        return true;
      } catch (e) {
        if (this.isFtsUnavailable(e)) {
          this.markUnavailable(e);
          return false;
        }
        console.error('[VectorSearch] ensureFtsReady failed:', e);
        this.initialized = false;
        this.initializing = false;
        return false;
      } finally {
        this.initializing = false;
        this.ensureReadyPromise = null;
      }
    })();

    return this.ensureReadyPromise;
  }

  // ──────────────────────────────────────────────────────────
  // 초기화 — FTS5 가상 테이블 생성 (앱 시작 시 1회 호출)
  // ──────────────────────────────────────────────────────────
  async init(): Promise<void> {
    const ready = await this.ensureFtsReady();
    if (ready && __DEV__) console.log('[VectorSearch] FTS5 + Hybrid 초기화 완료');
    return;
  }

  isAvailable(): boolean {
    return this.initialized && !this.unavailable && !this.initializing;
  }

  // ──────────────────────────────────────────────────────────
  // 대화 추가 — FTS 인덱스 자동 반영 (트리거)
  // + 임베딩 벡터 저장 (vector_memories 테이블)
  // ──────────────────────────────────────────────────────────
  async addConversation(
    conversationId: number,
    text: string,
    importance: number = 5,
  ): Promise<void> {
    if (this.unavailable) return;
    if (!this.initialized) await this.init();

    // ✅ [v2 NEW] 임베딩 벡터 저장 — 의미 검색용
    const engine = getEmbeddingEngine();
    if (engine?.isReady()) {
      try {
        const vec = await engine.embedQuery(text);
        // Float32Array → base64 직렬화
        const { float32ToBase64 } = require('../llama/EmbeddingEngine') as {
          float32ToBase64: (v: Float32Array) => string;
        };
        const vectorB64 = float32ToBase64(vec);
        const vecId = `conv_${conversationId}`;

        await dbPool.write(tx => tx.runRaw(
          `INSERT OR REPLACE INTO vector_memories (id, conversation_id, text, vector, timestamp, importance)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [vecId, conversationId, text.slice(0, 512), vectorB64, Date.now(), importance],
        ));
      } catch (e) {
        if (__DEV__) console.warn('[VectorSearch] 임베딩 저장 실패 (FTS5 검색은 정상 작동):', e);
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // ✅ [v2] 하이브리드 검색 — FTS5 + Embedding RRF
  // ──────────────────────────────────────────────────────────
  async search(
    query: string,
    topK: number = 5,
    _minScore: number = 0.5,
    options: VectorSearchOptions = {},
  ): Promise<VectorMemory[]> {
    if (this.unavailable) return [];
    if (!this.initialized && !(await this.ensureFtsReady())) return [];
    if (this.unavailable || !this.initialized) return [];
    if (!query.trim()) return [];

    try {
      // ① FTS5 키워드 검색 — 넓은 후보 추출
      const ftsResults = await this._ftsSearch(query, topK * 3, options);

      // ② 임베딩 리랭킹 시도
      const engine = getEmbeddingEngine();
      if (engine?.isReady() && ftsResults.length > 0) {
        try {
          return await this._hybridRank(query, ftsResults, topK);
        } catch (e) {
          if (__DEV__) console.warn('[VectorSearch] 임베딩 리랭킹 실패, FTS5 결과 사용:', e);
        }
      }

      // ③ FTS5 전용 경로 (폴백)
      return ftsResults.slice(0, topK);
    } catch (e) {
      if (this.isFtsUnavailable(e)) {
        this.markUnavailable(e);
        return [];
      }
      console.error('[VectorSearch] 검색 오류:', e);
      return [];
    }
  }

  // ── FTS5 검색 (기존 로직) ─────────────────────────────────────
  private async _ftsSearch(
    query: string,
    limit: number,
    options: VectorSearchOptions,
  ): Promise<VectorMemory[]> {
    const ftsQuery = this.buildFTSQuery(query);
    const filters: string[] = [];
    const params: any[] = [ftsQuery];

    if (options.storyId) {
      filters.push('c.story_id = ?');
      params.push(options.storyId);
    }
    if (options.sceneId) {
      filters.push('c.scene_id = ?');
      params.push(options.sceneId);
    }

    const whereExtra = filters.length ? ` AND ${filters.join(' AND ')}` : '';
    params.push(limit);

    const rows = await dbPool.readQueryAsync<{
      id: number; content: string; timestamp: number;
      importance_score: number; rank: number;
    }>(
      `SELECT c.id, c.content, c.timestamp, c.importance_score, bm25(conversations_fts) AS rank
       FROM conversations_fts
       JOIN conversations c ON c.id = conversations_fts.rowid
       WHERE conversations_fts MATCH ?${whereExtra}
       ORDER BY rank
       LIMIT ?`,
      params,
    );

    return rows.map(row => ({
      id: `conv_${row.id}`,
      conversationId: row.id,
      text: row.content,
      timestamp: row.timestamp,
      importance: row.importance_score ?? 5,
      score: row.rank != null ? 1 / (1 + Math.abs(row.rank)) : 0 }));
  }

  // ── 하이브리드 RRF 리랭킹 ─────────────────────────────────────
  //
  // RRF (Reciprocal Rank Fusion):
  //   score(d) = Σ 1/(k + rank_i(d))  for each ranker i
  //
  // FTS5 rank가 낮을수록(음수가 작을수록) 키워드 관련성 높음
  // 코사인 유사도가 높을수록 의미적 유사성 높음
  // → 두 기준에서 모두 상위에 있는 문서에 높은 점수 부여

  private async _hybridRank(
    query: string,
    ftsResults: VectorMemory[],
    topK: number,
  ): Promise<VectorMemory[]> {
    const engine = getEmbeddingEngine()!;

    // 쿼리 + 문서 임베딩
    const queryVec = await engine.embedQuery(query);
    const docTexts = ftsResults.map(r => r.text);
    const docVecs = await engine.embedDocumentBatch(docTexts);

    // 코사인 유사도 계산
    const cosineSims = docVecs.map(dv => _cosineSim(queryVec, dv));

    // FTS 랭킹 (이미 BM25 순서대로 정렬됨 → 인덱스 = 순위)
    // 코사인 유사도 랭킹
    const cosineRanked = cosineSims
      .map((sim, i) => ({ i, sim }))
      .sort((a, b) => b.sim - a.sim);

    const cosineRankMap = new Map<number, number>();
    cosineRanked.forEach((item, rank) => cosineRankMap.set(item.i, rank + 1));

    // RRF 점수 계산
    const rrfScores = ftsResults.map((result, ftsRank) => {
      const cosRank = cosineRankMap.get(ftsRank) ?? ftsResults.length;
      const rrfScore = 1 / (RRF_K + ftsRank + 1) + 1 / (RRF_K + cosRank);
      return { ...result, score: rrfScore };
    });

    // RRF 점수 기준 정렬
    rrfScores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    if (__DEV__) {
      console.log(`[VectorSearch] Hybrid "${query.slice(0, 20)}..." → ${rrfScores.length}개 RRF 결과`);
    }

    return rrfScores.slice(0, topK);
  }

  // ──────────────────────────────────────────────────────────
  // 중요 대화만 검색
  // ──────────────────────────────────────────────────────────
  async searchImportant(
    query: string,
    minImportance: number = 7,
    topK: number = 3,
    options: VectorSearchOptions = {},
  ): Promise<VectorMemory[]> {
    const all = await this.search(query, topK * 3, 0.5, options);
    return all.filter(m => m.importance >= minImportance).slice(0, topK);
  }

  // ──────────────────────────────────────────────────────────
  // 시간 범위 검색
  // ──────────────────────────────────────────────────────────
  async searchByTimeRange(
    query: string,
    startTime: number,
    endTime: number,
    topK: number = 5,
    options: VectorSearchOptions = {},
  ): Promise<VectorMemory[]> {
    const all = await this.search(query, topK * 3, 0.5, options);
    return all
      .filter(m => m.timestamp >= startTime && m.timestamp <= endTime)
      .slice(0, topK);
  }

  // ──────────────────────────────────────────────────────────
  // FTS5 쿼리 빌더
  // ──────────────────────────────────────────────────────────
  private buildFTSQuery(query: string): string {
    const escaped = query.replace(/["*^()[\]{}\\:;\-!|&<>]/g, ' ');
    const words = escaped
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => `"${w}"*`)
      .join(' OR ');
    return words || '"_noresult_"*';
  }

  // ──────────────────────────────────────────────────────────
  // 통계
  // ──────────────────────────────────────────────────────────
  clear(): void {
    if (__DEV__) console.log('[VectorSearch] FTS5 모드: clear()는 불필요 (DB 영구 저장)');
  }

  async getStats() {
    if (this.unavailable || this.initializing || !this.initialized) {
      return { totalMemories: 0, mode: 'FTS5-disabled', hybridEnabled: false };
    }
    try {
      const row = await dbPool.readQueryAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM conversations_fts`,
        [],
      );
      const vecRow = await dbPool.readQueryAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM vector_memories`,
        [],
      ).catch(() => [{ cnt: 0 }]);

      const engine = getEmbeddingEngine();
      return {
        totalMemories: row[0]?.cnt ?? 0,
        vectorMemories: vecRow[0]?.cnt ?? 0,
        mode: 'FTS5+Embedding',
        hybridEnabled: !!engine?.isReady(),
        embeddingBackend: engine?.isReady() ? 'active' : 'inactive' };
    } catch (error) {
      if (this.isFtsUnavailable(error)) {
        this.markUnavailable(error);
        return { totalMemories: 0, mode: 'FTS5-disabled', hybridEnabled: false };
      }
      return { totalMemories: 0, mode: 'FTS5', hybridEnabled: false };
    }
  }
}

// ── 코사인 유사도 (인라인 — 외부 import 방지) ────────────────────

function _cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot; // L2-normalized 전제
}

// ── 싱글톤 ───────────────────────────────────────────────────────

let _vectorSearchInstance: VectorSearch | null = null;
function getVectorSearchInstance(): VectorSearch {
  if (!_vectorSearchInstance) _vectorSearchInstance = new VectorSearch();
  return _vectorSearchInstance;
}
export const vectorSearch = new Proxy({} as VectorSearch, {
  get(_t, p) { return (getVectorSearchInstance() as unknown as Record<string|symbol, unknown>)[p as string]; },
  set(_t, p, v) { (getVectorSearchInstance() as unknown as Record<string|symbol, unknown>)[p as string] = v; return true; } });
