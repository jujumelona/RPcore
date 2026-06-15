// src/components/ui/BottomSheet.tsx
// ══════════════════════════════════════════════════════════════
// 바텀 시트 모달 컴포넌트
// 부드러운 슬라이드 애니메이션 + 제스처 지원
// ══════════════════════════════════════════════════════════════

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PressableOpacity as TouchableOpacity } from '../PressableOpacity';
import { X } from 'lucide-react-native';
import { Shadow, Typography } from '../../constants/tokens';

const { height: SCREEN_HEIGHT } = (Dimensions.get('window') ?? { width: 375, height: 812 });
const MAX_TRANSLATE_Y = -SCREEN_HEIGHT + 50;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  snapPoints?: number[];
  enableBlur?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  snapPoints = [0.5, 0.9],
  enableBlur = true }: BottomSheetProps) {
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const backdropOpacity = useSharedValue(0);
  
  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(MAX_TRANSLATE_Y * snapPoints[0], {
        damping: 50,
        stiffness: 400 });
      backdropOpacity.value = withTiming(1, { duration: 300 });
    } else {
      translateY.value = withTiming(0, { duration: 250 });
      backdropOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [visible, translateY, backdropOpacity, snapPoints]);
  
  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      translateY.value = Math.max(
        event.translationY + context.value.y,
        MAX_TRANSLATE_Y * snapPoints[1]
      );
    })
    .onEnd((event) => {
      if (event.translationY > 100) {
        translateY.value = withTiming(0, { duration: 250 });
        runOnJS(onClose)();
      } else {
        const snapPoint = event.velocityY > 0 ? snapPoints[0] : snapPoints[1];
        translateY.value = withSpring(MAX_TRANSLATE_Y * snapPoint, {
          damping: 50,
          stiffness: 400 });
      }
    });
  
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));
  
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value }));
  
  if (!visible) return null;
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* 백드롭 */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          >
            {enableBlur && Platform.OS === 'ios' ? (
              <View style={styles.overlayBg} />
            ) : (
              <View style={styles.backdrop} />
            )}
          </TouchableOpacity>
        </Animated.View>
        
        {/* 시트 */}
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* 핸들 */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
            
            {/* 헤더 */}
            {(title || subtitle) && (
              <View style={styles.header}>
                <View style={styles.headerText}>
                  {title && <Text style={styles.title}>{title}</Text>}
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={20} color="#8A8A9E" />
                </TouchableOpacity>
              </View>
            )}
            
            {/* 콘텐츠 */}
            <View style={styles.content}>
              {children}
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  sheet: {
    position: 'absolute',
    top: SCREEN_HEIGHT,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: '#0E0E14',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#181820',
    ...Shadow.xl },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12 },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#222232',
    borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24' },
  headerText: {
    flex: 1 },
  title: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' },
  subtitle: {
    fontSize: 13,
    color: '#8A8A9E',
    marginTop: 4,
    fontFamily: Typography.fontFamily.regular },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#0C0C14',
    marginLeft: 12 },
  content: {
    flex: 1,
    padding: 20 },
  overlayBg: {backgroundColor: 'rgba(8,8,12,0.92)'}
});
