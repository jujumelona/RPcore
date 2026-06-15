import { type LanguageCode, getSupportedLanguage } from './languages';

export interface AdminDashboardCopy {
  headerTitle: string;
  headerSub: string;
  statusOnline: string;
  statusIssues: string;
  overviewTab: string;
  helpTab: string;
  reportsTab: string;
  usersTab: string;
  alertsTab: string;
  metricActiveUsers: string;
  metricOpenTickets: string;
  sectionRealTimeHealth: string;
  healthRam: string;
  healthLlmLoad: string;
  healthLlmLoadValue: string;
  sectionRecentModeration: string;
  logSystem: string;
  logQueueReady: string;
  logNoActiveReports: string;
  logAdmin: string;
  logStandby: string;
  logQueueSynced: string;
  unresolvedInquiries: string;
  viewAll: string;
  noInquiries: string;
  noAlerts: string;
  alertSource: string;
  userSearchPlaceholder: string;
  joinedLabel: string;
  userRelease: string;
  userSuspend: string;
  userDelete: string;
  inquirySendFailedTitle: string;
  inquirySendFailedBody: string;
  inquiryResolveTitle: string;
  inquiryResolveBody: string;
  inquiryResolveConfirm: string;
  inquiryResolveAction: string;
  inquiryResolved: string;
  inquiryOriginalLabel: string;
  inquiryEmptyThread: string;
  inquiryResolvedPlaceholder: string;
  inquiryReplyPlaceholder: string;
  inquiryStatusDone: string;
  inquiryStatusPending: string;
  adminBadge: string;
  unreadByAdmin: string;
  userBanTitle: string;
  userUnbanTitle: string;
  userBanMessage: string;
  userDeleteTitle: string;
  userDeleteMessage: string;
  confirmDelete: string;
}

function loadAdminDashboardCopy(language: LanguageCode): AdminDashboardCopy {
  switch (language) {
    case 'ar':
      return require('../locales/ar/admin_dashboard.json') as AdminDashboardCopy;
    case 'de':
      return require('../locales/de/admin_dashboard.json') as AdminDashboardCopy;
    case 'es':
      return require('../locales/es/admin_dashboard.json') as AdminDashboardCopy;
    case 'fr':
      return require('../locales/fr/admin_dashboard.json') as AdminDashboardCopy;
    case 'hi':
      return require('../locales/hi/admin_dashboard.json') as AdminDashboardCopy;
    case 'it':
      return require('../locales/it/admin_dashboard.json') as AdminDashboardCopy;
    case 'ja':
      return require('../locales/ja/admin_dashboard.json') as AdminDashboardCopy;
    case 'ko':
      return require('../locales/ko/admin_dashboard.json') as AdminDashboardCopy;
    case 'pt':
      return require('../locales/pt/admin_dashboard.json') as AdminDashboardCopy;
    case 'ru':
      return require('../locales/ru/admin_dashboard.json') as AdminDashboardCopy;
    case 'th':
      return require('../locales/th/admin_dashboard.json') as AdminDashboardCopy;
    case 'tr':
      return require('../locales/tr/admin_dashboard.json') as AdminDashboardCopy;
    case 'zh-CN':
      return require('../locales/zh-CN/admin_dashboard.json') as AdminDashboardCopy;
    case 'zh-TW':
      return require('../locales/zh-TW/admin_dashboard.json') as AdminDashboardCopy;
    case 'en':
    default:
      return require('../locales/en/admin_dashboard.json') as AdminDashboardCopy;
  }
}

export function getAdminDashboardCopy(language: LanguageCode | undefined): AdminDashboardCopy {
  return loadAdminDashboardCopy(getSupportedLanguage(language));
}
