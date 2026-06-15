import type { ModerationPriority, ModerationQueueStatus, ModerationTargetType } from '../api/ModerationAPI';
import { type LanguageCode, getSupportedLanguage } from './languages';

type ModerationHintKey =
  | 'immediate_escalation'
  | 'already_hidden_pending_review'
  | 'high_risk_reason'
  | 'aged_unresolved_report'
  | 'needs_follow_up_soon'
  | 'standard_moderation_review';

export interface AdminModerationCopy {
  statusLabels: Record<ModerationQueueStatus, string>;
  priorityLabels: Record<ModerationPriority, string>;
  targetTypeLabels: Record<ModerationTargetType, string>;
  filterActionable: string;
  filterAll: string;
  hintLabels: Record<ModerationHintKey, string>;
  systemResolutionNotes: Record<ModerationQueueStatus, string>;
  noReportDetail: string;
  reportPrefix: string;
  reporterPrefix: string;
  assigneePrefix: string;
  resolutionLabel: string;
  actionReview: string;
  actionHide: string;
  actionResolve: string;
  actionReject: string;
  actionReopen: string;
  changingStatus: string;
  reportQueueTitle: string;
  actionableLabel: string;
  criticalLabel: string;
  autoHiddenLabel: string;
  moderationQueueSummaryTitle: string;
  immediateActionLabel: string;
  importantReportsLabel: string;
  totalReportsLabel: string;
  currentResultsLabel: string;
  reportSearchPlaceholder: string;
  noReports: string;
  noMatchingReports: string;
  statusChangeTitle: string;
  statusChangeMessage: string;
  statusChangeConfirm: string;
  statusChangeFailedTitle: string;
  statusChangeFailedBody: string;
}

function loadAdminModerationCopy(language: LanguageCode): AdminModerationCopy {
  switch (language) {
    case 'ar':
      return require('../locales/ar/admin_moderation.json') as AdminModerationCopy;
    case 'de':
      return require('../locales/de/admin_moderation.json') as AdminModerationCopy;
    case 'es':
      return require('../locales/es/admin_moderation.json') as AdminModerationCopy;
    case 'fr':
      return require('../locales/fr/admin_moderation.json') as AdminModerationCopy;
    case 'hi':
      return require('../locales/hi/admin_moderation.json') as AdminModerationCopy;
    case 'it':
      return require('../locales/it/admin_moderation.json') as AdminModerationCopy;
    case 'ja':
      return require('../locales/ja/admin_moderation.json') as AdminModerationCopy;
    case 'ko':
      return require('../locales/ko/admin_moderation.json') as AdminModerationCopy;
    case 'pt':
      return require('../locales/pt/admin_moderation.json') as AdminModerationCopy;
    case 'ru':
      return require('../locales/ru/admin_moderation.json') as AdminModerationCopy;
    case 'th':
      return require('../locales/th/admin_moderation.json') as AdminModerationCopy;
    case 'tr':
      return require('../locales/tr/admin_moderation.json') as AdminModerationCopy;
    case 'zh-CN':
      return require('../locales/zh-CN/admin_moderation.json') as AdminModerationCopy;
    case 'zh-TW':
      return require('../locales/zh-TW/admin_moderation.json') as AdminModerationCopy;
    case 'en':
    default:
      return require('../locales/en/admin_moderation.json') as AdminModerationCopy;
  }
}

export function getAdminModerationCopy(language: LanguageCode | undefined): AdminModerationCopy {
  return loadAdminModerationCopy(getSupportedLanguage(language));
}
