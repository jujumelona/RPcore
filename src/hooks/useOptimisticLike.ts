// src/hooks/useOptimisticLike.ts
// Bluesky social-app (MIT) 낙관적 좋아요 훅 이식

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../utils/authedFetch';
import { ToastService } from '../components/Toast';

interface LikeState {
  isLiked: boolean;
  likeCount: number;
}

interface UseOptimisticLikeOptions {
  postId: string;
  endpoint?: string; // default: /community/posts/:id/like
  initialLiked?: boolean;
  initialCount?: number;
  invalidateKeys?: string[][];
}

export function useOptimisticLike({
  postId,
  endpoint,
  initialLiked = false,
  initialCount = 0,
  invalidateKeys = [] }: UseOptimisticLikeOptions) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LikeState>({
    isLiked: initialLiked,
    likeCount: initialCount });
  const pendingRef = useRef<AbortController | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const toggleLike = useCallback(async () => {
    if (!postId) return;

    if (pendingRef.current) pendingRef.current.abort();

    // [BUG-14 FIX] 현재 state를 캡처해 연타 시 롤백 꼬임 방지
    const previous = state;
    const next: LikeState = {
      isLiked: !state.isLiked,
      likeCount: state.isLiked
        ? Math.max(0, state.likeCount - 1)
        : state.likeCount + 1 };
    setState(next);
    setIsPending(true);

    const controller = new AbortController();
    pendingRef.current = controller;

    try {
      const url = endpoint ?? `/community/posts/${postId}/like`;
      const resp = await authedFetch(url, { method: 'POST', signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json().catch(() => ({}));
      const serverCount = data.likeCount ?? data.like_count;
      if (isMountedRef.current && typeof serverCount === 'number') {
        setState(s => ({ ...s, likeCount: serverCount }));
      }

      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      // 롤백
      if (isMountedRef.current) {
        setState(previous);
        ToastService.error('좋아요를 변경하지 못했습니다.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsPending(false);
        pendingRef.current = null;
      }
    }
  }, [postId, endpoint, state, invalidateKeys, queryClient]);

  return {
    isLiked: state.isLiked,
    likeCount: state.likeCount,
    isPending,
    toggleLike };
}
