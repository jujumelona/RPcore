import { Dimensions } from 'react-native';
import { useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing } from 'react-native-reanimated';

const { width, height } = (Dimensions.get('window') ?? { width: 375, height: 812 });



// Hook for easy animation usage
export const useFadeAnimation = (initialValue: number = 0) => {
  const opacity = useSharedValue(initialValue);
  
  const fadeIn = (duration: number = 300) => {
    opacity.value = withTiming(1, { duration, easing: Easing.out(Easing.ease) });
  };

  const fadeOut = (duration: number = 300) => {
    opacity.value = withTiming(0, { duration, easing: Easing.in(Easing.ease) });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  return { animatedStyle, fadeIn, fadeOut, opacity };
};

/* eslint-disable @typescript-eslint/no-unused-vars */
export const useScaleAnimation = (initialValue: number = 1) => {
  const scale = useSharedValue(initialValue);
  
  const scaleTo = (value: number, _duration: number = 300) => {
    scale.value = withSpring(value, {
      damping: 15,
      stiffness: 150 });
  };

  const pulse = (duration: number = 1000) => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: duration / 2 }),
        withTiming(1, { duration: duration / 2 })
      ),
      -1,
      false
    );
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }] }));

  return { animatedStyle, scaleTo, pulse, scale };
};

export const useSlideAnimation = (direction: 'left' | 'right' | 'up' | 'down' = 'up', _initialValue: number = 0) => {
  const translateX = useSharedValue(direction === 'left' ? -width : direction === 'right' ? width : 0);
  const translateY = useSharedValue(direction === 'up' ? -height : direction === 'down' ? height : 0);
  
  const slideIn = (_duration: number = 300) => {
    if (direction === 'left' || direction === 'right') {
      translateX.value = withSpring(0, {
        damping: 15,
        stiffness: 150 });
    } else {
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 150 });
    }
  };

  const slideOut = (_duration: number = 300) => {
    if (direction === 'left') {
      translateX.value = withTiming(-width, { duration: _duration });
    } else if (direction === 'right') {
      translateX.value = withTiming(width, { duration: _duration });
    } else if (direction === 'up') {
      translateY.value = withTiming(-height, { duration: _duration });
    } else {
      translateY.value = withTiming(height, { duration: _duration });
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    const transforms = [];
    if (translateX.value !== 0) {
      transforms.push({ translateX: translateX.value });
    }
    if (translateY.value !== 0) {
      transforms.push({ translateY: translateY.value });
    }
    return {
      transform: transforms
    };
  });

  return { animatedStyle, slideIn, slideOut };
};