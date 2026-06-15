﻿/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Story } from '../types/navigation';

export type RankableStory = Story & {
  createdAt?: string | number;
  updatedAt?: string | number;
  publishedAt?: string | number;
};

export type RecommendProfile = {
  likedStoryIds: string[];
  followedAuthorIds: string[];
  playedGenreCounts: Record<string, number>;
  blockedStoryIds: string[];
  blockedAuthorIds?: string[];
  blockedHashtags?: string[];
  reportedStoryIds?: string[];
  preferredGenres?: string[];
};

export type RecommendWeights = {
  followAuthor: number;
  likedAuthor: number;
  genreAffinity: number;
  preferredGenre: number;
  tagAffinity: number;
  tagAffinityCap: number;
  likePopularity: number;
  viewPopularity: number;
  recencyBoost: number;
  recencyHalfLifeDays: number;
  likedPenalty: number;
  noise: number;
  diversifyAuthor: number;
  diversifyGenre: number;
  diversifyTag: number;
};

export const DEFAULT_RECOMMEND_WEIGHTS: RecommendWeights = {
  followAuthor: 32,
  likedAuthor: 20,
  genreAffinity: 24,
  preferredGenre: 12,
  tagAffinity: 7,
  tagAffinityCap: 3,
  likePopularity: 1.2,
  viewPopularity: 0.9,
  recencyBoost: 12,
  recencyHalfLifeDays: 10,
  likedPenalty: 14,
  noise: 0.8,
  diversifyAuthor: 7,
  diversifyGenre: 3.5,
  diversifyTag: 1.0 };

export type RankOptions = {
  weights?: RecommendWeights;
  seed?: number;
  skipFilter?: boolean;
};

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function normalizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    const n = normalizeTag(String(t ?? ''));
    if (n) out.push(n);
  }
  return out;
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function getStoryTimestamp(story: RankableStory): number | null {
  return toTimestamp(story.createdAt ?? story.publishedAt ?? story.updatedAt);
}

function hashToUnit(input: string, salt: number): number {
  // [BUG FIX] XOR 수동 구현 float overflow → 네이티브 비트 연산 사용
  // FNV-1a 32-bit: Math.imul로 안전한 32비트 정수 곱셈 보장
  // eslint-disable-next-line no-bitwise
  let h = (2166136261 + (salt & 0xFFFFFFFF)) >>> 0;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = (h ^ input.charCodeAt(i)) >>> 0;
    // eslint-disable-next-line no-bitwise
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

export function filterEligibleStories(
  stories: RankableStory[],
  profile: RecommendProfile
): RankableStory[] {
  if (stories.length === 0) return stories;
  const blockedSet = new Set([...(profile.blockedStoryIds ?? []), ...(profile.reportedStoryIds ?? [])]);
  const blockedAuthorSet = new Set(profile.blockedAuthorIds ?? []);
  const blockedTagSet = new Set((profile.blockedHashtags ?? []).map(normalizeTag));

  return stories.filter(s => {
    if (blockedSet.has(s.id)) return false;
    if (s.authorId && blockedAuthorSet.has(s.authorId)) return false;
    if (blockedTagSet.size > 0) {
      const tags = normalizeTags(s.tags);
      if (tags.some(t => blockedTagSet.has(t))) return false;
    }
    return true;
  });
}

function computeRecommendScores(
  stories: RankableStory[],
  profile: RecommendProfile,
  weights: RecommendWeights,
  seed?: number
): Map<string, number> {
  const likedSet     = new Set(profile.likedStoryIds ?? []);
  const followedSet  = new Set(profile.followedAuthorIds ?? []);
  const genreCounts  = profile.playedGenreCounts ?? {};
  const preferredGenres = profile.preferredGenres ?? [];

  const likedStories   = stories.filter(s => likedSet.has(s.id));
  const likedAuthorIds = new Set(likedStories.map(s => s.authorId).filter(Boolean));

  const tagFreq = new Map<string, number>();
  for (const s of likedStories) {
    for (const t of normalizeTags(s.tags)) {
      tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
    }
  }
  const maxTagFreq = Math.max(1, ...tagFreq.values());
  const maxGenreCount = Math.max(1, ...Object.values(genreCounts));
  const preferredRank = new Map(preferredGenres.map((g, i) => [g, i]));

  const now = Date.now();
  const daySalt = seed ?? Math.floor(now / 86_400_000);

  const scores = new Map<string, number>();
  for (const s of stories) {
    let score = 0;
    if (s.authorId && followedSet.has(s.authorId)) score += weights.followAuthor;
    if (s.authorId && likedAuthorIds.has(s.authorId)) score += weights.likedAuthor;

    const gCount = genreCounts[s.genre] ?? 0;
    if (gCount > 0) score += (gCount / maxGenreCount) * weights.genreAffinity;

    const prefIdx = preferredRank.get(s.genre);
    if (prefIdx != null && preferredGenres.length > 0) {
      const weight = 1 - (prefIdx / Math.max(1, preferredGenres.length));
      score += weights.preferredGenre * weight;
    }

    const tags = normalizeTags(s.tags);
    if (tags.length > 0 && tagFreq.size > 0) {
      let tagScore = 0;
      for (const t of tags) {
        const f = tagFreq.get(t);
        if (f) tagScore += f / maxTagFreq;
      }
      score += Math.min(tagScore, weights.tagAffinityCap) * weights.tagAffinity;
    }

    const likeCount = s.likeCount ?? 0;
    const viewCount = s.viewCount ?? s.playerCount ?? 0;
    score += Math.log2(likeCount + 1) * weights.likePopularity;
    score += Math.log2(viewCount + 1) * weights.viewPopularity;

    const ts = getStoryTimestamp(s);
    if (ts) {
      const days = Math.max(0, (now - ts) / 86_400_000);
      score += Math.exp(-days / weights.recencyHalfLifeDays) * weights.recencyBoost;
    }

    if (likedSet.has(s.id)) score -= weights.likedPenalty;

    score += hashToUnit(String(s.id), daySalt) * weights.noise;
    scores.set(s.id, score);
  }
  return scores;
}

function diversify(
  stories: RankableStory[],
  scores: Map<string, number>,
  weights: RecommendWeights
): RankableStory[] {
  if (stories.length <= 1) return stories;
  const remaining = stories.slice();
  const result: RankableStory[] = [];
  const authorCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const tagCache = new Map<string, string[]>();

  for (const s of remaining) {
    tagCache.set(s.id, normalizeTags(s.tags));
  }

  const scoreWithPenalty = (story: RankableStory): number => {
    const base = scores.get(story.id) ?? 0;
    let penalty = 0;
    if (story.authorId) penalty += (authorCounts.get(story.authorId) ?? 0) * weights.diversifyAuthor;
    if (story.genre) penalty += (genreCounts.get(story.genre) ?? 0) * weights.diversifyGenre;
    const tags = tagCache.get(story.id) ?? [];
    for (const t of tags) {
      const c = tagCounts.get(t);
      if (c) penalty += c * weights.diversifyTag;
    }
    return base - penalty;
  };

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const sScore = scoreWithPenalty(s);
      if (sScore > bestScore) {
        bestScore = sScore;
        bestIdx = i;
      }
    }

    const [picked] = remaining.splice(bestIdx, 1);
    result.push(picked);
    if (picked.authorId) authorCounts.set(picked.authorId, (authorCounts.get(picked.authorId) ?? 0) + 1);
    if (picked.genre) genreCounts.set(picked.genre, (genreCounts.get(picked.genre) ?? 0) + 1);
    const tags = tagCache.get(picked.id) ?? [];
    for (const t of tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  return result;
}

export function rankRecommendedStories(
  stories: RankableStory[],
  profile: RecommendProfile,
  options?: RankOptions
): RankableStory[] {
  const weights = options?.weights ?? DEFAULT_RECOMMEND_WEIGHTS;
  const eligible = options?.skipFilter ? stories : filterEligibleStories(stories, profile);
  if (eligible.length <= 1) return eligible;
  const scores = computeRecommendScores(eligible, profile, weights, options?.seed);
  return diversify(eligible, scores, weights);
}
