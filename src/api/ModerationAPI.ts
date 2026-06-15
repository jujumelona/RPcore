import { SERVER_BASE } from '../config/ApiConfig';
import { authedFetch } from '../utils/authedFetch';

export const MODERATION_REPORT_REASONS = [
  'csam',
  'harassment',
  'hate',
  'spam',
  'violence',
  'illegal',
  'impersonation',
  'other',
] as const;

export type ModerationReportReason = typeof MODERATION_REPORT_REASONS[number];
export type ModerationTargetType = 'story' | 'post' | 'user' | 'comment';
export type ModerationQueueStatus = 'open' | 'reviewing' | 'resolved' | 'rejected' | 'auto_hidden';
export const MODERATION_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type ModerationPriority = typeof MODERATION_PRIORITIES[number];

export interface ModerationReportPayload {
  targetType: ModerationTargetType;
  targetId: string;
  reason: ModerationReportReason;
  detail?: string;
  lang?: string;
  targetLabel?: string;
}

export interface ModerationMirrorUser {
  id?: string;
  email?: string;
  name?: string;
  jwtToken: string;
}

export interface ModerationReportReceipt {
  success: boolean;
  reportId?: string;
  priority?: ModerationPriority;
  mirroredToAdmin: boolean;
}

export interface ModerationQueueItem {
  id: string;
  reporterId?: string;
  targetType: ModerationTargetType;
  targetId: string;
  targetLabel?: string;
  reason: string;
  detail?: string;
  status: ModerationQueueStatus;
  assigneeId?: string;
  resolution?: string;
  createdAt: string;
  updatedAt?: string;
}

function normalizeQueueStatus(value: unknown): ModerationQueueStatus {
  switch (value) {
    case 'reviewing':
    case 'resolved':
    case 'rejected':
    case 'auto_hidden':
      return value;
    default:
      return 'open';
  }
}

export function isModerationPriority(value: unknown): value is ModerationPriority {
  return typeof value === 'string'
    && (MODERATION_PRIORITIES as readonly string[]).includes(value);
}

function normalizeQueueItem(raw: unknown): ModerationQueueItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id) : '';
  const targetId = typeof record.target_id === 'string' || typeof record.targetId === 'string'
    ? String(record.target_id ?? record.targetId)
    : '';

  if (!id || !targetId) {
    return null;
  }

  return {
    id,
    reporterId: typeof record.reporter_id === 'string' || typeof record.reporterId === 'string'
      ? String(record.reporter_id ?? record.reporterId)
      : undefined,
    targetType: (record.target_type ?? record.targetType ?? 'post') as ModerationTargetType,
    targetId,
    targetLabel: typeof record.target_label === 'string' || typeof record.targetLabel === 'string'
      ? String(record.target_label ?? record.targetLabel)
      : undefined,
    reason: typeof record.reason === 'string' ? record.reason : 'other',
    detail: typeof record.detail === 'string' ? record.detail : undefined,
    status: normalizeQueueStatus(record.status),
    assigneeId: typeof record.assignee_id === 'string' || typeof record.assigneeId === 'string'
      ? String(record.assignee_id ?? record.assigneeId)
      : undefined,
    resolution: typeof record.resolution === 'string' ? record.resolution : undefined,
    createdAt: typeof record.created_at === 'string' || typeof record.createdAt === 'string'
      ? String(record.created_at ?? record.createdAt)
      : new Date().toISOString(),
    updatedAt: typeof record.updated_at === 'string' || typeof record.updatedAt === 'string'
      ? String(record.updated_at ?? record.updatedAt)
      : undefined,
  };
}

async function mirrorReportToAdminInbox(
  payload: ModerationReportPayload,
  user: ModerationMirrorUser,
): Promise<boolean> {
  const adminBody = JSON.stringify({
    type: 'content_report',
    targetType: payload.targetType,
    targetId: payload.targetId,
    targetLabel: payload.targetLabel?.trim() || null,
    reason: payload.reason,
    detail: payload.detail?.trim() || '',
    language: payload.lang ?? 'en',
    reportedAt: new Date().toISOString(),
  }, null, 2);

  const formData = new FormData();
  formData.append('title', `[REPORT][${payload.targetType.toUpperCase()}] ${payload.targetLabel?.trim() || payload.targetId}`);
  formData.append('body', adminBody);
  formData.append('user_id', user.id ?? '');
  formData.append('email', user.email ?? '');
  formData.append('name', user.name ?? '');

  const response = await fetch(`${SERVER_BASE}/admin/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.jwtToken}` },
    body: formData,
  });

  return response.ok;
}

export const ModerationAPI = {
  async submitReport(
    payload: ModerationReportPayload,
    options?: { mirrorToAdmin?: boolean; user?: ModerationMirrorUser },
  ): Promise<ModerationReportReceipt> {
    const response = await authedFetch('/report', {
      method: 'POST',
      body: JSON.stringify({
        target_type: payload.targetType,
        target_id: payload.targetId,
        reason: payload.reason,
        detail: payload.detail?.trim() || '',
        lang: payload.lang,
      }),
    });

    if (!response.ok) {
      throw new Error('report_failed');
    }

    const data = await response.json().catch(() => ({}));
    let mirroredToAdmin = false;

    if (options?.mirrorToAdmin && options.user?.jwtToken) {
      mirroredToAdmin = await mirrorReportToAdminInbox(payload, options.user);
      if (!mirroredToAdmin) {
        throw new Error('admin_forward_failed');
      }
    }

    return {
      success: true,
      reportId: typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : undefined,
      priority: isModerationPriority(data.priority) ? data.priority : undefined,
      mirroredToAdmin,
    };
  },

  async submitBlockSignal(
    targetType: Extract<ModerationTargetType, 'story' | 'user'>,
    targetId: string,
    detail = 'block',
  ): Promise<boolean> {
    try {
      const response = await authedFetch('/report', {
        method: 'POST',
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reason: 'other',
          detail,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  },

  async getReportsQueue(token: string): Promise<ModerationQueueItem[]> {
    try {
      const response = await authedFetch(`${SERVER_BASE}/admin/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        return [];
      }

      const data = await response.json().catch(() => ([]));
      const list = Array.isArray(data) ? data : Array.isArray(data.reports) ? data.reports : [];
      return list
        .map(normalizeQueueItem)
        .filter((item): item is ModerationQueueItem => item !== null);
    } catch {
      return [];
    }
  },

  async updateReportStatus(
    reportId: string,
    status: ModerationQueueStatus,
    token: string,
    resolution?: string,
  ): Promise<boolean> {
    try {
      const response = await authedFetch(`${SERVER_BASE}/admin/reports/${reportId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          resolution,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  },
};
