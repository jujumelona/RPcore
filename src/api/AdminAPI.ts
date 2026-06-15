// src/api/AdminAPI.ts
// 고객지원 채팅 기능 추가:
//   - getInquiryThread()  : 특정 문의의 대화 스레드 조회
//   - replyToInquiry()    : 어드민 답장
//   - getUnreadCount()    : 유저 미확인 답장 수 (마이페이지 배지용)
//   - markThreadRead()    : 유저가 읽음 처리

import { SERVER_BASE } from '../config/ApiConfig';
import { authedFetch } from '../utils/authedFetch';
import { ModerationAPI, type ModerationQueueItem, type ModerationQueueStatus } from './ModerationAPI';

export interface AdminInquiry {
  id: string;
  user_id: string;
  email: string;
  name: string;
  title: string;
  body: string;
  photo_url?: string;
  created_at: string;
  status: 'pending' | 'resolved';
  /** 미읽은 어드민 답장 수 (마이페이지 배지) */
  unread_reply_count?: number;
  /** 최근 답장 미리보기 */
  last_reply_preview?: string;
}

/** 개별 메시지 (유저 ↔ 어드민 대화 단위) */
export interface SupportMessage {
  id: string;
  inquiry_id: string;
  sender: 'user' | 'admin';
  body: string;
  photo_url?: string;
  created_at: string;
  /** 어드민이 읽었는지 (유저 메시지) */
  read_by_admin: boolean;
  /** 유저가 읽었는지 (어드민 메시지) */
  read_by_user: boolean;
}

export interface SystemAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  source: string;
  timestamp: string;
}

export interface AdminUser {
  id: string;
  nickname: string;
  email: string;
  status: 'active' | 'banned' | 'suspended';
  created_at: string;
}

export const AdminAPI = {
  // ─── 고객문의 목록 ─────────────────────────────────────────
  async getInquiries(token: string): Promise<AdminInquiry[]> {
    const res = await authedFetch(`${SERVER_BASE}/admin/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  },

  /** 유저 자신의 문의 목록 (마이페이지용) */
  async getMyInquiries(token: string): Promise<AdminInquiry[]> {
    const res = await authedFetch(`${SERVER_BASE}/support/my-inquiries`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  },

  // ─── 스레드 (대화 내역) ────────────────────────────────────
  /** 특정 문의 ID의 전체 대화 스레드 조회 */
  async getInquiryThread(inquiryId: string, token: string): Promise<SupportMessage[]> {
    const res = await authedFetch(`${SERVER_BASE}/support/inquiries/${inquiryId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  },

  /** 유저가 문의에 추가 메시지 전송 (첨부 포함) */
  async sendUserMessage(
    inquiryId: string,
    body: string,
    token: string,
    photoUri?: string,
  ): Promise<SupportMessage | null> {
    const formData = new FormData();
    formData.append('body', body);
    if (photoUri) {
      const filename = photoUri.split('/').pop() ?? 'attachment.jpg';
      const match   = /\.(\w+)$/.exec(filename);
      const type    = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('photo', { uri: photoUri, name: filename, type } as unknown as Blob);
    }
    const res = await authedFetch(`${SERVER_BASE}/support/inquiries/${inquiryId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) return null;
    return res.json();
  },

  /** 새 문의 생성 (제목 + 첫 메시지) */
  async createInquiry(
    title: string,
    body: string,
    token: string,
    photoUri?: string,
  ): Promise<AdminInquiry | null> {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('body', body);
    if (photoUri) {
      const filename = photoUri.split('/').pop() ?? 'attachment.jpg';
      const match   = /\.(\w+)$/.exec(filename);
      const type    = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('photo', { uri: photoUri, name: filename, type } as unknown as Blob);
    }
    const res = await authedFetch(`${SERVER_BASE}/admin/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) return null;
    return res.json();
  },

  // ─── 어드민 전용 ───────────────────────────────────────────
  /** 어드민이 특정 문의에 답장 */
  async replyToInquiry(
    inquiryId: string,
    body: string,
    token: string,
  ): Promise<SupportMessage | null> {
    const res = await authedFetch(`${SERVER_BASE}/admin/messages/${inquiryId}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return null;
    return res.json();
  },

  /** 문의 상태 변경 (pending → resolved) */
  async resolveInquiry(
    inquiryId: string,
    status: 'pending' | 'resolved',
    token: string,
  ): Promise<boolean> {
    const res = await authedFetch(`${SERVER_BASE}/admin/messages/${inquiryId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  },

  // ─── 알림 배지 ─────────────────────────────────────────────
  /** 유저: 미확인 어드민 답장 수 (마이페이지 배지) */
  async getUnreadReplyCount(token: string): Promise<number> {
    const res = await authedFetch(`${SERVER_BASE}/support/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  },

  /** 유저: 특정 스레드 읽음 처리 */
  async markThreadRead(inquiryId: string, token: string): Promise<void> {
    await authedFetch(`${SERVER_BASE}/support/inquiries/${inquiryId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  /** 어드민: 미읽은 문의 수 */
  async getAdminUnreadCount(token: string): Promise<number> {
    const res = await authedFetch(`${SERVER_BASE}/admin/messages/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  },

  // ─── 기존 유틸 ─────────────────────────────────────────────
  async getSystemAlerts(token: string): Promise<SystemAlert[]> {
    const res = await authedFetch(`${SERVER_BASE}/admin/system/alerts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  },

  async searchUsers(query: string, token: string): Promise<AdminUser[]> {
    const res = await authedFetch(
      `${SERVER_BASE}/admin/users/search?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    return res.json();
  },

  async updateUserStatus(
    userId: string,
    status: 'active' | 'banned',
    token: string,
  ): Promise<boolean> {
    const res = await authedFetch(`${SERVER_BASE}/admin/users/${userId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  },

  async deleteUser(userId: string, token: string): Promise<boolean> {
    const res = await authedFetch(`${SERVER_BASE}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  },

  async getReportsQueue(token: string): Promise<ModerationQueueItem[]> {
    return ModerationAPI.getReportsQueue(token);
  },

  async updateReportStatus(
    reportId: string,
    status: ModerationQueueStatus,
    token: string,
    resolution?: string,
  ): Promise<boolean> {
    return ModerationAPI.updateReportStatus(reportId, status, token, resolution);
  },
};
