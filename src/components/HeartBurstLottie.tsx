import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

interface HeartBurstLottieProps {
  visible: boolean;
  onDone: () => void;
  cx: number;
  cy: number;
  size?: number;
}

export function HeartBurstLottie({ visible, onDone, cx, cy, size = 120 }: HeartBurstLottieProps) {
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (visible) {
      animationRef.current?.play();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[styles.container, { left: cx - size / 2, top: cy - size / 2, width: size, height: size }]} pointerEvents="none">
      <LottieView
        ref={animationRef}
        source={require('../../../../assets/lottie/heart_burst.json')}
        style={{ width: size, height: size }}
        autoPlay={true}
        loop={false}
        onAnimationFinish={onDone}
        speed={1.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
});
