import RNFS from '../../utils/fileSystemCompat';
import { SERVER_BASE } from '../../config/ApiConfig';
import { appStorage } from '../../utils/storage';
import { logger } from '../../utils/logger';
import modelDownloader from './ModelDownloader';
import type { LanguageCode } from '../../i18n/languages';
import {
  getStoryStylePresetLabel,
  normalizeStoryStylePreset,
  type StoryStylePresetId,
} from '../../utils/storyStylePresets';

const ADAPTER_LANGUAGES = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'ru',
  'ko',
  'ja',
  'zh-CN',
  'zh-TW',
  'th',
  'tr',
  'hi',
  'ar',
] as const satisfies readonly LanguageCode[];

const STYLE_PRESETS = ['classic', 'modern'] as const satisfies readonly StoryStylePresetId[];
const MANIFEST_CACHE_PREFIX = '@story_lora_manifest_v1:';
const MANIFEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ADAPTER_DOWNLOAD_TIMEOUT_MS = 90_000;
const ADAPTER_MIN_BYTES = 1024;
const ENGINE_SUPPORT_READY = false;

export type StoryAdapterLanguageCode = typeof ADAPTER_LANGUAGES[number];

export interface StoryLoraAdapterManifestEntry {
  id: string;
  modelId: string;
  language: StoryAdapterLanguageCode;
  storyStylePreset: StoryStylePresetId;
  displayLabel: string;
  fileName: string;
  r2Key: string;
  downloadUrl: string;
  engineSupportReady: boolean;
}

export interface StoryLoraAdapterManifest {
  manifestVersion: string;
  modelId: string;
  language: StoryAdapterLanguageCode;
  adapters: StoryLoraAdapterManifestEntry[];
  selectedAdapterId?: string | null;
  engineSupportReady: boolean;
  fetchedAt: number;
}

export interface StoryLoraAdapterSelection {
  storyId?: string;
  modelId: string;
  language: StoryAdapterLanguageCode;
  storyStylePreset: StoryStylePresetId;
  adapterId: string;
  displayLabel: string;
  localPath: string;
  downloadUrl: string;
  r2Key: string;
  engineSupportReady: boolean;
  source: 'manifest' | 'fallback';
  pairedAdapterIds: string[];
}

interface ManifestCacheRecord {
  expiresAt: number;
  manifest: StoryLoraAdapterManifest;
}

interface EnsureLanguageAdapterPackOptions {
  modelId: string;
  language: string | null | undefined;
  serverUrl?: string;
  bestEffort?: boolean;
  manifest?: StoryLoraAdapterManifest | null;
}

interface ResolveStoryAdapterSelectionOptions {
  story: unknown;
  modelId: string;
  appLanguage?: string | null;
  storyId?: string;
  serverUrl?: string;
}

function sanitizeModelId(modelId: string): string {
  return String(modelId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
}

function sanitizeFileName(fileName: string): string {
  const trimmed = String(fileName || '').trim();
  if (!trimmed) return 'adapter.bin';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildManifestCacheKey(modelId: string, language: StoryAdapterLanguageCode): string {
  return `${sanitizeModelId(modelId)}::${language}`;
}

function buildManifestCacheStorageKey(modelId: string, language: StoryAdapterLanguageCode): string {
  return `${MANIFEST_CACHE_PREFIX}${buildManifestCacheKey(modelId, language)}`;
}

function buildAdapterDirectory(modelId: string, language: StoryAdapterLanguageCode): string {
  try {
    return `${modelDownloader.getModelDir(modelId)}/lora_adapters/${language}`;
  } catch {
    const safeModelId = sanitizeModelId(modelId);
    return `${RNFS.DocumentDirectoryPath}/models/${safeModelId}/lora_adapters/${language}`;
  }
}

function normalizeBaseUrl(serverUrl?: string | null): string {
  const trimmed = typeof serverUrl === 'string' && serverUrl.trim().length > 0
    ? serverUrl.trim()
    : SERVER_BASE;
  return trimmed.replace(/\/$/, '');
}

function buildAdapterR2Key(
  modelId: string,
  language: StoryAdapterLanguageCode,
  storyStylePreset: StoryStylePresetId,
): string {
  return `beta/lora_adapters/${sanitizeModelId(modelId)}/${language}/${storyStylePreset}.adapter.bin`;
}

function buildFallbackManifest(
  modelId: string,
  language: StoryAdapterLanguageCode,
  serverUrl?: string,
): StoryLoraAdapterManifest {
  const baseUrl = normalizeBaseUrl(serverUrl);
  const safeModelId = sanitizeModelId(modelId);
  const adapters = STYLE_PRESETS.map((storyStylePreset) => {
    const r2Key = buildAdapterR2Key(safeModelId, language, storyStylePreset);
    return {
      id: `${safeModelId}__${language}__${storyStylePreset}`,
      modelId: safeModelId,
      language,
      storyStylePreset,
      displayLabel: getStoryStylePresetLabel(storyStylePreset) || storyStylePreset,
      fileName: `${storyStylePreset}.adapter.bin`,
      r2Key,
      downloadUrl: `${baseUrl}/r2/download/${r2Key}`,
      engineSupportReady: ENGINE_SUPPORT_READY,
    } satisfies StoryLoraAdapterManifestEntry;
  });

  return {
    manifestVersion: 'fallback-v1',
    modelId: safeModelId,
    language,
    adapters,
    selectedAdapterId: null,
    engineSupportReady: ENGINE_SUPPORT_READY,
    fetchedAt: Date.now(),
  };
}

function toAdapterLanguageCode(value?: string | null): StoryAdapterLanguageCode {
  if (typeof value !== 'string') return 'en';
  const normalized = value.trim().replace(/_/g, '-');
  if (!normalized) return 'en';
  const lower = normalized.toLowerCase();

  if (lower.startsWith('zh')) {
    if (lower.includes('hant') || lower.includes('tw') || lower.includes('hk') || lower.includes('mo')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  const direct = ADAPTER_LANGUAGES.find(language => language.toLowerCase() === lower);
  if (direct) return direct;

  const base = lower.slice(0, 2);
  return ADAPTER_LANGUAGES.find(language => language.toLowerCase() === base) ?? 'en';
}

function getStoryStylePresetFromStory(story: unknown): StoryStylePresetId | '' {
  const storyRecord = story && typeof story === 'object'
    ? story as Record<string, unknown>
    : {};
  const configRecord = storyRecord.story_config && typeof storyRecord.story_config === 'object'
    ? storyRecord.story_config as Record<string, unknown>
    : storyRecord;
  return normalizeStoryStylePreset(
    String(
      configRecord.storyStylePreset ??
      configRecord.story_style_preset ??
      storyRecord.storyStylePreset ??
      storyRecord.story_style_preset ??
      '',
    ),
  );
}

function isManifestEntry(value: unknown): value is StoryLoraAdapterManifestEntry {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.modelId === 'string' &&
    typeof record.language === 'string' &&
    typeof record.storyStylePreset === 'string' &&
    typeof record.fileName === 'string' &&
    typeof record.r2Key === 'string' &&
    typeof record.downloadUrl === 'string'
  );
}

function normalizeManifestEntry(
  value: unknown,
  fallback: StoryLoraAdapterManifestEntry,
): StoryLoraAdapterManifestEntry {
  if (!isManifestEntry(value)) return fallback;
  const record = value as unknown as Record<string, unknown>;
  const language = toAdapterLanguageCode(String(record.language ?? fallback.language));
  const storyStylePreset = normalizeStoryStylePreset(String(record.storyStylePreset ?? fallback.storyStylePreset))
    || fallback.storyStylePreset;
  return {
    id: String(record.id ?? fallback.id).trim() || fallback.id,
    modelId: sanitizeModelId(String(record.modelId ?? fallback.modelId)),
    language,
    storyStylePreset,
    displayLabel: String(record.displayLabel ?? fallback.displayLabel).trim() || fallback.displayLabel,
    fileName: sanitizeFileName(String(record.fileName ?? fallback.fileName)),
    r2Key: String(record.r2Key ?? fallback.r2Key).trim() || fallback.r2Key,
    downloadUrl: String(record.downloadUrl ?? fallback.downloadUrl).trim() || fallback.downloadUrl,
    engineSupportReady: Boolean(record.engineSupportReady ?? fallback.engineSupportReady),
  };
}

export function normalizeStoryAdapterLanguageCode(value?: string | null): StoryAdapterLanguageCode {
  return toAdapterLanguageCode(value);
}

export function isStoryLoraAdapterEngineSupported(): boolean {
  return ENGINE_SUPPORT_READY;
}

class StoryAdapterManager {
  private manifestCache = new Map<string, ManifestCacheRecord>();
  private activeDownloads = new Map<string, Promise<string>>();

  private readStoredManifest(
    modelId: string,
    language: StoryAdapterLanguageCode,
  ): ManifestCacheRecord | null {
    try {
      const raw = appStorage.getString(buildManifestCacheStorageKey(modelId, language));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ManifestCacheRecord | null;
      if (!parsed?.manifest || typeof parsed.expiresAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private cacheManifest(manifest: StoryLoraAdapterManifest): StoryLoraAdapterManifest {
    const cacheKey = buildManifestCacheKey(manifest.modelId, manifest.language);
    const record: ManifestCacheRecord = {
      expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS,
      manifest,
    };
    this.manifestCache.set(cacheKey, record);
    try {
      appStorage.set(
        buildManifestCacheStorageKey(manifest.modelId, manifest.language),
        JSON.stringify(record),
      );
    } catch {}
    return manifest;
  }

  getCachedManifest(
    modelId: string,
    language: string | null | undefined,
  ): StoryLoraAdapterManifest | null {
    const normalizedLanguage = toAdapterLanguageCode(language);
    const cacheKey = buildManifestCacheKey(modelId, normalizedLanguage);
    const now = Date.now();
    const memory = this.manifestCache.get(cacheKey);
    if (memory && memory.expiresAt > now) {
      return memory.manifest;
    }

    const stored = this.readStoredManifest(modelId, normalizedLanguage);
    if (stored && stored.expiresAt > now) {
      this.manifestCache.set(cacheKey, stored);
      return stored.manifest;
    }

    return null;
  }

  async fetchManifest(
    modelId: string,
    language: string | null | undefined,
    serverUrl?: string,
    storyStylePreset?: StoryStylePresetId | '',
    forceRefresh = false,
  ): Promise<StoryLoraAdapterManifest> {
    const normalizedLanguage = toAdapterLanguageCode(language);
    const cached = !forceRefresh ? this.getCachedManifest(modelId, normalizedLanguage) : null;
    if (cached) return cached;

    const baseUrl = normalizeBaseUrl(serverUrl);
    const fallback = buildFallbackManifest(modelId, normalizedLanguage, baseUrl);
    const params = new URLSearchParams({
      modelId: sanitizeModelId(modelId),
      lang: normalizedLanguage,
    });
    if (storyStylePreset) params.set('storyStylePreset', storyStylePreset);

    try {
      const response = await fetch(`${baseUrl}/api/lora-adapters/manifest?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`manifest HTTP ${response.status}`);
      }

      const payload = await response.json() as Record<string, unknown>;
      const rawAdapters = Array.isArray(payload.adapters) ? payload.adapters : [];
      const adapters = STYLE_PRESETS.map((preset, index) => normalizeManifestEntry(
        rawAdapters[index],
        fallback.adapters[index],
      ));
      const manifest: StoryLoraAdapterManifest = {
        manifestVersion: typeof payload.manifestVersion === 'string'
          ? payload.manifestVersion
          : fallback.manifestVersion,
        modelId: sanitizeModelId(String(payload.modelId ?? fallback.modelId)),
        language: toAdapterLanguageCode(String(payload.language ?? normalizedLanguage)),
        adapters,
        selectedAdapterId: typeof payload.selectedAdapterId === 'string'
          ? payload.selectedAdapterId
          : fallback.selectedAdapterId,
        engineSupportReady: Boolean(payload.engineSupportReady ?? fallback.engineSupportReady),
        fetchedAt: Date.now(),
      };
      return this.cacheManifest(manifest);
    } catch (error) {
      logger.warn('[StoryAdapterManager] manifest fetch failed, using fallback:', error);
      return this.cacheManifest(fallback);
    }
  }

  getAdapterDirectory(modelId: string, language: string | null | undefined): string {
    return buildAdapterDirectory(modelId, toAdapterLanguageCode(language));
  }

  getAdapterPath(entry: Pick<StoryLoraAdapterManifestEntry, 'modelId' | 'language' | 'fileName'>): string {
    return `${this.getAdapterDirectory(entry.modelId, entry.language)}/${sanitizeFileName(entry.fileName)}`;
  }

  async isAdapterDownloaded(entry: StoryLoraAdapterManifestEntry): Promise<boolean> {
    return RNFS.exists(this.getAdapterPath(entry)).catch(() => false);
  }

  async downloadAdapter(entry: StoryLoraAdapterManifestEntry): Promise<string> {
    const existing = this.activeDownloads.get(entry.id);
    if (existing) return existing;

    const task = (async () => {
      const destinationDir = this.getAdapterDirectory(entry.modelId, entry.language);
      const destinationPath = this.getAdapterPath(entry);
      await RNFS.mkdir(destinationDir).catch(() => {});

      const alreadyExists = await RNFS.exists(destinationPath).catch(() => false);
      if (alreadyExists) {
        return destinationPath;
      }

      const download = RNFS.downloadFile({
        fromUrl: entry.downloadUrl,
        toFile: destinationPath,
        background: true,
      });

      const timeout = setTimeout(() => {
        try {
          RNFS.stopDownload(download.jobId);
        } catch {}
      }, ADAPTER_DOWNLOAD_TIMEOUT_MS);

      try {
        const result = await download.promise;
        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new Error(`adapter download HTTP ${result.statusCode}`);
        }

        const statResult = await RNFS.stat(destinationPath).catch(() => null);
        const bytes = Number(statResult?.size ?? result.bytesWritten ?? 0);
        if (!Number.isFinite(bytes) || bytes < ADAPTER_MIN_BYTES) {
          throw new Error(`adapter downloaded with invalid size: ${bytes}`);
        }

        return destinationPath;
      } catch (error) {
        await RNFS.unlink(destinationPath).catch(() => {});
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })();

    this.activeDownloads.set(entry.id, task);
    return task.finally(() => {
      if (this.activeDownloads.get(entry.id) === task) {
        this.activeDownloads.delete(entry.id);
      }
    });
  }

  async ensureLanguageAdapterPack(
    options: EnsureLanguageAdapterPackOptions,
  ): Promise<StoryLoraAdapterManifest> {
    const normalizedLanguage = toAdapterLanguageCode(options.language);
    const manifest = options.manifest
      ?? await this.fetchManifest(options.modelId, normalizedLanguage, options.serverUrl);

    if (options.bestEffort) {
      await Promise.all(
        manifest.adapters.map(async (entry) => {
          try {
            await this.downloadAdapter(entry);
          } catch (error) {
            logger.warn('[StoryAdapterManager] adapter prefetch skipped:', entry.id, error);
          }
        }),
      );
      return manifest;
    }

    await Promise.all(manifest.adapters.map((entry) => this.downloadAdapter(entry)));
    return manifest;
  }

  resolveStoryAdapterSelection(
    options: ResolveStoryAdapterSelectionOptions,
  ): StoryLoraAdapterSelection | null {
    const storyStylePreset = getStoryStylePresetFromStory(options.story);
    if (!storyStylePreset) return null;

    const language = toAdapterLanguageCode(options.appLanguage);
    const manifest = this.getCachedManifest(options.modelId, language)
      ?? buildFallbackManifest(options.modelId, language, options.serverUrl);
    const matched = manifest.adapters.find((entry) => entry.storyStylePreset === storyStylePreset)
      ?? manifest.adapters[0];
    if (!matched) return null;

    return {
      storyId: options.storyId,
      modelId: matched.modelId,
      language: matched.language,
      storyStylePreset,
      adapterId: matched.id,
      displayLabel: matched.displayLabel,
      localPath: this.getAdapterPath(matched),
      downloadUrl: matched.downloadUrl,
      r2Key: matched.r2Key,
      engineSupportReady: Boolean(manifest.engineSupportReady && matched.engineSupportReady),
      source: this.getCachedManifest(options.modelId, language) ? 'manifest' : 'fallback',
      pairedAdapterIds: manifest.adapters.map((entry) => entry.id),
    };
  }
}

export const storyAdapterManager = new StoryAdapterManager();
