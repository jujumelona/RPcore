// src/hooks/useSafe.ts
// ─────────────────────────────────────────────────────────────────────────────
// 메모리 누수 방지 공통 훅 모음
//
// 배경:
//   React Native에서 반복되는 누수 패턴 3가지:
//   1. 비동기 완료 후 unmounted 컴포넌트에 setState 호출
//   2. setTimeout / setInterval cleanup 누락
//   3. Reanimated withRepeat(-1) 등 무한 애니메이션 cleanup 누락
//
// 이 파일의 훅들을 사용하면 위 3가지를 구조적으로 방지할 수 있습니다.
// 파일별로 cancelled 플래그, clearTimeout, cancelAnimation을 직접 쓸 필요가 없습니다.
//
// 사용 예시:
//   import { useSafeAsync, useSafeTimeout, useSafeAnimation } from '../hooks/useSafe';
//
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';
import { cancelAnimation, SharedValue } from 'react-native-reanimated';

// ─────────────────────────────────────────────────────────────────────────────
// 1. useSafeAsync
//    비동기 작업 실행 시 언마운트 후 setState를 자동으로 차단합니다.
//
//    기존 패턴 (누수):
//      useEffect(() => {
//        (async () => {
//          const data = await fetch(...);
//          setState(data); // ← 언마운트 후 실행될 수 있음
//        })();
//      }, []);
//
//    개선 패턴 (이 훅 사용):
//      useSafeAsync(async (isCancelled) => {
//        const data = await fetch(...);
//        if (isCancelled()) return;
//        setState(data);
//      }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function useSafeAsync(
  fn: (isCancelled: () => boolean) => Promise<void>,
  deps: React.DependencyList,
) {
  useEffect(() => {
    let cancelled = false;
    // ✅ [FIX] .catch() 추가 — 비동기 작업 중 발생하는 에러가 unhandled rejection으로 이어지는 것을 방지
    fn(() => cancelled).catch(error => {
      console.error('[useSafeAsync] Unhandled error:', error);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, deps);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. useSafeTimeout
//    setTimeout을 래핑합니다. 언마운트 시 자동으로 clearTimeout합니다.
//    반환된 set()을 호출할 때마다 이전 타이머는 자동으로 취소됩니다.
//
//    기존 패턴 (누수):
//      const timer = useRef(null);
//      timer.current = setTimeout(() => setState(x), 500);
//      // cleanup 없음
//
//    개선 패턴 (이 훅 사용):
//      const setTimer = useSafeTimeout();
//      setTimer(() => setState(x), 500);
// ─────────────────────────────────────────────────────────────────────────────
export function useSafeTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const set = useCallback((fn: () => void, delay: number) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fn();
    }, delay);
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { set, clear };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. useSafeInterval
//    setInterval을 래핑합니다. 언마운트 시 자동으로 clearInterval합니다.
//
//    개선 패턴 (이 훅 사용):
//      const { start, stop } = useSafeInterval();
//      start(() => doSomething(), 1000);
// ─────────────────────────────────────────────────────────────────────────────
export function useSafeInterval() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const start = useCallback((fn: () => void, delay: number) => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fn, delay);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { start, stop };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. useSafeAnimation
//    Reanimated SharedValue 애니메이션을 언마운트 시 자동으로 cancelAnimation합니다.
//    withRepeat(-1) 같은 무한 루프 애니메이션에 특히 중요합니다.
//
//    기존 패턴 (누수):
//      useEffect(() => {
//        opacity.value = withRepeat(withTiming(1), -1);
//        // cleanup 없음 -> 언마운트 후 worklet이 네이티브 스레드에 잔류
//      }, []);
//
//    개선 패턴 (이 훅 사용):
//      useSafeAnimation(opacity, translateY); // ← 이것만으로 cleanup 완료
//      useEffect(() => {
//        opacity.value = withRepeat(withTiming(1), -1);
//        translateY.value = withSpring(0);
//      }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function useSafeAnimation(...sharedValues: SharedValue<any>[]) {
  useEffect(() => {
    return () => {
      sharedValues.forEach(sv => cancelAnimation(sv));
    };
    // sharedValues는 렌더간 동일 참조 보장 (useSharedValue는 stable)
    // eslint-disable-next-line
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. useSafeSubscription
//    이벤트 리스너 / 구독을 언마운트 시 자동으로 해제합니다.
//    AppState, NetInfo, EventEmitter 등 모든 구독 패턴에 사용 가능합니다.
//
//    기존 패턴 (누수):
//      useEffect(() => {
//        const sub = AppState.addEventListener('change', handler);
//        // return 누락 -> 구독 해제 안 됨
//      }, []);
//
//    개선 패턴 (이 훅 사용):
//      useSafeSubscription(() => {
//        const sub = AppState.addEventListener('change', handler);
//        return () => sub.remove();
//      }, [handler]);
// ─────────────────────────────────────────────────────────────────────────────
export function useSafeSubscription(
  subscribe: () => (() => void),
  deps: React.DependencyList,
) {
  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
    // eslint-disable-next-line
  }, deps);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. useIsMounted
//    컴포넌트의 마운트 상태를 ref로 추적합니다.
//    useSafeAsync로 대체 불가능한 복잡한 비동기 흐름에서 사용합니다.
//
//    사용 예시:
//      const isMounted = useIsMounted();
//      const handler = async () => {
//        const data = await fetch(...);
//        if (!isMounted()) return;
//        setState(data);
//      };
// ─────────────────────────────────────────────────────────────────────────────
export function useIsMounted(): () => boolean {
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return useCallback(() => mountedRef.current, []);
}
