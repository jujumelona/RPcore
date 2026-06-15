// src/components/SwipeablePostRow.tsx
// ═══════════════════════════════════════════════════════════════════
//  Reddit Infinity 스와이프 퀵액션 컴포넌트
//  — 커뮤니티 게시글에 좌우 스와이프로 빠른 액션
//
//  ← 왼쪽 스와이프: ❤ 좋아요 (길게 →  북마크)
//  → 오른쪽 스와이프: 💬 댓글 (길게 → 🚨 신고)
// ═══════════════════════════════════════════════════════════════════

  
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSwipeAction, type SwipeActionConfig } from '../hooks/useSwipeAction';
import { useLanguageStore } from '../store/languageStore';

interface SwipeablePostRowProps {
  children: React.ReactNode;
  onLike?: () => void;
  onBookmark?: () => void;
  onComment?: () => void;
  onReport?: () => void;
  haptic?: () => void;
  enabled?: boolean;
}

export default function SwipeablePostRow({
  children,
  onLike,
  onBookmark,
  onComment,
  onReport,
  haptic,
  enabled = true }: SwipeablePostRowProps) {
  const t = useLanguageStore(s => s.t);
  const config: SwipeActionConfig = {
    onLeftShort: onLike,
    onLeftLong: onBookmark,
    onRightShort: onComment,
    onRightLong: onReport,
    haptic,
    shortThreshold: 80,
    longThreshold: 160 };

  const {
    animatedRowStyle,
    animatedLeftStyle,
    animatedRightStyle,
    onGestureUpdate,
    onGestureEnd } = useSwipeAction(config);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .enabled(enabled)
    .onUpdate((e) => {
      onGestureUpdate(e.translationX);
    })
    .onEnd(() => {
      onGestureEnd();
    });

  return (
    <View style={styles.container}>
      {/* 왼쪽 배경 (오른쪽 스와이프) */}
      <Animated.View style={[styles.bgLeft, animatedLeftStyle]}>
        <Text style={styles.actionIcon}>💬</Text>
        <Text style={styles.actionLabel}>{t?.comment ?? ''}</Text>
      </Animated.View>

      {/* 오른쪽 배경 (왼쪽 스와이프) */}
      <Animated.View style={[styles.bgRight, animatedRightStyle]}>
        <Text style={styles.actionIcon}>❤</Text>
        <Text style={styles.actionLabel}>{t?.like ?? ''}</Text>
      </Animated.View>

      {/* 메인 콘텐츠 */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.row, animatedRowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', overflow: 'hidden' },
  row: { backgroundColor: '#0d0d10', zIndex: 1 },
  bgLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 24,
    flexDirection: 'row',
    gap: 8,
    paddingTop: 20 },
  bgRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#D4A853',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
    flexDirection: 'row-reverse',
    gap: 8,
    paddingTop: 20 },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 13, color: '#fff', fontWeight: '600' } });
