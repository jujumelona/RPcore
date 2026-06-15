// src/BM25Index/BM25Index.ts
// ════════════════════════════════════════════════════════════════════
//
//  BM25 (Best Match 25) — Probabilistic Relevance Retrieval
//
//  역할: 키워드 기반 텍스트 검색 (MemoryManager RAG 파이프라인의 절반)
//  파트너: EmbeddingEngine (벡터 의미 검색) + rrfFuse (두 신호 결합)
//
//  수식: Σ IDF(t) · (tf·(k1+1)) / (tf + k1·(1 - b + b·|d|/avgdl))
//  논문: Robertson & Zaragoza (2009)
//
//  MathUtils.ts에서 분리 이유:
//    - BM25는 수학 공식이 아닌 검색 인프라 — 역할 분리 명확화
//    - search/ 모듈에 두면 EmbeddingEngine, VectorSearch와 같은 레이어에서 관리
//    - MathUtils는 순수 수식(MMR, EMA, KV 크기 등)만 유지
//
//  하위 호환: MathUtils.ts는 `export { BM25Index } from '../core/search/BM25Index'`
//            를 유지하므로 기존 import 경로 변경 불필요
//
// ════════════════════════════════════════════════════════════════════

import { InteractionManager } from 'react-native';

// ── 내부 헬퍼 ────────────────────────────────────────────────────

/**
 * 텍스트 → 토큰 배열 변환.
 *
 * [OPT] replace pass 제거 — split 정규식에 구두점 범위 통합
 * 기존: toLowerCase → replace → split → filter (3회 순회)
 * 수정: toLowerCase → split(통합 패턴) → filter (2회 순회)
 * ※ \W는 한글을 구분자로 처리하므로 ASCII 구두점 범위 명시
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]+/)
    .filter(t => {
      if (t.length === 0) return false;
      // [BUG FIX D] 기존 t.length > 1 필터는 단음절 한국어(화, 죽, 날 등)를 전부 제거함.
      // 한국어는 단음절 형태소가 의미 있는 경우가 많음 (분노=화, 죽다=죽 등).
      // 수정: ASCII 범위(0x00~0x7F) 단음절만 제거, 그 외(한글 등) 단음절은 허용.
      if (t.length === 1) {
        const code = t.charCodeAt(0);
        return code > 0x7F;  // 비ASCII(한글/일어/중문 등) 단음절은 허용
      }
      return true;
    });
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

// ── BM25Doc (내부 표현) ───────────────────────────────────────────

interface BM25Doc {
  tokens:     string[];
  length:     number;
  /** [OPT] tf Map: 생성자에서 1회 계산, score()는 읽기만 수행 */
  tf:         Map<string, number>;
  /**
   * normFactor = k1 * (1 - b + b * docLen / avgdl)
   * 쿼리와 무관한 문서 고정값 → 생성자에서 1회 계산.
   */
  normFactor: number;
}

// ── BM25Index ─────────────────────────────────────────────────────

/**
 * BM25 검색 인덱스.
 *
 * 용도:
 *   - MemoryManager.getMemoryContext() — BM25 + 벡터 검색 → RRF 결합
 *   - auxiliary keyword matching (exact match → probabilistic relevance)
 *
 * 파라미터:
 *   k1 = 1.5  (용어 빈도 포화 계수 — 표준값)
 *   b  = 0.5  (문서 길이 정규화 계수)
 *             b=0.75는 긴 논문에 최적. RP 대사(평균 15~40토큰)는 짧아
 *             b=0.5로 줄여야 짧은 핵심 대사 매칭 정확도 향상.
 *
 * @example
 *   const idx = new BM25Index(pool.map(c => c.content));
 *   const top = idx.topK('질투하는 감정', 5);
 *   // top[0] = { index: N, score: 3.14 }
 */
export class BM25Index {
  private docs: BM25Doc[];
  private idf:  Map<string, number>;
  private readonly k1 = 1.5;
  private readonly b  = 0.5;

  constructor(texts: string[]) {
    const rawDocs = texts.map(t => {
      const tokens = tokenize(t);
      return { tokens, length: tokens.length };
    });

    const totalLen = rawDocs.reduce((s, d) => s + d.length, 0);
    const avgdl    = rawDocs.length > 0 ? totalLen / rawDocs.length : 1;

    // [OPT] normFactor + tf를 생성자에서 1회 계산
    // → score() 호출마다 Map 생성 0회, normFactor 재계산 0회
    this.docs = rawDocs.map(d => ({
      ...d,
      tf:         termFreq(d.tokens),
      normFactor: this.k1 * (1 - this.b + this.b * d.length / avgdl) }));

    // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    this.idf = new Map();
    const N  = this.docs.length;
    const df = new Map<string, number>();

    for (const doc of this.docs) {
      const uniq = new Set(doc.tokens);
      for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
    }
    for (const [term, freq] of df) {
      this.idf.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1));
    }
  }

  /**
   * 각 문서에 대한 BM25 점수 배열 반환.
   * [OPT] 사전 계산된 tf / normFactor 덕분에 Map 생성 0회.
   */
  score(query: string): number[] {
    const qTokens = tokenize(query);
    return this.docs.map(doc => {
      let s = 0;
      for (const qt of qTokens) {
        // exact match 먼저 시도
        const idf = this.idf.get(qt) ?? 0;
        if (idf > 0) {
          const f   = doc.tf.get(qt) ?? 0;
          const num = f * (this.k1 + 1);
          const den = f + doc.normFactor;
          s += idf * (num / den);
        } else {
          // [BUG FIX D] prefix match: '화' 쿼리가 '화가' 토큰에 매칭되도록
          // 단음절 한국어 쿼리가 복합 토큰의 접두사인 경우 부분 점수 부여
          if (qt.length >= 1) {
            for (const [docToken, freq] of doc.tf) {
              if (docToken.startsWith(qt) && docToken !== qt) {
                const partialIdf = this.idf.get(docToken) ?? 0;
                if (partialIdf > 0) {
                  const f   = freq;
                  const num = f * (this.k1 + 1);
                  const den = f + doc.normFactor;
                  // prefix match는 exact match보다 낮은 가중치 (0.5)
                  s += partialIdf * (num / den) * 0.5;
                }
              }
            }
          }
        }
      }
      return s;
    });
  }

  /**
   * 상위 k개 인덱스와 점수 반환.
   *
   * [BUG FIX] 기존 insertion top-k 구현의 heap invariant 버그 수정
   * 문제: top.length < k 단계에서 push 후 삽입 정렬 시 비교 방향이 역방향이 되어
   *       새 원소가 마지막에 들어오면 정렬 순서가 깨짐 → 검색 결과 순위 오염
   * 수정: Array.sort() 사용. n≤200인 RP 환경에서 성능 차이 무시 가능,
   *       정확성이 우선.
   */
  topK(query: string, k: number): Array<{ index: number; score: number }> {
    const allScores = this.score(query);
    return allScores
      .map((score, index) => ({ index, score }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * [FIX] 문서 수가 많을 때 메인 스레드 블로킹을 막는 비동기 버전.
   *
   * MemoryManager.getMemoryContext() 같은 RAG 파이프라인에서 호출 시
   * 문서 수가 200개 이상이면 InteractionManager를 통해 인터랙션 이후 실행.
   * 소규모(≤200)에서는 동기 topK와 동일하게 즉시 반환.
   */
  topKAsync(query: string, k: number): Promise<Array<{ index: number; score: number }>> {
    // [BUG FIX] 임계값을 200→50으로 낮춤
    // 기존: ≤200 문서를 동기 실행 → 50~200개 문서에서도 JS 스레드 잠깐 블로킹
    // RP 대화 컨텍스트는 실시간 응답이 중요하므로 50개 이상이면 인터랙션 이후 실행
    try {
      if (this.docs.length <= 50) {
        return Promise.resolve(this.topK(query, k));
      }
      // 대규모: InteractionManager.runAfterInteractions로 JS 인터랙션 큐 이후 실행
      return new Promise((resolve, reject) => {
        InteractionManager.runAfterInteractions(() => {
          try {
            resolve(this.topK(query, k));
          } catch (e) {
            reject(e);
          }
        });
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }
}
