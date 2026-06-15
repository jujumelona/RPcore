// src/components/AndroidScreen.tsx
// ══════════════════════════════════════════════════════════════════════
// 안드로이드 전용 화면 래퍼
//
// Android 15+ edge-to-edge 강제 대응:
//  - StatusBar transparent + light-content
//  - react-native-safe-area-context 기반 inset 처리
//  - 모든 스크린에서 이 컴포넌트로 감싸면 일관된 레이아웃 보장
//  - [FIX] 카메라/펀치홀 영역 흰색 방지: root View에 bg색 명시
//
// NOTE: iOS 고려 없음. 안드로이드 전용.
// ══════════════════════════════════════════════════════════════════════

import { ReactNode } from 'react';
import { View,
  StatusBar,
  StyleSheet,
  ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';

interface AndroidScreenProps {
  children: ReactNode;
  /**
   * 배경색 오버라이드. 기본값 '#08080C'
   */
  bg?: string;
  /**
   * 상단 inset을 추가로 적용할지 (기본 true)
   * false면 헤더가 statusbar 영역까지 올라감 (전체화면 느낌)
   */
  withTopInset?: boolean;
  /**
   * 하단 inset 적용 여부 (기본 true)
   * BottomTabBar가 있는 화면은 false
   */
  withBottomInset?: boolean;
  style?: ViewStyle;
  /**
   * 화면 진입 fadeIn 애니메이션 (기본 true)
   */
  animated?: boolean;
}

export function AndroidScreen({
  children,
  bg = '#08080C',
  withTopInset = true,
  withBottomInset = false,
  style,
  animated = true }: AndroidScreenProps) {
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: bg,
    paddingTop: withTopInset ? insets.top : 0,
    paddingBottom: withBottomInset ? insets.bottom : 0 };

  if (animated) {
    return (
      // [FIX #1] 최외곽 View에 bg 동일 색 적용 → 카메라 영역 흰색 방지
      <View style={[ss.root, { backgroundColor: bg }]}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[containerStyle, style]}
        >
          {children}
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[ss.root, { backgroundColor: bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <View style={[containerStyle, style]}>
        {children}
      </View>
    </View>
  );
}

// ── 전체화면 (채팅 등) — StatusBar 포함, inset 없음 ─────────────────

interface FullScreenProps {
  children: ReactNode;
  bg?: string;
}

export function FullScreen({ children, bg = '#050507' }: FullScreenProps) {
  return (
    <View style={[ss.root, { backgroundColor: bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <View style={[ss.fill, { backgroundColor: bg }]}>
        {children}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  // [FIX #1] 최외곽에 배경색을 채워 카메라 영역 흰색 제거
  root: { flex: 1 },
  fill: { flex: 1 } });
