/* eslint-disable @typescript-eslint/no-unused-vars */
import { appStorage } from '../utils/storage';
import { clearDetailCache, invalidateStoryListCache } from '../api/StoryAPI';
import { kvStateManager } from '../core/llama/KVStateManager';
import kvCacheManager from '../core/llama/KVCacheManager';
import { sessionManager } from '../core/llama/SessionManager';
import { chapterLogTracker } from '../utils/ChapterLogTracker';
import { useChatStore } from '../store/chatStore';
import { useEmotionStore } from '../store/emotionStore';
import { PROFILE_KEY, type UserProfile, useUserProfileStore } from '../store/userProfileStore';
import RNFS from '../utils/fileSystemCompat';
import { MODELS, MODELS_DIR } from '../models/ModelConfig';
import { releaseStorySharedValues } from '../store/emotionSharedStore';
import { deleteStoryChapterCache } from './ChapterDownloadManager';
import { db } from '../core/sqlite/Database';


const MY_STORIES_KEY = '@my_stories';
const LEGACY_DRAFT_KEY_PREFIX = '@story_draft_';
const ACTIVE_DRAFT_KEY = '@active_draft_id';
const EDITOR_DRAFT_KEY_PREFIX = '@story_editor_draft_v3:';
const STORY_CACHE_KEY = '@stories_cache';
const RECENT_STORY_KEY = '@recent_story';
const STORY_DOWNLOAD_STATE_KEY = '@story_download_ready_v1';

function filterStoryIds(ids: string[] | undefined, storyId: string): string[] {
  return Array.isArray(ids) ? ids.filter(id => id !== storyId) : [];
}

async function removeStoryFromArrayStorage(storageKey: string, storyId: string): Promise<void> {
  const raw = appStorage.getString(storageKey) ?? null;
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      appStorage.remove(storageKey);
      return;
    }

    const filtered = parsed.filter(item => item?.id !== storyId);
    if (filtered.length === parsed.length) return;
    appStorage.set(storageKey, JSON.stringify(filtered));
  } catch {
    appStorage.remove(storageKey);
  }
}

async function cleanupActiveDraftPointer(storyId: string): Promise<void> {
  const activeDraftId = appStorage.getString(ACTIVE_DRAFT_KEY) ?? null;
  if (activeDraftId === storyId) {
    appStorage.remove(ACTIVE_DRAFT_KEY);
  }
}

async function cleanupRecentStoryPointer(storyId: string): Promise<void> {
  const recentStoryId = appStorage.getString(RECENT_STORY_KEY) ?? null;
  if (recentStoryId === storyId) {
    appStorage.remove(RECENT_STORY_KEY);
    useChatStore.setState({ recentStoryId: null });
  }
}

async function cleanupStoryDownloadState(storyId: string): Promise<void> {
  const raw = appStorage.getString(STORY_DOWNLOAD_STATE_KEY) ?? null;
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      appStorage.remove(STORY_DOWNLOAD_STATE_KEY);
      return;
    }
    const next = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([key]) => !key.startsWith(`${storyId}::`)),
    );
    appStorage.set(STORY_DOWNLOAD_STATE_KEY, JSON.stringify(next));
  } catch {
    appStorage.remove(STORY_DOWNLOAD_STATE_KEY);
  }
}

async function cleanupProfileStoryRefs(storyId: string): Promise<void> {
  const profileStore = useUserProfileStore.getState();
  let profile: UserProfile | null = profileStore.isLoaded ? profileStore.profile : null;

  if (!profile) {
    const raw = appStorage.getString(PROFILE_KEY) ?? null;
    if (raw) {
      try {
        profile = JSON.parse(raw) as UserProfile;
      } catch {
        profile = null;
      }
    }
  }

  if (!profile) return;

  const nextProfile: UserProfile = {
    ...profile,
    likedStoryIds: filterStoryIds(profile.likedStoryIds, storyId),
    blockedStoryIds: filterStoryIds(profile.blockedStoryIds, storyId),
    reportedStoryIds: filterStoryIds(profile.reportedStoryIds, storyId) };

  const changed =
    nextProfile.likedStoryIds.length !== (profile.likedStoryIds?.length ?? 0) ||
    nextProfile.blockedStoryIds.length !== (profile.blockedStoryIds?.length ?? 0) ||
    nextProfile.reportedStoryIds.length !== (profile.reportedStoryIds?.length ?? 0);

  if (!changed) return;
  useUserProfileStore.getState().setProfile(nextProfile);
}

async function cleanupAllModelStoryKV(storyId: string): Promise<void> {
  const modelIds = new Set(MODELS.map(model => model.id));

  try {
    const modelsDir = `${RNFS.DocumentDirectoryPath}/${MODELS_DIR}`;
    if (await RNFS.exists(modelsDir)) {
      const entries = await RNFS.readDir(modelsDir);
      entries.filter(entry => entry.isDirectory()).forEach(entry => modelIds.add(entry.name));
    }
  } catch { /* empty */ }

  await Promise.allSettled(
    [...modelIds].map(async modelId => {
      if (!modelId) return;
      await kvCacheManager.deleteStoryKV(modelId, storyId);
    }),
  );
}

async function cleanupStoryImages(storyId: string): Promise<void> {
  try {
    const imageDir = `${RNFS.DocumentDirectoryPath}/story_images/${storyId}`;
    if (await RNFS.exists(imageDir)) {
      await RNFS.unlink(imageDir);
    }
  } catch { /* empty */ }
}

export async function cleanupStoryData(storyId: string): Promise<void> {
  // ??[BUG-D FIX] 梨뺥꽣 ID 紐⑸줉 異붿텧?섏뿬 梨뺥꽣 ?띿뒪??罹먯떆 ??젣
  let chapterIds: string[] = [];
  try {
    const cacheKey = `@story_${storyId}`;
    const cached = appStorage.getString(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const cfg = parsed?.story_config ?? parsed;
      const chapters = Array.isArray(cfg?.chapters) ? cfg.chapters : [];
      chapterIds = chapters.map((ch: any) => String(ch?.id ?? '')).filter(Boolean);
    }
  } catch {
    // 罹먯떆 ?뚯떛 ?ㅽ뙣 ??臾댁떆
  }

  await Promise.allSettled([
    removeStoryFromArrayStorage(MY_STORIES_KEY, storyId),
    removeStoryFromArrayStorage(STORY_CACHE_KEY, storyId),
    Promise.resolve(appStorage.remove(`${LEGACY_DRAFT_KEY_PREFIX}${storyId}`)),
    Promise.resolve(appStorage.remove(`${EDITOR_DRAFT_KEY_PREFIX}${storyId}`)),
    cleanupStoryDownloadState(storyId),
    cleanupActiveDraftPointer(storyId),
    cleanupProfileStoryRefs(storyId),
    useChatStore.getState().clearSession(storyId),
    Promise.resolve().then(() => useEmotionStore.getState().resetStory(storyId)),
    kvStateManager.deleteStory(storyId),
    sessionManager.clearSession(storyId),
    // [BUG FIX] chapterLogTracker.clearStory ?꾨씫
    // ?댁쟾: ?ㅽ넗由???젣 ??ChapterLogTracker 硫붾え由?_current, _turnCounters, _chapterHistory)?
    //       story_logs/{storyId}_*.txt ?뚯씪???곴뎄 ?붾쪟 ??硫붾え由??꾩닔 + ?뚯씪 ?꾩쟻
    Promise.resolve(chapterLogTracker.clearStory(storyId)),
    // Remove story-scoped KV data for every installed model variant.
    Promise.resolve(cleanupAllModelStoryKV(storyId)),
    // Release story-scoped animation caches that can outlive the current screen.
    Promise.resolve(releaseStorySharedValues(storyId)),
    // ?ㅼ슫濡쒕뱶???대?吏 ?대뜑 ??젣
    cleanupStoryImages(storyId),
    // ??[NEW] DB story_assets ?덉퐫????젣
    Promise.resolve(db.deleteStoryAssets(storyId)),
    // ??[BUG-D FIX] 梨뺥꽣 ?띿뒪??罹먯떆 ??젣 異붽?
    Promise.resolve(deleteStoryChapterCache(chapterIds)),
  ]);

  clearDetailCache(storyId);
  invalidateStoryListCache();
}

export async function resetStoryToDownloadedBaseline(storyId: string): Promise<void> {
  await Promise.allSettled([
    cleanupRecentStoryPointer(storyId),
    useChatStore.getState().clearSession(storyId),
    Promise.resolve().then(() => useEmotionStore.getState().resetStory(storyId)),
    kvStateManager.resetStoryRuntime(storyId),
    sessionManager.clearSession(storyId),
    Promise.resolve(chapterLogTracker.clearStory(storyId)),
    Promise.resolve(releaseStorySharedValues(storyId)),
  ]);

  clearDetailCache(storyId);
}

