// src/core/streaming/SmoothTokenBuffer.ts
// ══════════════════════════════════════════════════════════════
// 온디바이스 느린/불규칙 생성 -> 부드러운 렌더 분리
//
// ─ 핵심 아이디어 ───────────────────────────────────────────────
// 학술 연구(TokenFlow, Eloquent, Google Bard 내부 구현)에서 확인된
// "클라이언트 사이드 토큰 버퍼" 기법을 온디바이스에 맞게 구현.
//
// ─ 문제 ────────────────────────────────────────────────────────
// 온디바이스 LLM 생성 속도:
//   · TTFT: 1~3초 (프리필 단계)
//   · TBT:  50~150ms/토큰 -> 열 스로틀링 시 더 불규칙
//   -> 직접 렌더하면: 뚝뚝 끊기는 텍스트, 갑자기 몇 글자씩 폭발적 등장
//
// ─ 해결책 ──────────────────────────────────────────────────────
import { InteractionManager } from 'react-native';
// [생성] -> [버퍼] -> [드레이너] -> [UI]
//
// 버퍼에 토큰을 넣고, 드레이너가 "사람이 읽는 속도"로 균일하게 방출.
// 버퍼가 넘치면 빠르게, 버퍼가 얇아지면 느리게 -> 항상 부드러운 흐름.
//
// ─ 파라미터 (v2 최적화) ────────────────────────────────────────
// ✅ [OPT] TARGET_CPS: 10 -> 14
//   한국어 RP 평균 읽기속도 200~250 글자/분 ≈ 3.3~4.2 글자/초 (묵독 기준).
//   그러나 채팅 UI는 "타이핑 느낌"을 주는 속도가 최적 -> 12~16 CPS.
//   10 CPS는 너무 느려 답답한 느낌, 14 CPS는 자연스러운 타이핑 속도.
//
// ✅ [OPT] DRAIN_INTERVAL: 60ms -> 50ms
//   ~16fps -> 20fps 드레인. 모바일 60fps 기준 3프레임마다 1드레인 ->
//   스크롤 중에도 텍스트 업데이트가 부드럽게 맞물림.
//
// ✅ [OPT] HIGH_WATERMARK: 80 -> 55글자
//   버퍼가 55글자 이상이면 2× 가속 시작.
//   기존 80자는 버퍼가 꽤 쌓인 뒤에야 가속 -> 생성이 빠른 구간에서
//   잠깐 "텍스트 폭발" 현상. 55자에서 일찍 가속해 버퍼를 고르게 소진.
//
// ✅ [OPT] LOW_WATERMARK: 15 -> 8글자
//   버퍼 잔량 8자 미만일 때만 0.7× 감속. 기존 15자는 너무 보수적으로
//   감속해 생성속도보다 렌더가 느려지는 구간이 생김.
//   8자는 ~1프레임 정도의 여유만 두므로 고갈 직전에만 감속.
// ══════════════════════════════════════════════════════════════

export type DrainCallback = (chunk: string, isDone: boolean) => void;

interface BufferConfig {
  /** 목표 초당 글자수 (기본 14) */
  targetCPS?: number;
  /** 드레인 간격 ms (기본 50) */
  drainInterval?: number;
  /** 버퍼 고수위 — 초과 시 2× 가속 (기본 55) */
  highWatermark?: number;
  /** 버퍼 저수위 — 미만 시 0.7× 감속 (기본 8) */
  lowWatermark?: number;
}

export class SmoothTokenBuffer {
  private buffer      = '';
  private isDone      = false;
  private isStarted   = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private onDrain:    DrainCallback;
  // ✅ [FIX] InteractionManager handle 저장 -> cancel() 시 pending 콜백 취소
  private _interactionHandle: { cancel: () => void } | null = null;
  private _destroyed = false;
  // ✅ [NEW] 문장 부호 후 pause 추적
  private _lastChar = '';

  // 설정값
  private readonly TARGET_CPS:     number;
  private readonly DRAIN_INTERVAL: number;
  private readonly HIGH_WATERMARK: number;
  private readonly LOW_WATERMARK:  number;

  constructor(onDrain: DrainCallback, config?: BufferConfig) {
    this.onDrain         = onDrain;
    this.TARGET_CPS      = config?.targetCPS      ?? 8;   // 14 → 8 (느린 타이핑)
    this.DRAIN_INTERVAL  = config?.drainInterval  ?? 70;  // 50 → 70 (느린 간격)
    this.HIGH_WATERMARK  = config?.highWatermark  ?? 55;
    this.LOW_WATERMARK   = config?.lowWatermark   ?? 8;
  }

  // ── 외부 API ─────────────────────────────────────────────────

  /** 생성된 토큰 투입 (생성 스레드에서 호출) */
  push(token: string): void {
    if (this._destroyed) return;
    this.buffer += token;
    if (!this.isStarted) {
      this.isStarted = true;
      // ✅ [OPT] InteractionManager: 첫 드레인을 현재 인터랙션(화면 전환 등) 완료 후로
      //    지연 -> TTFT 프레임(첫 토큰 렌더) 도중 JS 스레드 블로킹 방지
      this._interactionHandle = InteractionManager.runAfterInteractions(() => {
        this._interactionHandle = null;
        this.scheduleDrain();
      });
    }
  }

  /** 생성 완료 신호 */
  finish(): void {
    if (this._destroyed) return;
    
    // [BUG FIX #19] finish() 시작 시 _interactionHandle을 무조건 취소한 뒤 상태를 판단
    if (this._interactionHandle !== null) {
      this._interactionHandle.cancel();
      this._interactionHandle = null;
    }

    this.isDone = true;
    
    if (this.buffer.length === 0 && this.drainTimer === null) {
      // 버퍼가 완전히 비어있고 타이머도 없으면 즉시 완료 콜백
      this.onDrain('', true);
      return;
    }

    if (this.drainTimer === null) {
      this.scheduleDrain();
    }
  }

  /** 즉시 중단 & 리소스 정리 */
  cancel(): void {
    // ✅ [FIX] InteractionManager pending 콜백도 취소
    // 이전: isStarted=false만 설정 -> 콜백이 실행되면 scheduleDrain() 호출 -> 취소된 버퍼 drain
    if (this._interactionHandle !== null) {
      this._interactionHandle.cancel();
      this._interactionHandle = null;
    }
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.buffer    = '';
    this.isDone    = true;
    this.isStarted = false;
  }

  // ✅ [FIX] 인스턴스 완전 폐기 — drainTimer 누수 방지
  // 기존: cancel()은 buffer·isDone·isStarted를 초기화하지만
  //       인스턴스가 GC 대상이 될 때 진행 중인 drainTimer를 정리하는
  //       메커니즘이 전혀 없어, 새 세션마다 인스턴스를 교체하면
  //       이전 인스턴스의 타이머가 계속 실행됨.
  // 수정: destroy()를 추가해 드레인 타이머를 즉시 취소하고
  //       onDrain 콜백 참조도 해제 -> GC가 정리할 수 있도록.
  destroy(): void {
    this._destroyed = true;
    if (this._interactionHandle !== null) {
      this._interactionHandle.cancel();
      this._interactionHandle = null;
    }
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.buffer    = '';
    this.isDone    = true;
    this.isStarted = false;
    this.onDrain = () => {};
  }

  /** 현재 버퍼 길이 (모니터링용) */
  get bufferLength(): number {
    return this.buffer.length;
  }

  // ── 내부 드레이너 ─────────────────────────────────────────────

  private scheduleDrain(): void {
    if (this.drainTimer !== null) clearTimeout(this.drainTimer);
    
    // ✅ [NEW] 문장 부호 후 긴 pause 추가
    let interval = this.DRAIN_INTERVAL;
    if ('.?!\n'.includes(this._lastChar)) {
      interval = 350;  // 문장 끝 pause
    } else if (',;:'.includes(this._lastChar)) {
      interval = 150;  // 쉼표 pause
    }
    
    this.drainTimer = setTimeout(() => this.drain(), interval);
  }

  private drain(): void {
    if (this._destroyed) return;
    this.drainTimer = null;

    if (this.buffer.length === 0) {
      if (this.isDone) {
        // 모든 버퍼 소진 + 생성 완료
        this.onDrain('', true);
        return;
      }
      // 버퍼 일시 고갈 (생성 중) — 짧은 대기 후 재시도
      this.drainTimer = setTimeout(() => this.drain(), Math.round(this.DRAIN_INTERVAL * 1.5));
      return;
    }

    // ─ 적응형 청크 크기 계산 ─────────────────────────────────
    // 기본: TARGET_CPS × INTERVAL
    const base = Math.ceil(this.TARGET_CPS * this.DRAIN_INTERVAL / 1000);

    let chunkSize: number;
    if (this.buffer.length >= this.HIGH_WATERMARK) {
      // 버퍼 과다 -> 2× 속도로 빠르게 소진
      chunkSize = base * 2;
    } else if (this.buffer.length <= this.LOW_WATERMARK) {
      // 버퍼 고갈 위험 -> 0.7× 속도로 아껴서 방출
      chunkSize = Math.max(1, Math.floor(base * 0.7));
    } else {
      chunkSize = base;
    }

    // ─ 단어 경계 스냅 ────────────────────────────────────────
    // 단어 중간에서 끊기면 어색함 -> 공백/줄바꿈 직후까지 연장
    // ✅ [OPT] lookahead 10 -> 15글자: 한국어 복합어(조사+어미) 평균 길이
    //    고려해 여유를 넓힘. 어절 경계를 더 자주 포착해 자연스러운 끊김.
    let snapEnd = Math.min(chunkSize, this.buffer.length);
    if (snapEnd < this.buffer.length) {
      const lookAhead = Math.min(snapEnd + 15, this.buffer.length);
      for (let i = snapEnd; i < lookAhead; i++) {
        const c = this.buffer[i];
        if (c === ' ' || c === '\n') {
          snapEnd = i + 1;
          break;
        }
      }
    }

    const chunk   = this.buffer.slice(0, snapEnd);
    this.buffer   = this.buffer.slice(snapEnd);
    const isLast  = this.isDone && this.buffer.length === 0;

    // ✅ [NEW] 마지막 문자 추적 (다음 pause 계산용)
    if (chunk.length > 0) {
      this._lastChar = chunk[chunk.length - 1];
    }

    this.onDrain(chunk, isLast);

    if (!isLast) {
      this.scheduleDrain();
    }
  }
}
