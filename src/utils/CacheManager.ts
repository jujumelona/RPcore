// src/utils/CacheManager.ts
// ═══════════════════════════════════════════════════════════════════
//  캐시 크기 추적 + 일괄 삭제 유틸
//  — 챕터 캐시, 이미지 캐시, 기타 임시 데이터 관리
// ═══════════════════════════════════════════════════════════════════

  
 
import * as FileSystem from 'expo-file-system';

// ── Types ──────────────────────────────────────────────────────────

export interface CacheCategory {
  id: string;
  label: string;
  icon: string;
  sizeBytes: number;
}

export interface CacheSummary {
  categories: CacheCategory[];
  totalBytes: number;
}

// ── Size Utils ────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

// ── FileSystem 기반 디렉토리 크기 계산 ──────────────────────────────

async function getDirSize(dirPath: string): Promise<number> {
  if (!dirPath) return 0;
  try {
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists) return 0;

    if (!info.isDirectory) {
      return info.size ?? 0;
    }

    const items = await FileSystem.readDirectoryAsync(dirPath);
    // [PERF FIX] 순차 await → Promise.all 병렬 처리 (속도 개선)
    const sizes = await Promise.all(
      items.map(item => getDirSize(`${dirPath.replace(/\/$/, '')}/${item}`)),
    );
    return sizes.reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}

async function deleteDir(dirPath: string): Promise<void> {
  if (!dirPath) return;
  try {
    const info = await FileSystem.getInfoAsync(dirPath);
    if (info.exists) {
      await FileSystem.deleteAsync(dirPath, { idempotent: true });
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true }); // 빈 디렉토리 재생성
    }
  } catch {}
}

const safePath = (base: string | null, subpath: string) => {
  if (!base) return '';
  return `${base.replace(/\/$/, '')}/${subpath}`;
};

// ── CacheManager ──────────────────────────────────────────────────

export const CacheManager = {
  /**
   * 각 캐시 카테고리의 크기를 계산
   */
  async getCacheSummary(): Promise<CacheSummary> {
    const cacheDir = (FileSystem as any).cacheDirectory || '';
    const docDir = (FileSystem as any).documentDirectory || '';

    const categories: CacheCategory[] = [];

    // 1) 이미지 캐시
    const imageCachePaths = [
      safePath(cacheDir, 'image_cache'),
      safePath(cacheDir, 'image_manager_disk_cache'),
      safePath(cacheDir, 'http-cache'),
      safePath(cacheDir, 'ImagePicker'),
    ].filter(p => p !== '');

    let imageSize = 0;
    for (const p of imageCachePaths) {
      imageSize += await getDirSize(p);
    }
    categories.push({ id: 'images', label: '이미지 캐시', icon: '🖼️', sizeBytes: imageSize });

    // 2) 챕터 다운로드 캐시 (MMKV chapter-cache)
    const chapterCacheDir = safePath(docDir, 'mmkv/chapter-cache');
    const chapterSize = await getDirSize(chapterCacheDir);
    categories.push({ id: 'chapters', label: '챕터 캐시', icon: '📖', sizeBytes: chapterSize });

    // 3) 기타 임시 파일
    const tmpDir = safePath(cacheDir, '');
    const tmpSize = await getDirSize(tmpDir);
    categories.push({ id: 'temp', label: '임시 파일', icon: '🗑️', sizeBytes: Math.max(0, tmpSize - imageSize) });

    // 4) 로그 파일
    const logDir = safePath(docDir, 'logs');
    const logSize = await getDirSize(logDir);
    categories.push({ id: 'logs', label: '로그', icon: '📋', sizeBytes: logSize });

    const totalBytes = categories.reduce((sum, c) => sum + c.sizeBytes, 0);

    return { categories, totalBytes };
  },

  /**
   * 특정 카테고리 캐시 삭제
   */
  async clearCategory(categoryId: string): Promise<void> {
    const cacheDir = (FileSystem as any).cacheDirectory || '';
    const docDir = (FileSystem as any).documentDirectory || '';

    switch (categoryId) {
      case 'images':
        await deleteDir(safePath(cacheDir, 'image_cache'));
        await deleteDir(safePath(cacheDir, 'image_manager_disk_cache'));
        await deleteDir(safePath(cacheDir, 'http-cache'));
        await deleteDir(safePath(cacheDir, 'ImagePicker'));
        break;
      case 'chapters':
        // MMKV chapter-cache 스토어 클리어
        try {
           
          const { createMMKVStorage } = require('./mmkvZustandStorage');
          const store = createMMKVStorage({ id: 'chapter-cache' });
          if (store.clearAll) {
            store.clearAll();
          }
        } catch {}
        break;
      case 'temp':
        {
          const target = safePath(cacheDir, '');
          if (target) {
            const info = await FileSystem.getInfoAsync(target);
            if (info.exists && info.isDirectory) {
              const files = await FileSystem.readDirectoryAsync(target);
              // [BUG FIX] temp 삭제 시 다른 카테고리(images) 디렉토리 제외
              const exclude = ['image_cache', 'image_manager_disk_cache', 'http-cache', 'ImagePicker'];
              for (const file of files) {
                if (exclude.includes(file)) continue;
                await FileSystem.deleteAsync(`${target}/${file}`, { idempotent: true }).catch(() => {});
              }
            }
          }
        }
        break;
      case 'logs':
        await deleteDir(safePath(docDir, 'logs'));
        break;
    }
  },

  /**
   * 모든 캐시 삭제
   */
  async clearAll(): Promise<void> {
    const ids = ['images', 'chapters', 'temp', 'logs'];
    for (const id of ids) {
      await this.clearCategory(id);
    }
  } };
