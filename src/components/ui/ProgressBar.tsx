// src/components/ui/ProgressBar.tsx
// ══════════════════════════════════════════════════════════════
// 진행률 바 컴포넌트
// 애니메이션 + 감정 색상 + 그라데이션
// ══════════════════════════════════════════════════════════════

import { Typography } from '../../constants/tokens';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { EmotionColors, EmotionType } from '../../constants/EmotionColors';

export type ProgressBarVariant = 'default' | 'gradient' | 'striped';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

interface ProgressBarProps {
  progress: number; // 0-100
  emotion?: EmotionType;
  variant?: ProgressBarVariant;
  size?: ProgressBarSize;
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  emotion = 'neutral',
  variant = 'default',
  size = 'md',
  showLabel = false,
  label,
  animated = true,
  style }: ProgressBarProps) {
  const animatedProgress = useSharedValue(0);
  const colors = EmotionColors[emotion];
  
  useEffect(() => {
    const clampedProgress = Math.max(0, Math.min(100, progress));
    if (animated) {
      animatedProgress.value = withSpring(clampedProgress, {
        damping: 20,
        stiffness: 90 });
    } else {
      animatedProgress.value = clampedProgress;
    }
  }, [progress, animated, animatedProgress]);
  
  const progressStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%` }));
  
  const getHeight = () => {
    switch (size) {
      case 'sm':
        return 4;
      case 'lg':
        return 12;
      case 'md':
      default:
        return 8;
    }
  };
  
  const displayLabel = label || `${Math.round(progress)}%`;
  
  return (
    <View style={[styles.container, style]}>
      {showLabel && (
        <View style={styles.labelContainer}>
          <Text style={styles.label}>{displayLabel}</Text>
        </View>
      )}
      
      <View
        style={[
          styles.track,
          { height: getHeight(), borderRadius: getHeight() / 2 },
        ]}
      >
        <Animated.View style={[styles.progressContainer, progressStyle]}>
          {variant === 'gradient' ? (
            <LinearGradient
              colors={colors.gradient}
              start={[0, 0]}
              end={[1, 0]}
              style={[
                styles.progress,
                { borderRadius: getHeight() / 2 },
              ]}
            />
          ) : (
            <View
              style={[
                styles.progress,
                variant === 'striped' && styles.striped,
                {
                  backgroundColor: colors.primary,
                  borderRadius: getHeight() / 2 },
              ]}
            />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// 원형 진행률 바
interface CircularProgressProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  emotion?: EmotionType;
  showLabel?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CircularProgress({
  progress,
  size = 60,
  strokeWidth = 6,
  emotion = 'neutral',
  showLabel = true }: CircularProgressProps) {
  const colors = EmotionColors[emotion];
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    const clampedProgress = Math.max(0, Math.min(100, progress));
    animatedProgress.value = withTiming(clampedProgress, { duration: 1000 });
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - (circumference * animatedProgress.value) / 100 }));

  return (
    <View style={[styles.circularContainer, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* 배경 원 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2E2E3D"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* 진행률 원 */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>

      {showLabel && (
        <View style={styles.circularLabel}>
          <Text style={styles.circularLabelText}>
            {Math.round(progress)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%' },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8 },
  label: {
    fontSize: 12,
    color: '#8A8A9E',
    fontFamily: Typography.fontFamily.medium },
  track: {
    width: '100%',
    backgroundColor: '#0C0C14',
    overflow: 'hidden' },
  progressContainer: {
    height: '100%' },
  progress: {
    height: '100%',
    width: '100%' },
  striped: {
    // 스트라이프 패턴은 CSS로 구현하기 어려우므로 생략
    // 필요시 SVG나 Canvas 사용
  },
  circularContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center' },
  circularLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center' },
  circularLabelText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' } });
