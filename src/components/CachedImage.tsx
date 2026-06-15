import React from 'react';
import { Image as ExpoImage,
  type ImageProps as ExpoImageProps,  type ImageContentFit } from 'expo-image';

type CachedImageProps = Omit<ExpoImageProps, 'source'> & {
  uri: string;
  /** 로딩 우선순위 — 캐릭터 아바타: 'high', 썸네일: 'normal', 배경: 'low' */
  priority?: NonNullable<ExpoImageProps['priority']>;
  /** 이미지 placeholder (blurhash 또는 thumbhash 문자열) */
  placeholder?: string;
  contentFit?: ImageContentFit;
};

function normalizeUris(input: ReadonlyArray<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      input
        .map(uri => (typeof uri === 'string' ? uri.trim() : ''))
        .filter(uri => /^https?:\/\//i.test(uri)),
    ),
  );
}

export async function prefetchImageUris(
  uris: ReadonlyArray<string | null | undefined>,
  cachePolicy: 'disk' | 'memory-disk' = 'memory-disk',
): Promise<boolean> {
  const normalized = normalizeUris(uris);
  if (normalized.length === 0) return false;

  try {
    return await ExpoImage.prefetch(normalized, cachePolicy);
  } catch (error) {
    if (__DEV__) {
      console.warn('[CachedImage] prefetch failed', error);
    }
    return false;
  }
}

export function CachedImage({
  uri,
  cachePolicy = 'memory-disk',
  transition = 120,
  recyclingKey,
  priority = 'normal',
  placeholder,
  contentFit = 'cover',
  ...props
}: CachedImageProps) {
  // [수정] 빈 uri -> ExpoImage에 전달 시 에러 로그 발생 -> null 반환으로 가드
  if (!uri || !uri.trim()) return null;

  return (
    <ExpoImage
      {...props}
      source={{ uri }}
      cachePolicy={cachePolicy}
      transition={transition}
      recyclingKey={recyclingKey ?? uri}
      priority={priority}
      placeholder={placeholder ? { uri: placeholder } : undefined}
      contentFit={contentFit}
      // 디코딩을 메인 스레드 밖에서 처리 — 스크롤 중 프레임 드랍 방지
      allowDownscaling
    />
  );
}
