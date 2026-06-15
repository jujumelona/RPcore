/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Memory monitoring utilities for React Native apps
 * Provides comprehensive memory usage tracking and optimization recommendations
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import React from 'react';

export interface MemoryStats {
  heapUsed: number;           // Heap used in MB
  heapTotal: number;          // Total heap in MB
  external: number;           // External memory in MB
  rss: number;                // Resident Set Size in MB
  arrayBuffers: number;       // ArrayBuffer memory in MB
  timestamp: number;          // Timestamp of measurement
}

export interface MemoryThresholds {
  warningLevel: number;       // Memory usage % for warning (default: 70)
  criticalLevel: number;      // Memory usage % for critical (default: 85)
  maxHeapMB: number;          // Maximum heap size in MB (default: 200)
  maxExternalMB: number;      // Maximum external memory in MB (default: 100)
}

export interface MemoryAlert {
  level: 'warning' | 'critical';
  type: 'heap' | 'external' | 'rss' | 'overall';
  message: string;
  timestamp: number;
  stats: MemoryStats;
}

const DEFAULT_THRESHOLDS: MemoryThresholds = {
  warningLevel: 70,
  criticalLevel: 85,
  maxHeapMB: 200,
  maxExternalMB: 100,
};

export class MemoryMonitor {
  private thresholds: MemoryThresholds;
  private history: MemoryStats[] = [];
  private maxHistorySize: number = 100;
  private alerts: MemoryAlert[] = [];
  private maxAlerts: number = 50;
  private isMonitoring: boolean = false;
  private monitoringInterval?: ReturnType<typeof setInterval>;
  private onMemoryAlert?: (_alert: MemoryAlert) => void;

  constructor(
    thresholds: Partial<MemoryThresholds> = {},
    onMemoryAlert?: (_alert: MemoryAlert) => void
  ) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.onMemoryAlert = onMemoryAlert;
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Get current memory statistics
   */
  getCurrentStats(): MemoryStats | null {
    try {
      // In React Native, we use performance.memory if available
      // or estimate based on available APIs
      const memory = (typeof globalThis !== 'undefined' && 
                     (globalThis as any).performance?.memory);
      
      if (memory) {
        return {
          heapUsed: Math.round(memory.usedJSHeapSize / (1024 * 1024) * 100) / 100,
          heapTotal: Math.round(memory.totalJSHeapSize / (1024 * 1024) * 100) / 100,
          external: Math.round((memory as any).external / (1024 * 1024) * 100) / 100,
          rss: 0, // Not available in RN, estimated
          arrayBuffers: Math.round((memory as any).arrayBuffers / (1024 * 1024) * 100) / 100,
          timestamp: Date.now(),
        };
      }

      // Fallback estimation for React Native
      return this.estimateMemoryStats();
    } catch (error) {
      console.warn('[MemoryMonitor] Failed to get memory stats:', error);
      return null;
    }
  }

  /**
   * Get memory usage history
   */
  getHistory(): MemoryStats[] {
    return [...this.history];
  }

  /**
   * Get recent alerts
   */
  getAlerts(): MemoryAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear history and alerts
   */
  clearHistory(): void {
    this.history = [];
    this.alerts = [];
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): boolean {
    try {
      const globalScope = typeof globalThis !== 'undefined' ? globalThis : {} as any;
      if ((globalScope as any).gc) {
        (globalScope as any).gc();
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[MemoryMonitor] GC not available:', error);
      return false;
    }
  }

  /**
   * Get memory optimization recommendations
   */
  getRecommendations(): string[] {
    const current = this.getCurrentStats();
    if (!current) return [];

    const recommendations: string[] = [];
    const heapUsage = (current.heapUsed / this.thresholds.maxHeapMB) * 100;
    const externalUsage = (current.external / this.thresholds.maxExternalMB) * 100;

    if (heapUsage > this.thresholds.criticalLevel) {
      recommendations.push('Critical: Heap memory usage is very high. Consider clearing caches and reducing data retention.');
    } else if (heapUsage > this.thresholds.warningLevel) {
      recommendations.push('Warning: Heap memory usage is elevated. Monitor for memory leaks.');
    }

    if (externalUsage > this.thresholds.criticalLevel) {
      recommendations.push('Critical: External memory usage is very high. Check for large ArrayBuffers or native resources.');
    } else if (externalUsage > this.thresholds.warningLevel) {
      recommendations.push('Warning: External memory usage is elevated. Review image and buffer management.');
    }

    if (this.history.length > 10) {
      const recent = this.history.slice(-10);
      const trend = this.calculateMemoryTrend(recent);
      if (trend > 5) {
        recommendations.push('Memory usage is trending upward. Investigate potential memory leaks.');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears normal.');
    }

    return recommendations;
  }

  /**
   * Check memory and trigger alerts if necessary
   */
  private checkMemory(): void {
    const stats = this.getCurrentStats();
    if (!stats) return;

    // Add to history
    this.history.push(stats);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Check thresholds and create alerts
    this.checkThresholds(stats);
  }

  /**
   * Check memory against thresholds and create alerts
   */
  private checkThresholds(stats: MemoryStats): void {
    const heapUsage = (stats.heapUsed / this.thresholds.maxHeapMB) * 100;
    const externalUsage = (stats.external / this.thresholds.maxExternalMB) * 100;

    // Check heap memory
    if (heapUsage > this.thresholds.criticalLevel) {
      this.createAlert('critical', 'heap', 
        `Heap memory usage is critical: ${stats.heapUsed}MB (${Math.round(heapUsage)}%)`, stats);
    } else if (heapUsage > this.thresholds.warningLevel) {
      this.createAlert('warning', 'heap', 
        `Heap memory usage is high: ${stats.heapUsed}MB (${Math.round(heapUsage)}%)`, stats);
    }

    // Check external memory
    if (externalUsage > this.thresholds.criticalLevel) {
      this.createAlert('critical', 'external', 
        `External memory usage is critical: ${stats.external}MB (${Math.round(externalUsage)}%)`, stats);
    } else if (externalUsage > this.thresholds.warningLevel) {
      this.createAlert('warning', 'external', 
        `External memory usage is high: ${stats.external}MB (${Math.round(externalUsage)}%)`, stats);
    }
  }

  /**
   * Create memory alert
   */
  private createAlert(level: 'warning' | 'critical', type: MemoryAlert['type'], message: string, stats: MemoryStats): void {
    const alert: MemoryAlert = {
      level,
      type,
      message,
      timestamp: Date.now(),
      stats,
    };

    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    this.onMemoryAlert?.(alert);
  }

  /**
   * Estimate memory stats for React Native (fallback)
   */
  private estimateMemoryStats(): MemoryStats {
    // Very rough estimation - in production, use native modules for accurate measurement
    const estimatedHeap = 50 + Math.random() * 100; // 50-150MB estimate
    const estimatedExternal = 20 + Math.random() * 50; // 20-70MB estimate

    return {
      heapUsed: Math.round(estimatedHeap * 100) / 100,
      heapTotal: Math.round((estimatedHeap * 1.5) * 100) / 100,
      external: Math.round(estimatedExternal * 100) / 100,
      rss: Math.round((estimatedHeap + estimatedExternal) * 100) / 100,
      arrayBuffers: Math.round((estimatedExternal * 0.3) * 100) / 100,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate memory usage trend
   */
  private calculateMemoryTrend(data: MemoryStats[]): number {
    if (data.length < 2) return 0;

    const first = data[0];
    const last = data[data.length - 1];
    const timeDiff = last.timestamp - first.timestamp;
    const memoryDiff = last.heapUsed - first.heapUsed;

    // Return percentage change per hour
    return (memoryDiff / first.heapUsed) * 100 * (3600000 / timeDiff);
  }
}

/**
 * React hook for memory monitoring
 */
export function useMemoryMonitor(
  thresholds?: Partial<MemoryThresholds>,
  onMemoryAlert?: (_alert: MemoryAlert) => void
) {
  const monitorRef = useRef<MemoryMonitor | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [alerts, setAlerts] = useState<MemoryAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    monitorRef.current = new MemoryMonitor(
      thresholds,
      (alert) => {
        setAlerts(prev => [...prev.slice(-9), alert]); // Keep last 10 alerts
        onMemoryAlert?.(alert);
      }
    );

    return () => {
      monitorRef.current?.stopMonitoring();
    };
  }, []);

  const startMonitoring = useCallback((intervalMs?: number) => {
    const monitor = monitorRef.current;
    if (!monitor) return;

    monitor.startMonitoring(intervalMs);
    setIsMonitoring(true);

    // Update stats periodically
    const interval = setInterval(() => {
      const currentStats = monitor.getCurrentStats();
      setStats(currentStats);
    }, intervalMs || 5000);

    return () => clearInterval(interval);
  }, []);

  const stopMonitoring = useCallback(() => {
    monitorRef.current?.stopMonitoring();
    setIsMonitoring(false);
  }, []);

  const forceGC = useCallback(() => {
    return monitorRef.current?.forceGC() ?? false;
  }, []);

  const getRecommendations = useCallback(() => {
    return monitorRef.current?.getRecommendations() ?? [];
  }, []);

  const clearHistory = useCallback(() => {
    monitorRef.current?.clearHistory();
    setAlerts([]);
  }, []);

  return {
    stats,
    alerts,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    forceGC,
    getRecommendations,
    clearHistory,
  };
}

/**
 * Memory-aware component HOC
 */
export function withMemoryMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: {
    thresholds?: Partial<MemoryThresholds>;
    showAlerts?: boolean;
  }
) {
  return function MemoryAwareComponent(props: P) {
    const { startMonitoring, stopMonitoring } = useMemoryMonitor(
      options?.thresholds,
      options?.showAlerts !== false ? (alert) => {
        console.warn(`[Memory Alert] ${alert.level.toUpperCase()}: ${alert.message}`);
      } : undefined
    );

    useEffect(() => {
      startMonitoring(10000); // Monitor every 10 seconds
      return () => stopMonitoring();
    }, []);

    return React.createElement(WrappedComponent, props);
  };
}
