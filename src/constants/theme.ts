﻿// src/constants/theme.ts
// ══════════════════════════════════════════════════════════════
//  DEPRECATED — 모든 값이 tokens.ts 기준으로 정규화됨
//
// 이 파일은 하위 호환성을 위해 유지됩니다.
// 새 코드는 반드시 tokens.ts 를 직접 import 하세요.
//
//   import { Space, Radius, Typo } from './tokens';
//
// ══════════════════════════════════════════════════════════════

import { Space,
  Radius,
  Typography as TypoTokens,
  Elevation } from './tokens';

// ── Colors (legacy name) ──────────────────────────────────────
export const Colors = {
  background:    '#08080C',
  surface:       '#0E0E14',
  surfaceHigh:   '#1E1E28',
  border:        '#22222E',
  primary:       '#FFFFFF',
  primaryLight:  '#F0F0F5',
  primaryDark:   '#8A8A9E',
  primaryAlpha:  'rgba(212,168,83,0.14)',
  textPrimary:   '#F0F0F5',
  textSecondary: '#8A8A9E',
  textTertiary:  '#797990',
  textDisabled:  '#2E2E3D',
  success:       '#4ADE80',
  error:         '#FF5555',
  warning:       '#F59E0B',
  info:          '#8A8A9E',
  tabActive:     '#D4A853',
  tabInactive:   '#797990',
  tabBackground: '#050507',
  cardBackground: '#0E0E14',
  cardBorder:     '#22222E',
  overlay:      'rgba(0,0,0,0.75)' as const,
  overlayLight: 'rgba(0,0,0,0.4)'  as const
  } as const;

// ── Typography (legacy flat shape) ───────────────────────────
export const Typography = {
  xs:        TypoTokens.size.xs,
  sm:        TypoTokens.size.sm,
  base:      TypoTokens.size.md,
  md:        TypoTokens.size.lg,
  lg:        TypoTokens.size.xl,
  xl:        TypoTokens.size.xxl,
  '2xl':     TypoTokens.size.h2,
  '3xl':     TypoTokens.size.h1,
  '4xl':     32,
  regular:   TypoTokens.weight.regular,
  medium:    TypoTokens.weight.medium,
  semiBold:  TypoTokens.weight.semibold,
  bold:      TypoTokens.weight.bold,
  extraBold: '800' as '800'
  } as const;

// ── Spacing ───────────────────────────────────────────────────
export const Spacing = {
  xs:    Space['1'],
  sm:    Space['2'],
  md:    Space['3'],
  base:  Space['4'],
  lg:    Space['5'],
  xl:    Space['6'],
  '2xl': Space['8'],
  '3xl': Space['10'],
  '4xl': Space['12']
  } as const;

// ── BorderRadius ──────────────────────────────────────────────
export const BorderRadius = {
  sm:    Radius.sm,
  md:    Radius.md,
  lg:    Radius.lg,
  xl:    Radius.xl,
  '2xl': 24,
  full:  Radius.full
  } as const;

// ── Shadow ─────────────────────────────────────────────────────
export const Shadow = {
  sm: {
    shadow: '#050507', elevation: Elevation.sm
  },
  md: {
    shadow: '#050507', elevation: Elevation.md
  },
  purple: {
    shadow: '#050507', elevation: Elevation.lg
  }
  } as const;
