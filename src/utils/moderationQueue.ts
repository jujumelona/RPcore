import type {
  ModerationPriority,
  ModerationQueueItem,
  ModerationQueueStatus,
} from '../api/ModerationAPI';
import { fuzzySearch } from './fuzzySearch';

export type ModerationQueueFilterKey = 'all' | 'actionable' | ModerationQueueStatus;

export interface ModerationPriorityMeta {
  color: string;
  backgroundColor: string;
  borderColor: string;
  rank: number;
}

export interface ModerationQueueSummary {
  total: number;
  actionable: number;
  critical: number;
  autoHidden: number;
  open: number;
  reviewing: number;
  resolved: number;
  rejected: number;
}

const HIGH_IMPACT_REASONS = new Set([
  'csam',
  'hate',
  'illegal',
  'impersonation',
  'violence',
]);

const PRIORITY_ORDER: Record<ModerationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_ORDER: Record<ModerationQueueStatus, number> = {
  auto_hidden: 5,
  open: 4,
  reviewing: 3,
  resolved: 2,
  rejected: 1,
};

const PRIORITY_META: Record<ModerationPriority, ModerationPriorityMeta> = {
  critical: {
    color: '#F87171',
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.30)',
    rank: PRIORITY_ORDER.critical,
  },
  high: {
    color: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.28)',
    rank: PRIORITY_ORDER.high,
  },
  medium: {
    color: '#D4A853',
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderColor: 'rgba(212,168,83,0.28)',
    rank: PRIORITY_ORDER.medium,
  },
  low: {
    color: '#8A8A9E',
    backgroundColor: 'rgba(138,138,158,0.12)',
    borderColor: 'rgba(138,138,158,0.28)',
    rank: PRIORITY_ORDER.low,
  },
};

export type ModerationPriorityHintKey =
  | 'immediate_escalation'
  | 'already_hidden_pending_review'
  | 'high_risk_reason'
  | 'aged_unresolved_report'
  | 'needs_follow_up_soon'
  | 'standard_moderation_review';

function normalizeReason(value: string): string {
  return value.trim().toLowerCase();
}

function getRelevantTimestamp(item: ModerationQueueItem): number {
  const raw = item.updatedAt ?? item.createdAt;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAgeHours(item: ModerationQueueItem): number {
  const createdAt = Date.parse(item.createdAt);
  if (!Number.isFinite(createdAt)) {
    return 0;
  }

  return Math.max(0, (Date.now() - createdAt) / 3_600_000);
}

function escalatePriority(priority: ModerationPriority): ModerationPriority {
  switch (priority) {
    case 'low':
      return 'medium';
    case 'medium':
      return 'high';
    case 'high':
      return 'critical';
    default:
      return 'critical';
  }
}

export function isActionableModerationStatus(status: ModerationQueueStatus): boolean {
  return status === 'open' || status === 'reviewing' || status === 'auto_hidden';
}

export function getModerationPriority(item: ModerationQueueItem): ModerationPriority {
  const reason = normalizeReason(item.reason);
  const actionable = isActionableModerationStatus(item.status);
  const ageHours = getAgeHours(item);

  if (reason === 'csam') {
    return 'critical';
  }

  if (item.status === 'auto_hidden' && (HIGH_IMPACT_REASONS.has(reason) || ageHours >= 6)) {
    return 'critical';
  }

  let priority: ModerationPriority;
  if (item.status === 'auto_hidden' || HIGH_IMPACT_REASONS.has(reason)) {
    priority = 'high';
  } else if (actionable || reason === 'harassment' || reason === 'spam') {
    priority = 'medium';
  } else {
    priority = 'low';
  }

  if (actionable) {
    if (ageHours >= 72) {
      priority = escalatePriority(escalatePriority(priority));
    } else if (ageHours >= 24) {
      priority = escalatePriority(priority);
    }
  }

  return priority;
}

export function getModerationPriorityMeta(priority: ModerationPriority): ModerationPriorityMeta {
  return PRIORITY_META[priority];
}

export function getModerationPriorityHintKey(item: ModerationQueueItem): ModerationPriorityHintKey {
  const reason = normalizeReason(item.reason);
  const ageHours = getAgeHours(item);

  if (reason === 'csam') {
    return 'immediate_escalation';
  }

  if (item.status === 'auto_hidden') {
    return 'already_hidden_pending_review';
  }

  if (HIGH_IMPACT_REASONS.has(reason)) {
    return 'high_risk_reason';
  }

  if (ageHours >= 72) {
    return 'aged_unresolved_report';
  }

  if (ageHours >= 24) {
    return 'needs_follow_up_soon';
  }

  return 'standard_moderation_review';
}

export function filterModerationQueue(
  items: ModerationQueueItem[],
  filterKey: ModerationQueueFilterKey,
): ModerationQueueItem[] {
  switch (filterKey) {
    case 'all':
      return items;
    case 'actionable':
      return items.filter(item => isActionableModerationStatus(item.status));
    default:
      return items.filter(item => item.status === filterKey);
  }
}

export function searchModerationQueue(
  items: ModerationQueueItem[],
  query: string,
): ModerationQueueItem[] {
  return fuzzySearch(items, query, [
    {
      name: 'target',
      weight: 0.42,
      getValue: item => [item.targetLabel ?? '', item.targetId],
    },
    {
      name: 'reason',
      weight: 0.2,
      getValue: item => item.reason,
    },
    {
      name: 'detail',
      weight: 0.16,
      getValue: item => item.detail,
    },
    {
      name: 'status',
      weight: 0.08,
      getValue: item => item.status,
    },
    {
      name: 'actors',
      weight: 0.08,
      getValue: item => [item.reporterId ?? '', item.assigneeId ?? ''],
    },
    {
      name: 'resolution',
      weight: 0.06,
      getValue: item => item.resolution,
    },
  ], {
    threshold: 0.32,
    minMatchCharLength: 2,
  });
}

export function sortModerationQueue(items: ModerationQueueItem[]): ModerationQueueItem[] {
  return [...items].sort((left, right) => {
    const actionableDelta = Number(isActionableModerationStatus(right.status))
      - Number(isActionableModerationStatus(left.status));
    if (actionableDelta !== 0) {
      return actionableDelta;
    }

    const priorityDelta = PRIORITY_ORDER[getModerationPriority(right)]
      - PRIORITY_ORDER[getModerationPriority(left)];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const statusDelta = STATUS_ORDER[right.status] - STATUS_ORDER[left.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return getRelevantTimestamp(right) - getRelevantTimestamp(left);
  });
}

export function getModerationQueueSummary(items: ModerationQueueItem[]): ModerationQueueSummary {
  return items.reduce<ModerationQueueSummary>((summary, item) => {
    summary.total += 1;
    if (isActionableModerationStatus(item.status)) {
      summary.actionable += 1;
    }
    if (getModerationPriority(item) === 'critical') {
      summary.critical += 1;
    }

    switch (item.status) {
      case 'auto_hidden':
        summary.autoHidden += 1;
        break;
      case 'open':
        summary.open += 1;
        break;
      case 'reviewing':
        summary.reviewing += 1;
        break;
      case 'resolved':
        summary.resolved += 1;
        break;
      case 'rejected':
        summary.rejected += 1;
        break;
      default:
        break;
    }

    return summary;
  }, {
    total: 0,
    actionable: 0,
    critical: 0,
    autoHidden: 0,
    open: 0,
    reviewing: 0,
    resolved: 0,
    rejected: 0,
  });
}
