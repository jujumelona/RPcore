// src/utils/PerformanceTracker.ts
// ══════════════════════════════════════════════════════════════
// 성능 추적 유틸리티 — 앱 성능 병목 지점 실시간 모니터링
// ══════════════════════════════════════════════════════════════

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class PerformanceTrackerClass {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private maxStoredMetrics = 100;

  /**
   * 성능 측정 시작
   */
  start(name: string, metadata?: Record<string, any>): void {
    // [BUG FIX] 동일 name으로 중복 start 시 경고 — 이전 측정 데이터 유실 방지
    if (this.metrics.has(name)) {
      if (__DEV__) console.warn(`[PerformanceTracker] "${name}" 측정이 이미 진행 중입니다. 이전 측정을 덮어씁니다.`);
    }
    this.metrics.set(name, {
      name,
      startTime: Date.now(),
      metadata });
  }

  /**
   * 성능 측정 종료 및 결과 반환
   */
  end(name: string): number | null {
    const metric = this.metrics.get(name);
    if (!metric) {
      if (__DEV__) console.warn(`[PerformanceTracker] "${name}" 측정이 시작되지 않았습니다.`);
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - metric.startTime;

    const completedMetric: PerformanceMetric = {
      ...metric,
      endTime,
      duration };

    this.completedMetrics.push(completedMetric);
    
    // 메모리 관리: 최대 저장 개수 초과 시 오래된 것 제거
    if (this.completedMetrics.length > this.maxStoredMetrics) {
      this.completedMetrics.shift();
    }

    this.metrics.delete(name);

    if (__DEV__) console.log(`[Performance] ${name}: ${duration}ms`, metric.metadata || '');

    return duration;
  }

  /**
   * 비동기 함수 성능 측정 래퍼
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>,
  ): Promise<T> {
    this.start(name, metadata);
    try {
      const result = await fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  /**
   * 동기 함수 성능 측정 래퍼
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>,
  ): T {
    this.start(name, metadata);
    try {
      const result = fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  /**
   * 완료된 메트릭 조회
   */
  getMetrics(filterName?: string): PerformanceMetric[] {
    if (filterName) {
      return this.completedMetrics.filter(m => m.name.includes(filterName));
    }
    return [...this.completedMetrics];
  }

  /**
   * 평균 성능 계산
   */
  getAverageDuration(name: string): number | null {
    const filtered = this.completedMetrics.filter(m => m.name === name);
    if (filtered.length === 0) return null;

    const total = filtered.reduce((sum, m) => sum + (m.duration || 0), 0);
    return total / filtered.length;
  }

  /**
   * 성능 리포트 생성
   */
  generateReport(): string {
    const grouped = new Map<string, PerformanceMetric[]>();
    
    for (const metric of this.completedMetrics) {
      const existing = grouped.get(metric.name) || [];
      existing.push(metric);
      grouped.set(metric.name, existing);
    }

    let report = '=== Performance Report ===\n\n';
    
    for (const [name, metrics] of grouped.entries()) {
      const durations = metrics.map(m => m.duration || 0);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      report += `${name}:\n`;
      report += `  Count: ${metrics.length}\n`;
      report += `  Avg: ${avg.toFixed(2)}ms\n`;
      report += `  Min: ${min}ms\n`;
      report += `  Max: ${max}ms\n\n`;
    }

    return report;
  }

  /**
   * 모든 메트릭 초기화
   */
  clear(): void {
    this.metrics.clear();
    this.completedMetrics = [];
  }
}

export const PerformanceTracker = new PerformanceTrackerClass();
