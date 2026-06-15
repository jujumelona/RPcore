// src/hooks/useOptimisticAction.ts
// ═══════════════════════════════════════════════════════════════════
// Bluesky 낙관적 UI 패턴 — 범용 제네릭 훅  
// (useOptimisticLike를 일반화하여 모든 뮤테이션에 적용)
//
// ✅ 즉각적 UI 반영 (서버 응답 대기 없음)
// ✅ 서버 확인 후 실제 값으로 동기화
// ✅ 실패 시 자동 롤백
// ✅ 중복 요청 방지 (AbortController)
// ✅ React Query 캐시 무효화
// ═══════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from './useTranslation';
import { useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../utils/authedFetch';
import { ToastService } from '../components/Toast';

// ── Types ──────────────────────────────────────────────────────────

export interface OptimisticActionConfig<TState> {
  /** 고유 식별자 (포스트 ID, 스토리 ID 등) */
  entityId: string;
  /** API 엔드포인트 */
  endpoint: string;
  /** HTTP 메서드 (기본 POST) */
  method?: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 초기 상태 */
  initialState: TState;
  /** 낙관적 상태 계산 — 현재 상태 → 서버 요청 전 즉시 적용할 상태 */
  optimisticUpdate: (current: TState) => TState;
  /** 서버 응답에서 확정 상태 추출 */
  resolveServerState?: (data: any, optimistic: TState) => TState;
  /** 실패 시 토스트 메시지 */
  errorMessage?: string;
  /** 성공 후 무효화할 React Query 키 */
  invalidateKeys?: string[][];
  /** 요청 본문 생성 */
  getBody?: (current: TState, next: TState) => Record<string, unknown> | undefined;
}

export interface OptimisticActionResult<TState> {
  state: TState;
  isPending: boolean;
  execute: () => Promise<void>;
  /** 상태를 외부에서 직접 업데이트 (서버 SSE 등) */
  forceUpdate: (newState: TState) => void;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useOptimisticAction<TState>(
  config: OptimisticActionConfig<TState>,
): OptimisticActionResult<TState> {
  const t = useTranslation();
  const {
    entityId,
    endpoint,
    method = 'POST',
    initialState,
    optimisticUpdate,
    resolveServerState,
    errorMessage,
    invalidateKeys = [],
    getBody } = config;
  const resolvedErrorMessage = errorMessage ?? t.optimistic_failed;

  const queryClient = useQueryClient();
  const [state, setState] = useState<TState>(initialState);
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef<AbortController | null>(null);

  const execute = useCallback(async () => {
    if (!entityId) return;

    // 이전 요청 취소
    if (pendingRef.current) {
      pendingRef.current.abort();
    }

    // 낙관적 업데이트
    const previousState = state;
    const nextState = optimisticUpdate(state);
    setState(nextState);
    setIsPending(true);

    const controller = new AbortController();
    pendingRef.current = controller;

    try {
      const body = getBody
        ? getBody(previousState, nextState)
        : undefined;

      const resp = await authedFetch(endpoint, {
        method,
        signal: controller.signal,
        ...(body ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body) } : {}) });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // 서버 응답으로 확정
      if (resolveServerState) {
        const data = await resp.json().catch(() => ({}));
        const confirmedState = resolveServerState(data, nextState);
        setState(confirmedState);
      }

      // React Query 캐시 무효화
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (err: unknown) {
      // AbortError는 무시 (사용자가 새 요청을 보낸 것)
      if ((err as Error)?.name === 'AbortError') return;

      // 롤백
      setState(previousState);
      ToastService.error(resolvedErrorMessage);
    } finally {
      setIsPending(false);
      pendingRef.current = null;
    }
  }, [
    entityId, endpoint, method, state,
    optimisticUpdate, resolveServerState,
    resolvedErrorMessage, invalidateKeys, getBody, queryClient,
  ]);

  const forceUpdate = useCallback((newState: TState) => {
    setState(newState);
  }, []);

  return { state, isPending, execute, forceUpdate };
}

// ── 프리셋 팩토리 ────────────────────────────────────────────────

/** 좋아요 토글 (Bluesky 원본과 동일 로직의 제네릭 버전) */
export function useOptimisticToggle(config: {
  entityId: string;
  endpoint: string;
  initialActive: boolean;
  initialCount: number;
  invalidateKeys?: string[][];
}) {
  const result = useOptimisticAction<{ active: boolean; count: number }>({
    entityId: config.entityId,
    endpoint: config.endpoint,
    initialState: { active: config.initialActive, count: config.initialCount },
    optimisticUpdate: (s) => ({
      active: !s.active,
      count: s.active ? Math.max(0, s.count - 1) : s.count + 1 }),
    resolveServerState: (data, optimistic) => ({
      active: optimistic.active,
      count: data.count ?? data.likeCount ?? data.bookmark_count ?? optimistic.count }),
    invalidateKeys: config.invalidateKeys,
    errorMessage: undefined, // uses i18n default
  });

  return {
    isActive: result.state.active,
    count: result.state.count,
    isPending: result.isPending,
    toggle: result.execute };
}

/** 북마크 토글 */
export function useOptimisticBookmark(postId: string, initial = false, initialCount = 0) {
  return useOptimisticToggle({
    entityId: postId,
    endpoint: `/community/posts/${postId}/bookmark`,
    initialActive: initial,
    initialCount: initialCount,
    invalidateKeys: [['bookmarks']] });
}

/** 팔로우/언팔로우 */
export function useOptimisticFollow(userId: string, initialFollowing = false) {
  const result = useOptimisticAction<{ following: boolean }>({
    entityId: userId,
    endpoint: `/users/${userId}/follow`,
    initialState: { following: initialFollowing },
    optimisticUpdate: (s) => ({ following: !s.following }),
    method: initialFollowing ? 'DELETE' : 'POST',
    invalidateKeys: [['followers', userId], ['following']],
    errorMessage: undefined, // uses i18n default
  });

  return {
    isFollowing: result.state.following,
    isPending: result.isPending,
    toggleFollow: result.execute };
}
