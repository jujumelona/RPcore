/**
 * src/utils/math/temporalDecay.ts
 * 시간 감쇠 및 중요도 계산
 */

/**
 * 시간 감쇠 적용 중요도 계산
 * 
 * 수식: importance = baseScore · e^(-λ · ageDays)
 *   λ = 0.05 -> 14일 후 50% 감쇠 (기억이 서서히 희미해지는 느낌)
 *   λ = 0.10 -> 7일 후 50% 감쇠
 * 
 * ✅ [FIX] Math.max(0, ...) — 미래 timestamp 방어
 */
export function temporalDecayScore(
  baseScore: number,
  timestampMs: number,
  lambda = 0.05,
): number {
  const ageDays = Math.max(0, (Date.now() - timestampMs) / (1000 * 60 * 60 * 24));
  return baseScore * Math.exp(-lambda * ageDays);
}

/**
 * 여러 기억을 시간 감쇠 + 중요도로 정렬하여 topK 반환
 */
export function rankByDecayedImportance<T extends { importance: number; timestamp: number }>(
  items: T[],
  topK: number,
  lambda = 0.05,
): T[] {
  return items
    .map(item => ({
      item,
      score: temporalDecayScore(item.importance / 10, item.timestamp, lambda) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(x => x.item);
}
