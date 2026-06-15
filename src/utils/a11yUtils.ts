﻿/**
 * src/utils/a11yUtils.ts
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 접근성 유틸리티 모음 — WCAG 2.1 AA / ADA / EAA 2025 준수 지원 도구
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 포함 기능:
 *  1. contrastRatio()         — WCAG 1.4.3/1.4.6 명도 대비 계산
 *  2. wcagContrastLevel()     — AA/AAA 통과 여부 판정
 *  3. auditTouchTargets()     — WCAG 2.5.5 터치 타겟 48dp 감사
 *  4. buildFocusOrder()       — 포커스 순서 선언 헬퍼
 *  5. makeA11yProps()         — 스크린 리더 props 빌더
 *  6. imgA11yProps()          — 이미지 대체 텍스트 props 빌더
 *  7. useFocusTrap()          — 모달 포커스 트랩 (iOS VoiceOver / Android TalkBack)
 *  8. announceForA11y()       — 라이브 리전 공지
 *  9. CONTRAST_TABLE          — 앱 내 색상 대비 검증 테이블 (사전 계산)
 */

import { AccessibilityInfo, Platform } from 'react-native';
import { useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// § 1. 명도 대비 계산 (WCAG 2.1 Success Criterion 1.4.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 16진수 색상 -> 상대 휘도(relative luminance)
 * 알고리즘: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function hexToLinear(hex: string): number {
  // '#RRGGBB' 또는 'RRGGBB'
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * 두 색상 사이의 명도 대비율을 반환합니다.
 *
 * WCAG 기준:
 *  - 일반 텍스트 AA:  4.5:1 이상
 *  - 큰 텍스트 AA:    3.0:1 이상  (18pt bold 이상 또는 24pt 이상)
 *  - 일반 텍스트 AAA: 7.0:1 이상
 *  - 큰 텍스트 AAA:   4.5:1 이상
 *
 * @param fgHex 전경색 (텍스트) ex) '#F0F0F5'
 * @param bgHex 배경색 ex) '#050507'
 * @returns 대비율 (예: 12.4)
 */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const L1 = hexToLinear(fgHex);
  const L2 = hexToLinear(bgHex);
  const lighter = Math.max(L1, L2);
  const darker  = Math.min(L1, L2);
  return parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export type WCAGLevel =
  | 'AAA'       // 7:1 이상 (일반) / 4.5:1 이상 (큰 텍스트)
  | 'AA'        // 4.5:1 이상 (일반) / 3:1 이상 (큰 텍스트)
  | 'AA_large'  // 3:1 이상 (큰 텍스트 AA만 통과)
  | 'FAIL';     // 미통과

/**
 * 명도 대비율로부터 WCAG 등급을 반환합니다.
 * @param ratio   contrastRatio() 반환값
 * @param isLarge 큰 텍스트(≥ 18pt 또는 굵기 Bold + ≥ 14pt) 여부
 */
export function wcagContrastLevel(ratio: number, isLarge = false): WCAGLevel {
  if (!isLarge) {
    if (ratio >= 7.0)  return 'AAA';
    if (ratio >= 4.5)  return 'AA';
    return 'FAIL';
  } else {
    if (ratio >= 4.5)  return 'AAA';
    if (ratio >= 3.0)  return 'AA';
    return 'FAIL';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. 앱 내 핵심 색상 대비 검증 테이블
//      사전 계산값 — CI에서 자동 검사 가능하도록 상수로 관리합니다.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRAST_TABLE = [
  //  역할                  전경색     배경색     대비율    등급(일반)  통과여부
  { role: 'text0 on bg0',  fg: '#F0F0F5', bg: '#050507', ratio: contrastRatio('#F0F0F5', '#050507') },
  { role: 'text1 on bg0',  fg: '#C8C8D4', bg: '#050507', ratio: contrastRatio('#C8C8D4', '#050507') },
  { role: 'text2 on bg0',  fg: '#8A8A9E', bg: '#050507', ratio: contrastRatio('#8A8A9E', '#050507') },
  { role: 'text3 on bg0',  fg: '#797990', bg: '#050507', ratio: contrastRatio('#797990', '#050507') },
  { role: 'text4 on bg0',  fg: '#757585', bg: '#050507', ratio: contrastRatio('#757585', '#050507') },
  { role: 'accent on bg0', fg: '#D4A853', bg: '#050507', ratio: contrastRatio('#D4A853', '#050507') },
  { role: 'success on bg0',fg: '#4ADE80', bg: '#050507', ratio: contrastRatio('#4ADE80', '#050507') },
  { role: 'danger on bg0', fg: '#FF5555', bg: '#050507', ratio: contrastRatio('#FF5555', '#050507') },
  { role: 'text0 on surface0', fg: '#F0F0F5', bg: '#18181F', ratio: contrastRatio('#F0F0F5', '#18181F') },
  { role: 'text3 on surface1', fg: '#797990', bg: '#1E1E28', ratio: contrastRatio('#797990', '#1E1E28') },
  // 채팅 화면: AI 버블
  { role: 'aiText on aiBubble', fg: '#F0F0F5', bg: 'rgba(20,20,20,0.9)',
    ratio: contrastRatio('#F0F0F5', '#141414') /* rgba 근사 */ },
  // 유저 버블
  { role: 'userText on userBubble', fg: '#050507', bg: 'rgba(255,255,255,0.92)',
    ratio: contrastRatio('#050507', '#EBEBEB') },
] as const;

/**
 * DEV 환경에서만 실행되는 명도 대비 감사 로그.
 * CI 파이프라인 또는 앱 부팅 시 한 번 호출하세요.
 *
 * @example  // index.js
 *   if (__DEV__) auditContrast();
 */
export function auditContrast(): void {
  if (!__DEV__) return;
  console.group('[A11Y] 명도 대비 감사 (WCAG 1.4.3)');
  CONTRAST_TABLE.forEach(({ role, fg, bg, ratio }) => {
    const level   = wcagContrastLevel(ratio);
    const passing = level !== 'FAIL';
    const icon    = passing ? '✅' : '❌';
    if (__DEV__) console.log(`${icon} ${role}: ${ratio}:1 / ${level} (fg=${fg}, bg=${bg})`);
  });
  console.groupEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. 터치 타겟 감사 (WCAG 2.5.5 · Android Material 3 · Apple HIG)
// ─────────────────────────────────────────────────────────────────────────────

/** 플랫폼별 최소 터치 타겟 크기 (dp) */
export const MIN_TOUCH_TARGET = {
  /** WCAG 2.5.5 Target Size (Enhanced) — AAA 기준 */
  wcag_aaa: 44,
  /** Google Material 3 / Android 권장 */
  android:  48,
  /** Apple Human Interface Guidelines */
  ios:      44,
  /** 현재 플랫폼 기준 */
  current: Platform.OS === 'android' ? 48 : 44 } as const;

/**
 * 컴포넌트 크기가 최소 터치 타겟 기준을 충족하는지 검사합니다.
 * StyleSheet 객체의 width/height 값을 넘겨주세요.
 *
 * @example
 *   const result = auditTouchTargets([
 *     { name: '뒤로가기 버튼', width: 34, height: 34 },
 *   ]);
 */
export interface TouchTargetResult {
  name: string;
  width: number;
  height: number;
  passing: boolean;
  /** 부족한 dp 수. 0이면 통과 */
  shortfall: number;
}

export function auditTouchTargets(
  targets: Array<{ name: string; width: number; height: number }>,
  threshold = MIN_TOUCH_TARGET.current,
): TouchTargetResult[] {
  const results = targets.map(t => {
    const minDim  = Math.min(t.width, t.height);
    const passing = minDim >= threshold;
    return {
      ...t,
      passing,
      shortfall: passing ? 0 : threshold - minDim };
  });

  if (__DEV__) {
    console.group('[A11Y] 터치 타겟 감사 (WCAG 2.5.5)');
    results.forEach(r => {
      const icon = r.passing ? '✅' : `❌ (${r.shortfall}dp 부족)`;
      if (__DEV__) console.log(`${icon} ${r.name}: ${r.width}×${r.height}dp`);
    });
    console.groupEnd();
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4. 포커스 순서 빌더 (WCAG 2.4.3 Focus Order)
//
//  스크린 리더는 accessibilityViewIsModal + importantForAccessibility 조합으로
//  포커스 순서를 제어합니다. 이 헬퍼는 선언적 명세를 코드로 변환합니다.
// ─────────────────────────────────────────────────────────────────────────────

export type FocusRole =
  | 'header'     // 화면 제목
  | 'navigation' // 뒤로가기 등 내비게이션
  | 'main'       // 주 콘텐츠
  | 'button'
  | 'link'
  | 'image'
  | 'text'
  | 'none';      // 포커스 순서에서 제외 (장식용)

/**
 * WCAG 2.4.3 준수를 위한 포커스 순서 Props를 생성합니다.
 *
 * 원칙: 논리적 순서 = 시각 순서 (좌상단 -> 우하단 -> 하단 액션)
 * - 헤더 뒤로가기 -> 제목 -> 주 콘텐츠 영역 -> 하단 버튼
 *
 * @example
 *   <View {...buildFocusOrder('navigation', '뒤로 가기, 이전 화면으로 이동')}>
 */
export function buildFocusOrder(
  role: FocusRole,
  label: string,
  hint?: string,
): {
  accessible: boolean;
  accessibilityRole: import('react-native').AccessibilityRole;
  accessibilityLabel: string;
  accessibilityHint?: string;
  importantForAccessibility: 'yes' | 'no' | 'no-hide-descendants' | 'auto';
} {
  if (role === 'none') {
    return {
      accessible: false,
      accessibilityRole: 'none',
      accessibilityLabel: '',
      importantForAccessibility: 'no' };
  }
  return {
    accessible: true,
    accessibilityRole: role as import('react-native').AccessibilityRole,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
    importantForAccessibility: 'yes' };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. 스크린 리더 Props 빌더 — makeA11yProps
//      반복 패턴을 단일 함수로 통일
// ─────────────────────────────────────────────────────────────────────────────

interface A11yPropsInput {
  /** 스크린 리더가 읽을 대체 텍스트 (WCAG 1.1.1 Non-text Content) */
  label: string;
  /** 조작 방법 힌트 (선택) */
  hint?: string;
  /** ARIA role에 대응 (선택, 기본 'button') */
  role?: 'button' | 'link' | 'image' | 'header' | 'text' | 'switch' | 'checkbox' | 'radio' | 'tab' | 'none';
  /** 비활성화 여부 */
  disabled?: boolean;
  /** checked/selected/expanded 상태 */
  state?: {
    checked?: boolean;
    selected?: boolean;
    expanded?: boolean;
    busy?: boolean;
    disabled?: boolean;
  };
}

/**
 * 재사용 가능한 접근성 props 빌더.
 * 모든 `TouchableOpacity` / `PressableOpacity`에 적용하세요.
 *
 * @example
 *   <TouchableOpacity {...makeA11yProps({ label: '알림 화면으로 이동', role: 'button' })}>
 */
export function makeA11yProps(input: A11yPropsInput) {
  return {
    accessible: true,
    accessibilityLabel:   input.label,
    accessibilityRole:    (input.role ?? 'button') as import('react-native').AccessibilityRole,
    ...(input.hint    ? { accessibilityHint:  input.hint    } : {}),
    ...(input.state   ? { accessibilityState: input.state   } : {}),
    ...(input.disabled !== undefined
      ? { accessibilityState: { ...input.state, disabled: input.disabled } }
      : {}) };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. 이미지 대체 텍스트 Props 빌더 — imgA11yProps (WCAG 1.1.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `expo-image` / RN `Image` 컴포넌트에 붙이는 대체 텍스트 helper.
 *
 * @param altText  이미지의 의미를 설명하는 텍스트.
 *                 순수 장식 이미지면 null을 전달하세요.
 * @param isDecorative  true이면 스크린 리더에서 숨깁니다.
 *
 * @example
 *   <Image {...imgA11yProps('민준이의 프로필 사진')} source={{ uri }} />
 *   <Image {...imgA11yProps(null, true)} source={decorativeBg} />
 */
export function imgA11yProps(
  altText: string | null,
  isDecorative = false,
): {
  accessible: boolean;
  accessibilityLabel?: string;
  accessibilityRole: 'image' | 'none';
  importantForAccessibility: 'yes' | 'no' | 'no-hide-descendants';
} {
  if (isDecorative || altText === null) {
    return {
      accessible: false,
      accessibilityRole: 'none',
      importantForAccessibility: 'no' };
  }
  return {
    accessible: true,
    accessibilityLabel: altText,
    accessibilityRole: 'image',
    importantForAccessibility: 'yes' };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7. 모달 포커스 트랩 훅 (WCAG 2.4.3 Focus Order in Modals)
//
//  iOS VoiceOver: accessibilityViewIsModal=true로 처리
//  Android TalkBack: importantForAccessibility='no-hide-descendants'로 배경 숨김
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 모달이 열려 있을 때 배경 콘텐츠에 포커스가 가지 않도록 트랩합니다.
 * Modal 내부의 루트 View에 반환값을 spread하세요.
 *
 * @example
 *   const focusTrapProps = useFocusTrap(modalVisible);
 *   <View {...focusTrapProps}>...</View>
 */
export function useFocusTrap(isVisible: boolean) {
  // React Native의 Modal은 내부적으로 accessibilityViewIsModal=true를 처리하지만
  // 커스텀 드로어·바텀시트 등은 직접 설정해야 합니다.
  return {
    accessibilityViewIsModal: isVisible,  // iOS VoiceOver
    importantForAccessibility: isVisible
      ? ('yes' as const)
      : ('no-hide-descendants' as const), // Android TalkBack
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8. 라이브 리전 공지 — announceForA11y (WCAG 4.1.3 Status Messages)
//      스크린 리더 사용자에게 동적 변경 사항을 알립니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VoiceOver/TalkBack에서 즉시 읽어주는 공지를 보냅니다.
 * 토스트, 스낵바, 진행 상태 등에 사용하세요.
 *
 * @example
 *   announceForA11y('북마크가 추가되었습니다');
 *   announceForA11y('메시지 복사 완료', 300);
 */
export function announceForA11y(message: string, delayMs = 100): void {
  setTimeout(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, delayMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9. 포커스 강제 이동 — setA11yFocus (WCAG 2.4.3)
//      모달 열림/닫힘 시 포커스를 명시적으로 이동합니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 특정 Ref의 요소로 포커스를 강제 이동합니다.
 * 모달 열릴 때 -> 닫기 버튼, 닫힐 때 -> 트리거 버튼으로 복귀시키세요.
 *
 * @example
 *   const closeRef = useRef(null);
 *   useEffect(() => { if (modalVisible) setA11yFocus(closeRef); }, [modalVisible]);
 *   <TouchableOpacity ref={closeRef} ...>닫기</TouchableOpacity>
 */
export function setA11yFocus(ref: React.RefObject<any>): void {
  if (!ref.current) return;
  // findNodeHandle -> AccessibilityInfo.setAccessibilityFocus
  const { findNodeHandle } = require('react-native');
  const node = findNodeHandle(ref.current);
  if (node != null) {
    AccessibilityInfo.setAccessibilityFocus(node);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 10. 스크린 리더 감지 훅 — useIsScreenReaderEnabled
//       화면 레이아웃을 스크린 리더 모드에 최적화할 때 사용합니다.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

/**
 * 현재 기기에서 스크린 리더(VoiceOver/TalkBack)가 켜져 있는지 반환합니다.
 * 포커스 순서 조정, 애니메이션 생략 등에 활용하세요.
 *
 * @example
 *   const srEnabled = useIsScreenReaderEnabled();
 *   if (srEnabled) { // 애니메이션 건너뜀 }
 */
export function useIsScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setEnabled);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => sub.remove();
  }, []);

  return enabled;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 11. 표준 포커스 순서 정의 (앱 공통 적용)
//
//  스크린 리더 탐색 순서:
//    [1] 헤더 뒤로가기 버튼
//    [2] 화면 제목 (h1)
//    [3] 헤더 우측 액션 버튼들
//    [4] 메인 콘텐츠 (순차 탐색)
//    [5] 하단 CTA 버튼
//
//  구현 방법:
//    - View에 accessible=true + accessibilityRole='header' (헤더 영역)
//    - 각 항목에 accessibilityLabel 명시적 기술
//    - 장식용 아이콘·이미지에 importantForAccessibility='no'
// ─────────────────────────────────────────────────────────────────────────────

/** 앱 공통 포커스 순서 단계 정의 */
export const FOCUS_ORDER = {
  BACK_BUTTON:     { step: 1, description: '뒤로가기 버튼' },
  HEADER_TITLE:    { step: 2, description: '화면 제목' },
  HEADER_ACTIONS:  { step: 3, description: '헤더 우측 액션' },
  MAIN_CONTENT:    { step: 4, description: '주 콘텐츠 영역' },
  BOTTOM_CTA:      { step: 5, description: '하단 주요 버튼' } } as const;

/**
 * 접근성 감사 체크리스트를 콘솔에 출력합니다 (DEV 전용).
 * 릴리즈 빌드 전 수동 체크포인트로 활용하세요.
 */
export function printA11yChecklist(): void {
  if (!__DEV__) return;
  console.group('[A11Y] 릴리즈 전 체크리스트');
  const items = [
    '[ ] 모든 TouchableOpacity에 accessibilityLabel 명시',
    '[ ] 모든 Image에 accessibilityLabel 또는 importantForAccessibility="no" 처리',
    '[ ] 터치 타겟 최소 44dp (iOS) / 48dp (Android) 확인',
    '[ ] 텍스트 대비율 4.5:1 이상 (auditContrast() 통과)',
    '[ ] 모달 포커스 트랩 적용 (accessibilityViewIsModal)',
    '[ ] 스크린 리더로 전체 화면 순방향 탐색 테스트',
    '[ ] 역방향(swipe-left) 탐색 테스트',
    '[ ] 동적 상태 변경 시 announceForA11y() 호출 확인',
    '[ ] 색상만으로 정보 전달하지 않음 (아이콘/텍스트 병행)',
    '[ ] 텍스트 200% 확대 시 레이아웃 깨지지 않음',
  ];
  if (__DEV__) items.forEach(item => console.log(item));
  console.groupEnd();
}
