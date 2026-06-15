// src/components/ChatMessageList.tsx
// LegendList-based chat list renderer.
// - Message bubbles + typing indicator + choice panel
// - Recycle pool optimization via getItemType

import { MutableRefObject,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef } from 'react';
import { NativeSyntheticEvent,
  NativeScrollEvent,
  View,
  Text,
  StyleSheet,
  Animated } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { LegendList, type LegendListRef } from '@legendapp/list';
import { PressableOpacity } from './PressableOpacity';
import { applyUserNameStr } from '../store/userProfileStore';
import { useHaptic } from '../hooks/useHaptic';
import { useThrottledPress } from '../utils/useTap';
import { useSettingsStore } from '../store/settingsStore';
import type { Message, DeviceTier } from '../screens/chat/types/ChatTypes';
import type { ActiveChoiceEvent, ChoiceOption } from '../types/StoryContract';
import MessageBubble from './MessageBubble';
import ChatTypingIndicator from './ChatTypingIndicator';

// Choice panel shown after AI emits a choice event.
interface ChoicePanelProps {
  event: ActiveChoiceEvent;
  onSelect: (option: ChoiceOption) => void;
  userName: string;
}

export const ChoicePanel = memo(function ChoicePanel({ event, onSelect, userName }: ChoicePanelProps) {
  const haptic = useHaptic();
  const handleSelect = useThrottledPress((opt: ChoiceOption) => {
    haptic.trigger('select');
    onSelect(opt);
  }, 0, true);

  return (
    <View style={ch.container}>
      {!!event.prompt && (
        <View style={ch.promptBox}>
          <Text style={ch.promptText}>{applyUserNameStr(event.prompt, userName)}</Text>
        </View>
      )}
      {(event.options ?? []).map((opt: ChoiceOption, i: number) => {
        const isLast = i === (event.options ?? []).length - 1;
        return (
          <PressableOpacity
            key={opt.id ?? i}
            style={[ch.optionBtn, isLast && ch.optionBtnLast]}
            onPress={() => handleSelect(opt)}
            activeOpacity={0.75}
          >
            <Text style={ch.optionLabel}>{applyUserNameStr(opt.label, userName)}</Text>
            <Text style={ch.optionArrow}>›</Text>
          </PressableOpacity>
        );
      })}
    </View>
  );
});

// Scroll-to-bottom FAB.
interface ScrollFabProps {
  isAtBottom: boolean;
  isTyping: boolean;
  onPress: () => void;
  scrollToBottomAnimStyle: ReturnType<typeof Animated.createAnimatedComponent> | object;
}

const ScrollFab = memo(function ScrollFab({ isAtBottom, isTyping, onPress, scrollToBottomAnimStyle }: ScrollFabProps) {
  return (
    <Animated.View
      style={[
        fabStyles.fab,
        scrollToBottomAnimStyle,
        { pointerEvents: isAtBottom ? 'none' : 'auto' } as import('react-native').ViewStyle,
      ]}
    >
      <PressableOpacity onPress={onPress} style={fabStyles.inner} activeOpacity={0.75}>
        <ChevronDown size={20} color="#fff" style={fabStyles.chevron} />
        {isTyping && <View style={fabStyles.dot} />}
      </PressableOpacity>
    </Animated.View>
  );
});

interface OnScrollToIndexFailedInfo {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
}

const NOOP = () => {};

interface ChatMessageListProps {
  messages: Message[];
  streamingBubble: Message | null;
  isTyping: boolean;
  activeChoiceEvent: ActiveChoiceEvent | null;
  storyId: string;
  fullChars: Array<{ id: number; name: string; profileUrl: string; imageUris: string[] }>;
  userAvatarUri?: string;
  userName: string;
  deviceTier: DeviceTier;
  isAtBottom: boolean;
  isAtBottomRef: MutableRefObject<boolean>;
  scrollToBottomAnimStyle: object;
  flatListRef: MutableRefObject<LegendListRef | null>;
  onLongPress: (_msg: Message) => void;
  onDoubleTap: (_msg: Message) => void;
  onUserProfile: () => void;
  onCharProfile: (charId?: string) => void;
  onChoiceSelect: (option: ChoiceOption) => void;
  onScrollToBottom: () => void;
  onBottomStateChange?: (isAtBottom: boolean) => void;
  onSwipeReply?: (msg: Message) => void;
}

const ChatMessageList = memo(function ChatMessageList({
  messages,
  streamingBubble,
  isTyping,
  activeChoiceEvent,
  storyId,
  fullChars,
  userAvatarUri,
  userName,
  deviceTier,
  isAtBottom,
  isAtBottomRef,
  scrollToBottomAnimStyle,
  flatListRef,
  onLongPress,
  onDoubleTap,
  onUserProfile,
  onCharProfile,
  onChoiceSelect,
  onScrollToBottom,
  onBottomStateChange,
  onSwipeReply
  }: ChatMessageListProps) {
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nextIsAtBottom = distanceFromBottom < 80;
    if (isAtBottomRef.current !== nextIsAtBottom) {
      isAtBottomRef.current = nextIsAtBottom;
      onBottomStateChange?.(nextIsAtBottom);
      return;
    }
    isAtBottomRef.current = nextIsAtBottom;
  }, [isAtBottomRef, onBottomStateChange]);

  // Track scrollToIndex retry timer to cancel on unmount.
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [BUG-4 FIX] retryCount를 별도 ref로 분리.
  // 이전: _retryCount를 setTimeout ID 객체에 monkey-patch → 실제 timeout ID가 사라져 clearTimeout 불가
  //       → 언마운트 후 setState 호출 가능 → React 경고/크래시.
  const scrollRetryCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (scrollRetryTimerRef.current !== null) {
        clearTimeout(scrollRetryTimerRef.current);
        scrollRetryTimerRef.current = null;
      }
      scrollRetryCountRef.current = 0;
    };
  }, []);

  const autoScrollEnabled = useSettingsStore(s => s.autoScrollEnabled);

  // O(1) character lookup map.
  const charMap = useMemo(
    () => new Map(fullChars.map(c => [c.id, c])),
    [fullChars],
  );
  // [BUG FIX] fullChars[0]은 내레이터(id=0)일 수 있음 → id>=2인 첫 캐릭터 사용
  const primaryCharacter = fullChars.find(c => c.id >= 2) ?? fullChars[0];

  const getItemType = useCallback((msg: Message) => {
    if (msg.isStreaming) return 'streaming';
    if (msg.role === 'user') return 'user';
    if (msg.role === 'image_card') return 'image_card';
    if (msg.role === 'narrator') return msg.narratorType === 'action' ? 'narrator-action' : 'narrator';
    return 'ai';
  }, []);

  // Compute narrator grouping positions for unified block look
  const narratorPositionMap = useMemo(() => {
    const map = new Map<string, 'first' | 'middle' | 'last' | 'solo'>();
    messages.forEach((msg, i) => {
      if (msg.role !== 'narrator') return;
      const prevIsNarr = messages[i - 1]?.role === 'narrator';
      const nextIsNarr = messages[i + 1]?.role === 'narrator';
      if (!prevIsNarr && !nextIsNarr) map.set(msg.id, 'solo');
      else if (!prevIsNarr) map.set(msg.id, 'first');
      else if (!nextIsNarr) map.set(msg.id, 'last');
      else map.set(msg.id, 'middle');
    });
    return map;
  }, [messages]);

  // Compute grouping positions for consecutive same-character messages
  const groupPositionMap = useMemo(() => {
    const map = new Map<string, 'first' | 'middle' | 'last' | 'solo'>();
    messages.forEach((msg, i) => {
      if (msg.role === 'narrator') return;
      const msgKey = msg.role === 'user' ? 'user' : String(msg.characterId ?? msg.speakerId ?? '');
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const prevKey = prev && prev.role !== 'narrator'
        ? (prev.role === 'user' ? 'user' : String(prev.characterId ?? prev.speakerId ?? ''))
        : null;
      const nextKey = next && next.role !== 'narrator'
        ? (next.role === 'user' ? 'user' : String(next.characterId ?? next.speakerId ?? ''))
        : null;
      const prevSame = prevKey === msgKey;
      const nextSame = nextKey === msgKey;
      if (!prevSame && !nextSame) map.set(msg.id, 'solo');
      else if (!prevSame) map.set(msg.id, 'first');
      else if (!nextSame) map.set(msg.id, 'last');
      else map.set(msg.id, 'middle');
    });
    return map;
  }, [messages]);

  const keyExtractor = useCallback((msg: Message) => msg.id, []);

  const handleContentSizeChange = useCallback(() => {
    if (autoScrollEnabled && isAtBottomRef.current) {
      flatListRef.current?.scrollToEnd?.({ animated: isTyping });
    }
  }, [autoScrollEnabled, isAtBottomRef, flatListRef, isTyping]);

  const handleScrollToIndexFailed = useCallback((info: OnScrollToIndexFailedInfo) => {
    // [BUG-4 FIX] retryCount를 scrollRetryCountRef로 관리 (이전: setTimeout ID 객체에 monkey-patch
    // → timeout ID 소멸 → clearTimeout 불가 → 언마운트 후 setState 호출 → 크래시).
    const maxRetries = 2;
    if (scrollRetryCountRef.current >= maxRetries) {
      scrollRetryCountRef.current = 0;
      return;
    }
    flatListRef.current?.scrollToOffset?.({ offset: info.averageItemLength * info.index, animated: false });
    if (scrollRetryTimerRef.current !== null) clearTimeout(scrollRetryTimerRef.current);
    scrollRetryTimerRef.current = setTimeout(() => {
      scrollRetryTimerRef.current = null;
      scrollRetryCountRef.current += 1;
      flatListRef.current?.scrollToIndex?.({ index: info.index, animated: true, viewPosition: 0.5 });
      if (scrollRetryCountRef.current >= maxRetries) {
        scrollRetryCountRef.current = 0;
      }
    }, 100);
  }, [flatListRef]);

  const renderItem = useCallback(({ item: msg }: { item: Message }) => (
    <MessageBubble
      message={msg}
      onLongPress={() => onLongPress(msg)}
      onDoubleTap={() => onDoubleTap(msg)}
      onProfilePress={msg.role === 'user' ? onUserProfile : () => onCharProfile(String(msg.characterId ?? ''))}
      userAvatarUri={userAvatarUri}
      userName={userName}
      deviceTier={deviceTier}
      characterImageUris={
        msg.characterId
          ? (charMap.get(Number(msg.characterId))?.imageUris ?? primaryCharacter?.imageUris)
          : primaryCharacter?.imageUris
      }
      storyId={storyId}
      onReply={onSwipeReply ? () => onSwipeReply(msg) : undefined}
      narratorPosition={narratorPositionMap.get(msg.id)}
      groupPosition={groupPositionMap.get(msg.id)}
    />
  ), [
    onLongPress,
    onDoubleTap,
    onUserProfile,
    onCharProfile,
    userAvatarUri,
    userName,
    deviceTier,
    charMap,
    storyId,
    onSwipeReply,
    narratorPositionMap,
    groupPositionMap,
  ]);

  const footerComponent = useMemo(() => (
    <>
      {streamingBubble && (
        <MessageBubble
          message={streamingBubble}
          onProfilePress={NOOP}
          deviceTier={deviceTier}
          storyId={storyId}
          userName={userName}
          userAvatarUri={userAvatarUri}
          characterImageUris={
            streamingBubble.characterId
              ? charMap.get(Number(streamingBubble.characterId))?.imageUris
              : primaryCharacter?.imageUris
          }
        />
      )}
      {isTyping && (
        <ChatTypingIndicator
          profileUrl={primaryCharacter?.profileUrl}
          storyId={storyId}
          charId={primaryCharacter?.id}
          charName={primaryCharacter?.name}
          deviceTier={deviceTier}
        />
      )}
      {!isTyping && activeChoiceEvent && (
        <ChoicePanel
          event={activeChoiceEvent}
          userName={userName}
          onSelect={onChoiceSelect}
        />
      )}
    </>
  ), [
    streamingBubble,
    deviceTier,
    storyId,
    isTyping,
    primaryCharacter,
    activeChoiceEvent,
    userName,
    onChoiceSelect,
    userAvatarUri,
    charMap,
  ]);

  return (
    <View style={styles._flex}>
      <LegendList
        ref={flatListRef}
        data={messages}
        keyExtractor={keyExtractor}
        style={styles._flex}
        contentContainerStyle={styles._listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        estimatedItemSize={88}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        removeClippedSubviews
        alignItemsAtEnd
        maintainScrollAtEnd={autoScrollEnabled && isAtBottom}
        recycleItems
        getItemType={getItemType}
        onContentSizeChange={handleContentSizeChange}
        drawDistance={900}
        waitForInteractions
        onScrollToIndexFailed={handleScrollToIndexFailed}
        renderItem={renderItem}
        ListFooterComponent={footerComponent}
      />

      <ScrollFab
        isAtBottom={isAtBottom}
        isTyping={isTyping}
        onPress={onScrollToBottom}
        scrollToBottomAnimStyle={scrollToBottomAnimStyle}
      />
    </View>
  );
});

export default ChatMessageList;

// Styles
const ch = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginVertical: 16,
    backgroundColor: 'rgba(10,10,15,0.95)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden'
  },
  promptBox: {
    padding: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)'
  },
  promptText: {
    color: '#bbb', fontSize: 13, fontStyle: 'italic', lineHeight: 20, textAlign: 'center'
  },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  optionBtnLast: {
    borderBottomWidth: 0
  },
  optionLabel: { color: '#F0F0F5', fontSize: 15, flex: 1, lineHeight: 22 },
  optionArrow: { color: '#797990', fontSize: 22, marginLeft: 8 }
  });

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 16, right: 16, zIndex: 10
  },
  inner: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(20,20,28,0.90)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    elevation: 8
  },
  chevron: {
    marginTop: 1, // visual center correction
  },
  icon: { color: '#F0F0F5', fontSize: 18 },
  dot: {
    position: 'absolute', top: 7, right: 7,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80',
    borderWidth: 1.5, borderColor: 'rgba(20,20,28,0.90)'
  }
  });

const styles = StyleSheet.create({
  _flex: {
    flex: 1
  },
  _listContent: {
    paddingHorizontal: 0,
    paddingTop: 8
  }
  });
