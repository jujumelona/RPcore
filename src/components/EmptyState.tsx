// src/components/EmptyState.tsx
// ── v3: 하드코딩 제거, i18n 완전 적용 ────────────────────────────────────────

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withRepeat, withSequence, withTiming, cancelAnimation
  } from 'react-native-reanimated';
import { AlertCircle, BookOpen, Users, MessageCircle,
  Search, Inbox, RefreshCw } from 'lucide-react-native';
import { Color, Space, Spring, Typography } from '../constants/tokens';
import { useTranslation } from '../hooks/useTranslation';

// ─── 타입 ────────────────────────────────────────────────────────────────────
type EmptyType =
  | 'conversation' | 'story' | 'character'
  | 'search' | 'default' | 'error' | 'empty';

interface EmptyStateProps {
  type?: EmptyType;
  title?: string;
  subtitle?: string;
  retryLabel?: string;
  onRetry?: () => void;
  compact?: boolean;
}

// ─── 아이콘/스타일 맵 ────────────────────────────────────────────────────────
const META: Record<EmptyType, { Icon: any; color: string; glowColor: string }> = {
  conversation: { Icon: MessageCircle, color: '#6B9BD1', glowColor: '#0A1020' },
  story:        { Icon: BookOpen,      color: '#D4A853', glowColor: '#1A1006' },
  error:        { Icon: AlertCircle,   color: '#FF5555', glowColor: '#2A1010' },
  default:      { Icon: Inbox,         color: '#8A8A9E', glowColor: '#101015' },
  character:    { Icon: Users,         color: '#34D399', glowColor: '#0A1E16' },
  search:       { Icon: Search,        color: '#8B5CF6', glowColor: '#140A2A' },
  empty:        { Icon: Inbox,         color: '#8A8A9E', glowColor: '#101015' }
  };

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export function EmptyState({
  type = 'default',
  title,
  subtitle,
  retryLabel,
  onRetry,
  compact = false
  }: EmptyStateProps) {
  const t = useTranslation();

  // i18n 기반 기본 텍스트 — 하드코딩 제거
  const defaultTexts: Record<EmptyType, { title: string; subtitle: string }> = {
    conversation: {
      title:    t.emptyConversation,
      subtitle: t.emptyConversationSub
  },
    story: {
      title:    t.emptyStory,
      subtitle: t.emptyStorySub
  },
    character: {
      title:    t.emptyCharacter,
      subtitle: t.emptyCharacterSub
  },
    empty: {
      title:    t.emptyDefault,
      subtitle: '' },
    search: {
      title:    t.emptySearch,
      subtitle: t.emptySearchSub
  },
    error: {
      title:    t.error,
      subtitle: t.retry
  },
    default: {
      title:    t.loadingDefault,
      subtitle: ''
  }
  };

  const meta      = META[type] ?? META.default;
  const displayTitle    = title    ?? defaultTexts[type].title;
  const displaySubtitle = subtitle ?? defaultTexts[type].subtitle;
  const displayRetry    = retryLabel ?? t.retryBtn;

  // 아이콘 펄스 애니메이션
  const scale = useSharedValue(1);
  const glow  = useSharedValue(0.3);

  React.useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1800 }),
        withTiming(1.00, { duration: 1800 }),
      ), -1, true,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1800 }),
        withTiming(0.3, { duration: 1800 }),
      ), -1, true,
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(glow);
      scale.value = 1;
      glow.value = 0.3;
    };
  }, [glow, scale]);

  // [BUG-FIX] opacity와 transform을 한 useAnimatedStyle에 두면 
  // RN 0.83 / Reanimated v4에서 getBoundingClientRect를 매번 트리거하여 성능 저하/경고 발생 가능.
  // opacity(glow)는 상위 View로, scale은 하위 View로 분리.
  const scaleAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }] }));
  const opacityAnim = useAnimatedStyle(() => ({
    opacity: glow.value }));

  // 버튼 누름 애니메이션
  const btnScale = useSharedValue(1);
  const handlePressIn  = useCallback(() => { btnScale.value = withSpring(0.95, Spring.press); }, [btnScale]);
  const handlePressOut = useCallback(() => { btnScale.value = withSpring(1.00, Spring.press); }, [btnScale]);
  const btnAnim = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* 아이콘 글로우 배경 */}
      <View style={[styles.glowBg, { backgroundColor: meta.glowColor }]} />

      {/* 아이콘 (opacityAnim과 scaleAnim을 분리하여 layout 트리거 방지) */}
      <Animated.View style={opacityAnim}>
        <Animated.View style={[styles.iconWrap, scaleAnim]}>
          <meta.Icon size={compact ? 36 : 52} color={meta.color} strokeWidth={1.5} />
        </Animated.View>
      </Animated.View>

      {/* 텍스트 */}
      <Text style={[styles.title, compact && styles.titleCompact]}>
        {displayTitle}
      </Text>
      {!!displaySubtitle && (
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
          {displaySubtitle}
        </Text>
      )}

      {/* 재시도 버튼 */}
      {onRetry && (
        <Animated.View style={btnAnim}>
          <Pressable
            onPress={onRetry}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[styles.retryBtn, { borderColor: `${meta.color}40` }]}
            accessibilityRole="button"
            accessibilityLabel={displayRetry}
          >
            <RefreshCw size={14} color={meta.color} strokeWidth={2} />
            <Text style={[styles.retryText, { color: meta.color }]}>
              {displayRetry}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space['16'],
    paddingHorizontal: Space['8'],
    gap: Space['3']
  },
  containerCompact: {
    paddingVertical: Space['8'],
    gap: Space['2']
  },
  glowBg: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.6
  },
  iconWrap: {
    marginBottom: Space['2']
  },
  title: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontFamily.semibold,
    color: Color.text0,
    textAlign: 'center'
  },
  titleCompact: {
    fontSize: Typography.size.base
  },
  subtitle: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Color.text2,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: Typography.size.sm * 1.6
  },
  subtitleCompact: {
    fontSize: Typography.size.xs,
    maxWidth: 220
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space['2'],
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    elevation: 3
  },
  retryText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium
  }
  });
