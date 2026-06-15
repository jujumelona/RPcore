// src/components/ConfirmModal.tsx — v2 PREMIUM
import React, { ComponentType } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { PressableOpacity } from './PressableOpacity';
import { AlertCircle, Bell, CheckCircle, HelpCircle, Info,
  Star, Trash2, XCircle, LogOut, type LucideProps } from 'lucide-react-native';
import { Radius, Typography } from '../constants/tokens';

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  'trash-outline': Trash2, 'trash': Trash2,
  'alert-circle-outline': AlertCircle, 'alert-circle': AlertCircle,
  'information-circle-outline': Info, 'information-circle': Info,
  'checkmark-circle-outline': CheckCircle, 'checkmark-circle': CheckCircle,
  'help-circle-outline': HelpCircle,
  'star-outline': Star,
  'notifications-outline': Bell,
  'close-circle-outline': XCircle,
  'log-out-outline': LogOut };

export type ConfirmActionVariant = 'primary' | 'danger' | 'default' | 'ghost';

export interface ConfirmAction {
  label: string;
  onPress: () => void;
  variant?: ConfirmActionVariant;
}

export interface ConfirmModalProps {
  visible: boolean;
  icon?: string;
  iconColor?: string;
  title: string;
  message?: string;
  actions: ConfirmAction[];
  onRequestClose?: () => void;
}

export function ConfirmModal({
  visible, icon, iconColor = '#D4A853', title, message, actions, onRequestClose }: ConfirmModalProps) {
  if (!visible) return null;

  const IconComp = icon ? (ICON_MAP[icon] ?? Info) : null;
  const isDanger = iconColor === '#FF5555' || iconColor?.includes('255,85,85');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Animated.View entering={FadeIn.duration(180)} style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />

        <Animated.View
          entering={FadeInUp.springify().damping(26).stiffness(300).mass(0.85)}
          style={s.card}
        >
          {/* 아이콘 */}
          {IconComp && (
            <View style={[s.iconRing, isDanger ? s.iconRingDanger : s.iconRingNeutral]}>
              <IconComp size={22} color={iconColor} />
            </View>
          )}

          {/* 텍스트 */}
          <Text style={s.title}>{title}</Text>
          {!!message && <Text style={s.message}>{message}</Text>}

          {/* 버튼 */}
          <View style={s.actions}>
            {actions.map((action, i) => {
              const v = action.variant ?? 'default';
              return (
                <PressableOpacity
                  key={i}
                  activeOpacity={0.7}
                  style={[s.btn, s[`btn_${v}` as keyof typeof s] as object]}
                  onPress={action.onPress}
                >
                  <Text style={[s.btnTxt, s[`btnTxt_${v}` as keyof typeof s] as object]}>
                    {action.label}
                  </Text>
                </PressableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28 },
  card: {
    width: '100%',
    backgroundColor: '#0C0C14',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#111118',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center' },
  iconRing: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1 },
  iconRingNeutral: {
    backgroundColor: 'rgba(212,168,83,0.1)',
    borderColor: 'rgba(212,168,83,0.25)' },
  iconRingDanger: {
    backgroundColor: 'rgba(255,85,85,0.1)',
    borderColor: 'rgba(255,85,85,0.25)' },
  title: {
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2 },
  message: {
    fontSize: 14,
    color: '#6A6A82',
    textAlign: 'center',
    lineHeight: 21,
    fontFamily: Typography.fontFamily.regular,
    marginBottom: 4 },
  actions: {
    width: '100%',
    gap: 8,
    marginTop: 22 },
  btn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: Radius.md,
    alignItems: 'center' },
  btn_primary: { backgroundColor: 'rgba(212,168,83,0.15)', borderWidth: 1, borderColor: 'rgba(212,168,83,0.4)' },
  btn_danger:  { backgroundColor: 'rgba(255,85,85,0.12)', borderWidth: 1, borderColor: 'rgba(255,85,85,0.35)' },
  btn_default: { backgroundColor: '#141420', borderWidth: 1, borderColor: '#222230' },
  btn_ghost:   { backgroundColor: 'transparent' },
  btnTxt: { fontSize: 15, fontFamily: Typography.fontFamily.semibold },
  btnTxt_primary: { color: '#D4A853' },
  btnTxt_danger:  { color: '#FF6666' },
  btnTxt_default: { color: '#8A8A9E' },
  btnTxt_ghost:   { color: '#5A5A72', fontSize: 13, fontFamily: Typography.fontFamily.medium } });
