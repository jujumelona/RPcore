// src/hooks/useRetryQueue.ts
// 리트라이 큐 상태를 구독하는 React 훅
// Bluesky persisted-fetch 패턴

import { useEffect, useState, useCallback } from 'react';
import { retryQueue, type RetryQueueState, type QueuedAction } from '../utils/RetryQueue';

export function useRetryQueue() {
  const [state, setState] = useState<RetryQueueState>(retryQueue.getState());

  useEffect(() => {
    return retryQueue.addListener(setState);
  }, []);

  const enqueue = useCallback(
    (action: Omit<QueuedAction, 'id' | 'retryCount' | 'createdAt' | 'maxRetries'>) => {
      retryQueue.enqueue(action);
    },
    [],
  );

  const clearDeadLetter = useCallback(() => {
    retryQueue.clearDeadLetter();
  }, []);

  const retry = useCallback(() => {
    retryQueue.flush();
  }, []);

  return {
    pendingCount: state.pending.length,
    deadLetterCount: state.deadLetter.length,
    pending: state.pending,
    deadLetter: state.deadLetter,
    enqueue,
    clearDeadLetter,
    retry };
}
