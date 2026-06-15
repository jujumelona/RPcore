// src/components/ui/Skeleton.tsx
// ✅ Skia 제거 -> React Native Animated 무빙 shimmer
//    New Architecture 완전 호환, onLayout 문제 없음
//
//  exports:
//    SkeletonBox, Skeleton, ShimmerProvider
//    StoryCardSkeleton, StoryCardSkeletonList
//    SkeletonStoryGrid, SkeletonStoryRow
//    SkeletonPostList, SkeletonDetailRec, SkeletonStartButton

import React, { ReactNode, createContext, useContext, useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View,
  type StyleProp, type ViewStyle } from 'react-native';
import { Radius } from '../../constants/tokens';

// ── 공유 Shimmer Context (모든 박스 동기화) ───────────────────────────
const ShimmerContext = createContext<Animated.Value | null>(null);

export function ShimmerProvider({ children }: { children: ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <ShimmerContext.Provider value={anim}>
      {children}
    </ShimmerContext.Provider>
  );
}

// ── SkeletonBox ───────────────────────────────────────────────────────
export function SkeletonBox({
  w, h, radius = 8, style }: { w: number | string; h: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(ShimmerContext);
  const local = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ctx) return; // 공유 clock 있으면 local 불필요
    const loop = Animated.loop(
      Animated.timing(local, {
        toValue: 1, duration: 1200,
        easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [ctx, local]);

  const anim = ctx ?? local;

  // translateX shimmer: -boxW -> +boxW
  const { width: SCR_W } = Dimensions.get('window');
  const boxW = typeof w === 'number' ? w : SCR_W;

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-boxW, boxW] });

  return (
    <View
      style={[
        styles.skBase, { width: w as any, height: h, borderRadius: radius },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX }] },
        ]}
      >
        <View
          style={[styles.skFill]}
        >
          {/* shimmer highlight */}
          <View style={sh.shimmer} />
        </View>
      </Animated.View>
    </View>
  );
}

// ── Skeleton — 기존 호환 래퍼 ─────────────────────────────────────────
interface SkeletonProps {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height, borderRadius = Radius.sm, style }: SkeletonProps) {
  return <SkeletonBox w={width} h={height} radius={borderRadius} style={style} />;
}

// ── StoryCardSkeleton ─────────────────────────────────────────────────
export function StoryCardSkeleton() {
  return (
    <View style={skeleStyles.card}>
      <Skeleton width={84} height={116} borderRadius={0} />
      <View style={skeleStyles.body}>
        <Skeleton height={14} width="75%" />
        <View style={styles._marginTop}>
          <Skeleton height={10} width="90%" />
          <Skeleton height={10} width="65%" />
        </View>
        <View style={styles._flexDirection}>
          <Skeleton height={20} width={52} borderRadius={6} />
          <Skeleton height={20} width={52} borderRadius={6} />
          <Skeleton height={20} width={44} borderRadius={6} />
        </View>
        <View style={styles._flexDirection1}>
          <Skeleton height={10} width={60} />
          <Skeleton height={10} width={36} />
        </View>
      </View>
    </View>
  );
}

export function StoryCardSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <ShimmerProvider>
      <>
        {Array.from({ length: count }).map((_, i) => (
          <StoryCardSkeleton key={i} />
        ))}
      </>
    </ShimmerProvider>
  );
}

const skeleStyles = StyleSheet.create({
  bg: { backgroundColor: '#0C0C14' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#0E0E14',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#181820',
    marginBottom: 10 },
  body: { flex: 1, padding: 12, justifyContent: 'space-between' } });

// ── 레이아웃 상수 ─────────────────────────────────────────────────────
const CARD_PAD   = 14;
const CARD_GAP   = 10;
const CARD_W     = ((Dimensions.get('window') ?? { width: 375 }).width - CARD_PAD * 2 - CARD_GAP) / 2;
const CARD_IMG_H = Math.round(CARD_W * 1.65);

// ── SkeletonStoryGrid ─────────────────────────────────────────────────
function SkeletonStoryCard() {
  return (
    <View style={sk.card}>
      <SkeletonBox w={CARD_W} h={CARD_IMG_H} radius={10} />
      <View style={sk.cardInfo}>
        <SkeletonBox w="72%" h={11} radius={5} />
        <SkeletonBox w="50%" h={9}  radius={5} style={styles._marginTop1} />
      </View>
    </View>
  );
}

export function SkeletonStoryGrid({ count = 6 }: { count?: number }) {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += 2) rows.push([i, i + 1].filter(n => n < count));
  return (
    <ShimmerProvider>
      <View style={sk.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={sk.row}>
            {row.map(ci => <SkeletonStoryCard key={ci} />)}
            {row.length === 1 && <View style={{ width: CARD_W }} />}
          </View>
        ))}
      </View>
    </ShimmerProvider>
  );
}

// ── SkeletonStoryRow ──────────────────────────────────────────────────
export function SkeletonStoryRow({ count = 4 }: { count?: number }) {
  return (
    <ShimmerProvider>
      <View style={sk.rowList}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={sk.hCard}>
            <SkeletonBox w={80} h={80} radius={10} />
            <View style={sk.hCardInfo}>
              <SkeletonBox w="70%" h={13} radius={5} />
              <SkeletonBox w="50%" h={10} radius={5} style={styles._marginTop2} />
              <SkeletonBox w="35%" h={9}  radius={5} style={styles._marginTop3} />
            </View>
          </View>
        ))}
      </View>
    </ShimmerProvider>
  );
}

// ── SkeletonPostList ──────────────────────────────────────────────────
export function SkeletonPostList({ count = 5 }: { count?: number }) {
  return (
    <ShimmerProvider>
      <View style={sk.postList}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={sk.post}>
            <SkeletonBox w="90%"  h={14} radius={5} />
            <SkeletonBox w="100%" h={10} radius={4} style={styles._marginTop2} />
            <SkeletonBox w="75%"  h={10} radius={4} style={styles._marginTop4} />
            <View style={sk.postMeta}>
              <SkeletonBox w={60} h={9} radius={4} />
              <SkeletonBox w={80} h={9} radius={4} />
            </View>
          </View>
        ))}
      </View>
    </ShimmerProvider>
  );
}

// ── SkeletonDetailRec ─────────────────────────────────────────────────
export function SkeletonDetailRec({ count = 4 }: { count?: number }) {
  return (
    <ShimmerProvider>
      <View style={sk.recRow}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={sk.recCard}>
            <SkeletonBox w={110} h={150} radius={10} />
            <SkeletonBox w={110} h={10}  radius={4} style={styles._marginTop2} />
            <SkeletonBox w={80}  h={9}   radius={4} style={styles._marginTop4} />
          </View>
        ))}
      </View>
    </ShimmerProvider>
  );
}

// ── SkeletonStartButton ───────────────────────────────────────────────
export function SkeletonStartButton() {
  return <SkeletonBox w="100%" h={54} radius={14} />;
}

// ── 스타일 ────────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  shimmer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    // 대각선 하이라이트 효과
    width: '40%',
    alignSelf: 'center',
    borderRadius: 99 } });

const sk = StyleSheet.create({
  grid:      { paddingHorizontal: CARD_PAD, paddingTop: 6 },
  row:       { flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP },
  card:      { width: CARD_W, backgroundColor: '#0E0E14', borderRadius: 12, overflow: 'hidden' },
  cardInfo:  { padding: 9, gap: 4 },
  rowList:   { paddingHorizontal: 16 },
  hCard:     { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#0E0E14' },
  hCardInfo: { flex: 1 },
  postList:  { paddingHorizontal: 16 },
  post:      { paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#0E0E14' },
  postMeta:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  recRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 4 },
  recCard:   { alignItems: 'flex-start' } });

const styles = StyleSheet.create({
  _marginTop:      { gap: 4, marginTop: 6 },
  _flexDirection:  { flexDirection: 'row', gap: 5, marginTop: 10 },
  _flexDirection1: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  _marginTop1:     { marginTop: 5 },
  _marginTop2:     { marginTop: 6 },
  _marginTop3:     { marginTop: 4 },
  _marginTop4:     { marginTop: 3 },
  skBase: {
    overflow: 'hidden',
    backgroundColor: '#0C0C14' },
  skFill: {
    flex: 1 }
});
