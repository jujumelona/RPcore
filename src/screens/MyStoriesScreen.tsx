import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight, FadeOutRight } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { BookOpen,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Eye,
  FileText,
  Heart,
  Trash2,
  TrendingUp } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import { PressableOpacity } from '../components/PressableOpacity';
import { EmptyState } from '../components/EmptyState';
import { WideStoryCardFrame } from '../components/StoryCard';
import { ConfirmModal } from '../components/ConfirmModal';
import { Color, Typography } from '../constants/tokens';
import { StoryAPI } from '../api/StoryAPI';
import { useLanguageStore } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import { useGlobalLoadingStore } from '../store/globalLoadingStore';
import { useUserProfileStore } from '../store/userProfileStore';
import { getModelBadgeMeta, resolveStoryModelId } from '../utils/storyModelMeta';
import { formatCount } from '../utils/formatCount';
import { authedFetch } from '../utils/authedFetch';
import { appStorage } from '../utils/storage';
import { buildStoryDisplayModel } from './home/utils/storyHelpers';
import { extractCoverUrl,
  extractStoryTags,
  parseStoryConfig,
  pickString,
  splitHashtags } from './home/utils/storyHelpers';
import { cleanupStoryData } from '../utils/storyDataCleanup';
import { normalizeStoryGenre } from '../utils/storyGenres';
import { ToastService } from '../components/Toast';

const APP_NAV_TONE = Color.bg3;
const MY_STORIES_KEY = '@my_stories';
const DRAFT_KEY_PREFIX = '@story_draft_';

function isLocalDraftOnlyId(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.startsWith('draft_') || normalized.startsWith('story_');
}

function getStoryConfigObject(storyConfig: unknown): Record<string, unknown> {
  if (!storyConfig) return {};
  if (typeof storyConfig === 'string') {
    try {
      const parsed = JSON.parse(storyConfig);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof storyConfig === 'object' ? storyConfig as Record<string, unknown> : {};
}

interface MyStory {
  id: string;
  title: string;
  description: string;
  genre?: string;
  status: 'draft' | 'published' | 'review' | 'approved' | 'rejected' | 'suspended';
  updatedAt: number;
  createdAt?: number;
  viewCount: number;
  likeCount: number;
  playerCount?: number;
  story_config?: unknown;
  cover_url?: string;
  cover_urls?: string[];
  thumb_url?: string;
  model_id?: string;
  started_model_id?: string;
}

function getLinkedServerStoryIdFromStory(story: MyStory): string {
  const storyConfig = getStoryConfigObject(story.story_config);
  const linkedServerStoryId = typeof storyConfig.linkedServerStoryId === 'string'
    ? storyConfig.linkedServerStoryId.trim()
    : '';
  return linkedServerStoryId && !isLocalDraftOnlyId(linkedServerStoryId) ? linkedServerStoryId : '';
}

function parseServerDate(dateStr?: string): number {
  if (!dateStr) return Date.now();
  try {
    let normalized = dateStr.replace(' ', 'T');
    if (!normalized.includes('Z') && !normalized.includes('+')) {
      normalized += 'Z';
    }
    const parsed = new Date(normalized);
    const next = parsed.getTime();
    return Number.isFinite(next) ? next : Date.now();
  } catch {
    return Date.now();
  }
}

function formatDate(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function readDraftStory(storyId: string): Record<string, unknown> {
  try {
    const raw = appStorage.getString(`${DRAFT_KEY_PREFIX}${storyId}`) ?? '';
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildDraftStoryEntries(seedList: MyStory[] = []): MyStory[] {
  const seedMap = new Map(seedList.map(story => [story.id, story]));
  return appStorage
    .getAllKeys()
    .filter(key => key.startsWith(DRAFT_KEY_PREFIX))
    .map((key): MyStory | null => {
      try {
        const raw = appStorage.getString(key);
        if (!raw) return null;
        const draft = JSON.parse(raw) as Record<string, unknown>;
        const storyId = String(draft.storyId ?? key.slice(DRAFT_KEY_PREFIX.length)).trim();
        if (!storyId) return null;
        const seed = seedMap.get(storyId);
        const draftCoverUris = Array.isArray(draft.storeCoverUris)
          ? draft.storeCoverUris.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];

        return {
          id: storyId,
          title: String(draft.storyTitle ?? seed?.title ?? ''),
          description: String(draft.storyDesc ?? seed?.description ?? ''),
          status: 'draft',
          updatedAt: Number(draft.savedAt ?? seed?.updatedAt ?? Date.now()) || Date.now(),
          createdAt: seed?.createdAt,
          viewCount: seed?.viewCount ?? 0,
          likeCount: seed?.likeCount ?? 0,
          playerCount: seed?.playerCount ?? 0,
          cover_urls: draftCoverUris.length > 0 ? draftCoverUris : seed?.cover_urls,
          cover_url: seed?.cover_url,
          thumb_url: seed?.thumb_url,
          story_config: {
            ...(typeof seed?.story_config === 'object' && seed.story_config ? seed.story_config : {}),
            cover_urls: draftCoverUris.length > 0 ? draftCoverUris : (Array.isArray(seed?.cover_urls) ? seed.cover_urls : []),
            linkedServerStoryId: typeof draft.linkedServerStoryId === 'string' ? draft.linkedServerStoryId : undefined,
            storyHashtag: String(draft.storyHashtag ?? ''),
            worldSetting: String(draft.worldSetting ?? ''),
          },
          model_id: typeof draft.modelId === 'string' ? draft.modelId : seed?.model_id,
          started_model_id: typeof draft.startedModelId === 'string' ? draft.startedModelId : seed?.started_model_id,
        };
      } catch {
        return null;
      }
    })
    .filter((story): story is MyStory => story !== null);
}

function mergeWithStoredDrafts(list: MyStory[]): MyStory[] {
  const byLogicalId = new Map<string, MyStory>();
  const getLogicalId = (story: MyStory): string => {
    if (story.status !== 'draft') return `story:${story.id}`;

    const linkedServerStoryId = getLinkedServerStoryIdFromStory(story);
    if (linkedServerStoryId) return `story:${linkedServerStoryId}`;

    return `draft-id:${story.id}`;
  };

  list
    .filter(story => story.status !== 'draft')
    .forEach(story => byLogicalId.set(getLogicalId(story), story));

  buildDraftStoryEntries(list).forEach(story => {
    const logicalId = getLogicalId(story);
    const existing = byLogicalId.get(logicalId);
    if (!existing || existing.status !== 'draft' || existing.updatedAt <= story.updatedAt) {
      byLogicalId.set(logicalId, story);
    }
  });

  return [...byLogicalId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function pruneMissingDraftEntries(list: MyStory[]): MyStory[] {
  const next = mergeWithStoredDrafts(list);
  if (JSON.stringify(next) !== JSON.stringify(list)) {
    appStorage.set(MY_STORIES_KEY, JSON.stringify(next));
  }
  return next;
}

function buildMyStoryCardData(
  story: MyStory,
  appLanguage: string,
  applyName: (value: string) => string,
  t?: Record<string, string>,
) {
  const draft = story.status === 'draft' ? readDraftStory(story.id) : {};
  const storyConfig = parseStoryConfig({ story_config: story.story_config });
  const draftCoverUris = Array.isArray(draft.storeCoverUris)
    ? (draft.storeCoverUris as unknown[]).filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const mergedCoverUrls = Array.isArray(story.cover_urls) && story.cover_urls.length > 0
    ? story.cover_urls
    : draftCoverUris;

  const raw = {
    ...story,
    title: story.title || String(draft.storyTitle ?? ''),
    description: story.description || String(draft.storyDesc ?? ''),
    genre: normalizeStoryGenre(
      String(story.genre ?? storyConfig.genre ?? draft.storyGenre ?? ''),
    ) || String(story.genre ?? storyConfig.genre ?? draft.storyGenre ?? ''),
    cover_urls: mergedCoverUrls,
    model_id: pickString(story.model_id, draft.modelId, draft.startedModelId),
    started_model_id: pickString(story.started_model_id, draft.startedModelId, draft.modelId),
    story_config: {
      ...storyConfig,
      cover_urls: mergedCoverUrls.length > 0
        ? mergedCoverUrls
        : (Array.isArray(storyConfig.cover_urls) ? storyConfig.cover_urls : draftCoverUris),
      genre: normalizeStoryGenre(
        String(storyConfig.genre ?? story.genre ?? draft.storyGenre ?? ''),
      ) || String(storyConfig.genre ?? story.genre ?? draft.storyGenre ?? ''),
      storyHashtag: pickString(storyConfig.storyHashtag, storyConfig.story_hashtag, draft.storyHashtag),
      worldSetting: pickString(storyConfig.worldSetting, storyConfig.world_setting, draft.worldSetting),
      modelId: pickString(
        storyConfig.modelId,
        storyConfig.model_id,
        story.model_id,
        draft.modelId,
        draft.startedModelId,
      ),
      startedModelId: pickString(
        storyConfig.startedModelId,
        storyConfig.started_model_id,
        story.started_model_id,
        draft.startedModelId,
        draft.modelId,
      ),
    } } as Record<string, unknown>;
  const display = buildStoryDisplayModel(raw, appLanguage);
  const title = applyName(display.title ?? t?.defaultStoryTitle ?? '');
  const description = applyName(display.description || display.worldSetting || '');
  const fallbackTags = Array.from(
    new Set(
      [
        ...extractStoryTags(raw),
        ...splitHashtags(pickString(draft.storyHashtag)),
      ]
        .map(tag => String(tag).replace(/^#/, '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 5);
  const mergedTags = (display.tags.length > 0 ? display.tags : fallbackTags).slice(0, 5);
  const tagsText = applyName(
    mergedTags
      .map(tag => `#${tag}`)
      .join(' '),
  );
  const coverUrl = pickString(display.coverUrl, extractCoverUrl(raw), story.cover_url, story.thumb_url, draftCoverUris[0]);
  const modelId = pickString(
    display.modelId,
    resolveStoryModelId(raw),
    story.started_model_id,
    story.model_id,
    pickString(draft.startedModelId, draft.modelId),
  );

  return {
    title,
    description,
    tagsText,
    coverUrl,
    modelId,
    dateLabel: formatDate(story.createdAt ?? story.updatedAt) };
}

async function syncFromServer(): Promise<MyStory[] | null> {
  try {
    console.log('[MyStories] syncFromServer: Fetching /story-meta/mine');
    const res = await authedFetch('/story-meta/mine', { cache: 'no-store' });
    console.log('[MyStories] syncFromServer: Response status:', res.status, res.ok);
    
    if (!res.ok) {
      console.warn('[MyStories] syncFromServer: Failed to fetch stories, status:', res.status);
      return null;
    }

    const data = await res.json();
    console.log('[MyStories] syncFromServer: Received data, stories count:', Array.isArray(data.stories) ? data.stories.length : 'not an array');
    
    if (!Array.isArray(data.stories)) {
      console.warn('[MyStories] syncFromServer: data.stories is not an array');
      return null;
    }

    const mapped: MyStory[] = await Promise.all(
      data.stories.map(async (rawStory: Record<string, unknown>) => {
        let storyConfig = rawStory.story_config;

        // [FIX] story_config가 없으면 서버에서 전체 데이터 가져오기
        if (!storyConfig || (typeof storyConfig === 'object' && Object.keys(storyConfig).length === 0)) {
          try {
            console.log(`[MyStories] Fetching full story data for ${rawStory.id} (missing story_config)`);
            const fullRes = await authedFetch(`/stories/${rawStory.id}`, { cache: 'no-store' });
            if (fullRes.ok) {
              const fullData = await fullRes.json();
              if (fullData.story_config) {
                storyConfig = fullData.story_config;
                console.log(`[MyStories] Successfully fetched story_config for ${rawStory.id}`);
              }
            }
          } catch (err) {
            console.error(`[MyStories] Failed to fetch full story data for ${rawStory.id}:`, err);
          }
        }

        const parsedConfig = parseStoryConfig({ story_config: storyConfig });
        const coverUrls = Array.isArray(parsedConfig.cover_urls)
          ? parsedConfig.cover_urls.filter(
              (value): value is string => typeof value === 'string' && value.trim().length > 0,
            )
          : [];

        let status: MyStory['status'];
        if (rawStory.status === 'pending') status = 'review';
        else if (rawStory.status === 'approved') status = 'published';
        else if (rawStory.status === 'draft') status = 'draft';
        else status = rawStory.status as MyStory['status'];

        return {
          id: String(rawStory.id ?? ''),
          title: String(rawStory.title ?? ''),
          description: String(rawStory.description ?? ''),
          status,
          updatedAt: parseServerDate(String(rawStory.updated_at ?? rawStory.created_at ?? '')),
          createdAt: parseServerDate(String(rawStory.created_at ?? rawStory.updated_at ?? '')),
          viewCount: Number(rawStory.view_count ?? 0) || 0,
          likeCount: Number(rawStory.like_count ?? 0) || 0,
          playerCount: Number(rawStory.player_count ?? 0) || 0,
          story_config: storyConfig,
          cover_url: typeof rawStory.cover_url === 'string' ? rawStory.cover_url : undefined,
          cover_urls: coverUrls,
          thumb_url: typeof rawStory.thumb_url === 'string' ? rawStory.thumb_url : undefined,
          model_id: pickString(rawStory.model_id, parsedConfig.model_id, parsedConfig.modelId),
          started_model_id: pickString(
            rawStory.started_model_id,
            rawStory.startedModelId,
            parsedConfig.started_model_id,
            parsedConfig.startedModelId,
          ) };
      }),
    );

    const filtered = mapped.filter((story: MyStory) => story.status !== 'suspended');
    const localRaw = appStorage.getString(MY_STORIES_KEY);
    const localList: MyStory[] = localRaw ? JSON.parse(localRaw) : [];
    const storedDrafts = buildDraftStoryEntries(localList);
    const shadowedDraftIds = storedDrafts
      .filter(localStory => localStory.status === 'draft' && isLocalDraftOnlyId(String(localStory.id)))
      .filter(localStory => {
        const linkedServerStoryId = getLinkedServerStoryIdFromStory(localStory);
        return !!linkedServerStoryId && filtered.some(serverStory => serverStory.id === linkedServerStoryId);
      })
      .map(localStory => localStory.id);

    shadowedDraftIds.forEach(localStoryId => {
      appStorage.remove(`${DRAFT_KEY_PREFIX}${localStoryId}`);
    });

    const finalStories = mergeWithStoredDrafts(filtered);
    console.log('[MyStories] syncFromServer: Filtered stories count:', finalStories.length);
    appStorage.set(MY_STORIES_KEY, JSON.stringify(finalStories));
    return finalStories;
  } catch (err) {
    console.error('[MyStories] syncFromServer: Error:', err);
    return null;
  }
}

export function MyStoriesScreen({
  navigation }: {
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
}) {
  const { t, appLanguage } = useLanguageStore(
    useShallow(state => ({ t: state.t, appLanguage: state.appLanguage })),
  );
  const applyName = useUserProfileStore(state => state.applyName);
  const token = useAuthStore(state => state.user?.jwtToken);
  const [stories, setStories] = useState<MyStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);
  const selectionModeRef = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const { push: glPush, pop: glPop } = useGlobalLoadingStore();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectionMode && selectedIds.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedIds]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    const offset = scrollYRef.current;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: offset, animated: false });
    });
  }, [selectionMode]);

  const load = useCallback(async () => {
    if (selectionModeRef.current) return;
    glPush();
    
    try {
      // 로컬 캐시 먼저 로드
      const raw = appStorage.getString(MY_STORIES_KEY);
      if (isMounted.current) {
        const list = raw ? (JSON.parse(raw) as MyStory[]) : [];
        setStories(pruneMissingDraftEntries(list));
      }

      // 서버 동기화 (백그라운드)
      if (token) {
        syncFromServer().then(synced => {
          if (synced && isMounted.current) {
            setStories(pruneMissingDraftEntries(synced));
          }
        }).catch(() => {});
      }
    } catch {}

    if (isMounted.current) setLoading(false);
    glPop();
  }, [token, glPush, glPop]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const statusMeta = useMemo(() => ({
    draft:       { label: t?.statusDraft ?? '', color: '#D8DCE5', bg: 'rgba(140,148,164,0.14)', dot: '#8C94A4' },
    published:   { label: t?.statusCompleted ?? '', color: '#F4D37A', bg: 'rgba(212,168,83,0.16)', dot: '#D4A853' },
    approved:    { label: t?.statusApproved ?? '', color: '#F4D37A', bg: 'rgba(212,168,83,0.16)', dot: '#D4A853' },
    review:      { label: t?.statusReview ?? '', color: '#FFD08A', bg: 'rgba(245,158,11,0.16)', dot: '#F59E0B' },
    rejected:    { label: t?.statusRejected ?? '', color: '#FF9A9A', bg: 'rgba(255,85,85,0.16)', dot: '#FF5555' },
    suspended:   { label: t?.statusSuspended ?? '', color: '#FF9A9A', bg: 'rgba(255,85,85,0.16)', dot: '#FF5555' } }), [t]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setDeleteModalVisible(true);
  }, [selectedIds]);

  const confirmDelete = useCallback(async () => {
    setDeleteModalVisible(false);
    glPush();
    try {
      const idsArray = Array.from(selectedIds);
      const serverIds = idsArray.filter(id => {
        const s = stories.find(x => x.id === id);
        return s && s.status !== 'draft';
      });

      if (serverIds.length > 0) {
        await StoryAPI.deleteBatch(serverIds);
      }

      // [FIX] KV 캐시 및 모든 관련 데이터 정리
      await Promise.allSettled(
        idsArray.map(id => cleanupStoryData(id))
      );

      // Local cleanup
      const nextStories = stories.filter(s => !selectedIds.has(s.id));
      setStories(nextStories);
      appStorage.set(MY_STORIES_KEY, JSON.stringify(nextStories));

      idsArray.forEach(id => {
        appStorage.delete(`${DRAFT_KEY_PREFIX}${id}`);
      });

      setSelectionMode(false);
      setSelectedIds(new Set());
      ToastService.success(t?.deleteSuccessToast ?? '');
    } catch (err) {
      console.error('Delete batch error:', err);
      ToastService.error(t?.deleteFailed ?? '');
    } finally {
      glPop();
    }
  }, [selectedIds, stories, t, glPush, glPop]);

  const totalViews = stories.reduce((sum, story) => sum + story.viewCount, 0);
  const totalLikes = stories.reduce((sum, story) => sum + story.likeCount, 0);
  const publishedCnt = stories.filter(story => story.status === 'published').length;
  const draftCnt = stories.filter(story => story.status === 'draft').length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={APP_NAV_TONE} />

      <View style={styles.header}>
        <View pointerEvents="none" style={styles.headerTitleOverlay}>
          <Text style={styles.headerTitleVisible}>{t?.myStories ?? ''}</Text>
        </View>

        {selectionMode ? (
          <PressableOpacity
            style={styles.backBtn}
            onPress={() => {
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
          >
            <ChevronLeft size={22} color="#D6DBE4" />
          </PressableOpacity>
        ) : (
          <PressableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (selectionMode) {
                setSelectionMode(false);
                setSelectedIds(new Set());
                return;
              }
              navigation.goBack();
            }}
          >
            <ChevronLeft size={22} color="#D6DBE4" />
          </PressableOpacity>
        )}

        <Text style={styles.headerTitle}>{t?.myStories ?? ''}</Text>

        {selectionMode ? (
          <PressableOpacity
            style={styles.deleteBtn}
            disabled={selectedIds.size === 0}
            onPress={handleDeleteSelected}
          >
            <Trash2 size={20} color={selectedIds.size > 0 ? '#FF5555' : '#555'} />
          </PressableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            enabled={!selectionMode}
            refreshing={selectionMode ? false : refreshing}
            onRefresh={() => {
              if (selectionMode) return;
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
            tintColor="#8B5CF6"
            colors={['#8B5CF6']}
          />
        }
      >
          {stories.length > 0 && (
            <Animated.View entering={selectionMode ? undefined : FadeInDown.springify()} style={styles.statsCard}>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <BookOpen size={14} color="#D4A853" />
                  <Text style={styles.statVal}>{stories.length}</Text>
                  <Text style={styles.statLbl}>{t?.myStoriesTotal ?? ''}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <TrendingUp size={14} color="#4ADE80" />
                  <Text style={styles.statVal}>{publishedCnt}</Text>
                  <Text style={styles.statLbl}>{t?.myStoriesPublished ?? ''}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Eye size={14} color="#60A5FA" />
                  <Text style={styles.statVal}>{formatCount(totalViews, appLanguage)}</Text>
                  <Text style={styles.statLbl}>{t?.myStoriesViews ?? ''}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Heart size={14} color="#FF7E9D" />
                  <Text style={styles.statVal}>{formatCount(totalLikes, appLanguage)}</Text>
                  <Text style={styles.statLbl}>{t?.myStoriesLikes ?? ''}</Text>
                </View>
              </View>

              {draftCnt > 0 && (
                <View style={styles.draftBanner}>
                  <FileText size={11} color="#F59E0B" />
                  <Text style={styles.draftBannerTxt}>
                    {(t?.myStoriesDraftCount ?? '{n}').replace('{n}', String(draftCnt))}
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {loading ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingTxt}>{t?.loading ?? ''}</Text>
            </View>
          ) : stories.length === 0 ? (
            <EmptyState
              type="empty"
              title={t?.noMyStories ?? ''}
              subtitle={t?.noMyStoriesHint ?? ''}
            />
          ) : (
            stories.map((story, index) => {
              const isSelected = selectedIds.has(story.id);
              const meta = statusMeta[story.status] ?? statusMeta.draft;
              const data = buildMyStoryCardData(story, appLanguage, applyName, t);
              const modelBadge = getModelBadgeMeta(data.modelId, t);
              const canOpenDetail = story.status === 'published';
              const chapterRaw =
                (story as unknown as Record<string, unknown>).lastChapterIndex ??
                (story as unknown as Record<string, unknown>).last_chapter_index ??
                (story as unknown as Record<string, unknown>).last_chapter_idx;
              const hasChapterBadge = chapterRaw != null;
              const chapterIndex = Number(chapterRaw ?? 0) || 0;
              const chapterBadgeText = `CH${Math.max(1, chapterIndex + 1)}`;

              return (
                <Animated.View
                  key={story.id}
                  entering={selectionMode ? undefined : FadeInDown.delay(index * 40).springify().damping(18)}
                  style={styles.storyCardWrap}
                >
                  <WideStoryCardFrame
                    coverUrl={data.coverUrl}
                    title={data.title}
                    description={data.description ?? t?.description}
                    tagsText={data.tagsText}
                    likeCount={formatCount(story.likeCount, appLanguage)}
                    playCount={formatCount(story.playerCount ?? story.viewCount, appLanguage)}
                    onPress={() => {
                      if (selectionMode) {
                        toggleSelection(story.id);
                        return;
                      }
                      if (!canOpenDetail) return;
                      navigation.navigate('StoryDetail', {
                        story: {
                          id: story.id,
                          title: data.title,
                          description: data.description,
                          viewCount: story.viewCount,
                          likeCount: story.likeCount,
                          coverUrl: data.coverUrl,
                          cover_url: data.coverUrl,
                          story_config: story.story_config },
                        isMyStory: true });
                    }}
                    onLongPress={() => {
                      if (selectionMode) {
                        toggleSelection(story.id);
                      } else {
                        setSelectionMode(true);
                        setSelectedIds(new Set([story.id]));
                      }
                    }}
                    cardOverlayContent={
                      <>
                        {selectionMode ? (
                          <Animated.View entering={FadeInRight} exiting={FadeOutRight} style={styles.selectionOverlay}>
                            {isSelected ? (
                              <CheckCircle2 size={24} color="#D4A853" fill="rgba(212,168,83,0.1)" />
                            ) : (
                              <Circle size={24} color="rgba(255,255,255,0.3)" />
                            )}
                          </Animated.View>
                        ) : null}

                        <View pointerEvents="none" style={styles.cardOverlayFill}>
                          <View style={styles.cardCornerRow}>
                            {hasChapterBadge ? (
                              <View style={styles.chapterBadge}>
                                <Text style={styles.chapterBadgeText}>{chapterBadgeText}</Text>
                              </View>
                            ) : (
                              <View style={[styles.statusBadge, styles.coverStatusBadge, { backgroundColor: meta.bg }]}>
                                <View style={[styles.statusDot, { backgroundColor: meta.dot }]} />
                              </View>
                            )}
                            {modelBadge ? (
                              <View style={[
                                styles.modelBadge,
                                modelBadge.tone === 'gold' && styles.modelBadgeGold,
                                modelBadge.tone === 'silver' && styles.modelBadgeSilver,
                                modelBadge.tone === 'red' && styles.modelBadgeRed,
                              ]}>
                                <Text style={styles.modelBadgeText}>{modelBadge.label}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </>
                    }
                    cardStyle={isSelected && styles.selectedCard}
                  />
                </Animated.View>
              );
            })
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>

      <ConfirmModal
        visible={deleteModalVisible}
        icon="trash"
        iconColor="#FF5555"
        title={t?.deleteSelectedTitle ?? ''}
        message={(t?.deleteSelectedConfirm ?? '{n}').replace('{n}', String(selectedIds.size))}
        actions={[
          {
            label: t?.cancel ?? '',
            onPress: () => setDeleteModalVisible(false),
            variant: 'default',
          },
          {
            label: t?.delete ?? '',
            onPress: confirmDelete,
            variant: 'danger',
          },
        ]}
        onRequestClose={() => setDeleteModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: APP_NAV_TONE },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: APP_NAV_TONE },
  headerTitleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 56,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center' },
  headerSpacer: {
    width: 38,
    height: 38 },
  headerTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: 'transparent',
    flex: 1,
    textAlign: 'center' },
  headerTitleVisible: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F3F8',
    textAlign: 'center',
  },
  cancelTxt: {
    color: '#D6DBE4',
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium },
  deleteBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center' },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12 },
  statsCard: {
    backgroundColor: '#11141B',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 18,
    overflow: 'hidden' },
  statsGrid: {
    flexDirection: 'row',
    paddingVertical: 18 },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5 },
  statVal: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#E8ECF4',
    letterSpacing: -0.5 },
  statLbl: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: '#8A93A4',
    letterSpacing: 0.2 },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'center' },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(245,158,11,0.06)' },
  draftBannerTxt: {
    fontSize: 12,
    color: '#F59E0B',
    fontFamily: Typography.fontFamily.medium },
  storyCardWrap: {
    marginBottom: 12 },
  selectedCard: {
    borderColor: 'rgba(212,168,83,0.5)',
    borderWidth: 1 },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center' },
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
  coverStatusBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chapterBadge: {
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(244,211,122,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244,211,122,0.28)',
  },
  chapterBadgeText: {
    fontSize: 10,
    color: '#F6F8FB',
    fontFamily: Typography.fontFamily.semibold,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10 },
  cardHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7 },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3 },
  statusTxt: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold },
  modelBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.08)' },
  modelBadgeGold: {
    backgroundColor: 'rgba(212,168,83,0.18)' },
  modelBadgeSilver: {
    backgroundColor: 'rgba(180,190,210,0.16)' },
  modelBadgeRed: {
    backgroundColor: 'rgba(255,120,120,0.16)' },
  modelBadgeText: {
    color: '#E8ECF4',
    fontSize: 10,
    fontFamily: Typography.fontFamily.semibold },
  cardDateText: {
    color: '#97A0B2',
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium },
  loadingWrap: {
    paddingTop: 80,
    alignItems: 'center' },
  loadingTxt: {
    fontSize: 14,
    color: '#8A93A4',
    fontFamily: Typography.fontFamily.regular },
  bottomSpacer: {
    height: 60 } });
