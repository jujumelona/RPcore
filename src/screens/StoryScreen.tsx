import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import type { TabScreenProps } from '../types/navigation';
import { Alert,
  View,
  Text,
  StyleSheet,
  TextInput,
  RefreshControl,
  Vibration,
  ScrollView,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import Animated, { FadeIn, FadeInUp, Layout } from 'react-native-reanimated';
import { BookOpen, CheckCircle2, ChevronRight, Circle, FileText, Play, RefreshCw, Search, Trash2, X } from 'lucide-react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { Radius, Typography } from '../constants/tokens';
import { EmptyState } from '../components/EmptyState';
import { SkeletonStoryRow } from '../components/ui/Skeleton';
import { useTranslation } from '../hooks/useTranslation';
import { useLanguageStore } from '../store/languageStore';
import { useUserProfileStore } from '../store/userProfileStore';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useModelStore } from '../store/modelStore';
import { StoryAPI } from '../api/StoryAPI';
import { authedFetch } from '../utils/authedFetch';
import { appStorage } from '../utils/storage';
import { deleteWebNovels, getWebNovelList } from '../utils/webNovelStorage';
import { triggerHaptic } from '../utils/haptics';
import { cleanupStoryData } from '../utils/storyDataCleanup';
import { WideStoryCardFrame } from '../components/StoryCard';
import { ToastService } from '../components/Toast';
import { getModelBadgeMeta, resolveStoryModelId } from '../utils/storyModelMeta';
import { extractCoverUrl,
  extractLocalizedStoryFields,
  extractStoryTags,
  parseStoryConfig,
  pickString } from './home/utils/storyHelpers';
import { getStoryGenreLabel, normalizeStoryGenre } from '../utils/storyGenres';

type WebNovelMeta = ReturnType<typeof getWebNovelList>[number];
const HIDDEN_PLAYED_STORIES_KEY = '@hidden_played_story_ids';

/** 장르명을 번역된 이름으로 변환 (예: "Romance" → "로맨스") */
function translateGenre(genre: string, t?: ReturnType<typeof useTranslation>): string {
  return getStoryGenreLabel(genre, t as Record<string, string | undefined>);
}

function parseStoredRecord(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readHiddenPlayedStoryIds(): string[] {
  const raw = appStorage.getString(HIDDEN_PLAYED_STORIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(id => String(id ?? '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function writeHiddenPlayedStoryIds(ids: string[]): void {
  appStorage.set(HIDDEN_PLAYED_STORIES_KEY, JSON.stringify(Array.from(new Set(ids)).filter(Boolean)));
}

function readPlayedStoryLocalSnapshot(
  storyId: string,
  appLanguage: string,
  storageKeys?: string[],
): Record<string, unknown> {
  if (!storyId) return {};

  const directCacheKey = `@story_full_${storyId}_${appLanguage}`;
  let fullStory = parseStoredRecord(appStorage.getString(directCacheKey));
  if (Object.keys(fullStory).length === 0) {
    const matchedKey = (storageKeys ?? appStorage.getAllKeys()).find(key => key.startsWith(`@story_full_${storyId}_`));
    if (matchedKey) {
      fullStory = parseStoredRecord(appStorage.getString(matchedKey));
    }
  }

  const sessionHead = parseStoredRecord(appStorage.getString(`session_head:${storyId}`));
  const storyMeta = sessionHead.storyMeta && typeof sessionHead.storyMeta === 'object'
    ? sessionHead.storyMeta as Record<string, unknown>
    : {};

  return {
    ...fullStory,
    model_id: pickString(
      fullStory.model_id,
      fullStory.modelId,
      fullStory.started_model_id,
      fullStory.startedModelId,
      sessionHead.modelId,
      storyMeta.modelId,
    ),
    started_model_id: pickString(
      fullStory.started_model_id,
      fullStory.startedModelId,
      fullStory.model_id,
      fullStory.modelId,
      sessionHead.modelId,
      storyMeta.modelId,
    ),
    lastChapterIndex: fullStory.lastChapterIndex ?? fullStory.last_chapter_index ?? sessionHead.currentChapterIndex,
  };
}

function mergePlayedStoryData(
  story: Record<string, unknown>,
  appLanguage: string,
  storageKeys?: string[],
): Record<string, unknown> {
  const storyId = String(story.id ?? '');
  const local = readPlayedStoryLocalSnapshot(storyId, appLanguage, storageKeys);
  return {
    ...local,
    ...story,
    story_config: story.story_config ?? local.story_config,
    cover_url: pickString(story.cover_url, local.cover_url, local.coverUrl),
    coverUrl: pickString(story.coverUrl, local.coverUrl, extractCoverUrl(local), extractCoverUrl(story)),
    model_id: pickString(
      story.model_id,
      story.modelId,
      story.started_model_id,
      story.startedModelId,
      local.model_id,
      local.modelId,
      local.started_model_id,
      local.startedModelId,
    ),
    started_model_id: pickString(
      story.started_model_id,
      story.startedModelId,
      story.model_id,
      story.modelId,
      local.started_model_id,
      local.startedModelId,
      local.model_id,
      local.modelId,
    ),
    lastChapterIndex:
      story.lastChapterIndex ??
      story.last_chapter_index ??
      story.last_chapter_idx ??
      local.lastChapterIndex ??
      local.last_chapter_index ??
      local.last_chapter_idx,
  };
}

function formatCount(n: number, locale = 'ko'): string {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}

function extractGenre(story: Record<string, unknown>): string {
  return normalizeStoryGenre(pickString(story.genre, story.storyGenre, story.story_genre))
    || pickString(story.genre, story.storyGenre, story.story_genre);
}

function buildPlayedStoryCardData(
  story: Record<string, unknown>,
  appLanguage: string,
  applyName: (value: string) => string,
  t?: Record<string, string>,
) {
  const localized = extractLocalizedStoryFields(story, appLanguage);
  const cfg = parseStoryConfig(story);

  const title = applyName(pickString(localized.title, story.title, t?.defaultStoryTitle));
  const description = applyName(
    pickString(
      localized.worldSetting,
      cfg.worldSetting,
      cfg.world_setting,
      localized.description,
      story.description,
      '',
    ),
  );
  const tagsText = applyName(
    extractStoryTags(story)
      .slice(0, 4)
      .map(tag => `#${String(tag).replace(/^#/, '')}`)
      .join(' '),
  );

  return {
    title,
    description,
    tagsText,
    coverUrl: pickString(String(story.coverUrl ?? ''), extractCoverUrl(story)) };
}

function PlayedCard({
  story,
  token,
  navigation,
  index,
  selectionMode,
  isSelected,
  onToggleSelect,
  onEnterSelectionMode }: {
  story: Record<string, unknown>;
  token: string;
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
  index: number;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (storyId: string) => void;
  onEnterSelectionMode: (storyId: string) => void;
}) {
  const t = useTranslation();
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const applyName = useUserProfileStore(s => s.applyName);
  const getSession = useChatStore(s => s.getSession);
  const activeModelId = useModelStore(s => s.activeModelId);
  const downloadedModels = useModelStore(s => s.downloadedModels);

  const [liked, setLiked] = useState(Boolean(story.isLiked));
  const [isStarting, setIsStarting] = useState(false);
  const hasDownloadedActiveModel =
    !!activeModelId && downloadedModels.some(model => model.id === activeModelId);

  const cardData = useMemo(
    () => buildPlayedStoryCardData(story, appLanguage, applyName, t),
    [story, appLanguage, applyName, t],
  );
  const session = getSession(String(story.id ?? ''));
  const modelBadge = getModelBadgeMeta(
    resolveStoryModelId({
      ...(story as Record<string, unknown>),
      started_model_id: pickString(
        story.started_model_id,
        story.startedModelId,
        story.model_id,
        session?.storyMeta?.modelId,
        session?.modelId,
      ) }),
    t,
  );
  const chapterIndex = Number(
    story.lastChapterIndex ??
    story.last_chapter_index ??
    story.last_chapter_idx ??
    0,
  ) || 0;
  const chapterLabel = t?.chapterPrefix
    ? t.chapterPrefix.replace('{n}', String(chapterIndex + 1))
    : String(chapterIndex + 1);
  const baseLikeCount = Number(story.likeCount ?? story.like_count ?? 0) || 0;
  const displayLikeCount = baseLikeCount + (liked && !story.isLiked ? 1 : !liked && story.isLiked ? -1 : 0);
  const displayViewCount = Number(story.viewCount ?? story.view_count ?? 0) || 0;

  const handlePress = async () => {
    if (selectionMode) {
      onToggleSelect(String(story.id ?? ''));
      return;
    }
    if (isStarting) return;
    if (!hasDownloadedActiveModel) {
      ToastService.info(t?.wizardNoModel ?? t?.noModelDownloaded ?? '');
      return;
    }

    triggerHaptic('light');
    setIsStarting(true);

    try {
      let fullStory = story;
      const cacheKey = `@story_full_${story.id}_${appLanguage}`;
      const cacheRaw = appStorage.getString(cacheKey);
      const cacheTtl = 24 * 60 * 60 * 1000;

      if (cacheRaw) {
        try {
          const cached = JSON.parse(cacheRaw);
          if (cached?.id && Date.now() - (cached._cachedAt ?? 0) < cacheTtl) {
            fullStory = cached;
          } else {
            appStorage.remove(cacheKey);
          }
        } catch {
          appStorage.remove(cacheKey);
        }
      }

      if (fullStory === story) {
        const langParam = appLanguage ? `?lang=${encodeURIComponent(appLanguage)}` : '';
        const res = await authedFetch(`/api/stories/${story.id}${langParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.story) {
            fullStory = data.story;
            appStorage.set(cacheKey, JSON.stringify({ ...fullStory, _cachedAt: Date.now() }));
          }
        }
      }

      if (token) {
        const { isJwtExpired } = await import('../store/authStore');
        if (!isJwtExpired(token)) {
          StoryAPI.recordPlay(String(story.id), token).catch(() => {});
        }
      }

      navigation.navigate('Chat', {
        story: fullStory,
        currentEmotions: {},
        resumeMode: true,
        lastChapterIndex: chapterIndex });
    } catch {
      navigation.navigate('Chat', {
        story,
        currentEmotions: {},
        resumeMode: true,
        lastChapterIndex: chapterIndex });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Animated.View layout={Layout.springify()}>
      <Animated.View entering={FadeInUp.delay(Math.min(index * 20, 160)).springify()}>
        <View style={[styles.playedCardWrap, isStarting && styles.playedCardWrapPressed]}>
          <WideStoryCardFrame
            coverUrl={cardData.coverUrl}
            title={cardData.title}
            description={cardData.description}
            tagsText={cardData.tagsText}
            likeCount={formatCount(displayLikeCount, appLanguage)}
            playCount={formatCount(displayViewCount, appLanguage)}
            liked={liked}
            onPress={handlePress}
            onLongPress={() => onEnterSelectionMode(String(story.id ?? ''))}
            disabled={isStarting}
            onLikePress={() => {
              if (selectionMode) {
                onToggleSelect(String(story.id ?? ''));
                return;
              }
              Vibration.vibrate(liked ? 8 : 15);
              const nextLiked = !liked;
              setLiked(nextLiked);

              if (token && story?.id) {
                StoryAPI.like(String(story.id), token)
                  .then(result => {
                    if (typeof result?.isLiked === 'boolean' && result.isLiked !== nextLiked) {
                      setLiked(result.isLiked);
                    }
                  })
                  .catch(() => {
                    setLiked(!nextLiked);
                  });
              }
            }}
            cardOverlayContent={
              <>
                {selectionMode ? (
                  <View pointerEvents="none" style={styles.selectionOverlay}>
                    {isSelected ? (
                      <CheckCircle2 size={24} color="#D4A853" fill="rgba(212,168,83,0.1)" />
                    ) : (
                      <Circle size={24} color="rgba(255,255,255,0.35)" />
                    )}
                  </View>
                ) : null}

                <View pointerEvents="none" style={styles.cardOverlayFill}>
                  <View style={styles.cardCornerRow}>
                    <View style={styles.chapterBadge}>
                      <Play size={8} color="#F4D37A" fill="#F4D37A" />
                      <Text style={styles.chapterBadgeText}>{chapterLabel}</Text>
                    </View>
                    {modelBadge ? (
                      <View
                        style={[
                          styles.modelBadge,
                          modelBadge.tone === 'gold' && styles.modelBadgeGold,
                          modelBadge.tone === 'silver' && styles.modelBadgeSilver,
                          modelBadge.tone === 'red' && styles.modelBadgeRed,
                        ]}
                      >
                        <Text style={styles.modelBadgeText}>{modelBadge.label}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </>
            }
          />

          {isStarting && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color="#D4A853" />
            </View>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export function StoryScreen({ navigation }: TabScreenProps<'Story'>) {
  const t = useTranslation();
  const { isRTL, appLanguage } = useLanguageStore();
  const token = useAuthStore(s => s.user?.jwtToken ?? '');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [listMode, setListMode] = useState<'stories' | 'webnovels'>('stories');
  const [webNovels, setWebNovels] = useState<WebNovelMeta[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());
  const [selectedWebNovelIds, setSelectedWebNovelIds] = useState<Set<string>>(new Set());
  const [hiddenStoryIds, setHiddenStoryIds] = useState<Set<string>>(() => new Set(readHiddenPlayedStoryIds()));

  const {
    data: stories = [],
    isLoading,
    isError,
    refetch } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ['my-stories', token, appLanguage],
    queryFn: async () => {
      const storageKeys = appStorage.getAllKeys();
      const hydrateStories = (list: Array<Record<string, unknown>>) =>
        list.map(item => mergePlayedStoryData(item, appLanguage, storageKeys));

      if (!token) {
        const keys = storageKeys.filter(key => key.startsWith('@story_full_'));
        return hydrateStories(keys
          .map(key => {
            try {
              const value = appStorage.getString(key);
              return value ? JSON.parse(value) : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean));
      }

      const langParam = appLanguage ? `?lang=${encodeURIComponent(appLanguage)}` : '';
      const res = await authedFetch(`/api/stories/mine/played${langParam}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const serverStories = Array.isArray(data.stories) ? data.stories : [];
      if (serverStories.length > 0) {
        return hydrateStories(serverStories);
      }

      const keys = storageKeys.filter(key => key.startsWith('@story_full_'));
      return hydrateStories(keys
        .map(key => {
          try {
            const value = appStorage.getString(key);
            return value ? JSON.parse(value) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean));
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: (_count, error: Error) => !error?.message?.startsWith('HTTP') });

  useFocusEffect(
    useCallback(() => {
      setSelectionMode(false);
      setSelectedStoryIds(new Set());
      setSelectedWebNovelIds(new Set());
      setHiddenStoryIds(new Set(readHiddenPlayedStoryIds()));
      refetch();
      setWebNovels(getWebNovelList());
    }, [refetch]),
  );

  const usedGenres = useMemo(() => {
    const allGenres = Array.from(
      new Set(
        stories
          .map(story => extractGenre(story))
          .filter(Boolean),
      ),
    );
    return allGenres;
  }, [stories]);

  const filteredStories = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    return stories.filter(story => {
      const storyId = String(story.id ?? '');
      if (hiddenStoryIds.has(storyId)) return false;
      const title = String(story.title ?? '').toLowerCase();
      const description = String(story.description ?? '').toLowerCase();
      const matchesSearch = !lowered || title.includes(lowered) || description.includes(lowered);
      const matchesGenre = !activeGenre || extractGenre(story) === activeGenre;
      return matchesSearch && matchesGenre;
    });
  }, [stories, searchQuery, activeGenre, hiddenStoryIds]);

  const filteredWebNovels = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    return webNovels.filter(item => !lowered || item.title?.toLowerCase().includes(lowered));
  }, [webNovels, searchQuery]);

  const handleRefresh = () => {
    setRefreshing(true);
    refetch()
      .catch(() => {})
      .finally(() => {
        setWebNovels(getWebNovelList());
        setRefreshing(false);
      });
  };

  const toggleStorySelection = useCallback((storyId: string) => {
    setSelectedStoryIds(prev => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  }, []);

  const enterStorySelectionMode = useCallback((storyId: string) => {
    triggerHaptic('medium');
    setSelectionMode(true);
    setSelectedStoryIds(new Set([storyId]));
    setSelectedWebNovelIds(new Set());
  }, []);

  const exitStorySelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedStoryIds(new Set());
    setSelectedWebNovelIds(new Set());
  }, []);

  const toggleWebNovelSelection = useCallback((novelId: string) => {
    setSelectedWebNovelIds(prev => {
      const next = new Set(prev);
      if (next.has(novelId)) next.delete(novelId);
      else next.add(novelId);
      setSelectedStoryIds(new Set(next));
      return next;
    });
  }, []);

  const enterWebNovelSelectionMode = useCallback((novelId: string) => {
    triggerHaptic('medium');
    setSelectionMode(true);
    const next = new Set([novelId]);
    setSelectedStoryIds(new Set(next));
    setSelectedWebNovelIds(next);
  }, []);

  const handleDeleteSelectedWebNovels = useCallback(() => {
    if (selectedWebNovelIds.size === 0) return;

    Alert.alert(
      t?.deleteSelectedTitle ?? t?.delete ?? '',
      (t?.deleteSelectedConfirm ?? '').replace('{n}', String(selectedWebNovelIds.size)),
      [
        { text: t?.cancel ?? '', style: 'cancel' },
        {
          text: t?.delete ?? '',
          style: 'destructive',
          onPress: () => {
            const ids = Array.from(selectedWebNovelIds);
            deleteWebNovels(ids);
            setWebNovels(getWebNovelList());
            exitStorySelectionMode();
          },
        },
      ],
    );
  }, [exitStorySelectionMode, selectedWebNovelIds, t]);

  const handleDeleteSelectedStories = useCallback(() => {
    if (selectedStoryIds.size === 0) return;

    Alert.alert(
      t?.deleteSelectedTitle ?? t?.delete ?? '',
      (t?.deleteSelectedConfirm ?? '').replace('{n}', String(selectedStoryIds.size)),
      [
        { text: t?.cancel ?? '', style: 'cancel' },
        {
          text: t?.delete ?? '',
          style: 'destructive',
          onPress: () => {
            const ids = Array.from(selectedStoryIds);
            const nextHidden = new Set(hiddenStoryIds);
            ids.forEach(id => nextHidden.add(id));
            setHiddenStoryIds(nextHidden);
            writeHiddenPlayedStoryIds(Array.from(nextHidden));
            exitStorySelectionMode();
            ids.forEach(id => {
              cleanupStoryData(id).catch(() => {});
            });
          },
        },
      ],
    );
  }, [exitStorySelectionMode, hiddenStoryIds, selectedStoryIds, t]);

  const renderStoryItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Record<string, unknown>>) => (
      <PlayedCard
        story={item}
        token={token}
        navigation={navigation}
        index={index}
        selectionMode={selectionMode}
        isSelected={selectedStoryIds.has(String(item.id ?? ''))}
        onToggleSelect={toggleStorySelection}
        onEnterSelectionMode={enterStorySelectionMode}
      />
    ),
    [enterStorySelectionMode, navigation, selectedStoryIds, selectionMode, toggleStorySelection, token],
  );

  const renderWebNovelItem = useCallback(
    ({ item, index }: ListRenderItemInfo<WebNovelMeta>) => (
      <Animated.View entering={FadeInUp.delay(Math.min(index * 20, 160)).springify()}>
        <TouchableOpacity
          style={[styles.webNovelCard, selectedWebNovelIds.has(String(item.id)) && styles.webNovelCardSelected]}
          activeOpacity={1}
          scaleDown={0.992}
          onPress={() => {
            if (selectionMode) {
              toggleWebNovelSelection(String(item.id));
              return;
            }
            navigation.navigate('WebNovelReader', { novelId: item.id, source: 'local' });
          }}
          onLongPress={() => {
            if (selectionMode) {
              toggleWebNovelSelection(String(item.id));
              return;
            }
            enterWebNovelSelectionMode(String(item.id));
          }}
        >
          <View style={styles.webNovelIconWrap}>
            {selectionMode ? (
              selectedWebNovelIds.has(String(item.id))
                ? <CheckCircle2 size={20} color="#D4A853" />
                : <Circle size={20} color="#8A8A9E" />
            ) : (
              <FileText size={18} color="#D4A853" />
            )}
          </View>
          <View style={styles.webNovelInfo}>
            <Text style={styles.webNovelTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.webNovelMeta}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          {!selectionMode && <ChevronRight size={16} color="#8A8A9E" />}
        </TouchableOpacity>
      </Animated.View>
    ),
    [enterWebNovelSelectionMode, navigation, selectedWebNovelIds, selectionMode, toggleWebNovelSelection],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Animated.View entering={FadeInUp.springify()} style={[styles.header, isRTL && styles.rtl]}>
        {selectionMode ? (
          <>
            <TouchableOpacity style={styles.iconBtn} onPress={exitStorySelectionMode}>
              <X size={20} color="#F0F0F5" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {(t?.selectedCount ?? '').replace('{n}', String(selectedStoryIds.size))}
            </Text>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={listMode === 'stories' ? handleDeleteSelectedStories : handleDeleteSelectedWebNovels}
              disabled={listMode === 'stories' ? selectedStoryIds.size === 0 : selectedWebNovelIds.size === 0}
            >
              <Trash2 size={18} color={(listMode === 'stories' ? selectedStoryIds.size > 0 : selectedWebNovelIds.size > 0) ? '#FF7A7A' : '#5F6673'} />
            </TouchableOpacity>
          </>
        ) : searchVisible ? (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.searchRow, isRTL && styles.rtl]}>
            <View style={styles.searchInputWrap}>
              <Search size={15} color="#797990" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t?.storySearchPlaceholder ?? ''}
                placeholderTextColor="#757585"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>
            <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }} style={styles.cancelBtn}>
              <X size={18} color="#8A8A9E" />
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            <Text style={styles.headerTitle}>{t?.myStories ?? ''}</Text>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setSearchVisible(true)}>
              <Search size={20} color="#F0F0F5" />
            </TouchableOpacity>
          </>
        )}
      </Animated.View>

      {!searchVisible && !selectionMode && listMode === 'stories' && usedGenres.length > 0 && (
        <Animated.View entering={FadeIn.delay(80).duration(280)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreBar} style={styles.genreBarWrap}>
            <TouchableOpacity
              style={[styles.genreChip, !activeGenre && styles.genreChipActive]}
              onPress={() => { triggerHaptic('select'); setActiveGenre(null); }}
              activeOpacity={1}
              scaleDown={0.992}
            >
              <Text style={[styles.genreChipTxt, !activeGenre && styles.genreChipTxtActive]}>
                {t?.genreAll ?? t?.all ?? ''}
              </Text>
            </TouchableOpacity>

            {usedGenres.map(genre => (
              <TouchableOpacity
                key={genre}
                style={[styles.genreChip, activeGenre === genre && styles.genreChipActive]}
                onPress={() => {
                  triggerHaptic('select');
                  setActiveGenre(current => (current === genre ? null : genre));
                }}
                activeOpacity={1}
                scaleDown={0.992}
              >
                <Text style={[styles.genreChipTxt, activeGenre === genre && styles.genreChipTxtActive]}>
                  {translateGenre(genre, t)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {!searchVisible && !selectionMode && (
        <Animated.View entering={FadeIn.delay(60).duration(260)} style={styles.modeTabsWrap}>
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, listMode === 'stories' && styles.modeTabActive]}
              onPress={() => {
                triggerHaptic('select');
                setListMode('stories');
              }}
              activeOpacity={1}
              scaleDown={0.992}
            >
              <BookOpen size={14} color={listMode === 'stories' ? '#F0F0F5' : '#797990'} />
              <Text style={[styles.modeTabText, listMode === 'stories' && styles.modeTabTextActive]}>
                {t?.ongoingStories ?? ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, listMode === 'webnovels' && styles.modeTabActive]}
              onPress={() => {
                triggerHaptic('select');
                exitStorySelectionMode();
                setListMode('webnovels');
              }}
              activeOpacity={1}
              scaleDown={0.992}
            >
              <FileText size={14} color={listMode === 'webnovels' ? '#F0F0F5' : '#797990'} />
              <Text style={[styles.modeTabText, listMode === 'webnovels' && styles.modeTabTextActive]}>
                {t?.myWebNovels ?? ''}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {!searchVisible && !selectionMode && (
        <Animated.View entering={FadeIn.delay(100).duration(300)} style={styles.subHeader}>
          {listMode === 'stories' ? <BookOpen size={12} color="#757585" /> : <FileText size={12} color="#757585" />}
          <Text style={styles.subHeaderTxt}>
            {listMode === 'stories'
              ? (activeGenre ? `${translateGenre(activeGenre, t)} · ${filteredStories.length}` : (t?.ongoingStories ?? ''))
              : `${t?.myWebNovels ?? ''} · ${filteredWebNovels.length}`}
          </Text>
          {listMode === 'stories' && activeGenre && (
            <TouchableOpacity onPress={() => setActiveGenre(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={12} color="#8A8A9E" />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {isLoading && listMode === 'stories' && <SkeletonStoryRow count={5} />}

      {isError && listMode === 'stories' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.center}>
          <Text style={styles.errorTxt}>{t?.loadFailed ?? ''}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <RefreshCw size={14} color="#D4A853" />
            <Text style={styles.retryTxt}>{t?.retry ?? ''}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {!isLoading && !isError && (
        listMode === 'webnovels' ? (
          filteredWebNovels.length === 0 ? (
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.flex1}>
              <EmptyState
                type={searchQuery ? 'search' : 'empty'}
                title={searchQuery ? (t?.noSearchResults2 ?? '') : (t?.myWebNovels ?? '')}
              />
            </Animated.View>
          ) : (
            <FlashList
              data={filteredWebNovels}
              renderItem={renderWebNovelItem}
              keyExtractor={(item: WebNovelMeta) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              estimatedItemSize={88}
              refreshControl={
                <RefreshControl
                  enabled={!selectionMode}
                  refreshing={selectionMode ? false : refreshing}
                  onRefresh={() => {
                    if (selectionMode) return;
                    handleRefresh();
                  }}
                  tintColor="#D4A853"
                />
              }
            />
          )
        ) : (
          filteredStories.length === 0 ? (
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.flex1}>
              <EmptyState
                type={searchQuery || activeGenre ? 'search' : 'empty'}
                title={
                  activeGenre
                    ? translateGenre(activeGenre, t)
                    : searchQuery
                      ? (t?.noSearchResults2 ?? '')
                      : (t?.ongoingStories ?? '')
                }
              />
            </Animated.View>
          ) : (
            <FlashList
              data={filteredStories}
              renderItem={renderStoryItem}
              keyExtractor={(item: Record<string, unknown>) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              estimatedItemSize={126}
              refreshControl={
                <RefreshControl
                  enabled={!selectionMode}
                  refreshing={selectionMode ? false : refreshing}
                  onRefresh={() => {
                    if (selectionMode) return;
                    handleRefresh();
                  }}
                  tintColor="#D4A853"
                />
              }
            />
          )
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050507' },
  rtl: { flexDirection: 'row-reverse' },
  flex1: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
    backgroundColor: '#050507' },
  headerTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    letterSpacing: -0.4 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#0E0E14',
    borderWidth: 1,
    borderColor: '#1A1A24' },
  searchRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    backgroundColor: '#0E0E14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A1A24',
    gap: 6 },
  searchIcon: { marginLeft: 10 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.regular,
    paddingRight: 12 },
  cancelBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center' },

  genreBarWrap: { maxHeight: 52 },
  genreBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 7 },
  genreChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#16161E',
    backgroundColor: '#09090F' },
  genreChipActive: {
    borderColor: 'rgba(167,139,250,0.4)',
    backgroundColor: 'rgba(167,139,250,0.08)' },
  genreChipTxt: {
    fontSize: 12,
    color: '#454560',
    fontFamily: Typography.fontFamily.medium },
  genreChipTxtActive: {
    color: '#A78BFA',
    fontFamily: Typography.fontFamily.semibold },

  modeTabsWrap: { marginHorizontal: 16, marginTop: 6, marginBottom: 4 },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#09090F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#14141C',
    padding: 4,
    gap: 4 },
  modeTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6 },
  modeTabActive: {
    backgroundColor: '#0E0E14',
    borderWidth: 1,
    borderColor: '#1A1A24' },
  modeTabText: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  modeTabTextActive: { color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },

  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6 },
  subHeaderTxt: {
    fontSize: 11,
    color: '#3A3A52',
    fontFamily: Typography.fontFamily.medium,
    flex: 1,
    letterSpacing: 0.2 },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 8 },

  playedCardWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14 },
  playedCardTitleOffset: {
    marginTop: 4 },
  playedCardWrapPressed: {
    opacity: 0.7 },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardOverlayFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    padding: 8,
  },
  cardCornerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  chapterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(244,211,122,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244,211,122,0.28)' },
  chapterBadgeText: {
    fontSize: 9,
    color: '#F6F8FB',
    fontFamily: Typography.fontFamily.semibold },
  modelBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1 },
  modelBadgeGold: { backgroundColor: 'rgba(212,168,83,0.16)', borderColor: 'rgba(212,168,83,0.28)' },
  modelBadgeSilver: { backgroundColor: 'rgba(203,213,225,0.15)', borderColor: 'rgba(203,213,225,0.28)' },
  modelBadgeRed: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.28)' },
  modelBadgeText: {
    fontSize: 9,
    color: '#F6F8FB',
    fontFamily: Typography.fontFamily.bold },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center' },

  webNovelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#09090F',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#141420',
    paddingHorizontal: 14,
    paddingVertical: 14 },

  webNovelCardSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#1E1B4B' },

  webNovelIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0E0E14',
    borderWidth: 1,
    borderColor: '#1A1A24',
    alignItems: 'center',
    justifyContent: 'center' },
  webNovelInfo: { flex: 1 },
  webNovelTitle: {
    fontSize: 13,
    color: '#E8E8F2',
    fontFamily: Typography.fontFamily.semibold,
    marginBottom: 4 },
  webNovelMeta: {
    fontSize: 11,
    color: '#6A6A82',
    fontFamily: Typography.fontFamily.regular },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorTxt: {
    fontSize: 14,
    color: '#6A6A80',
    textAlign: 'center',
    fontFamily: Typography.fontFamily.regular },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#222232',
    borderRadius: Radius.md },
  retryTxt: {
    fontSize: 14,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold } });
