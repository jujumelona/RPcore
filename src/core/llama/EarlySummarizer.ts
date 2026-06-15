/**
 * @deprecated
 * 구 AI 선제 요약 방식 제거됨 (EarlySummarizer).
 * 현재는 ChapterLogTracker의 [L:][ID:][Ev:] 누적 로그 방식 사용.
 * 호출 측 하위 호환용 빈 stub.
 */
export interface ChapterSummaryResult {
  raw:    string;
  events: Array<{ event: string; who: string; result: string }>;
  inputCount: number;
  filteredCount: number;
  outputTokensEstimate: number;
}

class EarlySummarizer {
  kickoff(): void {}
  async consume(): Promise<null> { return null; }
  reset(): void {}
  get hasPendingJob(): boolean { return false; }
}

export const earlySummarizer = new EarlySummarizer();
export default earlySummarizer;
