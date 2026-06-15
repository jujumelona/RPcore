﻿// src/utils/communityNovelStore.ts
// ══════════════════════════════════════════════════════════════
// 웹소설 커뮤니티 게시글 로컬 저장소 (MMKV)
// ── 구조 ──────────────────────────────────────────────────────
// CommunityNovelPost: 게시글 메타데이터 (novelId 포함)
// novelId는 webNovelStorage의 StoredWebNovel.id와 연결됨
// ══════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid/non-secure';
import { mmkv } from './storage';

export interface CommunityNovelPost {
  id: string;
  novelId: string;        // webNovelStorage key → WebNovelReaderScreen으로 전달
  title: string;          // 게시글 제목
  content: string;        // 소개글 / 작가의 말
  novelPreview: string;   // 웹소설 첫 단락 미리보기 (자동 생성)
  authorName: string;
  authorId: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: number;
  tags: string[];
  boardType?: 'free' | 'webnovel';
  lang?: string;
}

const LIST_KEY    = 'community_novel:list';
const ITEM_PREFIX = 'community_novel:item:';
const MAX_POSTS   = 200;

// ── 전체 목록 조회 ──────────────────────────────────────────
export function getCommunityNovelPosts(): CommunityNovelPost[] {
  try {
    const raw = mmkv.getString(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const ids: string[] = Array.isArray(parsed) ? parsed : [];
    const posts: CommunityNovelPost[] = [];
    for (const id of ids) {
      const itemRaw = mmkv.getString(ITEM_PREFIX + id);
      if (itemRaw) posts.push(JSON.parse(itemRaw));
    }
    return posts.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

// ── 단건 조회 ───────────────────────────────────────────────
export function getCommunityNovelPost(id: string): CommunityNovelPost | null {
  try {
    const raw = mmkv.getString(ITEM_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── 게시 ────────────────────────────────────────────────────
export function saveCommunityNovelPost(
  post: Omit<CommunityNovelPost, 'id' | 'createdAt' | 'likeCount' | 'commentCount' | 'likedByMe'>,
): CommunityNovelPost {
  const newPost: CommunityNovelPost = {
    ...post,
    id:           `cnp_${nanoid()}`,
    createdAt:    Date.now(),
    likeCount:    0,
    commentCount: 0,
    likedByMe:    false };

  mmkv.set(ITEM_PREFIX + newPost.id, JSON.stringify(newPost));

  // ✅ JSON.parse try-catch: MMKV 값이 손상됐을 경우 목록 초기화로 안전 복구
  let ids: string[] = [];
  try {
    const raw = mmkv.getString(LIST_KEY);
    ids = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids)) ids = [];
  } catch {
    ids = [];
  }
  ids.unshift(newPost.id);
  if (ids.length > MAX_POSTS) ids.splice(MAX_POSTS);
  mmkv.set(LIST_KEY, JSON.stringify(ids));

  return newPost;
}

// ── 좋아요 토글 ─────────────────────────────────────────────
export function toggleLikeCommunityNovelPost(id: string): CommunityNovelPost | null {
  const post = getCommunityNovelPost(id);
  if (!post) return null;
  const updated: CommunityNovelPost = {
    ...post,
    likedByMe: !post.likedByMe,
    // [BUG FIX] likeCount 음수 방지 — 최소 0 보장
    likeCount: post.likedByMe ? Math.max(0, post.likeCount - 1) : post.likeCount + 1 };
  mmkv.set(ITEM_PREFIX + id, JSON.stringify(updated));
  return updated;
}
