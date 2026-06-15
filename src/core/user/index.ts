// src/core/user/index.ts
// ════════════════════════════════════════════════════════════════
// 유저 도메인 핵심 유틸리티
//
// 역할:
//   - 유저 신원 확인 (isOwner, isSameUser)
//   - 유저 표시명 결정 (resolveDisplayName)
//   - 유저 권한 확인 (isAdmin)
//   - 유저 상태 파생 (hasConsented, isProfileComplete)
//
// 이 모듈은 스토어(authStore, userProfileStore)에 직접 의존하지 않음.
// 스토어에서 꺼낸 user 객체를 인수로 받아 순수 함수로 처리합니다.
// ════════════════════════════════════════════════════════════════

import type { AuthUser } from '../../store/authStore';

// ── 신원 비교 ─────────────────────────────────────────────────

/**
 * 두 유저 ID가 동일한지 확인합니다.
 * string / number / null / undefined 혼용을 안전하게 처리합니다.
 */
export function isSameUser(
  idA: string | number | null | undefined,
  idB: string | number | null | undefined,
): boolean {
  if (idA == null || idB == null) return false;
  return String(idA) === String(idB);
}

/**
 * 현재 로그인 유저가 특정 리소스(게시글·댓글 등)의 소유자인지 확인합니다.
 *
 * @param user    현재 로그인 유저 (authStore.user)
 * @param ownerId 리소스의 authorId / userId
 */
export function isOwner(
  user: AuthUser | null | undefined,
  ownerId: string | number | null | undefined,
): boolean {
  if (!user) return false;
  return isSameUser(user.id, ownerId);
}

// ── 권한 확인 ─────────────────────────────────────────────────

/**
 * 관리자 권한 여부를 반환합니다.
 */
export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin';
}

// ── 표시명 결정 ───────────────────────────────────────────────

/**
 * 유저 표시명을 반환합니다.
 * name -> email 앞부분 -> fallback 순으로 시도합니다.
 */
export function resolveDisplayName(
  user: AuthUser | null | undefined,
  fallback = 'User',
): string {
  if (!user) return fallback;
  if (user.name?.trim()) return user.name.trim();
  if (user.email) return user.email.split('@')[0];
  return fallback;
}

// ── 상태 파생 ─────────────────────────────────────────────────

/**
 * 개인정보 동의 완료 여부를 확인합니다.
 *
 * @param user              현재 유저
 * @param currentVersion    앱의 현재 동의 버전 (authStore.CURRENT_CONSENT_VERSION)
 */
export function hasConsented(
  user: AuthUser | null | undefined,
  currentVersion: string,
): boolean {
  if (!user) return false;
  return user.consentVersion === currentVersion;
}

/**
 * 프로필이 최소한 완성된 상태인지 확인합니다.
 * (이름 있고 이메일 있으면 완성으로 간주)
 */
export function isProfileComplete(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.name?.trim() && user.email?.trim());
}

/**
 * JWT 토큰이 유효하게 존재하는지 확인합니다.
 * 만료 여부는 authStore의 isJwtExpired 함수로 별도 확인하세요.
 */
export function hasValidToken(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.jwtToken?.trim());
}
