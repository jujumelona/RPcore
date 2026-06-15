// src/utils/imageDownloader.ts
// 이미지를 로컬에 다운로드하고 로컬 경로로 변환하는 유틸리티
// ✅ [UPDATE] DB 영구 저장: 다운로드 완료 시 URL↔로컬경로를 SQLite에 저장
//    → 오프라인에서도 DB 조회로 즉시 로컬 이미지 경로 획득

import RNFS from './fileSystemCompat';
import { db } from '../core/sqlite/Database';

const IMAGE_CACHE_DIR = `${RNFS.DocumentDirectoryPath}/story_images`;

function buildSafeImageFileName(imageUrl: string): string {
  const withoutHash = imageUrl.split('#')[0] ?? imageUrl;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  const lastSegment = withoutQuery.split('/').pop() || 'image';
  const sanitizedBase = lastSegment.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image';
  const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(sanitizedBase);
  const extension = hasExtension ? '' : '.img';

  let hash = 0;
  for (let index = 0; index < imageUrl.length; index += 1) {
    hash = ((hash << 5) - hash + imageUrl.charCodeAt(index)) | 0;
  }

  return `${Math.abs(hash).toString(36)}_${sanitizedBase}${extension}`;
}

/**
 * 이미지 URL을 로컬 파일 경로로 변환
 * 1순위: DB에서 저장된 로컬경로 조회
 * 2순위: 파일시스템 존재 확인 (DB 미등록 레거시 파일 호환)
 * 3순위: 원본 URL 반환 (미다운로드)
 */
export async function getLocalImagePath(imageUrl: string, storyId: string): Promise<string> {
  if (!imageUrl || !imageUrl.startsWith('http')) return imageUrl;

  try {
    // 1순위: DB 조회 — 오프라인에서도 즉시 반환
    const dbPath = db.getStoryAssetLocalPath(storyId, imageUrl);
    if (dbPath) {
      // DB에 경로가 있으면 파일도 실제 존재하는지 빠르게 확인
      const rawPath = dbPath.startsWith('file://') ? dbPath.slice(7) : dbPath;
      const exists = await RNFS.exists(rawPath);
      if (exists) return dbPath;
      // 파일이 삭제됐으면 DB 레코드도 무효 → 원본 URL fallback
    }

    // 2순위: 파일시스템 직접 확인 (DB 미등록 레거시 호환)
    const fileName = buildSafeImageFileName(imageUrl);
    const localPath = `${IMAGE_CACHE_DIR}/${storyId}/${fileName}`;

    const exists = await RNFS.exists(localPath);
    if (exists) {
      const fileUri = `file://${localPath}`;
      // 레거시 파일 발견 → DB에도 등록
      try {
        db.saveStoryAssets(storyId, [{
          assetType: 'image',
          remoteUrl: imageUrl,
          localPath: fileUri,
        }]);
      } catch { /* DB 저장 실패해도 이미지는 반환 */ }
      return fileUri;
    }

    return imageUrl;
  } catch {
    return imageUrl;
  }
}

/**
 * 여러 이미지를 로컬에 다운로드
 * ✅ 다운로드 완료 후 URL↔로컬경로 매핑을 SQLite에 영구 저장
 */
export async function downloadImages(imageUrls: string[], storyId: string): Promise<void> {
  if (imageUrls.length === 0) return;

  try {
    const dirPath = `${IMAGE_CACHE_DIR}/${storyId}`;
    const dirExists = await RNFS.exists(dirPath);
    if (!dirExists) {
      await RNFS.mkdir(dirPath);
    }

    // DB에 저장할 에셋 목록 수집
    const assetsToSave: Array<{ assetType: string; remoteUrl: string; localPath: string }> = [];

    await Promise.all(
      imageUrls.map(async (imageUrl) => {
        if (!imageUrl || !imageUrl.startsWith('http')) return;

        try {
          const fileName = buildSafeImageFileName(imageUrl);
          const localPath = `${dirPath}/${fileName}`;
          const fileUri = `file://${localPath}`;

          const exists = await RNFS.exists(localPath);
          if (exists) {
            // 이미 다운로드됨 → DB 등록만 수집
            assetsToSave.push({
              assetType: imageUrl.includes('/bg/') ? 'background' : 'character',
              remoteUrl: imageUrl,
              localPath: fileUri,
            });
            return;
          }

          await RNFS.downloadFile({
            fromUrl: imageUrl,
            toFile: localPath,
          }).promise;

          console.log('[ImageDownload] ✅', fileName);

          // 다운로드 성공 → DB 등록 수집
          assetsToSave.push({
            assetType: imageUrl.includes('/bg/') ? 'background' : 'character',
            remoteUrl: imageUrl,
            localPath: fileUri,
          });
        } catch (err) {
          console.warn('[ImageDownload] ❌', imageUrl, err);
        }
      })
    );

    // ✅ 수집된 에셋을 DB에 일괄 저장
    if (assetsToSave.length > 0) {
      try {
        db.saveStoryAssets(storyId, assetsToSave);
        console.log(`[ImageDownload] DB 저장 완료: ${assetsToSave.length}개 에셋`);
      } catch (err) {
        console.warn('[ImageDownload] DB 저장 실패:', err);
      }
    }
  } catch (err) {
    console.warn('[ImageDownload] Batch failed:', err);
  }
}
