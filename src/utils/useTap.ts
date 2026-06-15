/**
 * useTap.ts
 * ─────────────────────────────────────────────────
 * 연타 방지 훅 — 동일 동작을 하나의 입력으로 처리
 *
 * 특징:
 *  - leading 실행 (첫 탭 즉시 반응 → 딜레이 없는 UX)
 *  - 쿨다운 중 추가 탭은 무시 (trailing 없음)
 *  - ref 기반 → re-render와 무관하게 항상 최신 핸들러 실행
 *  - 비동기 핸들러 자동 완료 대기 옵션 (awaitHandler)
 *
 * 사용법:
 *  const handlePress = useThrottledPress(() => doSomething(), 500);
 *  <PressableOpacity onPress={handlePress} />
 *
 *  // 비동기 + 완료 후 쿨다운 해제
 *  const handleSend = useThrottledPress(async () => { await send(); }, 0, true);
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * @param handler      실행할 함수 (동기 or 비동기)
 * @param cooldownMs   탭 후 무시할 시간 ms (기본 500ms)
 *                     0으로 설정하면 비동기 완료까지 잠금
 * @param awaitHandler true이면 handler가 완료될 때까지 추가 탭 차단
 */
export function useThrottledPress<T extends (...args: any[]) => any>(
  handler: T,
  cooldownMs = 500,
  awaitHandler = false,
): (..._args: Parameters<T>) => void {
  const lockedRef        = useRef(false);
  const handlerRef       = useRef(handler);
  // ✅ [FIX] cooldownTimerRef — 언마운트 후 lockedRef.current 참조 방지
  // 기존: setTimeout ID를 버려서 컴포넌트 언마운트 후에도 타이머 콜백이 실행됨.
  //       ref이라 크래시는 없지만 GC 되지 않은 클로저가 잔존.
  // 수정: cooldownTimerRef에 ID 보관, useEffect cleanup에서 즉시 취소.
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  handlerRef.current = handler; // 항상 최신 핸들러 참조

  // 언마운트 시 남아 있는 쿨다운 타이머 취소
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  return useCallback((..._args: Parameters<T>) => {
    if (lockedRef.current) return;
    lockedRef.current = true;

    const result = handlerRef.current(..._args);

    if (awaitHandler && result instanceof Promise) {
      // ✅ [FIX] 최대 대기 시간 상한 추가 (30초) — 영구 미완료 시 영구 잠금 방지
      const TIMEOUT_MS = 30_000;
      const timeoutPromise = new Promise<void>(r => setTimeout(r, TIMEOUT_MS));
      // 비동기 완료 후 잠금 해제 (cooldownMs가 0이어도 완료까지 대기)
      // ✅ [FIX] .catch(() => {}) 추가 — 핸들러 내부 에러가 unhandled rejection으로 크래시 유발 방지
      Promise.race([result, timeoutPromise]).catch(() => {}).finally(() => {
        if (cooldownMs > 0) {
          cooldownTimerRef.current = setTimeout(() => {
            lockedRef.current = false;
            cooldownTimerRef.current = null;
          }, cooldownMs);
        } else {
          lockedRef.current = false;
        }
      });
    } else {
      if (cooldownMs > 0) {
        cooldownTimerRef.current = setTimeout(() => {
          lockedRef.current = false;
          cooldownTimerRef.current = null;
        }, cooldownMs);
      } else {
        lockedRef.current = false;
      }
    }
  }, [lockedRef]);
}

/**
 * 네비게이션 전용 — 화면 전환 중 중복 push 방지
 * 기본 쿨다운 800ms (화면 전환 애니메이션 커버)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useNavThrottle<T extends (..._args: any[]) => any>(
  handler: T,
): () => void {
  return useThrottledPress(handler, 800);
}
