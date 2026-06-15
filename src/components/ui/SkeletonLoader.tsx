// src/components/ui/SkeletonLoader.tsx
// ══════════════════════════════════════════════════════════════
// 스켈레톤 로딩 컴포넌트
// 부드러운 shimmer 애니메이션
// ══════════════════════════════════════════════════════════════

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius } from '../../constants/tokens';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius = Radius.sm,
  style }: SkeletonLoaderProps) {
  const shimmer = useSharedValue(0);
  
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      false
    );
    return () => {
      cancelAnimation(shimmer);
      shimmer.value = 0;
    };
  }, [shimmer]);
  
  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shimmer.value,
      [0, 1],
      [-200, 200]
    );
    
    return {
      transform: [{ translateX }] };
  });
  
  return (
    <View
      style={[
        styles.container,
        {
          width: width as any,
          height,
          borderRadius },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={[
            'rgba(255, 255, 255, 0.0)',
            'rgba(255, 255, 255, 0.05)',
            'rgba(255, 255, 255, 0.0)',
          ]}
          start={[0, 0]}
          end={[1, 0]}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
}

// 프리셋 스켈레톤 레이아웃
export const SkeletonPresets = {
  // 메시지 버블
  MessageBubble: () => (
    <View style={styles.messageBubble}>
      <SkeletonLoader width={40} height={40} borderRadius={20} />
      <View style={styles.messageBubbleContent}>
        <SkeletonLoader width="80%" height={16} />
        <SkeletonLoader width="60%" height={16} style={styles.mt8} />
      </View>
    </View>
  ),
  
  // 스토리 카드
  StoryCard: () => (
    <View style={styles.storyCard}>
      <SkeletonLoader width="100%" height={180} borderRadius={Radius.md} />
      <SkeletonLoader width="70%" height={20} style={styles.mt12} />
      <SkeletonLoader width="90%" height={14} style={styles.mt8} />
      <SkeletonLoader width="50%" height={14} style={styles.mt4} />
    </View>
  ),
  
  // 캐릭터 프로필
  CharacterProfile: () => (
    <View style={styles.characterProfile}>
      <SkeletonLoader width={80} height={80} borderRadius={40} />
      <View style={styles.characterInfo}>
        <SkeletonLoader width="60%" height={18} />
        <SkeletonLoader width="40%" height={14} style={styles.mt6} />
      </View>
    </View>
  ),
  
  // 리스트 아이템
  ListItem: () => (
    <View style={styles.listItem}>
      <SkeletonLoader width={50} height={50} borderRadius={Radius.sm} />
      <View style={styles.listItemContent}>
        <SkeletonLoader width="70%" height={16} />
        <SkeletonLoader width="50%" height={12} style={styles.mt6} />
      </View>
    </View>
  ) };

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0C0C14',
    overflow: 'hidden' },
  gradient: {
    flex: 1,
    width: 200 },
  messageBubble: {
    flexDirection: 'row',
    padding: 12,
    gap: 12 },
  messageBubbleContent: {
    flex: 1 },
  storyCard: {
    padding: 12 },
  characterProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16 },
  characterInfo: {
    flex: 1 },
  listItem: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    alignItems: 'center' },
  listItemContent: {
    flex: 1 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 } });
