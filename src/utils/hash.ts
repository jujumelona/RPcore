﻿// src/utils/hash.ts
// ─────────────────────────────────────────────────────────────
// djb2 + FNV-1a 64비트 복합 해시 유틸리티
//
// SessionManager / PrefixKVManager 공통 사용.
// 동기 메서드 — async 불필요 (연산이 모두 동기).
//
// 알고리즘:
//   Pass 1: djb2  (seed 5381)        -> h1 (32-bit)
//   Pass 2: FNV-1a (seed 0x811c9dc5) -> h2 (32-bit)
//   결합:   `${h1_hex}${h2_hex}_${length}` (25자 고정)
//
// 충돌 확률 ≈ 1 / 2^64 (실용적 zero)
// ─────────────────────────────────────────────────────────────

export function hashString(str: string): string {
  // Pass 1: djb2
  let h1 = 5381;
  for (let i = 0; i < str.length; i++) {
    // eslint-disable-next-line no-bitwise
    h1 = ((h1 << 5) + h1) ^ str.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    h1 = h1 >>> 0;
  }
  // Pass 2: FNV-1a 32비트
  let h2 = 2166136261;
  for (let i = 0; i < str.length; i++) {
    // eslint-disable-next-line no-bitwise
    h2 ^= str.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}_${str.length}`;
}
