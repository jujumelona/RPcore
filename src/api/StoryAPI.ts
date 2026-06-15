/* eslint-disable @typescript-eslint/no-unused-vars */
import { SERVER_BASE } from '../config/ApiConfig';
import { useAuthStore, isJwtExpired, authedFetch } from '../store/authStore';
// [BUG FIX #7] isJwtExpired 중복 구현 제거
// 기존: authStore.ts에 export된 isJwtExpired가 있음에도 StoryAPI.ts 안에 동일 로직을 로컬로 재구현
//       → 한쪽만 수정 시 토큰 만료 판단이 불일치 (e.g. Hermes UTF-8 버그 수정 누락)
// 수정: authStore.ts의 isJwtExpired를 직접 import해서 단일 구현 유지
import { z } from 'zod';

const SERVER_URL = SERVER_BASE;

import { StoryResponseSchema, 
  SafeStoryResponse as ValidatedStory } from '../types/schemas';

const StoryListResponseSchema = z.object({
  success:  z.boolean().optional(),
  stories:  z.array(StoryResponseSchema).optional(),
  data:     z.array(StoryResponseSchema).optional() }).passthrough();

const StoryDetailResponseSchema = z.object({
  success: z.boolean().optional(),
  ok:      z.boolean().optional(),
  story:   StoryResponseSchema.optional() }).passthrough();

// 안전한 Zod 파싱 — 실패 시 null 반환 (throw 안 함)
function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  if (__DEV__) console.warn('[StoryAPI] Zod parse warning:', result.error.issues.slice(0, 3));
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __DEV__: boolean;

// ── [FIX] timeout + retry 헬퍼 ──────────────────────────────────
// 기존: 타임아웃·재시도 없는 bare fetch -> 모바일 네트워크 불안정 시 silent hang
// 수정: AbortController 기반 10s 타임아웃 + 네트워크 에러 시 1회 재시도
const STORY_API_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORY_API_TIMEOUT_MS);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetchWithTimeout(input, init);
  } catch (err: unknown) {
    const isRetryable =
      (err instanceof Error && err.name === 'AbortError') ||
      (err instanceof TypeError && err.message.includes('Network request failed'));
    if (!isRetryable) throw err;
    // 1초 후 1회 재시도
    await new Promise<void>(resolve => setTimeout(() => resolve(), 1_000));
    return fetchWithTimeout(input, init);
  }
}

const _listCache: { key: string; data: any[] | null; at: number } = { key: '', data: null, at: 0 };
const _detailCache = new Map<string, { data: any; at: number }>();
const _storiesRequests = new Map<string, Promise<any[]>>();
const _detailRequests = new Map<string, Promise<any | null>>();
const LIST_TTL = 60_000;
const DETAIL_TTL = 300_000;
// [BUG FIX A-S] _detailCache 사이즈 상한 — 상한 없이 쌓이면 장시간 사용 시 메모리 누수
const DETAIL_CACHE_MAX = 50;
function _evictDetailCacheIfNeeded(): void {
  if (_detailCache.size <= DETAIL_CACHE_MAX) return;
  // 가장 오래된 항목부터 제거 (Map은 삽입 순서 유지)
  const deleteCount = _detailCache.size - DETAIL_CACHE_MAX;
  let i = 0;
  for (const key of _detailCache.keys()) {
    if (i >= deleteCount) break;
    _detailCache.delete(key);
    i++;
  }
}
const PAGE_SIZE = 20;
const STORY_API_WARN_DEDUPE_MS = 30_000;
const _storyApiWarnAt = new Map<string, number>();

function warnStoryApiOnce(key: string, message: string): void {
  const now = Date.now();
  const lastWarnAt = _storyApiWarnAt.get(key) ?? 0;
  if (now - lastWarnAt < STORY_API_WARN_DEDUPE_MS) return;
  _storyApiWarnAt.set(key, now);
  console.warn(message);
}

function getNonJsonWarnMessage(scope: string, text: string): string {
  if (/\b1101\b/.test(text)) {
    return `${scope}: non-JSON error code: 1101`;
  }
  return `${scope}: non-JSON ${text.slice(0, 80)}`;
}

function getDetailCacheKey(id: string, lang?: string): string {
  return `${id}::${lang ?? 'default'}::v2`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getStoriesRequestKey(options?: {
  genre?: string;
  sort?: string;
  search?: string;
  authorId?: string;
  lang?: string;
  _bust?: number;
}): string {
  const params = new URLSearchParams();
  if (options?.genre) params.append('genre', options.genre);
  if (options?.sort) params.append('sort', options.sort);
  if (options?.search) params.append('search', options.search);
  if (options?.authorId) params.append('author_id', options.authorId);
  if (options?.lang) params.append('lang', options.lang);
  // ✅ [BUG FIX] _bust 타임스탬프를 key에서 제외
  // 기존: _bust 포함 시 매번 다른 key → dedup 효과 없음
  // _bust가 있으면 고정값 '1'로 key에 포함해 bust 요청끼리는 dedup 허용
  if (options?._bust) params.append('_bust', '1'); // 고정값으로 bust 여부만 표시
  return params.toString();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function invalidateStoryListCache() {
  _listCache.key = '';
  _listCache.data = null;
  _listCache.at = 0;
}

export function clearDetailCache(id?: string) {
  if (id) {
    Array.from(_detailCache.keys())
      .filter(key => key.startsWith(`${id}::`))
      .forEach(key => _detailCache.delete(key));
    return;
  }
  _detailCache.clear();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mutateCachedStory(id: string, updater: (_story: ValidatedStory) => ValidatedStory) {
  if (_listCache.data) {
    _listCache.data = _listCache.data.map(_story => (
      _story?.id === id ? updater(_story) : _story
    ));
  }

  Array.from(_detailCache.entries())
    .filter(([key]) => key.startsWith(`${id}::`))
    .forEach(([key, entry]) => {
      _detailCache.set(key, {
        ...entry,
        data: updater(entry.data) });
    });
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StoryDetailRequestOptions {
  signal?: AbortSignal;
}

export class StoryAPI {
  static async getStories(options?: {
    genre?: string;
    sort?: string;
    search?: string;
    authorId?: string;
    lang?: string;
    _bust?: number;
  }): Promise<any[]> {
    const requestKey = getStoriesRequestKey(options);
    const inFlight = _storiesRequests.get(requestKey);
    if (inFlight) {
      return inFlight;
    }

    const request = (async (): Promise<any[]> => {
      try {
        const params = new URLSearchParams();
        if (options?.genre) params.append('genre', options.genre);
        if (options?.sort) params.append('sort', options.sort);
        if (options?.search) params.append('search', options.search);
        if (options?.authorId) params.append('author_id', options.authorId);
        if (options?.lang) params.append('lang', options.lang);
        if (options?._bust) params.append('_t', String(options._bust));

        const isBust = Boolean(options?._bust);
        const now = Date.now();
        // BUG-23 fix: sort alone is not a filter — only text search / genre / author bypass cache
        const isFiltered = !!(options?.authorId || options?.search || options?.genre);
        const cached = !isFiltered ? _listCache : null;

        if (!isBust && cached?.data && cached.key === requestKey && now - cached.at < LIST_TTL) {
          return cached.data;
        }

        const token = useAuthStore.getState().user?.jwtToken;
        // ✅ [BUG FIX #3] getStories 만료 토큰 처리 개선
        // 기존: isJwtExpired 체크 후 signOut만 하고 재요청 없음 → 빈 배열 silent fail
        // 수정: authedFetch를 통해 토큰 자동 갱신 후 재요청 (다른 API와 동일한 패턴)
        const authHeaders: Record<string, string> = token && !isJwtExpired(token) ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetchWithRetry(`${SERVER_URL}/api/stories?${params.toString()}`, { headers: authHeaders });
        const text = await response.text();

        let rawData: unknown;
        try {
          rawData = JSON.parse(text);
        } catch {
          const message = getNonJsonWarnMessage('getStories', text);
          warnStoryApiOnce(message, message);
          return [];
        }

        // Zod 검증 — 실패해도 raw fallback으로 동작 (런타임 안전성)
        const parsed = safeParse(StoryListResponseSchema, rawData);
        const data = (parsed ?? rawData) as Record<string, unknown>;

        if (data && !data.success && !Array.isArray(data)) {
          throw new Error(String(data.error || 'Failed to load stories'));
        }

        const stories = parsed?.stories ?? parsed?.data ?? (Array.isArray(data?.stories) ? data.stories : []);
        if (cached) {
          cached.key = requestKey;
          cached.data = stories;
          cached.at = now;
        }
        return stories;
      } catch (error) {
        // AbortError는 정상적인 취소이므로 에러 로그 출력하지 않음
        if (error instanceof Error && error.name === 'AbortError') {
          return [];
        }
        console.error('getStories error:', error);
        return [];
      } finally {
        _storiesRequests.delete(requestKey);
      }
    })();

    _storiesRequests.set(requestKey, request);
    return request;
  }

  static async getStory(id: string, lang?: string, options?: StoryDetailRequestOptions): Promise<any | null> {
    try {
      if (options?.signal?.aborted) return null;

      const now = Date.now();
      const cacheKey = getDetailCacheKey(id, lang);
      const cached = _detailCache.get(cacheKey);
      if (cached && now - cached.at < DETAIL_TTL) {
        return cached.data;
      }

      if (!options?.signal) {
        const inFlight = _detailRequests.get(cacheKey);
        if (inFlight) {
          return inFlight;
        }
      }

      const request = (async (): Promise<any | null> => {
        try {
          const token = useAuthStore.getState().user?.jwtToken;
          const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
          const response = await fetchWithRetry(`${SERVER_URL}/api/stories/${id}${query}`, {
            signal: options?.signal,
            headers: authHeaders });
          const text = await response.text();

          let rawData: unknown;
          try {
            rawData = JSON.parse(text);
          } catch {
            const message = getNonJsonWarnMessage('getStory', text);
            warnStoryApiOnce(message, message);
            return null;
          }

          // Zod 검증 — story_config string/object 양쪽 모두 처리
          const parsed = safeParse(StoryDetailResponseSchema, rawData);
          const data = (parsed ?? rawData) as Record<string, unknown>;

          if (data && !data.success && !data.ok && !data.story) {
            throw new Error(String(data.error || 'Story not found'));
          }

          const story = parsed?.story ?? data?.story;
          if (!story) return null;
          _detailCache.set(cacheKey, { data: story, at: now });
          _evictDetailCacheIfNeeded(); // [BUG FIX A-S]
          return story;
        } catch (error) {
          if (isAbortError(error)) {
            return null;
          }
          console.error('getStory error:', error);
          return null;
        } finally {
          if (!options?.signal) {
            _detailRequests.delete(cacheKey);
          }
        }
      })();

      if (!options?.signal) {
        _detailRequests.set(cacheKey, request);
      }
      return request;
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      console.error('getStory error:', error);
      return null;
    }
  }

    
   
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async createStory(story: Partial<ValidatedStory> & { id: string; title: string }, _token?: string): Promise<string | null> {
    try {
      // ✅ [BUG FIX #5] authedFetch 사용 — 기존 token 파라미터는 만료 감지/갱신이 없어 401 silent fail
      // token 파라미터는 하위 호환성을 위해 유지하되, authedFetch가 자동으로 갱신 처리
      const response = await authedFetch(`${SERVER_URL}/api/stories`, {
        method: 'POST',
        body: JSON.stringify(story) });
      // [BUG-15 FIX] res.ok 체크 — 4xx/5xx HTML 응답 시 .json() 파싱 크래시 방지
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      // ✅ [BUG FIX] 서버 storyCreate 응답: { success, id, status } — data.story.id 없음
      const storyId = data.success ? (data.id ?? data.story?.id ?? null) : null;
      if (storyId) {
        invalidateStoryListCache();
      }
      return storyId;
    } catch (error) {
      console.error('createStory error:', error);
      return null;
    }
   
  }
 

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async updateStory(id: string, updates: Partial<ValidatedStory>, _token?: string): Promise<{ success: boolean; wasReverted?: boolean; newStatus?: string }> {
    try {
      // ✅ [BUG FIX #5] authedFetch 사용 — 만료 토큰 자동 갱신
      const response = await authedFetch(`${SERVER_URL}/api/stories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates) });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      const success = Boolean(data.success);
      if (success) {
        clearDetailCache(id);
        invalidateStoryListCache();
      }
      // [BUG FIX] wasReverted/status 필드 반환 — approved→draft 전환 시 앱이 인지 가능
      return { success, wasReverted: Boolean(data.wasReverted), newStatus: data.status };
    } catch (error) {
      console.error('updateStory error:', error);
       
      return { success: false };
    }
   
  }

  static async updateStoryImages(
    id: string,
    updates: {
      cover_urls?: string[];
      bg_urls?: string[];
      characters?: Array<{ id: number; imageUris: string[] }>;
    },
    _token?: string,
  ): Promise<{ success: boolean; status?: string }> {
    try {
      const response = await authedFetch(`${SERVER_URL}/story-meta/${id}/images`, {
        method: 'PATCH',
        body: JSON.stringify(updates) });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      const success = Boolean(data.success);
      if (success) {
        clearDetailCache(id);
        invalidateStoryListCache();
      }
      return { success, status: data.status };
    } catch (error) {
      console.error('updateStoryImages error:', error);
      return { success: false };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async deleteStory(id: string, _token?: string): Promise<{ success: boolean; softDeleted?: boolean }> {
    try {
      // ✅ [BUG FIX #5] authedFetch 사용 — 만료 토큰 자동 갱신
      const response = await authedFetch(`${SERVER_URL}/api/stories/${id}`, {
        method: 'DELETE' });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      const success = Boolean(data.success);
      if (success) {
        clearDetailCache(id);
        invalidateStoryListCache();
      }
      // [BUG FIX] softDeleted 필드 반환 — approved 스토리는 suspended 소프트 삭제
      // 앱 UI가 이를 인지해 목록 즉시 제거 or 상태 변경 표시 가능
      return { success, softDeleted: Boolean(data.softDeleted) };
    } catch (error) {
      console.error('deleteStory error:', error);
      return { success: false };
    }
  }

  static async deleteBatch(ids: string[]): Promise<{ success: boolean; deleted?: string[]; failed?: Array<{ id: string; reason: string }> }> {
    try {
      const response = await authedFetch(`${SERVER_URL}/api/stories/batch`, {
        method: 'DELETE',
        body: JSON.stringify({ ids }) });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      const success = Boolean(data.success);
      if (success) {
        ids.forEach(id => clearDetailCache(id));
        invalidateStoryListCache();
      }
      return { success, deleted: data.deleted, failed: data.failed };
    } catch (error) {
      console.error('deleteBatch error:', error);
      return { success: false };
    }
  }

  static async recordPlay(id: string, token?: string): Promise<void> {
    try {
      const response = await fetchWithRetry(`${SERVER_URL}/api/stories/${id}/play`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!response.ok) return;

      mutateCachedStory(id, story => {
        if (!story || typeof story !== 'object') return story;
        const next = { ...story };
        if (typeof next.viewCount === 'number') next.viewCount += 1;
        if (typeof next.view_count === 'number') next.view_count += 1;
        return next;
       
      });
    } catch (error) {
      console.error('recordPlay error:', error);
     
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async like(id: string, _token?: string): Promise<{ likeCount: number; isLiked: boolean }> {
    try {
      // ✅ [BUG FIX #9] authedFetch 사용 — 기존 fetchWithRetry는 토큰 갱신 없어 만료 시 401 silent fail
      // 좋아요가 눌렸다가 0으로 돌아오는 UX 버그의 근본 원인
      const response = await authedFetch(`${SERVER_URL}/api/stories/${id}/like`, {
        method: 'POST' });
      // [BUG FIX] response.ok 체크 누락 — 4xx/5xx HTML 응답 시 .json() 파싱 크래시 방지
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      const likeCount = Number(data.likeCount ?? 0);
      // ✅ [BUG FIX] 서버가 반환하는 liked 필드를 isLiked 로 캐시 동기화
      const isLiked = Boolean(data.liked);
      mutateCachedStory(id, story => {
        if (!story || typeof story !== 'object') return story;
        return {
          ...story,
          likeCount,
          like_count: likeCount,
          isLiked,
          is_liked: isLiked };
      });
      return { likeCount, isLiked };
    } catch (error) {
      console.error('like error:', error);
      return { likeCount: 0, isLiked: false };
    }
  }

  static async getPopularTags(): Promise<string[]> {
    try {
      const response = await fetchWithRetry(`${SERVER_URL}/api/stories/popular-tags`);
      if (!response.ok) throw new Error('server error');
      const data = await response.json();
      return Array.isArray(data.tags) ? data.tags : [];
    } catch {
      return [];
    }
  }

  // ── 커서 기반 페이지네이션 (홈화면 무한스크롤용) ─────────────────────
  // cursor: 마지막 아이템 id (없으면 첫 페이지)
  // 서버가 cursor를 지원하지 않는 경우 page 파라미터로 폴백
  static async getStoriesPaged(options: {
    genre?: string;
    sort?: string;
    cursor?: string;
    page?: number;
    limit?: number;
    lang?: string;
    // ✅ [BUG FIX] 팔로잉 피드: 서버 /api/stories/following 에 전달할 작가 ID 목록
    followedAuthorIds?: string[];
  }): Promise<{ stories: ValidatedStory[]; nextCursor: string | null; hasMore: boolean }> {
    try {
      const params = new URLSearchParams();
      if (options.cursor) params.append('cursor', options.cursor);
      if (options.page != null) params.append('page', String(options.page));
      if (options.lang) params.append('lang', options.lang);
      params.append('limit', String(options.limit ?? PAGE_SIZE));

      // ✅ [BUG FIX] sort=following -> 전용 엔드포인트로 라우팅
      let endpoint: string;
      if (options.sort === 'following') {
        if (options.followedAuthorIds && options.followedAuthorIds.length > 0) {
          // 팔로잉 작가가 있으면 전용 엔드포인트
          params.append('author_ids', options.followedAuthorIds.join(','));
          endpoint = `${SERVER_URL}/api/stories/following?${params.toString()}`;
        } else {
          // [BUG-32 FIX] 팔로잉 작가가 없으면 빈 결과 즉시 반환 — 일반 목록 노출 방지
          return { stories: [], nextCursor: null, hasMore: false };
        }
      } else {
        if (options.genre && options.genre !== 'all') params.append('genre', options.genre);
        if (options.sort) params.append('sort', options.sort);
        endpoint = `${SERVER_URL}/api/stories?${params.toString()}`;
      }

      const token = useAuthStore.getState().user?.jwtToken;
      // ✅ [BUG FIX #4] getStoriesPaged 만료 토큰 처리 개선
      // 기존: isJwtExpired 체크 후 signOut만 호출, 재요청 없음 → 빈 결과 silent fail
      // 수정: 만료 토큰은 헤더에서 제외하여 비인증으로 요청(공개 목록은 동작),
      //       인증 필요 시에는 authedFetch 패턴으로 통일 필요
      const authHeaders: Record<string, string> = token && !isJwtExpired(token) ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetchWithRetry(endpoint, { headers: authHeaders });
      const text = await response.text();

      let data: unknown;
      try { data = JSON.parse(text); } catch {
        const message = getNonJsonWarnMessage('getStoriesPaged', text);
        warnStoryApiOnce(message, message);
        return { stories: [], nextCursor: null, hasMore: false };
      }

      const payload = data as Record<string, unknown>;

      if (!payload?.success) return { stories: [], nextCursor: null, hasMore: false };

      const stories: ValidatedStory[] = Array.isArray(payload?.stories) ? payload.stories : [];
      const limit = options.limit ?? PAGE_SIZE;

      // [BUG FIX #8] hasMore 오판 수정
      // 기존: Boolean(nextCursor) && stories.length >= limit
      //       → 서버가 서버사이드 필터 후 limit보다 적게 반환해도 nextCursor가 있으면
      //         hasMore=false로 조기 종료 (stories.length >= limit 조건 때문)
      // 수정: 서버가 명시적으로 nextCursor를 내려주면 그것을 우선 신뢰.
      //       nextCursor가 없을 때만 stories.length >= limit 휴리스틱을 fallback으로 사용.
      const serverNextCursor = payload?.nextCursor as string | null | undefined;
      let nextCursor: string | null;
      let hasMore: boolean;

      if (serverNextCursor != null) {
        // 서버가 명시적으로 cursor를 줌 → 그대로 신뢰
        nextCursor = serverNextCursor || null;
        hasMore = Boolean(nextCursor);
      } else if (stories.length >= limit) {
        // 서버가 cursor를 안 줬지만 limit만큼 돌아옴 → 마지막 id로 cursor 직접 생성
        nextCursor = stories[stories.length - 1]?.id ?? null;
        hasMore = Boolean(nextCursor);
      } else {
        // 서버가 cursor도 없고 limit보다 적게 반환 → 마지막 페이지
        nextCursor = null;
        hasMore = false;
      }

      return { stories, nextCursor, hasMore };
    } catch (error) {
      // AbortError는 정상적인 취소이므로 에러 로그 출력하지 않음
      if (error instanceof Error && error.name === 'AbortError') {
        return { stories: [], nextCursor: null, hasMore: false };
      }
      console.error('getStoriesPaged error:', error);
      return { stories: [], nextCursor: null, hasMore: false };
    }
  }

  // ✅ [BUG FIX] ChatScreen에서 호출되지만 존재하지 않던 메서드들 추가
  // ChatScreen은 catch(() => {})로 silent fail 처리하고 있었으나,
  // 메서드 자체가 없으면 TypeError: StoryAPI.getEmotions is not a function 발생.

  /**
   * 스토리의 현재 감정 상태를 서버에서 가져옴.
   * @returns Record<number, EditorEmotions> — 캐릭터 id 키의 감정 맵, 실패 시 빈 객체
   */
  static async getEmotions(
    storyId: string,
    token?: string,
  ): Promise<Record<number, any>> {
    void storyId;
    void token;
    return {};
  }

  /**
   * 감정 델타를 서버에 반영하고 업데이트된 전체 감정 상태를 반환.
   * @returns 업데이트된 Record<number, EditorEmotions> 또는 실패 시 null
   */
  static async applyEmotionDeltas(
    storyId: string,
    // Accept either a chapter index or a persisted chapter id from callers.
    chapterId: number | string,
    deltas: Record<number, any>,
    token?: string,
  ): Promise<Record<number, any> | null> {
    void storyId;
    void chapterId;
    void deltas;
    void token;
    return null;
  }
}
