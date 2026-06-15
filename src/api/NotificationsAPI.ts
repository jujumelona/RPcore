import { z } from 'zod';
import { authedFetch } from '../utils/authedFetch';
import { SERVER_BASE } from '../config/ApiConfig';


// ── Zod 스키마 ──────────────────────────────────────────────────────────────
const UserNotificationSchema = z.object({
  id:         z.union([z.string(), z.number()]).transform(String),
  type:       z.string(),
  title:      z.string().optional(),
  body:       z.string().optional(),
  data:       z.record(z.unknown()).optional(),
  // ✅ [FIX] 서버가 camelCase(isRead)로 반환 — snake_case(is_read) 폴백 처리
  isRead:     z.union([
    z.boolean(),
    z.number().transform(n => n !== 0),
  ]).default(false).catch(false),
  createdAt:  z.string().optional(),
  link:       z.string().optional() });

const NotificationsListSchema = z.array(UserNotificationSchema);

const UnreadCountSchema = z.object({
  count: z.number().optional(),
  unreadCount: z.number().optional() }).transform(d => d.count ?? d.unreadCount ?? 0);

export type UserNotification = z.infer<typeof UserNotificationSchema>;

// ── API 함수 ─────────────────────────────────────────────────────────────────

// ✅ [FIX] authedFetch 사용 (인증 헤더 자동 주입) + SERVER_BASE 절대 경로 + lang 파라미터 + 페이지네이션
export async function getNotifications(lang = 'en', page = 1, limit = 50): Promise<UserNotification[]> {
  const res = await authedFetch(`${SERVER_BASE}/api/notifications?lang=${encodeURIComponent(lang)}&page=${page}&limit=${limit}`);
  if (!res.ok) {
    if (res.status === 401) return []; // 비로그인 상태는 빈 배열 반환
    throw new Error(`getNotifications failed: ${res.status}`);
  }
  const body = await res.json() as { notifications?: unknown[] } | unknown[];
  const list = Array.isArray(body) ? body : (body as Record<string, unknown>).notifications as unknown[] ?? [];
  const parsed = NotificationsListSchema.safeParse(list);
  if (!parsed.success) {
    if (__DEV__) console.warn('[NotificationsAPI] schema mismatch:', parsed.error.issues.slice(0,3));
    return [];
  }
  return parsed.data;
}

export async function getUnreadCount(): Promise<number> {
  const res = await authedFetch(`${SERVER_BASE}/api/notifications/unread-count`);
  if (!res.ok) return 0;
  const body = await res.json();
  const parsed = UnreadCountSchema.safeParse(body);
  if (!parsed.success) return 0;
  return parsed.data;
}

export async function markAsRead(id: string): Promise<void> {
  const res = await authedFetch(`${SERVER_BASE}/api/notifications/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ ids: [id] }) });
  if (!res.ok) throw new Error(`markAsRead failed: ${res.status}`);
}

export async function markAllAsRead(): Promise<void> {
  // [BUG FIX] ids:[] 대신 명시적 all:true 파라미터 사용
  // 빈 배열은 서버 구현에 따라 "아무것도 하지 않음"으로 해석될 수 있음
  const res = await authedFetch(`${SERVER_BASE}/api/notifications/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ all: true }) });
  if (!res.ok) throw new Error(`markAllAsRead failed: ${res.status}`);
}

export async function deleteNotification(id: string): Promise<void> {
  const res = await authedFetch(`${SERVER_BASE}/api/notifications/delete`, {
    method: 'POST',
    body: JSON.stringify({ ids: [id] }) });
  if (!res.ok) throw new Error(`deleteNotification failed: ${res.status}`);
}

export async function bulkDeleteNotifications(ids: string[]): Promise<void> {
  const res = await authedFetch(`${SERVER_BASE}/api/notifications/delete`, {
    method: 'POST',
    body: JSON.stringify({ ids }) });
  if (!res.ok) throw new Error(`bulkDeleteNotifications failed: ${res.status}`);
}

// ✅ [FIX] FCM 푸시 토큰 등록 + 사용자 언어 서버 반영
export async function registerPushToken(fcmToken: string, lang: string): Promise<void> {
  await authedFetch(`${SERVER_BASE}/user/push-token`, {
    method: 'POST',
    body: JSON.stringify({ fcmToken, lang }) }).catch(() => {}); // 실패해도 앱 동작 영향 없음
}
