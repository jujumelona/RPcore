/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/StoryEditorIcons.tsx
 * StoryEditorScreen.tsx의 아이콘 컴포넌트들
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Copy, Check, Trash2, ClipboardPaste, Diamond, RefreshCw } from 'lucide-react-native';

const styles = StyleSheet.create({
  iconWrapper: {
    marginRight: 6 },
  iconWrapper12: {
    width: 12,
    height: 12,
    marginRight: 6 },
  iconWrapper12x15: {
    width: 12,
    height: 15,
    marginRight: 6 } });

// 아이콘 컴포넌트들
export function BwIcoCopy({ c = '#F0F0F5', size = 13 }: { c?: string; size?: number }) {
  return (
    <View style={[styles.iconWrapper, { width: size, height: size }]}>
      <Copy size={size} color={c} />
    </View>
  );
}

export function BwIcoCheck({ c = '#F0F0F5' }: { c?: string }) {
  return (
    <View style={styles.iconWrapper12}>
      <Check size={12} color={c} />
    </View>
  );
}

export function BwIcoTrash({ c = '#8A8A9E' }: { c?: string }) {
  return (
    <View style={styles.iconWrapper12x15}>
      <Trash2 size={12} color={c} />
    </View>
  );
}

export function BwIcoPaste({ c = '#F0F0F5', size = 13 }: { c?: string; size?: number }) {
  return (
    <View style={[styles.iconWrapper, { width: size, height: size }]}>
      <ClipboardPaste size={size} color={c} />
    </View>
  );
}

export function BwIcoDiamond({ c = '#8A8A9E', size = 11 }: { c?: string; size?: number }) {
  return (
    <View style={[styles.iconWrapper, { width: size, height: size }]}>
      <Diamond size={size} color={c} />
    </View>
  );
}

export function BwIcoRefresh({ c = '#8A8A9E' }: { c?: string }) {
  return (
    <View style={styles.iconWrapper12}>
      <RefreshCw size={12} color={c} />
    </View>
  );
}
