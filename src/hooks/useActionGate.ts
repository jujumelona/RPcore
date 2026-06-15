import { logger } from '../utils/logger';
import { useCallback, useReducer, useRef } from 'react';

type ActionTask = void | Promise<unknown>;
type ActionBlockReason = 'busy' | 'cooldown';

export interface ActionGateOptions {
  cooldownMs?: number;
}

export interface ActionGateResult {
  started: boolean;
  blocked: boolean;
  reason: ActionBlockReason | null;
}

export function useActionGate(defaultCooldownMs: number = 300) {
  const gateRef = useRef<Record<string, number>>({});
  const busyRef = useRef<Record<string, boolean>>({});
  const [, forceRerender] = useReducer((value: number) => value + 1, 0);

  const setBusy = useCallback((key: string, value: boolean) => {
    if ((busyRef.current[key] ?? false) === value) return;
    if (value) {
      busyRef.current[key] = true;
    } else {
      delete busyRef.current[key];
    }
    forceRerender();
  }, []);

  const run = useCallback((key: string, task: () => ActionTask, options?: ActionGateOptions): ActionGateResult => {
    const cooldownMs = options?.cooldownMs ?? defaultCooldownMs;
    const now = Date.now();
    const last = gateRef.current[key] ?? 0;
    if (busyRef.current[key]) {
      return { started: false, blocked: true, reason: 'busy' };
    }
    if (now - last < cooldownMs) {
      return { started: false, blocked: true, reason: 'cooldown' };
    }

    gateRef.current[key] = now;
    try {
      const result = task();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setBusy(key, true);
        Promise.resolve(result)
          .catch((err) => {
            // [BUG FIX] async task 실패 시 gateRef 타임스탬프 롤백
            // 기존: finally에서만 gateRef[key] = Date.now() 설정 →
            //       reject 후 cooldownMs(500ms) 동안 재시도 차단 (전송 실패 후 재전송 불가)
            // 수정: catch에서 last로 복원 → 즉시 재시도 허용 (동기 throw와 동일 동작)
            gateRef.current[key] = last;
            logger.warn('[useActionGate] action failed:', key, err);
          })
          .finally(() => {
            setBusy(key, false);
          });
      }
    } catch (err) {
      // [BUG-2 FIX] 동기 task throw 시 gateRef 타임스탬프 롤백
      // 기존: task() throw 후에도 gateRef[key] = now가 유지되어
      //       cooldownMs 동안 동일 액션 재시도가 차단됨 (전송 오류 후 재전송 불가)
      // 수정: 동기 실패 시 이전 타임스탬프(last)로 복원 → 즉시 재시도 허용
      gateRef.current[key] = last;
      logger.warn('[useActionGate] action failed:', key, err);
    }
    return { started: true, blocked: false, reason: null };
  }, [defaultCooldownMs, setBusy]);

  // isBusy는 busyRef(ref)를 동기적으로 읽으므로 항상 최신값 반환
  // 단, 외부 컴포넌트가 isBusy()로 렌더 조건을 판단할 때는
  // forceRerender로 인한 리렌더 사이클 이후에만 React가 최신값을 반영
  // → 동일 렌더 사이클 내에서 isBusy() 결과를 믿을 수 있음 (ref 읽기는 동기)
  const isBusy = useCallback((key?: string) => {
    if (key) return Boolean(busyRef.current[key]);
    return Object.keys(busyRef.current).length > 0;
  }, []);

  return { run, isBusy };
}
