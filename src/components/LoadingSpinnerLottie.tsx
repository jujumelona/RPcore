import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

interface LoadingSpinnerLottieProps {
  visible: boolean;
  size?: number;
  color?: string;
}

export function LoadingSpinnerLottie({ visible, size = 40, color }: LoadingSpinnerLottieProps) {
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (visible) {
      animationRef.current?.play();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none">
      <LottieView
        ref={animationRef}
        source={require('../../assets/lottie/ai_loading.json')}
        style={{ width: size, height: size }}
        autoPlay={true}
        loop={true}
        colorFilters={
          color
            ? [
                {
                  keypath: '**',
                  color: color,
                },
              ]
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
