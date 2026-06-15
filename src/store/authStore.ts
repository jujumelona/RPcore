/* eslint-disable @typescript-eslint/no-unused-vars */
// src/store/authStore.ts
  
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { create, type StoreApi } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { appStorage } from '../utils/storage';
import Constants from 'expo-constants';
import { GoogleSignin,
  isSuccessResponse,
  isCancelledResponse } from '@react-native-google-signin/google-signin';
import { logger } from '../utils/logger';
import { readAuthStorage, writeAuthStorage, removeAuthStorage } from '../utils/authSecureStorage';
import { SERVER_BASE } from '../config/ApiConfig';
import { sanitizeNullableImageUrl } from '../utils/imageUrlPolicy';

const BACKUP_WEB_CLIENT_ID = '806767847275-o5vduumma9uciog9gqrh166elq3qvniu.apps.googleusercontent.com';

const WEB_CLIENT_ID: string =
  (Constants.expoConfig?.extra?.GOOGLE_WEB_CLIENT_ID as string | undefined) ??
  process.env.GOOGLE_WEB_CLIENT_ID ??
  BACKUP_WEB_CLIENT_ID;

const SERVER_URL = SERVER_BASE; // ✅ ApiConfig.SERVER_BASE 중앙화 — 하드코딩 제거
const AUTH_STORAGE_KEY = 'auth_user_v1';
export const CURRENT_CONSENT_VERSION = '2026.03.01';
const DEBUG_BYPASS_AUTH =
  __DEV__ &&
  (process.env.EXPO_PUBLIC_DEBUG_BYPASS_AUTH === '1' ||
    (Constants.expoConfig?.extra?.DEBUG_BYPASS_AUTH as boolean | undefined) === true);

// [DEV] DEBUG_BYPASS_AUTH 상태 로깅
if (__DEV__) {
  console.log('[Auth] DEBUG_BYPASS_AUTH:', DEBUG_BYPASS_AUTH);
  console.log('[Auth] process.env.EXPO_PUBLIC_DEBUG_BYPASS_AUTH:', process.env.EXPO_PUBLIC_DEBUG_BYPASS_AUTH);
  console.log('[Auth] Constants.expoConfig?.extra?.DEBUG_BYPASS_AUTH:', Constants.expoConfig?.extra?.DEBUG_BYPASS_AUTH);
}
// ✅ [BUG FIX] DEBUG_JWT 하드코딩 제거 — 번들 디컴파일 시 우회 토큰 구조 노출 방지
// 기존: 실제 JWT 문자열이 번들에 포함되어 디컴파일 시 토큰 형식 역공학 가능
// 수정: 환경변수에서 가져오되 없으면 플레이스홀더 사용 (DEV 전용이므로 보안 영향 최소)
const DEBUG_JWT =
  (process.env.EXPO_PUBLIC_DEBUG_JWT as string | undefined) ??
  'debug.token.placeholder';

// [BUG FIX #28] Zustand store 객체(_isSigningOut 속성)는 HMR 시 교체될 수 있으므로, 항상 유지되는 모듈 레벨 변수로 관리
let _isSigningOutModule = false;
let _refreshPromiseModule: Promise<AuthUser | null> | null = null;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  photo: string | null;
  consentVersion: string;
  consentDate: string;
  jwtToken: string;
  refreshToken?: string;
  role?: 'admin' | 'user';
  avatarUri?: string;
  token?: string;
}

interface ConsentPayload {
  version: string;
  consentDate: string;
  ageVerified: boolean;
  birthYear: number | null;
  consentItems: string[];
  lang: string;
  region: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
  logout?: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
  getStoredUser: () => Promise<AuthUser | null>;
  saveConsentToServer: (payload: ConsentPayload) => Promise<void>;
  tryRefreshToken: () => Promise<AuthUser | null>;
}

function normalizeStoredAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<AuthUser> & { token?: string };
  const resolvedJwt = String(candidate.jwtToken ?? candidate.token ?? '').trim();
  const resolvedRefresh = typeof candidate.refreshToken === 'string'
    ? candidate.refreshToken.trim()
    : '';
  if (!resolvedJwt || !candidate.id || !candidate.email || !candidate.name) return null;

  return {
    id: String(candidate.id),
    email: String(candidate.email),
    name: String(candidate.name),
    photo: sanitizeNullableImageUrl(candidate.photo ?? null),
    consentVersion: String(candidate.consentVersion ?? CURRENT_CONSENT_VERSION),
    consentDate: String(candidate.consentDate ?? new Date().toISOString()),
    jwtToken: resolvedJwt,
    token: resolvedJwt,
    refreshToken: resolvedRefresh || undefined,
    role: candidate.role,
    avatarUri: candidate.avatarUri,
  };
}

export async function getFreshAuthUser(): Promise<AuthUser | null> {
  const inMemory = useAuthStore.getState().user;
  const normalizedMemory = normalizeStoredAuthUser(inMemory);
  if (normalizedMemory?.jwtToken) {
    // [DEBUG] 메모리에서 읽은 토큰 로깅
    console.log('[getFreshAuthUser] From memory:', {
      userId: normalizedMemory.id,
      tokenPreview: normalizedMemory.jwtToken.substring(0, 20) + '...',
      isPlaceholder: normalizedMemory.jwtToken === 'debug.token.placeholder'
    });
    
    if (inMemory !== normalizedMemory) {
      useAuthStore.setState({ user: normalizedMemory });
    }
    return normalizedMemory;
  }

  try {
    const stored = await readAuthStorage(AUTH_STORAGE_KEY);
    if (!stored) return null;
    const normalizedStored = normalizeStoredAuthUser(JSON.parse(stored));
    if (!normalizedStored) return null;
    
    // [DEBUG] 저장소에서 읽은 토큰 로깅
    console.log('[getFreshAuthUser] From storage:', {
      userId: normalizedStored.id,
      tokenPreview: normalizedStored.jwtToken.substring(0, 20) + '...',
      isPlaceholder: normalizedStored.jwtToken === 'debug.token.placeholder'
    });
    
    useAuthStore.setState({ user: normalizedStored, isInitialized: true });
    return normalizedStored;
  } catch {
    return null;
  }
}

export async function getFreshAuthToken(): Promise<string> {
  const freshUser = await getFreshAuthUser();
  return freshUser?.jwtToken ?? freshUser?.token ?? '';
}

function makeDebugUser(): AuthUser {
  return {
    id: 'debug-local-user',
    email: 'debug@local.test',
    name: 'Debug User',
    photo: null,
    consentVersion: CURRENT_CONSENT_VERSION,
    consentDate: new Date().toISOString(),
    jwtToken: DEBUG_JWT,
    token: DEBUG_JWT,
    role: 'admin' };
}

export function isJwtExpired(token: string): boolean {
  // [BUG FIX A-E] DEV 환경에서 DEBUG_JWT 플레이스홀더 토큰이 항상 만료로 판단되어 로그인 루프 발생
  // 'debug.token.placeholder'는 유효한 JWT 형식이 아니므로 parts.length < 3 → return true
  // DEBUG_BYPASS_AUTH가 활성화된 경우 이 토큰을 만료로 처리하면 안 됨
  if (__DEV__ && DEBUG_BYPASS_AUTH && token === DEBUG_JWT) return false;
  try {
    const parts = token.split('.');
    if (parts.length < 3) return true; // JWT 형식 아님 → 만료 처리
    // [BUG FIX] base64url → base64 변환 + Hermes-safe UTF-8 디코딩
    // 기존: atob().split('').map(c => '%' + charCodeAt().toString(16)) → decodeURIComponent
    //   문제: Hermes 엔진에서 멀티바이트 UTF-8 시퀀스가 잘못 인코딩되면
    //         decodeURIComponent가 URIError를 던져 catch → true(만료) 오판.
    // 수정: atob() 결과를 Uint8Array로 변환 후 TextDecoder('utf-8')로 안전하게 디코딩.
    //       TextDecoder는 Hermes(RN 0.71+)에서 기본 지원.
    const rawB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = rawB64 + '='.repeat((4 - rawB64.length % 4) % 4);
    const binary = atob(padded);
    const bytesArr = new Uint8Array(binary.length); // ✅ [FIX] 변수명 충돌 방지
    for (let i = 0; i < binary.length; i++) {
      bytesArr[i] = binary.charCodeAt(i);
    }
    // [BUG FIX] escape(str)+decodeURIComponent는 U+0100 이상 문자(이모지, 한자 등)를
    // %uXXXX로 인코딩하는데 decodeURIComponent가 처리 못해 URIError → catch → 만료 오판.
    // 수정: TextDecoder(Hermes/RN 0.71+에서 기본 지원)를 우선 사용.
    const decodeUTF8 = (bytes: Uint8Array): string => {
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(bytes);
      }
      let result = '';
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
      }
      return decodeURIComponent(escape(result));
    };
    const payload = JSON.parse(decodeUTF8(bytesArr));
    // [BUG FIX A-E] exp 없는 구버전 토큰: false(유효) 대신 true(만료)로 처리
    // exp 없는 토큰을 무기한 유효로 허용하면 탈퇴 계정도 토큰이 영원히 유효해지는 보안 취약점
    // 30일 서버 만료 정책과 일치: exp 없으면 만료로 간주해 재로그인 유도
    if (!payload.exp) return true;
    return payload.exp < Date.now() / 1000;
  } catch {
    // ✅ [BUG FIX] 디코딩 실패 시 보안 우선으로 만료 처리
    // 기존: 구조가 정상이면 만료 아님으로 처리 → 손상된 토큰으로 인증 상태 지속 가능
    // 수정: 디코딩 실패는 토큰 이상 신호 → 만료로 처리해 재로그인 유도
    // 단, 완전히 빈 문자열이나 undefined는 caller에서 이미 걸러지므로 여기선 항상 true
    return true;
  }
}

export const useAuthStore = create<AuthState>()(immer((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    try {
      if (DEBUG_BYPASS_AUTH) {
        const user = makeDebugUser();
        set({ user, isInitialized: true, isLoading: false, error: null });
        await writeAuthStorage(AUTH_STORAGE_KEY, JSON.stringify(user));
        logger.log('[Auth] Debug bypass auth enabled.');
        return;
      }

      GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        offlineAccess: false });

      const stored = await readAuthStorage(AUTH_STORAGE_KEY);
      if (stored) {
        const { AuthUserSchema } = await import('../types/schemas');
        let user: AuthUser | null = null;
        try {
          const parsed = JSON.parse(stored);
          const result = AuthUserSchema.safeParse(parsed);
          if (result.success) {
            user = result.data as AuthUser;
          } else {
            if (__DEV__) console.warn('[authStore] stored user validation failed:', result.error);
            await removeAuthStorage(AUTH_STORAGE_KEY);
          }
        } catch {
          await removeAuthStorage(AUTH_STORAGE_KEY);
        }
        if (!user) {
          set({ user: null, isInitialized: true });
        } else if (isJwtExpired(user.jwtToken)) {
          await removeAuthStorage(AUTH_STORAGE_KEY);
          try { await GoogleSignin.signOut(); } catch { }
          set({ user: null, isInitialized: true });
        } else {
          set({
            user: {
              ...user,
              jwtToken: user.jwtToken ?? user.token ?? '',
              token: user.jwtToken ?? user.token ?? '',
              photo: sanitizeNullableImageUrl(user.photo),
            },
            isInitialized: true,
          });
        }
      } else {
        set({ isInitialized: true });
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  signIn: async () => {
    set({ isLoading: true, error: null });
    try {
      if (DEBUG_BYPASS_AUTH) {
        const user = makeDebugUser();
        await writeAuthStorage(AUTH_STORAGE_KEY, JSON.stringify(user));
        set({ user, isLoading: false, isInitialized: true, error: null });
        logger.log('[Auth] signIn bypassed in debug mode.');
        return user;
      }

      // 기존 로그인 세션 완전히 제거
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        console.log('[Auth] signOut before signIn:', e);
      }

      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (isCancelledResponse(response)) {
        set({ isLoading: false });
        return null;
      }
      if (!isSuccessResponse(response)) {
        // ✅ [FIX] 앱 터짐 방지 - 에러 대신 null 반환
        console.warn('[authStore] Google 로그인 실패');
        set({ isLoading: false });
        return null;
      }

      const { idToken, user: googleUser } = response.data;
      if (!idToken) {
        // ✅ [FIX] 앱 터짐 방지 - 에러 대신 null 반환
        console.warn('[authStore] idToken 없음');
        set({ isLoading: false });
        return null;
      }

      const serverRes = await fetch(`${SERVER_URL}/login/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }) });
      if (!serverRes.ok) {
        // ✅ [FIX] 앱 터짐 방지 - 에러 대신 null 반환
        console.warn('[authStore] 서버 인증 실패:', serverRes.status);
        set({ isLoading: false });
        return null;
      }

      const { token, refreshToken: serverRefreshToken, user: serverUser } = await serverRes.json();

      // [DEV] 서버 응답 로깅
      if (__DEV__) {
        console.log('[Auth] Server response:', { 
          hasToken: !!token, 
          hasRefreshToken: !!serverRefreshToken,
          serverUser: serverUser ? {
            id: serverUser.id,
            email: serverUser.email,
            nickname: serverUser.nickname,
            role: serverUser.role
          } : null
        });
      }

      // [BUG-43 FIX] refreshToken 누락 대응.
      // 서버가 refreshToken을 반환하지 않으면 undefined가 저장되고,
      // JWT 만료 시 tryRefreshToken()이 signOut()을 호출해 사용자가 자동 로그아웃됨.
      // 경고 로그를 남기고, 기존 저장된 refreshToken이 있으면 재사용 시도.
      let finalRefreshToken = serverRefreshToken ?? undefined;
      if (!finalRefreshToken) {
        logger.warn('[Auth] 서버 응답에 refreshToken 없음 — JWT 만료 시 자동 로그아웃될 수 있음');
        // 기존 저장된 사용자의 refreshToken 재사용 시도
        try {
          const storedRaw = await readAuthStorage(AUTH_STORAGE_KEY);
          if (storedRaw) {
            const storedUser = JSON.parse(storedRaw) as AuthUser;
            if (storedUser?.refreshToken) {
              finalRefreshToken = storedUser.refreshToken;
              logger.log('[Auth] 기존 저장된 refreshToken 재사용');
            }
          }
        } catch { /* 파싱 실패 무시 */ }
      }

      const user: AuthUser = {
        id: serverUser?.id ?? googleUser.id,
        email: googleUser.email,
        // ✅ [BUG FIX] 서버 nickname 우선 사용 — 사용자가 앱에서 변경한 닉네임 반영
        // 기존: 항상 googleUser.name → 서버 저장 닉네임 무시
        name: serverUser?.nickname?.trim() || '{u}',
        // ✅ [BUG FIX] 서버 avatarUrl 우선 사용 — 앱에서 변경한 아바타 반영
        photo: sanitizeNullableImageUrl(serverUser?.avatarUrl ?? null),
        // ✅ [BUG FIX] 서버 consentVersion 우선 사용 (없으면 현재 앱 버전)
        // 기존: 항상 CURRENT_CONSENT_VERSION → 서버 저장값 무시
        consentVersion: serverUser?.consentVersion ?? CURRENT_CONSENT_VERSION,
        // ✅ [BUG FIX] consentDate 항상 new Date()로 덮어쓰던 버그 수정
        // 기존: 로그인할 때마다 현재 시각으로 갱신 → 서버 저장값 무시
        // 수정: 서버가 반환한 consentDate 우선 사용 (없으면 현재 시각 fallback)
        consentDate: serverUser?.consentDate ?? new Date().toISOString(),
        jwtToken: token,
        token,
        refreshToken: finalRefreshToken,
        role: serverUser?.role ?? 'user' };

      await writeAuthStorage(AUTH_STORAGE_KEY, JSON.stringify(user));
      set({ user, isLoading: false });
      return user;
    } catch (e: unknown) {
      logger.error('[Auth] 로그인 오류:', e);
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  signOut: async () => {
    // [BUG FIX A-6/A-11] 동시 401 응답 시 signOut 중복 호출 방지
    if (_isSigningOutModule) return;
    _isSigningOutModule = true;
    set({ isLoading: true });
    try {
      try { await GoogleSignin.signOut(); } catch { }
      await removeAuthStorage(AUTH_STORAGE_KEY);
      appStorage.remove('onboarding_complete_v3');
      appStorage.remove('user_profile');
      appStorage.remove('@notifications_list');
      appStorage.remove('@announcements_list');
      appStorage.remove('@recent_story');
      try {
        const chatStoreModule = require('./chatStore');
        const _cs = chatStoreModule?.useChatStore;
        if (_cs && typeof _cs.getState === 'function') {
          const sessionIds = Object.keys(_cs.getState().sessions ?? {});
          await Promise.allSettled(
            sessionIds.map((sid: string) => _cs.getState().clearSession(sid))
          );
        }
      } catch (e) {
        logger.warn('[Auth Store] signOut clearSession error:', e);
      }
    } catch (e) {
      logger.warn('[Auth Store] signOut error:', e);
    } finally {
      _isSigningOutModule = false;
      set({ user: null, isLoading: false });
    }
  },

  logout: async () => {
    await get().signOut();
  },

    deleteAccount: async () => {
    const user = get().user;
    if (!user?.jwtToken) return { success: false, error: '로그인 필요' };
    set({ isLoading: true });
    try {
      // [BUG-14 FIX] res.ok 체크 추가 — 서버 삭제 실패 시 로컬 데이터를 지우지 않음
      const res = await fetch(`${SERVER_URL}/user/delete`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.jwtToken}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        set({ isLoading: false });
        return { success: false, error: body.error ?? `서버 오류 (${res.status})` };
      }
      // clearAll() 금지 — 언어/모델/채팅 데이터 삭제 방지
      // [BUG FIX] deleteAccount 후 signOut 호출로 모든 세션/캐시 정리
      await get().signOut();
      return { success: true };
    } catch (e: unknown) {
      set({ isLoading: false });
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  clearError: () => set({ error: null }),

  getStoredUser: async () => {
    try {
      const val = await readAuthStorage(AUTH_STORAGE_KEY);
      if (!val) return null;
      const parsed = JSON.parse(val);
      return parsed ? { ...parsed, photo: sanitizeNullableImageUrl(parsed.photo) } : null;
    } catch {
      return null;
    }
  },

  saveConsentToServer: async (payload: ConsentPayload) => {
    try {
      const user = get().user;
      if (!user?.jwtToken) return;
      await fetch(`${SERVER_URL}/user/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.jwtToken}` },
        body: JSON.stringify(payload) });
    } catch (e) {
      logger.warn('[Auth] 동의 서버 저장 실패:', e);
    }
  },

  tryRefreshToken: async (): Promise<AuthUser | null> => {
    // [BUG FIX A-12] 동시 401 응답 시 tryRefreshToken 중복 호출 방지
    if (_refreshPromiseModule) return _refreshPromiseModule;
    
    _refreshPromiseModule = (async () => {
      // ✅ [BUG FIX #2] early return 시 _refreshPromise 미초기화 수정
      try {
        const user = (await getFreshAuthUser()) ?? get().user;
        if (!user?.refreshToken) {
          get().signOut().catch(() => {});
          return null;
        }
        const res = await fetch(`${SERVER_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: user.refreshToken }) });
        if (!res.ok) {
          get().signOut().catch(() => {});
          return null;
        }
        const { token, user: serverUser } = await res.json();
        const refreshedUser: AuthUser = {
          ...user,
          jwtToken: token,
          token,
          ...(serverUser?.nickname !== undefined && { name: serverUser.nickname }),
          ...(serverUser?.avatarUrl !== undefined && { photo: sanitizeNullableImageUrl(serverUser.avatarUrl) }) };
        await writeAuthStorage(AUTH_STORAGE_KEY, JSON.stringify(refreshedUser));
        set({ user: refreshedUser });
        return refreshedUser;
      } catch {
        return null;
      } finally {
        _refreshPromiseModule = null;
      }
    })();
    return _refreshPromiseModule;
  } })));

export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // [TEST MODE] DEBUG_BYPASS_AUTH 활성화 시 서버에서 테스트 토큰 자동 발급
  let token = '';
  if (__DEV__ && DEBUG_BYPASS_AUTH) {
    // 테스트 모드: 서버에 토큰 요청
    try {
      const testTokenRes = await fetch(`${SERVER_URL}/test/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@rpplatform.app' })
      });
      if (testTokenRes.ok) {
        const { token: testToken } = await testTokenRes.json();
        token = testToken;
      }
    } catch (e) {
      console.warn('[authedFetch] 테스트 토큰 발급 실패:', e);
    }
  }
  
  // 일반 모드: 저장된 사용자 토큰 사용
  if (!token) {
    const user = await getFreshAuthUser();
    token = user?.jwtToken ?? user?.token ?? '';
  }
  
  // [DEBUG] Log token status for debugging "내 스토리" empty issue
  if (path.includes('/story-meta/mine')) {
    console.log('[authedFetch] /story-meta/mine request:', {
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'none',
      isTestMode: __DEV__ && DEBUG_BYPASS_AUTH
    });
  }

  // ✅ [BUG FIX] 토큰 없어도 요청 보내기 (서버가 401 반환하면 그때 처리)
  // 스토리 다운로드, KV 등 일부 API는 토큰 없이도 동작해야 함

  // ✅ [BUG FIX] 토큰 없어도 요청 보내기 (서버가 401 반환하면 그때 처리)
  // 스토리 다운로드, KV 등 일부 API는 토큰 없이도 동작해야 함

  if (token && isJwtExpired(token)) {
    // ✅ [NEW] 토큰 만료 시 자동 갱신 시도 — 성공 시 재요청
    const refreshedUser = await useAuthStore.getState().tryRefreshToken();
    if (!refreshedUser) {
      useAuthStore.getState().signOut().catch(() => { });
      return new Response(JSON.stringify({ error: 'Token expired and refresh failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' } });
    }
    // 갱신 성공: 새로운 토큰으로 재요청
    const newToken = refreshedUser.jwtToken;
    const newHeaders = new Headers(init.headers);
    newHeaders.set('Authorization', `Bearer ${newToken}`);
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
    if (!newHeaders.has('Content-Type') && init.body && !isFormData) {
      newHeaders.set('Content-Type', 'application/json');
    }
    let resolvedPath = path;
    if (!path.startsWith('http') && !path.startsWith('/')) {
      resolvedPath = '/' + path;
    }
    const finalUrl = resolvedPath.startsWith('http') ? resolvedPath : `${SERVER_URL}${resolvedPath}`;
    const timeoutMs = (init as RequestInit & { _timeoutMs?: number })._timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(finalUrl, {
        ...init,
        headers: newHeaders,
        signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const headers = new Headers(init.headers);
  // ✅ 토큰이 있을 때만 Authorization 헤더 추가
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // [BUG FIX] FormData body일 때 Content-Type 강제 설정 금지
  // FormData는 브라우저/RN이 multipart/form-data; boundary=... 를 자동 설정해야 함
  // json이 강제로 설정되면 서버가 multipart 파싱 실패 → 이미지 업로드 항상 실패
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  // ✅ [BUG FIX NM-3] 상대 경로 leading slash 보장 — 'api/...' → '/api/...'
  // SERVER_BASE에 trailing slash 없음. path에 leading slash 없으면 URL이 깨짐.
  let resolvedPath = path;
  if (!path.startsWith('http') && !path.startsWith('/')) {
    resolvedPath = '/' + path;
  }
  const finalUrl = resolvedPath.startsWith('http') ? resolvedPath : `${SERVER_URL}${resolvedPath}`;

  // [BUG FIX #14] timeout AbortController와 caller signal 충돌 수정
  // 기존: signal uses init.signal or controller.signal -> caller signal 우선이면
  //       10초 timer가 abort해도 실제로는 caller signal을 사용해 타임아웃 무효화
  // 수정: caller signal과 timeout signal을 AbortController.signal.follow 패턴으로 통합
  // ✅ [BUG FIX] 10초 하드코딩 타임아웃 → 호출자가 timeoutMs 지정 가능하도록 변경
  // 기존: 모든 요청에 10초 고정 → 대용량 파일 업로드/다운로드 요청이 항상 AbortError
  // 수정: init._timeoutMs로 커스텀 타임아웃 지정 가능, 기본값 30초로 상향
  const timeoutMs = (init as RequestInit & { _timeoutMs?: number })._timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // caller가 signal을 넘기면 그것도 구독 — 둘 중 하나라도 abort되면 취소
  const callerSignal = init.signal;
  let callerAbortHandler: (() => void) | null = null;
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      callerAbortHandler = () => controller.abort();
      callerSignal.addEventListener('abort', callerAbortHandler);
    }
  }
  try {
    const response = await fetch(finalUrl, {
      ...init,
      headers,
      signal: controller.signal });

    // [BUG FIX] 서버 401(Unauthorized) 응답 시 토큰 갱신 시도
    // 기존: isJwtExpired로 사전 체크만 수행 → 서버측에서 토큰이 만료/무효화된 경우(401) 무시됨
    // 수정: 401 응답 시 tryRefreshToken()을 호출하고 성공하면 1회 재시도
    if (response.status === 401) {
      // [BUG FIX] tryRefreshToken 대기 중 AbortController 타이머 소진 방지
      clearTimeout(timer);
      const refreshedUser = await useAuthStore.getState().tryRefreshToken();
      if (refreshedUser) {
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set('Authorization', `Bearer ${refreshedUser.jwtToken}`);
        if (!retryHeaders.has('Content-Type') && init.body && !isFormData) {
          retryHeaders.set('Content-Type', 'application/json');
        }
        // 재시도 시 새로운 타이머 설정
        const retryController = new AbortController();
        const retryTimer = setTimeout(() => retryController.abort(), timeoutMs);
        try {
          return await fetch(finalUrl, {
            ...init,
            headers: retryHeaders,
            signal: retryController.signal });
        } finally {
          clearTimeout(retryTimer);
        }
      } else {
        // 갱신 실패 시 로그아웃 처리
        useAuthStore.getState().signOut().catch(() => { });
      }
    }

    return response;
  } finally {
    clearTimeout(timer);
    if (callerSignal && callerAbortHandler) {
      callerSignal.removeEventListener('abort', callerAbortHandler);
    }
  }
}
