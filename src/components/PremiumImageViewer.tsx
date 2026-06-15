/* eslint-disable @typescript-eslint/no-unused-vars */
import { Typography } from '../constants/tokens';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView as GHScrollView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  SharedValue,
  SlideInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Heart, MessageCircle, Play, Sparkles, X } from 'lucide-react-native';
import { SystemBars } from 'react-native-edge-to-edge';

const { width: SW, height: SH } = Dimensions.get('window') ?? { width: 375, height: 812 };
const SPRING_CFG = { damping: 22, stiffness: 260, mass: 0.85 };
const PAGER_SPRING = { damping: 38, stiffness: 300, mass: 0.9 };
const STORY_COVER_TONE = '#050507';

export interface ImageViewerCharInfo {
  name: string;
  age?: string | number;
  gender?: string;
  personality?: string;
  appearance?: string;
  setting?: string;
  speech?: string;
  storyTitle?: string;
  genre?: string;
  tags?: string[];
  worldSetting?: string;
  likeCount?: number;
  playerCount?: number;
  hideActions?: boolean;
  hideStats?: boolean;
  hideStoryMeta?: boolean;
  detailRows?: Array<{ label?: string; value: string }>;
  emotionRows?: Array<{
    label: string;
    value: number;
    low?: string;
    high?: string;
    color?: string;
  }>;
}

export interface PremiumImageViewerProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  charInfo?: ImageViewerCharInfo;
  mode?: 'default' | 'storyCover';
  onClose: () => void;
  onLike?: () => void;
  onChat?: () => void;
  isLiked?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ImagePage
// ─────────────────────────────────────────────────────────────────────────────
const ImagePage = React.memo(function ImagePage({
  uri,
  heightRatio = 0.75,
  alignTop = false,
  fit = 'contain',
  isActive = false,
  externalScaleRef,
  onZoomChange,
}: {
  uri: string;
  heightRatio?: number;
  alignTop?: boolean;
  fit?: 'contain' | 'cover';
  isActive?: boolean;
  externalScaleRef?: SharedValue<number>;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // ── 핀치 포컬 포인트 추적용 ──────────────────────────────────────────────
  const focalStartX = useSharedValue(0);
  const focalStartY = useSharedValue(0);
  const startTxPinch = useSharedValue(0);
  const startTyPinch = useSharedValue(0);
  const startScalePinch = useSharedValue(1);

  const pageH = Math.round(SH * heightRatio);
  // 뷰 중심 (transform origin)
  const viewCX = SW / 2;
  const viewCY = pageH / 2;

  // 페이지 비활성화 → 줌 즉시 리셋
  useEffect(() => {
    if (!isActive) {
      scale.value = withSpring(1, SPRING_CFG);
      savedScale.value = 1;
      tx.value = withSpring(0, SPRING_CFG);
      ty.value = withSpring(0, SPRING_CFG);
      if (externalScaleRef) externalScaleRef.value = 1;
    }
  }, [isActive, externalScaleRef, savedScale, scale, tx, ty]);

  // ── 클램프 헬퍼 (worklet, 명시적 스케일 인자) ────────────────────────────
  const clampX = (x: number, s: number): number => {
    'worklet';
    // SW * 0.92 상한: 어느 배율에서도 옆 페이지 노출 방지 → overflow:hidden 불필요
    const maxX = Math.max(0, Math.min((SW * s - SW) / 2, SW * 0.92));
    return Math.min(Math.max(x, -maxX), maxX);
  };

  const clampY = (y: number, s: number): number => {
    'worklet';
    const maxY = Math.max(0, (pageH * s - pageH) / 2);
    return Math.min(Math.max(y, -maxY), maxY);
  };

  const notifyZoom = (zoomed: boolean) => {
    if (onZoomChange && isActive) onZoomChange(zoomed);
  };

  const resetZoom = () => {
    'worklet';
    savedScale.value = 1;
    tx.value = withSpring(0, SPRING_CFG);
    ty.value = withSpring(0, SPRING_CFG);
    // externalScaleRef는 스프링 완료 후 1로 세팅 → 애니 중 pager 잠금 유지
    scale.value = withSpring(1, SPRING_CFG, () => {
      'worklet';
      if (externalScaleRef) externalScaleRef.value = 1;
    });
    runOnJS(notifyZoom)(false);
  };

  // ── 핀치: 포컬 포인트 기준으로 확대 ─────────────────────────────────────
  //  수식: transform origin = element center
  //  viewCX + tx + (lx - viewCX) * scale = const(screen pos of focal)
  //  → newTx = (focalX - viewCX) * (startScale - newScale) + startTx
  const pinch = Gesture.Pinch()
    .onBegin(e => {
      'worklet';
      focalStartX.value = e.focalX;
      focalStartY.value = e.focalY;
      startTxPinch.value = tx.value;
      startTyPinch.value = ty.value;
      startScalePinch.value = savedScale.value;
    })
    .onUpdate(e => {
      'worklet';
      const newScale = Math.max(0.5, Math.min(6, startScalePinch.value * e.scale));
      scale.value = newScale;
      if (externalScaleRef) externalScaleRef.value = newScale;

      // 포컬 포인트 고정: 핀치 중심 위치에서 확대/축소
      const deltaTx = (focalStartX.value - viewCX) * (startScalePinch.value - newScale);
      const deltaTy = (focalStartY.value - viewCY) * (startScalePinch.value - newScale);
      tx.value = clampX(startTxPinch.value + deltaTx, newScale);
      ty.value = clampY(startTyPinch.value + deltaTy, newScale);
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1.05) {
        resetZoom();
        return;
      }
      savedScale.value = scale.value;
      tx.value = withSpring(clampX(tx.value, scale.value), SPRING_CFG);
      ty.value = withSpring(clampY(ty.value, scale.value), SPRING_CFG);
      runOnJS(notifyZoom)(true);
    });

  // ── 팬: 줌 상태에서만 활성화 ────────────────────────────────────────────
  const pan = Gesture.Pan()
    .minDistance(2)
    .onTouchesDown((_, manager) => {
      'worklet';
      // 줌 안 된 상태 → fail → pager가 처리
      if (scale.value <= 1.05) manager.fail();
    })
    .onBegin(() => {
      'worklet';
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate(e => {
      'worklet';
      if (scale.value <= 1.05) return;
      tx.value = clampX(startX.value + e.translationX, scale.value);
      ty.value = clampY(startY.value + e.translationY, scale.value);
    })
    .onEnd(() => {
      'worklet';
      tx.value = withSpring(clampX(tx.value, scale.value), SPRING_CFG);
      ty.value = withSpring(clampY(ty.value, scale.value), SPRING_CFG);
    });

  // ── 더블탭: 줌 토글 ──────────────────────────────────────────────────────
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1) {
        resetZoom();
      } else {
        const target = 2.5;
        scale.value = withSpring(target, SPRING_CFG);
        savedScale.value = target;
        tx.value = withSpring(0, SPRING_CFG);
        ty.value = withSpring(0, SPRING_CFG);
        if (externalScaleRef) externalScaleRef.value = target;
        runOnJS(notifyZoom)(true);
      }
    });

  // Exclusive 쓰면 doubleTap 판정 기다리느라 pan에 딜레이 생김
  // Simultaneous로 동시 실행 → pan은 onTouchesDown에서 스스로 fail
  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ] as any,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          imagePageStyles.wrap,
          alignTop && imagePageStyles.wrapTop,
          { height: pageH },
          animStyle,
        ]}
      >
        <Image
          source={{ uri }}
          style={[imagePageStyles.img, { height: pageH }]}
          contentFit={fit}
          contentPosition={alignTop ? 'top center' : 'center'}
          cachePolicy="memory-disk"
          transition={0}
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CharInfoPanel  (변경 없음)
// ─────────────────────────────────────────────────────────────────────────────
function CharInfoPanel({
  info,
  onChat,
  onLike,
  isLiked,
}: {
  info: ImageViewerCharInfo;
  onChat?: () => void;
  onLike?: () => void;
  isLiked?: boolean;
}) {
  const hasActions = !info.hideActions && (!!onLike || !!onChat);
  const hasStats =
    !info.hideStats &&
    (typeof info.likeCount === 'number' || typeof info.playerCount === 'number');

  return (
    <Animated.View entering={SlideInDown.duration(400)} style={panelStyles.wrap}>
      <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
      <GHScrollView
        style={panelStyles.innerScroll}
        contentContainerStyle={panelStyles.inner}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={panelStyles.nameRow}>
          <View style={panelStyles.nameBlock}>
            <Text style={panelStyles.name}>{info.name}</Text>
            {info.age !== undefined && (
              <View style={panelStyles.badge}>
                <Text style={panelStyles.badgeText}>{String(info.age)}</Text>
              </View>
            )}
            {!!info.gender && (
              <View style={panelStyles.badge}>
                <Text style={panelStyles.badgeText}>{info.gender}</Text>
              </View>
            )}
          </View>

          {hasActions && (
            <View style={panelStyles.actions}>
              {onLike && (
                <TouchableOpacity
                  style={[panelStyles.actionBtn, isLiked && panelStyles.likeBtnOn]}
                  onPress={onLike}
                >
                  <Heart
                    size={15}
                    color={isLiked ? '#FF6B8B' : '#C8C8D4'}
                    fill={isLiked ? '#FF6B8B' : 'none'}
                  />
                </TouchableOpacity>
              )}
              {onChat && (
                <TouchableOpacity
                  style={[panelStyles.actionBtn, panelStyles.chatBtn]}
                  onPress={onChat}
                >
                  <MessageCircle size={15} color="#050507" />
                  <Text style={panelStyles.chatBtnText}>Chat</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {!info.hideStoryMeta && !!info.storyTitle && (
          <View style={panelStyles.storyRow}>
            <Sparkles size={11} color="#D4A853" />
            <Text style={panelStyles.storyTitle} numberOfLines={1}>
              {info.storyTitle}
            </Text>
          </View>
        )}

        {!!info.personality && !info.detailRows?.length && (
          <Text style={panelStyles.personality}>{info.personality}</Text>
        )}

        {!!info.detailRows?.length && (
          <View style={panelStyles.detailList}>
            {info.detailRows.map((row, index) => (
              <View key={`${row.label}-${index}`} style={panelStyles.detailRow}>
                {!!row.label && <Text style={panelStyles.detailLabel}>{row.label}</Text>}
                <Text
                  style={[panelStyles.detailValue, !row.label && panelStyles.detailValueSolo]}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!!info.emotionRows?.length && (
          <View style={panelStyles.emotionList}>
            {info.emotionRows.map((row, index) => (
              <View key={`${row.label}-${index}`} style={panelStyles.emotionRow}>
                <View style={panelStyles.emotionHeaderRow}>
                  <Text style={panelStyles.emotionLabel}>{row.label}</Text>
                  <Text style={[panelStyles.emotionValue, row.color ? { color: row.color } : null]}>
                    {row.value > 0 ? `+${row.value}` : String(row.value)}
                  </Text>
                </View>
                <View style={panelStyles.emotionTrackRow}>
                  <Text style={panelStyles.emotionEdge}>{row.low ?? ''}</Text>
                  <View style={panelStyles.emotionTrack}>
                    <View style={panelStyles.emotionCenterLine} />
                    <View
                      style={[
                        panelStyles.emotionFill,
                        row.value >= 0
                          ? panelStyles.emotionFillLeft
                          : {
                              left: `${((row.value + 100) / 200) * 100}%` as `${number}%`,
                              width: `${(Math.abs(row.value) / 100) * 50}%` as `${number}%`,
                            },
                        row.color ? { backgroundColor: row.color } : null,
                      ]}
                    />
                    <View
                      style={[
                        panelStyles.emotionDot,
                        { left: `${((row.value + 100) / 200) * 100}%` as `${number}%` },
                        row.color ? { borderColor: row.color } : null,
                      ]}
                    />
                  </View>
                  <Text style={[panelStyles.emotionEdge, panelStyles.emotionEdgeRight]}>
                    {row.high ?? ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!info.hideStoryMeta && !!info.tags?.length && (
          <View style={panelStyles.tags}>
            {info.tags.slice(0, 5).map((tag, index) => (
              <View key={`${tag}-${index}`} style={panelStyles.tag}>
                <Text style={panelStyles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {!info.hideStoryMeta && !!info.worldSetting && (
          <View style={panelStyles.worldSettingBox}>
            <Text style={panelStyles.worldSettingTitle}>World</Text>
            <Text style={panelStyles.worldSettingText}>{info.worldSetting}</Text>
          </View>
        )}

        {hasStats && (
          <View style={panelStyles.stats}>
            {typeof info.likeCount === 'number' && (
              <View style={panelStyles.statItem}>
                <Heart size={12} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={panelStyles.statText}>{info.likeCount.toLocaleString()}</Text>
              </View>
            )}
            {typeof info.playerCount === 'number' && (
              <View style={panelStyles.statItem}>
                <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={panelStyles.statText}>{info.playerCount.toLocaleString()}</Text>
              </View>
            )}
          </View>
        )}
      </GHScrollView>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StoryCoverViewer  — GHScrollView 유지 + N+2 루프 트릭
// ─────────────────────────────────────────────────────────────────────────────
function StoryCoverViewer({
  images,
  curIdx,
  insets,
  onClose,
  isZoomed,
  pagerRef,
  onScrollEnd,
  onZoomChange,
  currentScaleSV,
}: {
  images: string[];
  curIdx: number;
  insets: { top: number; bottom: number; left: number; right: number };
  onClose: () => void;
  isZoomed: boolean;
  pagerRef: React.RefObject<GHScrollView | null>;
  onScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onZoomChange: (zoomed: boolean) => void;
  currentScaleSV: SharedValue<number>;
}) {
  const N = images.length;
  const loopImages = N > 1 ? [images[N - 1], ...images, images[0]] : images;
  const activeRenderIdx = N > 1 ? curIdx + 1 : 0;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar hidden={false} translucent={true} backgroundColor="transparent" barStyle="light-content" />
      {Platform.OS === 'android' && <SystemBars style="light" />}

      <View style={{ flex: 1 }}>
        <View style={{ position: 'absolute', top: insets.top + 12, left: 16, zIndex: 10 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 28, bottom: 28, left: 28, right: 28 }} activeOpacity={0.6}>
            <View style={viewerStyles.iconBtnSolid}>
              <X size={24} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>
        
        <View style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
          <View style={viewerStyles.counterSolid}>
            <Text style={viewerStyles.counterText}>
              {curIdx + 1} / {N}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, marginBottom: -100 }}>
          <GHScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={!isZoomed}
            showsHorizontalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            style={{ flex: 1 }}
            onMomentumScrollEnd={onScrollEnd}
          >
            {loopImages.map((uri, renderIndex) => (
              <ImagePage
                key={`story-${renderIndex}`}
                uri={uri}
                heightRatio={1}
                alignTop
                fit="cover"
                isActive={renderIndex === activeRenderIdx}
                externalScaleRef={currentScaleSV}
                onZoomChange={renderIndex === activeRenderIdx ? onZoomChange : undefined}
              />
            ))}
          </GHScrollView>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PremiumImageViewer  — 메인 뷰어
// ─────────────────────────────────────────────────────────────────────────────
export function PremiumImageViewer({
  visible,
  images,
  initialIndex = 0,
  charInfo,
  mode = 'default',
  onClose,
  onLike,
  onChat,
  isLiked,
}: PremiumImageViewerProps) {
  const insets = useSafeAreaInsets();
  const safeInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
  const isStoryCoverMode = mode === 'storyCover';

  const N = images.length;
  const isMulti = N > 1;

  // ── N+2 루프 배열: [last, img0, img1, ..., imgN-1, first] ──────────────
  const loopImages = isMulti ? [images[N - 1], ...images, images[0]] : images;
  const VTOTAL = loopImages.length;

  const virtualStart = isMulti ? safeInitialIndex + 1 : 0;

  // ── Shared values ────────────────────────────────────────────────────────
  const bgOpacity = useSharedValue(0);
  const contentY = useSharedValue(40);
  const pagerX = useSharedValue(-virtualStart * SW);
  const virtualIdxSV = useSharedValue(virtualStart);
  const currentScaleSV = useSharedValue(1);
  const dismissY = useSharedValue(0);
  const dismissScale = useSharedValue(1);

  // ── React state ──────────────────────────────────────────────────────────
  const [curIdx, setCurIdx] = useState(safeInitialIndex);
  const [isZoomed, setIsZoomed] = useState(false);

  const storyPagerRef = useRef<GHScrollView | null>(null);

  const activeRenderIdx = isMulti ? curIdx + 1 : 0;

  // ── 페이지 변경 시 zoom 리셋 ────────────────────────────────────────────
  useEffect(() => {
    currentScaleSV.value = 1;
    setIsZoomed(false);
  }, [curIdx, currentScaleSV]);

  // ── visible 변경 처리 ───────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      const vi = isMulti ? safeInitialIndex + 1 : 0;
      setCurIdx(safeInitialIndex);
      setIsZoomed(false);
      currentScaleSV.value = 1;
      virtualIdxSV.value = vi;
      pagerX.value = -vi * SW;

      if (isStoryCoverMode) {
        bgOpacity.value = 1;
        contentY.value = 0;
        setTimeout(() => {
          storyPagerRef.current?.scrollTo({ x: vi * SW, animated: false });
        }, 0);
      } else {
        bgOpacity.value = 1;
        contentY.value = 0;
      }
    } else {
      bgOpacity.value = 0;
      contentY.value = 0;
    }
  }, [visible, bgOpacity, contentY, currentScaleSV, isMulti, isStoryCoverMode, pagerX, safeInitialIndex, virtualIdxSV]);

  // ── Animated styles ──────────────────────────────────────────────────────
  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentY.value }],
    opacity: interpolate(contentY.value, [0, 40], [1, 0], Extrapolation.CLAMP),
  }));
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pagerX.value }],
  }));
  const dismissAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismissY.value },
      { scale: dismissScale.value },
    ] as any,
  }));
  const dismissBgStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(dismissY.value) / 300, 1);
    return { opacity: interpolate(progress, [0, 1], [1, 0.2], Extrapolation.CLAMP) };
  });

  // ── Drag-to-dismiss 제스처 (비줌 상태에서만) ──────────────────────────────
  const dismissPan = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .failOffsetX([-8, 8])
    .onTouchesDown((_, manager) => {
      'worklet';
      if (currentScaleSV.value > 1.05) manager.fail();
    })
    .onUpdate(e => {
      'worklet';
      if (currentScaleSV.value > 1.05) return;
      dismissY.value = e.translationY;
      const progress = Math.min(Math.abs(e.translationY) / 400, 1);
      dismissScale.value = interpolate(progress, [0, 1], [1, 0.85], Extrapolation.CLAMP);
    })
    .onEnd(e => {
      'worklet';
      const DISMISS_THRESHOLD = 120;
      if (Math.abs(e.translationY) > DISMISS_THRESHOLD || Math.abs(e.velocityY) > 800) {
        const direction = e.translationY > 0 ? 1 : -1;
        dismissY.value = withTiming(direction * SH, { duration: 200 });
        dismissScale.value = withTiming(0.7, { duration: 200 });
        runOnJS(onClose)();
      } else {
        dismissY.value = withSpring(0, SPRING_CFG);
        dismissScale.value = withSpring(1, SPRING_CFG);
      }
    });

  // ── 커스텀 Pager 제스처 ──────────────────────────────────────────────────
  const pagerPan = Gesture.Pan()
    .enabled(isMulti)
    .activeOffsetX([-12, 12])
    .failOffsetY([-6, 6])
    .onTouchesDown((_, manager) => {
      'worklet';
      if (currentScaleSV.value > 1.05) manager.fail();
    })
    .onUpdate(e => {
      'worklet';
      if (currentScaleSV.value > 1.05) return;
      pagerX.value = -virtualIdxSV.value * SW + e.translationX;
    })
    .onEnd(e => {
      'worklet';
      if (currentScaleSV.value > 1.05) return;

      const THRESHOLD = SW * 0.25;
      let nextVirtual = virtualIdxSV.value;

      if (e.translationX < -THRESHOLD || e.velocityX < -400) {
        nextVirtual = Math.min(virtualIdxSV.value + 1, VTOTAL - 1);
      } else if (e.translationX > THRESHOLD || e.velocityX > 400) {
        nextVirtual = Math.max(virtualIdxSV.value - 1, 0);
      }

      virtualIdxSV.value = nextVirtual;

      let logical = nextVirtual - 1;
      if (nextVirtual === 0) logical = N - 1;
      if (nextVirtual === VTOTAL - 1) logical = 0;

      runOnJS(setCurIdx)(logical);
      runOnJS(setIsZoomed)(false);

      pagerX.value = withSpring(-nextVirtual * SW, PAGER_SPRING, () => {
        'worklet';
        if (!isMulti) return;

        let jumpTo = -1;
        if (nextVirtual === 0) {
          jumpTo = N;
        } else if (nextVirtual === VTOTAL - 1) {
          jumpTo = 1;
        }

        if (jumpTo !== -1) {
          pagerX.value = -jumpTo * SW;
          virtualIdxSV.value = jumpTo;
        }
      });
    });

  // ── Story Cover 모드 스크롤 핸들러 ──────────────────────────────────────
  const handleStoryScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isMulti) return;
    const x = event.nativeEvent.contentOffset.x;
    const renderIdx = Math.round(x / SW);

    if (renderIdx === 0) {
      storyPagerRef.current?.scrollTo({ x: N * SW, animated: false });
      setCurIdx(N - 1);
      setIsZoomed(false);
    } else if (renderIdx === N + 1) {
      storyPagerRef.current?.scrollTo({ x: SW, animated: false });
      setCurIdx(0);
      setIsZoomed(false);
    } else {
      const logical = renderIdx - 1;
      if (logical !== curIdx) {
        setCurIdx(logical);
        setIsZoomed(false);
      }
    }
  };

  // ── Story Cover 모드 ─────────────────────────────────────────────────────
  if (isStoryCoverMode) {
    return (
      <Modal
        visible={visible}
        transparent={true}
        statusBarTranslucent={true}
        navigationBarTranslucent={true}
        animationType="none"
        onRequestClose={onClose}
      >
        <StoryCoverViewer
          images={images}
          curIdx={curIdx}
          insets={insets}
          onClose={onClose}
          isZoomed={isZoomed}
          pagerRef={storyPagerRef}
          onScrollEnd={handleStoryScrollEnd}
          onZoomChange={setIsZoomed}
          currentScaleSV={currentScaleSV}
        />
      </Modal>
    );
  }

  // ── Default 모드 ─────────────────────────────────────────────────────────
  const combinedGesture = Gesture.Simultaneous(pagerPan, dismissPan);

  const viewerContent = (
    <GestureHandlerRootView style={viewerStyles.root}>
      {visible && (
        <StatusBar barStyle="light-content" translucent={true} backgroundColor="transparent" />
      )}

      <Animated.View style={[StyleSheet.absoluteFill, viewerStyles.overlaySolid, dismissBgStyle]} />

      <Animated.View style={[viewerStyles.container, dismissAnimStyle]}>
        {/* 상단 바 */}
        <View style={[viewerStyles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 28, bottom: 28, left: 28, right: 28 }} activeOpacity={0.6}>
            <View style={viewerStyles.iconBtnSolidDark}>
              <X size={22} color="#FFF" />
            </View>
          </TouchableOpacity>
          <View style={viewerStyles.spacer} />
        </View>
        
        <View style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
          <View style={viewerStyles.counterSolidDark}>
            <Text style={viewerStyles.counterText}>
              {curIdx + 1} / {N}
            </Text>
          </View>
        </View>

        {/* 이미지 영역: 커스텀 Reanimated 팬 기반 페이저 + Drag-to-dismiss */}
        <View style={viewerStyles.imgArea}>
          <GestureDetector gesture={combinedGesture}>
            <View style={viewerStyles.imgAreaInner}>
              <Animated.View
                style={[
                  viewerStyles.imgAreaRow,
                  { width: SW * VTOTAL },
                  stripStyle,
                ]}
              >
                {loopImages.map((uri, renderIndex) => (
                  <View key={`pg-${renderIndex}`} style={viewerStyles.imgAreaItem}>
                    <ImagePage
                      uri={uri}
                      heightRatio={0.78}
                      alignTop
                      fit="contain"
                      isActive={renderIndex === activeRenderIdx}
                      externalScaleRef={currentScaleSV}
                      onZoomChange={
                        renderIndex === activeRenderIdx ? setIsZoomed : undefined
                      }
                    />
                  </View>
                ))}
              </Animated.View>
            </View>
          </GestureDetector>
        </View>

        {/* 캐릭터 정보 패널 */}
        {charInfo && (
          <CharInfoPanel info={charInfo} onChat={onChat} onLike={onLike} isLiked={isLiked} />
        )}
      </Animated.View>
    </GestureHandlerRootView>
  );

  return (
    <Modal
      visible={visible}
      transparent={false}
      statusBarTranslucent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      {viewerContent}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const viewerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  rootStory: { backgroundColor: '#000000' },
  navBarFix: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: 'transparent', zIndex: -1 },
  overlaySolid: { backgroundColor: '#050507' },
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  topBarStory: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  topBarStoryFresh: { backgroundColor: 'transparent' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  iconBtnBlur: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnSolid: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnSolidDark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0,
  },
  counter: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  counterSolid: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  counterSolidDark: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0,
  },
  counterText: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#FFF' },
  spacer: { width: 44 },
  imgArea: { height: SH * 0.6, justifyContent: 'center' },
  imgAreaInner: { width: SW, height: '100%', overflow: 'visible' },
  imgAreaRow: { flexDirection: 'row', height: '100%' },
  imgAreaItem: { width: SW },
  storyCoverScreen: { flex: 1, backgroundColor: 'transparent', paddingBottom: 0 },
  storyCoverPagerFresh: { flex: 1 },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  dotsFresh: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: { backgroundColor: '#D4A853', width: 20 },
});

const imagePageStyles = StyleSheet.create({
  // overflow: 'hidden' 제거 → 줌 시 letterbox 영역으로 이미지 확장 허용
  wrap: { width: SW, alignItems: 'center', justifyContent: 'center' },
  wrapTop: { justifyContent: 'flex-start' },
  img: { width: SW },
});

const panelStyles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -160,
    maxHeight: SH * 0.5,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  innerScroll: { flexGrow: 0 },
  inner: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nameBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#F0F0F5',
    letterSpacing: -0.5,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#C8C8D4' },
  metaBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaBadgeText: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#E0E4EC' },
  genreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.3)',
  },
  genreText: { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#D4A853' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  likeBtnOn: {
    backgroundColor: 'rgba(255,107,139,0.1)',
    borderColor: 'rgba(255,107,139,0.2)',
  },
  chatBtn: {
    flexDirection: 'row',
    gap: 5,
    width: 'auto',
    paddingHorizontal: 16,
    backgroundColor: '#D4A853',
    borderRadius: 20,
  },
  chatBtnText: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  storyTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: '#D4A853',
    flex: 1,
  },
  personality: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.regular,
    color: '#CDD2DB',
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 12,
  },
  detailList: { gap: 8, marginBottom: 10 },
  detailRow: { gap: 3 },
  detailLabel: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853' },
  detailValue: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Typography.fontFamily.regular,
    color: '#D7DCE6',
  },
  detailValueSolo: { marginTop: 0 },
  emotionList: {
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 5,
  },
  emotionRow: { gap: 4 },
  emotionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emotionLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: '#D0D6DF',
    flex: 1,
  },
  emotionValue: { fontSize: 12, fontFamily: Typography.fontFamily.bold, color: '#FFFFFF' },
  emotionTrackRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emotionEdge: {
    width: 26,
    color: '#97A0B2',
    fontSize: 8,
    lineHeight: 10,
    fontFamily: Typography.fontFamily.regular,
  },
  emotionEdgeRight: { textAlign: 'right' },
  emotionTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.11)',
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emotionCenterLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  emotionFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#9F8BFF',
    opacity: 0.82,
  },
  emotionFillLeft: {
    left: '50%',
  },
  emotionDot: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    marginLeft: -3,
    width: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#9F8BFF',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#8A8A9E' },
  worldSettingBox: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  worldSettingTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: '#D4A853',
    marginBottom: 6,
  },
  worldSettingText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: '#B0B0C4',
    lineHeight: 20,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'nowrap',
    marginTop: 2,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' },
  statText: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#E0E0E8' },
});

// Additional styles for the component
const additionalStyles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.7)' },
  storyBackdrop: { backgroundColor: STORY_COVER_TONE },
  spacer: { width: 44 },
  container: { flex: 1, paddingBottom: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 44,
    marginBottom: 10,
  },
  topBarStory: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'transparent',
    marginBottom: 0,
    paddingTop: 12,
    paddingBottom: 0,
  },
  topBarStoryFresh: {
    paddingHorizontal: 16,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: { borderRadius: 22, overflow: 'hidden' },
  iconBtnBlur: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconBtnSolid: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(98,102,114,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  counter: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  counterSolid: {
    minWidth: 44,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(98,102,114,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  counterText: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#FFF' },
  imgArea: { flex: 1, justifyContent: 'flex-start', paddingTop: 6 },
  imgAreaInner: { flex: 1, overflow: 'visible' },
  imgAreaRow: { flexDirection: 'row', flex: 1 },
  imgAreaItem: { width: SW, flex: 1 },
  imgAreaStory: {
    height: SH * 0.52,
    flexGrow: 0,
    flexShrink: 0,
  },
  storyCoverPager: {
    height: '100%',
    zIndex: 1,
  },
  storyCoverScreen: {
    flex: 1,
    backgroundColor: STORY_COVER_TONE,
  },
  storyCoverImageStage: {
    flex: 1,
    marginTop: 0,
  },
  storyCoverPagerFresh: {
    height: '100%',
  },
  dotsFresh: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 6,
  },
  storyNavFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: STORY_COVER_TONE,
    zIndex: 5,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 20, height: 5, borderRadius: 2.5, backgroundColor: '#D4A853' },
  overlaySolid: { backgroundColor: '#050507' },
});
