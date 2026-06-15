import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Copy, Bookmark, BookmarkCheck, CornerDownLeft, PenLine } from 'lucide-react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  ReduceMotion,
} from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import { Radius, Typo, Typography } from '../../../constants/tokens';
import { CachedImage } from '../../../components/CachedImage';
import { HeartBurstLottie } from '../../../components/HeartBurstLottie';
import { CheckmarkLottie } from '../../../components/CheckmarkLottie';
import { ImageViewerModal } from '../../../components/ImageViewerModal';
import { SwipeToReply } from '../../../components/SwipeToReply';
import { useDoubleTap } from '../../../hooks/useDoubleTap';
import { makeA11yProps } from '../../../utils/a11yProps';
import { parseContentSegmentsRobust, type ContentPart } from '../../../utils/chatParsers';
import { formatChatTextForDisplay } from '../../../utils/chatDisplayText';
import { useSettingsStore } from '../../../store/settingsStore';
import { useLanguageStore } from '../../../store/languageStore';
import { MarkdownCodeBlock } from './MarkdownCodeBlock';
import type { ChatMessage as ChatMessageType, ChoiceOption } from '../types/ChatMessageTypes';
import type { Translations } from '../../../i18n/translations';

type GroupPosition = 'first' | 'middle' | 'last' | 'solo';

interface ChatMessageProps {
  message: ChatMessageType;
  isOwn: boolean;
  isStreaming: boolean;
  actionsVisible?: boolean;
  onBookmark: (messageId: string) => void;
  onCopy: (content: string) => void;
  onChoiceSelect: (choice: ChoiceOption) => void;
  onEdit: (messageId: string, content: string) => void;
  onToggleActions?: (messageId: string) => void;
  onCloseActions?: () => void;
  onReply?: (message: ChatMessageType) => void;
  onProfilePress?: (characterId?: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  storyId?: string;
  charId?: number;
  groupPosition?: GroupPosition;
  narratorPosition?: GroupPosition;
  userAvatarUri?: string;
  userName?: string;
  characterImageUris?: string[];
  testID?: string;
}

const AVATAR_SIZE = 40;
const AVATAR_SPACE = 46;
const FONT_SIZE_MAP = {
  sm: Typo.size.sm,
  md: Typo.size.base,
  lg: Typo.size.lg,
} as const;

const enterIntro = FadeIn.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);
const enterAI = FadeInLeft.duration(180).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);
const enterUser = FadeInRight.duration(170).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);
const enterNarrator = FadeInUp.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);

/* legacy emotion flash removed
function EmotionFlashChip({ eKey, val }: { eKey: string; val: number }) {
  const meta = EMOTION_META[eKey as keyof typeof EMOTION_META] ?? {
    icon: '◆',
    posColor: '#66EE99',
    negColor: '#FF7766',
    label: eKey,
  };
  const isPositive = val > 0;
  const color = isPositive ? meta.posColor : meta.negColor;

  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 150 });

    if (isPositive) {
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

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
    }, 2000);

    return () => {
      clearTimeout(timer);
      cancelAnimation(scale);
      cancelAnimation(opacity);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };
  }, [isPositive, opacity, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }, { scale: scale.value }] as any,
  }));

  return (
    <Animated.View
      style={[
        flashStyles.chip,
        { borderColor: `${color}55`, backgroundColor: `${color}18` },
        animatedStyle,
      ]}
    >
      <Text style={flashStyles.icon}>{meta.icon}</Text>
      <Text style={[flashStyles.value, { color }]}>{isPositive ? `+${val}` : String(val)}</Text>
    </Animated.View>
  );
}

function EmotionFlash({ deltas }: { deltas: Record<string, number> }) {
  const entries = Object.entries(deltas).filter(([, value]) => value !== 0);
  if (entries.length === 0) return null;

  return (
    <View style={flashStyles.row}>
      {entries.map(([key, value]) => (
        <EmotionFlashChip key={key} eKey={key} val={value} />
      ))}
    </View>
  );
}
*/

function renderRichParts(
  parts: ContentPart[],
  isOwn: boolean,
  dynFontSize: number,
  isStreaming: boolean,
  t?: Translations
) {
  const elements: React.ReactNode[] = [];
  let currentGroup: React.ReactNode[] = [];

  const flushGroup = (keySuffix: string | number) => {
    if (currentGroup.length > 0) {
      elements.push(<Text key={`text_group_${keySuffix}`}>{currentGroup}</Text>);
      currentGroup = [];
    }
  };

  parts.forEach((part, idx) => {
    if (part.type === 'code') {
      flushGroup(idx);
      elements.push(
        <MarkdownCodeBlock key={`code_${idx}`} code={part.text} lang={part.lang} t={t} />
      );
      return;
    }

    const isLast = isStreaming && idx === parts.length - 1;
    // Don't add extra newlines if formatting borders a code block
    const prevType = idx > 0 ? parts[idx - 1].type : null;
    const nextType = idx < parts.length - 1 ? parts[idx + 1].type : null;
    const blockPrefix = (idx > 0 && prevType !== 'code') ? '\n' : '';
    const blockSuffix = (idx < parts.length - 1 && nextType !== 'code') ? '\n' : '';
    
    const textStyle = [styles.segText, isOwn && styles.segTextUser, { fontSize: dynFontSize, lineHeight: dynFontSize * 1.62 }];

    if (part.type === 'heading') {
      currentGroup.push(
        <Text
          key={idx}
          style={[
            styles.segHeading,
            isOwn && styles.segHeadingUser,
            { fontSize: dynFontSize * 0.9, lineHeight: dynFontSize * 1.45 },
          ]}
        >
          {blockPrefix}
          {part.text}
          {blockSuffix}
        </Text>
      );
      return;
    }

    if (part.type === 'bold') {
      currentGroup.push(
        <Text
          key={idx}
          style={[
            styles.segBold,
            isOwn && styles.segBoldUser,
            { fontSize: dynFontSize, lineHeight: dynFontSize * 1.62 },
          ]}
        >
          {part.text}
        </Text>
      );
      return;
    }

    if (part.type === 'action') {
      currentGroup.push(
        <Text
          key={idx}
          style={[styles.segAction, { fontSize: dynFontSize * 0.88, lineHeight: dynFontSize * 1.45 }]}
        >
          {blockPrefix}
          {part.text}
          {blockSuffix}
        </Text>
      );
      return;
    }

    if (part.type === 'thought') {
      currentGroup.push(
        <Text
          key={idx}
          style={[styles.segThought, { fontSize: dynFontSize * 0.88, lineHeight: dynFontSize * 1.45 }]}
        >
          {' ('}
          {part.text}
          {') '}
        </Text>
      );
      return;
    }

    if (isLast) {
      currentGroup.push(
        <Animated.Text key={idx} style={textStyle}>
          {part.text}
        </Animated.Text>
      );
    } else {
      currentGroup.push(
        <Text key={idx} style={textStyle}>
          {part.text}
        </Text>
      );
    }
  });

  flushGroup('end');

  return <>{elements}</>;
}

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  isOwn,
  isStreaming,
  actionsVisible = false,
  onBookmark,
  onCopy,
  onChoiceSelect,
  onEdit,
  onToggleActions,
  onCloseActions,
  onReply,
  onProfilePress,
  onReact,
  storyId,
  charId,
  groupPosition = 'solo',
  narratorPosition = 'solo',
  userAvatarUri,
  userName,
  characterImageUris,
  testID,
}) => {
  const [heartVisible, setHeartVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const heartPosition = useRef({ cx: 0, cy: 0 });
  const bubbleRef = useRef<View>(null);
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);

  const { chatFontSize } = useSettingsStore(useShallow((state) => ({ chatFontSize: state.chatFontSize })));
  const dynFontSize = FONT_SIZE_MAP[chatFontSize as keyof typeof FONT_SIZE_MAP] ?? Typo.size.base;
  const replyLabel = t?.reply ?? 'Reply';
  const meLabel = t?.meLabel ?? 'Me';
  const characterFallback = t?.charFallback ?? 'Character';
  const choiceLabel = t?.choiceLabel ?? 'Choice';
  const endingLabel = t?.endingLabel ?? 'Ending';
  const displayContent = useMemo(
    () => (isOwn ? (message.content ?? '') : formatChatTextForDisplay(message.content ?? '', userName)),
    [isOwn, message.content, userName],
  );
  const displayReplyText = useMemo(
    () => formatChatTextForDisplay(message.replyTo?.text ?? '', userName),
    [message.replyTo?.text, userName],
  );

  const contentParts = useMemo(
    () => parseContentSegmentsRobust(displayContent, message.speakerId ?? Number(message.characterId ?? 2)),
    [displayContent, message.characterId, message.speakerId],
  );

  const actionPrefixParts = useMemo(
    () => (message.actionPrefix ? parseContentSegmentsRobust(message.actionPrefix, 0) : []),
    [message.actionPrefix],
  );
  const shouldShowStreamingPlaceholder = isStreaming && !(message.content ?? '').trim();

  const isGroupFirst = groupPosition === 'first' || groupPosition === 'solo';
  const isGroupLast = groupPosition === 'last' || groupPosition === 'solo';
  const showAvatar = !isOwn && isGroupFirst;
  const showName = !isOwn && !!message.characterName && isGroupFirst;
  const bubbleShapeStyle = {
    borderTopLeftRadius: isOwn ? 22 : isGroupFirst ? 22 : 10,
    borderTopRightRadius: isOwn ? (isGroupFirst ? 22 : 10) : 22,
    borderBottomLeftRadius: isOwn ? 22 : isGroupLast ? 22 : 10,
    borderBottomRightRadius: isOwn ? (isGroupLast ? 22 : 10) : 22,
    paddingVertical: isGroupFirst && isGroupLast ? 14 : 11,
  };
  const isNarratorFirst = narratorPosition === 'first' || narratorPosition === 'solo';
  const isNarratorLast = narratorPosition === 'last' || narratorPosition === 'solo';

  const narratorWrapSpacingStyle = {
    marginTop: isNarratorFirst ? 12 : 0,
    marginBottom: isNarratorLast ? 12 : 0,
  };
  const timestampLabel = useMemo(() => {
    if (!message.timestamp) return null;

    try {
      return new Intl.DateTimeFormat(appLanguage || undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(message.timestamp));
    } catch {
      const date = new Date(message.timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  }, [appLanguage, message.timestamp]);

  const onDoubleTapCb = React.useCallback(() => {
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      heartPosition.current = { cx: x + width / 2, cy: y + height / 2 };
      setHeartVisible(true);
    });
    onReact?.(message.id, '❤');
  }, [message.id, onReact]);

  const handleBubbleLongPress = React.useCallback(() => {
    onToggleActions?.(message.id);
  }, [message.id, onToggleActions]);

  const { handlePress: handleDoubleTap } = useDoubleTap({ onDoubleTap: onDoubleTapCb });

  const handleBubblePress = React.useCallback(() => {
    if (actionsVisible) {
      onCloseActions?.();
      return;
    }
    handleDoubleTap();
  }, [actionsVisible, handleDoubleTap, onCloseActions]);

  const renderAvatar = () => {
    const avatarTouchStyle = styles.avatarWrap;

    if (message.role === 'user') {
      return (
        <TouchableOpacity
          onPress={() => onProfilePress?.()}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={avatarTouchStyle}
        >
          {userAvatarUri ? (
            <CachedImage uri={userAvatarUri} style={styles.simpleAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.simpleAvatar, styles.userAvatar]}>
              <Text style={styles.avatarInitial}>{userName?.[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    const commonProps = {
      onPress: () => onProfilePress?.(message.characterId),
      hitSlop: { top: 6, bottom: 6, left: 6, right: 6 },
      style: avatarTouchStyle,
    };

    // [FIX] Prefer normalized characterImageUris, then fall back to message.characterProfileUrl.
    const avatarUrl = characterImageUris?.[0] ?? message.characterProfileUrl;

    return (
      <TouchableOpacity {...commonProps}>
        {avatarUrl ? (
          <CachedImage uri={avatarUrl} style={styles.simpleAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.simpleAvatar, styles.aiInitialAvatar]}>
            <Text style={styles.avatarInitial}>{message.characterName?.[0] ?? '?'}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderReplyQuote = () => {
    if (!message.replyTo) return null;

    return (
      <View style={[styles.replyQuote, isOwn && styles.replyQuoteOwn]}>
        <View style={styles.replyAccent} />
        <View style={styles.replyBody}>
          <Text style={styles.replyName} numberOfLines={1}>
            {message.replyTo.senderName ?? replyLabel}
          </Text>
          <Text style={styles.replyText} numberOfLines={2}>
            {displayReplyText}
          </Text>
        </View>
      </View>
    );
  };

  const renderBubble = () => {
    return (
      <View
        ref={bubbleRef}
        collapsable={false}
        style={[
          styles.bubbleContainer,
          isOwn ? styles.alignSelfEnd : styles.alignSelfStart,
        ]}
      >
        <TouchableOpacity
          testID={testID}
          style={[styles.bubble, isOwn ? styles.bubbleUser : styles.bubbleAI, bubbleShapeStyle]}
          onPress={handleBubblePress}
          onLongPress={handleBubbleLongPress}
          delayLongPress={450}
          activeOpacity={0.92}
          {...makeA11yProps({
            label: isOwn
              ? `${meLabel}: ${displayContent.slice(0, 100)}`
              : `${message.characterName ?? characterFallback}: ${displayContent.slice(0, 100)}`,
            role: 'text',
          })}
        >
          <HeartBurstLottie
            visible={heartVisible}
            onDone={() => setHeartVisible(false)}
            cx={heartPosition.current.cx}
            cy={heartPosition.current.cy}
            size={120}
          />

          {actionPrefixParts.length > 0 ? (
            <View style={styles.actionPrefixWrap}>
              {renderRichParts(actionPrefixParts, false, dynFontSize * 0.9, false, t)}
            </View>
          ) : null}

          {renderRichParts(contentParts, isOwn, dynFontSize, isStreaming, t)}

          {isStreaming ? <Text style={styles.cursor}>▋</Text> : null}

          {(message.bookmarked || message.isImportant) && (
            <View style={styles.bookmarkDiamondWrap} pointerEvents="none">
              <Bookmark size={13} color="rgba(212,168,83,0.4)" fill="rgba(212,168,83,0.2)" />
            </View>
          )}
        </TouchableOpacity>

      </View>
    );
  };

  const renderReactions = () => {
    if (!message.reactions?.length) return null;

    return (
      <View style={[styles.reactionsRow, isOwn && styles.reactionsRowOwn]}>
        {message.reactions.map((emoji, index) => (
          <View key={`${emoji}_${index}`} style={styles.reactionBadge}>
            <Text style={styles.reactionEmoji}>{emoji}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderMetaFooter = () => {
    const showTimestamp = actionsVisible && isGroupLast && !!timestampLabel;
    if (!showTimestamp && !message.reactions?.length) return null;
    if (!isGroupLast && !message.reactions?.length) return null;

    return (
      <View style={[styles.metaFooter, isOwn && styles.metaFooterOwn]}>
        {renderReactions()}
        {showTimestamp ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.timestampText, isOwn && styles.timestampTextOwn]}>
              {timestampLabel}
            </Text>
            {isOwn && isGroupLast && !message.isStreaming && (
              <CheckmarkLottie visible={true} size={12} color="#D4A853" />
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderChoices = () => {
    if (!message.choices?.length) return null;

    return (
      <View style={styles.choicesWrap}>
        {message.choices.map((choice, index) => (
          <TouchableOpacity
            key={choice.id}
            style={[styles.choiceBtn, choice.isSelected && styles.choiceBtnSelected]}
            onPress={() => onChoiceSelect(choice)}
            disabled={choice.isSelected}
            {...makeA11yProps({ label: `${choiceLabel}: ${choice.label}`, role: 'button' })}
          >
            <Text style={[styles.choiceText, choice.isSelected && styles.choiceTextSelected]}>
              {index + 1}. {choice.label}
            </Text>
            {choice.isEnding ? <Text style={styles.endingBadge}>{endingLabel}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderEmotionFlash = () => {
    return null;
  };

  // renderActions replaced by Global Bottom Sheet

  if (message.role === 'image_card') {
    const imageUrl = message.imageCardUrl ?? message.content;
    if (!imageUrl) return null;

    return (
      <>
        <View style={[styles.messageWrap, actionsVisible && styles.messageWrapActive]}>
          <Animated.View entering={message.isIntro ? undefined : undefined}>
            <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
              {!isOwn ? <View style={styles.avatarSpacer} /> : null}
              
              <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
                <TouchableOpacity activeOpacity={0.94} onPress={() => setImageViewerVisible(true)}>
                  <View style={styles.imageCardFrame}>
                    <Image source={{ uri: imageUrl }} style={styles.imageCard} contentFit="cover" />
                  </View>
                </TouchableOpacity>
              </View>

              {isOwn ? <View style={styles.avatarSpacer} /> : null}
            </View>
          </Animated.View>
        </View>

        <ImageViewerModal
          visible={imageViewerVisible}
          images={[imageUrl]}
          initialIndex={0}
          onClose={() => setImageViewerVisible(false)}
        />
      </>
    );
  }

  if (message.role === 'narrator') {
    const isAction = message.narratorType === 'action';
    const isIntroNarrator = !!message.isIntro;
    return (
      <Animated.View
        entering={message.isIntro ? undefined : isNarratorFirst ? enterNarrator : undefined}
        style={[styles.narratorOuterWrap, narratorWrapSpacingStyle]}
      >
        <TouchableOpacity
          style={[
            styles.narratorCard,
            isAction ? styles.narratorActionCard : styles.narratorSceneCard,
            isIntroNarrator && styles.introNarratorCard,
            isIntroNarrator && (isAction ? styles.introNarratorActionCard : styles.introNarratorSceneCard),
          ]}
          onLongPress={handleBubbleLongPress}
          activeOpacity={0.84}
        >
          {isAction
            ? <Text style={[
                styles.narratorActionText,
                isIntroNarrator && styles.introNarratorActionText,
                { fontSize: dynFontSize * 0.88, lineHeight: dynFontSize * 1.55 },
              ]}>
                {'≡ '}{message.content ?? ''}
              </Text>
            : renderRichParts(contentParts, false, dynFontSize * 0.92, false, t)
          }
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.messageWrap, actionsVisible && styles.messageWrapActive]}>
      <Animated.View entering={message.isIntro ? undefined : isOwn ? enterUser : enterAI}>
        <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther, !isGroupFirst && styles.rowGrouped]}>
          {!isOwn ? (showAvatar ? renderAvatar() : <View style={styles.avatarSpacer} />) : null}

          <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
            {showName ? <Text style={styles.charName}>{message.characterName}</Text> : null}
            {renderReplyQuote()}
            {renderBubble()}
            {renderMetaFooter()}
            {renderChoices()}
            {renderEmotionFlash()}
          </View>

        </View>
      </Animated.View>
    </View>
  );
});

ChatMessage.displayName = 'ChatMessage';

const flashStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginLeft: AVATAR_SPACE + 2,
    marginBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  icon: {
    fontSize: 12,
  },
  value: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.3,
  },
});

const styles = StyleSheet.create({
  messageWrap: {
    position: 'relative',
    zIndex: 1,
    // [BUG FIX #14] FlatList 아이템 간 actionsPopup 클리핑 방지
    overflow: 'visible',
  },
  alignSelfEnd: {
    alignSelf: 'flex-end',
  },
  alignSelfStart: {
    alignSelf: 'flex-start',
  },
  bubbleContainer: {
    position: 'relative',
    overflow: 'visible',
  },
  messageWrapActive: {
    zIndex: 200,
    overflow: 'visible',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  rowGrouped: {
    paddingTop: 1,
  },
  rowOwn: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rowOther: {
    flexDirection: 'row',
  },
  avatarWrap: {
    width: AVATAR_SPACE,
    flexShrink: 0,
    paddingTop: 2,
  },
  avatarSpacer: {
    width: AVATAR_SPACE,
    flexShrink: 0,
  },
  simpleAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  userAvatar: {
    backgroundColor: '#D4A853',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  aiInitialAvatar: {
    backgroundColor: '#0E0E1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarInitial: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#050507',
  },
  bubbleWrap: {
    flexShrink: 1,
    maxWidth: '65%',
    alignItems: 'flex-start',
    gap: 3,
  },
  bubbleWrapOwn: {
    alignItems: 'flex-end',
  },
  metaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 14,
    marginTop: 1,
  },
  metaFooterOwn: {
    justifyContent: 'flex-end',
  },
  charName: {
    paddingHorizontal: 2,
    fontSize: 11,
    color: '#F0D27E',
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 0.4,
    marginBottom: 1,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  replyQuote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  replyQuoteOwn: {
    backgroundColor: 'rgba(212,168,83,0.12)',
  },
  replyAccent: {
    width: 3,
    backgroundColor: '#D4A853',
  },
  replyBody: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  replyName: {
    fontSize: 11,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold,
    marginBottom: 2,
  },
  replyText: {
    fontSize: 12,
    color: '#8F99A8',
    lineHeight: 17,
    fontFamily: Typography.fontFamily.regular,
  },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 15,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: 5,
    width: 14,
    height: 14,
    zIndex: -1,
  },
  bubbleAI: {
    backgroundColor: 'rgba(18,22,30,0.96)',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  bubbleTailAI: {
    left: -4,
    backgroundColor: 'rgba(18,22,30,0.96)',
    borderBottomLeftRadius: 12,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  bubbleUser: {
    backgroundColor: 'rgba(74,59,27,0.92)',
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.24)',
    alignSelf: 'flex-end',
  },
  bubbleTailUser: {
    right: -4,
    backgroundColor: 'rgba(74,59,27,0.92)',
    borderBottomRightRadius: 12,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(212,168,83,0.24)',
  },
  actionPrefixWrap: {
    marginBottom: 10,
    paddingBottom: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  segText: {
    color: '#DFE5EF',
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.12,
  },
  segTextUser: {
    color: '#F6F2FF',
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 0.1,
  },
  segHeading: {
    color: '#BAC7D8',
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 0.45,
  },
  segHeadingUser: {
    color: '#E9DEFF',
  },
  segBold: {
    color: '#DDE7F4',
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 0.1,
  },
  segBoldUser: {
    color: '#F2EBFF',
  },
  segAction: {
    color: '#B8C4D4',
    fontStyle: 'italic',
    fontFamily: Typography.fontFamily.light,
    letterSpacing: 0.28,
  },
  segThought: {
    color: '#D4B66C',
    fontStyle: 'italic',
    fontFamily: Typography.fontFamily.light,
    letterSpacing: 0.22,
    opacity: 0.94,
  },
  cursor: {
    color: '#D4A853',
    opacity: 0.8,
  },
  streamingPlaceholder: {
    color: '#C9D1E1',
    fontSize: Typo.size.base,
    lineHeight: Typo.size.base * 1.5,
    opacity: 0.78,
  },
  streamingPlaceholderUser: {
    color: '#F7F9FD',
  },
  bookmarkDiamondWrap: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  reactionsRowOwn: {
    justifyContent: 'flex-end',
  },
  reactionBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionEmoji: {
    fontSize: 13,
  },
  timestampText: {
    fontSize: 10,
    color: 'rgba(196,205,220,0.56)',
    fontFamily: Typography.fontFamily.medium,
  },
  timestampTextOwn: {
    color: 'rgba(230,235,245,0.62)',
  },
  choicesWrap: {
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 11,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
  },
  choiceBtnSelected: {
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderColor: 'rgba(212,168,83,0.45)',
    elevation: 3,
  },
  choiceText: {
    flex: 1,
    fontSize: 14,
    color: '#C8C8D4',
  },
  choiceTextSelected: {
    color: '#D4A853',
    fontFamily: Typography.fontFamily.medium,
  },
  endingBadge: {
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 9,
    color: '#E24B4A',
    fontFamily: Typography.fontFamily.semibold,
    borderWidth: 1,
    borderColor: 'rgba(226,75,74,0.4)',
  },
  narratorOuterWrap: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  narratorActionText: {
    color: '#D3DCEA',
    fontStyle: 'italic' as const,
    fontFamily: Typography.fontFamily.light,
    letterSpacing: 0.3,
    textAlign: 'center' as const,
  },
  narratorCard: {
    width: '92%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(9,12,18,0.48)',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  narratorSceneCard: {
    backgroundColor: 'rgba(9,12,18,0.48)',
  },
  narratorActionCard: {
    backgroundColor: 'rgba(9,12,18,0.54)',
  },
  introNarratorCard: {
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(9,12,18,0.56)',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  introNarratorSceneCard: {
    backgroundColor: 'rgba(9,12,18,0.56)',
  },
  introNarratorActionCard: {
    backgroundColor: 'rgba(9,12,18,0.62)',
  },
  introNarratorActionText: {
    color: '#D9E3F2',
  },
  imageCardFrame: {
    width: '100%',
    maxWidth: 280,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#111118',
    marginBottom: 6,
  },
  imageCard: {
    width: '100%',
    height: 240,
    backgroundColor: '#111118',
  },
  actionDismissLayer: {
    position: 'absolute',
    top: -2000,
    bottom: -2000,
    left: -2000,
    right: -2000,
    zIndex: 180,
  },
  actionsPopup: {
    position: 'absolute',
    top: -54,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(20,24,30,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    elevation: 20,
    // [BUG FIX #14] z-index를 충분히 높여 FlatList 아이템 간 클리핑 방지
    zIndex: 300,
  },
  actionsPopupOther: {
    left: AVATAR_SPACE + 8,
  },
  actionsPopupOwn: {
    right: 16,
  },
  actionBtn: {
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnAccent: {
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderColor: 'rgba(212,168,83,0.24)',
  },
  actionBtnLabel: {
    fontSize: 12,
    color: '#D5DCE8',
    fontFamily: Typography.fontFamily.medium,
  },
  actionBtnLabelAccent: {
    color: '#F0D27E',
  },
});
