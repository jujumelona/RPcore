﻿// src/utils/haptics.ts
// ✅ v4 — Android 전용 · 컴포넌트 외부용 유틸리티
//
//  컴포넌트 내부 -> useHaptic() hook 사용 (권장)
//  컴포넌트 외부 (이벤트 핸들러, 스토어 액션 등) -> 이 파일 사용

import { triggerHapticRaw,
  triggerHapticSequence,
  type HapticEvent } from '../hooks/useHaptic';
import { useSettingsStore } from '../store/settingsStore';

export { HapticEvent };

export function triggerHaptic(type: HapticEvent = 'select'): void {
  const enabled = useSettingsStore.getState().hapticEnabled;
  if (!enabled) return;
  triggerHapticRaw(type);
}

export function hapticSequence(steps: Array<HapticEvent | number>): void {
  const enabled = useSettingsStore.getState().hapticEnabled;
  if (!enabled) return;
  triggerHapticSequence(steps);
}

// 자주 쓰이는 복합 패턴 프리셋
export const HapticPresets = {
  deleteConfirm: () => hapticSequence(['warning', 120, 'error']),
  loginSuccess:  () => hapticSequence(['medium',  80, 'success']),
  chapterEnd:    () => hapticSequence(['page_turn', 150, 'story_complete']),
  unlock:        () => hapticSequence(['rigid', 60, 'success']) } as const;
