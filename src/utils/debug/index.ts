// src/utils/debug/index.ts
// Entry point for development-only bug detection and profiling utilities.

import React from 'react';
import { BugDetectionErrorBoundary } from './ErrorBoundary';
import { PerformanceProfiler, PerformanceReport } from './PerformanceProfiler';

// Core bug detection utilities
export {
  memoryLeakDetector,
  performanceMonitor,
  errorReporter,
  componentLifecycleTracker,
  useBugDetection,
  setupBugDetectionTools as setupBugDetectionCore,
  teardownBugDetectionTools as teardownBugDetection } from './BugDetector';

// Error boundary helpers
export {
  BugDetectionErrorBoundary,
  withBugDetection,
  useErrorBoundary } from './ErrorBoundary';

// Performance profiling helpers
export {
  PerformanceProfiler,
  withPerformanceProfiling,
  PerformanceReport } from './PerformanceProfiler';

export const setupBugDetection = (options: {
  showPerformanceReport?: boolean;
  enableMemoryLeakDetection?: boolean;
  enablePerformanceProfiling?: boolean;
} = {}) => {
  const {
    showPerformanceReport = __DEV__,
    enableMemoryLeakDetection = __DEV__ } = options;

  if (__DEV__) {
    console.log('[BugDetection] Setting up bug detection tools with options:', options);

    // Memory leak detection starts automatically in BugDetector.ts.
    if (!enableMemoryLeakDetection) {
      const { memoryLeakDetector } = require('./BugDetector');
      memoryLeakDetector.stopTracking();
    }

    if (showPerformanceReport) {
      console.log('[BugDetection] Performance report component available');
    }
  }
};

interface AppWrapperProps {
  children: React.ReactNode;
  enableBugDetection?: boolean;
  enablePerformanceProfiling?: boolean;
  appName?: string;
}

export const AppWithBugDetection: React.FC<AppWrapperProps> = ({
  children,
  enableBugDetection = __DEV__,
  enablePerformanceProfiling = __DEV__,
  appName = 'App' }) => {
  if (!enableBugDetection && !enablePerformanceProfiling) {
    return children as React.ReactElement | null;
  }

  const content = enablePerformanceProfiling
    ? React.createElement(PerformanceProfiler, { id: appName }, children)
    : children;

  if (!enableBugDetection) {
    return content as React.ReactElement | null;
  }

  return React.createElement(
    BugDetectionErrorBoundary,
    { componentName: appName },
    content,
    __DEV__ ? React.createElement(PerformanceReport, null) : null,
  );
};

export const getDebugInfo = () => {
  if (!__DEV__) return null;

  const { memoryLeakDetector, performanceMonitor, errorReporter, componentLifecycleTracker } =
    require('./BugDetector');

  return {
    memoryLeaks: memoryLeakDetector.getStats(),
    performance: performanceMonitor.getStats(),
    errors: errorReporter.getErrorSummary(),
    mountedComponents: componentLifecycleTracker.getMountedComponents(),
    potentialLeaks: componentLifecycleTracker.findPotentialMemoryLeaks() };
};

export const clearDebugData = () => {
  if (!__DEV__) return;

  const { performanceMonitor, errorReporter } = require('./BugDetector');
  performanceMonitor.clear();
  errorReporter.clearErrors();
};

export const debugLog = {
  memory: () => {
    if (!__DEV__) return;
    const info = getDebugInfo();
    console.log('[Debug] Memory Stats:', info?.memoryLeaks);
  },
  performance: () => {
    if (!__DEV__) return;
    const info = getDebugInfo();
    console.log('[Debug] Performance Stats:', info?.performance);
  },
  errors: () => {
    if (!__DEV__) return;
    const info = getDebugInfo();
    console.log('[Debug] Error Summary:', info?.errors);
  },
  components: () => {
    if (!__DEV__) return;
    const info = getDebugInfo();
    console.log('[Debug] Mounted Components:', info?.mountedComponents);
    console.log('[Debug] Potential Leaks:', info?.potentialLeaks);
  },
  all: () => {
    if (!__DEV__) return;
    console.log('[Debug] Complete Debug Info:', getDebugInfo());
  } };
