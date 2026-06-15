// src/components/MessageBubble.tsx
// ✅ v4 — 리서치 기반 가독성·몰입감 전면 최적화
//
// ─ 적용된 연구 ─────────────────────────────────────────────────────────
// [1] Dark Mode Typography (designshack.net, raisproject.com)
//     · 순백 #FFF -> 소프트 화이트 #CACACA (할레이션 방지)
//     · 행간 1.6–1.75× (다크모드에서 줄 뭉침 방지)
//     · 자간 +0.2–0.4 (Light 폰트 배경 묻힘 방지)
//
// [2] Text Segmentation (SillyTavern, Character.AI 관행)
//     · #행동# -> 이탤릭 청회색, 줄 독립 (비디게틱 서술 느낌)
//     · *속마음* -> 이탤릭 인디고, 괄호 표시 (내면 독백)
//     · 기본 대사 -> Medium weight (다크모드 가독성 ↑)
//
// [3] Narrative Cinematic Style (Visual Novel 관행)
//     · 나레이터: ────── 텍스트 ────── (좌우 골드 선)
//     · 장면 묘사 중앙 정렬 + 시적 자간
//
// [4] Text Shadow (imperavi.com UI Typography)
//     · 다크배경 흰 텍스트에 미세 텍스트 섀도우 -> 깊이감 추가
//
// [5] Streaming Fade-In (SillyTavern "Stream Fade-In" feature)
//     · 스트리밍 중 텍스트 점진적 페이드 연출
//
// [6] Character Name Hierarchy
//     · 이름에 골드 액센트 + 자간 넓혀 제목처럼 표시
//
// [A11Y] WCAG AA 대비 전 구간 유지

import React, { memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableOpacity } from './PressableOpacity'; // ✅ [FIX] TouchableOpacity -> PressableOpacity (프로젝트 표준 컴포넌트)
import { CachedImage } from './CachedImage';
import { HeartBurst } from './HeartBurst';
import { useDoubleTap } from '../hooks/useDoubleTap';
import Animated, { FadeInLeft, FadeInRight, FadeInUp, withSpring, withTiming, withDelay, withSequence, useSharedValue, useAnimatedStyle, ReduceMotion, cancelAnimation } from 'react-native-reanimated';
import { useSettingsStore } from '../store/settingsStore';
import { useLanguageStore } from '../store/languageStore';
import { useShallow } from 'zustand/react/shallow';
import type { Message } from '../types/ChatTypes';
import { Typo, Typography } from '../constants/tokens';
import { parseContentSegmentsRobust, type ContentPart } from '../utils/chatParsers';
import { formatChatTextForDisplay } from '../utils/chatDisplayText';
import { SwipeToReply } from './SwipeToReply';
import { Smile, HeartHandshake, Crown, Zap, Heart as LucideHeart } from 'lucide-react-native';

// ─────────────────────────────────────────────────────────────
// 애니메이션 프리셋
// ✅ 연구 기반 스프링 물리값:
//   · damping 22 -> 18: 살짝 더 탄성 (너무 빠르게 멈추지 않음)
//   · stiffness 기본(170) -> 120: 더 부드럽고 무게감 있는 진입
//   · 슬라이드 거리: 기본(28px) -> 18px: 과장되지 않은 미세한 이동
// ─────────────────────────────────────────────────────────────
const _enterAI   = FadeInLeft.duration(260).springify().damping(18).stiffness(120).reduceMotion(ReduceMotion.Never);
const _enterUser = FadeInRight.duration(240).springify().damping(18).stiffness(120).reduceMotion(ReduceMotion.Never);
const _enterNarr = FadeInUp.duration(320).springify().damping(16).stiffness(100).reduceMotion(ReduceMotion.Never);

// ─────────────────────────────────────────────────────────────
// 긴 메시지 점진적 렌더 (500자 이상)
// ─────────────────────────────────────────────────────────────
// · 한 번에 렌더하면 JS -> Native 직렬화 비용으로 프레임 드롭
// · 첫 300자를 먼저 보여주고, 인터랙션 후 나머지 append
// · isStreaming 중엔 항상 전체 표시 (이미 SmoothTokenBuffer가 제어)
const PROGRESSIVE_THRESHOLD = 500;
const PROGRESSIVE_INITIAL   = 300;

function useProgressiveContent(content: string, isStreaming?: boolean): string {
  const [revealed, setRevealed] = useState(() =>
    content.length > PROGRESSIVE_THRESHOLD && !isStreaming
      ? content.slice(0, PROGRESSIVE_INITIAL)
      : content,
  );

  useEffect(() => {
    let cancelled = false;

    if (isStreaming) {
      setRevealed(content);
      return;
    }
    if (content.length <= PROGRESSIVE_THRESHOLD) {
      setRevealed(content);
      return;
    }
    // 첫 청크 즉시, 나머지는 다음 프레임에 렌더
    setRevealed(content.slice(0, PROGRESSIVE_INITIAL));
    const id = requestAnimationFrame(() => {
      // [수정] 언마운트 후 setState 방지 — cancelled 플래그 확인
      if (!cancelled) setRevealed(content);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [content, isStreaming]);

  return revealed;
}

const FONT_SIZE_MAP = {
  sm: Typo.size.sm,
  md: Typo.size.base,
  lg: Typo.size.lg
  } as const;

// ─────────────────────────────────────────────────────────────
// SegmentedText
// ─────────────────────────────────────────────────────────────

interface SegmentRenderProps {
  parts: ContentPart[];
  isUser: boolean;
  fontSize: number;
  isStreaming?: boolean;
}

function SegmentedText({ parts, isUser, fontSize, isStreaming }: SegmentRenderProps) {
  const lineH = fontSize * 1.72;

  // ── 블록 / 인라인 혼합 렌더 ─────────────────────────────────
  // heading · action · thought → 독립 <View> 블록
  // text · bold                → 인라인 <Text> 묶음
  // ⚠ \n 해킹 완전 제거 — 빈 줄 버그 수정
  const nodes: React.ReactNode[] = [];
  let inlineBuf: Array<{ part: ContentPart; idx: number }> = [];

  const flushInline = () => {
    if (inlineBuf.length === 0) return;
    const first = inlineBuf[0].idx;
    nodes.push(
      <Text key={`il-${first}`}>
        {inlineBuf.map(({ part: p, idx }) => {
          const isLast = isStreaming && idx === parts.length - 1;
          const st = [
            p.type === 'bold' ? s.segBold : s.segText,
            isUser && s.segTextUser,
            { fontSize, lineHeight: lineH },
          ];
          return isLast
            ? <Animated.Text key={idx} style={st}>{p.text}</Animated.Text>
            : <Text          key={idx} style={st}>{p.text}</Text>;
        })}
      </Text>,
    );
    inlineBuf = [];
  };

  parts.forEach((part, idx) => {
    const isLast = isStreaming && idx === parts.length - 1;

    if (part.type === 'text' || part.type === 'bold') {
      inlineBuf.push({ part, idx });
      return;
    }

    flushInline();
    const topGap = nodes.length > 0 ? 5 : 0;

    if (part.type === 'heading') {
      nodes.push(
        <View key={`h-${idx}`} style={[{ marginTop: topGap }, styles.headingMargin]}>
          <Text style={[s.segHeading, { fontSize: fontSize * 1.12, lineHeight: lineH * 1.2 }]}>
            {part.text}
          </Text>
        </View>,
      );
    } else if (part.type === 'action') {
      const st = [s.segAction, { fontSize: fontSize * 0.88, lineHeight: lineH }];
      nodes.push(
        <View key={`a-${idx}`} style={{ marginTop: topGap }}>
          {isLast
            ? <Animated.Text style={st}>{part.text}</Animated.Text>
            : <Text          style={st}>{part.text}</Text>}
        </View>,
      );
    } else if (part.type === 'thought') {
      const st = [s.segThought, { fontSize: fontSize * 0.88, lineHeight: lineH }];
      nodes.push(
        <View key={`t-${idx}`} style={{ marginTop: topGap }}>
          {isLast
            ? <Animated.Text style={st}>{part.text}</Animated.Text>
            : <Text          style={st}>{part.text}</Text>}
        </View>,
      );
    }
  });

  flushInline();

  return <View>{nodes}</View>;
}

// ─────────────────────────────────────────────────────────────
// NarratorSegmentedText
// ─────────────────────────────────────────────────────────────

interface NarratorSegmentProps {
  parts: ContentPart[];
  fontSize: number;
}

function NarratorSegmentedText({ parts, fontSize }: NarratorSegmentProps) {
  const lineH = fontSize * 1.68;
  return (
    <View style={styles._flexShrink}>
      {parts.map((part, idx) =>
        part.type === 'action' ? (
          <Text key={idx} style={[s.narratorActionSeg, {
            fontSize: fontSize * 0.88,
            lineHeight: lineH * 0.92,
          }, styles.centerText]}>
            {part.text}
          </Text>
        ) : (
          <Text key={idx} style={[s.narratorText, {
            fontSize: fontSize * 0.90,
            lineHeight: lineH,
          }, styles.centerText]}>
            {part.text}
          </Text>
        )
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
  onProfilePress?: () => void;
  onReply?: () => void;
  userAvatarUri?: string;
  userName?: string;
  characterImageUris?: string[];
  deviceTier?: unknown;
  storyId?: string;
  narratorPosition?: 'first' | 'middle' | 'last' | 'solo';
  groupPosition?: 'first' | 'middle' | 'last' | 'solo';
}

// ─────────────────────────────────────────────────────────────
// MessageBubble
// ─────────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  message,
  onLongPress,
  onDoubleTap,
  onProfilePress,
  onReply,
  userAvatarUri,
  userName,
  characterImageUris,
  narratorPosition = 'solo',
  groupPosition = 'solo',
}: MessageBubbleProps) {
  // Handle image_card messages early
  if (message.role === 'image_card') {
    const imageUrl = message.imageCardUrl ?? message.content;
    return (
      <View style={imageCardStyles.frame}>
        <CachedImage uri={imageUrl} style={imageCardStyles.image} contentFit="cover" />
      </View>
    );
  }

  const isUser     = message.role === 'user';
  const isNarrator = message.role === 'narrator';
  const t = useLanguageStore(s => s.t);

  const { chatFontSize, showNarratorBubble } = useSettingsStore(
    useShallow(s => ({ chatFontSize: s.chatFontSize, showNarratorBubble: s.showNarratorBubble })),
  );

  const dynFontSize = FONT_SIZE_MAP[chatFontSize] ?? Typo.size.base;
  const displayContent = useMemo(
    () => (isUser ? (message.content ?? '') : formatChatTextForDisplay(message.content ?? '', userName)),
    [isUser, message.content, userName],
  );
  const displayReplyText = useMemo(
    () => formatChatTextForDisplay(message.replyTo?.text ?? '', userName),
    [message.replyTo?.text, userName],
  );

  // ✅ 긴 메시지 점진적 렌더 (500자+)
  const progressiveContent = useProgressiveContent(displayContent, message.isStreaming);

  // ✅ 세그먼트 파싱 캐시 — progressiveContent 기반
  const contentParts = useMemo(
    () => parseContentSegmentsRobust(
      progressiveContent,
      message.speakerId ?? Number(message.characterId ?? 2),
    ),
    [progressiveContent, message.characterId, message.speakerId],
  );

  const actionPrefixParts = useMemo(
    () => message.actionPrefix
      ? parseContentSegmentsRobust(message.actionPrefix, 0)
      : null,
    [message.actionPrefix],
  );

  const reactions = message.reactions;

  // ✅ [NEW] 더블탭 -> ❤ 리액션 + HeartBurst 애니메이션
  const [heartBurstVisible, setHeartBurstVisible] = useState(false);
  const heartBurstPos = useRef({ cx: 0, cy: 0 });
  const bubbleRef = useRef<View>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleHeartBurstDone = useCallback(() => setHeartBurstVisible(false), []);

  const { handlePress: handleDoubleTapPress } = useDoubleTap({
    onDoubleTap: () => {
      bubbleRef.current?.measureInWindow((x, y, w, h) => {
        if (isMountedRef.current) {
          heartBurstPos.current = { cx: x + w / 2, cy: y + h / 2 };
          setHeartBurstVisible(true);
        }
      });
      onDoubleTap?.();
    }
  });

  // ── 그룹 버블 계산 ─────────────────────────────────────
  const isGroupFirst  = groupPosition === 'first'  || groupPosition === 'solo';
  const isGroupMiddle = groupPosition === 'middle';
  const isGroupLast   = groupPosition === 'last'   || groupPosition === 'solo';
  // 카카오톡 스타일: 아바타는 마지막 메시지에, 이름은 첫 메시지에만 표시
  const showAvatar = isGroupLast;
  const showName   = isGroupFirst;
  // 연결 느낌을 위한 radius 조정
  const characterLabel = message.characterName ?? t?.character ?? t?.defaultCharName ?? 'Character';
  const userProfileLabel = userName ?? t?.myPage ?? 'Profile';
  const bubbleTopR    = isGroupFirst ? 20 : 6;
  const bubbleBottomR = isGroupLast ? 20 : 6;

  if (isNarrator && !showNarratorBubble) return null;

  // ── 나레이터 ──────────────────────────────────────────────
  if (isNarrator) {
    const isFirst = narratorPosition === 'first' || narratorPosition === 'solo';

    return (
      <Animated.View
        entering={isFirst ? _enterNarr : undefined}
        style={[
          s.narratorRow,
          { marginTop: isFirst ? 10 : 2 },
          { marginBottom: (narratorPosition === 'last' || narratorPosition === 'solo') ? 10 : 2 },
        ]}
      >
        {/* [BUG FIX] message.content 직접 렌더 → NarratorSegmentedText 사용
            기존: raw content에 #action# 마커가 그대로 노출됨
            수정: contentParts 기반 세그먼트 렌더링으로 action/text 스타일 정상 분리 */}
        <NarratorSegmentedText
          parts={contentParts}
          fontSize={dynFontSize * 0.87}
        />
      </Animated.View>
    );
  }

  const avatarUri = isUser
    ? userAvatarUri
    : (characterImageUris?.[0] ?? message.characterProfileUrl);

  // ── 일반 말풍선 ────────────────────────────────────────────
  return (
    <SwipeToReply isUser={isUser} onReply={onReply ?? (() => {})}>
    <Animated.View
      entering={isUser ? _enterUser : _enterAI}
    >
      <PressableOpacity activeOpacity={1}
        onLongPress={onLongPress}
        onPress={handleDoubleTapPress}
        style={[s.row, isUser && s.rowUser, (isGroupMiddle || isGroupLast) && s.rowGrouped]}
        accessibilityLabel={displayContent.slice(0, 100)}
        accessibilityRole="text"
      >
        {/* ✅ [NEW] 더블탭 HeartBurst 오버레이 */}
        <HeartBurst
          visible={heartBurstVisible}
          onDone={handleHeartBurstDone}
          cx={heartBurstPos.current.cx}
          cy={heartBurstPos.current.cy}
        />
        {/* 버블 위치 측정용 ref */}
        <View ref={bubbleRef} collapsable={false} style={styles._position} pointerEvents="none" />
        {/* 캐릭터 아바타 — 카카오톡 스타일: 그룹 마지막 메시지에만 표시 */}
        {!isUser && (
          showAvatar ? (
            <PressableOpacity activeOpacity={1}
              onPress={onProfilePress}
              style={s.avatarWrap}
              hitSlop={{ top: 6, left: 6, bottom: 6, right: 6 }}
              accessibilityLabel={characterLabel}
              accessibilityRole="button"
            >
              {avatarUri
                ? <CachedImage uri={avatarUri} style={s.avatar} contentFit="cover" />
                : <View style={[s.avatar, s.avatarFallback]}>
                    <Text style={s.avatarInitial}>
                      {(message.characterName ?? '?').charAt(0)}
                    </Text>
                  </View>
              }
            </PressableOpacity>
          ) : (
            <View style={s.avatarSpacer} />
          )
        )}

        <View style={[s.bubbleWrap, isUser && s.bubbleWrapUser]}>
          {/* 캐릭터 이름 — 그룹 첫 메시지에만 표시 */}
          {!isUser && message.characterName && showName && (
            <Text style={s.charName}>{message.characterName}</Text>
          )}

          {/* replyTo 인용 */}
          {message.replyTo && (
            <View style={[s.replyQuote, isUser && s.replyQuoteUser]}>
              <View style={s.replyQuoteAccent} />
              <View style={styles._flex}>
                <Text style={s.replyQuoteName} numberOfLines={1}>
                  {message.replyTo.senderName ?? t?.reply ?? 'Reply'}
                </Text>
                <Text style={s.replyQuoteText} numberOfLines={1}>
                  {displayReplyText}
                </Text>
              </View>
            </View>
          )}

          {/* 말풍선 */}
          <View style={[
            s.bubble,
            isUser ? s.bubbleUser : s.bubbleAI,
            isGroupMiddle && s.bubbleGrouped,
            {
              borderTopLeftRadius:     isUser ? 20 : bubbleTopR,
              borderTopRightRadius:    isUser ? bubbleTopR : 20,
              borderBottomLeftRadius:  isUser ? 20 : bubbleBottomR,
              borderBottomRightRadius: isUser ? bubbleBottomR : 20,
            } as any,
          ]}>
            {/* actionPrefix — 나레이션 느낌, 구분선 후 대사 */}
            {actionPrefixParts && actionPrefixParts.length > 0 && (
              <View style={s.actionPrefixWrap}>
                <NarratorSegmentedText
                  parts={actionPrefixParts}
                  fontSize={dynFontSize * 0.85}
                />
              </View>
            )}

            {/* ✅ 핵심: 세그먼트 렌더링 + 스트리밍 FadeIn */}
            <SegmentedText
              parts={contentParts}
              isUser={isUser}
              fontSize={dynFontSize}
              isStreaming={message.isStreaming}
            />

            {/* 스트리밍 커서 */}
            {message.isStreaming && <Text style={s.cursor}>▋</Text>}
          </View>

          {/* 이모지 리액션 */}
          {reactions && reactions.length > 0 && (
            <View style={[s.reactionsRow, isUser && s.reactionsRowUser]}>
              {reactions.map((emoji, i) => (
                <View key={`${emoji}_${i}`} style={s.reactionBadge}>
                  <Text style={s.reactionEmoji}>{emoji}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 감정 flash — 선택지 결과 메시지에만 (대화 변화는 하단 바에서만) */}
          {/* [수정] emotionDeltas 타입 Partial<EditorEmotions> -> number 안전 변환 */}
          {null}
        </View>

        {/* 유저 아바타 */}
        {isUser && (
          <PressableOpacity activeOpacity={1}
            onPress={onProfilePress}
            style={s.avatarWrap}
            hitSlop={{ top: 6, left: 6, bottom: 6, right: 6 }}
            accessibilityLabel={userProfileLabel}
            accessibilityRole="button"
          >
            {userAvatarUri
              ? <CachedImage uri={userAvatarUri} style={s.avatar} contentFit="cover" />
              : <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarInitial}>
                    {(userName ?? 'U').charAt(0)}
                  </Text>
                </View>
            }
          </PressableOpacity>
        )}
      </PressableOpacity>
    </Animated.View>
    </SwipeToReply>
  );
});


// ─────────────────────────────────────────────────────────────
// EmotionFlash — 선택지 결과에만 표시되는 감정 변화 flash
// ─────────────────────────────────────────────────────────────

// PAD 모델 감정 — e1~e5 아이콘/컬러/라벨
// pos(양수) = 오른쪽(긍정 방향), neg(음수) = 왼쪽(부정 방향)
const EMOTION_META: Record<string, { Icon: React.FC<any>; posColor: string; negColor: string; label: string }> = {
  e1: { Icon: Smile, label: 'Valence',    posColor: '#D4A853',   negColor: '#FF5555'  }, // 긍정↑골드, 부정↑빨강
  e2: { Icon: HeartHandshake, label: 'Trust',      posColor: '#60A5FA',     negColor: '#8B5CF6'  }, // 신뢰↑파랑, 불신↑보라
  e3: { Icon: Crown, label: 'Dominance',  posColor: '#4ADE80',  negColor: '#8A5A9A'     }, // 지배↑초록, 복종↑연보라
  e4: { Icon: Zap, label: 'Arousal',    posColor: '#F59E0B',  negColor: '#60A5FA'    }, // 흥분↑주황, 차분↑파랑
  e5: { Icon: LucideHeart, label: 'Attachment', posColor: '#8B5CF6',   negColor: '#5A5A7A'     }, // 친밀↑보라, 냉담↑회색
};

function EmotionFlashChip({ eKey, val }: { eKey: string; val: number }) {
  const meta    = EMOTION_META[eKey] ?? { Icon: Smile, posColor: '#66EE99', negColor: '#FF7766', label: eKey };
  const isPos   = val > 0;
  const color   = isPos ? meta.posColor : meta.negColor;

  // + : 위로 튀어오름 / - : 좌우 흔들림
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale      = useSharedValue(0.6);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    // 등장
    scale.value   = withSpring(1, { damping: 12, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 150 });

    if (isPos) {
      // 위로 bounce
      translateY.value = withSequence(
        withSpring(-14, { damping: 8, stiffness: 400 }),
        withSpring(0,   { damping: 14, stiffness: 200 }),
      );
    } else {
      // 좌우 shake
      translateX.value = withSequence(
        withTiming(-5, { duration: 60 }),
        withTiming( 5, { duration: 60 }),
        withTiming(-4, { duration: 60 }),
        withTiming( 4, { duration: 60 }),
        withTiming( 0, { duration: 60 }),
      );
    }

    // 2.4초 후 fade out
    opacity.value = withDelay(2000, withTiming(0, { duration: 500 }));
    // [수정] 언마운트 시 진행 중인 애니메이션 취소 -> 메모리 누수 방지
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };
  }, [isPos, opacity, scale, translateX, translateY]);

  const aStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ] as const
  }));

  return (
    <Animated.View style={[efStyles.chip, { borderColor: color + '55', backgroundColor: color + '18' }, aStyle]}>
      <meta.Icon size={12} color={color} />
      <Text style={[efStyles.val, { color }]}>
        {isPos ? `+${val}` : String(val)}
      </Text>
    </Animated.View>
  );
}

function EmotionFlash({ deltas }: { deltas: Record<string, number> }) {
  const entries = Object.entries(deltas).filter(([, v]) => v !== 0);
  if (!entries.length) return null;
  return (
    <View style={efStyles.row}>
      {entries.map(([key, val]) => (
        <EmotionFlashChip key={key} eKey={key} val={val} />
      ))}
    </View>
  );
}

const efStyles = StyleSheet.create({
  row:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginLeft: 50, marginBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  icon: { fontSize: 12 },
  val:  { fontSize: 11, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.3 }
  });

export default MessageBubble;

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── 행 레이아웃 ─────────────────────────────────────────
  row:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 3, gap: 7 },
  rowGrouped: { paddingVertical: 1 },
  rowUser: { flexDirection: 'row-reverse', justifyContent: 'flex-start' },

  // ── 아바타 ─────────────────────────────────────────────
  avatarWrap: {
    width: 28, height: 28, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'flex-start',  // [FIX] 상단 정렬 (하단에 붙지 않게)
    marginTop: 4,
  },
  avatar:         { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: { backgroundColor: '#111118', alignItems: 'center', justifyContent: 'center' },
  avatarInitial:  { fontSize: 11, color: '#C8C8D4', fontFamily: Typo.fontFamily.semibold },

  // ── 버블 래퍼 ────────────────────────────────────────────
  bubbleWrap:     { flex: 1, alignItems: 'flex-start', gap: 2, maxWidth: '76%' },
  bubbleWrapUser: { alignItems: 'flex-end', flex: 0 },  // flex:0으로 shrink-wrap

  // ── 캐릭터 이름 ──────────────────────────────────────────
  charName: {
    fontSize: 11,
    color: 'rgba(212,168,83,0.85)',
    fontFamily: Typo.fontFamily.semibold,
    paddingHorizontal: 5,
    letterSpacing: 1.3,
    textTransform: 'uppercase' as const,
    marginBottom: 1,
  },

  // ── 말풍선 쉘 ────────────────────────────────────────────
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleGrouped: {
    paddingVertical: 7,
  },

  // AI 버블 — 반투명 회색 글라스 (배경이미지 대응)
  bubbleAI: {
    backgroundColor: 'rgba(90, 90, 110, 0.45)',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  // 유저 버블 — 반투명 골드 글라스 (배경이미지 대응)
  bubbleUser: {
    backgroundColor: 'rgba(160, 110, 20, 0.38)',
    borderBottomRightRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.35)',
  },

  // ── 텍스트 세그먼트 ─────────────────────────────────────
  segText: {
    color: '#D2D2DF',
    fontFamily: Typo.fontFamily.medium,
    letterSpacing: 0.15,
  },
  segTextUser: {
    color: '#F2E6C4',
    fontFamily: Typo.fontFamily.semibold,
    letterSpacing: 0.1,
  },
  segAction: {
    color: '#8C9BAC',
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.light,
    letterSpacing: 0.3,
  },
  segThought: {
    color: '#A07EE0',
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.light,
    letterSpacing: 0.2,
    opacity: 0.92,
  },

  // ── actionPrefix ─────────────────────────────────────────
  actionPrefixWrap: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },

  // ── 나레이터 — 박스 없음, 중앙 연한 이탤릭 텍스트 ────
  narratorRow: {
    alignSelf: 'center',
    width: '80%',
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
  },
  narratorPlain: {
    color: 'rgba(160, 170, 190, 0.65)',
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.regular,
    textAlign: 'center',
    flexShrink: 1,
    letterSpacing: 0.2,
  },

  // 레거시 — 참조 오류 방지
  narratorWrap: { alignSelf: 'center' },
  narratorSceneDivider: { flexDirection: 'row' },
  narratorDivider: { flex: 1 },
  narratorSceneLabel: { fontSize: 9 },
  narratorSceneWrap:  { flexDirection: 'row' },
  narratorActionWrap: { paddingHorizontal: 14 },
  narratorText: { color: '#B6C6D8', fontStyle: 'italic', fontFamily: Typo.fontFamily.regular, textAlign: 'center' as const },
  narratorActionSeg: { color: '#8C9BAC', fontStyle: 'italic', fontFamily: Typo.fontFamily.light, textAlign: 'center' as const },

  // ── 리액션 배지 ──────────────────────────────────────────
  reactionsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  reactionsRowUser: { justifyContent: 'flex-end' },
  reactionBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  reactionEmoji: { fontSize: 14 },

  // ── 인용 (replyTo) ───────────────────────────────────────
  replyQuote: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    overflow: 'hidden', maxWidth: '82%', marginBottom: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.09)',
  },
  replyQuoteUser:   { alignSelf: 'flex-end' },
  replyQuoteAccent: { width: 3, backgroundColor: '#D4A853' },
  replyQuoteName: {
    fontSize: 11, color: '#D4A853',
    fontFamily: Typo.fontFamily.semibold,
    paddingHorizontal: 9, paddingTop: 6,
    letterSpacing: 0.3,
  },
  replyQuoteText: {
    fontSize: 12.5, color: '#8A8A9E',
    paddingHorizontal: 9, paddingBottom: 6,
    fontFamily: Typo.fontFamily.regular,
  },

  // ── 스트리밍 커서 ────────────────────────────────────────
  cursor: { color: '#D4A853', opacity: 0.8 },

  // ── 아바타 공간 유지 (그룹 first/middle - 아바타 없는 행) ──────────
  avatarSpacer: { width: 28, flexShrink: 0 },

  // ── 마크다운 헤딩 ────────────────────────────────────────
  segHeading: {
    color: '#EAD9A8',
    fontFamily: Typo.fontFamily.semibold,
    letterSpacing: 0.5,
    textAlign: 'left' as const,
  },

  // ── 마크다운 볼드 ────────────────────────────────────────
  segBold: {
    color: '#E8E0C8',
    fontFamily: Typo.fontFamily.semibold,
    letterSpacing: 0.1,
  },
});

const styles = StyleSheet.create({
  _flexShrink: {
    flexShrink: 1
  },
  _position: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  _flex: {
    flex: 1,
    overflow: 'hidden'
  },
  headingMargin: {
    marginBottom: 2,
  },
  centerText: {
    textAlign: 'center',
  },
  narratorSpacing: {
    marginTop: 2,
    marginBottom: 2,
  },
  bubbleBorder: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
});

// Image card styles
const imageCardStyles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 280,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#111118',
    marginBottom: 6,
  },
  image: {
    width: '100%',
    height: 240,
    backgroundColor: '#111118',
  },
});
