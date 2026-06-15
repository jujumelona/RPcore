/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-empty */
// src/utils/mmkvZustandStorage.ts
// ══════════════════════════════════════════════════════════════
//  Zustand persist 미들웨어 전용 MMKV 어댑터
//
// ✅ [OPT] FlushRegistry: Set -> Map<symbol, FlushCallback>
//    기존: Set<FlushCallback>
//          registerFlushCallback()이 함수 참조를 그대로 Set에 저장.
//          unregister는 Set.delete(fn)이므로 참조가 달라지면 삭제 불가.
//          콜백이 람다(inline arrow)이면 매번 새 참조 -> delete 무동작 가능성.
//    수정: Map<symbol, FlushCallback>
//          각 등록 시 고유 symbol 키 발급 -> 참조와 무관하게 정확한 O(1) 삭제.
//          반환된 해제 함수가 symbol로 삭제하므로 100% 제거 보장.
//
// ✅ [FIX v3] Nitro/MMKV v4 대응 Lazy 초기화 (Static Import 제거)
// ✅ [FIX v2] New Architecture(Bridgeless) 대응 Lazy 초기화
// ✅ [FIX] FlushCallback async 지원 (Promise.allSettled)
// ✅ [FIX #6] AppState 리스너 명시적 해제 함수
// ══════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-unused-vars */

import { AppState, AppStateStatus } from 'react-native';
import type { StateStorage } from 'zustand/middleware';
import { getRuntimeInterferenceReasons, isRuntimeInterferenceSuspended } from './RuntimeInterferenceGuard';

// ✅ [FIX] static import 제거 -> lazy require 방식으로 변경
// react-native-mmkv v4(Nitro)는 static import 시점에 Nitro bridge 접근 -> runtime not ready 에러 발생.
// [BUG FIX] _createMMKV 실패 시 null 대신 false로 sentinel 저장
// 이전: 실패 시 null -> 다음 호출에서 !null=true -> require()를 매번 재시도
//   Metro bundler가 require를 캐시하므로 큰 비용은 아니지만, 로드 실패한 모듈은
//   항상 createMMKV가 없음이 확정된 상황에서 불필요한 property 조회가 반복됨.
//   더 심각한 경우: require() 자체가 throw하면 catch 후 null 재설정 -> 다음 호출에서 또 throw.
// 수정: false sentinel로 "조회했지만 없음"을 구분. 한 번 실패하면 재시도 없음.
let _createMMKV: ((opts: { id: string; encryptionKey?: string }) => any) | null | false = null;
function getCreateMMKV() {
  if (_createMMKV === null) {
    try {
      const mod = require('react-native-mmkv');
      _createMMKV = typeof mod?.createMMKV === 'function' ? mod.createMMKV : false;
    } catch {
      _createMMKV = false;
    }
  }
  return _createMMKV || null;
}

// ── [FIX] AsyncStorage fallback 추가 (앱 재시작 시 데이터 보존) ────────
let _asyncStorage: any = null;
function getAsyncStorage() {
  if (!_asyncStorage) {
    try {
      _asyncStorage = require('@react-native-async-storage/async-storage');
    } catch {
      _asyncStorage = null;
    }
  }
  return _asyncStorage;
}

type MMKVInstance = any;

// ── [FIX] MMKV native 모듈 없을 때 AsyncStorage fallback (앱 재시작 시 데이터 보존) ────────
function makeAsyncStorageFallback(id: string): MMKVInstance {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    // AsyncStorage도 없으면 메모리 fallback (최후의 수단)
    return makeMemoryFallback();
  }

  const store: Record<string, string | number | boolean> = {};
  const listeners: Array<(key: string) => void> = [];
  const storageKey = `mmkv_fallback_${id}`;

  // 앱 시작 시 AsyncStorage에서 데이터 로드
  let initialized = false;
  const init = async () => {
    if (initialized) return;
    try {
      const data = await asyncStorage.getItem(storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        Object.assign(store, parsed);
      }
    } catch {
      // Failed to parse stored data
    }
    initialized = true;
  };
  setTimeout(() => init(), 0);

  // AsyncStorage에 동기적으로 저장 (배치 처리)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const saveToAsyncStorage = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await asyncStorage.setItem(storageKey, JSON.stringify(store));
      } catch {
        // Failed to save to AsyncStorage
      }
    }, 100);
  };

  return {
    isMemoryFallback: true,
    isAsyncStorageFallback: true,
    set: (key: string, value: string | number | boolean) => {
      store[key] = value;
      listeners.forEach(fn => fn(key));
      saveToAsyncStorage();
    },
    getString:  (key: string) => (typeof store[key] === 'string'  ? (store[key] as string)  : undefined),
    getNumber:  (key: string) => (typeof store[key] === 'number'  ? (store[key] as number)  : undefined),
    getBoolean: (key: string) => (typeof store[key] === 'boolean' ? (store[key] as boolean) : undefined),
    getBuffer:  (_key: string) => undefined,
    delete:     (key: string) => { delete store[key]; saveToAsyncStorage(); },
    remove:     (key: string) => { delete store[key]; saveToAsyncStorage(); },
    getAllKeys:  () => Object.keys(store),
    clearAll:   () => { Object.keys(store).forEach(k => { delete store[k]; }); saveToAsyncStorage(); },
    contains:   (key: string) => key in store,
    recrypt:    (_key?: string) => {},
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.push(listener);
      return { remove: () => { const idx = listeners.indexOf(listener); if (idx >= 0) listeners.splice(idx, 1); } };
    } } as unknown as MMKVInstance;
}

// ── [FIX] 최후의 수단: 메모리 fallback (AsyncStorage도 없을 때) ────────
function makeMemoryFallback(): MMKVInstance {
  const store: Record<string, string | number | boolean> = {};
  const listeners: Array<(key: string) => void> = [];
  return {
    set: (key: string, value: string | number | boolean) => {
      store[key] = value;
      listeners.forEach(fn => fn(key));
    },
    getString:  (key: string) => (typeof store[key] === 'string'  ? (store[key] as string)  : undefined),
    getNumber:  (key: string) => (typeof store[key] === 'number'  ? (store[key] as number)  : undefined),
    getBoolean: (key: string) => (typeof store[key] === 'boolean' ? (store[key] as boolean) : undefined),
    getBuffer:  (_key: string) => undefined,
    delete:     (key: string) => { delete store[key]; },
    remove:     (key: string) => { delete store[key]; },
    getAllKeys:  () => Object.keys(store),
    clearAll:   () => { Object.keys(store).forEach(k => { delete store[k]; }); },
    contains:   (key: string) => key in store,
    recrypt:    (_key?: string) => {},
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.push(listener);
      return { remove: () => { const idx = listeners.indexOf(listener); if (idx >= 0) listeners.splice(idx, 1); } };
    } } as unknown as MMKVInstance;
}

function safeCreateMMKV(options: { id: string; encryptionKey?: string }): MMKVInstance {
  try {
    const createFn = getCreateMMKV();
    if (typeof createFn !== 'function') {
      console.warn(`[mmkvZustandStorage] createMMKV is not a function — native module not linked. Using AsyncStorage fallback for "${options.id}".`);
      return makeAsyncStorageFallback(options.id);
    }
    return createFn(options);
  } catch (e) {
    console.warn(`[mmkvZustandStorage] createMMKV failed for "${options.id}", using AsyncStorage fallback:`, e);
    return makeAsyncStorageFallback(options.id);
  }
}

// ── Lazy 기본 공용 인스턴스 ───────────────────────────────────
let _defaultMMKVInstance: MMKVInstance | null = null;
// [BUG FIX] _forceFallback 데드 변수 제거
// 어디서도 true로 세팅하지 않으므로 if (_forceFallback) 분기는 항상 false → dead code.
const _fallbackMMKV = makeAsyncStorageFallback('rpcore-zustand-persist');
// [BUG FIX] _defaultHadSuccess 추적
// MMKV 인스턴스가 한 번이라도 정상 동작한 이후 실패하면 영구 fallback으로 전환.
// 이전: 실패 시 _defaultMMKVInstance=null 리셋 → 다음 호출에서 MMKV 재시도
//   → MMKV 재시도 성공 시 이전에 _fallbackMMKV에 기록된 데이터는 사라짐 (쓰기/읽기 불일치)
// 수정: 한 번 성공 후 실패 = 실제 장애로 간주 → 영구 fallback으로 고정해 데이터 일관성 보장.
//   bridge 미준비(앱 초기화 중) 단계에서는 _defaultHadSuccess=false이므로 재시도 허용.
let _defaultHadSuccess = false;
let _defaultPermanentFallback = false;

function _getDefaultMMKV(): MMKVInstance {
  if (!_defaultMMKVInstance) {
    _defaultMMKVInstance = safeCreateMMKV({ id: 'rpcore-zustand-persist' });
  }
  return _defaultMMKVInstance;
}

function _getSafeDefaultMMKV(): MMKVInstance {
  // [BUG FIX] 영구 fallback 모드면 즉시 반환
  if (_defaultPermanentFallback) return _fallbackMMKV;
  try {
    const inst = _getDefaultMMKV();
    _defaultHadSuccess = true;
    return inst;
  } catch (e) {
    console.warn('[mmkvZustandStorage] MMKV access failed, switching to AsyncStorage fallback:', e);
    if (_defaultHadSuccess) {
      // 한 번 성공 후 실패 → 실제 장애, 영구 fallback으로 고정 (데이터 일관성 우선)
      _defaultPermanentFallback = true;
      console.warn('[mmkvZustandStorage] MMKV had prior success but now failed — permanent fallback activated');
    } else {
      // 아직 성공한 적 없음 (bridge 미준비 가능성) → 리셋 후 재시도 허용
      _defaultMMKVInstance = null;
    }
    return _fallbackMMKV;
  }
}

function _safeCall<T>(fn: (inst: MMKVInstance) => T, fallbackValue: T): T {
  const inst = _getSafeDefaultMMKV();
  try {
    return fn(inst);
  } catch (e) {
    if (__DEV__) console.warn('[mmkvZustandStorage] MMKV call failed, using fallback for this call:', e);
    try {
      return fn(_fallbackMMKV);
    } catch {
      // Fallback also failed
    }
    return fallbackValue;
  }
}

// ── AppState 백그라운드 flush ─────────────────────────────────
type FlushCallback = () => void | Promise<void>;

const _flushRegistry = new Map<symbol, FlushCallback>();

export function registerFlushCallback(fn: FlushCallback): () => void {
  const key = Symbol();
  _flushRegistry.set(key, fn);
  return () => _flushRegistry.delete(key);
}

// ── AppState 리스너 ───────────────────────────────────────────
let _appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let _listenerStopped = false;

function _ensureAppStateListener() {
  if (_appStateSub || _listenerStopped) return;
  _appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'background' || next === 'inactive') {
      if (_flushRegistry.size === 0) return;
      if (isRuntimeInterferenceSuspended()) {
        console.log(
          `[mmkvZustandStorage] AppState=${next}, flush skipped by runtime guard: ${getRuntimeInterferenceReasons().join(', ')}`,
        );
        return;
      }
      if (__DEV__) console.log(`[mmkvZustandStorage] AppState->${next}, flush ${_flushRegistry.size}개 콜백 실행`);

      const promises: Promise<void>[] = [];
      for (const fn of _flushRegistry.values()) {
        try {
          const result = fn();
          if (result instanceof Promise) {
            promises.push(
              result.catch(e =>
                console.warn('[mmkvZustandStorage] async flush 콜백 오류 (무시):', e),
              ),
            );
          }
        } catch (e) {
          console.warn('[mmkvZustandStorage] flush 콜백 오류 (무시):', e);
        }
      }
      if (promises.length > 0) {
        Promise.allSettled(promises).catch(() => {});
      }
    }
  });
}

// [BUG-9 FIX] _ensureAppStateListener()를 모듈 로드 시점에 즉시 호출하면
// New Architecture(Bridgeless) 환경에서 bridge 미준비 상태에서 AppState.addEventListener 호출 가능.
// setTimeout(0)으로 첫 번째 JS 이벤트 루프 tick 이후로 지연.
setTimeout(() => _ensureAppStateListener(), 0);

export function stopAppStateListener(): void {
  _listenerStopped = true;
  _appStateSub?.remove();
  _appStateSub = null;
}

/**
 * [NEW] 앱 초기화 시 리스너 재활성화
 */
export function startAppStateListener(): void {
  _listenerStopped = false;
  _ensureAppStateListener();
}

/**
 * Zustand persist StateStorage 어댑터 (기본 인스턴스)
 * ✅ Lazy: 첫 getItem/setItem/removeItem 호출 시 MMKV 인스턴스 생성
 */
export const mmkvZustandStorage: StateStorage = {
  getItem: (name: string): string | null => {
    return _safeCall((inst) => inst.getString(name) ?? null, null);
  },
  setItem: (name: string, value: string): void => {
    _safeCall((inst) => {
      inst.set(name, value);
      return undefined;
    }, undefined);
  },
  removeItem: (name: string): void => {
    _safeCall((inst) => {
      // MMKV v4에서는 delete 메서드명이 delete임 (Storage.ts와 맞춤)
      if (typeof inst.delete === 'function') {
        inst.delete(name);
      } else {
        inst.remove(name);
      }
      return undefined;
    }, undefined);
  } };

// ── 커스텀 인스턴스 팩토리 ────────────────────────────────────

interface MMKVStorageOptions {
  id: string;
  encryptionKey?: string;
}

/**
 * 별도 MMKV 파티션을 사용하는 StateStorage 생성
 * ✅ Lazy: 반환된 StateStorage 메서드 첫 호출 시 MMKV 인스턴스 생성
 */
export function createMMKVStorage(opts: MMKVStorageOptions): StateStorage & { clearAll?: () => void } {
  let instance: MMKVInstance | null = null;
  // [BUG FIX] MMKV 실패 시 데이터 일관성 보장
  // 기존: MMKV 실패 → instance=null 리셋 → in-memory fallback에 write
  //   → 다음 getItem 시 instance=null이므로 MMKV 재시도 → in-memory fallback 데이터 못 읽음
  //   → 쓴 값을 다음 읽기에서 못 찾는 불일치 발생
  // 수정: 한 번 MMKV가 실패하면 해당 인스턴스는 AsyncStorage fallback으로 고정
  //   instance를 AsyncStorage fallback으로 교체해 이후 모든 읽기/쓰기가 동일 인스턴스를 사용
  let useFallback = false;
  const fallback = makeAsyncStorageFallback(opts.id);

  function getInstance(): MMKVInstance {
    if (useFallback) return fallback;
    if (!instance) {
      instance = safeCreateMMKV({
        id: opts.id,
        encryptionKey: opts.encryptionKey });
    }
    return instance;
  }

  const safeCall = <T>(fn: (inst: MMKVInstance) => T, fallbackValue: T): T => {
    const inst = getInstance();
    try {
      return fn(inst);
    } catch (e) {
      console.warn('[mmkvZustandStorage] MMKV call failed, switching to AsyncStorage fallback permanently:', e);
      // [BUG FIX] instance=null 대신 useFallback=true로 고정
      // → 이후 모든 읽기/쓰기가 동일 fallback 인스턴스를 사용해 데이터 일관성 보장
      useFallback = true;
      instance = null;
      try {
        return fn(fallback);
      } catch {
        // Fallback also failed
      }
      return fallbackValue;
    }
  };

  return {
    getItem: (name: string): string | null => {
      return safeCall((inst) => inst.getString(name) ?? null, null);
    },
    setItem: (name: string, value: string): void => {
      safeCall((inst) => {
        inst.set(name, value);
        return undefined;
      }, undefined);
    },
    removeItem: (name: string): void => {
      safeCall((inst) => {
        if (typeof inst.delete === 'function') {
          inst.delete(name);
        } else {
          inst.remove(name);
        }
        return undefined;
      }, undefined);
    },
    clearAll: (): void => {
      safeCall((inst) => {
        if (typeof inst.clearAll === 'function') {
          inst.clearAll();
        }
        return undefined;
      }, undefined);
    } };
}

// ── 유틸 ─────────────────────────────────────────────────────

export function clearPersistedStore(name: string): void {
  _safeCall((inst) => {
    if (typeof inst.delete === 'function') {
      inst.delete(name);
    } else {
      inst.remove(name);
    }
    return undefined;
  }, undefined);
}

export function clearAllPersistedStores(): void {
  _safeCall((inst) => {
    inst.clearAll();
    return undefined;
  }, undefined);
}
