// src/components/OfflineBanner.tsx
import { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { CloudOff } from 'lucide-react-native';
import { useNetworkStatus } from '../../utils/NetworkMonitor';
import { Space, Spring, Typography } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const translateY = useSharedValue(-60);
  const opacity    = useSharedValue(0);
  // [BUG FIX] useRef → useState: readyRef 변경이 리렌더를 트리거하지 않아
  // 앱 시작 2초 이내 오프라인 전환 시 배너가 영영 안 보이는 버그 수정
  const [isReady, setIsReady] = useState(false);
  const t = useLanguageStore(s => s.t);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!isConnected) {
      translateY.value = withSpring(0, Spring.enter);
      opacity.value    = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(-60, Spring.dismiss);
      opacity.value    = withTiming(0, { duration: 150 });
    }
  }, [isConnected, isReady, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value }));

  return (
    <Animated.View style={[styles.banner, animStyle]} pointerEvents="none">
      <CloudOff size={16} color='#050507' />
      <Text style={styles.text}>{t?.offline ?? ''}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space['2'],
    gap: Space['2'],
    zIndex: 9999 },
  text: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: '#050507',
    letterSpacing: 0.3 } });
