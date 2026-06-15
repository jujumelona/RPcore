// src/core/llama/EngineEventBus.ts
// ════════════════════════════════════════════════════════════════════
// 네이티브 엔진 ↔ React 단방향 이벤트 버스
//
// 설계 원칙:
//   · LlamaEngine은 UI를 전혀 알지 못함
//   · 상태 변화 시 DeviceEventEmitter로 이벤트만 발송(Push)
//   · Zustand 스토어가 이벤트를 수신해 상태 업데이트 (한 번만 등록)
//   · UI 컴포넌트는 스토어만 구독 -> 엔진 직접 참조 불필요
//
// 이벤트 목록:
//   ENGINE_STATE_CHANGED   — EngineState 변화 (loading/warming/ready 등)
//   ENGINE_OOM_WARNING     — 메모리 임박 경고 (사전 쓰로틀링 트리거)
//   ENGINE_ERROR           — C++ 레벨 크래시 / 복구 불가 에러
//   ENGINE_SOFT_RESET      — KV Cache 초기화 시작 (UI 스켈레톤 표시용)
//   ENGINE_SOFT_RESET_DONE — KV Cache 초기화 완료
//   ENGINE_CACHE_CORRUPTED — KV 캐시 파일 손상 감지 -> UI 재다운로드 안내
// ════════════════════════════════════════════════════════════════════

import { DeviceEventEmitter, EmitterSubscription } from 'react-native';
import type { EngineState } from './EngineTypes';

// ── 이벤트 이름 상수 ──────────────────────────────────────────────

export const ENGINE_EVENTS = {
  STATE_CHANGED:     'engine:state_changed',
  OOM_WARNING:       'engine:oom_warning',
  ERROR:             'engine:error',
  SOFT_RESET:        'engine:soft_reset',
  SOFT_RESET_DONE:   'engine:soft_reset_done',
  CACHE_CORRUPTED:   'engine:cache_corrupted' } as const;

export type EngineEventName = typeof ENGINE_EVENTS[keyof typeof ENGINE_EVENTS];

// ── 이벤트 페이로드 타입 ──────────────────────────────────────────

export interface EngineStateChangedPayload {
  state: EngineState;
}

export interface EngineOomWarningPayload {
  availMB:  number;
  totalMB:  number;
  /** 기기 전체 RAM 사용률 (0-100) */
  systemUsagePct: number;
}

export interface EngineErrorPayload {
  message: string;
  isFatal: boolean;
}

export interface EngineCacheCorruptedPayload {
  /** 손상된 파일 종류: 'session' | 'base' | 'chapter' */
  cacheType: 'session' | 'base' | 'chapter';
  /** 모델 ID (필수) — 자동 재다운로드 시 식별용 */
  modelId: string;
  /** 관련 스토리 ID (있는 경우) */
  storyId?: string;
  /** 챕터 인덱스 (chapter 타입인 경우) */
  chapterIdx?: number;
}

// ── 이벤트 발송 (엔진 레이어에서 호출) ───────────────────────────

export const engineBus = {
  emitStateChanged(state: EngineState): void {
    DeviceEventEmitter.emit(ENGINE_EVENTS.STATE_CHANGED, { state } as EngineStateChangedPayload);
  },

  emitOomWarning(availMB: number, totalMB: number): void {
    // [BUG-ITEM57 FIX] usagePct를 systemUsagePct로 명확히 함
    // [BUG FIX] availMB > totalMB인 경우 음수 방지
    const systemUsagePct = totalMB > 0
      ? Math.max(0, Math.round(((totalMB - availMB) / totalMB) * 100))
      : 0;
    DeviceEventEmitter.emit(ENGINE_EVENTS.OOM_WARNING, { availMB, totalMB, systemUsagePct } as EngineOomWarningPayload);
  },

  emitError(message: string, isFatal = false): void {
    DeviceEventEmitter.emit(ENGINE_EVENTS.ERROR, { message, isFatal } as EngineErrorPayload);
  },

  emitSoftReset(): void {
    DeviceEventEmitter.emit(ENGINE_EVENTS.SOFT_RESET, {});
  },

  emitSoftResetDone(): void {
    DeviceEventEmitter.emit(ENGINE_EVENTS.SOFT_RESET_DONE, {});
  },

  /**
   * KV 캐시 파일 손상 감지 알림
   * KVStateManager.loadBase() / loadChapter() 에서 손상 파일 삭제 후 발송
   * -> UI에서 "캐시가 손상되었습니다. 재다운로드가 필요합니다." 안내 가능
   */
  emitCacheCorrupted(payload: EngineCacheCorruptedPayload): void {
    DeviceEventEmitter.emit(ENGINE_EVENTS.CACHE_CORRUPTED, payload as EngineCacheCorruptedPayload);
  } };

// ── 이벤트 수신 헬퍼 (스토어 / 훅에서 사용) ──────────────────────

export const engineBusListener = {
  onStateChanged(fn: (p: EngineStateChangedPayload) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(ENGINE_EVENTS.STATE_CHANGED, fn);
  },

  onOomWarning(fn: (p: EngineOomWarningPayload) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(ENGINE_EVENTS.OOM_WARNING, fn);
  },

  onError(fn: (p: EngineErrorPayload) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(ENGINE_EVENTS.ERROR, fn);
  },

  onSoftReset(fn: () => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(ENGINE_EVENTS.SOFT_RESET, fn);
  },

  onSoftResetDone(fn: () => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(ENGINE_EVENTS.SOFT_RESET_DONE, fn);
  },

  /**
   * KV 캐시 손상 이벤트 수신
   * UI에서 재다운로드 버튼 표시 또는 자동 재다운로드 트리거에 사용
   */
  onCacheCorrupted(fn: (p: EngineCacheCorruptedPayload) => void): EmitterSubscription {
    return DeviceEventEmitter.addListener(ENGINE_EVENTS.CACHE_CORRUPTED, fn);
  } };
