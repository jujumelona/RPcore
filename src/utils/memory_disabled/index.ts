/**
 * Index file for memory management utilities
 * Centralized exports for all memory optimization tools
 */

import { useRef, useState, useEffect, useCallback } from 'react';

// Core memory management
export { MemoryAwareStreamingBuffer, useMemoryAwareStreaming } from './MemoryAwareStreamingBuffer';
export type { MemoryBufferConfig } from './MemoryAwareStreamingBuffer';

export { MemoryAwareImageManager, useMemoryAwareImages } from './MemoryAwareImageManager';
export type { ImageMemoryConfig } from './MemoryAwareImageManager';

export { MultiLanguageTextManager, useMultiLanguageText } from './MultiLanguageTextManager';
export type { MultiLanguageTextConfig } from './MultiLanguageTextManager';

export { MemoryMonitor, useMemoryMonitor, withMemoryMonitoring } from './MemoryMonitor';
export type { MemoryStats, MemoryThresholds, MemoryAlert } from './MemoryMonitor';

// Import classes for combined manager
import { MemoryAwareImageManager } from './MemoryAwareImageManager';
import { MultiLanguageTextManager } from './MultiLanguageTextManager';
import { MemoryMonitor } from './MemoryMonitor';
import type { ImageMemoryConfig, MultiLanguageTextConfig, MemoryThresholds, MemoryStats, MemoryAlert } from './types';

// Combined utilities
export class MemoryManager {
  private imageManager: MemoryAwareImageManager;
  private textManager: MultiLanguageTextManager;
  private monitor: MemoryMonitor;

  constructor(config?: {
    image?: Partial<ImageMemoryConfig>;
    text?: Partial<MultiLanguageTextConfig>;
    memory?: Partial<MemoryThresholds>;
  }) {
    this.imageManager = new MemoryAwareImageManager(config?.image);
    this.textManager = new MultiLanguageTextManager(config?.text);
    this.monitor = new MemoryMonitor(config?.memory);
  }

  // Image management
  addImage(id: string, uri: string, size?: number) {
    return this.imageManager.addImage(id, uri, size);
  }

  getImage(id: string) {
    return this.imageManager.getImage(id);
  }

  removeImage(id: string) {
    return this.imageManager.removeImage(id);
  }

  // Text management
  setText(id: string, text: string, translations?: Record<string, string>) {
    return this.textManager.setText(id, text, translations);
  }

  getText(id: string, language?: string) {
    return this.textManager.getText(id, language);
  }

  setTranslation(id: string, language: string, text: string) {
    return this.textManager.setTranslation(id, language, text);
  }

  // Memory monitoring
  startMonitoring(intervalMs?: number) {
    this.monitor.startMonitoring(intervalMs);
  }

  stopMonitoring() {
    this.monitor.stopMonitoring();
  }

  getStats() {
    return {
      images: this.imageManager.getStats(),
      text: this.textManager.getStats(),
      memory: this.monitor.getCurrentStats(),
      alerts: this.monitor.getAlerts(),
      recommendations: this.monitor.getRecommendations(),
    };
  }

  optimizeMemory() {
    this.imageManager.forceCleanup();
    this.textManager.optimizeMemory();
    this.monitor.forceGC();
  }

  cleanup() {
    this.imageManager.clear();
    this.textManager.clear();
    this.monitor.clearHistory();
    this.monitor.stopMonitoring();
  }
}

/**
 * React hook for comprehensive memory management
 */
export function useMemoryManager(config?: {
  image?: Partial<ImageMemoryConfig>;
  text?: Partial<MultiLanguageTextConfig>;
  memory?: Partial<MemoryThresholds>;
}) {
  const managerRef = useRef<MemoryManager | null>(null);
  const [stats, setStats] = useState(() => ({
    images: { imageCount: 0, memoryUsageMB: 0 },
    text: { textCount: 0, memoryUsageMB: 0 },
    memory: null as MemoryStats | null,
    alerts: [] as MemoryAlert[],
    recommendations: [] as string[],
  }));

  useEffect(() => {
    managerRef.current = new MemoryManager(config);
    managerRef.current.startMonitoring(10000);

    const interval = setInterval(() => {
      const manager = managerRef.current;
      if (manager) {
        setStats(manager.getStats() as any);
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      managerRef.current?.cleanup();
    };
  }, []);

  const addImage = useCallback((id: string, uri: string, size?: number) => {
    return managerRef.current?.addImage(id, uri, size) ?? false;
  }, []);

  const getImage = useCallback((id: string) => {
    return managerRef.current?.getImage(id) ?? null;
  }, []);

  const setText = useCallback((id: string, text: string, translations?: Record<string, string>) => {
    return managerRef.current?.setText(id, text, translations) ?? false;
  }, []);

  const getText = useCallback((id: string, language?: string) => {
    return managerRef.current?.getText(id, language) ?? null;
  }, []);

  const optimizeMemory = useCallback(() => {
    managerRef.current?.optimizeMemory();
  }, []);

  return {
    // Image management
    addImage,
    getImage,
    
    // Text management
    setText,
    getText,
    
    // Memory management
    optimizeMemory,
    stats,
  };
}
