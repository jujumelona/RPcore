// src/components/ui/BlurHeader.tsx
// Android-only header with scroll-based opacity transition

import { Typography } from '../../constants/tokens';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  type SharedValue } from 'react-native-reanimated';
import { PressableOpacity as TouchableOpacity } from '../PressableOpacity';
import { ArrowLeft } from 'lucide-react-native';

interface BlurHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightActions?: React.ReactNode;
  scrollY?: SharedValue<number>;
  blurIntensity?: number;
}

export function BlurHeader({
  title,
  subtitle,
  onBack,
  rightActions,
  scrollY }: BlurHeaderProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    const opacity = interpolate(scrollY.value, [0, 50], [0, 1], Extrapolate.CLAMP);
    return { opacity };
  });

  return (
    <View style={styles.container}>
      {/* Android semi-transparent background */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.bg, animatedStyle]}
      />

      <View style={styles.content}>
        {onBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color="#F0F0F5" />
          </TouchableOpacity>
        )}

        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          )}
        </View>

        {rightActions && (
          <View style={styles.rightActions}>{rightActions}</View>
        )}
      </View>

      <View style={styles.bottomBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(139,92,246,0.15)',
    zIndex: 10,
    elevation: 4 },
  bg: {
    backgroundColor: 'rgba(8,8,12,0.92)' },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12 },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.20)' },
  titleContainer: {
    flex: 1,
    justifyContent: 'center' },
  title: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' },
  subtitle: {
    fontSize: 11,
    color: '#8A8A9E',
    marginTop: 2,
    fontFamily: Typography.fontFamily.regular },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4 },
  bottomBorder: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.12)' } });
