// src/components/ui/EmotionButton.tsx
// ══════════════════════════════════════════════════════════════
// 감정 기반 버튼 컴포넌트
// 감정 색상을 적용한 재사용 가능한 버튼
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { EmotionColors, EmotionType } from '../../constants/EmotionColors';
import { Radius, Shadow, Typography } from '../../constants/tokens';

interface EmotionButtonProps {
  children: string;
  onPress: () => void;
  emotion?: EmotionType;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function EmotionButton({
  children,
  onPress,
  emotion = 'neutral',
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle }: EmotionButtonProps) {
  const colors = EmotionColors[emotion];
  
  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: Radius.lg,
      padding: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48 };
    
    if (variant === 'primary') {
      return {
        ...baseStyle,
        backgroundColor: colors.primary,
        ...Shadow.md };
    }
    
    if (variant === 'secondary') {
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: colors.primary };
    }
    
    // ghost
    return {
      ...baseStyle,
      backgroundColor: 'transparent' };
  };
  
  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontSize: 15,
      fontFamily: Typography.fontFamily.bold };
    
    if (variant === 'primary') {
      return {
        ...baseStyle,
        color: colors.text };
    }
    
    return {
      ...baseStyle,
      color: colors.primary };
  };
  
  return (
    <TouchableOpacity
      style={[
        getButtonStyle(),
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.text : colors.primary} />
      ) : (
        <Text style={[getTextStyle(), textStyle]}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4 } });
