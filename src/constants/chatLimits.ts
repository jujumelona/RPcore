/**
 * src/constants/chatLimits.ts
 * 채팅 메시지 한도 관련 상수 — 단일 진실 공급원(Single Source of Truth)
 *
 * ─ DB (SQLite)        : 무제한. 모든 메시지를 영구 보관.
 * ─ MMKV (빠른 캐시)   : UI_MESSAGE_LIMIT 개로 제한 (5 MB 이내 유지).
 * ─ Zustand 메모리      : UI_MESSAGE_LIMIT 개로 제한 (MMKV와 동기화).
 * ─ UI 렌더            : UI_MESSAGE_LIMIT 개를 초과하면 자동 trim.
 * ─ 세션 복원           : DB에서 최신 SESSION_RESTORE_LIMIT 개를 로드.
 */

/** UI에 렌더링할 최대 메시지 수 (MMKV·Zustand 메모리도 동일하게 제한) */
export const UI_MESSAGE_LIMIT = 100;

/**
 * trim 발동 기준.
 * UI_MESSAGE_LIMIT 보다 약간 높게 설정해 매 메시지마다 trim이 실행되는
 * 불필요한 setState를 방지한다.
 */
export const UI_TRIM_THRESHOLD = 120;

/**
 * 앱 재시작(세션 복원) 시 DB에서 불러올 최신 메시지 수.
 * UI_MESSAGE_LIMIT 와 동일하게 유지해 복원 직후 즉시 trim이 발생하지 않도록 한다.
 */
export const SESSION_RESTORE_LIMIT = 100;

/** MMKV HEAD 캐시에 저장할 최대 메시지 수 (5 MB 한도 고려) */
export const MMKV_MSG_LIMIT = 100;
