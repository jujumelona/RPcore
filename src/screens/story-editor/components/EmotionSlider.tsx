/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/EmotionSlider.tsx
 * StoryEditorScreen.tsx의 감정 슬라이더 컴포넌트
 */

import { Typography } from '../../../constants/tokens';
import React, { useRef } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

const { width } = (Dimensions.get('window') ?? { width: 375, height: 812 });
const PAD = 16;
const TRACK_W = width - PAD * 2 - 32;

type EmotionItem = { 
  code: string; 
  label: string; 
  negLabel: string; 
  posLabel: string 
};

interface EmotionSliderProps {
  emotion: EmotionItem;
  value: number;
  onChange: (v: number) => void;
}

export function EmotionSlider({ emotion, value, onChange }: EmotionSliderProps) {
  const clamp = (x: number) => Math.max(-100, Math.min(100, Math.round(x || 0)));
  const val = value ?? 0;
  const color = val > 0 ? '#F0F0F5' : val < 0 ? '#797990' : '#8A8A9E';

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const trackWidthRef = useSharedValue(TRACK_W);
  const startVal = useSharedValue(val);
  const currentVal = useSharedValue(val);
  currentVal.value = val;

  const handleChange = (v: number) => {
    onChangeRef.current(v);
  };

  const panGesture = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => { startVal.value = currentVal.value; })
    .onUpdate(e => {
      const next = clamp(startVal.value + (e.translationX / trackWidthRef.value) * 200);
      runOnJS(handleChange)(next);
    })
    .simultaneousWithExternalGesture();

  const pct = (val + 100) / 200;
  const thumbX = pct * TRACK_W;

  return (
    <View style={styles.emotionSliderRow}>
      <View style={styles.emotionLabelRow}>
        <Text style={styles.emotionLabel}>{emotion.label}</Text>
        <Text style={styles.emotionNegLabel}>{emotion.negLabel}</Text>
        <Text style={[styles.emotionValue, { color }]}>{val > 0 ? `+${val}` : `${val}`}</Text>
        <Text style={styles.emotionPosLabel}>{emotion.posLabel}</Text>
      </View>
      <GestureDetector gesture={panGesture}>
        <View
          style={[styles.emotionTrack, { width: TRACK_W }]}
          onLayout={e => { trackWidthRef.value = e.nativeEvent.layout.width; }}
        >
          <View style={styles.emotionTrackBar} />
          <View style={styles.emotionCenter} />
          <View style={[styles.emotionThumb, { left: thumbX - 12, backgroundColor: color }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  emotionSliderRow: {
    marginBottom: 16
  },
  emotionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  emotionLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
    flex: 1
  },
  emotionNegLabel: {
    fontSize: 11,
    color: '#797990',
    marginRight: 8
  },
  emotionValue: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    minWidth: 40,
    textAlign: 'center'
  },
  emotionPosLabel: {
    fontSize: 11,
    color: '#F0F0F5',
    marginLeft: 8
  },
  emotionTrack: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  emotionTrackBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#2C2C38',
    borderRadius: 2
  },
  emotionCenter: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: 12,
    backgroundColor: '#4ADE80',
    marginLeft: -1
  },
  emotionThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1A1A24',
    elevation: 4
  }
  });
