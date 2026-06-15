/* eslint-disable @typescript-eslint/no-unused-vars */
// src/store/userProfileStore.ts  v2
// ══════════════════════════════════════════════════════════════
// 사용자 프로필 전역 스토어
//
// v2 추가 필드:
//   gender          : 'male' | 'female' | 'other' | ''
//   preferredGenres : string[]   (최근 플레이/좋아요 장르 목록)
//   likedStoryIds   : string[]   (좋아요 누른 스토리 id 목록)
//   followedAuthorIds: string[]  (팔로우한 작가 id 목록)
//   blockedStoryIds : string[]   (차단한 스토리 id 목록)
//
// 모든 데이터는 AsyncStorage에만 저장 (서버 전송 없음)
// MyPageScreen의 PROFILE_KEY('user_profile')와 동일 키 공유
// ══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
// ✅ [OPT] AsyncStorage → 직접 MMKV 동기 호출
import { appStorage } from '../utils/storage';
import { StoryAPI } from '../api/StoryAPI';
import { authedFetch } from '../utils/authedFetch';
import { ModerationAPI } from '../api/ModerationAPI';
import { sanitizeNullableImageUrl } from '../utils/imageUrlPolicy';
// ✅ [FIX] 순환참조 제거: authStore ↔ userProfileStore 상호 import 방지
// authStore가 이미 userProfileStore를 import하지 않으므로, 여기서 lazy require로 단방향 유지
function getAuthToken(): string | undefined {
  return require('./authStore').useAuthStore.getState().user?.jwtToken;
}

export const PROFILE_KEY = 'user_profile'; // MyPageScreen과 동일 키

export interface UserProfile {
  name: string;
  handle: string;
  avatarUri: string | null;
  // v2 추가 — 추천 알고리즘용
  gender: 'male' | 'female' | 'other' | '';
  preferredGenres: string[];    // 최근 플레이/좋아요한 장르 (빈도순)
  likedStoryIds: string[];      // 좋아요 누른 스토리 id
  followedAuthorIds: string[];  // 팔로우한 작가 id
  blockedStoryIds: string[];    // 차단한 스토리 id
  blockedAuthorIds: string[];   // 차단한 작가 id
  blockedHashtags: string[];    // 차단한 해시태그
  reportedStoryIds: string[];   // 신고한 스토리 id
  playedGenreCounts: Record<string, number>; // { 'romance': 5, 'fantasy': 3, ... }
}

export interface BlockedStoryInfo {
  id: string;
  title: string;
  coverUrl?: string;
}

export interface BlockedAuthorInfo {
  id: string;
  name: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: 'User',
  handle: '@user',
  avatarUri: null,
  gender: '',
  preferredGenres: [],
  likedStoryIds: [],
  followedAuthorIds: [],
  blockedStoryIds: [],
  blockedAuthorIds: [],
  blockedHashtags: [],
  reportedStoryIds: [],
  playedGenreCounts: {} };

export interface UserProfileStore {
  profile: UserProfile;
  isLoaded: boolean;
  /** 앱 시작 시 AsyncStorage에서 로드 */
  initialize: () => Promise<void>;
  /** 프로필 전체 업데이트 후 AsyncStorage 저장 */
  setProfile: (_profile: UserProfile) => void;
  /** 개별 필드 업데이트 */
  updateProfile: (_partial: Partial<UserProfile>) => Promise<void>;
  /** {U}/{u} → 실제 이름 치환 */
  applyName: (_text: string) => string;

  // ── 추천 알고리즘용 액션 ──────────────────────────────────
  /** 좋아요 토글 */
  toggleLike: (_storyId: string, _genre?: string) => Promise<boolean>; // true = liked
  /** 팔로우 토글 */
  toggleFollow: (_authorId: string) => Promise<boolean>; // true = followed
  /** 스토리 차단 */
  blockStory: (_storyId: string, _storyTitle?: string, _coverUrl?: string) => Promise<void>;
  /** 스토리 차단 해제 */
  unblockStory: (_storyId: string) => Promise<void>;
  /** 작가 차단 */
  blockAuthor: (_authorId: string, _authorName?: string) => Promise<void>;
  /** 작가 차단 해제 */
  unblockAuthor: (_authorId: string) => Promise<void>;
  /** 해시태그 차단 */
  blockHashtag: (_tag: string) => Promise<void>;
  /** 해시태그 차단 해제 */
  unblockHashtag: (_tag: string) => Promise<void>;
  /** 스토리 신고 */
  reportStory: (_storyId: string) => Promise<void>;
  /** 스토리 플레이 시 장르 카운트 기록 */
  recordPlay: (_genre: string) => Promise<void>;
  /** 현재 팔로우 중인지 확인 */
  isFollowing: (_authorId: string) => boolean;
  /** 현재 좋아요 눌렀는지 확인 */
  isLiked: (_storyId: string) => boolean;
  /** 차단된 스토리인지 확인 */
  isBlocked: (_storyId: string) => boolean;
  /** 차단된 작가인지 확인 */
  isBlockedAuthor: (_authorId: string) => boolean;
}

// [BUG FIX] double-tap race condition 방지용 in-flight 추적 Set
const _pendingLikes = new Set<string>();

export const useUserProfileStore = create<UserProfileStore>()(immer((set, get) => ({
  profile: DEFAULT_PROFILE,
  isLoaded: false,

  initialize: async () => {
    if (get().isLoaded) return;
    try {
      const { UserProfileSchema } = await import('../types/schemas');
      const { FastStorage } = await import('../utils/storage');
      const cached = FastStorage.getValidatedObject(PROFILE_KEY, UserProfileSchema);
      if (cached) {
        const sanitized = {
          ...(cached as UserProfile),
          avatarUri: sanitizeNullableImageUrl((cached as UserProfile).avatarUri) };
        set({ profile: sanitized, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setProfile: (profile: UserProfile) => {
    const sanitized = { ...profile, avatarUri: sanitizeNullableImageUrl(profile.avatarUri) };
    set({ profile: sanitized });
    appStorage.set(PROFILE_KEY, JSON.stringify(sanitized));
  },

  updateProfile: async (partial: Partial<UserProfile>) => {
    const next = {
      ...get().profile,
      ...partial,
      ...(partial.avatarUri !== undefined ? { avatarUri: sanitizeNullableImageUrl(partial.avatarUri) } : {}) };
    set({ profile: next });
    // ✅ [OPT] 동기 MMKV 쓰기
    appStorage.set(PROFILE_KEY, JSON.stringify(next));
  },

  applyName: (text: string) => {
    const name = get().profile.name || 'User';
    return text.replace(/\{[Uu]\}/g, name);
  },

  toggleLike: async (storyId: string, genre?: string) => {
    // [BUG FIX] double-tap race condition 방지: 이미 서버 요청 중인 storyId는 무시
    if (_pendingLikes.has(storyId)) return get().profile.likedStoryIds.includes(storyId);
    _pendingLikes.add(storyId);

    try {
      const p = get().profile;
      const liked = new Set(p.likedStoryIds);
      const isNowLiked = !liked.has(storyId);

      if (isNowLiked) {
        liked.add(storyId);
        // 장르 선호도 반영
        if (genre) {
          const counts = { ...p.playedGenreCounts };
          counts[genre] = (counts[genre] ?? 0) + 2; // 좋아요는 가중치 2
          const genres = [...new Set([genre, ...p.preferredGenres])].slice(0, 10);
          await get().updateProfile({ likedStoryIds: [...liked], playedGenreCounts: counts, preferredGenres: genres });
        } else {
          await get().updateProfile({ likedStoryIds: [...liked] });
        }
      } else {
        liked.delete(storyId);
        await get().updateProfile({ likedStoryIds: [...liked] });
      }

      const token = getAuthToken();
      // [BUG FIX #26] rollback 조건 수정 — 서버 응답 isLiked와 의도 불일치 시에만 rollback
      const doRollback = () => {
        const cur = get().profile;
        const rollbackLiked = new Set(cur.likedStoryIds);
        if (isNowLiked) rollbackLiked.delete(storyId);
        else rollbackLiked.add(storyId);
        get().updateProfile({ likedStoryIds: [...rollbackLiked] }).catch(() => {});
      };
      StoryAPI.like(storyId, token ?? undefined).then(result => {
        if (typeof result?.isLiked === 'boolean' && result.isLiked !== isNowLiked) {
          doRollback();
        }
      }).catch(doRollback).finally(() => { _pendingLikes.delete(storyId); });

      return isNowLiked;
    } catch (e) {
      _pendingLikes.delete(storyId);
      throw e;
    }
  },

  toggleFollow: async (authorId: string) => {
    const p = get().profile;
    const followed = new Set(p.followedAuthorIds);
    const isNowFollowed = !followed.has(authorId);
    if (isNowFollowed) followed.add(authorId);
    else followed.delete(authorId);
    // 낙관적 업데이트
    await get().updateProfile({ followedAuthorIds: [...followed] });

    const doRollback = () => {
      const cur = get().profile;
      const rollback = new Set(cur.followedAuthorIds);
      if (isNowFollowed) rollback.delete(authorId);
      else rollback.add(authorId);
      get().updateProfile({ followedAuthorIds: [...rollback] }).catch(() => {});
    };

    const token = getAuthToken();
    if (token) {
      const endpoint = isNowFollowed ? 'follow' : 'unfollow';
      authedFetch(`/api/authors/${authorId}/${endpoint}`, { method: 'POST' })
        .then(res => { if (!res.ok) doRollback(); })
        .catch(doRollback);
    }

    return isNowFollowed;
  },

  blockStory: async (storyId: string, _storyTitle?: string, _coverUrl?: string) => {
    const p = get().profile;
    const blocked = new Set(p.blockedStoryIds);
    blocked.add(storyId);
    await get().updateProfile({ blockedStoryIds: [...blocked] });
    // ✅ [BUG FIX] 서버에 차단 신고 전송
    ModerationAPI.submitBlockSignal('story', storyId).catch(() => {});
  },

  unblockStory: async (storyId: string) => {
    const p = get().profile;
    const blocked = new Set(p.blockedStoryIds);
    blocked.delete(storyId);
    await get().updateProfile({ blockedStoryIds: [...blocked] });
  },

  blockAuthor: async (authorId: string, _authorName?: string) => {
    const p = get().profile;
    const blocked = new Set(p.blockedAuthorIds ?? []);
    blocked.add(authorId);
    await get().updateProfile({ blockedAuthorIds: [...blocked] });
    // ✅ [BUG FIX] 서버에 차단 신고 전송
    ModerationAPI.submitBlockSignal('user', authorId).catch(() => {});
  },

  unblockAuthor: async (authorId: string) => {
    const p = get().profile;
    const blocked = new Set(p.blockedAuthorIds ?? []);
    blocked.delete(authorId);
    await get().updateProfile({ blockedAuthorIds: [...blocked] });
  },

  blockHashtag: async (tag: string) => {
    const p = get().profile;
    const blocked = new Set(p.blockedHashtags ?? []);
    blocked.add(tag);
    await get().updateProfile({ blockedHashtags: [...blocked] });
  },

  unblockHashtag: async (tag: string) => {
    const p = get().profile;
    const blocked = new Set(p.blockedHashtags ?? []);
    blocked.delete(tag);
    await get().updateProfile({ blockedHashtags: [...blocked] });
  },

  reportStory: async (storyId: string) => {
    const p = get().profile;
    const reported = new Set(p.reportedStoryIds);
    reported.add(storyId);
    await get().updateProfile({ reportedStoryIds: [...reported] });
    // ✅ [BUG FIX] 서버에 신고 전송
    ModerationAPI.submitReport({
      targetType: 'story',
      targetId: storyId,
      reason: 'other',
    }).catch(() => {});
  },

  recordPlay: async (genre: string) => {
    const p = get().profile;
    const counts = { ...p.playedGenreCounts };
    counts[genre] = (counts[genre] ?? 0) + 1;
    // 선호 장르 목록을 플레이 횟수 내림차순으로 갱신
    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([g]) => g)
      .slice(0, 10);
    await get().updateProfile({ playedGenreCounts: counts, preferredGenres: sorted });
  },

  // ✅ [PERF FIX] O(n) includes() → Set 기반 O(1) 조회라고 착각한 안티패턴 수정
  // 기존: ids.length >= 20 이면 매 호출마다 new Set(ids) 생성.
  //       렌더 사이클마다 호출되면 `new Set` 할당/해제/해싱으로 인해 엄청난 가비지 생성 및 CPU 소모.
  //       V8 엔진에서 수백 개의 항목 배열에 대한 `.includes()`는 네이티브 루프라 단일 Set 할당 비용보다 빠름.
  // 수정: 단순 includes() 사용. 진짜로 크면 Map/Set을 별도 변수에 캐싱해야 함.
  isFollowing: (authorId: string) => {
    return get().profile.followedAuthorIds.includes(authorId);
  },
  isLiked: (storyId: string) => {
    return get().profile.likedStoryIds.includes(storyId);
  },
  isBlocked: (storyId: string) => {
    return get().profile.blockedStoryIds.includes(storyId);
  },
  isBlockedAuthor: (authorId: string) => {
    return (get().profile.blockedAuthorIds ?? []).includes(authorId);
  } })));

// 스토어 없이 쓰는 순수 함수
export function applyUserNameStr(text: string, userName: string): string {
  if (!text) return text;
  return text
    .replace(/\{[Uu]\}/g, userName)
    .replace(/(^|\n)(\s*)\[\s*user\s*\]\s*:?\s*/gi, (_match, lineStart: string, indent: string) =>
      `${lineStart}${indent}${userName}: `,
    )
    .replace(/(^|\n)(\s*)1\s*:\s*/g, (_match, lineStart: string, indent: string) =>
      `${lineStart}${indent}${userName}: `,
    );
}
