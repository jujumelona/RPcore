/**
 * src/utils/math/rrf.ts
 * Reciprocal Rank Fusion 및 최적 스레드 계산
 */

/**
 * 여러 랭킹 리스트를 RRF 공식으로 단일 점수 맵으로 융합
 * 
 * 수식: score(d) = Σ 1 / (k + rank_i(d))
 *   k = 60 (표준값, 하위 랭크의 영향 완화)
 * 
 * 논문: Cormack et al., SIGIR 2009
 */
export function rrfFuse(
  rankLists: Array<Array<{ id: string; score: number }>>,
  k = 60,
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of rankLists) {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    sorted.forEach((item, rank) => {
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
}

/**
 * Amdahl's Law 기반 최적 스레드 수 계산
 * 
 * 수식: S(n) = 1 / ((1-p) + p/n)
 *   p = 병렬화 가능 비율 (LLM decode ≈ 0.75, prefill ≈ 0.90)
 *   n = 스레드 수
 */
export function optimalThreads(
  physicalCores: number,
  parallelFrac = 0.75,
  maxThreads = 8,
): number {
  let best = 1;
  let bestSpeedup = 1;
  for (let n = 1; n <= Math.min(physicalCores, maxThreads); n++) {
    const speedup = 1 / ((1 - parallelFrac) + parallelFrac / n);
    const marginal = speedup - bestSpeedup;
    if (marginal < 0.05 && n > 1) break;
    best = n;
    bestSpeedup = speedup;
  }
  return best;
}
