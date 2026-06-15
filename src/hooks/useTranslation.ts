﻿// src/hooks/useTranslation.ts
// ════════════════════════════════════════════════════════════════
// ✅ [PERF] useLanguageStore 최적화 훅
// 
// 문제점:
//   - 모든 컴포넌트에서 useShallow(s => ({ t: s.t, ... })) 패턴 반복
//   - t 함수는 언어 변경 시에만 재생성되면 충분
//   - 불필요한 재렌더링 발생
//
// 해결:
//   - useTranslation() 훅으로 t 함수만 선택적으로 구독
//   - 다른 필드가 변경되어도 t 함수만 필요한 컴포넌트는 재렌더링 방지
// ════════════════════════════════════════════════════════════════

import { useLanguageStore } from '../store/languageStore';
import { useShallow } from 'zustand/react/shallow';
import type { Translations } from '../i18n/translations';

/**
 * 번역 함수(t)만 필요할 때 사용하는 최적화 훅
 * 
 * @example
 *   // 기존: const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
 *   // 수정: const t = useTranslation();
 */
export function useTranslation(): Translations {
  const t = useLanguageStore(
    useShallow(state => state.t)
  );
  
  // ✅ [FIX] 방어 코드 - t가 undefined면 기본 번역 반환
  if (!t) {
    console.warn('[useTranslation] t is undefined, using fallback');
    return {} as Translations;
  }
  
  return t;
}

/**
 * 번역 함수와 RTL 정보가 필요할 때 사용
 * 
 * @example
 *   // 기존: const { t, isRTL } = useLanguageStore(useShallow(s => ({ t: s.t, isRTL: s.isRTL })));
 *   // 수정: const { t, isRTL } = useTranslationWithRTL();
 */
export function useTranslationWithRTL() {
  const result = useLanguageStore(
    useShallow(state => ({
      t: state.t,
      isRTL: state.isRTL }))
  );
  
  // ✅ [FIX] 방어 코드
  if (!result.t) {
    console.warn('[useTranslationWithRTL] t is undefined, using fallback');
    return { t: {} as Translations, isRTL: false };
  }
  
  return result;
}

/**
 * 번역 함수와 앱 언어 정보가 필요할 때 사용
 * 
 * @example
 *   const { t, appLanguage } = useTranslationWithLanguage();
 */
export function useTranslationWithLanguage() {
  const result = useLanguageStore(
    useShallow(state => ({
      t: state.t,
      appLanguage: state.appLanguage }))
  );
  
  if (!result.t) {
    console.warn('[useTranslationWithLanguage] t is undefined, using fallback');
    return { t: {} as Translations, appLanguage: 'ko' };
  }
  
  return result;
}

/**
 * 번역 함수와 현재 언어 정보가 필요할 때 사용
 * 
 * @example
 *   const { t, currentLanguage } = useTranslationWithCurrentLanguage();
 */
export function useTranslationWithCurrentLanguage() {
  const result = useLanguageStore(
    useShallow(state => ({
      t: state.t,
      currentLanguage: state.currentLanguage }))
  );
  
  if (!result.t) {
    console.warn('[useTranslationWithCurrentLanguage] t is undefined, using fallback');
    return { t: {} as Translations, currentLanguage: 'ko' };
  }
  
  return result;
}

/**
 * 모든 언어 관련 상태가 필요할 때 사용
 * 
 * @example
 *   const { t, isRTL, appLanguage, currentLanguage, userHasSet } = useFullLanguageStore();
 */
export function useFullLanguageStore() {
  const result = useLanguageStore(
    useShallow(state => ({
      t: state.t,
      isRTL: state.isRTL,
      appLanguage: state.appLanguage,
      currentLanguage: state.currentLanguage,
      userHasSet: state.userHasSet }))
  );
  
  if (!result.t) {
    console.warn('[useFullLanguageStore] t is undefined, using fallback');
    return { 
      t: {} as Translations, 
      isRTL: false,
      appLanguage: 'ko',
      currentLanguage: 'ko',
      userHasSet: false
    };
  }
  
  return result;
}
