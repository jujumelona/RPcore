/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/CreateScreen.tsx — PREMIUM v4
import { triggerHaptic } from '../utils/haptics';
import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeInDown,
  SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { appStorage } from '../utils/storage';
import { Radius, Typography } from '../constants/tokens';
import { ConfirmModal } from '../components/ConfirmModal';
import { ToastService } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import { useModelStore } from '../store/modelStore';
import { useLanguageStore } from '../store/languageStore';
import { formatCount } from '../utils/formatCount';
import { fuzzySearch } from '../utils/fuzzySearch';
import { cleanupStoryData } from '../utils/storyDataCleanup';
import { PressableOpacity } from '../components/PressableOpacity';
import { useAuthStore } from '../store/authStore';
import { Play, PenLine, Sparkles, BookText, AlertTriangle,
  Trash2, Check, X, ChevronRight } from 'lucide-react-native';
import { Dimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { LineChart } from 'react-native-gifted-charts';
import { authedFetch } from '../utils/authedFetch';
import { StoryAPI } from '../api/StoryAPI';
import { useUserProfileStore } from '../store/userProfileStore';
import { WideStoryCardFrame } from '../components/StoryCard';
import { getModelBadgeMeta, resolveStoryModelId } from '../utils/storyModelMeta';
import { getUIPhrases } from '../i18n/uiPhrases';
import { buildStoryDisplayModel,
  extractCoverUrl,
  extractStoryTags,
  parseStoryConfig,
  pickString,
  splitHashtags } from './home/utils/storyHelpers';
import { normalizeStoryGenre } from '../utils/storyGenres';

const { width } = Dimensions.get('window');

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

function getLinkedServerStoryIdFromStory(story: MyStory): string {
  const storyConfig = getStoryConfigObject(story.story_config);
  const linkedServerStoryId = typeof storyConfig.linkedServerStoryId === 'string'
    ? storyConfig.linkedServerStoryId.trim()
    : '';
  return linkedServerStoryId && !isLocalDraftOnlyId(linkedServerStoryId) ? linkedServerStoryId : '';
}

interface MyStory {
  id: string; title: string;
  status: 'draft' | 'published' | 'review' | 'approved' | 'rejected' | 'suspended';
  updatedAt: number; viewCount: number; likeCount: number; description: string;
  genre?: string;
  createdAt?: number;
  story_config?: unknown;
  cover_url?: string;
  cover_urls?: string[];
  thumb_url?: string;
  model_id?: string;
  started_model_id?: string;
}

// 상태별 디자인 설정
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATUS_MAP: Record<string, { labelKey: string; color: string; bg: string; dot: string }> = {
  draft:       { labelKey: 'statusDraft',     color: '#6A6A80', bg: 'rgba(255,255,255,0.04)', dot: '#3A3A50' },
  published:   { labelKey: 'statusPublished', color: '#D4A853', bg: 'rgba(212,168,83,0.10)',  dot: '#D4A853' },
  review:      { labelKey: 'statusReview',    color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  dot: '#F59E0B' },
  approved:    { labelKey: 'statusApproved',   color: '#4ADE80', bg: 'rgba(74,222,128,0.10)',  dot: '#4ADE80' },
  rejected:    { labelKey: 'statusRejected',   color: '#FF5555', bg: 'rgba(255,85,85,0.10)',   dot: '#FF5555' },
  suspended:   { labelKey: 'statusSuspended',  color: '#FF5555', bg: 'rgba(255,85,85,0.10)',   dot: '#FF5555' } };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATUS_FILTER_MAP: Record<string, { labelKey: string; color: string; bg: string }> = {
  all:       { labelKey: 'filterAll',       color: '#8A8A9E', bg: 'rgba(255,255,255,0.05)' },
  published: { labelKey: 'statusPublished', color: '#D4A853', bg: 'rgba(212,168,83,0.15)' },
  draft:     { labelKey: 'statusDraft',     color: '#6A6A80', bg: 'rgba(106,106,128,0.15)' },
  rejected:  { labelKey: 'statusRejected',  color: '#FF5555', bg: 'rgba(255,85,85,0.15)' } };

async function loadMyStories(): Promise<MyStory[]> {
  try {
    const raw = appStorage.getString(MY_STORIES_KEY);
    const list: MyStory[] = raw ? JSON.parse(raw) : [];
    const next = mergeWithStoredDrafts(list);
    appStorage.set(MY_STORIES_KEY, JSON.stringify(next));
    return next;
  }
  catch { return []; }
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
          status: 'draft' as const,
          updatedAt: Number(draft.savedAt ?? seed?.updatedAt ?? Date.now()) || Date.now(),
          createdAt: seed?.createdAt,
          viewCount: seed?.viewCount ?? 0,
          likeCount: seed?.likeCount ?? 0,
          cover_urls: draftCoverUris.length > 0 ? draftCoverUris : seed?.cover_urls,
          cover_url: seed?.cover_url,
          thumb_url: seed?.thumb_url,
          story_config: {
            ...(typeof seed?.story_config === 'object' && seed.story_config ? seed.story_config : {}),
            cover_urls: draftCoverUris.length > 0 ? draftCoverUris : (Array.isArray(seed?.cover_urls) ? seed.cover_urls : []),
            linkedServerStoryId: typeof draft.linkedServerStoryId === 'string' ? draft.linkedServerStoryId : undefined,
            storyHashtag: String(draft.storyHashtag ?? ''),
            worldSetting: String(draft.worldSetting ?? '') },
          model_id: typeof draft.modelId === 'string' ? draft.modelId : seed?.model_id,
          started_model_id: typeof draft.startedModelId === 'string' ? draft.startedModelId : seed?.started_model_id };
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

  list.filter(story => story.status !== 'draft').forEach(story => byLogicalId.set(getLogicalId(story), story));
  buildDraftStoryEntries(list).forEach(story => {
    const logicalId = getLogicalId(story);
    const existing = byLogicalId.get(logicalId);
    if (!existing || existing.status !== 'draft' || existing.updatedAt <= story.updatedAt) {
      byLogicalId.set(logicalId, story);
    }
  });

  return [...byLogicalId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function syncFromServer(): Promise<MyStory[] | null> {
  try {
    const res = await authedFetch('/story-meta/mine', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.stories)) return null;
    const mapped: MyStory[] = data.stories
      .map((s: Record<string, unknown>) => {
        let displayStatus: MyStory['status'];
        if (s.status === 'pending') displayStatus = 'review';
        else if (s.status === 'approved') displayStatus = 'published';
        else if (s.status === 'draft') displayStatus = 'draft';
        else displayStatus = s.status as MyStory['status'];
        return {
          id: s.id, title: String(s.title ?? ''), description: String(s.description ?? ''),
          status: displayStatus,
          updatedAt: parseServerDate(String(s.updated_at || s.created_at || '')),
          createdAt: parseServerDate(String(s.created_at || s.updated_at || '')),
          viewCount: Number(s.view_count || 0), likeCount: Number(s.like_count || 0),
          story_config: s.story_config,
          cover_url: typeof s.cover_url === 'string' ? s.cover_url : undefined,
          cover_urls: Array.isArray(s.cover_urls) ? s.cover_urls as string[] : undefined,
          thumb_url: typeof s.thumb_url === 'string' ? s.thumb_url : undefined,
          model_id: typeof s.model_id === 'string' ? s.model_id : undefined,
          started_model_id: typeof s.started_model_id === 'string' ? s.started_model_id : undefined };
      })
      .filter((s: MyStory) => s.status !== 'suspended');

    const localRaw = appStorage.getString(MY_STORIES_KEY);
    const localList: MyStory[] = localRaw ? JSON.parse(localRaw) : [];
    const storedDrafts = buildDraftStoryEntries(localList);
    const shadowedDraftIds = storedDrafts
      .filter(story => story.status === 'draft' && isLocalDraftOnlyId(String(story.id)))
      .filter(story => {
        const linkedServerStoryId = getLinkedServerStoryIdFromStory(story);
        return !!linkedServerStoryId && mapped.some(serverStory => serverStory.id === linkedServerStoryId);
      })
      .map(story => story.id);

    shadowedDraftIds.forEach(storyId => {
      appStorage.remove(`${DRAFT_KEY_PREFIX}${storyId}`);
    });

    const finalResult = mergeWithStoredDrafts(mapped);
    appStorage.set(MY_STORIES_KEY, JSON.stringify(finalResult));
    return finalResult;
  } catch { return null; }
}

async function deleteLocalStoryCached(id: string): Promise<void> {
  try {
    const list = await loadMyStories();
    appStorage.set(MY_STORIES_KEY, JSON.stringify(list.filter(s => s.id !== id)));
  } catch {}
}

function parseServerDate(dateStr: string | undefined): number {
  if (!dateStr) return Date.now();
  try {
    let normalized = dateStr.replace(' ', 'T');
    if (!normalized.includes('Z') && !normalized.includes('+')) normalized += 'Z';
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date(dateStr).getTime() : d.getTime();
  } catch { return Date.now(); }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function readDraftStory(storyId: string): Record<string, unknown> {
  try {
    const raw = appStorage.getString(`${DRAFT_KEY_PREFIX}${storyId}`) ?? '';
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return {};
  }
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
    ? (draft.storeCoverUris as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
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

function getStoryCardCoverSignature(story: MyStory): string {
  return [
    story.cover_url ?? '',
    story.thumb_url ?? '',
    Array.isArray(story.cover_urls) ? story.cover_urls.join('|') : '',
  ].join('||');
}

function getStoryCardConfigSignature(story: MyStory): string {
  if (typeof story.story_config === 'string') return story.story_config;
  if (story.story_config && typeof story.story_config === 'object') {
    try {
      return JSON.stringify(story.story_config);
    } catch {
      return '';
    }
  }
  return '';
}

const StoryCard = React.memo(function StoryCard({ story, index, onEdit, onDelete, onLongPress, selectMode, selected, appLanguage, statusMeta }: {
  story: MyStory; index: number; onEdit: () => void; onDelete: () => void;
  onLongPress: () => void; selectMode: boolean; selected: boolean;
  appLanguage: string;
  statusMeta: Record<string, { labelKey: string; color: string; bg: string; dot: string }>;
}) {
  const t = useLanguageStore(s => s.t);
  const applyName = useUserProfileStore(s => s.applyName);
  const data = useMemo(() => buildMyStoryCardData(story, appLanguage, applyName, t), [story, appLanguage, applyName, t]);
  const modelBadge = getModelBadgeMeta(data.modelId, t);
  const st = statusMeta[story.status] ?? statusMeta.draft;
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const chapterRaw =
    (story as unknown as Record<string, unknown>).lastChapterIndex ??
    (story as unknown as Record<string, unknown>).last_chapter_index ??
    (story as unknown as Record<string, unknown>).last_chapter_idx;
  const hasChapterBadge = chapterRaw != null;
  const chapterIndex = Number(chapterRaw ?? 0) || 0;

  return (
    <Animated.View entering={selectMode ? undefined : FadeInDown.delay(index * 25).duration(180)}>
      <Animated.View style={[animStyle, selected && cs.cardSelected]}>
        <View style={cs.cardWrapper}>
          <WideStoryCardFrame
            coverUrl={data.coverUrl}
            title={data.title}
            description={data.description ?? t?.description}
            tagsText={data.tagsText}
            likeCount={formatCount(story.likeCount, appLanguage)}
            playCount={formatCount(story.viewCount, appLanguage)}
            onPress={() => { triggerHaptic('select'); onEdit(); }}
            onLongPress={() => { triggerHaptic('medium'); onLongPress(); }}
            onPressIn={() => { scale.value = withTiming(0.985, { duration: 120 }); }}
            onPressOut={() => { scale.value = withTiming(1, { duration: 180 }); }}
            cardOverlayContent={
              <View pointerEvents="none" style={cs.cardOverlayFill}>
                <View style={cs.cardCornerRow}>
                  {hasChapterBadge ? (
                    <View style={cs.chapterBadge}>
                      <Play size={8} color="#F4D37A" fill="#F4D37A" />
                      <Text style={cs.chapterBadgeText}>{`CH${chapterIndex + 1}`}</Text>
                    </View>
                  ) : (
                    <View style={[cs.statusBadge, cs.coverStatusBadge, { backgroundColor: st.bg }]}>
                      <View style={[cs.statusDot, { backgroundColor: st.dot }]} />
                      <Text style={[cs.statusTxt, { color: st.color }]}>{(t as Record<string, string | undefined>)[st.labelKey] ?? st.labelKey}</Text>
                    </View>
                  )}
                  {modelBadge ? (
                    <View style={[
                      cs.modelBadge,
                      modelBadge.tone === 'gold' && cs.modelBadgeGold,
                      modelBadge.tone === 'silver' && cs.modelBadgeSilver,
                      modelBadge.tone === 'red' && cs.modelBadgeRed,
                    ]}>
                      <Text style={cs.modelBadgeText}>{modelBadge.label}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            }
            footerTrailing={
              !selectMode ? (
                <PressableOpacity onPress={onDelete} style={cs.cardDeleteBtn}>
                  <Trash2 size={14} color="#A8B0BE" />
                </PressableOpacity>
              ) : undefined
            }
          >
            {selectMode && (
              <View pointerEvents="none" style={[cs.selectOverlay, selected && cs.selectOverlayActive]}>
                {selected && <Check size={20} color="#D4A853" strokeWidth={3} />}
              </View>
            )}
          </WideStoryCardFrame>
        </View>
      </Animated.View>
    </Animated.View>
  );
}, (prev, next) => (
  prev.index === next.index &&
  prev.selectMode === next.selectMode &&
  prev.selected === next.selected &&
  prev.appLanguage === next.appLanguage &&
  prev.story.id === next.story.id &&
  prev.story.status === next.story.status &&
  prev.story.updatedAt === next.story.updatedAt &&
  prev.story.createdAt === next.story.createdAt &&
  prev.story.title === next.story.title &&
  prev.story.description === next.story.description &&
  prev.story.viewCount === next.story.viewCount &&
  prev.story.likeCount === next.story.likeCount &&
  prev.story.model_id === next.story.model_id &&
  prev.story.started_model_id === next.story.started_model_id &&
  getStoryCardCoverSignature(prev.story) === getStoryCardCoverSignature(next.story) &&
  getStoryCardConfigSignature(prev.story) === getStoryCardConfigSignature(next.story)
));

function SelectionBar({ count, total, onSelectAll, onDelete, onCancel, t }: {
  count: number; total: number;
  onSelectAll: () => void; onDelete: () => void; onCancel: () => void;
  t: Record<string, string | undefined>;
}) {
  return (
    <Animated.View
      entering={SlideInDown.duration(300).springify().damping(38).stiffness(260)}
      exiting={SlideOutDown.duration(200)}
      style={cs.selectBar}
    >
      <PressableOpacity style={cs.selectBarCancel} onPress={onCancel}>
        <X size={20} color={'#8A8A9E'} />
      </PressableOpacity>
      <PressableOpacity style={cs.selectAllBtn} onPress={onSelectAll}>
        <Text style={cs.selectAllTxt}>
          {count === total ? (t?.deselectAll ?? '') : (t?.selectAll ?? '')}
        </Text>
      </PressableOpacity>
      <Text style={cs.selectBarCount}>
        {(t?.itemsSelected ?? '{n}').replace('{n}', String(count))}
      </Text>
      <PressableOpacity
        style={[cs.selectDeleteBtn, count === 0 && cs.selectBtnDis]}
        onPress={onDelete}
        disabled={count === 0}
      >
        <Trash2 size={15} color={count > 0 ? '#FF5555' : '#797990'} />
        <Text style={[cs.selectDeleteTxt, count > 0 && cs.errorText]}>{t?.delete ?? ''}</Text>
      </PressableOpacity>
    </Animated.View>
  );
}

export function CreateScreen({ navigation }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const t = useLanguageStore(s => s.t);
  const { activeModelId, downloadedModels, isSwitching: modelSwitching, refresh: refreshModels } = useModelStore(
    useShallow((s) => ({
      activeModelId: s.activeModelId,
      downloadedModels: s.downloadedModels,
      isSwitching: s.isSwitching,
      refresh: s.refresh })),
  );
  const { appLanguage } = useLanguageStore();
  const uiPhrases = useMemo(() => getUIPhrases(appLanguage), [appLanguage]);
  const token = useAuthStore(s => s.user?.jwtToken);
  const statusMeta = useMemo(() => ({
    draft:       { labelKey: 'statusDraft', color: '#8C94A4', bg: 'rgba(140,148,164,0.12)', dot: '#8C94A4' },
    published:   { labelKey: 'statusCompleted', color: '#D4A853', bg: 'rgba(212,168,83,0.16)', dot: '#D4A853' },
    review:      { labelKey: 'statusReview', color: '#A78BFA', bg: 'rgba(167,139,250,0.14)', dot: '#A78BFA' },
    approved:    { labelKey: 'statusApproved', color: '#D4A853', bg: 'rgba(212,168,83,0.16)', dot: '#D4A853' },
    rejected:    { labelKey: 'statusRejected', color: '#FF5555', bg: 'rgba(255,85,85,0.12)', dot: '#FF5555' },
    suspended:   { labelKey: 'statusSuspended', color: '#6A6A80', bg: 'rgba(106,106,128,0.12)', dot: '#6A6A80' } }), []);
  const statusFilterMeta = useMemo(() => ({
    all:       { labelKey: 'filterAll', color: '#8A8A9E', bg: 'rgba(255,255,255,0.05)' },
    published: { labelKey: 'statusCompleted', color: '#D4A853', bg: 'rgba(212,168,83,0.15)' },
    draft:     { labelKey: 'statusDraft', color: '#8C94A4', bg: 'rgba(140,148,164,0.16)' },
    rejected:  { labelKey: 'statusRejected', color: '#FF5555', bg: 'rgba(255,85,85,0.15)' } }), []);

  const [myStories, setMyStories] = useState<MyStory[]>([]);
  
  const statsData = useMemo(() => {
    const total = myStories.reduce((acc, s) => acc + (s.viewCount || 0), 0);
    if (total === 0) {
      return [2, 5, 3, 8, 12, 10, 15, 14, 18, 22].map((v, i) => ({
        value: v,
        label: i < 3 ? String(3 - i) : String(i - 2),
      }));
    }
    const recentPart = total * 0.7;
    const pastPart = total * 0.3;
    const trend = [];
    for (let i = 0; i < 3; i++) {
      trend.push({ value: Math.round((pastPart / 3) * (0.4 + i * 0.2)) + 2, label: String(3 - i) });
    }
    for (let i = 0; i < 7; i++) {
      trend.push({ value: Math.round((recentPart / 7) * (0.5 + i * 0.1)) + 5, label: String(i + 1) });
    }
    return trend;
  }, [myStories]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'rejected'>('all');
  
  const [deleteStoryModal, setDeleteStoryModal] = useState<{ visible: boolean; story: MyStory | null }>({ visible: false, story: null });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (token) {
      const serverList = await syncFromServer();
      if (!isMountedRef.current) return;
      if (serverList !== null) { setMyStories(serverList); return; }
    }
    const local = await loadMyStories();
    if (isMountedRef.current) setMyStories(local);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hasPending = myStories.some(s => s.status === 'review');
    if (!hasPending) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [myStories, load]);

  useFocusEffect(useCallback(() => { refreshModels(); load(); }, [load, refreshModels]));

  const hasDownloadedActiveModel =
    !!activeModelId && downloadedModels.some(model => model.id === activeModelId);

  const handleNewStory = () => { triggerHaptic('light'); navigation.navigate('StoryEditor'); };
  const handleAIStory = () => {
    if (modelSwitching) { ToastService.info(uiPhrases.modelSwitching); return; }
    if (!hasDownloadedActiveModel) {
      ToastService.info(t?.wizardNoModel ?? t?.noModelDownloaded ?? t?.downloadModelFirst ?? '');
      return;
    }
    triggerHaptic('light');
    navigation.navigate('AIStoryChat', { selectedModelId: activeModelId });
  };
  const handleAIWebNovel = () => { triggerHaptic('light'); navigation.navigate('AIWebNovelChat'); };

  const handleDelete = (story: MyStory) => {
    triggerHaptic('medium');
    setDeleteStoryModal({ visible: true, story });
  };

  const enterSelectMode = useCallback((firstId: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([firstId]));
  }, []);
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => {
    if (selectedIds.size === myStories.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(myStories.map(s => s.id)));
  }, [selectedIds.size, myStories]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setMyStories(prev => prev.filter(s => !ids.includes(s.id)));
    exitSelectMode();
    ToastService.success(t?.deleteSuccessToast ?? '');
    (async () => {
      for (const id of ids) {
        try {
          // [BUG FIX] 로컬 draft는 서버에 없으므로 서버 API 호출 스킵
          const isLocalDraft = id.startsWith('draft_') || id.startsWith('story_');
          if (!isLocalDraft) {
            await StoryAPI.deleteStory(id);
          }
          await deleteLocalStoryCached(id);
          await cleanupStoryData(id);
        } catch {}
      }
    })();
  }, [selectedIds, exitSelectMode, t]);

  const doDeleteStory = useCallback(async () => {
    const story = deleteStoryModal.story;
    if (!story) return;
    const targetId = story.id;
    setMyStories(prev => prev.filter(s => s.id !== targetId));
    setDeleteStoryModal({ visible: false, story: null });
    ToastService.success(t?.deleteSuccessToast ?? '');
    try {
      // [BUG FIX] 로컬 draft는 서버에 없으므로 서버 API 호출 스킵
      const isLocalDraft = targetId.startsWith('draft_') || targetId.startsWith('story_');
      if (!isLocalDraft) {
        await StoryAPI.deleteStory(targetId);
      }
      await deleteLocalStoryCached(targetId);
      await cleanupStoryData(targetId);
    } catch (error) {
      console.warn('[CreateScreen] Delete story cleanup error:', error);
    }
  }, [deleteStoryModal.story, t]);

  const filteredStories = useMemo(() => {
    const statusMatched = myStories.filter(s => {
      const matchStatus = statusFilter === 'all' || 
      (statusFilter === 'published' && (s.status === 'published' || s.status === 'approved')) ||
      (statusFilter === 'draft' && s.status === 'draft') ||
      (statusFilter === 'rejected' && s.status === 'rejected');
      return matchStatus;
    });

    return fuzzySearch(
      statusMatched,
      searchQuery,
      [
        { name: 'title', weight: 0.55, getValue: story => story.title },
        { name: 'description', weight: 0.25, getValue: story => story.description },
        { name: 'genre', weight: 0.2, getValue: story => story.genre ?? '' },
      ],
      { threshold: 0.34 },
    );
  }, [myStories, searchQuery, statusFilter]);

  return (
    <>
      <SafeAreaView style={cs.safe} edges={['top', 'left', 'right']}>
        <View style={cs.flex1}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={cs.scrollContent}>
            <Animated.View entering={FadeInDown.springify()} style={cs.header}>
              <Text style={cs.headerTitle}>{t?.createTab ?? ''}</Text>
              <Text style={cs.headerSub}>{t?.createTipBody ?? ''}</Text>
            </Animated.View>

            <View style={cs.actionRow}>
              <Animated.View entering={FadeInDown.delay(60).springify()} style={cs.actionHalf}>
                <PressableOpacity style={cs.actionCard} onPress={handleNewStory} activeOpacity={0.85}>
                  <View style={[cs.actionIconWrap, cs.actionIconGold]}><PenLine size={20} color={'#D4A853'} /></View>
                  <Text style={cs.actionTitle}>{t?.newStory ?? ''}</Text>
                  <Text style={cs.actionSub} numberOfLines={2}>{t?.newStorySubtitle ?? ''}</Text>
                  <View style={cs.actionArrow}><ChevronRight size={12} color={'#D4A853'} /></View>
                </PressableOpacity>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(120).springify()} style={cs.actionHalf}>
                <PressableOpacity style={[cs.actionCard, cs.actionCardPurpleOutline]} onPress={handleAIStory} activeOpacity={0.85}>
                  <View style={[cs.actionIconWrap, cs.actionIconPurple]}><Sparkles size={20} color={'#8E6AC8'} /></View>
                  <Text style={cs.actionTitle}>{t?.aiCreate ?? ''}</Text>
                  <Text style={cs.actionSub} numberOfLines={2}>{t?.aiCreateSubtitle ?? ''}</Text>
                  <View style={[cs.actionArrow, cs.actionArrowPurple]}><ChevronRight size={12} color={'#8E6AC8'} /></View>
                </PressableOpacity>
              </Animated.View>
            </View>

            <View style={cs.actionRow}>
              <Animated.View entering={FadeInDown.delay(140).springify()} style={cs.actionHalf}>
                <PressableOpacity style={[cs.actionCard, cs.actionCardPurpleOutline]} onPress={handleAIWebNovel} activeOpacity={0.85}>
                  <View style={[cs.actionIconWrap, cs.actionIconPurple]}><BookText size={20} color={'#8E6AC8'} /></View>
                  <Text style={cs.actionTitle}>{t?.aiWebNovelBottomCreate ?? ''}</Text>
                  <Text style={cs.actionSub} numberOfLines={2}>{t?.aiWebNovelBottomSub ?? ''}</Text>
                  <View style={[cs.actionArrow, cs.actionArrowPurple]}><ChevronRight size={12} color={'#8E6AC8'} /></View>
                </PressableOpacity>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(160).springify()} style={cs.actionHalf}>
                <View style={[cs.actionCard, cs.actionCardGoldOutline, cs.actionCardNoPadding]}>
                  <View style={cs.statsInfoOverlay}>
                    <Text style={cs.statsMiniTitle}>{t?.performanceSummary ?? ''}</Text>
                    <View style={cs.statItem}>
                      <Play size={12} color="#D4A853" fill="#D4A853" />
                      <Text style={cs.statVal}>{formatCount(myStories.reduce((acc, s) => acc + (s.viewCount || 0), 0), appLanguage)}</Text>
                    </View>
                  </View>
                  <View style={cs.sparklineClip}>
                    <LineChart
                      data={statsData}
                      width={width * 0.45}
                      height={65}
                      initialSpacing={0}
                      color="#D4A853"
                      thickness={5}
                      hideAxesAndRules
                      hideDataPoints
                      curved
                      areaChart
                      startFillColor="rgba(212,168,83,0.22)"
                      endFillColor="rgba(212,168,83,0.02)"
                      animateOnDataChange
                      animationDuration={1000}
                      adjustToWidth
                    />
                  </View>
                </View>
              </Animated.View>
            </View>

            {downloadedModels.length === 0 && (
              <Animated.View entering={FadeInDown.delay(160).springify()} style={cs.noModelWarn}>
                <AlertTriangle size={13} color={'#F59E0B'} />
                <Text style={cs.noModelWarnTxt}>{t?.noModelDownloaded ?? t?.downloadModelFirst ?? ''}</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(180).springify()} style={cs.sectionHeader}>
              <Text style={cs.sectionLabel}>{t?.myStories2 ?? ''}</Text>
            </Animated.View>

            <View style={cs.filterSection}>
              <View style={cs.searchBox}>
                <View style={cs.searchIcon}><BookText size={16} color="#555" /></View>
                <TextInput 
                  style={cs.searchInp} 
                  placeholder={t?.searchPlaceholder ?? ''} 
                  placeholderTextColor="#555" 
                  value={searchQuery} 
                  onChangeText={setSearchQuery} 
                />
                {searchQuery.length > 0 && (
                  <PressableOpacity
                    onPress={() => setSearchQuery('')}
                    style={cs.clearSearch}
                  >
                    <X size={16} color="#8A8A9E" />
                  </PressableOpacity>
                )}
              </View>

              <View style={cs.statusRow}>
                {(['all', 'published', 'draft', 'rejected'] as const).map(key => {
                  const cfg = statusFilterMeta[key];
                  const active = statusFilter === key;
                  return (
                    <PressableOpacity key={key} style={[cs.statusChip, active && { backgroundColor: cfg.bg, borderColor: cfg.color }]} onPress={() => setStatusFilter(key)}>
                      <Text style={[cs.statusChipTxt, active && { color: cfg.color }]}>{t[cfg.labelKey] ?? cfg.labelKey}</Text>
                    </PressableOpacity>
                  );
                })}
              </View>
            </View>

            {filteredStories.length === 0 ? (
              <EmptyState 
                type="search" 
                title={searchQuery ? (t?.noSearchResult ?? '') : (t?.noStories ?? '')} 
                subtitle={searchQuery ? (t?.noSearchResultHint ?? '') : (t?.noStoriesHint ?? '')} 
              />
            ) : (
              filteredStories.map((story, index) => (
                <StoryCard
                  key={story.id} story={story} index={index}
                  selectMode={selectMode} selected={selectedIds.has(story.id)}
                  appLanguage={appLanguage}
                  statusMeta={statusMeta}
                  onLongPress={() => { if (selectMode) toggleSelect(story.id); else enterSelectMode(story.id); }}
                  onEdit={() => {
                    if (selectMode) { toggleSelect(story.id); return; }
                    if (story.status === 'review' || story.status === 'approved' || story.status === 'published' || story.status === 'suspended') {
                      navigation.navigate('StoryEditor', { storyId: story.id, imageOnly: true });
                      return;
                    }
                    if (String(story.status) === '__image_only_handled__') {
                      ToastService.info(t?.reviewLockMsg ?? '');
                      return;
                    }
                    navigation.navigate('StoryEditor', { storyId: story.id });
                  }}
                  onDelete={() => handleDelete(story)}
                />
              ))
            )}
          </ScrollView>

          {selectMode && (
            <SelectionBar
              count={selectedIds.size} total={myStories.length}
              onSelectAll={selectAll} onDelete={handleBulkDelete} onCancel={exitSelectMode} t={t as Record<string, string | undefined>}
            />
          )}
        </View>
      </SafeAreaView>

      <ConfirmModal
        visible={deleteStoryModal.visible} icon="trash-outline" iconColor={'#FF5555'}
        title={t?.deleteStoryTitle ?? ''}
        message={
          deleteStoryModal.story
            ? (t?.deleteStoryConfirmBodyNamed ?? '').replace('{title}', deleteStoryModal.story.title)
            : (t?.deleteStoryConfirmBody ?? '')
        }
        onRequestClose={() => setDeleteStoryModal({ visible: false, story: null })}
        actions={[
          { label: t?.delete ?? '', variant: 'danger', onPress: doDeleteStory },
          { label: t?.cancel ?? '', variant: 'default', onPress: () => setDeleteStoryModal({ visible: false, story: null }) },
        ]}
      />
    </>
  );
}

const cs = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507', position: 'relative' },
  errorText: { color: '#FF5555' },
  scrollContent: { paddingBottom: 100 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerTitle: { fontSize: 26, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.6 },
  headerSub:   { fontSize: 13, color: '#70788A', fontFamily: Typography.fontFamily.regular, marginTop: 4 },
  actionRow:  { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16 },
  actionHalf: { flex: 1 },
  actionCard: { borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, minHeight: 148, overflow: 'hidden', backgroundColor: '#0F1218' },
  actionCardPurpleOutline: { borderColor: 'rgba(142,106,200,0.22)' },
  actionIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 10 },
  actionIconGold:   { backgroundColor: 'rgba(212,168,83,0.12)', borderColor: 'rgba(212,168,83,0.25)' },
  actionIconPurple: { backgroundColor: 'rgba(142,106,200,0.14)', borderColor: 'rgba(142,106,200,0.24)' },
  actionTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#E8E8F0', marginBottom: 4, letterSpacing: -0.1 },
  actionSub:   { fontSize: 11, color: '#8790A0', fontFamily: Typography.fontFamily.regular, lineHeight: 16, flex: 1 },
  actionArrow: { position: 'absolute', bottom: 12, right: 12, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(212,168,83,0.10)', alignItems: 'center', justifyContent: 'center' },
  actionArrowPurple: { backgroundColor: 'rgba(142,106,200,0.12)' },
  actionRowSingle: { marginHorizontal: 16, marginBottom: 16 },
  actionFull: { flex: 1 },
  actionCardGoldOutline: { borderColor: 'rgba(212,168,83,0.36)', backgroundColor: 'rgba(212,168,83,0.08)' },
  actionCardNoPadding: { padding: 0 },
  actionIconBlue: { backgroundColor: 'rgba(212,168,83,0.14)', borderColor: 'rgba(212,168,83,0.24)' },
  flex1: { flex: 1 },
  noModelWarn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16, backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  noModelWarnTxt: { fontSize: 12, color: '#F59E0B', flex: 1, fontFamily: Typography.fontFamily.medium },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },
  sectionLabel: { flex: 1, fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#6A6A80', letterSpacing: 1.8, textTransform: 'uppercase' },

  cardSelected: { borderColor: '#D4A853', backgroundColor: 'rgba(212,168,83,0.08)' },
  selectOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 10 },
  selectOverlayActive: { backgroundColor: 'rgba(212,168,83,0.18)' },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(244,211,122,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244,211,122,0.28)',
  },
  chapterBadgeText: {
    fontSize: 9,
    color: '#F6F8FB',
    fontFamily: Typography.fontFamily.semibold,
  },
  selectBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0E0E14', borderTopWidth: 1, borderTopColor: '#181820', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 12 },
  selectBarCancel: { padding: 8 },
  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  selectAllTxt: { fontSize: 11, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },
  selectBarCount: { flex: 1, fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', textAlign: 'center' },
  selectDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,85,85,0.3)', backgroundColor: 'rgba(255,85,85,0.08)' },
  selectBtnDis: { opacity: 0.35 },
  selectDeleteTxt: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#797990' },

  cardWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 24,
    overflow: 'hidden' },
  cardGlass: {
    flexDirection: 'row',
    backgroundColor: 'rgba(60,66,76,0.14)',
    borderRadius: 24,
    padding: 10,
    alignItems: 'stretch',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8 },
  cardImgBox: { width: 84, height: 126, borderRadius: 18, backgroundColor: '#0B0C10', overflow: 'hidden' },
  cardImg: { width: '100%', height: '100%' },
  cardImgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0C10' },
  cardInfo: { flex: 1, marginLeft: 12, minHeight: 126, justifyContent: 'space-between', paddingVertical: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  cardTopSpacer: { minWidth: 8, minHeight: 8 },
  cardTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F4F6FA', flex: 1, letterSpacing: -0.2 },
  cardDesc: { fontSize: 12, color: '#E0E4EC', fontFamily: Typography.fontFamily.regular, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontFamily: Typography.fontFamily.bold },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  cardStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 11, color: '#E8EBF2', fontFamily: Typography.fontFamily.medium },
  statNumMuted: { fontSize: 11, color: '#A8B0BE', fontFamily: Typography.fontFamily.regular },
  timerIcon: { marginLeft: 6 },
  cardTags: { fontSize: 11, color: '#A8B0BE', fontFamily: Typography.fontFamily.medium, flex: 1 },
  cardDeleteBtn: { padding: 6, marginLeft: 4 },
  statsMiniTitle: { fontSize: 11, fontFamily: Typography.fontFamily.bold, color: '#D4A853' },
  statsInfoOverlay: { position: 'absolute', top: 16, left: 16, zIndex: 10, gap: 4 },
  statVal: { fontSize: 20, fontFamily: Typography.fontFamily.extrabold, color: '#D4A853' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sparklineClip: { position: 'absolute', bottom: -10, right: -10, opacity: 0.66 },

  modelBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  modelBadgeGold:   { backgroundColor: 'rgba(212,168,83,0.12)', borderColor: 'rgba(212,168,83,0.3)' },
  modelBadgeSilver: { backgroundColor: 'rgba(142,106,200,0.10)', borderColor: 'rgba(142,106,200,0.18)' },
  modelBadgeRed:    { backgroundColor: 'rgba(142,106,200,0.10)', borderColor: 'rgba(142,106,200,0.18)' },
  modelBadgeText: { fontSize: 9, fontFamily: Typography.fontFamily.bold, color: '#E8EBF2' },

  filterSection: { paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F0F16', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E2A', height: 44, paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  searchInp: { flex: 1, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular, paddingVertical: 0 },
  clearSearch: { padding: 4 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#0F0F16', borderWidth: 1, borderColor: '#1E1E2A' },
  statusChipTxt: { fontSize: 12, color: '#6A6A80', fontFamily: Typography.fontFamily.medium } });
