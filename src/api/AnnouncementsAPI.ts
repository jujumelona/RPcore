/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from 'zod';
import { SERVER_BASE } from '../config/ApiConfig';
import { authedFetch } from '../utils/authedFetch';

const BASE_URL = SERVER_BASE;

// ── Zod 스키마 ──────────────────────────────────────────────────────────────
// ✅ [FIX] 서버 응답 필드명과 일치: body(content 아님), isRead(is_read 폴백), createdAt(created_at 폴백)
const AnnouncementItemSchema = z.object({
  id:         z.union([z.string(), z.number()]).transform(String),
  title:      z.string().default(''),
  body:       z.string().default(''),
  isRead:     z.union([
    z.boolean(),
    z.number().transform(n => n !== 0),
    z.undefined().transform(() => false),
  ]).catch(false),
  createdAt:  z.string().optional(),
  isImportant: z.boolean().optional().default(false) }).passthrough();

const AnnouncementsListSchema = z.array(AnnouncementItemSchema);

const AdminAnnouncementItemSchema = AnnouncementItemSchema.extend({
  authorId:   z.string().optional(),
  updatedAt:  z.string().optional(),
  status:     z.enum(['draft', 'published', 'archived']).optional() });

export type Announcement      = z.infer<typeof AnnouncementItemSchema>;
export type AdminAnnouncement = z.infer<typeof AdminAnnouncementItemSchema>;

/** 언어 코드 -> { title, body } 다국어 번역 맵 */
export type AnnouncementTranslations = Record<string, { title: string; body: string }>;

// ── API 함수 ─────────────────────────────────────────────────────────────────

// ✅ [FIX] lang 파라미터 추가 (서버가 이 값으로 번역 선택)
// ✅ [BUG FIX] authedFetch 사용 — 인증 헤더 없으면 서버에서 userId=null -> isRead 항상 false
export async function getAnnouncements(lang = 'en'): Promise<Announcement[]> {
  const res = await authedFetch(`${BASE_URL}/api/announcements?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`getAnnouncements failed: ${res.status}`);
  const data = await res.json() as { announcements?: unknown[] } | unknown[];
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>).announcements as unknown[] ?? [];
  const parsed = AnnouncementsListSchema.safeParse(list);
  if (!parsed.success) {
    if (__DEV__) console.warn('[AnnouncementsAPI] getAnnouncements schema mismatch:', parsed.error.issues.slice(0, 3));
    return [];
  }
  return parsed.data;
}

export async function getAnnouncementById(id: string, lang = 'en'): Promise<Announcement> {
  // ✅ [BUG FIX] authedFetch — 인증 없으면 isRead 항상 false
  const res = await authedFetch(`${BASE_URL}/api/announcements/${id}?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`getAnnouncementById failed: ${res.status}`);
  const body = await res.json();
  const parsed = AnnouncementItemSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Invalid announcement data: ${parsed.error.message}`);
  }
  return parsed.data;
}

// ✅ [FIX] URL 수정: /api/admin/announcements → /api/announcements (서버 라우트에 맞춤)
export async function createAnnouncement(
  translations: AnnouncementTranslations,
   
   
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // ✅ [BUG FIX #6] authedFetch 사용 — 기존 fetchWithRetry는 토큰 갱신 없어
    // 관리자 작업 중 토큰 만료 시 401이 그대로 노출됨
    const res = await authedFetch(`${BASE_URL}/api/announcements`, {
      method: 'POST',
      body: JSON.stringify({ translations }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      return { success: false, error: (body as Record<string, unknown>).error as string ?? `Server error ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ✅ [FIX] URL 수정: /api/admin/announcements/:id → /api/announcements/:id
export async function updateAnnouncement(
   
  id: string,
   
  data: Partial<Pick<Announcement, 'title' | 'body'>>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _token: string,
): Promise<void> {
  // [BUG-2 FIX] undefined 필드 제거 후 전송 — 서버가 flat {title,body} 받을 때
  // 둘 다 있어야 translations.ko 재구성 가능. 한 쪽만 보낼 경우 나머지는 제외.
  const payload: Record<string, string> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.body  !== undefined) payload.body  = data.body;
  // ✅ [BUG FIX #6] authedFetch 사용 — 토큰 만료 시 자동 갱신
  const res = await authedFetch(`${BASE_URL}/api/announcements/${id}`, {
    method: 'PUT',
    body:   JSON.stringify(payload) });
   
  if (!res.ok) throw new Error(`updateAnnouncement failed: ${res.status}`);
}
 

// ✅ [FIX] URL 수정: /api/admin/announcements/:id → /api/announcements/:id
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteAnnouncement(id: string, _token: string): Promise<void> {
  // ✅ [BUG FIX #6] authedFetch 사용 — 토큰 만료 시 자동 갱신
  const res = await authedFetch(`${BASE_URL}/api/announcements/${id}`, {
    method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteAnnouncement failed: ${res.status}`);
}

// ✅ [FIX] 공지 읽음 처리 (서버 mark-read API 연동)
export async function markAnnouncementRead(id: string): Promise<void> {
  await authedFetch(`${BASE_URL}/api/announcements/mark-read`, {
    method: 'POST',
    // [BUG FIX] Content-Type 누락 — 서버가 JSON body 파싱 실패 시 silent fail
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id] }) }).catch(() => {}); // 실패해도 UI에 영향 없음
}

export async function getAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const res = await authedFetch(`${BASE_URL}/api/admin/announcements`);
  if (!res.ok) throw new Error(`getAdminAnnouncements failed: ${res.status}`);
  // ✅ [BUG FIX] 서버는 { announcements: [...], page, hasMore } 객체 반환
  // 기존: z.array(...).parse(await res.json()) -> 객체를 배열로 파싱 -> ZodError
  // 수정: .announcements 배열 추출 후 파싱
  const data = await res.json() as { announcements?: unknown[] } | unknown[];
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>).announcements as unknown[] ?? [];
  const parsed = z.array(AdminAnnouncementItemSchema).safeParse(list);
  if (!parsed.success) {
    if (__DEV__) console.warn('[AnnouncementsAPI] getAdminAnnouncements schema mismatch:', parsed.error.issues.slice(0, 3));
    return [];
  }
  return parsed.data;
}


// ✅ [BUG FIX #28] 전체 공지 읽음 처리 — 빈 ids 배열 = 서버에서 전체 active 공지 처리
// 서버 apiAnnounceMarkRead는 ids=[] 시 SELECT all → batch INSERT (D1 최대 100개 제한)
// 공지가 100개 초과하면 서버 batch 한도 초과 가능하나 실운영에서는 드문 케이스.
// 서버에서 batch 크기를 100개로 제한하는 것이 올바른 수정이므로 클라이언트는 그대로 유지.
export async function markAllAnnouncementsRead(): Promise<void> {
  await authedFetch(`${BASE_URL}/api/announcements/mark-read`, {
    method: 'POST',
    // [BUG FIX] Content-Type 누락 — 서버가 JSON body 파싱 실패 시 silent fail
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [] }) }).catch(() => {});
}
