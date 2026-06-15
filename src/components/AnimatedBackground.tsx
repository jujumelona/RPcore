// src/components/AnimatedBackground.tsx
// Background crossfade transition with optional slide/zoom variants.
// + useBackgroundManager: emotion state integration with BackgroundTriggerSystem

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  cancelAnimation } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { BackgroundTriggerSystem,
  type BackgroundConfig as TriggerBackgroundConfig,
  type EmotionState } from '../background/BackgroundTriggerSystem';

export type TransitionType = 'fade' | 'slide' | 'zoom';

interface AnimatedBackgroundProps {
  imageUrl: string;
  transitionType?: TransitionType;
  duration?: number;
  onTransitionComplete?: () => void;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  imageUrl,
  transitionType = 'fade',
  duration = 600,
  onTransitionComplete }) => {
  const [prevUrl, setPrevUrl]   = useState(imageUrl);
  const [nextUrl, setNextUrl]   = useState(imageUrl);
  const fadeAnim                = useSharedValue(1);
  const slideAnim               = useSharedValue(0);
  const scaleAnim               = useSharedValue(1);
  const isFirstRender           = useRef(true);

  const nextStyle = useAnimatedStyle(() => {
    if (transitionType === 'slide') {
      return { opacity: fadeAnim.value, transform: [{ translateY: slideAnim.value }] };
    }
    if (transitionType === 'zoom') {
      return { opacity: fadeAnim.value, transform: [{ scale: scaleAnim.value }] };
    }
    return { opacity: fadeAnim.value };
  });
  const handleTransitionComplete = useCallback(() => {
    setPrevUrl(imageUrl);
    onTransitionComplete?.();
  }, [imageUrl, onTransitionComplete]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (imageUrl === prevUrl) return;

    setNextUrl(imageUrl);
    fadeAnim.value  = 0;
    slideAnim.value = 40;
    scaleAnim.value = 1.08;

    if (transitionType === 'zoom') {
      fadeAnim.value  = withTiming(1, { duration });
      scaleAnim.value = withTiming(1, { duration }, finished => {
        if (finished) runOnJS(handleTransitionComplete)();
      });
    } else if (transitionType === 'slide') {
      fadeAnim.value  = withTiming(1, { duration }, finished => {
        if (finished) runOnJS(handleTransitionComplete)();
      });
      slideAnim.value = withTiming(0, { duration });
    } else {
      fadeAnim.value = withTiming(1, { duration }, finished => {
        if (finished) runOnJS(handleTransitionComplete)();
      });
    }

    return () => {
      cancelAnimation(fadeAnim);
      cancelAnimation(slideAnim);
      cancelAnimation(scaleAnim);
    };
  }, [duration, fadeAnim, handleTransitionComplete, imageUrl, prevUrl, scaleAnim, slideAnim, transitionType]);

  return (
    <View style={styles.container} pointerEvents="none">
      <Image source={{ uri: prevUrl }} style={styles.image} contentFit="cover" />
      {nextUrl !== prevUrl && (
        <Animated.View style={[StyleSheet.absoluteFill, nextStyle]}>
          <Image source={{ uri: nextUrl }} style={styles.image} contentFit="cover" />
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0 },
  image: {
    width:  '100%',
    height: '100%' } });

export interface BackgroundConfig extends TriggerBackgroundConfig {}

// ══════════════════════════════════════════════════════════════════
//  useBackgroundManager
//
//  감정 상태(EmotionState)를 옵셔널로 받아 BackgroundTriggerSystem에 전달.
//  ChatScreenRefactored에서:
//    const { checkBackgroundTrigger } = useBackgroundManager(backgrounds);
//    // AI 응답 완료 시:
//    checkBackgroundTrigger(content, currentEmotions).catch(() => {});
// ══════════════════════════════════════════════════════════════════

export const useBackgroundManager = (backgrounds: BackgroundConfig[]) => {
  const [currentBackground, setCurrentBackground] = useState<string>(backgrounds[0]?.id ?? '');
  const triggerSystemRef = useRef<BackgroundTriggerSystem | null>(null);

  useEffect(() => {
    if (!triggerSystemRef.current) {
      triggerSystemRef.current = new BackgroundTriggerSystem();
    }

    const firstId = backgrounds[0]?.id ?? '';
    setCurrentBackground(prev => {
      if (prev && backgrounds.some(bg => bg.id === prev)) return prev;
      return firstId;
    });

    if (firstId) {
      triggerSystemRef.current.setBackground(firstId);
    }
  }, [backgrounds]);

  useEffect(() => {
    return () => {
      triggerSystemRef.current?.destroy();
      triggerSystemRef.current = null;
    };
  }, []);

  /**
   * AI 응답 완료 후 호출.
   * @param message   AI 응답 텍스트
   * @param emotions  현재 캐릭터 감정 상태 (optional) — emotionStore에서 추출
   */
  const checkBackgroundTrigger = useCallback(
    async (message: string, emotions?: EmotionState) => {
      const triggerSystem = triggerSystemRef.current;
      if (!triggerSystem || backgrounds.length === 0) return;

      const triggeredId = triggerSystem.shouldTrigger(message, backgrounds, emotions);
      if (!triggeredId) return;

      triggerSystem.setBackground(triggeredId);
      setCurrentBackground(triggeredId);
    },
    [backgrounds],
  );

  const changeBackground = useCallback((backgroundId: string) => {
    triggerSystemRef.current?.setBackground(backgroundId);
    setCurrentBackground(backgroundId);
  }, []);

  const currentBackgroundUrl = useMemo(() => {
    const bg = backgrounds.find(b => b.id === currentBackground);
    return bg?.imageUrl ?? backgrounds[0]?.imageUrl ?? '';
  }, [backgrounds, currentBackground]);

  return {
    currentBackground,
    currentBackgroundUrl,
    checkBackgroundTrigger,
    changeBackground };
};
