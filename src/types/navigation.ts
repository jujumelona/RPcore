// src/types/navigation.ts — CharacterList 화면 추가
// ♿ AccessibilitySettings 라우트 추가 (WCAG 2.1 / ADA / EAA 2025)

import type { StoryConfig } from './StoryContract';
import type { StoryLoraAdapterSelection } from '../core/llama/StoryAdapterManager';

export type RootStackParamList = {
  TestEntry:              undefined;
  Onboarding:             { skipToLogin?: boolean } | undefined;
  Main:                   undefined;
  StoryDetail:            { story: Story };
  StoryDetailDebug:       {
    storyRaw?: Record<string, unknown>;
    storyDisplay?: Record<string, unknown>;
    renderedCharacters?: Array<Record<string, unknown>>;
    authorId?: string;
    authorName?: string;
  } | undefined;
  CharacterDetail:        { character: Character };
  CharacterList:          { storyId?: string; storyTitle?: string; initialGenre?: string } | undefined;
  Chat: {
    story: Story;
    character?: Character;
    currentEmotions?: Record<number, { e1: number; e2: number; e3: number; e4: number; e5: number }>;
    resumeMode?: boolean;
    lastChapterIndex?: number;
    adapterSelection?: StoryLoraAdapterSelection;
  };
  AuthorProfile:          { authorId: string; authorName?: string; authorAvatar?: string; authorEmail?: string };
  Notifications:          undefined;
  Search:                 undefined;
  LanguageSettings:       undefined;
  /** ♿ 접근성 설정 & 선언문 화면 */
  AccessibilitySettings:  undefined;
  OpenSourceLicenses: undefined;
  DataPolicy:         undefined;
  ContactAdmin:           undefined;
  SupportChat:            undefined;
  AdminPanel:             undefined;
  AdminDashboard:         undefined;
  AdminAnnouncement:      undefined;
  DebugLog:               undefined;
  StoryEditor:            { story?: Story; aiAssist?: boolean; prefill?: StoryPrefill; aiPrompt?: string; title?: string; storyId?: string; imageOnly?: boolean; fromAIChat?: boolean } | undefined;
  AIStoryChat:            { selectedModelId?: string } | undefined;
  AIWebNovelChat:         undefined;
  NovelShare:             { novelData: NovelShareData };
  WebNovelReader:         { novelId: string; source?: 'community' | 'local' | 'downloaded' };
  EpubReaderSpike:        { bookId?: string; src?: string; title?: string } | undefined;
  WebNovelDetail:         { novelId: string; novelTitle: string };
  WebNovelLibrary:        undefined;
  MyWebNovels:            undefined;
  WriteNovelPost:         { novelId: string; novelTitle: string; novelPreview?: string };
  WritePost:              {
    boardType?: 'free' | 'webnovel';
    lang?: string;
    editPostId?: string;
    initialTitle?: string;
    initialContent?: string;
  } | undefined;
  CommunityPostDetail:    { postId: string; isLocal?: boolean };
  Policy:                 { tab?: 'terms' | 'privacy' | 'operation' } | undefined;
  BlockManagement:        { tab?: 'story' | 'author' | 'hashtag' } | undefined;
  Conversations:          undefined;
  MyContent:              undefined;
  MyStories:              undefined;
  DownloadedNovels:       undefined;
  // ── 신규 커뮤니티/채팅 화면 ────────────────────────────────────────────────
  FollowFeed:             undefined;
  TagBrowser:             { initialTag?: string } | undefined;
  LikesBookmarks:         { initialTab?: 'likes' | 'bookmarks' | 'passages' } | undefined;
  /** UserProfileDetailScreen — 기존 AuthorProfile 라우트와 통합 */
  UserProfileDetail:      { authorId: string; authorName?: string };
  ChatHistorySearch:      { characterId?: string } | undefined;
  NotificationSettings:   undefined;
  ReadingStats:            undefined;
  BackupRestore:           undefined;
  CacheManagement:         undefined;
};

export interface StoryPrefill {
  storyTitle?: string;
  storyDesc?: string;
  storyGenre?: string;
  storyHashtag?: string;
  worldSetting?: string;
  userSetting?: {
    name?: string;
    age?: string;
    gender?: string;
    traits?: string;
    description?: string;
  };
  characters?: Array<{
    name: string;
    personality: string;
    personalityExample: string;
    age?: string;
    gender?: string;
    traits?: string;
    appearance?: string;
    description?: string;
    speech?: string;
  }>;
  chapters?: Array<{
    id?: string;
    title: string;
    aiGoal: string;
    chapterInfo: string;
    prevSummary?: string;
    triggerDesc?: string;
    characterGoals?: Record<string, string>;
    introMessages?: Array<{ speakerType: string; speakerName?: string; speakerCharId?: number; content: string }>;
    choiceEvents?: Array<{
      id?: string;
      prompt?: string;
      options?: Array<{ id?: string; label?: string; targetChapterId?: string }>;
    }>;
    isEnding?: boolean;
  }>;
  introMessages?: Array<{ speakerType: string; speakerName?: string; speakerCharId?: number; content: string }> | Record<string, Array<{ speakerType: string; speakerName?: string; speakerCharId?: number; content: string }>>;
}

export interface NovelShareData {
  title: string;
  chapters: Array<{ chapterTitle: string; content: string }>;
  storyId: string;
  tags: string[];
}

export type BottomTabParamList = {
  Home:      { initialSort?: string } | undefined;
  Create:    undefined;
  Story:     undefined;
  Community: undefined;
  Profile:   undefined;  // 구 MyPage — label 없이 아이콘만 표시
};

export interface Story {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  cover_urls?: string[];
  author: string;
  authorId: string;
  authorImageUrl?: string;
  likeCount: number;
  viewCount: number;
  tags: string[];
  genre: string;
  isLiked?: boolean;
  downloadSizeMB?: number;
  playerCount?: number;
  isAdult?: boolean;
  characters?: Character[];
  recommendedStories?: Story[];
  story_config?: StoryConfig;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
  imageUrl?: string;
  role: string;
  storyId?: string;
  storyTitle?: string;
  // optional extended fields used across screens
  age?: string | number;
  gender?: string;
  height?: string;
  job?: string;
  mbti?: string;
  personality?: string;
  traits?: string;
  speaking?: string;
  habits?: string;
  situation?: string;
  genre?: string;
  tags?: string[];
  likeCount?: number;
  playerCount?: number;
  initialEmotions?: import('./StoryContract').EditorEmotions;
  emotions?: import('./StoryContract').EditorEmotions;
}

export interface Author {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
  isFollowing: boolean;
  followerCount: number;
  storyCount: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  isRead: boolean;
  type: 'notification' | 'announcement';
}

export interface CommunityPost {
  id: string;
  title: string;
  content: string;
  author: string;
  authorId: string;
  likeCount: number;
  commentCount: number;
  timestamp: number;
  tags: string[];
  isLiked: boolean;
}

// ── 타입 헬퍼 ────────────────────────────────────────────────────────────────

import type {
  NativeStackNavigationProp,
  NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  RouteProp,
  CompositeScreenProps } from '@react-navigation/native';
import type {
  BottomTabNavigationProp,
  BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type ScreenNavProp<K extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, K>;

export type ScreenRouteProp<K extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, K>;

export type TabNavProp<K extends keyof BottomTabParamList> =
  BottomTabNavigationProp<BottomTabParamList, K>;

export type ScreenProps<K extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, K>;

export type TabScreenProps<K extends keyof BottomTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<BottomTabParamList, K>,
  NativeStackScreenProps<RootStackParamList>
>;

/** @deprecated ScreenProps<K> 로 교체 권장 */
export type RootStackScreenProps<K extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, K>;

export type RootNavigation =
  NativeStackNavigationProp<RootStackParamList, keyof RootStackParamList>;
