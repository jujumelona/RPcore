﻿// src/components/ui/Badge.tsx
// ══════════════════════════════════════════════════════════════
// 뱃지 컴포넌트
// 상태 표시, 알림 카운트 등에 사용
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { EmotionColors, EmotionType } from '../../constants/EmotionColors';
import { Radius, Typography } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';

export type BadgeVariant = 'solid' | 'outlined' | 'dot';
export type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children?: React.ReactNode;
  emotion?: EmotionType;
  variant?: BadgeVariant;
  size?: BadgeSize;
  count?: number;
  maxCount?: number;
  showZero?: boolean;
  style?: ViewStyle;
}

export function Badge({
  children,
  emotion = 'neutral',
  variant = 'solid',
  size = 'md',
  count,
  maxCount = 99,
  showZero = false,
  style }: BadgeProps) {
  const colors = EmotionColors[emotion];
  
  // 카운트 표시 로직
  const displayCount = count !== undefined
    ? count > maxCount
      ? `${maxCount}+`
      : count.toString()
    : null;
  
  // 카운트가 0이고 showZero가 false면 렌더링 안함
  if (count !== undefined && count === 0 && !showZero) {
    return null;
  }
  
  // Dot variant
  if (variant === 'dot') {
    return (
      <View
        style={[
          styles.dot,
          size === 'sm' && styles.dotSm,
          size === 'lg' && styles.dotLg,
          { backgroundColor: colors.primary },
          style,
        ]}
      />
    );
  }
  
  // Solid variant
  if (variant === 'solid') {
    return (
      <View
        style={[
          styles.badge,
          styles.solid,
          size === 'sm' && styles.badgeSm,
          size === 'lg' && styles.badgeLg,
          { backgroundColor: colors.primary },
          style,
        ]}
      >
        <Text
          style={[
            styles.text,
            styles.textSolid,
            size === 'sm' && styles.textSm,
            size === 'lg' && styles.textLg,
          ]}
        >
          {displayCount || children}
        </Text>
      </View>
    );
  }
  
  // Outlined variant
  return (
    <View
      style={[
        styles.badge,
        styles.outlined,
        size === 'sm' && styles.badgeSm,
        size === 'lg' && styles.badgeLg,
        { borderColor: colors.primary },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          styles.textOutlined,
          size === 'sm' && styles.textSm,
          size === 'lg' && styles.textLg,
          { color: colors.primary },
        ]}
      >
        {displayCount || children}
      </Text>
    </View>
  );
}

function UpdatedBadge() {
  const t = useLanguageStore(s => s.t);
  return <Badge emotion="neutral" size="sm">{t?.update ?? ''}</Badge>;
}

function PremiumBadge() {
  const t = useLanguageStore(s => s.t);
  return <Badge emotion="e5_love" size="sm">{t?.premium ?? ''}</Badge>;
}

// 프리셋 뱃지
export const BadgePresets = {
  New: () => <Badge emotion="e1_joy" size="sm">NEW</Badge>,
  Hot: () => <Badge emotion="e3_anger" size="sm">HOT</Badge>,
  Updated: UpdatedBadge,
  Beta: () => <Badge emotion="e4_fear" variant="outlined" size="sm">BETA</Badge>,
  Premium: PremiumBadge };

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20 },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 16 },
  badgeLg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 28 },
  solid: {
    borderWidth: 0 },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4 },
  dotSm: {
    width: 6,
    height: 6,
    borderRadius: 3 },
  dotLg: {
    width: 10,
    height: 10,
    borderRadius: 5 },
  text: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 11,
    lineHeight: 14 },
  textSm: {
    fontSize: 9,
    lineHeight: 12 },
  textLg: {
    fontSize: 13,
    lineHeight: 16 },
  textSolid: {
    color: '#0E0E14' },
  textOutlined: {
    // color는 동적으로 설정됨
  } });
