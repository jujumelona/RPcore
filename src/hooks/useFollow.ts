// src/hooks/useFollow.ts
// Bluesky social-app (MIT) ProfileFollowMutationQueue 패턴 이식
// 낙관적 업데이트 + race condition 방지 + 롤백

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../utils/authedFetch';
import { ToastService } from '../components/Toast';

interface FollowState {
  isFollowing: boolean;
  followerCount: number;
}

interface UseFollowOptions {
  authorId: string;
  initialFollowing?: boolean;
  initialFollowerCount?: number;
  /** TanStack Query keys to invalidate on commit */
  invalidateKeys?: string[][];
}

/**
 * Bluesky-style optimistic follow/unfollow with:
 * - Immediate UI update (optimistic)
 * - Server commit + rollback on failure
 * - Race-condition guard via pending ref
 * - TanStack Query cache invalidation
 */
export function useFollow({
  authorId,
  initialFollowing = false,
  initialFollowerCount = 0,
  invalidateKeys = [] }: UseFollowOptions) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FollowState>({
    isFollowing: initialFollowing,
    followerCount: initialFollowerCount });
  const pendingRef = useRef<AbortController | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const toggleFollow = useCallback(async () => {
    if (!authorId) return;

    // Cancel any in-flight request (Bluesky MutationQueue pattern)
    if (pendingRef.current) {
      pendingRef.current.abort();
    }

    // Optimistic update
    const previous = { ...state };
    const next: FollowState = {
      isFollowing: !state.isFollowing,
      followerCount: state.isFollowing
        ? Math.max(0, state.followerCount - 1)
        : state.followerCount + 1 };
    setState(next);
    setIsPending(true);

    const controller = new AbortController();
    pendingRef.current = controller;

    try {
      const method = previous.isFollowing ? 'DELETE' : 'POST';
      const resp = await authedFetch(`/authors/${authorId}/follow`, {
        method,
        signal: controller.signal });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json().catch(() => ({}));
      // Reconcile with server count if provided
      if (isMountedRef.current && typeof data.followerCount === 'number') {
        setState(s => ({ ...s, followerCount: data.followerCount }));
      }

      // Invalidate relevant queries (Bluesky pattern)
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return; // superseded request
      // Rollback
      if (isMountedRef.current) {
        setState(previous);
        ToastService.error('팔로우를 변경하지 못했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsPending(false);
        pendingRef.current = null;
      }
    }
  }, [authorId, state, invalidateKeys, queryClient]);

  return {
    isFollowing: state.isFollowing,
    followerCount: state.followerCount,
    isPending,
    toggleFollow };
}
