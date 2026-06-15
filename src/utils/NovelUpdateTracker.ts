/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/NovelUpdateTracker.ts
// ═══════════════════════════════════════════════════════════════════
// Tachiyomi Library Update 패턴 이식
// — 라이브러리 내 소설의 신규 챕터 주기적 체크
//
// ✅ 주기적 업데이트 체크 (최소 30분 간격)
// ✅ 미읽은 챕터 배지 카운터
// ✅ 마지막 체크 시간 기록
// ✅ 소설별 업데이트 상태 추적
// ✅ Notifee 알림 연동 준비
// ✅ Zustand + MMKV persist
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from './mmkvZustandStorage';
import { authedFetch } from './authedFetch';

// ── Types ──────────────────────────────────────────────────────────

export interface NovelUpdateInfo {
  novelId: string;
  title: string;
  lastReadChapter: number;
  totalChapters: number;
  /** 새 챕터 수 (totalChapters - lastReadChapter) */
  unreadCount: number;
  lastCheckedAt: number;
  lastUpdatedAt: number;
  /** 새 챕터가 있을 때 true */
  hasUpdate: boolean;
}

interface NovelUpdateState {
  /** 소설별 업데이트 정보 */
  updates: Record<string, NovelUpdateInfo>;
  /** 전체 미읽은 챕터 수 */
  totalUnreadCount: number;
  /** 업데이트 체크 진행 중 */
  isChecking: boolean;
  /** 마지막 전체 체크 시간 */
  lastGlobalCheckAt: number;

  // actions
  checkUpdates: (_novelIds?: string[]) => Promise<void>;
  markAsRead: (_novelId: string, _chapterIndex: number) => void;
  markAllAsRead: (_novelId: string) => void;
  removeNovel: (_novelId: string) => void;
  addToLibrary: (_novel: { novelId: string; title: string; totalChapters: number }) => void;
  getUnreadCount: (_novelId: string) => number;
  getNovelsWithUpdates: () => NovelUpdateInfo[];
}

// ── Constants ─────────────────────────────────────────────────────

const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분
const mmkvStorage = createMMKVStorage({ id: 'novel-updates' });

// ── Store ─────────────────────────────────────────────────────────

export const useNovelUpdateStore = create<NovelUpdateState>()(
  persist(
    (set, get) => ({
      updates: {},
      totalUnreadCount: 0,
      isChecking: false,
      lastGlobalCheckAt: 0,

      checkUpdates: async (novelIds?: string[]) => {
        const state = get();
        const now = Date.now();

        // 최소 간격 방어
        if (now - state.lastGlobalCheckAt < MIN_CHECK_INTERVAL_MS) {
          return;
        }

        const idsToCheck = novelIds ?? Object.keys(state.updates);
        if (idsToCheck.length === 0) return;

        set({ isChecking: true });

        try {
          // 배치 요청으로 서버 부하 최소화
          const resp = await authedFetch('/webnovel/updates/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ novelIds: idsToCheck }) });

          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

          const data = await resp.json();
          const serverUpdates: Array<{
            novelId: string;
            totalChapters: number;
            lastUpdatedAt: number;
          }> = data.updates ?? [];

          set(s => {
            const updates = { ...s.updates };
            let totalUnread = 0;

            for (const su of serverUpdates) {
              const existing = updates[su.novelId];
              if (existing) {
                const newTotal = su.totalChapters;
                const unreadCount = Math.max(0, newTotal - existing.lastReadChapter);
                updates[su.novelId] = {
                  ...existing,
                  totalChapters: newTotal,
                  unreadCount,
                  hasUpdate: newTotal > existing.totalChapters,
                  lastCheckedAt: now,
                  lastUpdatedAt: su.lastUpdatedAt };
              }
            }

            // 전체 미읽은 수 재계산
            for (const u of Object.values(updates)) {
              totalUnread += u.unreadCount;
            }

            return {
              updates,
              totalUnreadCount: totalUnread,
              lastGlobalCheckAt: now };
          });

          // ✅ 새 챕터가 있는 소설에 Notifee 알림 발송
          const novelsWithNewChapters = serverUpdates
            .filter(su => {
              const prev = state.updates[su.novelId];
              return prev && su.totalChapters > prev.totalChapters;
            })
            .map(su => ({
              novelId: su.novelId,
              title: state.updates[su.novelId]?.title || '소설',
              totalChapters: su.totalChapters }));

          if (novelsWithNewChapters.length > 0) {
            // 순환 의존 방지를 위한 dynamic import
            import('../services/NotificationService').then(({ notificationService }) => {
              if (novelsWithNewChapters.length === 1) {
                const novel = novelsWithNewChapters[0];
                notificationService.displayLocal({
                  type: 'story_update',
                  title: '새 챕터 업데이트',
                  body: `"${novel.title}"의 새 챕터가 올라왔습니다!`,
                  data: {
                    storyId: novel.novelId,
                    targetScreen: 'StoryDetail' } });
              } else {
                notificationService.displayLocal({
                  type: 'story_update',
                  title: '소설 업데이트 알림',
                  body: `${novelsWithNewChapters.length}개의 소설에 새 챕터가 추가되었습니다.`,
                  data: {
                    targetScreen: 'Notifications' } });
              }
            }).catch(err => {
              if (__DEV__) console.warn('[NovelUpdateTracker] Notification failed:', err);
            });
          }
        } catch (e) {
          if (__DEV__) console.warn('[NovelUpdateTracker] check failed:', e);
        } finally {

          set({ isChecking: false });
        }
      },

      markAsRead: (novelId, chapterIndex) => {
        set(s => {
          const existing = s.updates[novelId];
          if (!existing) return s;
          const lastRead = Math.max(existing.lastReadChapter, chapterIndex);
          const unreadCount = Math.max(0, existing.totalChapters - lastRead);
          const updates = {
            ...s.updates,
            [novelId]: {
              ...existing,
              lastReadChapter: lastRead,
              unreadCount,
              hasUpdate: unreadCount > 0 } };
          return {
            updates,
            totalUnreadCount: Object.values(updates).reduce(
              (sum, u) => sum + u.unreadCount, 0,
            ) };
        });
      },

      markAllAsRead: (novelId) => {
        set(s => {
          const existing = s.updates[novelId];
          if (!existing) return s;
          const updates = {
            ...s.updates,
            [novelId]: {
              ...existing,
              lastReadChapter: existing.totalChapters,
              unreadCount: 0,
              hasUpdate: false } };
          return {
            updates,
            totalUnreadCount: Object.values(updates).reduce(
              (sum, u) => sum + u.unreadCount, 0,
            ) };
        });
      },

      removeNovel: (novelId) => {
        set(s => {
          const newUpdates = { ...s.updates };
          delete newUpdates[novelId];
          return {
            updates: newUpdates,
            totalUnreadCount: Object.values(newUpdates).reduce(
              (sum, u) => sum + u.unreadCount, 0,
            ) };
        });
      },

      addToLibrary: (novel) => {
        set(s => ({
          updates: {
            ...s.updates,
            [novel.novelId]: {
              novelId: novel.novelId,
              title: novel.title,
              lastReadChapter: 0,
              totalChapters: novel.totalChapters,
              unreadCount: novel.totalChapters,
              lastCheckedAt: Date.now(),
              lastUpdatedAt: Date.now(),
              hasUpdate: novel.totalChapters > 0 } } }));
      },

      getUnreadCount: (novelId) => get().updates[novelId]?.unreadCount ?? 0,

      getNovelsWithUpdates: () =>
        Object.values(get().updates)
          .filter(u => u.hasUpdate)
          .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt) }),
    {
      name: 'novel-updates-v1',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({
        updates: s.updates,
        totalUnreadCount: s.totalUnreadCount,
        lastGlobalCheckAt: s.lastGlobalCheckAt }) },
  ),
);
