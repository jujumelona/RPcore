import React from 'react';
import { RAMChecker } from './RAMChecker';
import { EMATracker } from './MathUtils';

export interface InferenceReport {
  modelId: string;
  storyId: string;
  startTime: number;
  endTime: number;
  ttftMs: number;
  totalTokens: number;
  tps: number;
  ramBefore: number;
  ramAfter: number;
  ramDeltaMB: number;
  suspectedLeak: boolean;
}

export interface PerformanceSnapshot {
  timestamp: number;
  ramUsedMB: number;
  ramAvailMB: number;
  usagePercent: number;
  label: string;
}

class InferenceSession {
  private readonly modelId: string;
  private readonly storyId: string;
  private readonly startTime: number;
  private firstTokenTime: number = 0;
  private tokenCount: number = 0;
  private ramBefore: number = 0;
  private _leakTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor(modelId: string, storyId: string, ramBefore: number) {
    this.modelId = modelId;
    this.storyId = storyId;
    this.startTime = performance.now();
    this.ramBefore = ramBefore;

    if (__DEV__) {
      console.log(
        `[PerfMonitor] inference start | model=${modelId} | story=${storyId.slice(0, 8)}...` +
        ` | ramAvail=${ramBefore}MB`,
      );
    }
  }

  markFirstToken(): void {
    if (this.firstTokenTime === 0) {
      this.firstTokenTime = performance.now();
      if (__DEV__) {
        const ttft = Math.round(this.firstTokenTime - this.startTime);
        console.log(`[PerfMonitor] first token | TTFT: ${ttft}ms`);
      }
    }
  }

  onToken(): void {
    this.tokenCount++;
  }

  cancelLeakCheck(): void {
    if (this._leakTimerId !== null) {
      clearTimeout(this._leakTimerId);
      this._leakTimerId = null;
    }
  }

  async finish(finalTokenCount?: number): Promise<InferenceReport> {
    const endTime = performance.now();
    const total = finalTokenCount ?? this.tokenCount;

    // Yield once so RAM measurement reflects post-inference cleanup.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const checker = RAMChecker.getInstance();
    checker.invalidateCache();
    const ramInfoAfter = await checker.check();
    const ramAfter = ramInfoAfter.availableRAM;

    const ttftMs = this.firstTokenTime > 0
      ? Math.round(this.firstTokenTime - this.startTime)
      : 0;
    const decodeTime = this.firstTokenTime > 0
      ? (endTime - this.firstTokenTime) / 1000
      : (endTime - this.startTime) / 1000;
    const tps = decodeTime > 0 ? Math.round((total / decodeTime) * 10) / 10 : 0;
    const ramDeltaMB = this.ramBefore - ramAfter;

    let suspectedLeak = false;
    // RAM 누수 의심 체크: 임계값 150MB로 올려서 페이지 이동 시 오탐 방지
    if (__DEV__ && ramDeltaMB > 150) {
      // Ensure only one leak timer per session.
      this.cancelLeakCheck();

      // Avoid capturing `this` in the timer closure.
      const capturedRamBefore = this.ramBefore;
      const capturedModelId = this.modelId;
      this._leakTimerId = setTimeout(async () => {
        this._leakTimerId = null;
        PerformanceMonitor._pendingLeakTimerId = null;
        checker.invalidateCache();
        const ramLater = await checker.check();
        const stillConsumed = capturedRamBefore - ramLater.availableRAM;
        if (stillConsumed > 150) {
          console.warn(
            `[PerfMonitor] possible RAM leak\n` +
            `  before: ${capturedRamBefore}MB -> after 10s: ${ramLater.availableRAM}MB\n` +
            `  unrecovered: ${Math.round(stillConsumed)}MB | model=${capturedModelId}`,
          );
          PerformanceMonitor._recordLeakSuspicion(capturedModelId, stillConsumed);
        }
      }, 10_000);

      PerformanceMonitor._pendingLeakTimerId = this._leakTimerId;
      suspectedLeak = ramDeltaMB > 200;
    }

    const report: InferenceReport = {
      modelId: this.modelId,
      storyId: this.storyId,
      startTime: this.startTime,
      endTime,
      ttftMs,
      totalTokens: total,
      tps,
      ramBefore: this.ramBefore,
      ramAfter,
      ramDeltaMB,
      suspectedLeak };

    if (__DEV__) {
      console.log(
        `[PerfMonitor] inference end\n` +
        `  model : ${this.modelId}\n` +
        `  TTFT  : ${ttftMs}ms\n` +
        `  TPS   : ${tps} tok/s\n` +
        `  tokens: ${total}\n` +
        `  RAM Δ : ${ramDeltaMB > 0 ? '+' : ''}${Math.round(ramDeltaMB)}MB` +
        `  (${this.ramBefore} -> ${ramAfter}MB)\n` +
        (suspectedLeak ? '  LEAK SUSPECTED' : ''),
      );
      PerformanceMonitor._addReport(report);
    }

    if (PerformanceMonitor._activeSession === this) {
      PerformanceMonitor._activeSession = null;
    }

    return report;
  }
}

export class PerformanceMonitor {
  private static _reports: InferenceReport[] = [];
  private static _leakSuspicions: Array<{ modelId: string; lostMB: number; ts: number }> = [];
  private static _continuousTimer: ReturnType<typeof setInterval> | null = null;
  private static _snapshots: PerformanceSnapshot[] = [];
  static _activeSession: InferenceSession | null = null;
  static _pendingLeakTimerId: ReturnType<typeof setTimeout> | null = null;
  private static _monitorRefCount = 0;
  private static _lastTickTime = Date.now();
  private static _freezeDetector: ReturnType<typeof setInterval> | null = null;

  static startFreezeDetection(): void {
    if (this._freezeDetector) {
      clearInterval(this._freezeDetector);
      this._freezeDetector = null;
    }
    this._lastTickTime = Date.now();
    this._freezeDetector = setInterval(() => {
      const now = Date.now();
      const delta = now - this._lastTickTime;
      // 500ms(interval) + 1000ms delay = 1.5s 이상 지연 시 프리즈로 판단
      if (delta > 1500 && __DEV__) {
        console.warn(`[PerfMonitor] JS Thread Freeze Detected: ${delta}ms lag`);
      }
      this._lastTickTime = now;
    }, 500);
  }

  static stopFreezeDetection(): void {
    if (this._freezeDetector) {
      clearInterval(this._freezeDetector);
      this._freezeDetector = null;
    }
  }

  static async startInference(modelId: string, storyId: string): Promise<InferenceSession> {
    if (this._pendingLeakTimerId !== null) {
      clearTimeout(this._pendingLeakTimerId);
      this._pendingLeakTimerId = null;
    }
    if (this._activeSession) {
      this._activeSession.cancelLeakCheck();
      this._activeSession = null;
    }

    const checker = RAMChecker.getInstance();
    checker.invalidateCache();
    const ramInfo = await checker.check();
    const session = new InferenceSession(modelId, storyId, ramInfo.availableRAM);
    this._activeSession = session;
    return session;
  }

  static startContinuousMonitoring(intervalMs: number = 15_000): void {
    if (!__DEV__) return;

    this._monitorRefCount++;
    if (this._continuousTimer !== null) {
      // ✅ [RE-ENTRY GUARD] 이미 실행 중이면 ref-count만 올리고 interval 유지
      return;
    }

    const checker = RAMChecker.getInstance();

    const tick = async () => {
      try {
        // ✅ invalidateCache() 제거 — RAMChecker 자체 TTL(5s) 캐시 활용
        // 매 tick마다 캐시를 무효화하면 Native 모듈 없는 기기에서 반복 warn 발생
        const info = await checker.check();
        const snap: PerformanceSnapshot = {
          timestamp: Date.now(),
          ramUsedMB: info.usedRAM,
          ramAvailMB: info.availableRAM,
          usagePercent: info.usagePercent,
          label: 'continuous' };
        this._snapshots.push(snap);
        if (this._snapshots.length > 100) {
          this._snapshots = this._snapshots.slice(-100);
        }
        if (info.usagePercent > 90) {
          console.warn(
            `[PerfMonitor] high RAM usage: ${info.usagePercent}%\n` +
            `  used: ${info.usedRAM}MB / total: ${info.totalRAM}MB\n` +
            `  available: ${info.availableRAM}MB`,
          );
        }
      } catch {
        // ignore
      }
    };

    tick();
    this._continuousTimer = setInterval(tick, intervalMs);
    if (__DEV__) console.log(`[PerfMonitor] continuous monitoring started (${intervalMs / 1000}s, refCount=${this._monitorRefCount})`);
  }

  static stopContinuousMonitoring(): void {
    if (!__DEV__) return;

    if (this._monitorRefCount <= 0 && this._continuousTimer === null) {
      this._monitorRefCount = 0;
      return;
    }

    if (this._monitorRefCount > 0) {
      this._monitorRefCount--;
    }
    if (this._monitorRefCount > 0) return;

    if (this._continuousTimer) {
      clearInterval(this._continuousTimer);
      this._continuousTimer = null;
      if (__DEV__) console.log('[PerfMonitor] continuous monitoring stopped');
    }
    this._monitorRefCount = 0;
  }

  static forceStopContinuousMonitoring(): void {
    this._monitorRefCount = 0;
    if (this._continuousTimer) {
      clearInterval(this._continuousTimer);
      this._continuousTimer = null;
    }
  }

  static _addReport(report: InferenceReport): void {
    this._reports.push(report);
    if (this._reports.length > 50) {
      this._reports = this._reports.slice(-50);
    }
  }

  static _recordLeakSuspicion(modelId: string, lostMB: number): void {
    this._leakSuspicions.push({ modelId, lostMB: Math.round(lostMB), ts: Date.now() });
    if (this._leakSuspicions.length > 20) {
      this._leakSuspicions = this._leakSuspicions.slice(-20);
    }
  }

  static getReports(): InferenceReport[] { return [...this._reports]; }
  static getSnapshots(): PerformanceSnapshot[] { return [...this._snapshots]; }
  static getLeakSuspicions() { return [...this._leakSuspicions]; }
  static getLastReport(): InferenceReport | null { return this._reports[this._reports.length - 1] ?? null; }

  static getAverageTPS(last: number = 10): number {
    const recent = this._reports.slice(-last).filter(r => r.tps > 0);
    if (recent.length === 0) return 0;
    const tracker = new EMATracker(0.3);
    for (const r of recent) tracker.update(r.tps);
    return Math.round(tracker.get() * 10) / 10;
  }

  static getAverageTTFT(last: number = 10): number {
    const recent = this._reports.slice(-last).filter(r => r.ttftMs > 0);
    if (recent.length === 0) return 0;
    const tracker = new EMATracker(0.25);
    for (const r of recent) tracker.update(r.ttftMs);
    return Math.round(tracker.get());
  }

  static printSummary(): void {
    if (!__DEV__) return;
    const reports = this._reports;
    if (reports.length === 0) {
      console.log('[PerfMonitor] no inference records');
      return;
    }
    console.log(
      `[PerfMonitor] summary (${reports.length} runs)\n` +
      `  avg TTFT : ${this.getAverageTTFT()}ms\n` +
      `  avg TPS  : ${this.getAverageTPS()} tok/s\n` +
      `  leak suspects : ${this._leakSuspicions.length}`,
    );
  }
}

interface UsePerfMonitorResult {
  lastReport: InferenceReport | null;
  avgTPS: number;
  avgTTFT: number;
  leakCount: number;
  latestSnapshot: PerformanceSnapshot | null;
}

export function usePerfMonitor(refreshMs: number = 5000): UsePerfMonitorResult {
  const [state, setState] = React.useState<UsePerfMonitorResult>({
    lastReport: null,
    avgTPS: 0,
    avgTTFT: 0,
    leakCount: 0,
    latestSnapshot: null });

  React.useEffect(() => {
    if (!__DEV__) return;
    const refresh = () => {
      const snaps = PerformanceMonitor.getSnapshots();
      setState({
        lastReport: PerformanceMonitor.getLastReport(),
        avgTPS: PerformanceMonitor.getAverageTPS(),
        avgTTFT: PerformanceMonitor.getAverageTTFT(),
        leakCount: PerformanceMonitor.getLeakSuspicions().length,
        latestSnapshot: snaps[snaps.length - 1] ?? null });
    };
    refresh();
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return state;
}
