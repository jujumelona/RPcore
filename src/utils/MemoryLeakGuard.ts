import { AppState, AppStateStatus } from 'react-native';
import { RAMChecker } from './RAMChecker';
import { logger } from './logger';

export interface MemorySample {
  timestamp: number;
  availableMB: number;
  usedMB: number;
  totalMB: number;
  usagePercent: number;
}

export interface MemoryPressureInfo extends MemorySample {
  level: 'pressure' | 'critical';
}

export interface LeakSuspectedInfo {
  dropMB: number;
  windowMs: number;
  baselineMB: number;
  currentMB: number;
  sampleCount: number;
  latest: MemorySample;
}

export interface MemoryLeakGuardConfig {
  intervalMs: number;
  windowMs: number;
  minSamples: number;
  dropThresholdMB: number;
  pressureThresholdMB: number;
  criticalThresholdMB: number;
  cooldownMs: number;
}

export interface MemoryLeakGuardActions {
  onPressure?: (info: MemoryPressureInfo) => void | Promise<void>;
  onCritical?: (info: MemoryPressureInfo) => void | Promise<void>;
  onLeakSuspected?: (info: LeakSuspectedInfo) => void | Promise<void>;
}

const DEFAULT_CONFIG: MemoryLeakGuardConfig = {
  intervalMs: 15_000,
  windowMs: 120_000,
  minSamples: 4,
  dropThresholdMB: 350,
  pressureThresholdMB: 800,
  criticalThresholdMB: 300,
  cooldownMs: 60_000 };

class MemoryLeakGuard {
  private timer: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private samples: MemorySample[] = [];
  private running = false;
  private inFlight = false;
  private appActive = true;
  private config: MemoryLeakGuardConfig = DEFAULT_CONFIG;
  private actions: MemoryLeakGuardActions = {};
  private lastPressureAt = 0;
  private lastCriticalAt = 0;
  private lastLeakAt = 0;

  start(
    config: Partial<MemoryLeakGuardConfig> = {},
    actions: MemoryLeakGuardActions = {},
  ): () => void {
    if (this.running) {
      this.running = false;
      this.stop();
    }
    this.running = true;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.actions = actions;

    const state = AppState.currentState;
    this.appActive = state === 'active' || state === 'unknown';

    this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);
    this.tick();
    this.timer = setInterval(() => this.tick(), this.config.intervalMs);
    return () => this.stop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.samples = [];
    this.inFlight = false;
  }

  getSamples(): MemorySample[] {
    return [...this.samples];
  }

  private handleAppStateChange = (state: AppStateStatus) => {
    this.appActive = state === 'active';
    if (this.appActive) this.tick();
  };

  private async tick(): Promise<void> {
    if (!this.running || !this.appActive || this.inFlight) return;
    this.inFlight = true;
    try {
      const info = await RAMChecker.getInstance().check();
      const sample: MemorySample = {
        timestamp: Date.now(),
        availableMB: info.availableRAM,
        usedMB: info.usedRAM,
        totalMB: info.totalRAM,
        usagePercent: info.usagePercent };
      this.recordSample(sample);
      this.evaluate(sample);
    } catch (e) {
      logger.warn('[MemoryLeakGuard] RAM check failed', e);
    } finally {
      this.inFlight = false;
    }
  }

  private recordSample(sample: MemorySample): void {
    const cutoff = sample.timestamp - this.config.windowMs;
    this.samples = this.samples.filter(s => s.timestamp >= cutoff);
    this.samples.push(sample);
  }

  private evaluate(sample: MemorySample): void {
    if (this.samples.length === 0) return;

    const now = sample.timestamp;
    const isCritical = sample.availableMB <= this.config.criticalThresholdMB;
    const isPressure = sample.availableMB <= this.config.pressureThresholdMB;

    if (isCritical && this.isCooldownExpired(this.lastCriticalAt, now)) {
      this.lastCriticalAt = now;
      this.runAction('critical', {
        ...sample,
        level: 'critical' });
    } else if (isPressure && this.isCooldownExpired(this.lastPressureAt, now)) {
      this.lastPressureAt = now;
      this.runAction('pressure', {
        ...sample,
        level: 'pressure' });
    }

    // [BUG-ITEM13 FIX] isPressure 조건에 상관없이 minSamples 이상이면 누수 체크 수행
    if (this.samples.length < this.config.minSamples) return;

    const baseline = this.samples.reduce((max, s) =>
      s.availableMB > max.availableMB ? s : max, this.samples[0]!,
    );
    const dropMB = baseline.availableMB - sample.availableMB;

    if (dropMB >= this.config.dropThresholdMB && this.isCooldownExpired(this.lastLeakAt, now)) {
      this.lastLeakAt = now;
      this.runAction('leak', {
        dropMB,
        windowMs: this.config.windowMs,
        baselineMB: baseline.availableMB,
        currentMB: sample.availableMB,
        sampleCount: this.samples.length,
        latest: sample });
    }
  }

  private isCooldownExpired(lastAt: number, now: number): boolean {
    return now - lastAt >= this.config.cooldownMs;
  }

  private runAction(
    kind: 'pressure' | 'critical' | 'leak',
    info: MemoryPressureInfo | LeakSuspectedInfo,
  ): void {
    const fn = kind === 'pressure'
      ? this.actions.onPressure
      : kind === 'critical'
        ? this.actions.onCritical
        : this.actions.onLeakSuspected;
    if (!fn) return;
    try {
      const result = (fn as (i: typeof info) => unknown)(info);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    } catch (e) {
      logger.warn(`[MemoryLeakGuard] ${kind} handler failed`, e);
    }
  }
}

export const memoryLeakGuard = new MemoryLeakGuard();
export default memoryLeakGuard;
