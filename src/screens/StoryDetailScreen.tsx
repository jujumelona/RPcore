import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { memo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, Modal, RefreshControl, ActivityIndicator, Pressable, StatusBar, Alert } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { ToastService } from '../components/Toast';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { prefetchImageUris } from '../components/CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { appStorage } from '../utils/storage';
import { Radius, Typography } from '../constants/tokens';
import { useLanguageStore } from '../store/languageStore';
import { getScreenTranslations } from '../i18n/SCREENS-TRANSLATION';
import { useUserProfileStore } from '../store/userProfileStore';
import { useModelStore } from '../store/modelStore';
import { rankRecommendedStories, type RankableStory, type RecommendProfile } from '../utils/recommendationRanker';
import { useAuthStore } from '../store/authStore';
import { isOwner, resolveDisplayName } from '../core/user';
import { StoryAPI, clearDetailCache } from '../api/StoryAPI';
import { authedFetch } from '../utils/authedFetch';
import { ReportModal } from '../components/ReportModal';
import { SkeletonDetailRec } from '../components/Skeleton';
import { ChevronLeft, ChevronRight, Heart, MoreVertical, Play } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { PremiumImageViewer } from '../components/PremiumImageViewer';
import { formatCount } from '../utils/formatCount';
import { triggerHaptic } from '../utils/haptics';
import { sanitizeNullableImageUrl } from '../utils/imageUrlPolicy';
import { logger } from '../utils/logger';
import { StoryDetailCharacterCards } from './story-detail/components/StoryDetailCharacterCards';
import { buildStoryDisplayModel,
  buildRawCharacterSourceMap,
  extractAuthorId,
  extractCoverUrls,
  extractLocalizedStoryFields,
  isReadyForHomeExposure } from './home/utils/storyHelpers';
import { StoryCard } from '../components/StoryCard';
import {
  needsHydratedChatStory,
  resolveChatHydrationResult,
} from './chat/utils/normalizeStoryForChat';
import RNFS from '../utils/fileSystemCompat';
import { SERVER_BASE } from '../config/ApiConfig';
import { downloadImages } from '../utils/imageDownloader';
import { storyAdapterManager } from '../core/llama/StoryAdapterManager';
import { buildCharacterChatNavigationParams } from '../utils/characterChat';

const { width, height } = (Dimensions.get('window') ?? { width: 375, height: 812 });
const APP_NAV_TONE = '#050507';
const APP_NAV_RGB = '5,5,7';
const STORY_DOWNLOAD_STATE_KEY = '@story_download_ready_v1';

function buildStoryDownloadStateId(storyId: string, modelId: string, language: string): string {
  return `${storyId}::${modelId}::${language}`;
}

function readStoryDownloadStateMap(): Record<string, number> {
  try {
    const raw = appStorage.getString(STORY_DOWNLOAD_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeStoryDownloadState(storyId: string, modelId: string, language: string, ready: boolean): void {
  if (!storyId || !modelId || !language) return;
  const next = readStoryDownloadStateMap();
  const key = buildStoryDownloadStateId(storyId, modelId, language);
  if (ready) next[key] = Date.now();
  else delete next[key];
  appStorage.set(STORY_DOWNLOAD_STATE_KEY, JSON.stringify(next));
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

const logStoryDetailDebug = (...args: unknown[]) => {
  if (__DEV__) console.log(...args);
};

const warnStoryDetailDebug = (...args: unknown[]) => {
  if (__DEV__) console.warn(...args);
};

const errorStoryDetailDebug = (...args: unknown[]) => {
  if (__DEV__) console.error(...args);
};

const STORY_DETAIL_DEBUG_MENU_LABEL = 'Data Debug';
const STORY_DETAIL_DEBUG_MENU_A11Y = 'Open data debug';

const formatDate = (dateStr?: string | Date) => {
  if (!dateStr) return '0000.00.00';
  const str = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
  return str.substring(0, 10).replace(/-/g, '.');
};


function normalizeRecommendedStory(raw: Record<string, unknown>, appLanguage?: string): RankableStory {
  const likeCountNum = Number(raw.likeCount ?? raw.like_count ?? 0);
  const viewCountNum = Number(raw.viewCount ?? raw.view_count ?? 0);
  const playerCountNum = Number(raw.playerCount ?? raw.player_count ?? 0);
  const localized = extractLocalizedStoryFields(raw, appLanguage);

  return {
    ...(raw as Record<string, unknown>),
    id: String(raw.id ?? ''),
    title: String(localized.title ?? raw.title ?? ''),
    description: String(localized.description ?? raw.description ?? ''),
    authorId: String(raw.authorId ?? raw.author_id ?? ''),
    genre: String(raw.genre ?? ''),
    tags: localized.tags,
    likeCount: Number.isFinite(likeCountNum) ? likeCountNum : 0,
    viewCount: Number.isFinite(viewCountNum) ? viewCountNum : 0,
    playerCount: Number.isFinite(playerCountNum) ? playerCountNum : 0,
    createdAt: raw.createdAt ?? raw.created_at,
    publishedAt: raw.publishedAt ?? raw.published_at,
    updatedAt: raw.updatedAt ?? raw.updated_at
  } as RankableStory;
}

function StoryDetailScreenComponent({ navigation, route }: { navigation?: any; route?: { params?: { story?: Record<string, unknown>; isMyStory?: boolean } } } = {}) {
  const { story: _storyRaw } = route?.params || {};
  const story = _storyRaw;
  const insets = useSafeAreaInsets();
  const { t, isRTL, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, isRTL: s.isRTL, appLanguage: s.appLanguage })));
  const screenT = useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const authUser = useAuthStore(s => s.user);
  const jwtToken = useAuthStore(s => s.user?.jwtToken ?? '');
  const defaultUserName = t?.speakerUser ?? screenT.speakerUser;
  const authorSectionTitle = t?.authorLabel ?? screenT.authorLabel;

  const profileNameRef = useRef<string>(defaultUserName);
  const profileName = useUserProfileStore(s => {
    const name = s.profile.name;
    profileNameRef.current = name;
    return name;
  });
  const profileAvatarUri = useUserProfileStore(s => s.profile.avatarUri);
  const isFollowingFn = useUserProfileStore(s => s.isFollowing);
  const toggleFollow = useUserProfileStore(s => s.toggleFollow);
  const blockStory = useUserProfileStore(s => s.blockStory);
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  const missingStoryRef = useRef(false);
  const coverScrollRef = useRef<ScrollView | null>(null);

  const storyId = String(story?.id ?? '');
  const safeGoBack = useCallback(() => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate?.('Main');
  }, [navigation]);

  const [liked, setLiked] = useState(story?.isLiked ?? false);
  const [likeCountState, setLikeCountState] = useState<number | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadCompleted, setDownloadCompleted] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [coverIdx, setCoverIdx] = useState(0);
  const [coverViewerVisible, setCoverViewerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [coverLayout, setCoverLayout] = useState({ width: 0, height: 0 });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (storyId || missingStoryRef.current) return;
    missingStoryRef.current = true;
    ToastService.error(t?.invalidAccess ?? screenT.invalidAccess);
    safeGoBack();
  }, [storyId, t?.invalidAccess, safeGoBack]);

  const { data: fullStory, isLoading: storyFetching } = useQuery({
    queryKey: ['story-detail-full', storyId, appLanguage],
    queryFn: () => StoryAPI.getStory(storyId, appLanguage),
    enabled: !!storyId && !!appLanguage,
  });

  const activeStory = useMemo(() => fullStory || story, [fullStory, story]);
  const activeStoryRecord = useMemo(
    () => {
      const result = (activeStory as Record<string, unknown> | undefined) ?? {};
      return result;
    },
    [activeStory],
  );
  const storyDisplay = useMemo(
    () => buildStoryDisplayModel(activeStoryRecord, appLanguage),
    [activeStoryRecord, appLanguage],
  );
  const rawCharacterMap = useMemo(
    () => buildRawCharacterSourceMap(activeStoryRecord),
    [activeStoryRecord],
  );
  const likeMutation = useMutation({
    mutationFn: async (_nextLiked: boolean) => {
      const { isJwtExpired } = await import('../store/authStore');
      if (jwtToken && isJwtExpired(jwtToken)) {
        useAuthStore.getState().signOut().catch(() => {});
        throw new Error('Token expired');
      }
      return StoryAPI.like(String(story?.id), jwtToken);
    },
    onMutate: (nextLiked: boolean) => {
      const prev = { liked, likeCount: likeCountState };
      setLiked(nextLiked);
      setLikeCountState(c => ((c ?? story?.likeCount ?? 0) as number) + (nextLiked ? 1 : -1));
      queryClient.setQueriesData({ queryKey: ['home-stories'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            stories: p.stories?.map((s: any) =>
              String(s.id) === String(story?.id)
                ? { ...s, isLiked: nextLiked, likeCount: (Number(s.likeCount) ?? 0) + (nextLiked ? 1 : -1) }
                : s,
            )
          }))
        };
      });
      return prev;
    },
    onError: (_err, _nextLiked, ctx: any) => {
      if (ctx) { setLiked(ctx.liked); setLikeCountState(ctx.likeCount); }
    },
    onSuccess: (result: { likeCount: number; isLiked: boolean }) => {
      setLikeCountState(result.likeCount);
      setLiked(result.isLiked);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['home-stories'], refetchType: 'none' });
    }
  });

  const coverUrls = useMemo(() => extractCoverUrls(activeStoryRecord), [activeStoryRecord]);
  const isResume = false;
  const authorId = useMemo(() => pickText(
    extractAuthorId(activeStoryRecord),
    extractAuthorId((story as Record<string, unknown> | undefined) ?? {}),
  ), [activeStoryRecord, story]);
  const recommendationGenre = String(activeStory?.genre ?? story?.genre ?? '');

  useEffect(() => {
    if (authorId) setFollowing(isFollowingFn(authorId));
  }, [authorId, isFollowingFn]);

  const { data: recommendedRaw = [], isLoading: recLoading, refetch } = useQuery({
    queryKey: ['recommended', story?.id, recommendationGenre, appLanguage],
    queryFn: () => StoryAPI.getStories({ genre: recommendationGenre, lang: appLanguage })
      .then(list => list.filter((s: Record<string, unknown>) => s.id !== story?.id && isReadyForHomeExposure(s))),
    enabled: false, // Temporarily disabled to fix infinite loop
    staleTime: 5 * 60 * 1000
  });

  const recoProfile = useMemo<RecommendProfile>(() => ({
    likedStoryIds: [],
    followedAuthorIds: [],
    blockedStoryIds: [],
    blockedAuthorIds: [],
    blockedHashtags: [],
    reportedStoryIds: [],
    playedGenreCounts: {},
    preferredGenres: []
  }), []);

  const rankedRecommended = useMemo(() => {
    if (!Array.isArray(recommendedRaw) || recommendedRaw.length === 0) return [];
    const normalized = recommendedRaw
      .map(item => normalizeRecommendedStory(item, appLanguage))
      .filter(s => s.id && String(s.id).length > 0);
    const ranked = rankRecommendedStories(normalized, recoProfile);
    return ranked.slice(0, 6);
  }, [appLanguage, recommendedRaw, recoProfile]);

  const activeModelId = useModelStore(s => s.activeModelId);
  const downloadedModels = useModelStore(s => s.downloadedModels);
  const hasDownloadedActiveModel =
    !!activeModelId && downloadedModels.some(model => model.id === activeModelId);
  const checkStoryPrepared = useCallback(async (candidateStory?: Record<string, unknown> | null) => {
    if (!storyId || !activeModelId || !appLanguage) return false;

    const markerMap = readStoryDownloadStateMap();
    const markerKey = buildStoryDownloadStateId(storyId, activeModelId, appLanguage);
    const hasMarker = !!markerMap[markerKey];

    try {
      const { default: kvCacheManager } = await import('../core/llama/KVCacheManager');
      const baseKvPath = kvCacheManager.getBaseKVPath(activeModelId);
      const isBaseDownloaded = await RNFS.exists(baseKvPath);
      if (isBaseDownloaded) {
        if (!hasMarker) {
          writeStoryDownloadState(storyId, activeModelId, appLanguage, true);
        }
        return true;
      }

      if (hasMarker) {
        writeStoryDownloadState(storyId, activeModelId, appLanguage, false);
      }
      return false;
    } catch {
      return hasMarker;
    }
  }, [activeModelId, activeStoryRecord, appLanguage, storyId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const prepared = await checkStoryPrepared();
      if (cancelled || !isMountedRef.current) return;
      setDownloadCompleted(prepared);
      if (!prepared && storyId && activeModelId && appLanguage) {
        writeStoryDownloadState(storyId, activeModelId, appLanguage, false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeModelId, appLanguage, checkStoryPrepared, storyId]);

  const characters = useMemo(() => storyDisplay.characters.map(character => {
    const rawCharacter =
      rawCharacterMap.get(Number(character.id)) ??
      ((character.rawSource ?? character) as Record<string, unknown>);

    return {
      rawSource: rawCharacter,
      id: character.id,
      isUser: character.isUser,
      name: character.isUser ? pickText(authUser?.name, profileNameRef.current, character.name, '{u}') : character.name,
      personality: character.isUser
        ? ''
        : pickText(
            rawCharacter.personality,
            character.personality,
            rawCharacter.description,
            rawCharacter.setting,
            character.setting,
            character.description,
          ),
      age: character.age,
      gender: character.gender,
      traits: character.traits,
      appearance: pickText(character.appearance, rawCharacter.appearance, character.traits, rawCharacter.traits),
      setting: character.isUser
        ? pickText(
            rawCharacter.setting,
            rawCharacter.description,
            character.setting,
            character.description,
          )
        : pickText(
            rawCharacter.personality,
            rawCharacter.setting,
            rawCharacter.description,
            character.personality,
            character.setting,
            character.description,
          ),
      description: pickText(
        rawCharacter.description,
        rawCharacter.setting,
        rawCharacter.personality,
        character.description,
        character.setting,
        character.personality,
      ),
      imageUris: character.imageUris,
    };
  }), [authUser?.name, rawCharacterMap, storyDisplay.characters]);

  const handleCharacterChatPress = useCallback((character: {
    id: string | number;
    name: string;
    personality?: string;
    description?: string;
    age?: string | number;
    gender?: string;
    traits?: string;
    imageUris?: string[];
  }) => {
    const { story: routeStory, character: routeCharacter } = buildCharacterChatNavigationParams({
      id: character.id,
      name: character.name,
      age: character.age,
      gender: character.gender,
      traits: character.traits,
      personality: character.personality,
      description: character.description,
      imageUrls: character.imageUris ?? [],
      storyId,
      storyTitle: pickText(
        activeStoryRecord.title,
        (activeStoryRecord.story_config as unknown as Record<string, unknown> | undefined)?.title,
        (story as unknown as Record<string, unknown> | undefined)?.title,
      ),
      tags: Array.isArray(activeStoryRecord.tags)
        ? activeStoryRecord.tags.filter((value): value is string => typeof value === 'string')
        : [],
      genre: String(activeStoryRecord.genre ?? ''),
    });

    navigation.navigate('Chat', {
      story: routeStory,
      character: routeCharacter,
      resumeMode: true,
    });
  }, [activeStoryRecord, navigation, story, storyId]);

  const recTitleLabel = t?.recommendedStoriesTitle ?? screenT.recommendedStoriesTitle;






  const isMyStory = isOwner(authUser, authorId);
  const authorName = isMyStory
    ? (authUser?.name || profileName || resolveDisplayName(authUser, activeStory?.author || story?.author || ''))
    : (activeStory?.author ?? activeStory?.author_nickname ?? story?.author ?? story?.author_nickname ?? '');
  const authorAvatar = isMyStory
    ? sanitizeNullableImageUrl(authUser?.photo ?? profileAvatarUri ?? null)
    : sanitizeNullableImageUrl(
      activeStory?.authorImageUrl ??
      activeStory?.author_avatar ??
      activeStory?.authorAvatar ??
      story?.authorImageUrl ??
      story?.author_avatar ??
      story?.authorAvatar ??
      null
    );
  const authorEmail = isMyStory ? (authUser?.email ?? '') : (activeStory?.author_email ?? story?.author_email ?? '');

  const handleFollowPress = useCallback(async () => {
    if (!authorId || followPending) {
      return;
    }
    setFollowPending(true);
    try {
      const nextFollowing = await toggleFollow(authorId);
      setFollowing(nextFollowing);
    } catch {
    } finally {
      setFollowPending(false);
    }
  }, [authorId, followPending, toggleFollow]);

  const handleLikePress = useCallback(() => {
    if (!story?.id) return;
    likeMutation.mutate(!liked);
  }, [story?.id, liked, likeMutation]);

  const handleReportStory = async () => {
    setMenuVisible(false);
    if (!story?.id) return;
    setReportModalVisible(true);
  };

  const handleBlockStory = async () => {
    setMenuVisible(false);
    if (!story?.id) return;
    try {
      await blockStory(String(story.id), String(story.title ?? ''), String(story.cover_url ?? story.coverUrl ?? ''));
    } catch {
    }
  };

  const handleAuthorPress = () => {
    if (!authorId) return;
    navigation.navigate('AuthorProfile', { authorId, authorName, authorAvatar: authorAvatar ?? '', authorEmail });
  };

  const handleCoverLayout = useCallback((event: any) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    if (nextWidth > 0 && nextHeight > 0) {
      setCoverLayout(prev => {
        if (Math.abs(nextWidth - prev.width) > 1 || Math.abs(nextHeight - prev.height) > 1) {
          return { width: nextWidth, height: nextHeight };
        }
        return prev;
      });
    }
  }, []);

  const handleOpenDebug = useCallback(() => {
    setMenuVisible(false);
    navigation?.navigate?.('StoryDetailDebug', {
      storyRaw: activeStoryRecord,
      storyDisplay,
      renderedCharacters: characters,
      authorId,
      authorName,
    });
  }, [activeStoryRecord, authorId, authorName, characters, navigation, storyDisplay]);

  const _handleStartPressLegacy = useCallback(async () => {
    if (!story?.id || isStarting) return;
    
    // [FIX] 모델 없을 때 알림 표시 (15개 언어 지원)
    if (!hasDownloadedActiveModel) {
      Alert.alert(
        t?.downloadModel ?? screenT.downloadModel,
        t?.downloadModelFirst ?? screenT.downloadModelFirst,
        [
          { text: t?.cancel ?? screenT.cancel, style: 'cancel' },
          {
            text: t?.goToMyPage ?? screenT.goToMyPage,
            onPress: () => navigation.navigate('MyPage')
          }
        ]
      );
      return;
    }
    
    console.log('[UIAction] 시작하기');
    setIsStarting(true);

    const cacheKey = `@story_full_${story.id}_${appLanguage}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const chapterIndex = Number(
      activeStory?.lastChapterIndex ??
      activeStory?.last_chapter_idx ??
      story?.lastChapterIndex ??
      story?.last_chapter_idx ??
      0,
    ) || 0;
    let storyToPlay = activeStory || story;
    const needsImmediateHydration = needsHydratedChatStory(storyToPlay);
    console.log('[StoryDetail] start:entry', {
      storyId: String(story?.id ?? ''),
      needsImmediateHydration,
      routeChapterCount: Array.isArray((storyToPlay as any)?.story_config?.chapters ?? (storyToPlay as any)?.chapters)
        ? (((storyToPlay as any)?.story_config?.chapters ?? (storyToPlay as any)?.chapters) as unknown[]).length
        : 0,
      routeCharacterCount: Array.isArray((storyToPlay as any)?.story_config?.characters ?? (storyToPlay as any)?.characters)
        ? (((storyToPlay as any)?.story_config?.characters ?? (storyToPlay as any)?.characters) as unknown[]).length
        : 0,
    });

    try {
      if (needsImmediateHydration) {
        setDownloadMsg(t?.loadingCache ?? screenT.loadingCache);
        const cached = appStorage.getString(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.id && Date.now() - (parsed._cachedAt ?? 0) < CACHE_TTL) {
              storyToPlay = parsed;
            }
          } catch {
            appStorage.remove(cacheKey);
          }
        }
      }

      const currentConfig = storyToPlay?.story_config ?? storyToPlay;
      const needsPreparedHydration = needsHydratedChatStory(storyToPlay)
        || !(Array.isArray(currentConfig?.chapters) && currentConfig.chapters.length > 0);
      if (needsPreparedHydration) {
        console.log('[StoryDetail] start:hydrate:begin', {
          storyId: String(story?.id ?? ''),
          currentChapterCount: Array.isArray(currentConfig?.chapters) ? currentConfig.chapters.length : 0,
          currentCharacterCount: Array.isArray(currentConfig?.characters) ? currentConfig.characters.length : 0,
        });
        setDownloadMsg(t?.downloadingStory ?? screenT.downloadingStory);
        try {
          clearDetailCache(String(story.id));
          const fetched = await StoryAPI.getStory(String(story.id), appLanguage);
          const hydration = resolveChatHydrationResult(storyToPlay, fetched);
          const fetchedConfig = (fetched as any)?.story_config ?? fetched;
          console.log('[StoryDetail] start:hydrate:result', {
            storyId: String(story?.id ?? ''),
            fetchedId: String((fetched as any)?.id ?? ''),
            fetchedChapterCount: Array.isArray(fetchedConfig?.chapters) ? fetchedConfig.chapters.length : 0,
            fetchedCharacterCount: Array.isArray(fetchedConfig?.characters) ? fetchedConfig.characters.length : 0,
            failed: hydration.failed,
          });
          storyToPlay = hydration.story;
          if (hydration.failed) {
            ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
            return;
          }
        } catch (err) {
          console.warn('[StoryDetail] Story preload failed:', err);
          const hydration = resolveChatHydrationResult(storyToPlay, null);
          storyToPlay = hydration.story;
          if (hydration.failed) {
            ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
            return;
          }
        }
      }

      const navigationHydration = resolveChatHydrationResult(storyToPlay, null);
      storyToPlay = navigationHydration.story;
      if (navigationHydration.failed) {
        ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
        return;
      }

      if (storyToPlay?.id) {
        appStorage.set(cacheKey, JSON.stringify({ ...storyToPlay, _cachedAt: Date.now() }));
      }

      console.log('[StoryDetail] start:prepared:check', {
        storyId: String(story?.id ?? ''),
      });
      const alreadyPrepared = await checkStoryPrepared(storyToPlay as Record<string, unknown>);
      console.log('[StoryDetail] start:prepared:result', {
        storyId: String(story?.id ?? ''),
        alreadyPrepared,
      });

      // [FIX] 챕터 KV 다운로드 체크 및 다운로드 - 실패 시 진입 차단
      const cfg = storyToPlay?.story_config ?? storyToPlay;
      const chapters = Array.isArray(cfg?.chapters) ? cfg.chapters : [];
      if (alreadyPrepared) {
        setDownloadCompleted(true);
      } else if (activeModelId) {
        setDownloadMsg(t?.downloading ?? screenT.downloading);
        try {
          const { default: kvCacheManager } = await import('../core/llama/KVCacheManager');
          const baseReady = await kvCacheManager.downloadBaseKVIfNeeded(activeModelId, SERVER_BASE);
          if (!baseReady) {
            throw new Error('기본 Base KV 다운로드 실패');
          }
          
          // 다운로드 후 첫 챕터 파일 존재 확인
          logger.log('[StoryDetail] base KV download complete');
          /*
          
          
            throw new Error('첫 챕터 KV 다운로드 실패');
          }
          
          logger.log('[StoryDetail] ✅ 챕터 KV 다운로드 완료');
          */
          writeStoryDownloadState(String(story.id), activeModelId, appLanguage, true);
        } catch (err) {
          console.error('[StoryDetail] Base KV download failed:', err);
          writeStoryDownloadState(String(story.id), activeModelId, appLanguage, false);
          ToastService.error(t?.downloadFailed ?? screenT.downloadFailed);
          return; // 진입 차단
        }
      }

      // ✅ [BUG-A FIX] 이미지 다운로드를 navigation.navigate 전에 실행
      // 이전: navigate 후 fire-and-forget IIFE로 다운로드 → Chat 화면에서 이미지 없음
      // 수정: navigate 전에 await로 다운로드 완료 대기
      setDownloadMsg(t?.downloadingImages ?? screenT.downloadingImages);
      const { sanitizeImageUrl } = await import('../utils/imageUrlPolicy');

      const charImages: string[] = (Array.isArray(cfg?.characters) ? cfg.characters : [])
        .filter((c: any) => {
          const charId = Number(c?.id ?? c?.char_index ?? 0);
          return charId >= 1; // 내레이션(id=0) 제외, 주인공 포함
        })
        .flatMap((c: any) => {
          const urls = Array.isArray(c?.imageUris)
            ? c.imageUris.map((v: unknown) => sanitizeImageUrl(v)).filter(Boolean)
            : [];
          if (urls.length > 0) return urls;
          const fallbackUrl = sanitizeImageUrl(c?.profileUrl ?? c?.profile_url);
          return fallbackUrl ? [fallbackUrl] : [];
        });

      const bgImages: string[] = (Array.isArray(cfg?.backgrounds) ? cfg.backgrounds : [])
        .map((bg: any) => sanitizeImageUrl(bg?.uri ?? bg?.imageUrl ?? bg?.image_url))
        .filter(Boolean)
        .slice(0, 10);

      const allImages = [...charImages, ...bgImages];
      if (allImages.length > 0) {
        try {
          await downloadImages(allImages, String(story.id));
          prefetchImageUris(allImages).catch(() => {});
          logger.log('[StoryDetail] ✅ 이미지 다운로드 완료');
        } catch (err) {
          console.warn('[ImageDownload] Failed:', err);
        }
      }

      // ✅ [BUG-B FIX] 다운로드 완료 상태 설정
      setDownloadCompleted(true);
      if (activeModelId) {
        writeStoryDownloadState(String(story.id), activeModelId, appLanguage, true);
      }

      if (jwtToken) {
        setDownloadMsg(t?.starting ?? screenT.starting);
        try {
          await StoryAPI.recordPlay(String(story.id), jwtToken);
          queryClient.invalidateQueries({ queryKey: ['my-stories', jwtToken, appLanguage], refetchType: 'active' }).catch(() => {});
        } catch (err) {
          console.warn('[StoryDetail] recordPlay failed:', err);
        }
      }

      navigation.navigate('Chat', {
        story: storyToPlay,
        resumeMode: isResume,
        lastChapterIndex: chapterIndex });
      console.log('[StoryDetail] start:navigate', {
        storyId: String(story?.id ?? ''),
        chapterCount: chapters.length,
        characterCount: Array.isArray(cfg?.characters) ? cfg.characters.length : 0,
      });
    } catch (err) {
      console.warn('[StoryDetail] Start failed:', err);
      const hydration = resolveChatHydrationResult(storyToPlay, null);
      if (!hydration.failed) {
        navigation.navigate('Chat', {
          story: hydration.story,
          resumeMode: isResume,
          lastChapterIndex: chapterIndex,
        });
      } else {
        ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
      }
    } finally {
      if (isMountedRef.current) {
        setIsStarting(false);
        setDownloadMsg('');
      }
    }
  }, [activeModelId, appLanguage, checkStoryPrepared, hasDownloadedActiveModel, isResume, jwtToken, navigation, story, t]);

  const handleStartPress = useCallback(async () => {
    if (!story?.id || isStarting) return;

    if (!hasDownloadedActiveModel) {
      Alert.alert(
        t?.downloadModel ?? screenT.downloadModel,
        t?.downloadModelFirst ?? screenT.downloadModelFirst,
        [
          { text: t?.cancel ?? screenT.cancel, style: 'cancel' },
          {
            text: t?.goToMyPage ?? screenT.goToMyPage,
            onPress: () => navigation.navigate('MyPage'),
          },
        ],
      );
      return;
    }

    logStoryDetailDebug('[UIAction] start');
    setIsStarting(true);

    const storyId = String(story.id);
    const cacheKey = `@story_full_${story.id}_${appLanguage}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const chapterIndex = Number(
      activeStory?.lastChapterIndex ??
      activeStory?.last_chapter_idx ??
      story?.lastChapterIndex ??
      story?.last_chapter_idx ??
      0,
    ) || 0;
    let storyToPlay = activeStory || story;
    const needsImmediateHydration = needsHydratedChatStory(storyToPlay);

    logStoryDetailDebug('[StoryDetail] start:entry', {
      storyId,
      needsImmediateHydration,
      routeChapterCount: Array.isArray((storyToPlay as any)?.story_config?.chapters ?? (storyToPlay as any)?.chapters)
        ? (((storyToPlay as any)?.story_config?.chapters ?? (storyToPlay as any)?.chapters) as unknown[]).length
        : 0,
      routeCharacterCount: Array.isArray((storyToPlay as any)?.story_config?.characters ?? (storyToPlay as any)?.characters)
        ? (((storyToPlay as any)?.story_config?.characters ?? (storyToPlay as any)?.characters) as unknown[]).length
        : 0,
    });

    try {
      if (needsImmediateHydration) {
        setDownloadMsg(t?.loadingCache ?? screenT.loadingCache);
        const cached = appStorage.getString(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.id && Date.now() - (parsed._cachedAt ?? 0) < CACHE_TTL) {
              storyToPlay = parsed;
            }
          } catch {
            appStorage.remove(cacheKey);
          }
        }
      }

      const currentConfig = storyToPlay?.story_config ?? storyToPlay;
      const needsPreparedHydration = needsHydratedChatStory(storyToPlay)
        || !(Array.isArray(currentConfig?.chapters) && currentConfig.chapters.length > 0);
      if (needsPreparedHydration) {
        logStoryDetailDebug('[StoryDetail] start:hydrate:begin', {
          storyId,
          currentChapterCount: Array.isArray(currentConfig?.chapters) ? currentConfig.chapters.length : 0,
          currentCharacterCount: Array.isArray(currentConfig?.characters) ? currentConfig.characters.length : 0,
        });
        setDownloadMsg(t?.downloadingStory ?? screenT.downloadingStory);
        try {
          clearDetailCache(storyId);
          const fetched = await StoryAPI.getStory(storyId, appLanguage);
          const hydration = resolveChatHydrationResult(storyToPlay, fetched);
          const fetchedConfig = (fetched as any)?.story_config ?? fetched;
          logStoryDetailDebug('[StoryDetail] start:hydrate:result', {
            storyId,
            fetchedId: String((fetched as any)?.id ?? ''),
            fetchedChapterCount: Array.isArray(fetchedConfig?.chapters) ? fetchedConfig.chapters.length : 0,
            fetchedCharacterCount: Array.isArray(fetchedConfig?.characters) ? fetchedConfig.characters.length : 0,
            failed: hydration.failed,
          });
          storyToPlay = hydration.story;
          if (hydration.failed) {
            ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
            return;
          }
        } catch (err) {
          warnStoryDetailDebug('[StoryDetail] Story preload failed:', err);
          const hydration = resolveChatHydrationResult(storyToPlay, null);
          storyToPlay = hydration.story;
          if (hydration.failed) {
            ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
            return;
          }
        }
      }

      const navigationHydration = resolveChatHydrationResult(storyToPlay, null);
      storyToPlay = navigationHydration.story;
      if (navigationHydration.failed) {
        ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
        return;
      }

      if (storyToPlay?.id) {
        appStorage.set(cacheKey, JSON.stringify({ ...storyToPlay, _cachedAt: Date.now() }));
      }

      logStoryDetailDebug('[StoryDetail] start:prepared:check', { storyId });
      const alreadyPrepared = await checkStoryPrepared(storyToPlay as Record<string, unknown>);
      logStoryDetailDebug('[StoryDetail] start:prepared:result', { storyId, alreadyPrepared });

      const cfg = storyToPlay?.story_config ?? storyToPlay;
      const chapters = Array.isArray(cfg?.chapters) ? cfg.chapters : [];
      if (alreadyPrepared) {
        setDownloadCompleted(true);
      } else if (activeModelId) {
        setDownloadMsg(t?.downloading ?? screenT.downloading);
        try {
          const { default: kvCacheManager } = await import('../core/llama/KVCacheManager');
          const baseReady = await kvCacheManager.downloadBaseKVIfNeeded(activeModelId, SERVER_BASE);
          if (!baseReady) {
            throw new Error('base_kv_download_failed');
          }

          logger.log('[StoryDetail] base KV download complete');
          writeStoryDownloadState(storyId, activeModelId, appLanguage, true);
        } catch (err) {
          errorStoryDetailDebug('[StoryDetail] Base KV download failed:', err);
          writeStoryDownloadState(storyId, activeModelId, appLanguage, false);
          ToastService.error(t?.downloadFailed ?? screenT.downloadFailed);
          return;
        }
      }

      const { sanitizeImageUrl } = await import('../utils/imageUrlPolicy');
      const charImages: string[] = (Array.isArray(cfg?.characters) ? cfg.characters : [])
        .filter((c: any) => Number(c?.id ?? c?.char_index ?? 0) >= 1)
        .flatMap((c: any) => {
          const urls = Array.isArray(c?.imageUris)
            ? c.imageUris.map((value: unknown) => sanitizeImageUrl(value)).filter(Boolean)
            : [];
          if (urls.length > 0) return urls;
          const fallbackUrl = sanitizeImageUrl(c?.profileUrl ?? c?.profile_url);
          return fallbackUrl ? [fallbackUrl] : [];
        });
      const bgImages: string[] = (Array.isArray(cfg?.backgrounds) ? cfg.backgrounds : [])
        .map((bg: any) => sanitizeImageUrl(bg?.uri ?? bg?.imageUrl ?? bg?.image_url))
        .filter(Boolean)
        .slice(0, 10);
      const allImages = [...charImages, ...bgImages];

      setDownloadCompleted(true);
      if (activeModelId) {
        writeStoryDownloadState(storyId, activeModelId, appLanguage, true);
      }

      const adapterSelection = activeModelId
        ? storyAdapterManager.resolveStoryAdapterSelection({
            story: storyToPlay,
            storyId,
            modelId: activeModelId,
            appLanguage,
            serverUrl: SERVER_BASE,
          })
        : null;

      if (adapterSelection) {
        storyAdapterManager.ensureLanguageAdapterPack({
          modelId: adapterSelection.modelId,
          language: adapterSelection.language,
          serverUrl: SERVER_BASE,
          bestEffort: !adapterSelection.engineSupportReady,
        }).catch((error) => {
          warnStoryDetailDebug('[StoryDetail] adapter prefetch failed:', error);
        });
      }

      navigation.navigate('Chat', {
        story: storyToPlay,
        resumeMode: isResume,
        lastChapterIndex: chapterIndex,
        adapterSelection: adapterSelection ?? undefined,
      });
      logStoryDetailDebug('[StoryDetail] start:navigate', {
        storyId,
        chapterCount: chapters.length,
        characterCount: Array.isArray(cfg?.characters) ? cfg.characters.length : 0,
      });

      if (allImages.length > 0) {
        prefetchImageUris(allImages).catch(() => {});
        setTimeout(() => {
          downloadImages(allImages, storyId)
            .then(() => {
              logger.log('[StoryDetail] image download complete');
            })
            .catch((err) => {
              warnStoryDetailDebug('[ImageDownload] Failed:', err);
            });
        }, 48);
      }

      if (jwtToken) {
        setTimeout(() => {
          StoryAPI.recordPlay(storyId, jwtToken)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['my-stories', jwtToken, appLanguage], refetchType: 'active' }).catch(() => {});
            })
            .catch((err) => {
              warnStoryDetailDebug('[StoryDetail] recordPlay failed:', err);
            });
        }, 0);
      }
    } catch (err) {
      warnStoryDetailDebug('[StoryDetail] Start failed:', err);
      const hydration = resolveChatHydrationResult(storyToPlay, null);
      if (!hydration.failed) {
        const fallbackAdapterSelection = activeModelId
          ? storyAdapterManager.resolveStoryAdapterSelection({
              story: hydration.story,
              storyId,
              modelId: activeModelId,
              appLanguage,
              serverUrl: SERVER_BASE,
            })
          : null;
        navigation.navigate('Chat', {
          story: hydration.story,
          resumeMode: isResume,
          lastChapterIndex: chapterIndex,
          adapterSelection: fallbackAdapterSelection ?? undefined,
        });
      } else {
        ToastService.error(t?.storyLoadFailed ?? screenT.storyLoadFailed);
      }
    } finally {
      if (isMountedRef.current) {
        setIsStarting(false);
        setDownloadMsg('');
      }
    }
  }, [activeModelId, activeStory, appLanguage, checkStoryPrepared, hasDownloadedActiveModel, isResume, isStarting, jwtToken, navigation, queryClient, story, t]);

  const baseCount = activeStory?.likeCount ?? activeStory?.like_count ?? story?.likeCount ?? story?.like_count ?? 0;
  const likeCount = likeCountState !== null
    ? likeCountState
    : baseCount + (liked && !activeStory?.isLiked ? 1 : !liked && activeStory?.isLiked ? -1 : 0);
  const viewCount = activeStory?.viewCount ?? activeStory?.view_count ?? story?.viewCount ?? story?.view_count ?? 0;
  const tags: string[] = storyDisplay.tags;
  const detailTitle = useMemo(() => {
    const text = pickText(storyDisplay.title, activeStory?.title, story?.title);
    return text.replace(/\{[Uu]\}/g, profileName || defaultUserName);
  }, [storyDisplay.title, activeStory?.title, story?.title, profileName]);
  const worldSettingText = useMemo(() => {
    const text = storyDisplay.worldSetting;
    return text.replace(/\{[Uu]\}/g, profileName || defaultUserName);
  }, [storyDisplay.worldSetting, profileName]);
  const detailDescription = useMemo(() => {
    const text = pickText(storyDisplay.description, activeStory?.description, story?.description);
    return text.replace(/\{[Uu]\}/g, profileName || defaultUserName);
  }, [storyDisplay.description, activeStory?.description, story?.description, profileName]);
  const detailTagsText = useMemo(() => tags.map(tag => `#${String(tag).replace(/^#/, '')}`).join(' '), [tags]);
  const heroMetaMaxHeight = useMemo(
    () => (coverLayout.height > 0 ? Math.floor(coverLayout.height * 0.3) : 140),
    [coverLayout.height],
  );
  const detailDescriptionLines = 2;
  const publishedDate = formatDate(activeStory?.createdAt || activeStory?.created_at || story?.createdAt || story?.created_at);
  const authorSectionTitleSafe = authorSectionTitle;
  const handleRefresh = useCallback(() => {
    if (!refetch) return;
    setRefreshing(true);
    refetch()
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) {
          setRefreshing(false);
        }
      });
  }, [refetch]);

  if (!story?.id && !storyFetching) {
    return (
      <SafeAreaView style={st.safeArea}>
        <View style={st.guardWrap}>
          <Text style={st.guardText}>{t?.invalidAccess ?? screenT.invalidAccess}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safeArea} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView style={st.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent}>

        {/* Hero */}
        <View style={st.heroCard}>
          <View
            style={st.coverWrap}
            onLayout={handleCoverLayout}
          >
            {coverUrls.length > 1 ? (
              <ScrollView
                ref={coverScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                onMomentumScrollEnd={event => {
                  const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                  setCoverIdx(nextIndex);
                }}
              >
                {coverUrls.map((url, i) => (
                  <Pressable
                    key={i}
                    onPress={() => { setCoverViewerVisible(true); }}
                    style={{ width, height: '100%' }}
                  >
                    <Image source={{ uri: url }} style={st.coverImage} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" transition={0} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : coverUrls.length === 1 ? (
              <Pressable style={st.singleCoverPressable} onPress={() => { setCoverViewerVisible(true); }}>
                <Image source={{ uri: coverUrls[0] }} style={st.coverImage} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" transition={0} />
              </Pressable>
            ) : (
              <View style={[st.coverImage, st.coverFallback]} />
            )}

            {coverUrls.length > 1 && (
              <View style={[st.coverCounter, { top: Math.max(insets.top + 12, 18) }]}>
                <Text style={st.coverCounterText}>{coverIdx + 1} / {coverUrls.length}</Text>
              </View>
            )}

            {coverLayout.width > 0 && coverLayout.height > 0 ? (
              <LinearGradient
                pointerEvents="none"
                colors={[
                  `rgba(${APP_NAV_RGB},0)`,
                  `rgba(${APP_NAV_RGB},0.04)`,
                  `rgba(${APP_NAV_RGB},0.1)`,
                  `rgba(${APP_NAV_RGB},0.2)`,
                  `rgba(${APP_NAV_RGB},0.34)`,
                  `rgba(${APP_NAV_RGB},0.52)`,
                  `rgba(${APP_NAV_RGB},0.72)`,
                  `rgba(${APP_NAV_RGB},0.88)`,
                  `rgba(${APP_NAV_RGB},1)`,
                ]}
                locations={[0, 0.08, 0.18, 0.32, 0.5, 0.68, 0.84, 0.94, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={st.coverGradient}
              />
            ) : null}

            <View style={st.heroOverlayContent} pointerEvents="box-none">
              {coverUrls.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={st.coverThumbRow}
                  style={st.coverThumbScroller}
                >
                  {coverUrls.map((url, index) => (
                    <TouchableOpacity
                      key={`thumb-${index}`}
                      style={[st.coverThumbButton, coverIdx === index && st.coverThumbButtonActive]}
                      onPress={() => {
                        setCoverIdx(index);
                        coverScrollRef.current?.scrollTo({ x: width * index, animated: true });
                      }}
                      activeOpacity={1}
                      scaleDown={0.992}
                    >
                      <Image source={{ uri: url }} style={st.coverThumbImage} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View
                style={[
                  st.heroMetaOverlay,
                  { height: 140 },
                ]}
              >
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                  contentContainerStyle={{ paddingBottom: 12 }}
                >
                  <View style={st.heroTextBlock}>
                    {storyFetching && !detailDescription ? (
                      <View style={st.storyDescSkeleton} />
                    ) : (
                      <Text style={st.storyDesc}>
                        {detailDescription}
                      </Text>
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </View>

          <View style={st.statsRowBetween}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={st.statBadgeHorizontal}
                onPress={() => { triggerHaptic('medium'); handleLikePress(); }}
              >
                <View style={st.statBadgeInner}>
                  <Heart size={12} color="#FFFFFF" fill={liked ? '#FFFFFF' : 'none'} />
                  <Text style={st.statBadgeTxt}>{formatCount(likeCount, appLanguage)}</Text>
                </View>
              </TouchableOpacity>
              <View style={st.statBadgeHorizontal}>
                <View style={st.statBadgeInner}>
                  <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                  <Text style={st.statBadgeTxt}>{formatCount(viewCount, appLanguage)}</Text>
                </View>
              </View>
            </View>
            {!!detailTagsText && (
              <Text style={st.tagTextLineHorizontal} numberOfLines={1} ellipsizeMode="tail">
                {detailTagsText}
              </Text>
            )}
          </View>

        </View>

        {!!worldSettingText && (
          <View style={st.heroFooter}>
            <View style={st.worldInlineWrap}>
              <Text style={st.worldSettingTxt}>
                {worldSettingText}
              </Text>
            </View>
          </View>
        )}








































































































        {/* Characters */}
        {(characters.length > 0 || storyFetching) && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>{t?.charInfo ?? screenT.charInfo}</Text>
            {storyFetching && (
              <Text style={st.loadingText}>{t?.loading ?? screenT.loading}</Text>
            )}
            <StoryDetailCharacterCards
              characters={characters}
              applyName={(value?: string) => (value ?? '').replace(/\{[Uu]\}/g, profileName || defaultUserName)}
              appLanguage={appLanguage}
              worldSetting={worldSettingText}
              onChatPress={handleCharacterChatPress}
              chatLabel={String(t?.startChat ?? t?.start ?? '')}
            />
          </View>
        )}

        <View style={st.section}>
          {/* ── 작가 한 줄: [작가] [링이미지] [이름/날짜] [팔로우] ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' }}>

            {/* "작가" 레이블 */}
            <Text style={[st.sectionTitleRec, { marginBottom: 0, alignSelf: 'center' }]}>{authorSectionTitleSafe}</Text>

            {/* 아바타 글로우 링 */}
            <TouchableOpacity onPress={handleAuthorPress} activeOpacity={0.85} style={{ flexShrink: 0 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, shadowColor: '#B57BFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 14, elevation: 10 }}>
                <LinearGradient
                  colors={['#E8C060', '#C084FC', '#8B5CF6', '#C084FC', '#E8C060']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 42, height: 42, borderRadius: 21, padding: 1.5, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ width: 39, height: 39, borderRadius: 19.5, overflow: 'hidden', backgroundColor: '#181820' }}>
                    {authorAvatar ? (
                      <Image source={{ uri: authorAvatar }} style={{ width: 39, height: 39 }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    ) : (
                      <View style={{ width: 39, height: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181820' }}>
                        <Text style={{ fontSize: 16, color: '#8A8A9E', fontFamily: Typography.fontFamily.bold }}>{authorName.charAt(0).toUpperCase() || '?'}</Text>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </View>
            </TouchableOpacity>

            {/* 이름 + 날짜 */}
            <TouchableOpacity onPress={handleAuthorPress} activeOpacity={0.85} style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 16,
                  fontFamily: Typography.fontFamily.semibold,
                  color: '#E8C060',
                  textShadowColor: 'rgba(167, 90, 255, 0.9)',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 12,
                }}
              >{authorName}</Text>
              <Text style={{ fontSize: 13, color: '#8A8A9E', fontFamily: Typography.fontFamily.regular }}>{publishedDate}</Text>
            </TouchableOpacity>

            {/* 팔로우 버튼 */}
            {!!authorId && (
              <TouchableOpacity
                style={[st.followBtnBox, following && st.followBtnBoxActive, (followPending || isMyStory) && st.followBtnBoxDisabled]}
                onPress={handleFollowPress}
                activeOpacity={0.85}
                disabled={followPending || isMyStory}
              >
                <Text style={[st.followBtnBoxTxt, following && st.followBtnBoxTxtActive]}>
                  {following ? (t?.followingBtn ?? screenT.followingBtn) : (t?.followBtn ?? screenT.followBtn)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Recommended stories */}
        <Animated.View entering={FadeInDown.delay(220).springify()} style={st.section}>
          <Text style={st.sectionTitleRec}>{recTitleLabel}</Text>
          {recLoading ? (
            <SkeletonDetailRec count={4} />
          ) : rankedRecommended.length === 0 ? (
            <Text style={st.emptyRecText}>{t?.noRecommendedStories ?? screenT.noRecommendedStories}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.recScroll}>
              {rankedRecommended.map((rcItem: RankableStory) => (
                <View key={rcItem.id} style={st.recCardAuto}>
                  <StoryCard
                    story={rcItem as unknown as Record<string, unknown>}
                    onPress={() => navigation.push('StoryDetail', { story: rcItem })}
                    appLanguage={appLanguage}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </ScrollView>

      {/* Floating header */}
      <View style={[st.headerAbs, { top: Math.max(insets.top + 2, 10) }, isRTL && st.rowReverse]} pointerEvents="box-none">
        <TouchableOpacity style={st.headerBtnTrans} onPress={() => navigation.goBack()}
          accessibilityLabel={screenT.a11yBack} accessibilityRole="button">
          {isRTL ? <ChevronRight size={26} color={'#fff'} /> : <ChevronLeft size={26} color={'#fff'} />}
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={st.headerBtnTrans} onPress={() => setMenuVisible(true)}
          accessibilityLabel={screenT.a11yMoreOptions} accessibilityRole="button">
          <MoreVertical size={24} color={'#fff'} />
        </TouchableOpacity>
      </View>

      <View style={[st.startBarWrap, { paddingBottom: Math.max(insets.bottom, 8), paddingTop: 0 }]}>
        <TouchableOpacity
          style={[
            st.startBtnContainer, 
            isDownloading && { 
              backgroundColor: 'transparent', 
              shadowOpacity: 0,
              elevation: 0,
              borderWidth: 0,
            }
          ]}
          onPress={handleStartPress}
          disabled={isStarting || isDownloading}
          activeOpacity={1}
          scaleDown={0.992}
          accessibilityRole="button"
          accessibilityLabel={
            isDownloading 
              ? (t?.downloading ?? screenT.downloading) 
              : downloadCompleted 
                ? (t?.startStory ?? screenT.startStory) 
                : isStarting 
                  ? (downloadMsg ?? t?.loading) 
                  : (t?.startStory ?? screenT.startStory)
          }
        >
          {/* 다운로드 중일 때는 테두리만 표시 */}
          {isDownloading ? (
            <View style={st.startBtnBorder}>
              <View style={st.startTitleOnlyRow}>
                <View style={st.startTitleInline}>
                  <Text style={[st.startTitleText, { color: '#D6AB4D' }]} numberOfLines={1}>
                    {downloadProgress}%
                  </Text>
                </View>
              </View>
              {/* 진행률 표시용 오버레이 그라데이션 */}
              <View style={[st.progressOverlay, { width: `${downloadProgress}%` }]} pointerEvents="none">
                <LinearGradient
                  colors={['#F0D38A', '#C89D3E', '#A77AF6']}
                  start={{ x: 0, y: 0.08 }}
                  end={{ x: 1, y: 0.92 }}
                  style={st.progressGradientFill}
                />
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={['#F0D38A', '#C89D3E', '#A77AF6']}
              start={{ x: 0, y: 0.08 }}
              end={{ x: 1, y: 0.92 }}
              style={st.startBtnGradient}
            >
              {downloadCompleted ? (
                <View style={st.startTitleOnlyRow}>
                  <View style={st.startTitleInline}>
                    <Text style={st.startTitleText} numberOfLines={1}>
                      {t?.startStory ?? screenT.startStory}
                    </Text>
                    <View style={st.startTitleIconWrap}>
                      <Play size={18} color="#CBB8FF" fill="#CBB8FF" />
                    </View>
                  </View>
                </View>
              ) : isStarting ? (
                <View style={st.loadingContainer}>
                  <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={st.startBtnText}>{downloadMsg ?? t?.loading}</Text>
                </View>
              ) : (
                <View style={st.startTitleOnlyRow}>
                  {!!detailTitle && (
                    <View style={st.startTitleInline}>
                      <Text style={st.startTitleText} numberOfLines={1}>
                        {detailTitle}
                      </Text>
                      <View style={st.startTitleIconWrap}>
                        <Play size={18} color="#CBB8FF" fill="#CBB8FF" />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      {/* More menu */}
        <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <TouchableOpacity style={st.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}
            accessibilityLabel={screenT.a11yCloseMenu} accessibilityRole="button">
            <View style={st.menuBox}>
            {__DEV__ ? (
              <>
                <TouchableOpacity style={st.menuItem} onPress={handleOpenDebug}
                  accessibilityLabel={STORY_DETAIL_DEBUG_MENU_A11Y} accessibilityRole="button">
                  <Text style={st.menuItemText}>{STORY_DETAIL_DEBUG_MENU_LABEL}</Text>
                </TouchableOpacity>
                <View style={st.menuDivider} />
              </>
            ) : null}
            <TouchableOpacity style={st.menuItem} onPress={handleReportStory}
              accessibilityLabel={screenT.a11yReportStory} accessibilityRole="button">
              <Text style={st.menuItemText}>{t?.reportStory ?? screenT.a11yReportStory}</Text>
            </TouchableOpacity>
            <View style={st.menuDivider} />
            <TouchableOpacity style={st.menuItem} onPress={handleBlockStory}
              accessibilityLabel={screenT.a11yBlockStory} accessibilityRole="button">
              <Text style={[st.menuItemText, { color: '#FF5555' }]}>{t?.blockStory ?? screenT.a11yBlockStory}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cover image viewer */}
        <PremiumImageViewer
          visible={coverViewerVisible}
          images={coverUrls}
          initialIndex={coverIdx}
          mode="storyCover"
          charInfo={{
            name: detailTitle,
            personality: detailDescription,
            genre: String(activeStory?.genre ?? ''),
            tags,
            likeCount,
            playerCount: viewCount,
          }}
          onClose={() => setCoverViewerVisible(false)}
        />

      {/* Report modal */}
      {story?.id && (
        <ReportModal
          visible={reportModalVisible}
          targetType="story"
          targetId={String(story.id)}
          onClose={() => setReportModalVisible(false)}
        />
      )}

      {/* Starting overlay - 제거: 하단 바만 사용 */}
    </SafeAreaView>
  );
}

export const StoryDetailScreen = memo(StoryDetailScreenComponent);
StoryDetailScreen.displayName = 'StoryDetailScreen';

const st = StyleSheet.create({
  coverNavLeft: { left: 12 },
  coverNavRight: { right: 12 },
  charNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  charImgScroll: { gap: 8, paddingRight: 16 },
  recScroll: { gap: 10, paddingRight: 16 },
  safeArea: { flex: 1, backgroundColor: APP_NAV_TONE },
  guardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  guardText: { color: '#F0F0F5', fontSize: 14, textAlign: 'center' },
  scroll: { flex: 1, backgroundColor: APP_NAV_TONE },

  headerAbs: {
    position: 'absolute', top: 50, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 52, zIndex: 10
  },
  headerBtnTrans: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(98,102,114,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)' },

  heroCard: {
    marginHorizontal: 0,
    backgroundColor: APP_NAV_TONE,
    borderRadius: 0,
    overflow: 'hidden',
    shadowOpacity: 0,
    elevation: 0 },
  coverWrap: { width: '100%', aspectRatio: 3 / 4, position: 'relative', backgroundColor: APP_NAV_TONE, justifyContent: 'flex-end' },
  singleCoverPressable: { flex: 1 },
  coverImage: { width: '100%', height: '100%' },
  coverFallback: { backgroundColor: APP_NAV_TONE },
  coverNavBtn: {
    position: 'absolute', top: '42%',
    width: 36, height: 36, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)'
  },
  coverCounter: {
    position: 'absolute',
    top: 18,
    right: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(98,102,114,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)' },
  coverTapTarget: { ...StyleSheet.absoluteFillObject },
  coverCounterText: { color: '#FFFFFF', fontSize: 12, fontFamily: Typography.fontFamily.semibold },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 124,
  },
  heroOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 0,
    paddingTop: 24 },
  heroMetaOverlay: {
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
    borderRadius: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: 'rgba(12,10,24,0.48)',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  statsRowBetween: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: APP_NAV_TONE,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroMetaHandleDock: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    zIndex: 3,
  },
  heroMetaHandlePressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetaHandlePressablePressed: {
    opacity: 0.9,
  },
  heroMetaHandleShape: {
    width: 78,
    height: 22,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    backgroundColor: 'rgba(98,102,114,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ skewX: '-14deg' }],
  },
  heroMetaHandleGrip: {
    width: 24,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.68)',
    transform: [{ skewX: '14deg' }],
  },
  heroCopyBlock: {
    gap: 10 },
  coverThumbScroller: { marginBottom: 16 },
  coverThumbRow: { gap: 8, paddingRight: 12 },
  coverThumbButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)' },
  coverThumbButtonActive: {
    borderColor: 'rgba(255,255,255,0.72)' },
  coverThumbImage: {
    width: '100%',
    height: '100%' },
  heroFooter: {
    marginTop: 0,
    backgroundColor: APP_NAV_TONE,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6 },
  titleRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  infoToggleHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  infoToggleHeaderTxt: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  storyTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.5 },
  heroTextBlock: {
    marginTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 2 },
  infoCard: {
    borderRadius: 18,
    backgroundColor: '#0C0C13',
    borderWidth: 1,
    borderColor: '#1B1B26',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12 },
  heroTitle: {
    fontSize: 26,
    lineHeight: 34,
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.extrabold,
    marginBottom: 10,
    includeFontPadding: false },
  storyDesc: {
    marginTop: 2,
    fontSize: 18,
    color: 'rgba(210,218,232,0.78)',
    lineHeight: 27,
    fontFamily: Typography.fontFamily.regular,
    includeFontPadding: false },
  storyDescSkeleton: {
    marginTop: 4,
    height: 54,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)' },
  worldInlineWrap: { marginTop: 10, gap: 4 },
  tagTextLine: {
    fontSize: 14,
    color: '#D0D6DF',
    fontFamily: Typography.fontFamily.medium,
    marginTop: 0,
    lineHeight: 21 },
  tagTextLineHorizontal: {
    fontSize: 13,
    color: '#D0D6DF',
    fontFamily: Typography.fontFamily.medium,
    lineHeight: 16,
    flex: 1,
  },
  metaRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10 },
  metaSpacer: { flex: 1 },
  statsRowOut: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 2, flexWrap: 'nowrap' },
  statBadgeHorizontal: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  statBadgeInner: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
  statBadgeTxt: { fontSize: 13, lineHeight: 16, color: '#FFFFFF', fontFamily: Typography.fontFamily.semibold, includeFontPadding: false },

  situationSection: { paddingHorizontal: 20, marginTop: 12 },
  situationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  situationTitle: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  situationIcon: { fontSize: 18 },
  situationBox: { borderLeftWidth: 3, borderLeftColor: '#4A4A5C', paddingLeft: 14, paddingVertical: 4 },
  worldSettingTxt: {
    marginTop: 2,
    paddingHorizontal: 0,
    fontSize: 15,
    color: '#D8DDE6',
    lineHeight: 23,
    fontFamily: Typography.fontFamily.regular },

  section: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, borderBottomWidth: 0, borderTopWidth: 0, marginTop: 10 },
  sectionTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 14 },
  sectionTitleRec: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 16 },
  loadingText: { color: '#888', fontSize: 13, marginBottom: 10, fontFamily: Typography.fontFamily.regular },

  charRow: { paddingBottom: 18, marginBottom: 18 },
  charRowBorder: { borderBottomWidth: 0.5, borderBottomColor: '#1A1A24' },
  charName: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  userBadge: { backgroundColor: 'rgba(74,222,128,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  userBadgeText: { color: '#4ADE80', fontSize: 10, fontFamily: Typography.fontFamily.bold },
  charImg: { width: width * 0.32, height: width * 0.43, borderRadius: Radius.md, borderWidth: 1, borderColor: '#181820' },
  charImgPlaceholderRow: { flexDirection: 'row', marginBottom: 10 },
  charImgPlaceholder: { width: width * 0.32, height: width * 0.43, borderRadius: Radius.md, backgroundColor: '#111118', alignItems: 'center', justifyContent: 'center' },
  charImgPlaceholderTxt: { fontSize: 32, color: '#757585', fontFamily: Typography.fontFamily.bold },
  charDesc: { fontSize: 13, color: '#8A8A9E', lineHeight: 20, marginBottom: 6, fontFamily: Typography.fontFamily.regular },
  charExample: { fontSize: 12, color: '#797990', lineHeight: 18, fontStyle: 'italic', marginBottom: 6, fontFamily: Typography.fontFamily.regular },
  charMeta: { fontSize: 11, color: '#797990', fontFamily: Typography.fontFamily.regular },

  authorRowLayout: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6, width: '100%', flexWrap: 'nowrap' },
  authorIdentityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexBasis: 0,
  },
  
  authorAvatarLarge: { width: 50, height: 50, borderRadius: 25, flexShrink: 0 },
  authorAvatarPlaceholder: { backgroundColor: '#181820', alignItems: 'center', justifyContent: 'center' },
  authorInitial: { fontSize: 20, color: '#8A8A9E', fontFamily: Typography.fontFamily.bold },
  // Simplified author row (no boxes)
  authorAvatarGlowWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    flexShrink: 0,
    shadowColor: '#B57BFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1.0,
    shadowRadius: 18,
    elevation: 12,
  },
  authorAvatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 1.5,
  },
  authorAvatarInner: {
    width: 49,
    height: 49,
    borderRadius: 24.5,
    overflow: 'hidden',
    backgroundColor: '#181820',
  },
  authorAvatarFill: { width: 49, height: 49 },
  authorAvatarSimple: { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
  authorNameSimple: { fontSize: 15, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5' },
  authorInfoBox: {
    flex: 0,
    gap: 2,
    justifyContent: 'center',
    paddingLeft: 10,
  },
  
  authorNameLarge: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  authorDateInfo: { fontSize: 11, color: '#6A6A7C', fontFamily: Typography.fontFamily.regular },
  followBtnBox: { minWidth: 86, height: 34, borderRadius: 10, backgroundColor: '#6D4AFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 0, marginLeft: 'auto', flexShrink: 0 },
  followBtnBoxActive: { backgroundColor: 'rgba(109,74,255,0.16)', borderWidth: 1.5, borderColor: '#6D4AFF' },
  followBtnBoxDisabled: { opacity: 0.6 },
  followBtnBoxTxt: { fontSize: 13, color: '#fff', fontFamily: Typography.fontFamily.bold },
  followBtnBoxTxtActive: { color: '#CFC3FF' },

  recCoverAutoWrapLegacy: { width: '100%', height: width * 0.54, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#0C0C14', position: 'relative' },
  recCoverAutoLegacy: { width: '100%', height: '100%' },
  recTagsGlowLegacy: { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#8A8A9E' },
  emptyRecTextLegacy: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.regular },

  userRowPremium: { marginBottom: 20 },
  charImgWrapper: { width: 100, height: 130, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  charImgLarge: { width: 100, height: 130 },
  charImgCounter: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  charImgCounterTxt: { fontSize: 10, color: '#FFF', fontFamily: Typography.fontFamily.bold },
  charImgSquare: { width: 80, height: 80, borderRadius: 10 },
  userInfoPremium: { flex: 1, marginLeft: 16 },
  charAgeGray: { fontSize: 12, color: '#888' },
  npcRowPremium: { marginBottom: 20 },
  npcHeaderRow: { flexDirection: 'row' },
  npcInfoCol: { flex: 1, marginLeft: 16 },
  npcEmotionBox: { marginTop: 8 },
  npcBodyCol: { marginTop: 12 },
  recCardAuto: { width: width * 0.42, marginRight: 12 },
  recCoverAutoWrap: { width: '100%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#0C0C14', position: 'relative' },
  recCoverAuto: { width: '100%', height: '100%' },
  recDescGlow: { fontSize: 12, lineHeight: 18, fontFamily: Typography.fontFamily.regular, color: '#C6CAD8' },
  recTagsGlow: { fontSize: 11, lineHeight: 16, fontFamily: Typography.fontFamily.medium, color: '#8A8A9E' },
  emptyRecText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.regular },

  recTextBelow: { paddingTop: 10, gap: 4 },
  recTitleGlow: { fontSize: 14, lineHeight: 19, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', textShadowColor: 'rgba(255,255,255,0.25)', textShadowRadius: 4 },
  recTopLeftPill: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.52)' },
  recTopRightPill: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.52)' },
  recTopPillText: { fontSize: 10, color: '#FFFFFF', fontFamily: Typography.fontFamily.semibold },

  statsOverlayTop: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignItems: 'center' },
  statItemTop: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statTxtTop: { fontSize: 10, color: '#C8C8D4', fontFamily: Typography.fontFamily.semibold },

  statsOverlayHome: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 8, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statItemHome: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTxtHome: { fontSize: 11, color: '#fff', fontFamily: Typography.fontFamily.semibold },

  authorNameLargeGlow: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#E6C46A',
    textShadowColor: 'rgba(138,92,246,0.42)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  charRowLong: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  charImgLong: { width: 80, height: 110, borderRadius: 10, backgroundColor: '#111' },
  charInfoLong: { flex: 1, gap: 4 },
  charNameLong: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  charMetaLong: { fontSize: 12, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },
  charTraitLong: { fontSize: 13, color: '#C8C8D4', lineHeight: 18 },
  charSpeechLong: { fontSize: 12, color: '#797990', fontStyle: 'italic' },
  charChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  charChatBtnTxt: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  userBadgeSmall: { backgroundColor: 'rgba(74,222,128,0.1)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: 'rgba(74,222,128,0.3)' },
  userBadgeTxtSmall: { fontSize: 9, color: '#4ADE80', fontFamily: Typography.fontFamily.bold },

  startBarWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 8,
    backgroundColor: APP_NAV_TONE },
  startTitleOnlyRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTitleInline: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '92%',
    width: '100%',
    minHeight: 26,
    paddingHorizontal: 34,
  },
  startTitleText: {
    color: '#FFF8E8',
    fontSize: 19,
    lineHeight: 23,
    fontFamily: Typography.fontFamily.extrabold,
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  startTitleIconWrap: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -9,
  },
  startBtnContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#D6AB4D',
    width: '100%',
    elevation: 6,
    shadowColor: '#D6AB4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(214, 171, 77, 0.3)',
  },
  startBtnBorder: {
    width: '100%',
    height: 38,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#D6AB4D',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    borderRadius: 14, // borderRadius - borderWidth
  },
  progressGradientFill: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startBtnDisabled: { opacity: 0.5 },
  downloadMsgTxt: { fontSize: 11, color: '#797990', textAlign: 'center', marginBottom: 8, fontFamily: Typography.fontFamily.regular },
  startBtnGradient: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    width: '100%',
    height: 38,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { fontSize: 18, fontFamily: Typography.fontFamily.black, color: '#050507', letterSpacing: 0.5 },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 64, paddingRight: 16 },
  menuBox: { backgroundColor: '#0C0C14', borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)', minWidth: 170, overflow: 'hidden', elevation: 14 },
  menuItem: { paddingHorizontal: 20, paddingVertical: 15 },
  menuItemText: { fontSize: 14, color: '#C0C0D0', fontFamily: Typography.fontFamily.regular },
  menuDivider: { height: 0.5, backgroundColor: '#181820' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight: { textAlign: 'right' },
  scrollContent: { paddingBottom: 112, backgroundColor: APP_NAV_TONE },

  startingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, alignItems: 'center', justifyContent: 'center' },
  startingContent: { gap: 20, alignItems: 'center' },
  startingMsg: { color: '#F0F0F5', fontSize: 16, fontFamily: Typography.fontFamily.bold } });
