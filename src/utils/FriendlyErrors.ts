/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/FriendlyErrors.ts
// ══════════════════════════════════════════════════════════════
// 사용자 친화적 에러 메시지 시스템
// 기술적 에러를 이해하기 쉬운 메시지로 변환
// ══════════════════════════════════════════════════════════════

export interface FriendlyErrorInfo {
  title: string;
  message: string;
  actions?: string[];
  icon: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 에러 코드별 사용자 친화적 메시지 맵
 */
export const FriendlyErrorMessages: Record<string, FriendlyErrorInfo> = {
  // 네트워크 에러
  ECONNREFUSED: {
    title: '서버에 연결할 수 없어요',
    message: '인터넷 연결을 확인해 주세요',
    actions: ['다시 시도'],
    icon: '📡',
    severity: 'medium' },
  
  ETIMEDOUT: {
    title: '연결 시간이 초과되었어요',
    message: '네트워크가 불안정하거나 서버가 응답하지 않아요',
    actions: ['다시 시도'],
    icon: '⏱',
    severity: 'medium' },
  
  NETWORK_ERROR: {
    title: '네트워크 오류',
    message: '인터넷 연결을 확인하고 다시 시도해 주세요',
    actions: ['다시 시도'],
    icon: '📶',
    severity: 'medium' },
  
  // AI 모델 관련
  MODEL_LOAD_FAILED: {
    title: 'AI 모델을 불러올 수 없어요',
    message: '저장 공간이 부족하거나 모델 파일이 손상되었을 수 있어요',
    actions: ['다시 시도', '모델 재다운로드'],
    icon: '🤖',
    severity: 'high' },
  
  MODEL_NOT_FOUND: {
    title: 'AI 모델을 찾을 수 없어요',
    message: '모델을 다운로드해야 채팅을 시작할 수 있어요',
    actions: ['모델 다운로드'],
    icon: '📦',
    severity: 'high' },
  
  MODEL_INFERENCE_ERROR: {
    title: 'AI가 응답을 생성할 수 없어요',
    message: '모델에 문제가 발생했어요. 잠시 후 다시 시도해 주세요',
    actions: ['다시 시도', '모델 재시작'],
    icon: '⚙',
    severity: 'medium' },
  
  // 메모리 관련
  KV_CACHE_FULL: {
    title: '메모리가 가득 찼어요',
    message: '대화를 계속하려면 일부 내용을 정리해야 해요',
    actions: ['자동 정리', '북마크 관리'],
    icon: '🧠',
    severity: 'medium' },
  
  OUT_OF_MEMORY: {
    title: '메모리가 부족해요',
    message: '다른 앱을 종료하거나 대화 내역을 정리해 주세요',
    actions: ['메모리 정리', '앱 재시작'],
    icon: '💾',
    severity: 'high' },
  
  // 콘텐츠 관련
  CONTENT_REFUSED: {
    title: 'AI가 응답을 거부했어요',
    message: '부적절한 내용이 감지되었어요. 다른 방식으로 질문해 보세요',
    actions: ['다시 입력'],
    icon: '🚫',
    severity: 'low' },
  
  CONTENT_FILTERED: {
    title: '콘텐츠가 필터링되었어요',
    message: '안전 정책에 따라 일부 내용이 차단되었어요',
    actions: ['확인'],
    icon: '🛡️',
    severity: 'low' },
  
  // 스토리 관련
  STORY_NOT_FOUND: {
    title: '스토리를 찾을 수 없어요',
    message: '스토리가 삭제되었거나 접근 권한이 없어요',
    actions: ['홈으로 돌아가기'],
    icon: '',
    severity: 'medium' },
  
  CHAPTER_LOAD_FAILED: {
    title: '챕터를 불러올 수 없어요',
    message: '파일이 손상되었거나 호환되지 않는 형식이에요',
    actions: ['다시 시도', '이전 챕터로'],
    icon: '📄',
    severity: 'medium' },
  
  // 데이터베이스 관련
  DB_ERROR: {
    title: '데이터 저장 오류',
    message: '데이터를 저장하거나 불러오는 중 문제가 발생했어요',
    actions: ['다시 시도'],
    icon: '🗄️',
    severity: 'high' },
  
  DB_CORRUPTED: {
    title: '데이터가 손상되었어요',
    message: '데이터베이스를 복구해야 할 수 있어요',
    actions: ['복구 시도', '백업 복원'],
    icon: '🧩',
    severity: 'critical' },
  
  // 권한 관련
  PERMISSION_DENIED: {
    title: '권한이 필요해요',
    message: '이 기능을 사용하려면 권한을 허용해 주세요',
    actions: ['설정으로 이동'],
    icon: '🔒',
    severity: 'medium' },
  
  // 파일 시스템
  FILE_NOT_FOUND: {
    title: '파일을 찾을 수 없어요',
    message: '파일이 삭제되었거나 이동되었을 수 있어요',
    actions: ['다시 시도'],
    icon: '📁',
    severity: 'medium' },
  
  STORAGE_FULL: {
    title: '저장 공간이 부족해요',
    message: '기기의 저장 공간을 확보한 후 다시 시도해 주세요',
    actions: ['저장 공간 관리'],
    icon: '💽',
    severity: 'high' },
  
  // 인증 관련
  AUTH_FAILED: {
    title: '로그인에 실패했어요',
    message: '계정 정보를 확인하고 다시 시도해 주세요',
    actions: ['다시 로그인'],
    icon: '🔐',
    severity: 'medium' },
  
  SESSION_EXPIRED: {
    title: '세션이 만료되었어요',
    message: '다시 로그인해 주세요',
    actions: ['로그인'],
    icon: '⏰',
    severity: 'medium' },
  
  // 기타
  UNKNOWN_ERROR: {
    title: '알 수 없는 오류',
    message: '예상치 못한 문제가 발생했어요. 잠시 후 다시 시도해 주세요',
    actions: ['다시 시도'],
    icon: '',
    severity: 'medium' } };

/**
 * 에러 객체를 사용자 친화적 메시지로 변환
 * @param error Error 객체 또는 에러 코드
 * @param fallbackMessage 기본 메시지 (선택)
 * @returns 사용자 친화적 에러 정보
 */
export function getFriendlyError(
  error: Error | string,
  fallbackMessage?: string
): FriendlyErrorInfo {
  const errorCode = typeof error === 'string' ? error : error.message;
  
  // 에러 코드로 매칭 시도
  if (FriendlyErrorMessages[errorCode]) {
    return FriendlyErrorMessages[errorCode];
  }
  
  // 에러 메시지에서 코드 추출 시도
  const codeMatch = errorCode.match(/\[([A-Z_]+)\]/);
  if (codeMatch && FriendlyErrorMessages[codeMatch[1]]) {
    return FriendlyErrorMessages[codeMatch[1]];
  }
  
  // 키워드 기반 매칭
  const lowerError = errorCode.toLowerCase();
  
  if (lowerError.includes('network') || lowerError.includes('connection')) {
    return FriendlyErrorMessages.NETWORK_ERROR;
  }
  
  if (lowerError.includes('memory') || lowerError.includes('oom')) {
    return FriendlyErrorMessages.OUT_OF_MEMORY;
  }
  
  if (lowerError.includes('model')) {
    return FriendlyErrorMessages.MODEL_INFERENCE_ERROR;
  }
  
  if (lowerError.includes('permission') || lowerError.includes('denied')) {
    return FriendlyErrorMessages.PERMISSION_DENIED;
  }
  
  if (lowerError.includes('storage') || lowerError.includes('space')) {
    return FriendlyErrorMessages.STORAGE_FULL;
  }
  
  // 기본 에러 메시지
  return {
    title: '문제가 발생했어요',
    message: fallbackMessage || errorCode,
    actions: ['확인'],
    icon: '',
    severity: 'medium' };
}

/**
 * 에러 심각도에 따른 색상 반환
 */
export function getErrorColor(severity: FriendlyErrorInfo['severity']): string {
  const colors = {
    low: '#FFA94D',      // 주황
    medium: '#FF6B6B',   // 빨강
    high: '#C92A2A',     // 진한 빨강
    critical: '#8B0000', // 매우 진한 빨강
  };
  
  return colors[severity];
}

/**
 * 개발 모드에서 기술적 세부정보 포함 여부
 */
export function shouldShowTechnicalDetails(): boolean {
  return __DEV__;
}

/**
 * 에러 로깅 (개발 모드)
 */
export function logError(error: Error | string, context?: Record<string, any>): void {
  if (__DEV__) {
    console.error('[FriendlyError]', error);
    if (context) {
      console.error('[Context]', context);
    }
  }
}
