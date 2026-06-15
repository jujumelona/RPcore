// src/utils/debug/BugDetector.ts
// [sanitized comment]
// Bug Detection and Memory Leak Detection Tools
// [sanitized comment]


// [sanitized comment]
interface WeakRefTracker {
  id: string;
  weakRef: WeakRef<any>;
  createdAt: number;
  stackTrace?: string;
}

class MemoryLeakDetector {
  private static readonly MAX_TRACKERS = 500;
  private static readonly STALE_TRACKER_MS = 10 * 60 * 1000;

  private trackers = new Map<string, WeakRefTracker>();
  private isChecking = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  startTracking(intervalMs: number = 30000): void {
    if (!__DEV__) return;
    if (this.checkInterval) return;
    if (__DEV__) console.log('[BugDetector] Memory leak detection started');
    this.checkInterval = setInterval(() => {
      this.checkForLeaks();
    }, intervalMs);
  }

  stopTracking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      if (__DEV__) console.log('[BugDetector] Memory leak detection stopped');
    }
  }

  track(obj: any, id: string, stackTrace?: string): void {
    if (!__DEV__) return;

    this.pruneTrackers(Date.now());
    this.trackers.set(id, {
      id,
      weakRef: new WeakRef(obj),
      createdAt: Date.now(),
      stackTrace });
  }

  untrack(id: string): void {
    this.trackers.delete(id);
  }

  private checkForLeaks(): void {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const now = Date.now();
      const leaks: string[] = [];

      this.trackers.forEach((tracker, id) => {
        const obj = tracker.weakRef.deref();
        if (obj === undefined) {
          // Object was garbage collected, remove tracker
          this.trackers.delete(id);
        } else {
          const age = now - tracker.createdAt;
          // If object exists for more than 5 minutes, potential leak
          if (age > 5 * 60 * 1000) {
            leaks.push(`Potential leak: ${id} (${Math.round(age / 1000)}s old)`);
            if (tracker.stackTrace) {
              leaks.push(`  Created at: ${tracker.stackTrace}`);
            }
          }
        }
      });

      if (leaks.length > 0 && __DEV__) {
        console.warn('[BugDetector] Memory leaks detected:', leaks);
      }
      this.pruneTrackers(now);
    } finally {
      this.isChecking = false;
    }
  }

  getStats(): { tracked: number; potentialLeaks: number } {
    const now = Date.now();
    let potentialLeaks = 0;
    
    this.trackers.forEach(tracker => {
      const age = now - tracker.createdAt;
      if (age > 5 * 60 * 1000) {
        potentialLeaks++;
      }
    });

    return {
      tracked: this.trackers.size,
      potentialLeaks };
  }

  private pruneTrackers(now: number): void {
    this.trackers.forEach((tracker, id) => {
      const obj = tracker.weakRef.deref();
      const age = now - tracker.createdAt;
      if (obj === undefined || age > MemoryLeakDetector.STALE_TRACKER_MS) {
        this.trackers.delete(id);
      }
    });

    const overflow = this.trackers.size - MemoryLeakDetector.MAX_TRACKERS;
    if (overflow <= 0) return;

    const oldest = Array.from(this.trackers.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, overflow);
    oldest.forEach(({ id }) => this.trackers.delete(id));
  }
}

// [sanitized comment]
interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private static readonly MAX_METRICS_PER_NAME = 200;
  private static readonly MAX_ACTIVE_MEASUREMENTS = 500;
  private static readonly STALE_MEASUREMENT_MS = 10 * 60 * 1000;

  private metrics = new Map<string, PerformanceMetric[]>();
  private activeMeasurements = new Map<string, PerformanceMetric>();

  startMeasurement(name: string, metadata?: Record<string, any>): string {
    this.pruneActiveMeasurements();

    const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const measurement: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata };

    this.activeMeasurements.set(id, measurement);
    
    if (__DEV__) console.log(`[BugDetector] Started measurement: ${name}`);
    
    return id;
  }

  endMeasurement(id: string): number | null {
    const measurement = this.activeMeasurements.get(id);
    if (!measurement) return null;

    measurement.endTime = performance.now();
    measurement.duration = measurement.endTime - measurement.startTime;

    this.activeMeasurements.delete(id);

    if (!this.metrics.has(measurement.name)) {
      this.metrics.set(measurement.name, []);
    }
    const entries = this.metrics.get(measurement.name)!;
    entries.push(measurement);
    if (entries.length > PerformanceMonitor.MAX_METRICS_PER_NAME) {
      this.metrics.set(measurement.name, entries.slice(-PerformanceMonitor.MAX_METRICS_PER_NAME));
    }

    if (__DEV__) console.log(`[BugDetector] Completed measurement: ${measurement.name} in ${measurement.duration.toFixed(2)}ms`);

    // Warn if operation takes too long
    if (measurement.duration > 1000) {
      console.warn(`[BugDetector] Slow operation detected: ${measurement.name} took ${measurement.duration.toFixed(2)}ms`);
    }

    return measurement.duration;
  }

  getAverageTime(name: string): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;

    const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    return total / metrics.length;
  }

  getStats(): Record<string, { count: number; average: number; min: number; max: number }> {
    const stats: Record<string, { count: number; average: number; min: number; max: number }> = {};

    this.metrics.forEach((metrics, name) => {
      const durations = metrics.map(m => m.duration || 0).filter(d => d > 0);
      if (durations.length === 0) return;

      stats[name] = {
        count: durations.length,
        average: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations) };
    });

    return stats;
  }

  clear(): void {
    this.metrics.clear();
    this.activeMeasurements.clear();
  }

  private pruneActiveMeasurements(): void {
    const now = performance.now();
    this.activeMeasurements.forEach((measurement, id) => {
      if (now - measurement.startTime > PerformanceMonitor.STALE_MEASUREMENT_MS) {
        this.activeMeasurements.delete(id);
      }
    });

    const overflow = this.activeMeasurements.size - PerformanceMonitor.MAX_ACTIVE_MEASUREMENTS;
    if (overflow <= 0) return;

    const oldest = Array.from(this.activeMeasurements.entries())
      .sort((a, b) => a[1].startTime - b[1].startTime)
      .slice(0, overflow);
    oldest.forEach(([id]) => this.activeMeasurements.delete(id));
  }
}

// [sanitized comment]
interface ErrorReport {
  error: Error;
  componentStack?: string;
  timestamp: number;
  userAgent?: string;
  additionalInfo?: Record<string, any>;
}

class ErrorReporter {
  private errors: ErrorReport[] = [];
  private maxErrors = 50;

  reportError(error: Error, componentStack?: string, additionalInfo?: Record<string, any>): void {
    const report: ErrorReport = {
      error,
      componentStack,
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      additionalInfo };

    this.errors.push(report);

    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    if (__DEV__) {
      console.error('[BugDetector] Error reported:', {
        message: error.message,
        stack: error.stack,
        componentStack,
        additionalInfo });
    }
  }

  getErrors(): ErrorReport[] {
    return [...this.errors];
  }

  clearErrors(): void {
    this.errors = [];
  }

  getErrorSummary(): { total: number; byMessage: Record<string, number> } {
    const byMessage: Record<string, number> = {};
    
    this.errors.forEach(report => {
      const message = report.error.message;
      byMessage[message] = (byMessage[message] || 0) + 1;
    });

    return {
      total: this.errors.length,
      byMessage };
  }
}

// [sanitized comment]
interface ComponentLifecycleEvent {
  componentName: string;
  action: 'mount' | 'unmount' | 'update';
  timestamp: number;
  props?: any;
}

class ComponentLifecycleTracker {
  private static readonly MAX_EVENTS = 2000;

  private events: ComponentLifecycleEvent[] = [];
  private mountedComponents = new Set<string>();

  private pushEvent(event: ComponentLifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > ComponentLifecycleTracker.MAX_EVENTS) {
      this.events = this.events.slice(-ComponentLifecycleTracker.MAX_EVENTS);
    }
  }

  trackMount(componentName: string, props?: any): void {
    const event: ComponentLifecycleEvent = {
      componentName,
      action: 'mount',
      timestamp: Date.now(),
      props };

    this.pushEvent(event);
    this.mountedComponents.add(componentName);

    if (__DEV__) console.log(`[BugDetector] Component mounted: ${componentName}`);
  }

  trackUnmount(componentName: string): void {
    const event: ComponentLifecycleEvent = {
      componentName,
      action: 'unmount',
      timestamp: Date.now() };

    this.pushEvent(event);
    this.mountedComponents.delete(componentName);

    if (__DEV__) console.log(`[BugDetector] Component unmounted: ${componentName}`);
  }

  trackUpdate(componentName: string): void {
    const event: ComponentLifecycleEvent = {
      componentName,
      action: 'update',
      timestamp: Date.now() };

    this.pushEvent(event);
  }

  getMountedComponents(): string[] {
    return Array.from(this.mountedComponents);
  }

  getComponentHistory(componentName: string): ComponentLifecycleEvent[] {
    return this.events.filter(event => event.componentName === componentName);
  }

  findPotentialMemoryLeaks(): string[] {
    const mountEvents = new Map<string, number>();
    const unmountEvents = new Map<string, number>();

    this.events.forEach(event => {
      if (event.action === 'mount') {
        mountEvents.set(event.componentName, event.timestamp);
      } else if (event.action === 'unmount') {
        unmountEvents.set(event.componentName, event.timestamp);
      }
    });

    const leaks: string[] = [];
    mountEvents.forEach((mountTime, componentName) => {
      const unmountTime = unmountEvents.get(componentName);
      if (!unmountTime || unmountTime < mountTime) {
        // Component was mounted but never properly unmounted
        leaks.push(componentName);
      }
    });

    return leaks;
  }
}

// [sanitized comment]
export const memoryLeakDetector = new MemoryLeakDetector();
export const performanceMonitor = new PerformanceMonitor();
export const errorReporter = new ErrorReporter();
export const componentLifecycleTracker = new ComponentLifecycleTracker();

// [sanitized comment]
export const useBugDetection = (componentName: string) => {
  const trackRef = (ref: any) => {
    if (ref && __DEV__) {
      const id = `${componentName}_${Date.now()}`;
      memoryLeakDetector.track(ref, id, new Error().stack);
      return () => memoryLeakDetector.untrack(id);
    }
  };

  const measurePerformance = (operationName: string) => {
    const measurementId = performanceMonitor.startMeasurement(`${componentName}_${operationName}`);
    return () => performanceMonitor.endMeasurement(measurementId);
  };

  return {
    trackRef,
    measurePerformance };
};

let _originalErrorHandler: any = null;
let _isInstalled = false;

export function setupBugDetectionTools(): void {
  if (!__DEV__ || _isInstalled) return;
  _isInstalled = true;

  // Start memory leak detection
  memoryLeakDetector.startTracking(30000);

  // Global error handler
  try {
     
    _originalErrorHandler = ErrorUtils.getGlobalHandler();
     
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      errorReporter.reportError(error, undefined, { isFatal });
      if (_originalErrorHandler) _originalErrorHandler(error, isFatal);
    });
  } catch {}

  console.log('[BugDetector] Bug detection tools initialized');
}

export function teardownBugDetectionTools(): void {
  if (!_isInstalled) return;
  memoryLeakDetector.stopTracking();
  performanceMonitor.clear();
  errorReporter.clearErrors();

  if (_originalErrorHandler) {
    try {
       
      ErrorUtils.setGlobalHandler(_originalErrorHandler);
    } catch {}
    _originalErrorHandler = null;
  }
  _isInstalled = false;
  console.log('[BugDetector] Bug detection tools stopped');
}

if (__DEV__) {
  setupBugDetectionTools();
}
