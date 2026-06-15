import type { LanguageCode } from './languages';
import type { Translations } from './translations.types';
import { LOCALE_GROUPS } from './locales';

export type { Translations } from './translations.types';

const cache = new Map<LanguageCode, Translations>();

function mergeLocale(locale: Record<string, any>): Translations {
  const merged: Record<string, any> = {};

  for (const group of LOCALE_GROUPS) {
    if (locale[group] && typeof locale[group] === 'object' && !Array.isArray(locale[group])) {
      Object.assign(merged, locale[group]);
    }
  }

  for (const [key, value] of Object.entries(locale)) {
    if ((typeof value !== 'object' || value === null || Array.isArray(value)) && !(key in merged)) {
      merged[key] = value;
    }
  }

  return merged as Translations;
}

function loadLocale(lang: LanguageCode): Record<string, Record<string, string>> {
  switch (lang) {
    case 'ar':
      return require('./locales/ar').ar;
    case 'de':
      return require('./locales/de').de;
    case 'es':
      return require('./locales/es').es;
    case 'fr':
      return require('./locales/fr').fr;
    case 'hi':
      return require('./locales/hi').hi;
    case 'it':
      return require('./locales/it').it;
    case 'ja':
      return require('./locales/ja').ja;
    case 'ko':
      return require('./locales/ko').ko;
    case 'pt':
      return require('./locales/pt').pt;
    case 'ru':
      return require('./locales/ru').ru;
    case 'th':
      return require('./locales/th').th;
    case 'tr':
      return require('./locales/tr').tr;
    case 'zh-CN':
      return require('./locales/zh-CN').zh_CN;
    case 'zh-TW':
      return require('./locales/zh-TW').zh_TW;
    case 'en':
    default:
      return require('./locales/en').en;
  }
}

export function getTranslations(lang: LanguageCode): Translations {
  const cached = cache.get(lang);
  if (cached) {
    return cached;
  }

  const enTranslations = cache.get('en') ?? (() => {
    const merged = mergeLocale(loadLocale('en'));
    cache.set('en', merged);
    return merged;
  })();

  if (lang === 'en') {
    return enTranslations;
  }

  const mergedRequested = mergeLocale(loadLocale(lang));
  const final = { ...enTranslations, ...mergedRequested } as Translations;

  cache.set(lang, final);
  return final;
}
