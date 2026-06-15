// src/components/ui/SwipeReplyRow.tsx
// ─────────────────────────────────────────────────────────────────────────────
// 텔레그램/디스코드 스타일 "스와이프 → 답글" 인터랙션 컴포넌트
// • 오른쪽으로 슥 밀면 답글 아이콘이 나타나고 콜백 발동
// • Reanimated + PanGestureHandler로 60fps 보장
// • 답글 대상 프리뷰 표시
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CornerDownLeft } from 'lucide-react-native';
import { Typography } from '../../constants/tokens';

interface SwipeReplyRowProps {
  /** 답글 대상이 되는 댓글/메시지의 텍스트 (프리뷰용) */
  children: React.ReactNode;
  /** 스와이프 완료 시 호출 */
  onReply: () => void;
  /** 답글 기능 활성화 여부 */
  enabled?: boolean;
}

const SWIPE_THRESHOLD = 64;

export function SwipeReplyRow({ children, onReply, enabled = true }: SwipeReplyRowProps) {
  const translateX = useSharedValue(0);

  const triggerReply = useCallback(() => {
    onReply();
  }, [onReply]);

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(15)
    .failOffsetY([-10, 10])
    .onUpdate(e => {
      // 오른쪽으로만 이동 허용 (최대 100px)
      translateX.value = Math.max(0, Math.min(e.translationX, 100));
    })
    .onEnd(() => {
      if (translateX.value >= SWIPE_THRESHOLD) {
        runOnJS(triggerReply)();
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0, 0.4, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0.5, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={s.wrapper}>
      {/* 답글 아이콘 (스와이프 시 왼쪽에서 나타남) */}
      <Animated.View style={[s.replyIcon, iconStyle]}>
        <CornerDownLeft size={18} color="#D4A853" />
      </Animated.View>

      {/* 실제 콘텐츠 */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[s.content, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── 답글 대상 프리뷰 바 ─────────────────────────────────────────────────────
interface ReplyPreviewBarProps {
  replyToName: string;
  replyToText: string;
  onCancel: () => void;
}

export function ReplyPreviewBar({ replyToName, replyToText, onCancel }: ReplyPreviewBarProps) {
  return (
    <Animated.View style={s.previewBar}>
      <View style={s.previewAccent} />
      <View style={s.previewContent}>
        <Text style={s.previewName} numberOfLines={1}>↩ {replyToName}</Text>
        <Text style={s.previewText} numberOfLines={1}>{replyToText}</Text>
      </View>
      <Text style={s.previewCancel} onPress={onCancel}>✕</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  replyIcon: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: '100%',
  },
  content: {
    backgroundColor: 'transparent',
  },

  // 답글 프리뷰 바
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,168,83,0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,168,83,0.20)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  previewAccent: {
    width: 3,
    height: '100%',
    minHeight: 28,
    backgroundColor: '#D4A853',
    borderRadius: 2,
  },
  previewContent: {
    flex: 1,
  },
  previewName: {
    fontSize: 12,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold,
    marginBottom: 2,
  },
  previewText: {
    fontSize: 12,
    color: '#8A8A9E',
    fontFamily: Typography.fontFamily.regular,
  },
  previewCancel: {
    fontSize: 16,
    color: '#8A8A9E',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
