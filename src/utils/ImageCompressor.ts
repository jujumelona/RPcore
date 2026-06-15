// src/utils/ImageCompressor.ts
//
// ✅ [OPT] compressImage() 비율 유지 resize
//    기존: .resize({ width: maxWidth, height: maxHeight })
//          -> expo-image-manipulator는 width+height 동시 지정 시 강제 스트레칭
//          -> 세로 사진이 정사각형으로 찌그러지는 버그
//    수정: 원본 치수를 먼저 가져와 종횡비 계산 후 단일 축만 지정
//          maxWidth / maxHeight 중 더 제한적인 쪽 기준으로 스케일 결정
//          -> 원본 비율 100% 유지하면서 최대 크기 제한 적용
//
// ✅ [OPT] manipulate() 체이닝 API 유지
//    expo-image-manipulator 최신 체이닝 API 사용 (manipulateAsync 대비 메모리 효율)

import RNFS from './fileSystemCompat';
import { ImageManipulator, SaveFormat, type ActionResize } from 'expo-image-manipulator';
import { launchImageLibrary } from 'react-native-image-picker';
import { Image } from 'react-native';

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  targetAspectRatio?: number;
}

export interface CompressResult {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
}

async function getFileSize(uri: string): Promise<number> {
  try {
    const path = uri.startsWith('file://') ? uri.slice(7) : uri;
    const stat = await RNFS.stat(path);
    return Number(stat?.size ?? 0) || 0;
  } catch {
    return 0;
  }
}

function toSaveFormat(format: 'webp' | 'jpeg' | 'png'): SaveFormat {
  if (format === 'webp') return SaveFormat.WEBP;
  if (format === 'png')  return SaveFormat.PNG;
  return SaveFormat.JPEG;
}

async function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, _reject) => {
    // [BUG FIX] Image.getSize는 network URI에서 불필요한 fetch를 발생시킬 수 있음
    // 로컬 file:// URI에서는 RN의 ImageResizer를 통해 빠르게 처리
    // 실패 시 기본값으로 안전하게 fallback
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => {
        console.warn('[ImageCompressor] getImageSize failed, using fallback:', error);
        resolve({ width: 1920, height: 1080 }); // 안전한 기본값으로 fallback
      },
    );
  });
}

/**
 * ✅ [OPT] 종횡비 보존 resize 파라미터 계산
 *
 * expo-image-manipulator의 resize는 width/height 동시 지정 시 강제 스트레칭.
 * 원본 치수 기반으로 maxWidth / maxHeight 중 더 제한적인 쪽만 단일 축으로 지정.
 *
 * 예시:
 *   원본 1080×1920 (세로), maxWidth=1024, maxHeight=1024
 *   -> widthScale = 1024/1080 ≈ 0.948
 *   -> heightScale = 1024/1920 ≈ 0.533  ← 더 제한적
 *   -> resize({ height: 1024 }) 만 지정 -> 결과: 547×1024 (비율 유지)
 */
function computeResizeDimension(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): ActionResize['resize'] {
  // 이미 충분히 작으면 resize 불필요 -> 원본 크기 반환
  if (srcWidth <= maxWidth && srcHeight <= maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }

  const widthScale  = maxWidth  / srcWidth;
  const heightScale = maxHeight / srcHeight;

  // 더 제한적인 축(scale이 작은 쪽)으로만 지정 -> 반대 축은 비율 자동 유지
  if (widthScale <= heightScale) {
    return { width: maxWidth };
  } else {
    return { height: maxHeight };
  }
}

function computeCenteredCrop(
  srcWidth: number,
  srcHeight: number,
  targetAspectRatio?: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (!targetAspectRatio || targetAspectRatio <= 0) {
    return null;
  }

  const currentRatio = srcWidth / srcHeight;
  if (Math.abs(currentRatio - targetAspectRatio) < 0.01) {
    return null;
  }

  if (currentRatio > targetAspectRatio) {
    const cropWidth = Math.max(1, Math.round(srcHeight * targetAspectRatio));
    return {
      originX: Math.max(0, Math.floor((srcWidth - cropWidth) / 2)),
      originY: 0,
      width: cropWidth,
      height: srcHeight };
  }

  const cropHeight = Math.max(1, Math.round(srcWidth / targetAspectRatio));
  return {
    originX: 0,
    originY: Math.max(0, Math.floor((srcHeight - cropHeight) / 2)),
    width: srcWidth,
    height: cropHeight };
}

export async function compressImage(
  sourceUri: string,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const {
    maxWidth  = 1024,
    maxHeight = 1024,
    quality   = 0.75,
    format    = 'webp',
    targetAspectRatio } = options;
  let sourceWidth = maxWidth;
  let sourceHeight = maxHeight;

  try {
    // ✅ [OPT] 원본 치수 먼저 획득 -> 비율 보존 resize 파라미터 계산
    // manipulate().renderAsync() 이전에 원본 정보가 필요하므로
    // getInfoAsync() 로 메타데이터만 빠르게 조회 (디코딩 없음)
    let resizeDim: ActionResize['resize'];
    let cropRect: { originX: number; originY: number; width: number; height: number } | null = null;
    try {
      const info = await getImageSize(sourceUri);
      sourceWidth = info.width;
      sourceHeight = info.height;
      cropRect = computeCenteredCrop(info.width, info.height, targetAspectRatio);
      const resizeSourceWidth = cropRect?.width ?? info.width;
      const resizeSourceHeight = cropRect?.height ?? info.height;
      resizeDim = computeResizeDimension(
        resizeSourceWidth,
        resizeSourceHeight,
        maxWidth,
        maxHeight,
      );
    } catch {
      // getInfoAsync 실패 시 fallback: width 단일 지정 (기존보다 안전)
      resizeDim = { width: maxWidth };
    }

    let manipulator = ImageManipulator.manipulate(sourceUri);
    if (cropRect) {
      manipulator = manipulator.crop(cropRect);
    }

    const result = await manipulator
      .resize(resizeDim)
      .renderAsync();

    const saved = await result.saveAsync({
      compress: quality,
      format: toSaveFormat(format) });

    const sizeBytes = await getFileSize(saved.uri);
    return { uri: saved.uri, width: saved.width, height: saved.height, sizeBytes, format };
  } catch {
    const sizeBytes = await getFileSize(sourceUri);
    return {
      uri: sourceUri,
      width: sourceWidth,
      height: sourceHeight,
      sizeBytes,
      format };
  }
}

export async function pickAndCompress(
  options: CompressOptions = {},
): Promise<CompressResult | null> {
  try {
    return await new Promise((resolve, reject) => {
      launchImageLibrary(
        { includeBase64: false, mediaType: 'photo', quality: (options.quality ?? 0.75) as import('react-native-image-picker').PhotoQuality, selectionLimit: 1 },
        async (response: import('react-native-image-picker').ImagePickerResponse) => {
          if (response.didCancel || response.errorCode) { resolve(null); return; }
          const asset = response.assets?.[0];
          if (!asset?.uri) { resolve(null); return; }
          try {
            resolve(await compressImage(asset.uri, options));
          } catch (error) {
            reject(error);
          }
        },
      );
    });
  } catch (error) {
    console.error('[ImageCompressor] pickAndCompress error:', error);
    return null;
  }
}

export async function createThumbnail(sourceUri: string): Promise<CompressResult> {
  return compressImage(sourceUri, { format: 'webp', maxWidth: 96, maxHeight: 96, quality: 0.7 });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



