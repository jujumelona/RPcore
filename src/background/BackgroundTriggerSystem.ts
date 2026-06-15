// src/background/BackgroundTriggerSystem.ts
// ══════════════════════════════════════════════════════════════
// 채팅 메시지 내용 + 감정 상태에 따라 배경 이미지를 자동 전환하는 트리거 시스템
//
// 사용 흐름:
//   1. useBackgroundManager(backgrounds) 훅이 인스턴스를 생성
//   2. 각 AI 응답 후 checkBackgroundTrigger(message, emotions?) 호출
//   3. shouldTrigger()가 키워드·감정 패턴을 분석 → 전환 대상 ID 반환
//   4. 컴포넌트 언마운트 시 destroy() 호출 → 내부 타이머·리스너 해제
//
// 감정 매칭 로직 (고도화):
//   - 키워드 단순 includes() → BM25 스타일 점수 기반 매칭으로 업그레이드
//   - emotion 태그 매칭: emotionStore의 e1~e5 값과 배경의 emotion 문자열 연결
//   - 감정 강도 임계값: dominantEmotion prob ≥ 0.55 → 감정 트리거 활성
//   - 복합 점수: keyword_score * 0.6 + emotion_score * 0.4
//   - entropy가 높을 때(혼란 상태): 현재 배경 유지 (안정성)
// ══════════════════════════════════════════════════════════════

export interface BackgroundConfig {
  /** 배경 고유 식별자 */
  id: string;
  /** 이미지 URL 또는 require() 경로 */
  imageUrl: string;
  /** 이 배경이 활성화되는 키워드 목록 (소문자 매칭) */
  keywords?: string[];
  /** 감정 태그 (e.g. 'dark', 'warm', 'action', 'romantic', 'tense', 'calm') */
  emotion?: string;
  /**
   * 감정 매핑:
   *   e1 = Valence  (positive/negative)
   *   e2 = Trust    (trust/distrust)
   *   e3 = Dominance(dominant/submissive)
   *   e4 = Arousal  (excited/calm)
   *   e5 = Attachment(bonded/distant)
   *
   * emotionConditions가 있으면 해당 감정값이 threshold를 넘을 때 트리거
   */
  emotionConditions?: {
    e1?: { min?: number; max?: number }; // Valence:  -100 ~ 100
    e2?: { min?: number; max?: number }; // Trust
    e3?: { min?: number; max?: number }; // Dominance
    e4?: { min?: number; max?: number }; // Arousal
    e5?: { min?: number; max?: number }; // Attachment
  };
}

// ── 감정 상태 타입 (emotionStore와 동일 구조) ─────────────────────
export interface EmotionState {
  e1: number; // Valence    (-100 ~ 100)
  e2: number; // Trust
  e3: number; // Dominance
  e4: number; // Arousal
  e5: number; // Attachment
}

// ── 내부 타입 ────────────────────────────────────────────────────

interface TriggerRule {
  backgroundId:      string;
  keywords:          string[];
  emotion?:          string;
  emotionConditions?: BackgroundConfig['emotionConditions'];
  /**
   * keyword_score 가중치 (0~1).
   * emotionConditions가 있는 배경은 emotion 비중을 높임.
   */
  keywordWeight: number;
  emotionWeight: number;
}

// 감정 태그 → e1~e5 임계값 사전 매핑
// emotion 문자열 태그를 숫자 조건으로 변환하는 기본값 테이블
const EMOTION_TAG_MAP: Record<string, BackgroundConfig['emotionConditions']> = {
  dark:       { e1: { max: -30 } },                            // 부정 감정 우세
  warm:       { e1: { min: 30 }, e2: { min: 20 } },           // 긍정 + 신뢰
  romantic:   { e1: { min: 20 }, e5: { min: 30 } },           // 긍정 + 애착
  action:     { e4: { min: 40 } },                             // 각성 높음
  tense:      { e4: { min: 30 }, e1: { max: 0 } },            // 각성 높음 + 부정
  calm:       { e4: { max: -20 } },                            // 낮은 각성
  dominant:   { e3: { min: 40 } },                             // 지배적
  submissive: { e3: { max: -30 } },                            // 복종적
  trust:      { e2: { min: 40 } },                             // 높은 신뢰
  distrust:   { e2: { max: -30 } },                            // 낮은 신뢰
  bonded:     { e5: { min: 50 } },                             // 강한 유대
  distant:    { e5: { max: -30 } },                            // 거리감
};

// ── BackgroundTriggerSystem ──────────────────────────────────────

export class BackgroundTriggerSystem {
  private _currentBackgroundId: string | null = null;
  private _rules:                TriggerRule[] = [];
  private _cooldownTimer:        ReturnType<typeof setTimeout> | null = null;
  private _destroyed             = false;
  private _lastBackgroundsRef:   BackgroundConfig[] | null = null;

  /** 쿨다운 — 너무 빠른 배경 전환 방지 (ms) */
  private static readonly COOLDOWN_MS = 3_000;

  /**
   * 엔트로피 임계값 — 이 이상이면 감정이 혼란스러운 상태
   * → 감정 트리거 비활성화 (안정성 우선)
   */
  private static readonly ENTROPY_STABLE_THRESHOLD = 1.5;

  /**
   * 감정 트리거 최소 확률 — dominantEmotion prob가 이 이상일 때만 감정 트리거 활성
   */
  private static readonly EMOTION_PROB_THRESHOLD = 0.52;

  // ── 배경 전환 판단 ────────────────────────────────────────────

  /**
   * 메시지 내용 + 감정 상태를 분석해 전환해야 할 배경 ID를 반환.
   * 쿨다운 중이거나 이미 같은 배경이면 null.
   *
   * @param message    AI 응답 메시지 텍스트
   * @param backgrounds 배경 설정 배열
   * @param emotions    현재 캐릭터 감정 상태 (optional)
   */
  shouldTrigger(
    message:     string,
    backgrounds: BackgroundConfig[],
    emotions?:   EmotionState,
  ): string | null {
    if (this._destroyed)            return null;
    if (this._cooldownTimer !== null) return null; // 쿨다운 중

    this._syncRules(backgrounds);
    if (this._rules.length === 0)   return null;

    const lower = message.toLowerCase();

    // 감정 분석 (optional)
    let emotionAnalysis: { dominantKey: keyof EmotionState; entropy: number } | null = null;
    if (emotions) {
      emotionAnalysis = this._analyzeEmotion(emotions);
    }

    // 각 룰에 대해 복합 점수 계산
    let bestId:    string | null = null;
    let bestScore  = 0.0;
    const MIN_TRIGGER_SCORE = 0.25; // 이 점수 미만이면 트리거 안 함

    for (const rule of this._rules) {
      if (rule.backgroundId === this._currentBackgroundId) continue;

      const kwScore     = this._keywordScore(lower, rule.keywords);
      const emotScore   = this._emotionScore(rule, emotions, emotionAnalysis);
      const totalScore  = kwScore * rule.keywordWeight + emotScore * rule.emotionWeight;

      if (totalScore > bestScore && totalScore >= MIN_TRIGGER_SCORE) {
        bestScore = totalScore;
        bestId    = rule.backgroundId;
      }
    }

    if (bestId) {
      this._startCooldown();
      return bestId;
    }

    return null;
  }

  /**
   * 현재 활성 배경 ID 업데이트.
   */
  setBackground(id: string): void {
    if (this._destroyed) return;
    this._currentBackgroundId = id;
  }

  getCurrentBackground(): string | null {
    return this._currentBackgroundId;
  }

  // ── 리소스 정리 ───────────────────────────────────────────────

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._cooldownTimer !== null) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }

    this._rules                = [];
    this._currentBackgroundId = null;
    this._lastBackgroundsRef  = null;
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────

  private _syncRules(backgrounds: BackgroundConfig[]): void {
    // 동일 배열 레퍼런스면 재빌드 불필요
    if (this._lastBackgroundsRef === backgrounds) return;

    // 내용이 동일한 경우에도 참조만 갱신
    if (
      this._lastBackgroundsRef !== null &&
      this._lastBackgroundsRef.length === backgrounds.length &&
      this._lastBackgroundsRef.every((bg, i) => bg.id === backgrounds[i]?.id)
    ) {
      this._lastBackgroundsRef = backgrounds;
      return;
    }

    this._lastBackgroundsRef = backgrounds;
    this._rules = (backgrounds.map(bg => {
      const hasKeywords = bg.keywords && bg.keywords.length > 0;
      const hasEmotion  = !!bg.emotion || !!bg.emotionConditions;

      // 키워드와 감정이 모두 있으면 가중치 분배
      // 키워드만 있으면 100% 키워드
      // 감정만 있으면 100% 감정
      let keywordWeight: number;
      let emotionWeight: number;
      if (hasKeywords && hasEmotion) {
        keywordWeight = 0.6;
        emotionWeight = 0.4;
      } else if (hasKeywords) {
        keywordWeight = 1.0;
        emotionWeight = 0.0;
      } else if (hasEmotion) {
        keywordWeight = 0.0;
        emotionWeight = 1.0;
      } else {
        // 키워드도 감정도 없는 배경은 룰에서 제외
        return null;
      }

      // emotionConditions 해결: bg.emotionConditions > emotion 태그 매핑 > 없음
      const resolvedConditions =
        bg.emotionConditions ??
        (bg.emotion && EMOTION_TAG_MAP[bg.emotion] ? EMOTION_TAG_MAP[bg.emotion] : undefined);

      return {
        backgroundId:      bg.id,
        keywords:          (bg.keywords ?? []).map(k => k.toLowerCase()),
        emotion:           bg.emotion,
        emotionConditions: resolvedConditions,
        keywordWeight,
        emotionWeight };
    }) as (TriggerRule | null)[]).filter((r): r is TriggerRule => r !== null) as TriggerRule[];
  }

  /**
   * 키워드 BM25-style 점수 (0~1).
   * 단순 includes() → 매칭 키워드 수 / 전체 키워드 수 × 길이 보정.
   */
  private _keywordScore(lowerMessage: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    let matchCount  = 0;
    let totalWeight = 0;
    for (const kw of keywords) {
      if (!kw) continue;
      const weight = 1 / Math.sqrt(kw.length); // 짧은 키워드에 낮은 가중치 (노이즈 감소)
      totalWeight += weight;
      if (lowerMessage.includes(kw)) {
        // 메시지에 여러 번 등장할수록 가중치 (포화 함수)
        const count = this._countOccurrences(lowerMessage, kw);
        matchCount += weight * (1 + Math.log1p(count - 1) * 0.5);
      }
    }
    if (totalWeight === 0) return 0;
    return Math.min(1, matchCount / totalWeight);
  }

  /**
   * 감정 매칭 점수 (0~1).
   * emotionConditions에 정의된 e1~e5 범위 조건을 몇 % 충족하는지 계산.
   *
   * 엔트로피가 높으면 (ENTROPY_STABLE_THRESHOLD 이상) 감정 불안정 → 점수 패널티 적용.
   */
  private _emotionScore(
    rule:           TriggerRule,
    emotions?:      EmotionState,
    analysis?:      { dominantKey: keyof EmotionState; entropy: number } | null,
  ): number {
    if (!emotions || !rule.emotionConditions) return 0;

    const conds     = rule.emotionConditions;
    const keys: Array<keyof EmotionState> = ['e1', 'e2', 'e3', 'e4', 'e5'];
    const activeConds = keys.filter(k => conds[k] !== undefined);
    if (activeConds.length === 0) return 0;

    // 엔트로피 패널티: 혼란 상태에서는 감정 트리거 약화
    let entropyPenalty = 1.0;
    if (analysis && analysis.entropy >= BackgroundTriggerSystem.ENTROPY_STABLE_THRESHOLD) {
      entropyPenalty = 0.3; // 혼란 상태에서는 30%만
    }

    let satisfied = 0;
    for (const k of activeConds) {
      const val  = emotions[k];
      const cond = conds[k]!;
      const minOk = cond.min === undefined || val >= cond.min;
      const maxOk = cond.max === undefined || val <= cond.max;
      if (minOk && maxOk) satisfied++;
    }

    const baseScore = satisfied / activeConds.length;
    return baseScore * entropyPenalty;
  }

  /**
   * 현재 감정 분포 분석.
   * softmax 없이 단순 절댓값 비교 (낮은 CPU 비용).
   */
  private _analyzeEmotion(
    emotions: EmotionState,
  ): { dominantKey: keyof EmotionState; entropy: number } {
    const keys: Array<keyof EmotionState> = ['e1', 'e2', 'e3', 'e4', 'e5'];

    // 가장 절댓값이 큰 감정 축 = dominant
    let dominantKey: keyof EmotionState = 'e1';
    let dominantAbs = 0;
    for (const k of keys) {
      if (Math.abs(emotions[k]) > dominantAbs) {
        dominantAbs = Math.abs(emotions[k]);
        dominantKey = k;
      }
    }

    // 간이 entropy: 각 값의 절댓값을 정규화하여 Shannon entropy 근사
    const absVals = keys.map(k => Math.abs(emotions[k]) + 1); // +1 = 0값 방지
    const sum     = absVals.reduce((a, b) => a + b, 0);
    const probs   = absVals.map(v => v / sum);
    let H = 0;
    for (const p of probs) {
      if (p > 0) H -= p * Math.log2(p);
    }

    return { dominantKey, entropy: H };
  }

  private _countOccurrences(text: string, substr: string): number {
    let count = 0;
    let pos   = 0;
    while ((pos = text.indexOf(substr, pos)) !== -1) {
      count++;
      pos += substr.length;
    }
    return count;
  }

  private _startCooldown(): void {
    if (this._cooldownTimer !== null) clearTimeout(this._cooldownTimer);
    this._cooldownTimer = setTimeout(() => {
      this._cooldownTimer = null;
    }, BackgroundTriggerSystem.COOLDOWN_MS);
  }
}
