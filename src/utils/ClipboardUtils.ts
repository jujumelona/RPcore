﻿// src/utils/ClipboardUtils.ts
// ✅ [OPT] @react-native-clipboard/clipboard 직접 static import
//    기존: 런타임 require() 폴백 체인 (deprecated react-native.Clipboard 포함)
//    변경: 이미 설치된 공식 패키지 직접 사용 -> 번들 분석 가능 + tree-shake 적용

import Clipboard from '@react-native-clipboard/clipboard';

/**
 * 클립보드에서 텍스트 읽기
 * @returns 텍스트 문자열, 실패 시 빈 문자열
 */
export async function clipboardGetString(): Promise<string> {
  try {
    return await Clipboard.getString();
  } catch {
    return '';
  }
}

/**
 * 클립보드에 텍스트 쓰기
 * @returns 성공 여부
 */
export function clipboardSetString(text: string): boolean {
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 클립보드 사용 가능 여부 확인
 */
export function isClipboardAvailable(): boolean {
  return true;
}
