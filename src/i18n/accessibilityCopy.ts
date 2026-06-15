import { type LanguageCode, getSupportedLanguage } from './languages';

export interface AccessibilityCopy {
  title: string;
  fontSizeTitle: string;
  fontSizeGuide: string;
  visualSettingsTitle: string;
  highContrastTitle: string;
  motionSettingsTitle: string;
  reduceMotionTitle: string;
  statementTitle: string;
  appGoal: string;
  appGoalSuffix: string;
  legalStandards: string;
  complianceStatus: string;
  partialConformant: string;
  contactTitle: string;
  contactDesc: string;
  lastUpdated: string;
  previewTemplate: string;
  fontSizeSmall: string;
  fontSizeDefault: string;
  fontSizeLarge: string;
  fontSizeXLarge: string;
  highContrastDesc: string;
  reduceMotionDesc: string;
  complianceSummary: string;
  legalSummary: string;
  statusBody: string;
  toggleOn: string;
  toggleOff: string;
  fontSizeChangedAnnouncement: string;
  highContrastEnabledAnnouncement: string;
  highContrastDisabledAnnouncement: string;
  reduceMotionEnabledAnnouncement: string;
  reduceMotionDisabledAnnouncement: string;
}

function loadAccessibilityCopy(language: LanguageCode): AccessibilityCopy {
  switch (language) {
    case 'ar':
      return require('../locales/ar/accessibility.json') as AccessibilityCopy;
    case 'de':
      return require('../locales/de/accessibility.json') as AccessibilityCopy;
    case 'es':
      return require('../locales/es/accessibility.json') as AccessibilityCopy;
    case 'fr':
      return require('../locales/fr/accessibility.json') as AccessibilityCopy;
    case 'hi':
      return require('../locales/hi/accessibility.json') as AccessibilityCopy;
    case 'it':
      return require('../locales/it/accessibility.json') as AccessibilityCopy;
    case 'ja':
      return require('../locales/ja/accessibility.json') as AccessibilityCopy;
    case 'ko':
      return require('../locales/ko/accessibility.json') as AccessibilityCopy;
    case 'pt':
      return require('../locales/pt/accessibility.json') as AccessibilityCopy;
    case 'ru':
      return require('../locales/ru/accessibility.json') as AccessibilityCopy;
    case 'th':
      return require('../locales/th/accessibility.json') as AccessibilityCopy;
    case 'tr':
      return require('../locales/tr/accessibility.json') as AccessibilityCopy;
    case 'zh-CN':
      return require('../locales/zh-CN/accessibility.json') as AccessibilityCopy;
    case 'zh-TW':
      return require('../locales/zh-TW/accessibility.json') as AccessibilityCopy;
    case 'en':
    default:
      return require('../locales/en/accessibility.json') as AccessibilityCopy;
  }
}

export function getAccessibilityCopy(language: LanguageCode | undefined): AccessibilityCopy {
  return loadAccessibilityCopy(getSupportedLanguage(language));
}
