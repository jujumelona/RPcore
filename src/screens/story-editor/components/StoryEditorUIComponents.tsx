/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/StoryEditorUIComponents.tsx
 * StoryEditorScreen.tsx의 UI 컴포넌트들 (SectionTitle, GuideButton, FieldRow)
 */

import { Typography } from '../../../constants/tokens';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { TranslationFunction } from '../types/StoryEditorLegacyTypes';
import { getGuides } from '../utils/StoryEditorTranslationUtils';

// 섹션 타이틀 컴포넌트
export function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// 가이드 버튼 컴포넌트
export function GuideButton({ guideKey, t }: { guideKey: string; t: TranslationFunction }) {
  const [visible, setVisible] = useState(false);
  const guides = getGuides(t);
  return (
    <View>
      <TouchableOpacity style={styles.guideBtn} onPress={() => setVisible(v => !v)}>
        <Text style={styles.guideBtnText}>?</Text>
      </TouchableOpacity>
      {visible && (
        <TouchableOpacity activeOpacity={1} onPress={() => setVisible(false)} style={styles.guideBalloon}>
          <View style={styles.guideBalloonArrow} />
          <Text style={styles.guideBalloonText}>{guides[guideKey] ?? ''}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// 필드 행 컴포넌트
export function FieldRow({ label, guideKey, t, children }: { 
  label: string; 
  guideKey: string; 
  t: TranslationFunction; 
  children: React.ReactNode 
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <GuideButton guideKey={guideKey} t={t} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    marginTop: 20,
    marginBottom: 12 },
  guideBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.40)' },
  guideBtnText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold },
  guideBalloon: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: '#0C0C14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C38',
    padding: 10,
    width: 220,
    zIndex: 100 },
  guideBalloonArrow: {
    position: 'absolute',
    top: -6,
    right: 6,
    width: 10,
    height: 10,
    backgroundColor: '#0C0C14',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#2C2C38',
    transform: [{ rotate: '45deg' }] },
  guideBalloonText: {
    color: '#C8C8D4',
    fontSize: 11,
    lineHeight: 16 },
  fieldRow: {
    marginBottom: 16 },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
    color: '#A0A0B0' } });
