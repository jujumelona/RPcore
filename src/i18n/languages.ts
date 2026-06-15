﻿// src/i18n/languages.ts
// Active app languages: 15
// Keep this file aligned with supportedLanguages.ts and runtime translation tables.

export type LanguageCode = string;

export interface Language {
  code: LanguageCode;
  name: string;
  nativeName: string;
  isRTL: boolean;
  countryCodes: string[];
}

export const LANGUAGES: Record<string, Language> = {
  en:    { code: 'en',    name: 'English',            nativeName: 'English',            isRTL: false, countryCodes: ['US','GB','AU','CA','NZ','IE','ZA'] },
  es:    { code: 'es',    name: 'Spanish',            nativeName: 'Español',            isRTL: false, countryCodes: ['ES','MX','AR','CO','CL','PE','VE','EC','BO','PY','UY','CU','DO','GT','HN','NI','CR','PA','SV'] },
  pt:    { code: 'pt',    name: 'Portuguese',         nativeName: 'Português',          isRTL: false, countryCodes: ['BR','PT','AO','MZ','CV','ST','GW','TL'] },
  fr:    { code: 'fr',    name: 'French',             nativeName: 'Français',           isRTL: false, countryCodes: ['FR','BE','CH','CA','LU','MC','CD','CI','CM','MG','ML','MR','NE','SN','TG','BJ','BF','GN'] },
  de:    { code: 'de',    name: 'German',             nativeName: 'Deutsch',            isRTL: false, countryCodes: ['DE','AT','CH','LU','LI'] },
  it:    { code: 'it',    name: 'Italian',            nativeName: 'Italiano',           isRTL: false, countryCodes: ['IT','SM','VA','CH'] },
  ru:    { code: 'ru',    name: 'Russian',            nativeName: 'Русский',            isRTL: false, countryCodes: ['RU','BY','KZ','KG','MD','TJ'] },
  ko:    { code: 'ko',    name: 'Korean',             nativeName: '한국어',               isRTL: false, countryCodes: ['KR','KP'] },
  ja:    { code: 'ja',    name: 'Japanese',           nativeName: '日本語',              isRTL: false, countryCodes: ['JP'] },
  'zh-CN': { code: 'zh-CN', name: 'Chinese Simplified',  nativeName: '中文 (简体)',    isRTL: false, countryCodes: ['CN','SG'] },
  'zh-TW': { code: 'zh-TW', name: 'Chinese Traditional', nativeName: '中文 (繁體)',    isRTL: false, countryCodes: ['TW','HK','MO'] },
  th:    { code: 'th',    name: 'Thai',               nativeName: 'ภาษาไทย',           isRTL: false, countryCodes: ['TH'] },
  tr:    { code: 'tr',    name: 'Turkish',            nativeName: 'Türkçe',             isRTL: false, countryCodes: ['TR','CY'] },
  hi:    { code: 'hi',    name: 'Hindi',              nativeName: 'हिन्दी',             isRTL: false, countryCodes: ['IN'] },
  ar:    { code: 'ar',    name: 'Arabic',             nativeName: 'العربية',            isRTL: true,  countryCodes: ['SA','AE','EG','IQ','JO','KW','LB','LY','MA','OM','QA','SY','TN','YE','DZ','BH','SD'] } };

export const LANGUAGE_LIST = Object.values(LANGUAGES);
export const RTL_LANGUAGES = LANGUAGE_LIST.filter(l => l.isRTL).map(l => l.code);

/** country code -> LanguageCode */
export const COUNTRY_TO_LANGUAGE: Record<string, LanguageCode> = Object.values(LANGUAGES)
  .reduce((acc, lang) => {
    lang.countryCodes.forEach(cc => { acc[cc] = lang.code; });
    return acc;
  }, {} as Record<string, LanguageCode>);

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isSupportedLanguage(lang: string | null | undefined): lang is LanguageCode {
  return typeof lang === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, lang);
}

export function getSupportedLanguage(
  lang: string | null | undefined,
  fallback: LanguageCode = DEFAULT_LANGUAGE,
): LanguageCode {
  return isSupportedLanguage(lang) ? lang : fallback;
}
