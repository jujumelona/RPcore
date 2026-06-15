// src/components/Toast.tsx
// ═══════════════════════════════════════════════════════════════════
// ToastService  — 어디서든 호출 가능한 싱글턴 토스트 서비스
// ToastContainer — App.tsx 루트에 1회만 마운트
//
// 사용법:
//   ToastService.info('메시지')
//   ToastService.success('저장 완료')
//   ToastService.error('오류가 발생했어요')
//
// App.tsx:
//   import { ToastContainer } from './Toast';
//   <ToastContainer />   ← 루트 레이아웃 최상단에 배치
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated,
  StyleSheet,
  Text,
  View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '../constants/tokens';

// ── 타입 ──────────────────────────────────────────────────────────

type ToastVariant = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id:       number;
  message:  string;
  variant:  ToastVariant;
}

type ToastListener = (item: ToastItem) => void;

// ── 서비스 코어 ───────────────────────────────────────────────────

let _uid        = 0;
let _listener: ToastListener | null = null;

function _emit(message: string, variant: ToastVariant) {
  _listener?.({ id: ++_uid, message, variant });
}

/**
 * 전역 토스트 서비스.
 * App.tsx 루트에 <ToastContainer /> 를 마운트해야 표시됩니다.
 */
export const ToastService = {
  info:    (message: string) => _emit(message, 'info'),
  success: (message: string) => _emit(message, 'success'),
  error:   (message: string) => _emit(message, 'error'),
  warning: (message: string) => _emit(message, 'warning')
  } as const;

// ── 시각 설정 ─────────────────────────────────────────────────────

const DURATION_MS = 2800;   // 표시 유지 시간
const ANIM_IN_MS  = 220;    // 슬라이드 인
const ANIM_OUT_MS = 180;    // 페이드 아웃

const VARIANT_STYLE: Record<ToastVariant, {
  bg: string;
  border: string;
  text: string;
  dot: string;
}> = {
  info: {
    bg:     'rgba(12,12,22,0.97)',
    border: '#A78BFA',
    text:   '#F0F0F5',
    dot:    '#A78BFA'
  },
  success: {
    bg:     'rgba(8,18,12,0.97)',
    border: '#D4A853',
    text:   '#F0F0F5',
    dot:    '#D4A853'
  },
  error: {
    bg:     'rgba(26,10,10,0.97)',
    border: '#FF5555',
    text:   '#F0F0F5',
    dot:    '#FF5555'
  },
  warning: {
    bg:     'rgba(20,14,6,0.97)',
    border: '#F59E0B',
    text:   '#F0F0F5',
    dot:    '#F59E0B'
  }
  };

// ── 단일 토스트 애니메이션 컴포넌트 ──────────────────────────────

interface ToastCardProps {
  item:      ToastItem;
  onDone:    (id: number) => void;
}

function ToastCard({ item, onDone }: ToastCardProps) {
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 슬라이드 인
    Animated.parallel([
      Animated.timing(translateY, {
        toValue:         0,
        duration:        ANIM_IN_MS,
        useNativeDriver: true
  }),
      Animated.timing(opacity, {
        toValue:         1,
        duration:        ANIM_IN_MS,
        useNativeDriver: true
  }),
    ]).start();

    // 자동 dismiss
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue:         0,
        duration:        ANIM_OUT_MS,
        useNativeDriver: true
  }).start(() => onDone(item.id));
    }, DURATION_MS);

    return () => clearTimeout(timer);
  }, [item.id, opacity, translateY, onDone]);

  const vs = VARIANT_STYLE[item.variant];

  return (
    <Animated.View
      style={[
        s.card,
        {
          backgroundColor:   vs.bg,
          borderColor:       vs.border,
          opacity,
          transform: [{ translateY }]
  },
      ]}
    >
      {/* 왼쪽 컬러 점 */}
      <View style={[s.dot, { backgroundColor: vs.dot }]} />
      <Text style={[s.message, { color: vs.text }]} numberOfLines={3}>
        {item.message}
      </Text>
    </Animated.View>
  );
}

// ── ToastContainer ────────────────────────────────────────────────

/**
 * App.tsx 루트에 단 1회 마운트.
 * SafeAreaProvider 안쪽에 위치해야 합니다.
 *
 * @example
 * <SafeAreaProvider>
 *   <ToastContainer />
 *   <NavigationContainer>...</NavigationContainer>
 * </SafeAreaProvider>
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  // 서비스 리스너 등록
  useEffect(() => {
    _listener = (item) => {
      setToasts(prev => {
        // 동시에 최대 3개까지만
        const next = [...prev, item];
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
    };
    return () => { _listener = null; };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View
      style={[
        s.container,
        { bottom: insets.bottom + 72 },
      ]}
      pointerEvents="none"
    >
      {toasts.map(item => (
        <ToastCard key={item.id} item={item} onDone={remove} />
      ))}
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    position:      'absolute',
    left:          16,
    right:         16,
    zIndex:        99999,
    alignItems:    'center',
    gap:           8
  },
  card: {
    width:             '100%',
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   13,
    paddingHorizontal: 14,
    borderRadius:      14,
    borderLeftWidth:   3,
    borderWidth:       1,
    elevation:         12,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.4,
    shadowRadius:      8 },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
    marginRight:  10,
    flexShrink:   0
  },
  message: {
    flex:       1,
    fontSize:   14,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.medium,
    color:      '#E8E8F0' }
  });
