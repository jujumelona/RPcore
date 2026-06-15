// src/constants/EmotionColors.ts
// ══════════════════════════════════════════════════════════════
// 감정 기반 색상 시스템
// 캐릭터의 감정 상태를 시각적으로 표현하기 위한 색상 팔레트
// ══════════════════════════════════════════════════════════════

export type EmotionType = 'e1_joy' | 'e2_sadness' | 'e3_anger' | 'e4_fear' | 'e5_love' | 'neutral';

export interface EmotionColorScheme {
  primary: string;
  secondary: string;
  gradient: [string, string];
  glow: string;
  text: string;
}

/**
 * 감정별 색상 팔레트
 * 각 감정은 primary, secondary, gradient, glow 색상을 가짐
 */
export const EmotionColors: Record<EmotionType, EmotionColorScheme> = {
  // 기쁨 - 밝은 노랑/오렌지
  e1_joy: {
    primary: '#FFD93D',
    secondary: '#FFA94D',
    gradient: ['#FFD93D', '#FFA94D'],
    glow: 'rgba(255, 217, 61, 0.3)',
    text: '#050507' },
  
  // 슬픔 - 차분한 파랑
  e2_sadness: {
    primary: '#6B9BD1',
    secondary: '#4A7BA7',
    gradient: ['#6B9BD1', '#4A7BA7'],
    glow: 'rgba(107, 155, 209, 0.3)',
    text: '#F0F0F5' },
  
  // 분노 - 강렬한 빨강
  e3_anger: {
    primary: '#FF6B6B',
    secondary: '#C92A2A',
    gradient: ['#FF6B6B', '#C92A2A'],
    glow: 'rgba(255, 107, 107, 0.3)',
    text: '#F0F0F5' },
  
  // 두려움 - 보라
  e4_fear: {
    primary: '#9B59B6',
    secondary: '#6C3483',
    gradient: ['#9B59B6', '#6C3483'],
    glow: 'rgba(155, 89, 182, 0.3)',
    text: '#F0F0F5' },
  
  // 사랑 - 핑크
  e5_love: {
    primary: '#FF85C0',
    secondary: '#E056A0',
    gradient: ['#FF85C0', '#E056A0'],
    glow: 'rgba(255, 133, 192, 0.3)',
    text: '#F0F0F5' },
  
  // 중립 - 골드 (기존 accent 색상)
  neutral: {
    primary: '#D4A853',
    secondary: '#B8923D',
    gradient: ['#D4A853', '#B8923D'],
    glow: 'rgba(212, 168, 83, 0.3)',
    text: '#050507' } };

/**
 * 감정 강도에 따른 색상 보간
 */
export function getEmotionColor(emotion: EmotionType, intensity: number): string {
  const colors = EmotionColors[emotion];
  const normalizedIntensity = Math.abs(intensity) / 100;
  return interpolateColor(colors.primary, colors.secondary, normalizedIntensity);
}

function interpolateColor(color1: string, color2: string, factor: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  
  if (!c1 || !c2) return color1;
  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);
  
  return rgbToHex(r, g, b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16) }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function getEmotionName(emotion: EmotionType, lang: 'ko' | 'en' = 'ko'): string {
  const names = {
    ko: {
      e1_joy: '기쁨',
      e2_sadness: '슬픔',
      e3_anger: '분노',
      e4_fear: '두려움',
      e5_love: '사랑',
      neutral: '중립' },
    en: {
      e1_joy: 'Joy',
      e2_sadness: 'Sadness',
      e3_anger: 'Anger',
      e4_fear: 'Fear',
      e5_love: 'Love',
      neutral: 'Neutral' } };
  
  return names[lang][emotion];
}
