// src/components/ui/EmotionCard.tsx
// ══════════════════════════════════════════════════════════════
// 감정 기반 카드 컴포넌트
// 감정 색상을 적용한 재사용 가능한 카드
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { EmotionColors, EmotionType } from '../../constants/EmotionColors';
import { Radius } from '../../constants/tokens';

interface EmotionCardProps {
  children: React.ReactNode;
  emotion?: EmotionType;
  variant?: 'default' | 'outlined' | 'subtle';
  glow?: boolean;
  style?: ViewStyle;
}

export function EmotionCard({
  children,
  emotion = 'neutral',
  variant = 'default',
  glow = false,
  style
  }: EmotionCardProps) {
  const colors = EmotionColors[emotion];
  
  const getCardStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: Radius.md,
      padding: 14
  };
    
    if (variant === 'default') {
      return {
        ...baseStyle,
        backgroundColor: '#0C0C14',
        borderWidth: 1,
        borderColor: '#1A1A24'
  };
    }
    
    if (variant === 'outlined') {
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: colors.primary
  };
    }
    
    // subtle
    return {
      ...baseStyle,
      backgroundColor: colors.glow,
      borderWidth: 1,
      borderColor: colors.primary + '40'
  };
  };
  
  const glowStyle: ViewStyle = glow ? {
    elevation: 8
  } : {};
  
  return (
    <View style={[getCardStyle(), glowStyle, style]}>
      {children}
    </View>
  );
}

