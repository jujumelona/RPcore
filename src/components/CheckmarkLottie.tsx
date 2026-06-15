import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

interface CheckmarkLottieProps {
  visible: boolean;
  size?: number;
  onAnimationFinish?: () => void;
  color?: string;
}

export function CheckmarkLottie({ visible, size = 24, onAnimationFinish, color }: CheckmarkLottieProps) {
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
        source={require('../../assets/lottie/story_complete.json')}
        style={{ width: size, height: size }}
        autoPlay={true}
        loop={false}
        speed={1.2}
        onAnimationFinish={onAnimationFinish}
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
