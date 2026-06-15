import { type LanguageCode, getSupportedLanguage } from './languages';

export interface DataPolicyCopy {
  title: string;
  lastUpdatedLabel: string;
  sensitive: string;
  dataCollectionTitle: string;
  dataIntro: string;
  dataLocalOnly: string;
  dataGroups: Array<{
    category: string;
    items: Array<{
      name: string;
      purpose: string;
      retention: string;
      sensitive: boolean;
    }>;
  }>;
  permissionsTitle: string;
  permissionsIntro: string;
  permissionsDeniedNote: string;
  permissions: Array<{
    permission: string;
    android: boolean;
    ios: boolean;
    reason: string;
    sensitive: boolean;
  }>;
  retentionTitle: string;
  retentionRows: Array<{
    label: string;
    value: string;
  }>;
  legalRetention: string;
  childPrivacyTitle: string;
  ageRestriction: string;
  childPrivacyIntro: string;
  childPrivacyLawNote: string;
  coppaRequestSubject: string;
  applicableLawsLabel: string;
  applicableLawsValue: string;
  thirdPartyTitle: string;
  thirdPartyIntro: string;
  thirdParties: Array<{
    name: string;
    purpose: string;
    policy: string;
    transfers: string;
  }>;
  transferRegionLabel: string;
  privacyPolicyLabel: string;
  deletionTitle: string;
  deletionIntro: string;
  deletionBackupNote: string;
  method1: string;
  method1Desc: string;
  method2: string;
  method2Desc: string;
  deleteAccount: string;
  deleteRequestSubject: string;
  deleteConfirmTitle: string;
  deleteConfirmMessage: string;
  deleteConfirmAction: string;
  cancelAction: string;
  okAction: string;
  deleteErrorTitle: string;
  deleteError: string;
  deleteProcessingAnnouncement: string;
  deleteCompletedAnnouncement: string;
  rightsTitle: string;
  rights: Array<{
    title: string;
    desc: string;
  }>;
  rightsNote: string;
  dpoTitle: string;
  dpoEmailLabel: string;
  dpoPolicyWebsiteLabel: string;
  dpoResponseTimeLabel: string;
  dpoResponseTimeValue: string;
  footerLastUpdated: string;
}

function loadDataPolicyCopy(language: LanguageCode): DataPolicyCopy {
  switch (language) {
    case 'ar':
      return require('../locales/ar/data_policy.json') as DataPolicyCopy;
    case 'de':
      return require('../locales/de/data_policy.json') as DataPolicyCopy;
    case 'es':
      return require('../locales/es/data_policy.json') as DataPolicyCopy;
    case 'fr':
      return require('../locales/fr/data_policy.json') as DataPolicyCopy;
    case 'hi':
      return require('../locales/hi/data_policy.json') as DataPolicyCopy;
    case 'it':
      return require('../locales/it/data_policy.json') as DataPolicyCopy;
    case 'ja':
      return require('../locales/ja/data_policy.json') as DataPolicyCopy;
    case 'ko':
      return require('../locales/ko/data_policy.json') as DataPolicyCopy;
    case 'pt':
      return require('../locales/pt/data_policy.json') as DataPolicyCopy;
    case 'ru':
      return require('../locales/ru/data_policy.json') as DataPolicyCopy;
    case 'th':
      return require('../locales/th/data_policy.json') as DataPolicyCopy;
    case 'tr':
      return require('../locales/tr/data_policy.json') as DataPolicyCopy;
    case 'zh-CN':
      return require('../locales/zh-CN/data_policy.json') as DataPolicyCopy;
    case 'zh-TW':
      return require('../locales/zh-TW/data_policy.json') as DataPolicyCopy;
    case 'en':
    default:
      return require('../locales/en/data_policy.json') as DataPolicyCopy;
  }
}

export function getDataPolicyCopy(language: LanguageCode | undefined): DataPolicyCopy {
  return loadDataPolicyCopy(getSupportedLanguage(language));
}
