import type { WNCharacter, WNEmotionData, WNParagraph } from '../utils/webNovelStorage';

export type CommunityBoardType = 'free' | 'webnovel';

export interface CommunityTag {
  id: string;
  slug: string;
  label: string;
}

export interface CommunityDiscussion {
  id: string;
  boardType: CommunityBoardType;
  lang: string;
  tags: CommunityTag[];
}

export interface CommunityFeedPost extends CommunityDiscussion {
  title: string;
  content: string;
  author: string;
  authorId: string;
  avatarUrl?: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  novelId?: string;
  likedByMe?: boolean;
}

export interface CommunityPostDetailModel extends Omit<CommunityFeedPost, 'createdAt'> {
  createdAt: number;
  novelPreview: string;
  likedByMe: boolean;
  novelBody: WNParagraph[];
  emotionData: WNEmotionData;
  characters: WNCharacter[];
}

export interface CommunityModerationFilter {
  blockedAuthorIds?: string[];
  blockedTags?: string[];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

export function normalizeCommunityBoardType(value: unknown): CommunityBoardType {
  return value === 'free' ? 'free' : 'webnovel';
}

export function normalizeCommunityTagLabel(tag: unknown): string {
  return asString(tag).trim().replace(/^#+/, '');
}

export function normalizeCommunityTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const next = normalizeCommunityTagLabel(tag);
    if (!next) continue;
    const slug = next.toLowerCase();
    if (seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(next);
  }

  return normalized;
}

export function createCommunityTags(tags: unknown): CommunityTag[] {
  return normalizeCommunityTags(tags).map((label) => ({
    id: label.toLowerCase(),
    slug: label.toLowerCase(),
    label,
  }));
}

export function normalizeCommunityFeedPost(raw: unknown): CommunityFeedPost | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  if (!id) {
    return null;
  }

  const boardType = normalizeCommunityBoardType(record.board_type ?? record.boardType);
  const tags = createCommunityTags(record.tags);

  return {
    id,
    title: asString(record.title),
    content: asString(record.content),
    author: asString(record.author ?? record.authorName),
    authorId: asString(record.author_id ?? record.authorId),
    avatarUrl: asString(record.avatar_url ?? record.avatarUrl) || undefined,
    likeCount: asNumber(record.like_count ?? record.likeCount),
    commentCount: asNumber(record.comment_count ?? record.commentCount),
    viewCount: asNumber(record.view_count ?? record.viewCount),
    createdAt: asString(record.created_at ?? record.createdAt),
    tags,
    boardType,
    lang: asString(record.lang, 'en'),
    novelId: asString(record.novel_id ?? record.novelId) || undefined,
    likedByMe: Boolean(record.liked_by_me ?? record.likedByMe ?? record.is_liked ?? record.liked),
  };
}

export function normalizeCommunityPostDetail(raw: unknown): CommunityPostDetailModel | null {
  const feed = normalizeCommunityFeedPost(raw);
  if (!feed || !raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;

  return {
    ...feed,
    createdAt: asTimestamp(record.created_at ?? record.createdAt),
    novelPreview: asString(record.novelPreview ?? record.novel_preview ?? feed.content),
    likedByMe: Boolean(record.likedByMe ?? record.liked_by_me ?? record.liked),
    novelBody: Array.isArray(record.novelBody) ? (record.novelBody as WNParagraph[]) : [],
    emotionData: record.emotionData && typeof record.emotionData === 'object'
      ? (record.emotionData as WNEmotionData)
      : {},
    characters: Array.isArray(record.characters) ? (record.characters as WNCharacter[]) : [],
  };
}

export function isCommunityPostBlocked(
  post: Pick<CommunityFeedPost, 'authorId' | 'tags'>,
  moderation: CommunityModerationFilter,
): boolean {
  const blockedAuthorIds = new Set((moderation.blockedAuthorIds ?? []).map(String));
  const blockedTags = new Set((moderation.blockedTags ?? []).map(tag => normalizeCommunityTagLabel(tag).toLowerCase()));

  if (post.authorId && blockedAuthorIds.has(post.authorId)) {
    return true;
  }

  for (const tag of post.tags) {
    if (blockedTags.has(tag.slug)) {
      return true;
    }
  }

  return false;
}

export function filterCommunityFeedPosts(
  posts: CommunityFeedPost[],
  moderation: CommunityModerationFilter,
): CommunityFeedPost[] {
  if ((moderation.blockedAuthorIds?.length ?? 0) === 0 && (moderation.blockedTags?.length ?? 0) === 0) {
    return posts;
  }

  return posts.filter(post => !isCommunityPostBlocked(post, moderation));
}
