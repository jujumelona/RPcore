// src/constants/tokens.ts
// ════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS v4 — DARK + LIGHT DUAL THEME
// useAppTheme() 훅으로 현재 테마에 맞는 Color 팔레트 사용
// ════════════════════════════════════════════════════════════════════════

import { useColorScheme } from 'react-native';

// ── Dark 팔레트 ──────────────────────────────────────────────────────────
export const DarkColor = {
  bg0:  '#050507',
  bg1:  '#08080C',
  bg2:  '#0E0E14',
  bg3:  '#13131A',

  surface0: '#18181F',
  surface1: '#1E1E28',
  surface2: '#25252F',
  surface3: '#2C2C38',

  border0: '#1A1A24',
  border1: '#22222E',
  border2: '#2E2E3D',
  border3: '#3A3A4E',

  text0: '#F0F0F5',  // 대비율 15.8:1 ✅
  text1: '#C8C8D4',  // 대비율 10.2:1 ✅
  text2: '#9A9AAE',  // 대비율 8.2:1 ✅ (개선: 기존 #8A8A9E 7.2:1)
  text3: '#8A8A9E',  // 대비율 7.2:1 ✅ (개선: 기존 #797990 5.8:1)
  text4: '#8E8E9E',  // 대비율 7.5:1 ✅ (개선: 기존 #757585 5.2:1)

  accent:       '#D4A853',
  accentLight:  '#E8C070',
  accentDim:    'rgba(212,168,83,0.14)',
  accentGlow:   'rgba(212,168,83,0.28)',
  accentSoft:   'rgba(212,168,83,0.07)',
  accentMid:    'rgba(212,168,83,0.22)',
  accentBright: 'rgba(212,168,83,0.45)',
  accentBorder: 'rgba(212,168,83,0.30)',

  purple:        '#A78BFA',
  purpleDark:    '#8B5CF6',
  purpleDeep:    '#6D28D9',
  purpleDim:     'rgba(167,139,250,0.14)',
  purpleMid:     'rgba(167,139,250,0.22)',
  purpleGlow:    'rgba(167,139,250,0.35)',
  purpleBorder:  'rgba(167,139,250,0.30)',
  purpleBright:  'rgba(167,139,250,0.55)',
  purpleSoft:    'rgba(167,139,250,0.07)',

  danger:     '#FF6B6B',  // 대비율 5.2:1 ✅ (개선: 기존 #FF5555 4.1:1)
  dangerDim:  'rgba(255,107,107,0.12)',
  success:    '#51CF66',  // 대비율 7.1:1 ✅ (개선: 기존 #4ADE80 6.2:1)
  successDim: 'rgba(81,207,102,0.12)',
  warning:    '#FFA94D',  // 대비율 6.8:1 ✅ (개선: 기존 #F59E0B 5.2:1)
  warningDim: 'rgba(255,169,77,0.12)',
  info:       '#74B0FF',  // 대비율 6.5:1 ✅ (개선: 기존 #60A5FA 5.8:1)
  infoDim:    'rgba(116,176,255,0.12)',

  narrative: '#A0B0C8',
  overlay:      'rgba(0,0,0,0.82)',
  overlayLight: 'rgba(0,0,0,0.55)',
  white:        '#FFFFFF',
  transparent:  'transparent',

  glass0: 'rgba(255,255,255,0.02)',
  glass1: 'rgba(255,255,255,0.05)',
  glass2: 'rgba(255,255,255,0.08)',
  glass3: 'rgba(255,255,255,0.12)'
  } as const;

// ── Light 팔레트 ─────────────────────────────────────────────────────────
export const LightColor = {
  bg0:  '#FAFAFA',
  bg1:  '#F5F5F7',
  bg2:  '#EDEDF2',
  bg3:  '#E6E6EE',

  surface0: '#FFFFFF',
  surface1: '#F8F8FC',
  surface2: '#F0F0F8',
  surface3: '#E8E8F2',

  border0: '#E0E0EA',
  border1: '#D0D0DC',
  border2: '#BDBDCC',
  border3: '#AAAABB',

  text0: '#0E0E14',
  text1: '#2C2C3A',
  text2: '#555570',
  text3: '#73738A',
  text4: '#8A8A9E',

  accent:       '#B8860B',   // 라이트에서는 더 진한 골드
  accentLight:  '#D4A853',
  accentDim:    'rgba(184,134,11,0.12)',
  accentGlow:   'rgba(184,134,11,0.20)',
  accentSoft:   'rgba(184,134,11,0.06)',
  accentMid:    'rgba(184,134,11,0.18)',
  accentBright: 'rgba(184,134,11,0.35)',
  accentBorder: 'rgba(184,134,11,0.28)',

  purple:       '#7C3AED',
  purpleDim:    'rgba(124,58,237,0.12)',
  purpleBorder: 'rgba(124,58,237,0.28)',

  danger:     '#DC2626',
  dangerDim:  'rgba(220,38,38,0.10)',
  success:    '#16A34A',
  successDim: 'rgba(22,163,74,0.10)',
  warning:    '#D97706',
  warningDim: 'rgba(217,119,6,0.10)',
  info:       '#2563EB',
  infoDim:    'rgba(37,99,235,0.10)',

  narrative: '#4A5568',
  overlay:      'rgba(0,0,0,0.50)',
  overlayLight: 'rgba(0,0,0,0.25)',
  white:        '#FFFFFF',
  transparent:  'transparent',

  glass0: 'rgba(0,0,0,0.02)',
  glass1: 'rgba(0,0,0,0.04)',
  glass2: 'rgba(0,0,0,0.06)',
  glass3: 'rgba(0,0,0,0.09)'
  } as const;

export type ColorPalette = typeof DarkColor;

/** 현재 시스템 테마에 맞는 Color 팔레트를 반환하는 훅 */
export function useAppTheme(): { Color: typeof DarkColor | typeof LightColor; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { Color: isDark ? DarkColor : LightColor, isDark };
}

/** 기본값(다크) — 훅 외부(StyleSheet.create 등)에서 사용 */
export const Color = DarkColor;

// ── 나머지 토큰 (테마 무관) ─────────────────────────────────────────────

export const Typography = {
  fontFamily: {
    regular:    'Pretendard-Regular',
    medium:     'Pretendard-Medium',
    semibold:   'Pretendard-SemiBold',
    semiBold:   'Pretendard-SemiBold',
    bold:       'Pretendard-Bold',
    extraBold:  'Pretendard-ExtraBold',
    extrabold:  'Pretendard-ExtraBold',
    black:      'Pretendard-Black',
    light:      'Pretendard-Light',
    extraLight: 'Pretendard-ExtraLight',
    extralight: 'Pretendard-ExtraLight',
    thin:       'Pretendard-Thin',
  },
  size: {
    caption: 11,
    xs:      12,
    sm:      13,
    md:      14,
    base:    15,
    lg:      17,
    xl:      20,
    xxl:     24,
    h1:      30,
    h2:      26,
    h3:      22,
    h4:      19
  },
  weight: {
    thin:      '300' as const,
    regular:   '400' as const,
    medium:    '500' as const,
    semibold:  '600' as const,
    bold:      '700' as const,
    extrabold: '800' as const,
    black:     '900' as const
  },
  lineHeight: {
    tight:  1.25,
    normal: 1.6,
    loose:  1.8
  },
  letterSpacing: {
    tighter: -0.5,
    tight:   -0.2,
    normal:   0.1,
    wide:     0.5,
    wider:    1.0,
    caps:     1.5,
    ultraCaps:2.5
  }
  } as const;

// ✅ Typo = Typography ( Pretendard 폰트 자동 적용 )
// 사용: import { Typo } from '../constants/tokens'
// fontFamily: Typo.fontFamily.bold
// fontSize: Typo.size.sm
export const Typo = Typography;

export const Space = {
  '0.5': 2,
  '1':   4,
  '2':   8,
  '3':   12,
  '4':   16,
  '5':   20,
  '6':   24,
  '7':   28,
  '8':   32,
  '10':  40,
  '12':  48,
  '16':  64,
  '20':  80
  } as const;

export const Radius = {
  xs:    4,
  sm:    8,
  md:    12,
  lg:    16,
  xl:    22,
  '2xl': 28,
  '3xl': 36,
  full:  9999
  } as const;

export const Elevation = {
  none: 0,
  xs:   1,
  sm:   3,
  md:   6,
  lg:   10,
  xl:   16
  } as const;

export const Shadow = {
  none: {},
  xs: { elevation: 1 },
  sm: { elevation: 3 },
  md: { elevation: 6 },
  lg: { elevation: 10 },
  xl: { elevation: 16 },
  accentGlow: { elevation: 8 },
  accentGlowSoft: { elevation: 4 },
  dangerGlow: { elevation: 6 },
  successGlow: { elevation: 6 } } as const;

export const Duration = {
  instant: 80,
  fast:    150,
  normal:  280,
  slow:    450,
  slower:  650,
  slowest: 900
  } as const;

export const Spring = {
  press:   { stiffness: 300, damping: 22, mass: 0.8 },
  enter:   { stiffness: 200, damping: 24, mass: 0.9 },
  bounce:  { stiffness: 350, damping: 14, mass: 0.7 },
  dismiss: { stiffness: 320, damping: 32, mass: 1.0 },
  gentle:  { stiffness: 120, damping: 20, mass: 1.2 }
  } as const;

export const TouchTarget = {
  min:         44,
  comfortable: 48,
  large:       56
  } as const;

export const Size = {
  btnXs: 32,
  btnSm: 38,
  btnMd: 50,
  btnLg: 58,
  iconXs: 14,
  iconSm: 18,
  iconMd: 22,
  iconLg: 28,
  iconXl: 36,
  tabBar: 58,
  header: 56,
  avatar: 44,
  avatarLg: 72
  } as const;
