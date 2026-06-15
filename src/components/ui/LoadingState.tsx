// src/components/ui/LoadingState.tsx
// ── Premium v3 — i18n 완전 지원, emotion-tinted ──────────────────────────────

import { Typography } from '../../constants/tokens';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat,
  withSequence, withTiming, withDelay, Easing, cancelAnimation } from 'react-native-reanimated';
import { EmotionColors, type EmotionType } from '../../constants/EmotionColors';
import { useTranslation } from '../../hooks/useTranslation';

interface LoadingStateProps {
  type: 'ai' | 'chapter' | 'model' | 'default';
  message?: string;
  emotion?: EmotionType;
  progress?: number;
}

function AnimatedDot({ color, delay }: { color: string; delay: number }) {
  const scale   = useSharedValue(0.5);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1.35, { duration: 380, easing: Easing.out(Easing.ease) }),
        withTiming(0.5,  { duration: 380, easing: Easing.in(Easing.ease) }),
      ), -1, false,
    ));
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1,   { duration: 380 }),
        withTiming(0.3, { duration: 380 }),
      ), -1, false,
    ));
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value   = 0.5;
      opacity.value = 0.3;
    };
  }, [delay, scale, opacity]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, aStyle]} />;
}

export function LoadingState({
  type,
  message,
  emotion = 'neutral',
  progress }: LoadingStateProps) {
  const t = useTranslation();
  const colors = EmotionColors[emotion] ?? EmotionColors.neutral;

  const getDefaultMessage = (): string => {
    switch (type) {
      case 'ai':      return t.loadingAI;
      case 'chapter': return t.loadingChapter;
      case 'model':   return t.loadingModel;
      default:        return t.loadingDefault;
    }
  };

  const displayMessage = message ?? getDefaultMessage();

  return (
    <View style={styles.container}>
      <View style={styles.dotRow}>
        <AnimatedDot color={colors.primary} delay={0} />
        <AnimatedDot color={colors.primary} delay={160} />
        <AnimatedDot color={colors.primary} delay={320} />
      </View>
      <Text style={[styles.message, { color: colors.primary }]}>
        {displayMessage}
      </Text>
      {progress !== undefined && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {
            width: `${Math.min(100, Math.max(0, progress))}%` as any,
            backgroundColor: colors.primary }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12 },
  dotRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5 },
  message: {
    fontSize: 14,
    opacity: 0.8,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.regular },
  progressTrack: {
    width: 160,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4 },
  progressFill: {
    height: '100%',
    borderRadius: 2 } });
