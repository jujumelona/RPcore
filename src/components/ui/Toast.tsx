// src/components/ui/Toast.tsx
// ✅ UX v3 — 큐 시스템 + 스와이프 닫기 + 햅틱 + BlurView
// - 최대 3개 큐, FIFO
// - 스와이프 위로 -> 즉시 닫기
// - 타입별 햅틱 패턴 (success: 짧게, error: 두 번)

import { triggerHaptic } from '../../utils/haptics';
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Vibration, PanResponder } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { CheckCircle, AlertCircle, Info, XCircle, X } from 'lucide-react-native';
import { Radius, Shadow, Typography } from '../../constants/tokens';
import { PressableOpacity } from '../PressableOpacity';
import { useLanguageStore } from '../../store/languageStore';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onHide?: () => void;
  position?: 'top' | 'bottom';
}

const TYPE_CONFIG: Record<ToastType, { color: string; bgTint: string; haptic: number[] }> = {
  success: { color: '#4ADE80', bgTint: 'rgba(74,222,128,0.12)',  haptic: [15] },
  error:   { color: '#FF5555', bgTint: 'rgba(255,85,85,0.12)',   haptic: [15, 80, 15] },
  warning: { color: '#F59E0B', bgTint: 'rgba(245,158,11,0.12)', haptic: [20] },
  info:    { color: '#60A5FA', bgTint: 'rgba(96,165,250,0.12)',  haptic: [8] } };

function ToastIcon({ type, color }: { type: ToastType; color: string }) {
  const sz = 18;
  switch (type) {
    case 'success': return <CheckCircle size={sz} color={color} />;
    case 'error':   return <XCircle     size={sz} color={color} />;
    case 'warning': return <AlertCircle size={sz} color={color} />;
    default:        return <Info        size={sz} color={color} />;
  }
}

export function Toast({
  visible, message, type = 'info',
  duration = 3000, onHide, position = 'top' }: ToastProps) {
  const t = useLanguageStore(s => s.t);
  const cfg = TYPE_CONFIG[type];

  const translateY = useSharedValue(position === 'top' ? -120 : 120);
  const opacity    = useSharedValue(0);
  const swipeY     = useSharedValue(0);

  const hide = useCallback(() => {
    translateY.value = withTiming(position === 'top' ? -120 : 120, { duration: 220 });
    opacity.value    = withTiming(0, { duration: 220 });
    if (onHide) setTimeout(() => runOnJS(onHide)(), 220);
  }, [onHide, position, translateY, opacity]);

  useEffect(() => {
    if (!visible) return;

    // 햅틱
    if (cfg.haptic.length === 1) {
      Vibration.vibrate(cfg.haptic[0]);
    } else {
      Vibration.vibrate(cfg.haptic);
    }

    // 등장
    translateY.value = withSpring(0, { damping: 22, stiffness: 280 });
    opacity.value    = withTiming(1, { duration: 180 });

    const timer = setTimeout(hide, duration);
    return () => clearTimeout(timer);
  }, [visible]); // eslint-disable-line

  // 스와이프 닫기 (PanResponder 사용 — Reanimated GestureHandler 없이)
  const panRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        const dir = position === 'top' ? -1 : 1;
        if (g.dy * dir > 0) swipeY.value = g.dy;
      },
      onPanResponderRelease: (_, g) => {
        const dir = position === 'top' ? -1 : 1;
        if (g.dy * dir > 30) {
          triggerHaptic('select');
          runOnJS(hide)();
        } else {
          swipeY.value = withSpring(0);
        }
      } })
  ).current;

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + swipeY.value }],
    opacity:   opacity.value }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        st.container,
        position === 'top' ? st.top : st.bottom,
        containerStyle,
      ]}
      {...panRef.panHandlers}
    >
      <BlurView intensity={85} tint="dark" style={st.blur}>
        <View style={[st.content, { borderLeftColor: cfg.color, backgroundColor: cfg.bgTint }]}>
          <ToastIcon type={type} color={cfg.color} />
          <Text style={st.message} numberOfLines={2}>{message}</Text>
          <PressableOpacity
            onPress={hide}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t?.close ?? 'Close'}
            accessibilityRole="button"
          >
            <X size={14} color="#5A5A6E" />
          </PressableOpacity>
        </View>
      </BlurView>
    </Animated.View>
  );
}

// ── ToastManager 싱글톤 ──────────────────────────────────────────────────────
export interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
  position?: 'top' | 'bottom';
}

type ToastListener = (config: ToastConfig) => void;

class ToastManager {
  private listeners: ToastListener[] = [];

  show(config: ToastConfig) {
    this.listeners.forEach(l => l(config));
  }

  success(message: string) { this.show({ message, type: 'success' }); }
  error(message: string)   { this.show({ message, type: 'error' }); }
  warning(message: string) { this.show({ message, type: 'warning' }); }
  info(message: string)    { this.show({ message, type: 'info' }); }

  addListener(listener: ToastListener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }
}

export const toastManager = new ToastManager();

const st = StyleSheet.create({
  container: {
    position: 'absolute', left: 16, right: 16, zIndex: 9999,
    ...Shadow.lg },
  top:    { top: 56 },
  bottom: { bottom: 100 },
  blur:   { borderRadius: Radius.md, overflow: 'hidden' },
  content: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 10,
    borderLeftWidth: 3,
    backgroundColor: 'rgba(14,14,20,0.85)' },
  message: {
    flex: 1, fontSize: 13, color: '#E8E8F0',
    fontFamily: Typography.fontFamily.medium, lineHeight: 19 } });
