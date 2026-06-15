// src/navigation/DeepLinkConfig.ts
// ═══════════════════════════════════════════════════════════════════
// Bluesky 앱 라우팅 / 딥링크 패턴 이식
//
// ✅ rpcore:// 커스텀 URI 스킴
// ✅ https://rpcore.app/* 유니버설 링크
// ✅ 경로-스크린 매핑 테이블
// ✅ 파라미터 파싱 + 유효성 검사
// ✅ React Navigation linking config 호환
// ═══════════════════════════════════════════════════════════════════

import type { LinkingOptions } from '@react-navigation/native';

// ── 스크린 파라미터 타입 ──────────────────────────────────────────

export type DeepLinkParamList = {
  // 탭
  HomeTab: undefined;
  CommunityTab: undefined;
  MyPageTab: undefined;

  // 스토리
  StoryDetail: { storyId: string };
  ChatScreen: { storyId: string; characterId?: string };
  StoryEditor: { storyId: string };

  // 웹소설
  WebNovelLibrary: undefined;
  WebNovelReader: { novelId: string; chapterId?: string };
  NovelShare: { novelId: string };

  // 커뮤니티
  CommunityPostDetail: { postId: string };
  UserProfileDetail: { userId: string };
  TagBrowser: { tag: string };

  // AI
  AIStoryChat: { storyId: string };

  // 기타
  Search: { query?: string };
  Notifications: undefined;
  AuthorProfile: { authorId: string };
};

// ── URL 경로 → 스크린 매핑 ────────────────────────────────────────

export const ROUTE_MAP: Record<string, { screen: keyof DeepLinkParamList; paramKeys?: string[] }> = {
  'story/:storyId':             { screen: 'StoryDetail',         paramKeys: ['storyId'] },
  'story/:storyId/chat':        { screen: 'ChatScreen',          paramKeys: ['storyId'] },
  'story/:storyId/edit':        { screen: 'StoryEditor',         paramKeys: ['storyId'] },
  'story/:storyId/ai-chat':     { screen: 'AIStoryChat',         paramKeys: ['storyId'] },
  'novel/:novelId':             { screen: 'WebNovelReader',      paramKeys: ['novelId'] },
  'novel/:novelId/chapter/:chapterId': { screen: 'WebNovelReader', paramKeys: ['novelId', 'chapterId'] },
  'novel/:novelId/share':       { screen: 'NovelShare',          paramKeys: ['novelId'] },
  'community/post/:postId':     { screen: 'CommunityPostDetail', paramKeys: ['postId'] },
  'user/:userId':               { screen: 'UserProfileDetail',   paramKeys: ['userId'] },
  'tag/:tag':                   { screen: 'TagBrowser',          paramKeys: ['tag'] },
  'author/:authorId':           { screen: 'AuthorProfile',       paramKeys: ['authorId'] },
  'search':                     { screen: 'Search' },
  'notifications':              { screen: 'Notifications' },
  'library':                    { screen: 'WebNovelLibrary' } };

// ── React Navigation Linking Config ───────────────────────────────

export const linkingConfig: LinkingOptions<any> = {
  prefixes: [
    'rpcore://',
    'https://rpcore.app',
    'https://www.rpcore.app',
  ],
  config: {
    screens: {
      // ── 탭 네비게이터 ─────────────────────────────────
      MainTabs: {
        screens: {
          HomeTab: {
            screens: {
              Home: '',
              StoryDetail: 'story/:storyId',
              ChatScreen: 'story/:storyId/chat',
              StoryEditor: 'story/:storyId/edit',
              AIStoryChat: 'story/:storyId/ai-chat' } },
          CommunityTab: {
            screens: {
              Community: 'community',
              CommunityPostDetail: 'community/post/:postId',
              UserProfileDetail: 'user/:userId',
              TagBrowser: 'tag/:tag' } },
          MyPageTab: {
            screens: {
              MyPage: 'mypage',
              WebNovelLibrary: 'library' } } } },
      // ── 모달/독립 스크린 ─────────────────────────────
      WebNovelReader: 'novel/:novelId/chapter/:chapterId',
      NovelShare: 'novel/:novelId/share',
      Search: 'search',
      Notifications: 'notifications',
      AuthorProfile: 'author/:authorId' } } };

// ── 딥링크 URL 생성 헬퍼 ──────────────────────────────────────────

export function createDeepLink(
  screen: keyof DeepLinkParamList,
  params?: Record<string, string>,
  scheme: 'app' | 'web' = 'app',
): string {
  const prefix = scheme === 'web' ? 'https://rpcore.app/' : 'rpcore://';

  switch (screen) {
    case 'StoryDetail':
      return `${prefix}story/${params?.storyId ?? ''}`;
    case 'ChatScreen':
      return `${prefix}story/${params?.storyId ?? ''}/chat`;
    case 'StoryEditor':
      return `${prefix}story/${params?.storyId ?? ''}/edit`;
    case 'AIStoryChat':
      return `${prefix}story/${params?.storyId ?? ''}/ai-chat`;
    case 'WebNovelReader':
      return params?.chapterId
        ? `${prefix}novel/${params.novelId}/chapter/${params.chapterId}`
        : `${prefix}novel/${params?.novelId ?? ''}`;
    case 'NovelShare':
      return `${prefix}novel/${params?.novelId ?? ''}/share`;
    case 'CommunityPostDetail':
      return `${prefix}community/post/${params?.postId ?? ''}`;
    case 'UserProfileDetail':
      return `${prefix}user/${params?.userId ?? ''}`;
    case 'TagBrowser':
      return `${prefix}tag/${params?.tag ?? ''}`;
    case 'AuthorProfile':
      return `${prefix}author/${params?.authorId ?? ''}`;
    case 'Search':
      return params?.query ? `${prefix}search?q=${encodeURIComponent(params.query)}` : `${prefix}search`;
    case 'Notifications':
      return `${prefix}notifications`;
    case 'WebNovelLibrary':
      return `${prefix}library`;
    default:
      return prefix;
  }
}

// ── 딥링크 파싱 유틸 ──────────────────────────────────────────────

export function parseDeepLink(url: string): {
  screen: keyof DeepLinkParamList;
  params: Record<string, string>;
} | null {
  try {
    // rpcore:// 또는 https://rpcore.app/ 제거
    let path = url
      .replace('rpcore://', '')
      .replace('https://rpcore.app/', '')
      .replace('https://www.rpcore.app/', '');

    // 쿼리스트링 분리
    const [pathPart, queryPart] = path.split('?');
    const queryParams: Record<string, string> = {};
    if (queryPart) {
      for (const pair of queryPart.split('&')) {
        const [key, value] = pair.split('=');
        if (key && value) queryParams[key] = decodeURIComponent(value);
      }
    }

    // 경로 매칭
    const pathSegments = pathPart.split('/').filter(Boolean);

    for (const [pattern, route] of Object.entries(ROUTE_MAP)) {
      const patternSegments = pattern.split('/').filter(Boolean);
      if (patternSegments.length !== pathSegments.length) continue;

      const params: Record<string, string> = { ...queryParams };
      let match = true;

      for (let i = 0; i < patternSegments.length; i++) {
        if (patternSegments[i].startsWith(':')) {
          params[patternSegments[i].slice(1)] = pathSegments[i];
        } else if (patternSegments[i] !== pathSegments[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        return { screen: route.screen, params };
      }
    }
  } catch {}

  return null;
}
