/**
 * Memory-aware streaming buffer with size limits for long text content
 * Optimized for story editor multi-language support and long chat sessions
 */

import { useRef, useState, useEffect, useCallback } from 'react';

export interface MemoryBufferConfig {
  maxBufferSize: number;      // Maximum characters in buffer
  maxChunkSize: number;       // Maximum size per chunk
  memoryThreshold: number;    // Memory pressure threshold (0-1)
  enableCompression: boolean; // Enable text compression for very long content
}

const DEFAULT_CONFIG: MemoryBufferConfig = {
  maxBufferSize: 50000,       // 50K characters ~ 100KB
  maxChunkSize: 1000,         // 1K characters per chunk
  memoryThreshold: 0.8,       // 80% memory usage threshold
  enableCompression: true,
};

export class MemoryAwareStreamingBuffer {
  private buffer: string = '';
  private config: MemoryBufferConfig;
  private chunks: string[] = [];
  private isMemoryPressureMode: boolean = false;
  private onMemoryPressure?: () => void;

  constructor(config: Partial<MemoryBufferConfig> = {}, onMemoryPressure?: () => void) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onMemoryPressure = onMemoryPressure;
  }

  /**
   * Append text chunk with memory management
   */
  append(chunk: string): boolean {
    // Check if adding this chunk would exceed limits
    if (this.buffer.length + chunk.length > this.config.maxBufferSize) {
      this.handleMemoryPressure();
      
      // If still too large, truncate older content
      if (this.buffer.length + chunk.length > this.config.maxBufferSize) {
        const excess = (this.buffer.length + chunk.length) - this.config.maxBufferSize;
        this.buffer = this.buffer.slice(excess);
      }
    }

    this.buffer += chunk;
    this.chunks.push(chunk);

    // Check memory pressure
    if (this.shouldTriggerMemoryPressure()) {
      this.handleMemoryPressure();
    }

    return true;
  }

  /**
   * Get current buffer content
   */
  getContent(): string {
    return this.buffer;
  }

  /**
   * Get recent content (last N characters)
   */
  getRecentContent(charCount: number = 10000): string {
    return this.buffer.slice(-charCount);
  }

  /**
   * Clear buffer and reset state
   */
  clear(): void {
    this.buffer = '';
    this.chunks = [];
    this.isMemoryPressureMode = false;
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      length: this.buffer.length,
      chunkCount: this.chunks.length,
      isMemoryPressureMode: this.isMemoryPressureMode,
      estimatedMemoryBytes: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    // Rough estimation: 2 bytes per character (UTF-16) + overhead
    return this.buffer.length * 2 + (this.chunks.length * 100);
  }

  /**
   * Check if memory pressure should be triggered
   */
  private shouldTriggerMemoryPressure(): boolean {
    const estimatedUsage = this.estimateMemoryUsage();
    const maxMemory = 50 * 1024 * 1024; // 50MB max for text buffer
    return (estimatedUsage / maxMemory) > this.config.memoryThreshold;
  }

  /**
   * Handle memory pressure situation
   */
  private handleMemoryPressure(): void {
    if (!this.isMemoryPressureMode) {
      this.isMemoryPressureMode = true;
      this.onMemoryPressure?.();
    }

    // Keep only recent content (last 20K characters)
    if (this.buffer.length > 20000) {
      this.buffer = this.buffer.slice(-20000);
      
      // Rebuild chunks from recent content
      const recentChunks: string[] = [];
      let accumulated = '';
      
      for (const chunk of this.chunks) {
        accumulated += chunk;
        if (accumulated.length > 20000) {
          // Only keep the part that fits
          const excess = accumulated.length - 20000;
          recentChunks.push(chunk.slice(excess));
          break;
        } else {
          recentChunks.push(chunk);
        }
      }
      
      this.chunks = recentChunks;
    }
  }

  /**
   * Compress buffer for very long content storage
   */
  compress(): string {
    if (!this.config.enableCompression) return this.buffer;
    
    // Simple compression: replace repeated patterns and normalize whitespace
    return this.buffer
      .replace(/\s+/g, ' ')
      .replace(/(.)\1{3,}/g, '$1'); // Reduce repeated characters
  }

  /**
   * Get memory-efficient representation for storage
   */
  getStorageRepresentation(): { content: string; metadata: any } {
    return {
      content: this.isMemoryPressureMode ? this.compress() : this.buffer,
      metadata: {
        originalLength: this.buffer.length,
        chunkCount: this.chunks.length,
        isCompressed: this.isMemoryPressureMode,
        timestamp: Date.now(),
      },
    };
  }
}

/**
 * Hook for React components to use memory-aware streaming
 */
export function useMemoryAwareStreaming(config?: Partial<MemoryBufferConfig>) {
  const bufferRef = useRef<MemoryAwareStreamingBuffer | null>(null);
  const [content, setContent] = useState('');
  const [isMemoryPressure, setIsMemoryPressure] = useState(false);

  useEffect(() => {
    bufferRef.current = new MemoryAwareStreamingBuffer(
      config,
      () => setIsMemoryPressure(true)
    );

    return () => {
      bufferRef.current?.clear();
    };
  }, []);

  const appendChunk = useCallback((chunk: string) => {
    const buffer = bufferRef.current;
    if (!buffer) return false;

    const success = buffer.append(chunk);
    if (success) {
      setContent(buffer.getContent());
    }
    return success;
  }, []);

  const clear = useCallback(() => {
    bufferRef.current?.clear();
    setContent('');
    setIsMemoryPressure(false);
  }, []);

  const getStats = useCallback(() => {
    return bufferRef.current?.getStats() || null;
  }, []);

  return {
    content,
    appendChunk,
    clear,
    isMemoryPressure,
    stats: getStats,
  };
}
