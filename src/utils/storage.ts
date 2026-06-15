/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/storage.ts
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// [최적화 v5] MMKV 스토리지 및 Lazy 초기화 (명시적 헬퍼)
//
// ✅ [FIX v5] MMKV 타입 import 제거
//    - react-native-mmkv v3.x에서 MMKV named export 없음
//    - ReturnType<typeof createMMKV> 로 타입 추론
//
// ✅ [FIX v4] Proxy 및 명시적 메서드 헬퍼
//    - Proxy 초기 성능 이슈 방지 및 "" is not a function 방지
//
// ✅ [FIX v2] authStorage 암호화
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-unused-vars */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { logger } from './logger';

// ✅ [FIX] static import 대신 lazy require
// react-native-mmkv v4(Nitro)는 static import 시점에 Nitro bridge 접근 시
// [runtime not ready] ReferenceError 발생. 실제 호출 시점까지 require 지연
// [BUG FIX] null sentinel → false sentinel (mmkvZustandStorage.ts와 동일 패턴)
// 이전: createMMKV 없을 때 _createMMKV=null → !null=true → 매번 require 재시도
//       require 자체가 throw하면 catch 후 null 재설정 → 다음 호출에서 또 throw 반복
// 수정: false를 "조회했지만 없음" sentinel로 사용 → 한 번 실패하면 재시도 없음
let _createMMKV: ((opts: { id: string; encryptionKey?: string }) => any) | null | false = null;
function getCreateMMKV() {
  if (_createMMKV === null) {
    try {
      const mod = require('react-native-mmkv');
      _createMMKV = typeof mod?.createMMKV === 'function' ? mod.createMMKV : false;
    } catch (_err) {
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
    } catch (_err) {
      _asyncStorage = null;
    }
  }
  return _asyncStorage;
}

const globalRef = globalThis as typeof globalThis & { __authEncKey?: string };

// react-native-mmkv v4 대응 (lazy require 방식)
type MMKVInstance = any;

// ── [FIX] MMKV native 모듈이 없을 때 AsyncStorage fallback (앱 재시작 시 데이터 보존) ────────
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
    } catch (_err) {
      // AsyncStorage 로드 실패 시 무시
    }
    initialized = true;
  };
  // 비동기 초기화 트리거 (지연 실행)
  setTimeout(() => init(), 0);

  // AsyncStorage에 동기적으로 저장 (배치 처리)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const saveToAsyncStorage = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await asyncStorage.setItem(storageKey, JSON.stringify(store));
      } catch (_err) {
        // AsyncStorage 저장 실패 시 무시
      }
    }, 100);
  };

  return {
    isMemoryFallback: true, // [BUG FIX #21] KVCacheManager에서 fallback 여부를 감지해 무한 purge 루프 방지
    isAsyncStorageFallback: true, // AsyncStorage fallback 표시
    set: (key: string, value: string | number | boolean) => {
      store[key] = value;
      listeners.forEach(fn => fn(key));
      saveToAsyncStorage();
    },
    getString: (key: string) => (typeof store[key] === 'string' ? (store[key] as string) : undefined),
    getNumber: (key: string) => (typeof store[key] === 'number' ? (store[key] as number) : undefined),
    getBoolean: (key: string) => (typeof store[key] === 'boolean' ? (store[key] as boolean) : undefined),
    getBuffer: () => undefined,
    delete: (key: string) => { delete store[key]; saveToAsyncStorage(); },
    remove: (key: string) => { delete store[key]; saveToAsyncStorage(); },
    getAllKeys: () => Object.keys(store),
    clearAll: () => { Object.keys(store).forEach(k => { delete store[k]; }); saveToAsyncStorage(); },
    contains: (key: string) => key in store,
    recrypt: () => { },
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.push(listener);
      return { remove: () => { const idx = listeners.indexOf(listener); if (idx >= 0) listeners.splice(idx, 1); } };
    } } as unknown as MMKVInstance;
}

function safeCreateMMKV(options: { id: string; encryptionKey?: string }): MMKVInstance {
  try {
    const createFn = getCreateMMKV();
    if (typeof createFn !== 'function') {
      if (__DEV__) console.log(`[storage] createMMKV is not a function — native module not linked. Using AsyncStorage fallback for "${options.id}".`);
      return makeAsyncStorageFallback(options.id);
    }

    const inst = createFn(options);
    return inst;
  } catch (err) {
    console.warn(`[storage] createMMKV failed for "${options.id}" (possibly Property 't' error), using AsyncStorage fallback:`, err);
    return makeAsyncStorageFallback(options.id);
  }
}

// ── [FIX] 최후의 수단: 메모리 fallback (AsyncStorage도 없을 때) ────────
function makeMemoryFallback(): MMKVInstance {
  const store: Record<string, string | number | boolean> = {};
  const listeners: Array<(key: string) => void> = [];
  return {
    isMemoryFallback: true,
    set: (key: string, value: string | number | boolean) => {
      store[key] = value;
      listeners.forEach(fn => fn(key));
    },
    getString: (key: string) => (typeof store[key] === 'string' ? (store[key] as string) : undefined),
    getNumber: (key: string) => (typeof store[key] === 'number' ? (store[key] as number) : undefined),
    getBoolean: (key: string) => (typeof store[key] === 'boolean' ? (store[key] as boolean) : undefined),
    getBuffer: () => undefined,
    delete: (key: string) => { delete store[key]; },
    remove: (key: string) => { delete store[key]; },
    getAllKeys: () => Object.keys(store),
    clearAll: () => { Object.keys(store).forEach(k => { delete store[k]; }); },
    contains: (key: string) => key in store,
    recrypt: () => { },
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.push(listener);
      return { remove: () => { const idx = listeners.indexOf(listener); if (idx >= 0) listeners.splice(idx, 1); } };
    } } as unknown as MMKVInstance;
}

// ── Lazy 인스턴스 캐시 ──────────────────────────────────────────────────
let _appStorageInstance: MMKVInstance | null = null;
let _aiStorageInstance: MMKVInstance | null = null;
let _authStorageInstance: MMKVInstance | null = null;

function getAppStorageInstance(): MMKVInstance {
  if (!_appStorageInstance) _appStorageInstance = safeCreateMMKV({ id: 'app-settings' });
  return _appStorageInstance;
}
function getAiStorageInstance(): MMKVInstance {
  if (!_aiStorageInstance) _aiStorageInstance = safeCreateMMKV({ id: 'ai-logic' });
  return _aiStorageInstance;
}
function getAuthStorageInstance(): MMKVInstance {
  if (!_authStorageInstance) {
    const encKey = globalRef.__authEncKey;
    _authStorageInstance = safeCreateMMKV(
      encKey ? { id: 'auth-data', encryptionKey: encKey } : { id: 'auth-data' }
    );
  }
  return _authStorageInstance;
}

// ── 명시적 헬퍼 및 Proxy ────────────────────────────────────────────────
export type LazyMMKV = {
  set(key: string, value: string | number | boolean): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  getBuffer(key: string): ArrayBuffer | undefined;
  remove(key: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
  contains(key: string): boolean;
  recrypt(encryptionKey?: string): void;
  addOnValueChangedListener(listener: (key: string) => void): { remove: () => void };
};

/**
 * [Advanced Fix] Proxy 기반의 이중 지연 초기화
 *  호출되는 순간에만 getInstance()를 실행하여 Nitro 브릿지 [runtime not ready] 원천 차단
 */
function makeLazyMMKV(getInstance: () => MMKVInstance): LazyMMKV {
  const fallback = makeMemoryFallback();
  let forceFallback = false;
  let failCount = 0;
  let instanceCache: MMKVInstance | null = null;

  const getSafeInstance = (): MMKVInstance => {
    if (forceFallback) return fallback;
    if (instanceCache) return instanceCache;

    try {
      const inst = getInstance();
      // [BUG FIX #20] 인스턴스 획득 후 property 접근 등 실제 API 호출로 터지는지 확인
      // Nitro bridge 초기화 전이면 여기서 에러가 던져짐
      inst.contains('__initialization_probe__');

      // [BUG-31 FIX] 인스턴스 획득 후 간단한 쓰기/읽기 테스트로 실제 동작 확인
      // Nitro bridge가 초기화 레이스로 첫 호출 실패 후 재시도 가능해야 함
      instanceCache = inst;
      failCount = 0; // 성공 시 카운트 리셋
      return inst;
    } catch (err) {
      //  여기서 Property 't' doesn't exist 에러가 잡힘
      if (__DEV__) console.log('[storage] Native Bridge not ready or Property "t" error, using memory fallback temporarily.', err);

      instanceCache = null;
      failCount++;
      // [BUG-10 FIX] 10회 이상 연속 실패 시 Nitro bridge 초기화 실패로 보고 영구 fallback 전환
      // 매 호출마다 native 접근 시도로 인한 오버헤드 방지
      if (failCount > 10) {
        logger.warn('[storage] Nitro bridge 10회 연속 실패 — 영구 인메모리 fallback 전환');
        forceFallback = true;
      }
      return fallback;
    }
  };

  return new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      const inst = getSafeInstance();
      const value = inst[prop];

      // 메서드인 경우 bind 처리하여 안전하게 반환
      if (typeof value === 'function') {
        // v4 delete/remove 호환성 처리
        if (prop === 'remove' && typeof inst.delete === 'function') return inst.delete.bind(inst);
        return value.bind(inst);
      }
      return value;
    }
  }) as LazyMMKV;
}

// ── 공개 인스턴스 ──────────────────────────────────────────────────────
export const appStorage = makeLazyMMKV(getAppStorageInstance);
export const aiStorage = makeLazyMMKV(getAiStorageInstance);
export const mmkv = appStorage;

// [BUG FIX] export let → 내부 ref + getter 패턴으로 변경
// export let이면 외부 모듈에서도 authStorage를 임의로 교체 가능 (ESM live binding)
// → 비암호화 스토리지에 민감 데이터 저장될 수 있음
// initAuthEncryption()에서 _authStorageRef를 교체하면 getAuthStorage()로 새 인스턴스 반환
let _authStorageRef: LazyMMKV = makeLazyMMKV(getAuthStorageInstance);

/** authStorage 현재 인스턴스 반환 (읽기 전용 접근용) */
export function getAuthStorage(): LazyMMKV { return _authStorageRef; }

/**
 * @deprecated 직접 접근 대신 getAuthStorage()를 사용하세요.
 * initAuthEncryption() 내부에서만 교체됩니다.
 */
export const authStorage: LazyMMKV = new Proxy({} as LazyMMKV, {
  get(_, p) {
    // [BUG-14 FIX] Symbol property 조회 시 receiver를 전달해야 this 바인딩 정확.
    // 이전: Reflect.get(_authStorageRef, p) — receiver 없음 → Symbol.toPrimitive 등 오동작 가능.
    if (typeof p === 'symbol') return Reflect.get(_authStorageRef, p, _authStorageRef);
    return (_authStorageRef as unknown as Record<string, unknown>)[p as string];
  } });

// ── 인증 암호화 초기화 ────────────────────────────────────────────────────
const AUTH_ENCRYPTION_KEY_STORAGE = 'mmkv_auth_enc_key';

/**
 * AppBootstrap에서 호출: SecureStore 및 MMKV 암호화키 주입
 */
export async function initAuthEncryption(): Promise<void> {
  try {
    let key = await SecureStore.getItemAsync(AUTH_ENCRYPTION_KEY_STORAGE);
    if (!key) {
      key = Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '');
      await SecureStore.setItemAsync(AUTH_ENCRYPTION_KEY_STORAGE, key);
    }
    globalRef.__authEncKey = key;
    // [BUG FIX #8] _authStorageInstance=null만으로는 부족 — makeLazyMMKV 클로저의
    // instanceCache가 미암호화 인스턴스를 여전히 가리킴
    // 수정: authStorage 자체를 새 makeLazyMMKV()로 교체 → 새 클로저는 instanceCache=null에서 시작
    _authStorageInstance = null;
    _authStorageRef = makeLazyMMKV(getAuthStorageInstance);
  } catch (err) {
    console.warn('[storage] authStorage 암호화 초기화 실패 (비암호화로 fallback):', err);
  }
}

// ── FastStorage (appStorage 헬퍼) ──────────────────────────────────────
export const FastStorage = {
  set: (key: string, value: unknown) => {
    if (value === null || value === undefined) {
      // [BUG FIX #6] null/undefined 전달 시 스킵 대신 remove() 호출
      // 이전: skip하여 HEAD 캐시 등이 구버전 상태로 잔류해 재시작 시 복원되는 버그.
      // 수정: null/undefined는 키 삭제로 처리하여 캐시 무효화 보장.
      appStorage.remove(key);
      return;
    }
    try {
      const val = typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean);
      appStorage.set(key, val);
    } catch (e) {
      if (__DEV__) console.warn(`[storage] FastStorage.set failed for key: ${key}`, e);
    }
  },
  getString: (key: string) => appStorage.getString(key),
  getNumber: (key: string) => appStorage.getNumber(key),
  getBoolean: (key: string) => appStorage.getBoolean(key),
  getObject: <T,>(key: string): T | null => {
    const raw = appStorage.getString(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  /**
   * [Zod Masters] 스토리지 데이터 검증 헬퍼
   * - 데이터 입구에서 스키마 검증을 거침으로써 런타임 크래시 방지
   */
  getValidatedObject: <T,>(key: string, schema: import('zod').ZodType<T>): T | null => {
    const raw = appStorage.getString(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      if (__DEV__) console.warn(`[storage] Zod validation failed for key: ${key}`, result.error.issues);
      return null;
    } catch {
      return null;
    }
  },
  remove: (key: string) => appStorage.remove(key),
  clearAll: () => appStorage.clearAll() };

// ── AsyncStorage 호환 어댑터 ──────────────────────────────────────────
export const storage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(appStorage.getString(key) ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    if (value === null || value === undefined) {
      appStorage.remove(key);
    } else {
      appStorage.set(key, value);
    }
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    appStorage.remove(key);
    return Promise.resolve();
  },
  multiRemove: (keys: string[]): Promise<void> => {
    keys.forEach(k => appStorage.remove(k));
    return Promise.resolve();
  },
  clear: (): Promise<void> => {
    appStorage.clearAll();
    return Promise.resolve();
  },
  getAllKeys: (): Promise<readonly string[]> =>
    Promise.resolve(appStorage.getAllKeys()) };


