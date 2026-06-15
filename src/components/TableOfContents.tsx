// src/components/TableOfContents.tsx
// ═══════════════════════════════════════════════════════════════════
//  웹소설 리더 목차(TOC) 바텀시트 컴포넌트
//  — 챕터 목록 + 현재 위치 표시 + 읽기 진행률
// ═══════════════════════════════════════════════════════════════════

import { Typography } from '../constants/tokens';
import React, { useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal,
  Dimensions, Animated as RNAnimated } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Check } from 'lucide-react-native';

// ── Types ──────────────────────────────────────────────────────────

export interface TOCChapter {
  id: string;
  title: string;
  order: number;
  isRead?: boolean;
  /** 0~1 진행률 */
  progress?: number;
}

interface TableOfContentsProps {
  visible: boolean;
  onClose: () => void;
  chapters: TOCChapter[];
  currentChapterId: string;
  onChapterPress: (chapter: TOCChapter) => void;
  novelTitle?: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

// ── Component ─────────────────────────────────────────────────────

export default function TableOfContents({
  visible,
  onClose,
  chapters,
  currentChapterId,
  onChapterPress,
  novelTitle }: TableOfContentsProps) {
  const slideAnim = useRef(new RNAnimated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new RNAnimated.Value(0)).current;
  const listRef = useRef<any>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }

    if (visible) {
      RNAnimated.parallel([
        RNAnimated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true }),
        RNAnimated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true }),
      ]).start();

      // 현재 챕터로 스크롤
      const idx = chapters.findIndex(c => c.id === currentChapterId);
      if (idx >= 0) {
        scrollTimerRef.current = setTimeout(() => {
          scrollTimerRef.current = null;
          listRef.current?.scrollToIndex({ index: idx, viewOffset: 60, animated: false });
        }, 300);
      }
    } else {
      RNAnimated.parallel([
        RNAnimated.spring(slideAnim, {
          toValue: SHEET_HEIGHT,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true }),
        RNAnimated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true }),
      ]).start();
    }
    return () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, [visible, slideAnim, backdropOpacity, chapters, currentChapterId]);

  const readCount = chapters.filter(c => c.isRead).length;
  const totalCount = chapters.length;

  const renderChapter = useCallback(
    ({ item }: { item: TOCChapter }) => {
      const isCurrent = item.id === currentChapterId;
      return (
        <Pressable
          style={[styles.chapterRow, isCurrent && styles.chapterRowActive]}
          onPress={() => onChapterPress(item)}
        >
          <View style={styles.chapterLeft}>
            <Text style={[styles.chapterOrder, isCurrent && styles.chapterOrderActive]}>
              {item.order}
            </Text>
            <Text
              style={[styles.chapterTitle, isCurrent && styles.chapterTitleActive]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </View>

          <View style={styles.chapterRight}>
            {item.isRead && <Check size={14} color="#4CAF50" />}
            {item.progress != null && item.progress > 0 && item.progress < 1 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${item.progress * 100}%` }]} />
              </View>
            )}
          </View>
        </Pressable>
      );
    },
    [currentChapterId, onChapterPress],
  );

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <RNAnimated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </RNAnimated.View>

      {/* Sheet */}
      <RNAnimated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.tocHeader}>
          <Text style={styles.tocTitle}>{novelTitle || '목차'}</Text>
          <Text style={styles.tocCount}>
            {readCount}/{totalCount} 읽음
          </Text>
        </View>

        {/* Chapter List */}
        <FlashList
        ref={listRef}
        data={chapters}
        estimatedItemSize={50}
        keyExtractor={c => c.id}
        renderItem={renderChapter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      </RNAnimated.View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#0d0d10',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden' },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#333' },
  tocHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#1a1a1e' },
  tocTitle: { fontSize: 16, fontWeight: '700', color: '#E8E6E3', flex: 1, fontFamily: Typography.fontFamily.bold },
  tocCount: { fontSize: 13, color: '#D4A853', fontWeight: '600' },
  listContent: { paddingBottom: 30 },

  chapterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#111' },
  chapterRowActive: { backgroundColor: '#D4A85310' },
  chapterLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  chapterOrder: { fontSize: 13, color: '#555', width: 28, textAlign: 'center', fontWeight: '600' },
  chapterOrderActive: { color: '#D4A853' },
  chapterTitle: { fontSize: 15, color: '#ccc', flex: 1 },
  chapterTitleActive: { color: '#D4A853', fontWeight: '600' },
  chapterRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readBadge: { fontSize: 14, color: '#4CAF50' },
  progressBar: {
    width: 40, height: 3, backgroundColor: '#222', borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#D4A853', borderRadius: 1.5 } });
