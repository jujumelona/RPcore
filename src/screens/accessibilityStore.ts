/**
 * src/store/accessibilityStore.ts
 *
 * 전세계 접근성 법적 기준 준수 (WCAG 2.1 AA · ADA · EAA 2025 · 장애인차별금지법)
 *
 * 기능:
 *  - 글자 크기 배율 (0.85 / 1.0 / 1.2 / 1.4)  -> WCAG 1.4.4 (Resize Text AA)
 *  - 고대비 모드                                -> WCAG 1.4.6 (Enhanced Contrast AAA 선택 제공)
 *  - 모션 감소                                  -> WCAG 2.3.3 (Animation from Interactions AAA)
 *  - 화면 낭독기 안내 dismiss                   -> 사용자 편의
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { appStorage } from '../utils/storage';

// ─── MMKV ↔ Zustand 브릿지 ───────────────────────────────────────────────────
const mmkvStorage = {
  getItem: (key: string) => appStorage.getString(key) ?? null,
  setItem: (key: string, value: string) => appStorage.set(key, value),
  removeItem: (key: string) => appStorage.remove(key) };

// ─── 타입 ─────────────────────────────────────────────────────────────────────
export type FontScale = 0.85 | 1.0 | 1.2 | 1.4;

export interface FontScaleOption {
  value: FontScale;
  label: string;
  a11yLabel: string;
}

export const FONT_SCALE_OPTIONS: FontScaleOption[] = [
  { value: 0.85, label: 'Small',   a11yLabel: 'Font Size Small (85%)' },
  { value: 1.0,  label: 'Default', a11yLabel: 'Font Size Default (100%)' },
  { value: 1.2,  label: 'Large',   a11yLabel: 'Font Size Large (120%)' },
  { value: 1.4,  label: 'X-Large',  a11yLabel: 'Font Size X-Large (140%)' },
];

interface AccessibilityState {
  /** 앱 글자 크기 배율 — WCAG 1.4.4 */
  fontScale: FontScale;
  /** 고대비 모드 — WCAG 1.4.6 */
  highContrast: boolean;
  /** 모션 감소 — WCAG 2.3.3 */
  reduceMotion: boolean;

  setFontScale: (scale: FontScale) => void;
  setHighContrast: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      fontScale:    1.0,
      highContrast: false,
      reduceMotion: false,

      setFontScale:    (fontScale)    => set({ fontScale }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }) }),
    {
      name:    'accessibility_settings_v1',
      storage: createJSONStorage(() => mmkvStorage),
      // ✅ [FIX] Nitro/MMKV v4 대응: 자동 Hydration 비활성화
      skipHydration: true },
  ),
);

/**
 * 컴포넌트 내에서 글자 크기에 배율을 적용하는 헬퍼.
 *
 * @example
 *   const { scaledFont } = useScaledFont();
 *   <Text style={{ fontSize: scaledFont(16) }}>...</Text>
 */
export function useScaledFont() {
  const fontScale = useAccessibilityStore(s => s.fontScale);
  return {
    fontScale,
    scaledFont: (base: number) => Math.round(base * fontScale) };
}
