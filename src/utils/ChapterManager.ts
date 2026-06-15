// src/utils/ChapterManager.ts  v2
//
// ── ChapterManager ────────────────────────────────────────────────
// 챕터 전환 조건 감지 및 단일 챕터 Rolling KV 트리거 관리.
//
// 지원하는 트리거 타입 (StoryContract.EditorTrigger):
//   • 'conversation' — turnCount >= convCount 달성 시
//   • 'emotion'      — 특정 캐릭터 감정값이 기준치 이상/이하/도달 시
//   • 'cache'        — (레거시) 잔여 컨텍스트 토큰이 threshold 미만 시
//                      신규 스토리는 AI-driven CHOICE_POINT 방식 사용
//
// v2 추가:
//   · KV 비율 추적 (updateKVRatio)
//   · shouldHintChoicePoint() — 75% 이상 -> 프롬프트 힌트
//   · shouldForceRolling()    — 92% 이상 -> 강제 롤링
// ─────────────────────────────────────────────────────────────────

import type { EditorTrigger, EditorEmotions } from '../types/StoryContract';

export interface ChapterStatus {
  chapter:          number;
  rolling:          boolean;
  isNearTransition: boolean;
}

export interface ChapterTransitionState {
  isTransitioning: boolean;
  chapterIndex:    number;
  title?:          string;
}

// KV 비율 기준값
const KV_HINT_RATIO  = 0.75; // 이 비율 이상이면 AI 프롬프트에 마무리 힌트
const KV_FORCE_RATIO = 0.92; // 이 비율 이상이면 CHOICE_POINT 없어도 강제 롤링

// ── 트리거 평가 ────────────────────────────────────────────────
function evaluateTriggers(
  triggers:        EditorTrigger[],
  turnCount:       number,
  emotions:        Record<number, EditorEmotions>,
  remainingTokens: number,
  cacheThreshold:  number,
): boolean {
  return triggers.some(t => {
    switch (t.type) {
      case 'conversation':
        return turnCount >= (t.convCount ?? 9999);

      case 'cache':
        // 레거시 호환: 여전히 동작하되 신규 스토리에선 사용 안 함
        return remainingTokens < cacheThreshold;

      case 'emotion': {
        if (t.emotionChar == null || !t.emotionCode) return false;
        const emo = emotions[t.emotionChar];
        if (!emo) return false;
        const val    = emo[t.emotionCode as keyof EditorEmotions] ?? 0;
        const target = t.emotionValue ?? 0;
        if (t.emotionDir === 'above') return val >= target;
        if (t.emotionDir === 'below') return val <= target;
        // [BUG FIX] 'reach' exact match -> ±2 근사 범위 (momentum decay로 정수 건너뜀)
        if (t.emotionDir === 'reach') return Math.abs(val - target) <= 2;
        return false;
      }

      default:
        return false;
    }
  });
}

export class ChapterManager {
  private _chapter:          number = 0;
  private _rolling:          boolean = false;
  private _isNearTransition: boolean = false;
  private _triggers:         EditorTrigger[] = [];
  private _cacheThreshold:   number = 5000;
  private _warnCallback:     (() => void) | null = null;

  // ── v2: KV 비율 추적 ─────────────────────────────────────────
  private _kvRatio: number = 0;

  /**
   * 매 생성 완료 후 호출. KV 채움 비율 갱신.
   * @param ratio  0.0 ~ 1.0  (usedTokens / nCtx)
   */
  updateKVRatio(ratio: number): void {
    const prev = this._kvRatio;
    this._kvRatio = Math.max(0, Math.min(1, ratio));
    // [BUG FIX #19] KV 비율이 강제 롤링 임계값을 처음 넘을 때 _warnCallback 발화
    // [BUG-63 FIX] resetRolling() 후 _kvRatio=0이 되는데 이후 generateKVRatio 재증가 시
    // prev < KV_FORCE_RATIO && _kvRatio >= KV_FORCE_RATIO를 다시 만족해 콜백 재발화.
    // rolling KV가 완료됐음에도 다음 턴에 _warnCallback이 재발화되는 문제 방지.
    // 수정: _rolling이 이미 true인 경우에는 콜백 중복 발화 방지
    if (prev < KV_FORCE_RATIO && this._kvRatio >= KV_FORCE_RATIO && !this._rolling) {
      this._rolling = true;
      this._isNearTransition = true;
      this._warnCallback?.();
    }
  }

  /**
   * 현재 KV가 75% 이상이면 true.
   * -> AI 프롬프트에 "자연스럽게 마무리하고 [CHOICE_POINT] 추가" 힌트 주입.
   */
  shouldHintChoicePoint(): boolean {
    return this._kvRatio >= KV_HINT_RATIO && this._kvRatio < KV_FORCE_RATIO;
  }

  /**
   * 현재 KV가 92% 이상이면 true.
   * -> CHOICE_POINT 없어도 즉시 Rolling KV 강제 실행.
   */
  shouldForceRolling(): boolean {
    return this._kvRatio >= KV_FORCE_RATIO;
  }

  /** 현재 KV 비율 (0~1) */
  getKVRatio(): number {
    return this._kvRatio;
  }

  // ── 챕터 트리거 설정 ─────────────────────────────────────────
  setTriggers(triggers: EditorTrigger[], cacheThreshold = 5000): void {
    this._triggers        = triggers ?? [];
    this._cacheThreshold  = cacheThreshold;
    this._isNearTransition = false;
  }

  // ── 매 턴 상태 업데이트 ──────────────────────────────────────
  update(
    turnCount:       number,
    emotions:        Record<number, EditorEmotions>,
    remainingTokens: number,
  ): void {
    if (!this._triggers.length) return;

    const wasNear = this._isNearTransition;
    this._isNearTransition = evaluateTriggers(
      this._triggers, turnCount, emotions, remainingTokens, this._cacheThreshold,
    );

    if (!wasNear && this._isNearTransition && !this._rolling) {
      this._rolling = true;
      this._warnCallback?.();
    }
  }

  // ── 상태 조회 ────────────────────────────────────────────────
  getStatus(): ChapterStatus {
    return {
      chapter:          this._chapter,
      rolling:          this._rolling,
      isNearTransition: this._isNearTransition };
  }

  resetRolling(): void {
    this._rolling          = false;
    this._isNearTransition = false;
    // [BUG FIX] _kvRatio를 0으로 초기화하지 않음
    // 롤링 KV 완료 직후 _kvRatio=0이 되면 shouldForceRolling()이 false를 반환하다가
    // 다음 updateKVRatio 호출에서 실제 비율이 다시 threshold를 넘으면 _warnCallback 재발화.
    // 실제 KV 비율은 llamaEngine이 알고 있으므로 updateKVRatio가 호출될 때까지 이전 값 유지.
    // _rolling=false 리셋만으로 콜백 중복 발화 방지 (updateKVRatio의 !this._rolling 가드)
  }

  onWarn(cb: (() => void) | null): void {
    this._warnCallback = cb;
  }

  // [수정] 비동기 지연 실행 — 기존 즉시 동기 실행은 무거운 작업 시 UI 멈춤 유발
  // requestIdleCallback 없는 환경(RN Hermes)에서는 setTimeout(fn, 0) 사용
  idleWork(fn: () => void): void {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fn);
    } else {
      setTimeout(fn, 0);
    }
  }

  nextChapter(): number {
    this._chapter += 1;
    this._isNearTransition = false;
    this._kvRatio          = 0;
    return this._chapter;
  }
}

export class ChapterTransitionManager {
  private state: ChapterTransitionState = {
    isTransitioning: false,
    chapterIndex: 0 };

  start(chapterIndex: number, title?: string): void {
    this.state = { isTransitioning: true, chapterIndex, title };
  }

  complete(): void {
    this.state = { ...this.state, isTransitioning: false };
  }

  getState(): ChapterTransitionState {
    return this.state;
  }
}
