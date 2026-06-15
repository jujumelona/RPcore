import { Typography } from '../../../constants/tokens';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  useSharedValue,
  useAnimatedStyle,
  cancelAnimation,
  runOnJS } from 'react-native-reanimated';
import { EMOTION_META } from '../constants';

function EmotionFlashChip({ eKey, val }: { eKey: string; val: number }) {
  const meta = EMOTION_META[eKey as keyof typeof EMOTION_META] ?? {
    icon: '◆',
    posColor: '#66EE99',
    negColor: '#FF7766',
    label: eKey };
  const isPos = val > 0;
  const color = isPos ? meta.posColor : meta.negColor;

  // [BUG 2 FIX] recycleItems 모드에서 LegendList가 아이템을 재활용할 때
  // 컴포넌트가 언마운트되지 않으므로 useSharedValue의 네이티브 핸들이 해제되지 않음.
  // 수정: 애니메이션(~2.5초) 완료 후 visible=false로 전환해 컴포넌트를 언마운트.
  // 언마운트 시 React/Reanimated GC가 4개의 SharedValue 네이티브 핸들을 즉시 해제.
  const [visible, setVisible] = useState(true);
  const hideChip = () => setVisible(false);

  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 150 });

    if (isPos) {
      translateY.value = withSequence(
        withSpring(-14, { damping: 8, stiffness: 400 }),
        withSpring(0, { damping: 14, stiffness: 200 }),
      );
    } else {
      translateX.value = withSequence(
        withTiming(-5, { duration: 60 }),
        withTiming(5, { duration: 60 }),
        withTiming(-4, { duration: 60 }),
        withTiming(4, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
    }

    // [BUG 2 FIX] 페이드아웃 완료(finished===true) 콜백에서 runOnJS(hideChip)()를 호출.
    // 컴포넌트가 언마운트되면 useSharedValue 4개의 네이티브 힙 핸들이 GC에 의해 해제됨.
    // recycleItems 모드에서 메시지가 쌓여도 각 칩이 ~2.5초 후 언마운트되므로
    // SharedValue 누적이 발생하지 않음.
    opacity.value = withDelay(
      2000,
      withTiming(0, { duration: 500 }, (finished) => {
        if (finished) runOnJS(hideChip)();
      }),
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };
  }, [isPos, opacity, scale, translateX, translateY]);

  const aStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ] as any }));

  // [BUG 2 FIX] 애니메이션 완료 후 null 반환 → React 트리에서 제거 → SharedValue GC
  if (!visible) return null;

  return (
    <Animated.View style={[styles.chip, { borderColor: `${color}55`, backgroundColor: `${color}18` }, aStyle]}>
      <Text style={styles.icon}>{meta.icon}</Text>
      <Text style={[styles.val, { color }]}>{isPos ? `+${val}` : String(val)}</Text>
    </Animated.View>
  );
}

export function EmotionFlash({ deltas }: { deltas: Record<string, number> }) {
  const entries = Object.entries(deltas).filter(([, v]) => v !== 0);
  if (!entries.length) {
    return null;
  }

  return (
    <View style={styles.row}>
      {entries.map(([key, val]) => (
        <EmotionFlashChip key={key} eKey={key} val={val} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginLeft: 44,
    marginBottom: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3 },
  icon: { fontSize: 12 },
  val: { fontSize: 11, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.3 } });
