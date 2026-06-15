/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Multi-language text optimization for story editor
 * Efficiently handles large translation data and long text content
 */

import { useRef, useState, useEffect, useCallback } from 'react';

export interface MultiLanguageTextConfig {
  maxTextLength: number;        // Maximum characters per text field
  maxTranslationHistory: number; // Maximum translation versions to keep
  enableCompression: boolean;   // Enable text compression for storage
  compressionThreshold: number; // Minimum length to compress
  cacheTranslations: boolean;   // Cache frequently used translations
}

const DEFAULT_ML_CONFIG: MultiLanguageTextConfig = {
  maxTextLength: 10000,         // 10K characters per field
  maxTranslationHistory: 5,     // Keep 5 versions of translations
  enableCompression: true,
  compressionThreshold: 1000,   // Compress texts longer than 1K chars
  cacheTranslations: true,
};

interface TranslationEntry {
  language: string;
  text: string;
  timestamp: number;
  isCompressed: boolean;
  accessCount: number;
}

interface TextEntry {
  id: string;
  originalText: string;
  translations: Map<string, TranslationEntry>;
  lastModified: number;
  accessCount: number;
}

// Interface definition for MultiLanguageTextManager
export interface IMultiLanguageTextManager {
  setText(_id: string, _originalText: string, _translations?: Record<string, string>): boolean;
  getText(_id: string, _language?: string): string | null;
  setTranslation(_id: string, _language: string, _text: string): boolean;
  removeText(_id: string): boolean;
  clear(): void;
  getAvailableLanguages(_id: string): string[];
  getStats(): any;
  optimizeMemory(): void;
  exportForStorage(): Record<string, any>;
  importFromStorage(_data: Record<string, any>): boolean;
}

export class MultiLanguageTextManager implements IMultiLanguageTextManager {
  private config: MultiLanguageTextConfig;
  private texts: Map<string, TextEntry> = new Map();
  private translationCache: Map<string, string> = new Map();
  private totalMemoryUsage: number = 0;

  constructor(config: Partial<MultiLanguageTextConfig> = {}) {
    this.config = { ...DEFAULT_ML_CONFIG, ...config };
  }

  /**
   * Add or update text with translations
   */
  setText(id: string, originalText: string, translations?: Record<string, string>): boolean {
    // Validate text length
    if (originalText.length > this.config.maxTextLength) {
      console.warn(`[MultiLanguageTextManager] Text too long: ${originalText.length} > ${this.config.maxTextLength}`);
      originalText = originalText.slice(0, this.config.maxTextLength);
    }

    const existing = this.texts.get(id);
    const compressed = this.shouldCompress(originalText) ? this.compressText(originalText) : originalText;

    const textEntry: TextEntry = {
      id,
      originalText: compressed,
      translations: existing?.translations || new Map(),
      lastModified: Date.now(),
      accessCount: existing?.accessCount || 0,
    };

    // Add translations
    if (translations) {
      Object.entries(translations).forEach(([lang, text]) => {
        if (text.length > this.config.maxTextLength) {
          console.warn(`[MultiLanguageTextManager] Translation too long for ${lang}: ${text.length}`);
          text = text.slice(0, this.config.maxTextLength);
        }

        const translationText = this.shouldCompress(text) ? this.compressText(text) : text;
        
        textEntry.translations.set(lang, {
          language: lang,
          text: translationText,
          timestamp: Date.now(),
          isCompressed: this.shouldCompress(text),
          accessCount: 0,
        });
      });
    }

    this.texts.set(id, textEntry);
    this.updateMemoryUsage();
    return true;
  }

  /**
   * Get text in specified language
   */
  getText(id: string, language: string = 'en'): string | null {
    const entry = this.texts.get(id);
    if (!entry) return null;

    entry.accessCount++;
    entry.lastModified = Date.now();

    // Try to get translation
    const translation = entry.translations.get(language);
    if (translation) {
      translation.accessCount++;
      const text = translation.isCompressed ? this.decompressText(translation.text) : translation.text;
      
      // Cache frequently accessed translations
      if (this.config.cacheTranslations && translation.accessCount > 2) {
        this.translationCache.set(`${id}:${language}`, text);
      }
      
      return text;
    }

    // Return original text if no translation
    return entry.originalText.includes('COMPRESSED:') 
      ? this.decompressText(entry.originalText) 
      : entry.originalText;
  }

  /**
   * Add or update translation for existing text
   */
  setTranslation(id: string, language: string, text: string): boolean {
    const entry = this.texts.get(id);
    if (!entry) return false;

    if (text.length > this.config.maxTextLength) {
      console.warn(`[MultiLanguageTextManager] Translation too long: ${text.length}`);
      text = text.slice(0, this.config.maxTextLength);
    }

    const compressed = this.shouldCompress(text) ? this.compressText(text) : text;
    
    entry.translations.set(language, {
      language,
      text: compressed,
      timestamp: Date.now(),
      isCompressed: this.shouldCompress(text),
      accessCount: 0,
    });

    entry.lastModified = Date.now();
    this.updateMemoryUsage();
    return true;
  }

  /**
   * Remove text and all its translations
   */
  removeText(id: string): boolean {
    const deleted = this.texts.delete(id);
    if (deleted) {
      this.updateMemoryUsage();
      // Clear cache entries for this text
      for (const key of this.translationCache.keys()) {
        if (key.startsWith(`${id}:`)) {
          this.translationCache.delete(key);
        }
      }
    }
    return deleted;
  }

  /**
   * Clear all texts and translations
   */
  clear(): void {
    this.texts.clear();
    this.translationCache.clear();
    this.totalMemoryUsage = 0;
  }

  /**
   * Get all available languages for a text
   */
  getAvailableLanguages(id: string): string[] {
    const entry = this.texts.get(id);
    if (!entry) return [];
    
    return Array.from(entry.translations.keys());
  }

  /**
   * Get memory usage statistics
   */
  getStats() {
    const totalTranslations = Array.from(this.texts.values())
      .reduce((sum, entry) => sum + entry.translations.size, 0);

    return {
      textCount: this.texts.size,
      totalTranslations,
      memoryUsageMB: this.totalMemoryUsage / (1024 * 1024),
      cacheSize: this.translationCache.size,
      averageTextLength: this.getAverageTextLength(),
    };
  }

  /**
   * Optimize memory by removing old/unused translations
   */
  optimizeMemory(): void {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const [_id, entry] of this.texts.entries()) {
      // Remove old translations beyond history limit
      const translations = Array.from(entry.translations.entries());
      if (translations.length > this.config.maxTranslationHistory) {
        translations.sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        const toRemove = translations.slice(this.config.maxTranslationHistory);
        toRemove.forEach(([lang]) => {
          entry.translations.delete(lang);
        });
      }

      // Remove very old, unused translations
      for (const [lang, translation] of entry.translations.entries()) {
        if (
          now - translation.timestamp > maxAge && 
          translation.accessCount === 0
        ) {
          entry.translations.delete(lang);
        }
      }
    }

    // Clear old cache entries
    if (this.translationCache.size > 1000) {
      const entries = Array.from(this.translationCache.entries());
      this.translationCache.clear();
      
      // Keep most recently used 500 entries
      entries.slice(-500).forEach(([key, value]) => {
        this.translationCache.set(key, value);
      });
    }

    this.updateMemoryUsage();
  }

  /**
   * Export data for storage with compression
   */
  exportForStorage(): Record<string, any> {
    const data: Record<string, any> = {};
    
    for (const [id, entry] of this.texts.entries()) {
      data[id] = {
        originalText: entry.originalText,
        translations: Object.fromEntries(entry.translations),
        lastModified: entry.lastModified,
        accessCount: entry.accessCount,
      };
    }

    return {
      texts: data,
      metadata: {
        version: '1.0',
        exportedAt: Date.now(),
        totalEntries: this.texts.size,
      },
    };
  }

  /**
   * Import data from storage
   */
  importFromStorage(data: Record<string, any>): boolean {
    try {
      if (!data.texts || typeof data.texts !== 'object') return false;

      for (const [id, entryData] of Object.entries(data.texts)) {
        const entry = entryData as any;
        const textEntry: TextEntry = {
          id,
          originalText: entry.originalText || '',
          translations: new Map(),
          lastModified: entry.lastModified || Date.now(),
          accessCount: entry.accessCount || 0,
        };

        if (entry.translations) {
          Object.entries(entry.translations).forEach(([lang, transData]) => {
            const translation = transData as any;
            textEntry.translations.set(lang, translation);
          });
        }

        this.texts.set(id, textEntry);
      }

      this.updateMemoryUsage();
      return true;
    } catch (error) {
      console.error('[MultiLanguageTextManager] Import failed:', error);
      return false;
    }
  }

  /**
   * Check if text should be compressed
   */
  private shouldCompress(text: string): boolean {
    return this.config.enableCompression && text.length > this.config.compressionThreshold;
  }

  /**
   * Simple text compression (placeholder - use proper compression in production)
   */
  private compressText(text: string): string {
    // Simple compression: replace common patterns and encode
    const compressed = text
      .replace(/\s+/g, ' ')
      .replace(/(.)\1{2,}/g, '$1')
      .replace(/the/g, 'th')
      .replace(/and/g, '&')
      .replace(/tion/g, 'tn');
    
    return `COMPRESSED:${btoa(compressed)}`;
  }

  /**
   * Decompress text
   */
  private decompressText(compressed: string): string {
    if (!compressed.startsWith('COMPRESSED:')) return compressed;
    
    try {
      const encoded = compressed.slice(11);
      const decompressed = atob(encoded)
        .replace(/th/g, 'the')
        .replace(/&/g, 'and')
        .replace(/tn/g, 'tion');
      
      return decompressed;
    } catch (error) {
      console.error('[MultiLanguageTextManager] Decompression failed:', error);
      return compressed;
    }
  }

  /**
   * Update memory usage calculation
   */
  private updateMemoryUsage(): void {
    let totalSize = 0;
    
    for (const entry of this.texts.values()) {
      totalSize += entry.originalText.length * 2; // UTF-16
      
      for (const translation of entry.translations.values()) {
        totalSize += translation.text.length * 2;
      }
    }

    this.totalMemoryUsage = totalSize;
  }

  /**
   * Get average text length
   */
  private getAverageTextLength(): number {
    if (this.texts.size === 0) return 0;
    
    const totalLength = Array.from(this.texts.values())
      .reduce((sum, entry) => sum + entry.originalText.length, 0);
    
    return Math.round(totalLength / this.texts.size);
  }
}

/**
 * React hook for multi-language text management
 */
export function useMultiLanguageText(config?: Partial<MultiLanguageTextConfig>) {
  const managerRef = useRef<MultiLanguageTextManager | null>(null);
  const [stats, setStats] = useState(() => ({ textCount: 0, memoryUsageMB: 0 }));

  useEffect(() => {
    managerRef.current = new MultiLanguageTextManager(config);

    const interval = setInterval(() => {
      const manager = managerRef.current;
      if (manager) {
        setStats(manager.getStats());
        
        // Optimize memory periodically
        if (Math.random() < 0.1) { // 10% chance every interval
          manager.optimizeMemory();
        }
      }
    }, 10000); // Update every 10 seconds

    return () => {
      clearInterval(interval);
    };
  }, []);

  const setText = useCallback((id: string, originalText: string, translations?: Record<string, string>) => {
    return managerRef.current?.setText(id, originalText, translations) ?? false;
  }, []);

  const getText = useCallback((id: string, language?: string) => {
    return managerRef.current?.getText(id, language) ?? null;
  }, []);

  const setTranslation = useCallback((id: string, language: string, text: string) => {
    return managerRef.current?.setTranslation(id, language, text) ?? false;
  }, []);

  const removeText = useCallback((id: string) => {
    return managerRef.current?.removeText(id) ?? false;
  }, []);

  const getAvailableLanguages = useCallback((id: string) => {
    return managerRef.current?.getAvailableLanguages(id) ?? [];
  }, []);

  const optimizeMemory = useCallback(() => {
    managerRef.current?.optimizeMemory();
  }, []);

  return {
    setText,
    getText,
    setTranslation,
    removeText,
    getAvailableLanguages,
    optimizeMemory,
    stats,
  };
}
