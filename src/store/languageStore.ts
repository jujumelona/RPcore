/* eslint-disable @typescript-eslint/no-unused-vars */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { I18nManager } from 'react-native';
import { LanguageCode, LANGUAGES, DEFAULT_LANGUAGE, getSupportedLanguage } from '../i18n/languages';
import { getTranslations, Translations } from '../i18n/translations';
import { mmkvZustandStorage } from '../utils/mmkvZustandStorage';
import { syncCoreI18nLanguage } from '../core/i18n';

export type { LanguageCode };
export type SupportedLanguage = LanguageCode;

interface PersistedLanguageState {
  appLanguage: LanguageCode;
  userHasSet: boolean;
}

interface LanguageStore {
  currentLanguage: LanguageCode;
  appLanguage: LanguageCode;
  isRTL: boolean;
  userHasSet: boolean;
  _hasHydrated: boolean;
  t: Translations;
  setLanguage: (_lang: LanguageCode) => void;
  setAppLanguage: (_lang: LanguageCode) => void;
  initialize: () => void;
  detectFromLocale: () => LanguageCode | null;
}

function applyRTL(isRTL: boolean) {
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.forceRTL(isRTL);
  }
}

function parseLocale(locale: string): LanguageCode | null {
  if (!locale) return null;
  const lower = locale.toLowerCase();

  if (lower.startsWith('zh')) {
    if (lower.includes('hant') || lower.includes('tw') || lower.includes('hk') || lower.includes('mo')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  const base = locale.substring(0, 2).toLowerCase() as LanguageCode;
  if (base in LANGUAGES) return base;

  return null;
}

function dedupeLocales(locales: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const locale of locales) {
    if (typeof locale !== 'string') continue;
    const normalized = locale.trim().replace(/_/g, '-');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

const _initialT = getTranslations(DEFAULT_LANGUAGE);

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set, get) => ({
      currentLanguage: DEFAULT_LANGUAGE,
      appLanguage: DEFAULT_LANGUAGE,
      isRTL: false,
      userHasSet: false,
      _hasHydrated: false,
      t: _initialT,

      setLanguage: (lang: LanguageCode) => {
        const nextLang = getSupportedLanguage(lang);
        const isRTL = LANGUAGES[nextLang]?.isRTL ?? false;
        applyRTL(isRTL);
        syncCoreI18nLanguage(nextLang);
        set({
          currentLanguage: nextLang,
          appLanguage: nextLang,
          isRTL,
          userHasSet: true,
          t: getTranslations(nextLang) });

        try {
          const { registerPushToken } = require('../api/NotificationsAPI');
          const { appStorage } = require('../utils/storage');
          const fcmToken = appStorage.getString('fcm_token');
          if (fcmToken) registerPushToken(fcmToken, nextLang).catch(() => {});
        } catch {}
      },

      setAppLanguage: (lang: LanguageCode) => {
        const nextLang = getSupportedLanguage(lang);
        const isRTL = LANGUAGES[nextLang]?.isRTL ?? false;
        applyRTL(isRTL);
        syncCoreI18nLanguage(nextLang);
        set({
          appLanguage: nextLang,
          currentLanguage: nextLang,
          isRTL,
          userHasSet: true,
          t: getTranslations(nextLang) });

        try {
          const notifService = require('../services/NotificationService').default;
          if (notifService?.onLanguageChanged) {
            notifService.onLanguageChanged(nextLang).catch(() => {});
          }
        } catch {}
      },



      detectFromLocale: (): LanguageCode | null => {
        try {
          const rawLocales: Array<string | null | undefined> = [];

          try {
            const { NativeModules: NM } = require('react-native');
            const settings = NM?.SettingsManager?.settings;
            const localeIdentifier =
              NM?.I18nManager?.localeIdentifier ??
              NM?.I18nManager?.settings?.localeIdentifier;

            rawLocales.push(
              localeIdentifier,
              settings?.AppleLocale,
              settings?.locale,
              settings?.preferredLocale,
              settings?.userLocale,
              settings?.locales?.[0]?.languageTag,
              settings?.preferredLanguages?.[0],
            );

            if (Array.isArray(NM?.I18nManager?.localeIdentifiers)) {
              rawLocales.push(...NM.I18nManager.localeIdentifiers);
            }
            if (Array.isArray(settings?.AppleLanguages)) {
              rawLocales.push(...settings.AppleLanguages);
            }
          } catch {}

          if (typeof Intl !== 'undefined') {
            try {
              const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
              if (intlLocale && intlLocale !== 'und') rawLocales.push(intlLocale);
            } catch {}
          }

          if (typeof navigator !== 'undefined') {
            if (navigator.languages?.length) rawLocales.push(...navigator.languages);
            else if (navigator.language) rawLocales.push(navigator.language);
          }

          const locales = dedupeLocales(rawLocales);
          const prioritizedLocales = [
            ...locales.filter(locale => locale.includes('-')),
            ...locales.filter(locale => !locale.includes('-')),
          ];

          for (const locale of prioritizedLocales) {
            const lang = parseLocale(locale);
            if (lang) {
              if (__DEV__) console.log(`[Language] Device locale detected: ${locale} -> ${lang}`);
              return lang;
            }
          }
        } catch (e) {
          console.warn('[Language] locale detection failed:', e);
        }

        return null;
      },

      initialize: () => {
        const { appLanguage, userHasSet, detectFromLocale } = get();

        let resolvedAppLang = appLanguage;
        if (!userHasSet) {
          const detected = detectFromLocale();
          if (detected) {
            resolvedAppLang = detected;
            if (__DEV__) console.log(`[Language] System language applied: ${resolvedAppLang}`);
          }
        }

        const isRTL = LANGUAGES[resolvedAppLang]?.isRTL ?? false;
        applyRTL(isRTL);
        syncCoreI18nLanguage(resolvedAppLang);

        set({
          appLanguage: resolvedAppLang,
          currentLanguage: resolvedAppLang,
          isRTL,
          t: getTranslations(resolvedAppLang) });
      } }),
    {
      name: 'language-store-v1',
      storage: createJSONStorage(() => mmkvZustandStorage),
      skipHydration: true,
      partialize: (s): PersistedLanguageState => ({
        appLanguage: s.appLanguage,
        userHasSet: s.userHasSet }),
      onRehydrateStorage: () => state => {
        if (!state) return;
        const lang = state.appLanguage ?? DEFAULT_LANGUAGE;
        const isRTL = LANGUAGES[lang]?.isRTL ?? false;
        applyRTL(isRTL);
        syncCoreI18nLanguage(lang);

        useLanguageStore.setState({ 
          _hasHydrated: true,
          t: getTranslations(lang),
          currentLanguage: lang,
          isRTL 
        });
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<LanguageStore>) };
        const lang = merged.appLanguage ?? DEFAULT_LANGUAGE;
        const isRTL = LANGUAGES[lang]?.isRTL ?? false;
        merged.t = getTranslations(lang);
        merged.currentLanguage = lang;
        merged.isRTL = isRTL;
        return merged as LanguageStore;
      } },
  ),
);
