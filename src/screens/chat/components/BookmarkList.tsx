/**
 * src/screens/chat/components/BookmarkList.tsx
 *
 * ✅ 북마크된 메시지 목록 모달
 * ✅ 탭 → 해당 메시지 위치로 점프 (flatListRef 직접 연결)
 * ✅ inverted FlatList / LegendList 양쪽 지원
 * ✅ 날짜/시간 표시
 * ✅ 빈 상태 처리
 */

import { Typography } from '../../../constants/tokens';
import React, { useCallback, useRef } from 'react';
import { Modal, View, Text, StyleSheet,
  ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Bookmark, X } from 'lucide-react-native';
import type { MutableRefObject } from 'react';
import { FlashList } from '@shopify/flash-list';
import type { ChatMessage } from '../types/ChatMessageTypes';
import { formatChatTextForDisplay } from '../../../utils/chatDisplayText';
import { useLanguageStore } from '../../../store/languageStore';

interface BookmarkListProps {
  visible: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  userName?: string;
  onMessageSelect: (messageId: string) => void;
  /**
   * 채팅 리스트 ref.
   * FlatList (inverted) 또는 LegendList ref.
   * 전달하면 탭 시 해당 메시지로 직접 스크롤.
   * 미전달 시 onMessageSelect 콜백만 호출 (상위에서 처리).
   */
  flatListRef?: MutableRefObject<any | { scrollToIndex: (opts: { index: number; animated: boolean; viewPosition?: number }) => void; scrollToEnd: (opts?: { animated: boolean }) => void } | null>;
  /** 리스트가 inverted인지 여부 */
  isInverted?: boolean;
}

function formatTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function BookmarkList({
  visible,
  onClose,
  messages,
  userName,
  onMessageSelect,
  flatListRef,
  isInverted = true }: BookmarkListProps) {
  const t = useLanguageStore(state => state.t);
  const { width, height }  = useWindowDimensions();
  const scrollTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookmarked         = messages.filter(m => m.bookmarked || m.isImportant);

  // cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const handleItemPress = useCallback((msg: ChatMessage) => {
    // 먼저 모달 닫기
    onClose();
    onMessageSelect(msg.id);

    if (!flatListRef?.current) return;

    // 350ms 후 스크롤 (모달 닫기 애니메이션 완료 대기)
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;

      const idx = messages.findIndex(m => m.id === msg.id);
      if (idx < 0) return;

      // inverted FlatList의 경우:
      //   화면상 인덱스 = messages.length - 1 - idx
      //   (최신 메시지가 index=0에 렌더링됨)
      const scrollIdx = isInverted ? messages.length - 1 - idx : idx;

      try {
        flatListRef.current?.scrollToIndex?.({
          index:        scrollIdx,
          animated:     true,
          viewPosition: 0.5 });
      } catch {
        // scrollToIndex 실패 시: inverted에서는 최신(아래)으로 fallback
        flatListRef.current?.scrollToEnd?.({ animated: true });
      }
    }, 350);
  }, [messages, onClose, onMessageSelect, flatListRef, isInverted]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={[styles.container, { width: width * 0.88, maxHeight: height * 0.65 }]}
          activeOpacity={1}
        >
          <View style={styles.header}>
            <Bookmark size={16} color="#D4A853" />
            <Text style={styles.title}>{t?.bookmarkListTitle ?? ''}</Text>
            <Text style={styles.count}>{bookmarked.length}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color="#5A5A70" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {bookmarked.length === 0 ? (
              <View style={styles.empty}>
                <Bookmark size={32} color="#2E2E3D" strokeWidth={1.5} />
                <Text style={styles.emptyTxt}>{t?.bookmarkEmpty ?? ''}</Text>
              </View>
            ) : (
              [...bookmarked].reverse().map((msg, i) => (
                <TouchableOpacity
                  key={msg.id}
                  style={[styles.item, i < bookmarked.length - 1 && styles.itemBorder]}
                  onPress={() => handleItemPress(msg)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemRole}>
                      {msg.role === 'user' ? (t?.drawerYou ?? '') : (msg.characterName ?? t?.aiShortLabel ?? '')}
                    </Text>
                    <Text style={styles.itemTime}>{formatTime(msg.timestamp)}</Text>
                  </View>
                  <Text style={styles.itemContent} numberOfLines={3}>
                    {msg.role === 'user'
                      ? msg.content
                      : formatChatTextForDisplay(msg.content ?? '', userName)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center' },
  container: {
    backgroundColor: '#0E0E14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#181820',
    overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#181820' },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' },
  count: {
    fontSize: 13,
    color: '#5A5A70',
    marginRight: 4 },
  item: { paddingHorizontal: 18, paddingVertical: 14 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  itemRole: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  itemTime: { fontSize: 11, color: '#5A5A70' },
  itemContent: { fontSize: 14, color: '#C8C8D4', lineHeight: 20 },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyTxt: { color: '#5A5A70', fontSize: 14 } });
