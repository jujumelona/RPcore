﻿// src/components/ui/Layout.tsx
// ══════════════════════════════════════════════════════════════════════
// 레이아웃 유틸 컴포넌트 — Divider, Spacer, Row, Stack
// ══════════════════════════════════════════════════════════════════════

import { ReactNode, useMemo } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { Space } from '../../constants/tokens';

// ── Divider ────────────────────────────────────────────────────────

interface DividerProps {
  color?: string;
  mx?: number;
  my?: number;
}

export function Divider({ color = '#1A1A24', mx = 0, my = 0 }: DividerProps) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: color,
        marginHorizontal: mx,
        marginVertical: my }}
    />
  );
}

// ── Spacer ─────────────────────────────────────────────────────────

interface SpacerProps {
  size?: number;
  flex?: boolean;
  horizontal?: boolean;
}

export function Spacer({ size = Space['4'], flex, horizontal }: SpacerProps) {
  if (flex) return <View style={styles._flex} />;
  return (
    <View
      style={
        horizontal
          ? { width: size }
          : { height: size }
      }
    />
  );
}

// ── Row — 가로 정렬 ────────────────────────────────────────────────

interface RowProps {
  children: ReactNode;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  gap?: number;
  style?: ViewStyle;
  wrap?: boolean;
}

export function Row({
  children,
  align = 'center',
  justify = 'flex-start',
  gap = 0,
  style,
  wrap = false }: RowProps) {
  const rowStyle = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: align,
      justifyContent: justify,
      gap,
      flexWrap: wrap ? 'wrap' : 'nowrap' } }), [align, justify, gap, wrap]);

  return (
    <View style={[rowStyle.row, style]}>
      {children}
    </View>
  );
}

// ── Stack — 세로 정렬 ──────────────────────────────────────────────

interface StackProps {
  children: ReactNode;
  gap?: number;
  style?: ViewStyle;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
}

export function Stack({ children, gap = 0, style, align = 'stretch' }: StackProps) {
  return (
    <View style={[{ gap, alignItems: align }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  _flex: {
    flex: 1 } });
