// src/store/notificationPreferences.ts
// ═══════════════════════════════════════════════════════════════════
//  Bluesky notification preferences 패턴 이식
//  — 카테고리별 알림 on/off + DND(방해금지) 시간대 설정
//
//  ✅ Zustand + MMKV persist
//  ✅ 카테고리별 토글
//  ✅ DND 시간대 (디바이스 timezone 자동 반영)
//  ✅ 나라별 타임존 — Intl.DateTimeFormat으로 현지 시간 자동 계산
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from '../utils/mmkvZustandStorage';

// ── Types ──────────────────────────────────────────────────────────

export type NotifCategory =
  | 'new_follower'
  | 'like'
  | 'comment'
  | 'mention'
  | 'story_update'
  | 'chapter_release'
  | 'system';

export interface DNDSchedule {
  enabled: boolean;
  /** 시작 시간 (HH:mm 형식, 현지 시간) */
  startTime: string;
  /** 종료 시간 (HH:mm 형식, 현지 시간) */
  endTime: string;
}

interface NotificationPrefsState {
  /** 전체 알림 on/off */
  globalEnabled: boolean;
  /** 카테고리별 on/off */
  categories: Record<NotifCategory, boolean>;
  /** DND 스케줄 */
  dnd: DNDSchedule;

  // actions
  setGlobalEnabled: (_v: boolean) => void;
  toggleCategory: (_cat: NotifCategory) => void;
  setCategoryEnabled: (_cat: NotifCategory, _v: boolean) => void;
  setDND: (_schedule: Partial<DNDSchedule>) => void;
}

// ── DND Helper ────────────────────────────────────────────────────

/**
 * 현재 디바이스의 로컬 시간이 DND 범위 안인지 체크
 * — Intl API로 디바이스 timezone 자동 반영하므로 나라별 별도 설정 불필요
 */
export function isInDNDWindow(dnd: DNDSchedule): boolean {
  if (!dnd.enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = dnd.startTime.split(':').map(Number);
  const [endH, endM] = dnd.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // 자정을 넘는 경우 (예: 22:00 ~ 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * 특정 카테고리의 알림을 표시해야 하는지 체크
 */
export function shouldShowNotification(
  state: Pick<NotificationPrefsState, 'globalEnabled' | 'categories' | 'dnd'>,
  category: NotifCategory,
): boolean {
  if (!state.globalEnabled) return false;
  if (!state.categories[category]) return false;
  if (isInDNDWindow(state.dnd)) return false;
  return true;
}

// ── Store ─────────────────────────────────────────────────────────

const mmkvStorage = createMMKVStorage({ id: 'notification-prefs' });

export const useNotificationPrefs = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      globalEnabled: true,
      categories: {
        new_follower: true,
        like: true,
        comment: true,
        mention: true,
        story_update: true,
        chapter_release: true,
        system: true },
      dnd: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00' },

      setGlobalEnabled: (v) => set({ globalEnabled: v }),

      toggleCategory: (cat) =>
        set(s => ({
          categories: { ...s.categories, [cat]: !s.categories[cat] } })),

      setCategoryEnabled: (cat, v) =>
        set(s => ({
          categories: { ...s.categories, [cat]: v } })),

      setDND: (schedule) =>
        set(s => ({
          dnd: { ...s.dnd, ...schedule } })) }),
    {
      name: 'notification-prefs-v1',
      storage: createJSONStorage(() => mmkvStorage) },
  ),
);
