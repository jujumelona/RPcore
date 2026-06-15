// src/core/llama/AdaptiveEmbeddingManager.ts
// ─────────────────────────────────────────────────────────────────────────────
//  AdaptiveEmbeddingManager
//
//  270M 임베딩 모델을 디바이스 성능에 따라 동적으로 관리.
//  모델 자체를 교체하지 않고 "얼마나 자주/깊이 호출할지"를 제어.
//  → 전환 즉시 적용, 로딩 지연 없음.
//
//  ┌─────────┬─────────────────────────────────────────────────────────┐
//  │ Tier    │ 동작                                                    │
//  ├─────────┼─────────────────────────────────────────────────────────┤
//  │ full    │ 모든 기능 — 단락 embed + 배치 embed + 앵커 비교         │
//  │ lite    │ 단락 embed만 — 배치(buildHybridContext) 스킵           │
//  │ keyword │ embedding 호출 0 — 15개국어 키워드 폴백                │
//  └─────────┴─────────────────────────────────────────────────────────┘
//
//  판단 기준 (추론 지연 EMA — 폰 온도계 역할):
//    · 벤치마크: 앱 시작 시 짧은 문장 1회 측정
//    · 운용 중: embed 호출마다 EMA 업데이트
//    · full  → lite   : EMA > 160ms  OR  연속 3회 slow
//    · lite  → keyword: EMA > 380ms  OR  연속 3회 slow
//    · 다운그레이드 후 60초 쿨다운 → 자동 벤치 재측정 → 업그레이드 시도
//
//  발열 특성:
//    · 270M 모델 int8: ~270MB RAM, CPU 추론 30~120ms (기기별)
//    · Snapdragon 8 Gen3 / A17 Pro 이상: full 안정 운용
//    · 중급기 (SD 7xx, A15): lite 모드 적합
//    · 구형 / 저RAM: keyword 폴백
// ─────────────────────────────────────────────────────────────────────────────

import { embeddingEngine } from './EmbeddingEngine';

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type EmbeddingTier = 'full' | 'lite' | 'keyword';

interface TierThresholds {
  /** full → lite 전환 EMA 임계값 (ms) */
  fullToLite:    number;
  /** lite → keyword 전환 EMA 임계값 (ms) */
  liteToKeyword: number;
  /** 업그레이드 판단 EMA 임계값 (ms) — 다운 임계보다 낮게 설정 (히스테리시스) */
  upgradeBuffer: number;
  /** 연속 slow 횟수 → 즉시 다운그레이드 */
  slowCountLimit: number;
  /** 쿨다운 후 재벤치마크 간격 (ms) */
  cooldownMs:    number;
}

const DEFAULT_THRESHOLDS: TierThresholds = {
  fullToLite:    160,
  liteToKeyword: 380,
  upgradeBuffer: 60,   // EMA < (임계 - buffer) 이면 업그레이드 시도
  slowCountLimit: 3,
  cooldownMs:   60_000,
};

const EMA_ALPHA = 0.3;  // 새 측정값 가중치 (작을수록 둔감)
const BENCHMARK_TEXT = 'The story unfolds in a quiet village where time moves slowly.';

// ─────────────────────────────────────────────────────────────────────────────

export class AdaptiveEmbeddingManager {
  private _tier: EmbeddingTier = 'keyword'; // 벤치 전까지 안전하게 keyword
  private _latencyEma           = 0;
  private _benchmarkDone        = false;
  private _benchmarkRunning     = false;
  private _slowCount            = 0;
  private _fastCount            = 0;
  private _cooldownUntil        = 0;
  private _lastDowngradeTime    = 0;
  private readonly _thresholds: TierThresholds;
  private _tierListeners: Array<(tier: EmbeddingTier, latencyMs: number) => void> = [];

  constructor(thresholds: Partial<TierThresholds> = {}) {
    this._thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // ── 공개 API ────────────────────────────────────────────────────────────────

  get tier(): EmbeddingTier { return this._tier; }
  get latencyEma(): number  { return this._latencyEma; }
  get benchmarkDone(): boolean { return this._benchmarkDone; }

  /** 초기 벤치마크. embeddingEngine.isReady() 확인 후 호출. */
  async benchmark(): Promise<EmbeddingTier> {
    if (this._benchmarkRunning) return this._tier;
    if (!embeddingEngine.isReady()) return 'keyword';

    this._benchmarkRunning = true;
    try {
      const t0  = Date.now();
      await embeddingEngine.embedDocument(BENCHMARK_TEXT);
      const ms  = Date.now() - t0;

      this._latencyEma  = ms;  // 첫 측정은 EMA 초기화
      this._benchmarkDone = true;
      this._applyLatency(ms, /* initial */ true);

      console.log(`[AdaptiveEmbedding] benchmark ${ms}ms → tier="${this._tier}"`);
      return this._tier;
    } catch {
      this._tier = 'keyword';
      return 'keyword';
    } finally {
      this._benchmarkRunning = false;
    }
  }

  /**
   * 단락 벡터 임베딩.
   * · full/lite: 실제 embed 호출 + 지연 측정
   * · keyword  : null 반환 (호출자가 폴백 처리)
   */
  async embedPara(text: string): Promise<Float32Array | null> {
    if (this._tier === 'keyword') {
      this._maybeTryUpgrade();
      return null;
    }
    if (!embeddingEngine.isReady()) return null;

    const t0 = Date.now();
    try {
      const vec = await embeddingEngine.embedDocument(text.slice(0, 512));
      this._recordLatency(Date.now() - t0);
      return vec;
    } catch {
      return null;
    }
  }

  /**
   * 배치 임베딩.
   * · full만 허용 — lite/keyword는 빈 배열 반환
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (this._tier !== 'full') return [];
    if (!embeddingEngine.isReady()) return [];

    const t0 = Date.now();
    try {
      const vecs = await embeddingEngine.embedDocumentBatch(texts);
      // 배치는 문항 수로 나눠서 per-item 지연으로 환산
      this._recordLatency((Date.now() - t0) / Math.max(1, texts.length));
      return vecs;
    } catch {
      return [];
    }
  }

  /**
   * 쿼리 임베딩 (BM25 보완용).
   * full만 허용.
   */
  async embedQuery(text: string): Promise<Float32Array | null> {
    if (this._tier !== 'full') return null;
    if (!embeddingEngine.isReady()) return null;
    try { return await embeddingEngine.embedQuery(text); } catch { return null; }
  }

  /** tier 변경 이벤트 구독 */
  onTierChange(cb: (tier: EmbeddingTier, latencyMs: number) => void): () => void {
    this._tierListeners.push(cb);
    return () => { this._tierListeners = this._tierListeners.filter(l => l !== cb); };
  }

  // ── 내부 로직 ───────────────────────────────────────────────────────────────

  private _recordLatency(ms: number): void {
    this._latencyEma = this._latencyEma === 0
      ? ms
      : this._latencyEma * (1 - EMA_ALPHA) + ms * EMA_ALPHA;

    this._applyLatency(ms, false);
  }

  private _applyLatency(ms: number, initial: boolean): void {
    const { fullToLite, liteToKeyword, upgradeBuffer, slowCountLimit } = this._thresholds;

    const isSlow = (this._tier === 'full'  && ms > fullToLite)
                || (this._tier === 'lite'  && ms > liteToKeyword);

    if (isSlow && !initial) {
      this._slowCount++;
      this._fastCount = 0;
      if (this._slowCount >= slowCountLimit || this._latencyEma > liteToKeyword * 1.2) {
        this._downgrade();
        return;
      }
    } else {
      this._fastCount++;
      this._slowCount = 0;
    }

    // 초기 벤치마크 기반 tier 결정
    if (initial) {
      if (ms < fullToLite - upgradeBuffer)    this._setTier('full');
      else if (ms < liteToKeyword - upgradeBuffer) this._setTier('lite');
      else                                     this._setTier('keyword');
    }
  }

  private _downgrade(): void {
    const prev = this._tier;
    if (this._tier === 'full')  this._setTier('lite');
    else if (this._tier === 'lite') this._setTier('keyword');

    if (this._tier !== prev) {
      this._slowCount       = 0;
      this._lastDowngradeTime = Date.now();
      this._cooldownUntil   = Date.now() + this._thresholds.cooldownMs;
      console.log(`[AdaptiveEmbedding] downgrade: ${prev} → ${this._tier} (EMA ${this._latencyEma.toFixed(0)}ms)`);
    }
  }

  private _maybeTryUpgrade(): void {
    if (Date.now() < this._cooldownUntil) return;
    if (this._benchmarkRunning) return;
    if (!embeddingEngine.isReady()) return;

    // 쿨다운 종료 → 재벤치마크 (비동기, 결과는 EMA로 반영)
    this._cooldownUntil = Date.now() + this._thresholds.cooldownMs; // 재진입 방지
    this.benchmark().catch(() => {});
  }

  private _setTier(tier: EmbeddingTier): void {
    if (this._tier === tier) return;
    this._tier = tier;
    this._tierListeners.forEach(cb => cb(tier, this._latencyEma));
  }
}

// 싱글톤
export const adaptiveEmbedding = new AdaptiveEmbeddingManager();
