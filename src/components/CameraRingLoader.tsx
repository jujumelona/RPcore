import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, cancelAnimation } from 'react-native-reanimated';

interface CameraRingLoaderProps {
  visible?: boolean;
}

export function CameraRingLoader({ visible = true }: CameraRingLoaderProps) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.8);

  React.useEffect(() => {
    if (!visible) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1000 }),
        withTiming(0.6, { duration: 0 })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1000 }),
        withTiming(0.8, { duration: 0 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [visible, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050507',
  },
  ring: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: 'rgba(212, 168, 83, 0.5)',
  },
});