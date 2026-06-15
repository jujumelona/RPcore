/**
 * src/screens/story-editor/utils/StoryEditorImageUtils.ts
 * StoryEditorScreen.tsx의 이미지 관련 유틸리티 함수들
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { launchImageLibrary, ImagePickerResponse, MediaType } from 'react-native-image-picker';
import { nitroCompressImage } from '../../../native/NitroImageProcessor';
import type { TranslationFunction } from '../types/StoryEditorLegacyTypes';

/**
 * 이미지 권한 요청
 */
export async function requestImagePermission(t: TranslationFunction): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return true;
  }

  try {
    // ✅ [BUG FIX] 권한이 이미 있는지 먼저 체크
    const checkResult = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    );
    
    if (checkResult) {
      return true;
    }

    // 권한이 없으면 요청
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      {
        title: t('storage_permission_title') || '저장소 접근 권한',
        message: t('storage_permission_message') || '이미지를 선택하기 위해 저장소 접근 권한이 필요합니다.',
        buttonNeutral: t('ask_me_later') || '나중에 묻기',
        buttonNegative: t('cancel') || '취소',
        buttonPositive: t('ok') || '확인' }
    );
    
    // ✅ [BUG FIX] 권한 허용 후 약간의 딜레이 (시스템이 권한 상태를 업데이트할 시간)
    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    }
    
    return false;
  } catch (err) {
    console.warn('Permission request failed:', err);
    return false;
  }
}

/**
 * 단일 이미지 선택
 */
export async function pickImage(t: TranslationFunction): Promise<string | null> {
  const hasPermission = await requestImagePermission(t);
  if (!hasPermission) {
    return null;
  }

  return new Promise((resolve) => {
    launchImageLibrary(
      {
        mediaType: 'photo' as MediaType,
        quality: 0.8,
        includeBase64: false,
        includeExtra: true },
      (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorMessage) {
          resolve(null);
          return;
        }

        const asset = response.assets?.[0];
        if (!asset?.uri) {
          resolve(null);
          return;
        }

        resolve(asset.uri);
      }
    );
  });
}

/**
 * 다중 이미지 선택
 */
export async function pickImages(
  t: TranslationFunction, 
  maxCount: number = 5
): Promise<string[]> {
  const hasPermission = await requestImagePermission(t);
  if (!hasPermission) {
    return [];
  }

  return new Promise((resolve) => {
    launchImageLibrary(
      {
        mediaType: 'photo' as MediaType,
        quality: 0.8,
        includeBase64: false,
        includeExtra: true,
        selectionLimit: maxCount },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorMessage) {
          resolve([]);
          return;
        }

        const assets = response.assets || [];
        const uris = assets
          .filter(asset => asset.uri)
          .map(asset => asset.uri!);

        // Nitro 이미지 압축 적용
        const compressedUris: string[] = [];
        for (const uri of uris) {
          try {
            // [BUG FIX] nitroCompressImage signature: (uri, options) — not positional args.
            // Return type is CompressResult { uri, width, height, sizeBytes, format }, not a string.
            const compressed = await nitroCompressImage(uri, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
            compressedUris.push(compressed.uri);
          } catch (error) {
            console.warn('Image compression failed:', error);
            compressedUris.push(uri); // 실패 시 원본 사용
          }
        }

        resolve(compressedUris);
      }
    );
  });
}

/**
 * 이미지 압축 유틸리티
 */
export async function compressImageIfNeeded(
  uri: string, 
  maxWidth: number = 1024, 
  maxHeight: number = 1024, 
  quality: number = 0.8
): Promise<string> {
  try {
    return await nitroCompressImage(uri, maxWidth, maxHeight, quality);
  } catch (error) {
    console.warn('Image compression failed:', error);
    return uri; // 실패 시 원본 반환
  }
}
