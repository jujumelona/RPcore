// src/storage/asyncStorageMMKV.ts
// ══════════════════════════════════════════════════════════════════
// @react-native-async-storage/async-storage -> MMKV 브리지
// ✅ [FIX] 모듈 최상단 import 제거 -> lazy require로 교체
//    기존: import { storage, appStorage } from '../utils/storage'
//          -> 모듈 로딩 시점에 MMKV(Nitro) 초기화 시도 -> [runtime not ready] 크래시
//    수정: 함수 호출 시점에 require() -> Nitro bridge 준비 후 안전하게 접근
// ══════════════════════════════════════════════════════════════════

function getStorage() {
  return require('../utils/storage').storage;
}

const AsyncStorage = {
  getItem:    (key: string): Promise<string | null> => getStorage().getItem(key).catch(() => null),
  setItem:    (key: string, value: string): Promise<void> => getStorage().setItem(key, value).catch(() => {}),
  removeItem: (key: string): Promise<void> => getStorage().removeItem(key).catch(() => {}),
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    try {
      return await Promise.all(keys.map(async k => [k, await getStorage().getItem(k)] as [string, string | null]));
    } catch (error) {
      console.error('[AsyncStorage] multiGet failed:', error);
      return keys.map(k => [k, null]);
    }
  },
  multiSet: async (pairs: [string, string][]): Promise<void> => {
    try {
      for (const [k, v] of pairs) await getStorage().setItem(k, v);
    } catch (error) {
      console.error('[AsyncStorage] multiSet failed:', error);
    }
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    try {
      for (const k of keys) await getStorage().removeItem(k);
    } catch (error) {
      console.error('[AsyncStorage] multiRemove failed:', error);
    }
  },
  clear: (): Promise<void> => getStorage().clear().catch(() => {}),
  getAllKeys: (): Promise<string[]> =>
    getStorage().getAllKeys().then((keys: readonly string[]) => keys as string[]).catch(() => []) };

export default AsyncStorage;
export { AsyncStorage };
