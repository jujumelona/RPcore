import { create } from 'zustand';
import { appStorage } from '../utils/storage';
import { getUnreadCount as fetchNotifUnread } from '../api/NotificationsAPI';
import { getAnnouncements as fetchAnnouncements } from '../api/AnnouncementsAPI';
import { useAuthStore } from './authStore';
import { useLanguageStore } from './languageStore';

const NOTIFICATIONS_KEY = '@notifications_list';
const ANNOUNCEMENTS_KEY = '@announcements_list';

interface NotificationBadgeState {
  unreadCount: number;
  refresh: () => Promise<void>;
  setUnreadCount: (_count: number) => void;
}

export const useNotificationBadgeStore = create<NotificationBadgeState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  refresh: async () => {
    try {
      // 1. 로컬 저장소 체크
      const notifRaw = appStorage.getString(NOTIFICATIONS_KEY);
      const announceRaw = appStorage.getString(ANNOUNCEMENTS_KEY);
      const notifs = notifRaw ? JSON.parse(notifRaw) : [];
      const announces = announceRaw ? JSON.parse(announceRaw) : [];
      let count = [...notifs, ...announces].filter((n: { isRead?: boolean }) => !n.isRead).length;

      // 2. 서버 통신 (로그인 유저인 경우만 추가 반영)
      const user = useAuthStore.getState().user;
      const appLanguage = useLanguageStore.getState().appLanguage;

      if (user) {
        try {
          const serverNotifCount = await fetchNotifUnread();
          const serverAnnounces = await fetchAnnouncements(appLanguage);
          const serverAnnounceUnread = serverAnnounces.filter(a => !a.isRead).length;
          
          // 로컬과 서버의 합집합 (서버값이 더 정확하므로 서버값을 우선순위로 하여 보정)
          count = Math.max(count, serverNotifCount + serverAnnounceUnread);
        } catch (err) {
          console.log('[NotificationBadgeStore] Server fetch failed:', err);
        }
      }

      set({ unreadCount: count });
    } catch (err) {
      console.error('[NotificationBadgeStore] Refresh failed:', err);
    }
  } }));
