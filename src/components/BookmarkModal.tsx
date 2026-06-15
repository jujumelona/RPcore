// src/components/BookmarkModal.tsx — BottomSheet v2
import { RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../hooks/useTranslation';
import { PressableOpacity } from './PressableOpacity';
import { Radius, Space, Typo, Typography } from '../constants/tokens';
import type { Message } from '../screens/chat/types/ChatTypes';
import { formatChatTextForDisplay } from '../utils/chatDisplayText';

interface Props {
  visible: boolean;
  bookmarks: Message[];
  messages: Message[];
  resolvedUserName: string;
  flatListRef: RefObject<any>;
  onClose: () => void;
  onScrolled?: () => void;
}

export function BookmarkModal({ visible, bookmarks, messages, resolvedUserName, flatListRef, onClose, onScrolled }: Props) {
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%', '80%'], []);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narratorLabel = t.narratorLabel;
  const characterLabel = t.character;

  useEffect(() => {
    if (visible) sheetRef.current?.expand();
    else sheetRef.current?.close();
  }, [visible]);

  useEffect(() => {
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, []);

  const handleItemPress = useCallback((message: Message) => {
    onClose();
    const messageIndex = messages.findIndex(item => item.id === message.id);
    if (messageIndex < 0) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      try {
        flatListRef.current?.scrollToIndex?.({ index: messageIndex, animated: true, viewPosition: 0.5 });
      } catch {
        flatListRef.current?.scrollToEnd?.({ animated: true });
      }
      onScrolled?.();
    }, 350);
  }, [messages, onClose, onScrolled, flatListRef]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} />
  ), []);

  if (!visible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t.bookmarkListTitle}</Text>
        <Text style={styles.count}>{bookmarks.length}</Text>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {bookmarks.length === 0 ? (
          <Text style={styles.empty}>{t.bookmarkEmpty}</Text>
        ) : (
          bookmarks.map((message, index) => {
            const label =
              message.role === 'user' ? resolvedUserName
              : message.role === 'narrator' ? narratorLabel
              : (message.characterName ?? characterLabel);

            return (
              <Animated.View key={message.id} entering={FadeInDown.delay(index * 30).duration(280).springify()}>
                <PressableOpacity
                  style={[styles.item, index < bookmarks.length - 1 && styles.itemBorder]}
                  onPress={() => handleItemPress(message)}
                >
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.content} numberOfLines={3}>
                    {message.role === 'user'
                      ? message.content
                      : formatChatTextForDisplay(message.content ?? '', resolvedUserName)}
                  </Text>
                </PressableOpacity>
              </Animated.View>
            );
          })
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg:  { backgroundColor: '#08080C', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  handle:   { backgroundColor: '#757585', width: 36 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space['5'], paddingVertical: Space['4'], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  title:    { fontSize: Typo.size.h3, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  count:    { fontSize: Typo.size.sm, color: '#797990', backgroundColor: '#111118', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  empty:    { textAlign: 'center', paddingVertical: Space['8'], color: '#797990', fontSize: Typo.size.base },
  item:     { paddingHorizontal: Space['5'], paddingVertical: Space['4'] },
  itemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  label:    { fontSize: Typo.size.xs, color: '#D4A853', marginBottom: 4, fontFamily: Typography.fontFamily.semibold },
  content:  { fontSize: Typo.size.base, color: '#C8C8D4', lineHeight: 22 } });
