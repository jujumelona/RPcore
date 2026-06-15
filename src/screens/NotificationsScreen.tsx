// src/screens/NotificationsScreen.tsx — FIXED v4
// ✅ [FIX 1] ScreenProps import 추가
// ✅ [FIX 2] RightAction height:'100%' — 카드 높이만큼 스와이프 영역 확보
// ✅ [FIX 3] rightThreshold:40 — 좀 더 자연스러운 삭제 인식 거리
// ✅ [FIX 4] 헤더 레이아웃 안정화 (readAllBtn spacer)
// ✅ [FIX 11] 꾹눌러 다중선택 삭제 모드 추가
// ✅ [FIX 12] 닫기 버튼 inset 적용 — 네비게이션바 겹침 해결

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, Modal, ScrollView,
  TouchableWithoutFeedback } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  interpolate,
  SharedValue
  } from 'react-native-reanimated';
import { appStorage } from '../utils/storage';
import { Radius, Typography } from '../constants/tokens';
import { EmptyState } from '../components/EmptyState';
import { useLanguageStore } from '../store/languageStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../store/authStore';
// ✅ [FIX] 서버 API 연동
import { getAnnouncements as getServerAnnouncements, markAnnouncementRead, markAllAnnouncementsRead } from '../api/AnnouncementsAPI';
import { getNotifications as fetchNotifications, markAsRead as serverMarkAsRead, markAllAsRead as serverMarkAllAsRead, deleteNotification as serverDeleteNotification, bulkDeleteNotifications as serverBulkDeleteNotifications } from '../api/NotificationsAPI';
import { ArrowLeft, Bell, Check, Circle, CircleCheckBig, Megaphone, Sparkles, Trash2, X } from 'lucide-react-native';
import type { ScreenProps } from '../types/navigation';
import { getScreenTranslations } from '../i18n/SCREENS-TRANSLATION';
import { triggerHaptic } from '../utils/haptics';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TabType = 'notification' | 'announcement';

interface NotifItem {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  isRead: boolean;
  type: TabType;
  link?: string;
}

const NOTIFICATIONS_KEY = '@notifications_list';
const ANNOUNCEMENTS_KEY = '@announcements_list';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseServerDate(dateStr: string | undefined): number {
  if (!dateStr) return Date.now();
  try {
    // [BUG FIX] 서버 날짜(UTC)가 타임존 없이 오면 클라이언트(KST 등)가 현지 시간으로 오인해 9시간 오차 발생
    // ISO 형식으로 정규화(공백->T)하고 타임존이 없으면 Z를 붙여 UTC로 강제 지정
    let normalized = dateStr.replace(' ', 'T');
    if (!normalized.includes('Z') && !normalized.includes('+')) {
      normalized += 'Z';
    }
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? new Date(dateStr).getTime() : d.getTime();
  } catch {
    return Date.now();
  }
}

function formatTime(ts: number, t: Record<string, string | undefined>): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) {
    return t?.timeJustNow ?? t?.timeJustNowShort ?? new Date(ts).toLocaleTimeString();
  }
  if (diff < 3600) {
    const template = t?.timeMinAgo ?? t?.timeMinAgoShort;
    return template ? template.replace('{n}', String(Math.floor(diff / 60))) : new Date(ts).toLocaleDateString();
  }
  if (diff < 86400) {
    const template = t?.timeHourAgo ?? t?.timeHourAgoShort;
    return template ? template.replace('{n}', String(Math.floor(diff / 3600))) : new Date(ts).toLocaleDateString();
  }
  if (diff < 86400 * 7) {
    const template = t?.timeDayAgo ?? t?.timeDayAgoShort;
    return template ? template.replace('{n}', String(Math.floor(diff / 86400))) : new Date(ts).toLocaleDateString();
  }
  return new Date(ts).toLocaleDateString();
}

function formatSelectedCountLabel(count: number, t: Record<string, string | undefined>): string {
  return (t?.itemsSelected ?? '{n}').replace('{n}', String(count));
}

function formatUnreadCountLabel(count: number): string {
  return count > 99 ? `${String(99)}+` : String(count);
}

function getDefaultNotifications(_t: Record<string, string | undefined>): NotifItem[] {
  return [];
}

function getDefaultAnnouncements(_t: Record<string, string | undefined>): NotifItem[] {
  return [];
}

function loadItems(key: string, defaults: () => NotifItem[]): NotifItem[] {
  try {
    const raw = appStorage.getString(key);
    if (raw) return JSON.parse(raw);
    const d = defaults();
    appStorage.set(key, JSON.stringify(d));
    return d;
  } catch { return defaults(); }
}

function saveItems(key: string, items: NotifItem[]): void {
  try { appStorage.set(key, JSON.stringify(items)); } catch (e) { if (__DEV__) console.warn(`[NotificationsScreen] ignored error:`, e); }
}

export async function pushNotification(title: string, body: string): Promise<void> {
  try {
    const items = loadItems(NOTIFICATIONS_KEY, () => []);
    const newItem: NotifItem = {
      id: `n_${Date.now()}`, title, body,
      timestamp: Date.now(), isRead: false, type: 'notification'
  };
    saveItems(NOTIFICATIONS_KEY, [newItem, ...items]);
  } catch (e) { if (__DEV__) console.warn(`[NotificationsScreen] ignored error:`, e); }
}

// ─────────────────────────────────────────────────────────────
// ✅ [FIX 2] RightAction — height:'100%' 로 카드 전체 높이 확보
// ─────────────────────────────────────────────────────────────

function RightAction({
  prog, onDelete, deleteLabel
  }: {
  prog: SharedValue<number>;
  drag: SharedValue<number>;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const animStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(prog.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(prog.value, [0, 1], [0.75, 1]) }]
  }));

  return (
    <Animated.View style={[s.swipeActionWrap, animStyle]}>
      <TouchableOpacity
        style={s.swipeDeleteBtn}
        onPress={onDelete}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={deleteLabel}
        accessibilityRole="button"
      >
        <Trash2 size={19} color="#FFF" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// NotifCard
// ─────────────────────────────────────────────────────────────

const NotifCard = React.memo(function NotifCard({
  item, onPress, onLongPress, onDelete, selected, selectMode, t
  }: {
  item: NotifItem;
  onPress:     (id: string) => void;
  onLongPress: (id: string) => void;
  onDelete:    (id: string) => void;
  selected:    boolean;
  selectMode:  boolean;
  t: Record<string, string | undefined>;
}) {
  const handleDelete = useCallback(() => {
    onDelete(item.id);
  }, [item.id, onDelete]);

  const card = (
    <TouchableOpacity
      style={[s.card, !item.isRead && s.cardUnread, selected && s.cardSelected]}
      onPress={() => onPress(item.id)}
      onLongPress={() => onLongPress(item.id)}
      delayLongPress={400}
      activeOpacity={0.88}
    >
      {!item.isRead && !selectMode && <View style={s.unreadDot} />}

      <View style={s.cardContent}>
        <Text
          style={[s.cardTitle, !item.isRead && s.cardTitleUnread]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text style={s.cardBody} numberOfLines={3}>{item.body}</Text>
        <Text style={s.cardTime}>{formatTime(item.timestamp, t)}</Text>
      </View>

      {/* [FIX #11] 선택 모드: 체크 아이콘, 일반 모드: 읽음 체크 */}
      {selectMode ? (
        <View style={s.cardCheckWrap}>
          {selected
            ? <CircleCheckBig size={20} color={'#D4A853'} />
            : <Circle size={20} color={'#4A4A62'} />
          }
        </View>
      ) : (
        item.isRead && <Check size={13} color={'#757585'} style={styles._marginTop} />
      )}
    </TouchableOpacity>
  );

  // 선택 모드일 때는 스와이프 비활성화
  if (selectMode) return card;

  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={(prog, drag) => (
        <RightAction
          prog={prog}
          drag={drag}
          onDelete={handleDelete}
          deleteLabel={t?.delete ?? ''}
        />
      )}
    >
      {card}
    </ReanimatedSwipeable>
  );
});

// ─────────────────────────────────────────────────────────────
// NotificationsScreen
// ─────────────────────────────────────────────────────────────

export function NotificationsScreen({ navigation }: ScreenProps<'Notifications'>) {
  const { t, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })));
  const insets = useSafeAreaInsets();
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage as never), [appLanguage]);

  const [activeTab,       setActiveTab]       = useState<TabType>('notification');
  const [notifications,   setNotifications]   = useState<NotifItem[]>([]);
  const [announcements,   setAnnouncements]   = useState<NotifItem[]>([]);
  const [detailItem,      setDetailItem]      = useState<NotifItem | null>(null);
  // [FIX #11] 다중선택 상태
  const [selectMode,      setSelectMode]      = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const isLoggedIn = useAuthStore(s => !!s.user);

  // ✅ [FIX] 초기 로드: 로컬 캐시 먼저 -> 서버에서 최신 데이터 fetch
  useEffect(() => {
    // [BUG FIX] t가 언어 스토어 rehydrate 전 undefined일 수 있음
    // t가 준비된 후 호출되도록 t를 현재 시점에서 가져와 fallback 처리
    const currentT = t ?? {} as Record<string, string | undefined>;
    setNotifications(loadItems(NOTIFICATIONS_KEY, () => getDefaultNotifications(currentT)));
    setAnnouncements(loadItems(ANNOUNCEMENTS_KEY, () => getDefaultAnnouncements(currentT)));
    let cancelled = false;

    if (isLoggedIn) {
      // 서버 알림 fetch
      fetchNotifications(appLanguage).then(serverNotifs => {
        if (cancelled) return;
        const mapped = serverNotifs.map(n => ({
          id: String(n.id), title: n.title ?? '', body: n.body ?? '',
          timestamp: parseServerDate(n.createdAt),
          isRead: !!n.isRead, type: 'notification' as const }));
        
        setNotifications(prev => {
          const mergedMap = new Map();
          prev.forEach(p => mergedMap.set(p.id, p));
          mapped.forEach(m => mergedMap.set(m.id, m));
          const merged = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);
          saveItems(NOTIFICATIONS_KEY, merged);
          return merged;
        });
      }).catch(e => {
        if (__DEV__) console.warn('[NotificationsScreen] fetchNotifications failed:', e);
      });

      // 서버 공지 fetch
      getServerAnnouncements(appLanguage).then(serverAnnounces => {
        if (cancelled) return;
        const mapped = serverAnnounces.map(a => ({
          id: String(a.id), title: a.title, body: a.body,
          timestamp: parseServerDate(a.createdAt),
          isRead: !!a.isRead, type: 'announcement' as const }));
        
        setAnnouncements(prev => {
          const mergedMap = new Map();
          prev.forEach(p => mergedMap.set(p.id, p));
          mapped.forEach(m => mergedMap.set(m.id, m));
          const merged = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);
          saveItems(ANNOUNCEMENTS_KEY, merged);
          return merged;
        });
      }).catch(e => {
        if (__DEV__) console.warn('[NotificationsScreen] getServerAnnouncements failed:', e);
      });
    }
    return () => { cancelled = true; };
  }, [t, isLoggedIn, appLanguage]);

  const data        = activeTab === 'notification' ? notifications : announcements;
  const unreadInTab = data.filter(d => !d.isRead).length;

  // 읽음 처리
  const markAsRead = useCallback((id: string) => {
    if (activeTab === 'notification') {
      const updated = notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
      setNotifications(updated);
      saveItems(NOTIFICATIONS_KEY, updated);
      if (isLoggedIn) serverMarkAsRead(id).catch(() => {});  // ✅ [FIX] 서버 동기화
    } else {
      const updated = announcements.map(n => n.id === id ? { ...n, isRead: true } : n);
      setAnnouncements(updated);
      saveItems(ANNOUNCEMENTS_KEY, updated);
      if (isLoggedIn) markAnnouncementRead(id).catch(() => {});  // ✅ [FIX] 서버 동기화
    }
  }, [activeTab, notifications, announcements, isLoggedIn]);

  // 카드 탭 -> 읽음 처리 + 디테일 열기
  const handlePress = useCallback((id: string) => {
    const allItems = activeTab === 'notification' ? notifications : announcements;
    const found = allItems.find(n => n.id === id);
    if (found) setDetailItem(found);
    markAsRead(id);
  }, [activeTab, notifications, announcements, markAsRead]);

  // 모두 읽음
  // ✅ [BUG FIX] markAllRead — 서버 동기화 누락
  // 기존: 로컬 상태만 업데이트, 서버엔 반영 안 됨 -> 재접속 시 읽음 상태 초기화
  const markAllRead = useCallback(() => {
    if (activeTab === 'notification') {
      const updated = notifications.map(n => ({ ...n, isRead: true }));
      setNotifications(updated);
      saveItems(NOTIFICATIONS_KEY, updated);
      if (isLoggedIn) serverMarkAllAsRead().catch(() => {}); // ✅ 서버 동기화
    } else {
      const updated = announcements.map(n => ({ ...n, isRead: true }));
      setAnnouncements(updated);
      saveItems(ANNOUNCEMENTS_KEY, updated);
      // ✅ [BUG FIX] triple dynamic import 제거 -> markAllAnnouncementsRead 직접 호출
      if (isLoggedIn) markAllAnnouncementsRead().catch(() => {});
    }
  }, [activeTab, notifications, announcements, isLoggedIn]);

  // 삭제
  const handleDelete = useCallback((id: string) => {
    if (activeTab === 'notification') {
      const updated = notifications.filter(n => n.id !== id);
      setNotifications(updated);
      saveItems(NOTIFICATIONS_KEY, updated);
      if (isLoggedIn) serverDeleteNotification(id).catch(() => {}); // ✅ [FIX] 서버 동기화
    } else {
      const updated = announcements.filter(n => n.id !== id);
      setAnnouncements(updated);
      saveItems(ANNOUNCEMENTS_KEY, updated);
    }
  }, [activeTab, notifications, announcements, isLoggedIn]);

  // [FIX #11] 다중선택 모드 핸들러
  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const tabData = activeTab === 'notification' ? notifications : announcements;
    setSelectedIds(new Set(tabData.map(n => n.id)));
  }, [activeTab, notifications, announcements]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const idsArray = Array.from(selectedIds);
    if (activeTab === 'notification') {
      const updated = notifications.filter(n => !selectedIds.has(n.id));
      setNotifications(updated);
      saveItems(NOTIFICATIONS_KEY, updated);
      if (isLoggedIn) serverBulkDeleteNotifications(idsArray).catch(() => {}); // ✅ [FIX] 서버 동기화
    } else {
      const updated = announcements.filter(n => !selectedIds.has(n.id));
      setAnnouncements(updated);
      saveItems(ANNOUNCEMENTS_KEY, updated);
    }
    exitSelectMode();
  }, [activeTab, notifications, announcements, selectedIds, exitSelectMode, isLoggedIn]);

  const renderNotifItem = useCallback(
    ({ item }: { item: NotifItem }) => (
      <NotifCard
        item={item}
        onPress={() => {
          if (selectMode) { triggerHaptic('select'); toggleSelectId(item.id); return; }
          triggerHaptic('select'); handlePress(item.id);
        }}
        onLongPress={() => { triggerHaptic('medium'); enterSelectMode(item.id); }}
        onDelete={handleDelete}
        selected={selectMode && selectedIds.has(item.id)}
        selectMode={selectMode}
        t={t}
      />
    ),
    [handlePress, handleDelete, enterSelectMode, toggleSelectId, selectMode, selectedIds, t],
  );

  const TABS = [
    { id: 'notification' as TabType, label: t?.tabNotification ?? '' },
    { id: 'announcement' as TabType, label: t?.tabAnnouncement ?? '' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} translucent={false} />

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      {selectMode ? (
        /* [FIX #11] 다중선택 모드 헤더 */
        <View style={s.selectHeader}>
          <TouchableOpacity style={s.backBtn} onPress={exitSelectMode} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <X size={22} color={'#C8C8D4'} />
          </TouchableOpacity>
          <Text style={s.selectHeaderTitle}>{formatSelectedCountLabel(selectedIds.size, t)}</Text>
          <TouchableOpacity style={s.selectAllBtn} onPress={selectAll} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <Text style={s.selectAllTxt}>{screenT.selectAllLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={screenT.a11yBack}
            accessibilityRole="button"
          >
            <ArrowLeft size={22} color={'#C8C8D4'} />
          </TouchableOpacity>

          <Text style={s.headerTitle}>{t?.tabNotification ?? ''}</Text>

          {unreadInTab > 0 ? (
            <TouchableOpacity
              onPress={() => { triggerHaptic('light'); markAllRead(); }}
              style={s.readAllBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t?.notifReadAll ?? ''}
              accessibilityRole="button"
            >
              <Text style={s.readAllText}>{t?.notifReadAll ?? ''}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.readAllBtn} />
          )}
        </View>
      )}

      {/* ── 탭 (선택모드 아닐 때만) ─────────────────────────── */}
      {!selectMode && (
        <View style={s.tabRow}>
          {TABS.map(tab => {
            const cnt      = (tab.id === 'notification' ? notifications : announcements).filter(n => !n.isRead).length;
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={s.tabItem}
                onPress={() => setActiveTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
              >
                <View style={s.tabLabelRow}>
                  {tab.id === 'notification'
                    ? <Bell      size={15} color={isActive ? '#D4A853' : '#797990'} />
                    : <Megaphone size={15} color={isActive ? '#D4A853' : '#797990'} />
                  }
                  <Text style={[s.tabText, isActive && s.tabActive]}>{tab.label}</Text>
                  {cnt > 0 && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{formatUnreadCountLabel(cnt)}</Text>
                    </View>
                  )}
                </View>
                {isActive && <View style={s.tabUnder} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── 리스트 ───────────────────────────────────────────── */}
      {data.length === 0 ? (
        <EmptyState
          type="empty"
          title={activeTab === 'notification' ? (t?.noNotifications ?? '') : (t?.noAnnouncements ?? '')}
          subtitle={t?.notifEmptySub ?? ''}
        />
      ) : (
        <FlashList
          data={data}
          renderItem={renderNotifItem}
          estimatedItemSize={100}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
      {/* ── 디테일 모달 ──────────────────────────────────────── */}
      <Modal
        visible={!!detailItem}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailItem(null)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={() => setDetailItem(null)}>
          <View style={s.detailOverlay}>
            <View style={styles.overlayBg} />
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={s.detailSheet}>
                <View style={[StyleSheet.absoluteFill, s.sheetOverlay]} />

                {/* 상단 핸들 */}
                <View style={s.detailHandle} />

                {/* 타입 뱃지 */}
                <View style={s.detailTypeBadge}>
                  {detailItem?.type === 'announcement'
                    ? <Megaphone size={13} color={'#D4A853'} />
                    : <Bell      size={13} color={'#D4A853'} />
                  }
                  <Text style={s.detailTypeText}>
                    {detailItem?.type === 'announcement' ? (t?.tabAnnouncement ?? '') : (t?.tabNotification ?? '')}
                  </Text>
                  <Sparkles size={11} color="#D4A85380" />
                </View>

                {/* 제목 */}
                <Text style={s.detailTitle}>{detailItem?.title}</Text>

                {/* 시간 */}
                <Text style={s.detailTime}>
                  {detailItem ? formatTime(detailItem.timestamp, t) : ''}
                </Text>

                {/* 구분선 */}
                <View style={s.detailDivider} />

                {/* 본문 전체 */}
                <ScrollView
                  style={s.detailBodyScroll}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Text style={s.detailBody}>{detailItem?.body}</Text>
                  <View style={styles._height} />
                </ScrollView>

                {/* 닫기 버튼 — [FIX #12] inset 적용으로 navbar 겹침 해결 */}
                <TouchableOpacity
                  style={[s.detailCloseBtn, insets.bottom > 0 ? { marginBottom: insets.bottom } : s.detailCloseBtnInset]}
                  onPress={() => setDetailItem(null)}
                  activeOpacity={0.8}
                >
                  <Text style={s.detailCloseTxt}>{t?.close ?? ''}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* [FIX #11] 다중선택 하단 삭제 바 */}
      {selectMode && (
        <View style={[s.bulkBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={s.bulkCount}>{formatSelectedCountLabel(selectedIds.size, t)}</Text>
          <TouchableOpacity
            style={[s.bulkDeleteBtn, selectedIds.size === 0 && s.bulkDeleteBtnDis]}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
          >
            <Trash2 size={16} color={selectedIds.size > 0 ? '#FF5555' : '#4A4A62'} />
            <Text style={[s.bulkDeleteTxt, selectedIds.size === 0 && s.bulkDeleteTxtDis]}>
              {t?.delete ?? ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

// [BUG FIX] bottomSheetBg: s.sheetOverlay 는 s(StyleSheet.create 리턴값)를 자기 자신의
// 초기화 중에 참조 -> s === undefined -> TypeError: 'sheetOverlay' of undefined.
// sheetOverlay 스타일을 StyleSheet.create 밖에 상수로 먼저 선언해 순환 참조 해소.
const _sheetOverlayStyle = { backgroundColor: 'rgba(14,14,20,0.7)', borderTopLeftRadius: 24, borderTopRightRadius: 24 } as const;

const s = StyleSheet.create({
  sheetOverlay: _sheetOverlayStyle,
  bottomSheetBg: _sheetOverlayStyle,
  safe: { flex: 1, backgroundColor: '#050507' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, height: 52
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderRadius: 12,
    backgroundColor: '#0C0C14',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.20)'
  },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  readAllBtn:  { paddingHorizontal: 10, paddingVertical: 6, minWidth: 62, alignItems: 'flex-end' },
  readAllText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },

  // [FIX #11] 다중선택 헤더
  selectHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, height: 52,
    backgroundColor: '#0C0C14',
    borderBottomWidth: 0.5, borderBottomColor: '#1A1A28' },
  selectHeaderTitle: { flex: 1, fontSize: 16, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', textAlign: 'center' },
  selectAllBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  selectAllTxt: { fontSize: 13, color: '#D4A853', fontFamily: Typography.fontFamily.medium },
  // 카드 선택 체크
  cardSelected: { backgroundColor: 'rgba(212,168,83,0.08)', borderWidth: 1, borderColor: 'rgba(212,168,83,0.4)' },
  cardCheckWrap: { paddingRight: 16, paddingLeft: 8, alignItems: 'center', justifyContent: 'center' },
  // 하단 일괄삭제 바
  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: '#0A0A12',
    borderTopWidth: 0.5, borderTopColor: '#1A1A28',
    elevation: 12 },
  bulkCount: { flex: 1, fontSize: 14, fontFamily: Typography.fontFamily.semibold, color: '#C8C8D4' },
  bulkDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,85,85,0.35)', backgroundColor: 'rgba(255,85,85,0.08)' },
  bulkDeleteBtnDis: { borderColor: '#1E1E2A', backgroundColor: 'transparent' },
  bulkDeleteTxt: { fontSize: 14, fontFamily: Typography.fontFamily.semibold, color: '#FF5555' },
  bulkDeleteTxtDis: { color: '#4A4A62' },

  // 탭
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: '#1A1A24',
    marginBottom: 4
  },
  tabItem:    { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabLabelRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText:    { fontSize: 14, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabActive:  { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabUnder: {
    position: 'absolute', bottom: 0, left: 30, right: 30,
    height: 2.5, backgroundColor: '#D4A853', borderRadius: 2,
    elevation: 3
  },
  badge: {
    backgroundColor: '#D4A853', borderRadius: 8,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4
  },
  badgeText: { fontSize: 9, color: '#08080C', fontFamily: Typography.fontFamily.bold },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100, gap: 6 },

  // 카드
  card: {
    flexDirection: 'row',
    backgroundColor: '#0E0E14',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, gap: 10
  },
  cardUnread: { borderColor: 'rgba(212,168,83,0.35)', backgroundColor: '#0D0D12', borderLeftWidth: 2.5, borderLeftColor: '#D4A853', elevation: 3 },
  unreadDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#D4A853',
    marginTop: 5, flexShrink: 0,
    elevation: 3
  },
  cardContent:     { flex: 1, gap: 5 },
  cardTitle: { fontSize: 14, fontFamily: Typography.fontFamily.medium, color: '#7A7A90' },
  cardTitleUnread: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  cardBody: { fontSize: 13, color: '#9A9AAE', lineHeight: 20, fontFamily: Typography.fontFamily.regular },
  cardTime:        { fontSize: 11, color: '#757585', fontFamily: Typography.fontFamily.regular },

  // ✅ [FIX 2] 스와이프 액션 — height:'100%' 핵심 수정
  swipeActionWrap: {
    width: 72,
    height: '100%',        // ← 카드 높이만큼 채워야 제대로 보임
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6
  },
  swipeDeleteBtn: {
    width: 52, height: 52,
    borderRadius: 26,
    backgroundColor: '#FF5555',
    justifyContent: 'center', alignItems: 'center'
  },

  // 디테일 모달
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  detailSheet: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
    height: '88%',         // 높이를 더 높게 설정
    overflow: 'hidden',
    elevation: 8
  },
  detailHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#222232',
    alignSelf: 'center', marginBottom: 18
  },
  detailTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(212,168,83,0.14)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)',
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 12
  },
  detailTypeText: { fontSize: 11, color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  detailTitle: {
    fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5',
    lineHeight: 26, marginBottom: 6
  },
  detailTime: { fontSize: 12, color: '#757585', fontFamily: Typography.fontFamily.regular, marginBottom: 16 },
  detailDivider: { height: 0.5, backgroundColor: '#181820', marginBottom: 16 },
  detailBodyScroll: { flex: 1, minHeight: 60 },
  detailBody: {
    fontSize: 15, color: '#C8C8D4', fontFamily: Typography.fontFamily.regular,
    lineHeight: 24
  },
  detailCloseBtn: {
    marginTop: 16, backgroundColor: '#111118',
    borderRadius: 12, borderWidth: 1, borderColor: '#222232',
    paddingVertical: 13, alignItems: 'center'
  },
  detailCloseBtnInset: {
    marginBottom: 8 },
  detailCloseTxt: { fontSize: 15, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium }
  });

const styles = StyleSheet.create({
  _marginTop: {
    alignSelf: 'flex-start',
    marginTop: 3
  },
  _height: {
    height: 24
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)'
  }
  });

