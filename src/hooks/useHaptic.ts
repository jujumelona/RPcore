import { useCallback, useRef } from 'react';
import { Vibration } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';

export type HapticEvent =
  | 'soft'
  | 'select'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'rigid'
  | 'success'
  | 'warning'
  | 'error'
  | 'confirm'
  | 'dismiss'
  | 'message_send'
  | 'message_arrive'
  | 'emotion_love'
  | 'reaction'
  | 'page_turn'
  | 'modal_open'
  | 'modal_close'
  | 'bookmark'
  | 'story_complete'
  | 'long_press'
  | 'swipe_action';

const PATTERNS: Record<HapticEvent, number | number[]> = {
  soft: [0, 4],
  select: [0, 7],
  light: [0, 10],
  medium: [0, 16],
  heavy: [0, 26],
  rigid: [0, 5, 11, 5],
  success: [0, 6, 52, 18],
  warning: [0, 12, 36, 12],
  error: [0, 8, 16, 8, 16, 22],
  confirm: [0, 16],
  dismiss: [0, 3],
  message_send: [0, 6, 26, 11],
  message_arrive: [0, 4],
  emotion_love: [0, 10, 72, 7],
  reaction: [0, 5, 16, 13],
  page_turn: [0, 7],
  modal_open: [0, 5, 14, 3],
  modal_close: [0, 3],
  bookmark: [0, 6, 20, 9],
  story_complete: [0, 5, 22, 9, 22, 18],
  long_press: [0, 7, 20, 14],
  swipe_action: [0, 13] };

const THROTTLE_MS = 80;
let lastTriggeredAt = 0;

function shouldThrottle(): boolean {
  const now = Date.now();
  if (now - lastTriggeredAt < THROTTLE_MS) {
    return true;
  }
  lastTriggeredAt = now;
  return false;
}

export function triggerHapticRaw(event: HapticEvent): void {
  if (shouldThrottle()) return;
  const pattern = PATTERNS[event];
  if (Array.isArray(pattern)) {
    Vibration.vibrate(pattern);
    return;
  }
  Vibration.vibrate(pattern);
}

export function triggerHapticSequence(steps: Array<HapticEvent | number>): void {
  let delay = 0;
  for (const step of steps) {
    if (typeof step === 'number') {
      delay += step;
      continue;
    }
    if (delay === 0) {
      triggerHapticRaw(step);
    } else {
      setTimeout(() => triggerHapticRaw(step), delay);
    }
  }
}

export function useHaptic() {
  const hapticEnabled = useSettingsStore(state => state.hapticEnabled);
  const lastRef = useRef(0);

  const trigger = useCallback((event: HapticEvent) => {
    if (!hapticEnabled) return;
    const now = Date.now();
    if (now - lastRef.current < THROTTLE_MS) return;
    lastRef.current = now;
    triggerHapticRaw(event);
  }, [hapticEnabled]);

  const sequence = useCallback((steps: Array<HapticEvent | number>) => {
    if (!hapticEnabled) return;
    triggerHapticSequence(steps);
  }, [hapticEnabled]);

  return { trigger, sequence };
}
