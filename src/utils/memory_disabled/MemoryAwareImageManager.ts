/**
 * Memory-aware image management for large chat arrays
 * Prevents memory overflow in long chat sessions with many images
 */

import { useRef, useState, useEffect, useCallback } from 'react';

export interface ImageMemoryConfig {
  maxCachedImages: number;     // Maximum images to keep in memory
  maxImageMemoryMB: number;    // Maximum memory for images in MB
  enableLazyLoading: boolean;  // Enable lazy loading for older images
  compressionQuality: number;  // JPEG compression quality (0-1)
  thumbnailSize: number;       // Thumbnail size for old images
}

const DEFAULT_IMAGE_CONFIG: ImageMemoryConfig = {
  maxCachedImages: 50,         // Keep 50 most recent images
  maxImageMemoryMB: 100,       // 100MB max for images
  enableLazyLoading: true,
  compressionQuality: 0.8,
  thumbnailSize: 200,
};

interface CachedImage {
  id: string;
  uri: string;
  timestamp: number;
  size: number;               // Estimated memory size in bytes
  isThumbnail: boolean;
  accessCount: number;
  lastAccessed: number;
}

export class MemoryAwareImageManager {
  private config: ImageMemoryConfig;
  private cache: Map<string, CachedImage> = new Map();
  private currentMemoryUsage: number = 0;
  private onMemoryPressure?: () => void;

  constructor(config: Partial<ImageMemoryConfig> = {}, onMemoryPressure?: () => void) {
    this.config = { ...DEFAULT_IMAGE_CONFIG, ...config };
    this.onMemoryPressure = onMemoryPressure;
  }

  /**
   * Add image to cache with memory management
   */
  addImage(id: string, uri: string, estimatedSize?: number): boolean {
    // Check if image already exists
    if (this.cache.has(id)) {
      const existing = this.cache.get(id)!;
      existing.accessCount++;
      existing.lastAccessed = Date.now();
      return true;
    }

    // Estimate size if not provided
    const size = estimatedSize || this.estimateImageSize(uri);
    
    // Check memory limits
    if (this.shouldEvictForNewImage(size)) {
      this.evictOldImages(size);
    }

    // Still too large? Don't cache
    if (this.currentMemoryUsage + size > this.config.maxImageMemoryMB * 1024 * 1024) {
      this.onMemoryPressure?.();
      return false;
    }

    const cachedImage: CachedImage = {
      id,
      uri,
      timestamp: Date.now(),
      size,
      isThumbnail: false,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(id, cachedImage);
    this.currentMemoryUsage += size;
    return true;
  }

  /**
   * Get image from cache
   */
  getImage(id: string): string | null {
    const cached = this.cache.get(id);
    if (!cached) return null;

    cached.accessCount++;
    cached.lastAccessed = Date.now();

    // Convert to thumbnail if old and rarely accessed
    if (this.shouldConvertToThumbnail(cached)) {
      cached.isThumbnail = true;
      cached.size = this.estimateThumbnailSize();
      // In a real implementation, you'd generate actual thumbnail here
    }

    return cached.uri;
  }

  /**
   * Remove image from cache
   */
  removeImage(id: string): boolean {
    const cached = this.cache.get(id);
    if (!cached) return false;

    this.currentMemoryUsage -= cached.size;
    this.cache.delete(id);
    return true;
  }

  /**
   * Clear all cached images
   */
  clear(): void {
    this.cache.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      imageCount: this.cache.size,
      memoryUsageMB: this.currentMemoryUsage / (1024 * 1024),
      maxMemoryMB: this.config.maxImageMemoryMB,
      memoryUtilization: this.currentMemoryUsage / (this.config.maxImageMemoryMB * 1024 * 1024),
      thumbnailCount: Array.from(this.cache.values()).filter(img => img.isThumbnail).length,
    };
  }

  /**
   * Force cleanup of old images
   */
  forceCleanup(): void {
    const targetSize = this.config.maxImageMemoryMB * 1024 * 1024 * 0.7; // 70% of max
    while (this.currentMemoryUsage > targetSize && this.cache.size > 0) {
      this.evictOldestImage();
    }
  }

  /**
   * Estimate image size based on URI and typical dimensions
   */
  private estimateImageSize(uri: string): number {
    // Rough estimation based on typical chat image sizes
    if (uri.includes('thumbnail') || uri.includes('thumb')) {
      return 50 * 1024; // 50KB for thumbnails
    }
    if (uri.includes('compressed') || uri.includes('webp')) {
      return 200 * 1024; // 200KB for compressed images
    }
    return 500 * 1024; // 500KB for regular images
  }

  /**
   * Estimate thumbnail size
   */
  private estimateThumbnailSize(): number {
    return 30 * 1024; // 30KB for thumbnails
  }

  /**
   * Check if we should evict images for new one
   */
  private shouldEvictForNewImage(newImageSize: number): boolean {
    return (
      this.cache.size >= this.config.maxCachedImages ||
      this.currentMemoryUsage + newImageSize > this.config.maxImageMemoryMB * 1024 * 1024
    );
  }

  /**
   * Check if image should be converted to thumbnail
   */
  private shouldConvertToThumbnail(image: CachedImage): boolean {
    const age = Date.now() - image.timestamp;
    const daysOld = age / (1000 * 60 * 60 * 24);
    
    return (
      daysOld > 7 && // Older than 7 days
      image.accessCount < 3 && // Accessed less than 3 times
      !image.isThumbnail
    );
  }

  /**
   * Evict old images based on LRU and access patterns
   */
  private evictOldImages(requiredSize: number): void {
    const images = Array.from(this.cache.values());
    
    // Sort by priority: least recently used + least accessed
    images.sort((a, b) => {
      const scoreA = a.lastAccessed * a.accessCount;
      const scoreB = b.lastAccessed * b.accessCount;
      return scoreA - scoreB;
    });

    let freedSpace = 0;
    for (const image of images) {
      this.removeImage(image.id);
      freedSpace += image.size;
      
      if (freedSpace >= requiredSize) break;
    }
  }

  /**
   * Evict single oldest image
   */
  private evictOldestImage(): void {
    const images = Array.from(this.cache.values());
    if (images.length === 0) return;

    const oldest = images.reduce((prev, current) => 
      prev.lastAccessed < current.lastAccessed ? prev : current
    );

    this.removeImage(oldest.id);
  }
}

/**
 * React hook for memory-aware image management
 */
export function useMemoryAwareImages(config?: Partial<ImageMemoryConfig>) {
  const managerRef = useRef<MemoryAwareImageManager | null>(null);
  const [stats, setStats] = useState(() => ({ imageCount: 0, memoryUsageMB: 0 }));

  useEffect(() => {
    managerRef.current = new MemoryAwareImageManager(
      config,
      () => {
        // Handle memory pressure
        console.warn('[MemoryAwareImages] Memory pressure detected');
      }
    );

    const interval = setInterval(() => {
      const manager = managerRef.current;
      if (manager) {
        setStats(manager.getStats());
      }
    }, 5000); // Update stats every 5 seconds

    return () => {
      clearInterval(interval);
      managerRef.current?.clear();
    };
  }, []);

  const addImage = useCallback((id: string, uri: string, size?: number) => {
    return managerRef.current?.addImage(id, uri, size) ?? false;
  }, []);

  const getImage = useCallback((id: string) => {
    return managerRef.current?.getImage(id) ?? null;
  }, []);

  const removeImage = useCallback((id: string) => {
    return managerRef.current?.removeImage(id) ?? false;
  }, []);

  const forceCleanup = useCallback(() => {
    managerRef.current?.forceCleanup();
  }, []);

  return {
    addImage,
    getImage,
    removeImage,
    forceCleanup,
    stats,
  };
}
