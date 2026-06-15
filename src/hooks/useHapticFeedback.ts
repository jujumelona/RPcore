// src/hooks/useHapticFeedback.ts
// ══════════════════════════════════════════════════════════════
// 햅틱 피드백 훅
// 사용자 인터랙션에 촉각 피드백 제공
// ══════════════════════════════════════════════════════════════

import { useCallback } from 'react';
import { Vibration } from 'react-native';

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/**
 * 햅틱 피드백 훅
 *
 * @example
 * const { trigger } = useHapticFeedback();
 *
 * <TouchableOpacity onPress={() => {
 *   trigger('light');
 *   handlePress();
 * }}>
 */
export function useHapticFeedback() {
  const trigger = useCallback((type: HapticType = 'light') => {
    try {
      switch (type) {
        case 'light':
          Vibration.vibrate(10);
          break;
        case 'medium':
          Vibration.vibrate(20);
          break;
        case 'heavy':
          Vibration.vibrate(40);
          break;
        case 'success':
          Vibration.vibrate([0, 10, 50, 10]);
          break;
        case 'warning':
          Vibration.vibrate([0, 20, 50, 20]);
          break;
        case 'error':
          Vibration.vibrate([0, 30, 50, 30]);
          break;
      }
    } catch (error) {
      // 햅틱을 지원하지 않는 기기에서는 무시
      console.warn('[Haptic] Failed to trigger haptic feedback:', error);
    }
  }, []);

  const selection = useCallback(() => {
    try {
      Vibration.vibrate(5);
    } catch (error) {
      console.warn('[Haptic] Failed to trigger selection feedback:', error);
    }
  }, []);

  return {
    trigger,
    selection,
    light: () => trigger('light'),
    medium: () => trigger('medium'),
    heavy: () => trigger('heavy'),
    success: () => trigger('success'),
    warning: () => trigger('warning'),
    error: () => trigger('error') };
}
