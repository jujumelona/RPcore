﻿// src/utils/encodingUtils.ts
// ══════════════════════════════════════════════════════════════
// UTF-8 인코딩 유틸리티 — 한국어 텍스트 안전 처리
//
// 목적:
//   - React Native에서 한국어 텍스트 깨짐 방지
//   - 파일 저장/로드 시 UTF-8 인코딩 보장
//   - API 통신 시 문자열 안전 변환
// ══════════════════════════════════════════════════════════════

/**
 * UTF-8 문자열을 안전하게 인코딩
 * @param text 인코딩할 문자열
 * @returns UTF-8로 인코딩된 문자열
 */
export function safeUtf8Encode(text: string): string {
  // [BUG FIX] decodeURIComponent(encodeURIComponent(x)) = x (항등함수, no-op)
  // JS 문자열은 이미 UTF-16 내부 표현이므로 "인코딩"의 의미는 percent-encoding.
  // 실제로 UTF-8 바이트 유효성을 검증하고 싶다면 encodeURIComponent를 사용.
  if (!text) return '';
  try {
    // 멀티바이트 문자 포함 여부 검증 — 실패 시 원본 반환
    encodeURIComponent(text);
    return text;
  } catch (e) {
    console.warn('[encodingUtils] UTF-8 encode validation failed:', e);
    return text;
  }
}

/**
 * UTF-8 문자열을 안전하게 디코딩
 * @param text 디코딩할 문자열
 * @returns UTF-8로 디코딩된 문자열
 */
export function safeUtf8Decode(text: string): string {
  // [BUG FIX] decodeURIComponent(encodeURIComponent(x)) = x (항등함수, no-op)
  // 실제 percent-encoded 문자열을 디코딩하거나, 일반 문자열은 그대로 반환.
  if (!text) return '';
  try {
    // percent-encoded 문자열인 경우 디코딩 (예: %ED%95%9C%EA%B8%80 → 한글)
    if (text.includes('%')) {
      return decodeURIComponent(text);
    }
    return text;
  } catch (e) {
    // 실패 시 원본 반환 (이미 디코딩된 경우 등)
    console.warn('[encodingUtils] UTF-8 decode failed:', e);
    return text;
  }
}

/**
 * 한국어 텍스트가 포함된 문자열을 안전하게 처리
 * @param text 처리할 텍스트
 * @returns 안전하게 처리된 텍스트
 */
export function safeKoreanText(text: string): string {
  if (!text) return '';
  
  // BOM 제거
  let cleaned = text.replace(/^\uFEFF/, '');
  
  // 유효하지 않은 UTF-8 시퀀스 제거
  cleaned = cleaned.replace(/[\uFFFD\uFFFE\uFFFF]/g, '');
  
  return safeUtf8Decode(cleaned);
}

/**
 * JSON 문자열을 안전하게 파싱 (한국어 지원)
 * @param jsonString 파싱할 JSON 문자열
 * @param fallback 파싱 실패 시 반환할 기본값
 * @returns 파싱된 객체 또는 기본값
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  if (!jsonString) return fallback;
  
  try {
    const text = safeKoreanText(jsonString);
    return JSON.parse(text);
  } catch (e) {
    console.warn('[encodingUtils] JSON parse failed:', e);
    return fallback;
  }
}

/**
 * 객체를 안전하게 JSON 문자열로 변환 (한국어 지원)
 * @param obj 변환할 객체
 * @returns JSON 문자열
 */
export function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    console.warn('[encodingUtils] JSON stringify failed:', e);
    return '{}';
  }
}

/**
 * 파일 내용을 UTF-8로 안전하게 읽기
 * @param content 파일 내용
 * @returns UTF-8로 처리된 내용
 */
export function safeFileRead(content: string): string {
  return safeKoreanText(content);
}

/**
 * 파일 내용을 UTF-8로 안전하게 쓰기
 * @param content 파일에 쓸 내용
 * @returns UTF-8로 인코딩된 내용
 */
export function safeFileWrite(content: string): string {
  return safeUtf8Encode(content);
}
