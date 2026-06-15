/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/utils/math/contextBudget.ts
 * 컨텍스트 예산 할당
 */

export interface ContextBudget {
  systemTokens: number;
  longTermTokens: number;
  midTermTokens: number;
  shortTermTokens: number;
}

/**
 * nCtx를 비율 기반으로 각 메모리 레이어에 배분
 * 
 * 기본 비율:
 *   system   20%  — 페르소나·규칙 (불변)
 *   longTerm 15%  — 전체 요약 (압축 허용)
 *   midTerm  25%  — 중요 기억 (BM25/벡터 선택)
 *   shortTerm 40% — 최근 대화 (최소 보장)
 */
export function allocateContextBudget(
  nCtx: number,
  options: { systemRatio?: number; shortTermMinTurns?: number } = {},
): ContextBudget {
  const { systemRatio = 0.20, shortTermMinTurns = 8 } = options;

  // 10% 안전 마진: KV 오버헤드 + 생성 토큰 예약 공간
  const usable = Math.floor(nCtx * 0.90);

  // shortTerm 최소 보장: 턴당 평균 150토큰 × 최소 보장 턴 수
  const shortTermMin = shortTermMinTurns * 150;

  const system = Math.floor(usable * systemRatio);
  const longTerm = Math.floor(usable * 0.15);
  const midTerm = Math.floor(usable * 0.25);
  // [BUG FIX] shortTermMin이 나머지보다 크면 전체 합이 usable 초과 → 컨텍스트 오버플로우
  // 수정: shortTermMin 적용 시 다른 섹션을 비례 축소해 총합이 usable을 넘지 않도록 보장
  const remainder = usable - system - longTerm - midTerm;
  let shortTerm: number;
  let adjustedLongTerm = longTerm;
  let adjustedMidTerm = midTerm;
  if (remainder < shortTermMin) {
    shortTerm = shortTermMin;
    // 초과분을 longTerm/midTerm에서 비례 차감
    const overflow = shortTermMin - remainder;
    const flexTotal = longTerm + midTerm;
    if (flexTotal > 0) {
      adjustedLongTerm = Math.max(0, longTerm - Math.round(overflow * (longTerm / flexTotal)));
      // [BUG FIX] usable - system - adjustedLongTerm - shortTerm 이 음수가 될 수 있음
      // shortTermMin이 너무 크면 longTerm+midTerm 예산을 모두 잠식 → Math.max(0, ...) 보장
      adjustedMidTerm = Math.max(0, usable - system - adjustedLongTerm - shortTerm);
    } else {
      // flexTotal=0: longTerm+midTerm 예산이 없으면 system만 보장하고 나머지는 shortTerm
      adjustedLongTerm = 0;
      adjustedMidTerm  = 0;
    }
  } else {
    shortTerm = remainder;
  }

  return {
    systemTokens: system,
    longTermTokens: adjustedLongTerm,
    midTermTokens: adjustedMidTerm,
    shortTermTokens: shortTerm };
}
