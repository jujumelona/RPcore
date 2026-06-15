﻿// src/components/ui/Typography.tsx
// ══════════════════════════════════════════════════════════════════════
// 앱 공통 텍스트 컴포넌트
//
// 모든 텍스트는 raw <Text> 대신 이 컴포넌트 사용 -> 일관성 보장
// Pretendard 폰트 로드 후 fontFamily 지정 필요
// ══════════════════════════════════════════════════════════════════════

import { Typography } from '../../constants/tokens';
import { ReactNode } from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';

interface TextProps {
  children: ReactNode;
  style?: TextStyle;
  numberOfLines?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

// ── H1 — 화면 제목 ─────────────────────────────────────────────────

export function H1({ children, style, color = '#F0F0F5', align }: TextProps) {
  return (
    <Text
      style={[
        styles.h1,
        { color, textAlign: align },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ── H2 — 섹션 제목 ─────────────────────────────────────────────────

export function H2({ children, style, color = '#F0F0F5', align }: TextProps) {
  return (
    <Text style={[styles.h2, { color, textAlign: align }, style]}>
      {children}
    </Text>
  );
}

// ── H3 — 카드 제목 ─────────────────────────────────────────────────

export function H3({ children, style, color = '#F0F0F5', align, numberOfLines }: TextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.h3, { color, textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

// ── Body — 기본 본문 ───────────────────────────────────────────────

export function Body({ children, style, color = '#C8C8D4', align, numberOfLines }: TextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.body, { color, textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

// ── Caption — 보조 설명 ────────────────────────────────────────────

export function Caption({ children, style, color = '#8A8A9E', align, numberOfLines }: TextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.caption, { color, textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

// ── Label — 태그, 배지, 버튼 등 ────────────────────────────────────

export function Label({ children, style, color = '#8A8A9E', align }: TextProps) {
  return (
    <Text style={[styles.label, { color, textAlign: align }, style]}>
      {children}
    </Text>
  );
}

// ── Overline — 섹션 상단 캡스 라벨 ────────────────────────────────

export function Overline({ children, style, color = '#797990', align }: TextProps) {
  return (
    <Text style={[styles.overline, { color, textAlign: align }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  h1: {
    fontSize: Typography.size.h1,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -1,
    lineHeight: Typography.size.h1 * 1.15 },
  h2: {
    fontSize: Typography.size.h2,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -0.6,
    lineHeight: Typography.size.h2 * 1.2 },
  h3: {
    fontSize: Typography.size.h3,
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: -0.3,
    lineHeight: Typography.size.h3 * Typography.lineHeight.normal },
  body: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.regular,
    letterSpacing: 0.15,
    lineHeight: Typography.size.base * 1.7 },
  caption: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    letterSpacing: 0.25,
    lineHeight: Typography.size.sm * Typography.lineHeight.loose },
  label: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 0.4 },
  overline: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 1.6,
    textTransform: 'uppercase' } });
