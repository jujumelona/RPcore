// src/api/NovelAPI.ts
import { z } from 'zod';
import { SERVER_BASE } from '../config/ApiConfig';
import {
  normalizeCommunityBoardType,
  normalizeCommunityTags,
  type CommunityBoardType,
} from '../community/communityModels';
import type { WNParagraph, WNEmotionData, WNCharacter } from '../utils/webNovelStorage';

const BASE = SERVER_BASE;
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_000;

// ── 공통 타입 ─────────────────────────────────────────────────

export type { CommunityBoardType } from '../community/communityModels';

export interface NovelPostPayload {
  title:        string;
  content:      string;
  tags:         string[];
  novelPreview?: string;
  novelBody?:   WNParagraph[];
  emotionData?: WNEmotionData;
  characters?:  WNCharacter[];
  authorId?:    string;
  authorName?:  string;
  lang:         string;
  boardType?:   CommunityBoardType;
}

export interface NovelPost {
  id:           string;
  title:        string;
  content:      string;
  tags:         string[];
  novelPreview: string;
  authorId:     string;
  authorName:   string;
  likeCount:    number;
  commentCount: number;
  likedByMe:    boolean;
  createdAt:    number;
  lang:         string;
  boardType:    CommunityBoardType;
}

export interface NovelPostDetail extends NovelPost {
  novelBody:    WNParagraph[];
  emotionData:  WNEmotionData;
  characters:   WNCharacter[];
}

// ── Zod 스키마 ─────────────────────────────────────────────────

const RawPostSchema = z.object({
  id:             z.union([z.string(), z.number()]).transform(String),
  title:          z.string().catch(''),
  content:        z.string().catch(''),
  tags:           z.array(z.string()).catch([]),
  novel_content:  z.string().optional().nullable(),
  author_id:      z.union([z.string(), z.number()]).transform(String).catch(''),
  author:         z.string().optional(),
  authorName:     z.string().optional(),
  like_count:     z.number().optional(),
  likeCount:      z.number().optional(),
  comment_count:  z.number().optional(),
  commentCount:   z.number().optional(),
  // [FIX] toggleLike 응답에 likeCount 포함 시 별도 getPost() 호출 제거
  toggle_like_count: z.number().optional(),
  liked:          z.boolean().optional(),
  created_at:     z.union([z.string(), z.number()]).optional(),
  createdAt:      z.union([z.string(), z.number()]).optional(),
  lang:           z.string().catch('en'),
  board_type:     z.string().optional(),
  boardType:      z.string().optional() });

type RawPost = z.infer<typeof RawPostSchema>;

const PostsResponseSchema = z.object({
  posts: z.array(z.unknown()) });

const PostResponseSchema = z.object({
  post: z.unknown() });

const CreatePostResponseSchema = z.object({
  success: z.boolean(),
  postId:  z.union([z.string(), z.number()]).transform(String).optional() });

// [FIX] likeCount 필드 추가 — 서버가 반환 시 별도 getPost() 불필요
const ToggleLikeResponseSchema = z.object({
  liked:      z.boolean().optional(),
  likeCount:  z.number().optional(),
  like_count: z.number().optional() });

// ── 네트워크 헬퍼 ────────────────────────────────────────────────────────────
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timerId);
  }
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 1): Promise<Response> {
  try {
    const response = await fetchWithTimeout(url, options);
    // [BUG FIX] HTTP 5xx 서버 에러도 재시도 (StoryAPI.fetchWithRetry와 동일한 처리)
    // 기존: fetch가 throw할 때만 재시도 → HTTP 500은 Response 객체를 정상 반환하므로 재시도 안 됨
    if (response.status >= 500 && retries > 0) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), RETRY_DELAY_MS));
      return fetchWithRetry(url, options, retries - 1);
    }
    return response;
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise<void>(resolve => setTimeout(() => resolve(), RETRY_DELAY_MS));
    return fetchWithRetry(url, options, retries - 1);
  }
}

// ── 내부 유틸 ─────────────────────────────────────────────────

function parseTimestamp(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  return Date.now();
}

function serializeNovelContent(paragraphs: WNParagraph[] = []): string | null {
  const lines = paragraphs
    .map(p => String(p.text ?? '').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join('\n\n') : null;
}

function deserializeNovelContent(novelContent: string | null | undefined, fallbackPreview = ''): WNParagraph[] {
  const rawText = typeof novelContent === 'string' ? novelContent.trim() : '';
  const chunks = (rawText || fallbackPreview)
    .split(/\n{2 }/)
    .map(c => c.trim())
    .filter(Boolean);
  return chunks.map((text, index) => ({ id: index, text }));
}

function getPreviewText(paragraphs: WNParagraph[], fallback: string): string {
  return paragraphs.find(p => p.text.trim())?.text.trim() ?? fallback;
}

function mapRawPost(raw: RawPost): NovelPost {
  const novelBody = deserializeNovelContent(raw.novel_content, raw.content);
  return {
    id:           raw.id,
    title:        raw.title,
    content:      raw.content,
    tags:         normalizeCommunityTags(raw.tags),
    novelPreview: getPreviewText(novelBody, raw.content),
    authorId:     raw.author_id,
    authorName:   raw.author ?? raw.authorName ?? '',
    likeCount:    raw.like_count ?? raw.likeCount ?? 0,
    commentCount: raw.comment_count ?? raw.commentCount ?? 0,
    likedByMe:    Boolean(raw.liked),
    createdAt:    parseTimestamp(raw.created_at ?? raw.createdAt),
    lang:         raw.lang,
    boardType:    normalizeCommunityBoardType(raw.board_type ?? raw.boardType) };
}

// ── API 클래스 ─────────────────────────────────────────────────

export class NovelAPI {
  static async getPosts(options?: {
    sort?:      'recent' | 'popular';
    tag?:       string;
    lang?:      string;
    search?:    string;
    page?:      number;
    boardType?: CommunityBoardType;
  }): Promise<NovelPost[]> {
    try {
      const params = new URLSearchParams();
      params.append('board_type', options?.boardType ?? 'webnovel');
      if (options?.lang)   params.append('lang',   options.lang);
      if (options?.search) params.append('search', options.search);
      if (options?.page)   params.append('page',   String(options.page));
      // [BUG-22 FIX] sort/tag를 서버에 전달 — 클라이언트 단 정렬은 현재 페이지만 적용되어 부정확
      if (options?.sort === 'popular') params.append('sort', 'popular');
      if (options?.tag) params.append('tag', options.tag);

      const response = await fetchWithRetry(`${BASE}/community/posts?${params.toString()}`);
      if (!response.ok) throw new Error(`getPosts failed: ${response.status}`);
      const rawData  = await response.json();

      const parsed = PostsResponseSchema.safeParse(rawData);
      if (!parsed.success) {
        if (__DEV__) console.warn('[NovelAPI] getPosts response schema mismatch:', parsed.error.flatten());
        return [];
      }

      let posts: NovelPost[] = parsed.data.posts
        .map(item => {
          const result = RawPostSchema.safeParse(item);
          return result.success ? mapRawPost(result.data) : null;
        })
        .filter((p): p is NovelPost => p !== null);

      // [BUG-22 FIX] sort/tag는 서버 파라미터로 처리 — 클라이언트 재정렬 제거
      // 서버가 sort=popular 미지원 시 likeCount 기준 클라이언트 정렬 유지
      if (options?.sort === 'popular' && posts.every(p => p.likeCount !== undefined)) {
        posts = posts.slice().sort((a, b) =>
          b.likeCount - a.likeCount || b.commentCount - a.commentCount || b.createdAt - a.createdAt,
        );
      } else if (!options?.sort || options.sort !== 'popular') {
        posts = posts.slice().sort((a, b) => b.createdAt - a.createdAt);
      }

      return posts;
    } catch {
      return [];
    }
  }

  static async getPost(id: string, authToken?: string): Promise<NovelPostDetail | null> {
    try {
      // [BUG-33 FIX] auth token 전달 — 없으면 likedByMe 항상 false
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const response = await fetchWithRetry(`${BASE}/community/posts/${id}`, { headers });
      if (!response.ok) throw new Error(`getPost failed: ${response.status}`);
      const rawData  = await response.json();

      const parsed = PostResponseSchema.safeParse(rawData);
      if (!parsed.success || !parsed.data.post) return null;

      const rawPost = RawPostSchema.safeParse(parsed.data.post);
      if (!rawPost.success) {
        if (__DEV__) console.warn('[NovelAPI] getPost schema mismatch:', rawPost.error.flatten());
        return null;
      }

      const basePost = mapRawPost(rawPost.data);
      return {
        ...basePost,
        novelBody:   deserializeNovelContent(rawPost.data.novel_content, rawPost.data.content),
        emotionData: {},
        characters:  [] };
    } catch {
      return null;
    }
  }

  static async createPost(payload: NovelPostPayload, authToken: string): Promise<{ id: string } | null> {
    try {
      const response = await fetchWithRetry(`${BASE}/community/posts`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${authToken}` },
        body: JSON.stringify({
          board_type:    payload.boardType ?? 'webnovel',
          lang:          payload.lang,
          title:         payload.title,
          content:       payload.content,
          novel_content: serializeNovelContent(payload.novelBody),
          tags:          payload.tags ?? [] }) });

      const rawData = await response.json().catch(() => ({}));

      const parsed = CreatePostResponseSchema.safeParse(rawData);
      if (!response.ok || !parsed.success || !parsed.data.success || !parsed.data.postId) {
        return null;
      }
      return { id: parsed.data.postId };
    } catch {
      return null;
    }
  }

  static async reportPost(
    id:        string,
    reason:    string,
    authToken: string,
  ): Promise<boolean> {
    try {
      const response = await fetchWithRetry(`${BASE}/community/posts/${id}/report`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ reason }) });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      return Boolean(data.success ?? true);
    } catch {
      return false;
    }
  }

  /**
   * [FIX] toggleLike — 2번 네트워크 요청 -> 1번으로 단축
   *
   * 서버가 토글 응답에 likeCount를 포함하면 getPost() 추가 호출 없이 반환.
   * 서버가 likeCount를 포함하지 않는 경우에만 fallback으로 getPost() 호출.
   */
  static async toggleLike(
    id:        string,
    authToken: string,
  ): Promise<{ likeCount: number; likedByMe: boolean } | null> {
    try {
      const response = await fetchWithRetry(`${BASE}/community/posts/${id}/like`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${authToken}` } });

      const rawToggle = await response.json().catch(() => ({}));
      if (!response.ok) return null;

      const toggleParsed = ToggleLikeResponseSchema.safeParse(rawToggle);
      const serverLikeCount = toggleParsed.success
        ? (toggleParsed.data.likeCount ?? toggleParsed.data.like_count)
        : undefined;

      // [BUG FIX] liked 필드가 없으면 undefined → Boolean(undefined)=false로 잘못 처리됨
      // 서버가 liked 필드를 반환하지 않으면 getPost()로 정확한 상태 확인
      const hasLikedField = toggleParsed.success && toggleParsed.data.liked !== undefined;
      const serverLiked = hasLikedField ? Boolean(toggleParsed.data.liked) : undefined;

      if (serverLikeCount !== undefined && serverLiked !== undefined) {
        return { likeCount: serverLikeCount, likedByMe: serverLiked };
      }

      // fallback: 서버가 likeCount 또는 liked 미포함 시 getPost() 호출
      const post = await NovelAPI.getPost(id, authToken);
      return {
        likeCount: serverLikeCount ?? post?.likeCount ?? 0,
        likedByMe: serverLiked ?? post?.likedByMe ?? false };
    } catch {
      return null;
    }
  }

  static async deletePost(
    id:        string,
    authToken: string,
  ): Promise<boolean> {
    try {
      const res = await fetchWithRetry(`${BASE}/community/posts/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${authToken}` } });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async updatePost(
    id:        string,
    payload:   Partial<Pick<NovelPostPayload, 'title' | 'content' | 'tags' | 'novelBody'>>,
    authToken: string,
  ): Promise<boolean> {
    try {
      // [BUG-18 FIX] novelBody(본문)가 있으면 novel_content로 직렬화해 전송
      // 기존: novelBody 타입에 없어서 본문 수정이 서버에 반영 안 됨
      const body: Record<string, unknown> = {};
      if (payload.title   !== undefined) body.title   = payload.title;
      if (payload.content !== undefined) body.content = payload.content;
      if (payload.tags    !== undefined) body.tags    = payload.tags;
      if (payload.novelBody !== undefined) {
        body.novel_content = serializeNovelContent(payload.novelBody);
      }
      const res = await fetchWithRetry(`${BASE}/community/posts/${id}`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${authToken}` },
        body: JSON.stringify(body) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
