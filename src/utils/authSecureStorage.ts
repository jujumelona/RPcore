﻿// src/utils/authSecureStorage.ts
// [최적화] asyncStorageMMKV -> appStorage 직접 동기 호출
import { appStorage } from './storage';
// [BUG FIX] dynamic require() -> static import (expo-secure-store는 package.json에 설치됨)
import * as SecureStore from 'expo-secure-store';

export async function readAuthStorage(key: string): Promise<string | null> {
  try {
    const val = await SecureStore.getItemAsync(key);
    if (val != null) return val;
  } catch (e) { if (__DEV__) console.warn(`[authSecureStorage] ignored error:`, e); }
  // fallback: MMKV (구버전 데이터 마이그레이션)
  const fallback = appStorage.getString(key) ?? null;
  if (fallback != null) {
    try {
      await SecureStore.setItemAsync(key, fallback);
      appStorage.remove(key);
    } catch (e) { if (__DEV__) console.warn(`[authSecureStorage] ignored error:`, e); }
  }
  return fallback;
}

export async function writeAuthStorage(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
  appStorage.remove(key);
}

export async function removeAuthStorage(key: string): Promise<void> {
  appStorage.remove(key);
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
