﻿// src/hooks/useDoubleTap.ts
import { useCallback, useEffect, useRef } from 'react';

interface Options {
  delay?: number;
  onSingleTap?: () => void;
  onDoubleTap: () => void;
}

export function useDoubleTap({ delay = 280, onSingleTap, onDoubleTap }: Options) {
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < delay) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      lastTap.current = 0;
      onDoubleTap();
    } else {
      lastTap.current = now;
      if (onSingleTap) {
        timer.current = setTimeout(() => { onSingleTap(); timer.current = null; }, delay);
      }
    }
  }, [delay, onSingleTap, onDoubleTap]);

  // ✅ [FIX] 언마운트 시 대기 중인 싱글탭 타이머 정리
  // 컴포넌트 언마운트 직전에 타이머가 만료되면 onSingleTap()이 호출되어
  // 이미 unmounted된 컴포넌트 state setter를 건드려 경고 발생.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  return { handlePress };
}
