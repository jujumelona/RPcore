/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/ConversationsScreen.tsx
// ??UX v3 ????????ш끽維??????+ ?癲ル슢?????????떔???+ ???筌?猷?+ ??????븐뻤??CTA
// ??Phase 3 as-any ???곌퇈?뗦틦?????썹땟??

import { useShallow } from 'zustand/react/shallow';
import { triggerHaptic } from '../utils/haptics';
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet,
  ListRenderItemInfo, TextInput,
  Animated, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LegendList } from '@legendapp/list';
import AnimatedReanimated, {
  useSharedValue, useAnimatedStyle, withSpring,
  FadeInDown, FadeIn, FadeOut
} from 'react-native-reanimated';
import { Spring, Typography, Typo } from '../constants/tokens';
import { useLanguageStore } from '../store/languageStore';
import { EmptyState } from '../components/EmptyState';
import { MessageCircle, Plus, Search, Trash2, X, ArrowLeft } from 'lucide-react-native';
import { PressableOpacity } from '../components/PressableOpacity';
import { useChatStore } from '../store/chatStore';
import { Image } from 'expo-image';
import { fuzzySearch } from '../utils/fuzzySearch';
import { appStorage } from '../utils/storage';

interface ConvItem {
  storyId: string;
  title: string;
  charNames: string;
  coverUrl: string;
  preview: string;
  timeLabel: string;
  unread: number;
  initial: string;
  storyObj: {
    id: string;
    title: string;
    coverUrl: string;
    story_config?: Record<string, unknown>;
    author?: string;
  };
}

function formatUnreadCount(count: number): string {
  return count > 99 ? `99${String.fromCharCode(43)}` : String(count);
}

function timeLabel(ms: number, t: Record<string, string | undefined>, appLanguage = 'ko'): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)          return t?.timeJustNowShort ?? '';
  if (diff < 3_600_000)       return (t?.timeMinAgoShort ?? '').replace('{n}', String(Math.floor(diff / 60_000)));
  if (diff < 86_400_000)      return (t?.timeHourAgoShort ?? '').replace('{n}', String(Math.floor(diff / 3_600_000)));
  if (diff < 7 * 86_400_000)  return (t?.timeDayAgoShort ?? '').replace('{n}', String(Math.floor(diff / 86_400_000)));
  return new Date(ms).toLocaleDateString(appLanguage, { month: 'short', day: 'numeric' });
}

// ???? ??????ш끽維????????⑤㈇??????????????????????????????????????????????????????????????????????????????????????????????????????????????
const SWIPE_THRESHOLD = -80;
const DELETE_WIDTH = 80;

const SwipeableConvCard = React.memo(function SwipeableConvCard({
  item, onPress, index, onDelete, deleteLabel
  }: { item: ConvItem; onPress: () => void; index: number; onDelete: () => void; deleteLabel: string }) {
  const scale     = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipeOpen = useRef(false);

  // [MEMORY LEAK FIX] Animated.Value ?癲ル슢???뚭괌?
  useEffect(() => {
    return () => {
      translateX.stopAnimation?.();
    };
  }, [translateX]);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => {
      const x = Math.min(0, Math.max(-DELETE_WIDTH - 20, g.dx));
      translateX.setValue(x);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx < SWIPE_THRESHOLD) {
        // ????????쇨덧??????源낇꺙
        triggerHaptic('select');
        Animated.spring(translateX, {
          toValue: -DELETE_WIDTH,
          useNativeDriver: true,
          speed: 20,
          bounciness: 4
  }).start(() => { isSwipeOpen.current = true; });
      } else {
        // ???????
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 4
  }).start(() => { isSwipeOpen.current = false; });
      }
    }
  })).current;

  const closeSwipe = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    isSwipeOpen.current = false;
  };

  return (
    <AnimatedReanimated.View entering={FadeInDown.delay(index * 35).springify().damping(22)}>
      <Animated.View
        style={[animStyle as any, s.swipeRoot]}
      >
        {/* ?????筌??????熬곣뫖利???볝걤?*/}
        <View style={s.deleteAction}>
        <PressableOpacity
          style={s.deleteActionBtn}
          onPress={() => { closeSwipe(); onDelete(); }}
          accessibilityLabel={deleteLabel}
          accessibilityRole="button"
        >
          <Trash2 size={20} color="#FFF" />
          <Text style={s.deleteActionText}>{deleteLabel}</Text>
        </PressableOpacity>
      </View>

      {/* ??⑤㈇??????⑤슢?뽫춯?竊??*/}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <PressableOpacity
          testID={`story-list-item-${index}`}
          accessibilityLabel={`story-list-item-${index}`}
          style={[s.item, item.unread > 0 && s.itemUnread]}
          onPress={() => { if (isSwipeOpen.current) { closeSwipe(); return; } onPress(); }}
          onPressIn={() => { scale.value = withSpring(0.975, Spring.press); }}
          onPressOut={() => { scale.value = withSpring(1, Spring.press); }}
          activeOpacity={1}
        >
          {/* ????썹땟怨살춾?? */}
          <View style={s.avatarWrap}>
            <View style={[s.avatar, item.unread > 0 && s.avatarActive]}>
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={s.avatarImg} contentFit="cover" />
              ) : (
                <Text style={s.avatarText}>{item.initial}</Text>
              )}
            </View>
            {/* ?癲ル슢?롩걡?붽괌??dot */}
            {item.unread > 0 && <View style={s.unreadDot} />}
          </View>

          {/* ????ㅼ굡獒?*/}
          <View style={s.itemContent}>
            <View style={s.itemTop}>
              <Text style={[s.itemName, item.unread > 0 && s.itemNameBold]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={s.itemTime}>{item.timeLabel}</Text>
            </View>
            {item.charNames ? (
              <Text style={s.itemSub} numberOfLines={1}>{item.charNames}</Text>
            ) : null}
            <View style={s.itemBottom}>
              <Text style={[s.itemPreview, item.unread > 0 && s.itemPreviewBold]} numberOfLines={1}>
                {item.preview}
              </Text>
              {item.unread > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{formatUnreadCount(item.unread)}</Text>
                </View>
              )}
            </View>
          </View>
        </PressableOpacity>
      </Animated.View>
      </Animated.View>
    </AnimatedReanimated.View>
  );
});

export function ConversationsScreen({
  navigation
  }: {
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
}) {
  const { t, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })));
  const sessions      = useChatStore(s => s.sessions);
  const removeSession = useChatStore(s => s.clearSession);

  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  // ??[BUG FIX] undo ?熬곣뫖利??癒?걤?????븐뻤????????3??????◈?됰쨨?+ ???繹먮냱議??????源껎꺘???β뼯爰귨㎘?undo ?筌?????
  const [undoPending, setUndoPending] = useState<{ item: ConvItem } | null>(null);
  const [hasSeenSwipeHint, setHasSeenSwipeHint] = useState(() => {
    try { return appStorage.getBoolean('@swipe_hint_seen') ?? false; } catch { return false; }
  });

  // ??????ш끽維??????ㅻ쿋?????嶺???? (3????
  useEffect(() => {
    if (!hasSeenSwipeHint && conversations.length > 0) {
      const timerId = setTimeout(() => {
        setHasSeenSwipeHint(true);
        try { appStorage.set('@swipe_hint_seen', true); } catch {}
      }, 4000);
      return () => clearTimeout(timerId);
    }
  }, [hasSeenSwipeHint, conversations.length]);

  const undoRef = useRef<{ item: ConvItem; timeout: ReturnType<typeof setTimeout> } | null>(null);

  // [BUG FIX] ?癲ル슢??遺븍퉲???ш끽維?????癲ル슢??????????썹땟????癲ル슢???뚭괌??????붺몭?겹럷??域뱄퐢????unmount ??removeSession ?癲ル슢????
  useEffect(() => {
    return () => {
      if (undoRef.current) {
        clearTimeout(undoRef.current.timeout);
        // ?癲ル슢??遺븍퉲???ш끽維????pending ?????癲ル슢캉???
        removeSession?.(undoRef.current.item.storyId);
        undoRef.current = null;
      }
    };
  }, [removeSession]);

  useEffect(() => {
    const items: ConvItem[] = Object.values(sessions)
      .filter(sess => sess.messages && sess.messages.length > 0)
      .sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))
      .map(sess => {
        const lastMsg   = sess.messages[sess.messages.length - 1];
        const meta      = sess.storyMeta;
        const title     = meta?.title    ?? sess.storyId;
        const coverUrl  = meta?.coverUrl ?? '';
        const charNames = (meta?.charNames ?? []).join(', ');
        const initial   = title?.[0]?.toUpperCase() ?? '?';
        // [BUG FIX] chatStore ?癲ル슢?????storyMeta?????story_config??醫딆쓧? ????ㅼ굡??
        // ConversationsScreen?????Chat ?꿔꺂???????story_config ????ㅼ굡????????????
        // ChatScreenRefactored??醫딆쓧? ??storyConfig??AI ??????????됱뎽 ????????????곌숯
        // ??醫딆┻?믩베??? StoryDetail ?嚥▲굧??????醫딆쓧? ?????壤????쇨덫???????썹땟??????源????癲ル슢?????꿔꺂??????????꿔꺂????쭍???嶺뚮??←댆?config ??⑤슢?뽫뵓????嶺뚮㉡???
        const storyObj  = {
          id: sess.storyId, title, coverUrl,
          author: meta?.authorName ?? '',
          authorName: meta?.authorName ?? '',
          // characters??meta???????⑤슢?뽫뵓??(??????癲ル슢???ъ쒜筌믡꺃?? ????썹땟??config ??⑤슢?뽫뵓??? ChatScreen????嶺뚮Ĳ?됭짆?????fetch)
          // [BUG FIX] chapters?????β뼯爰???ш끽維???chapter_1 ????currentChapterIndex ???뚯???維◈????Β?????????
          // ChatScreen??????꿔꺂???????buildTurnPrompt??醫딆쓧? chapterId?????뺢껸?????戮㏐괴??꿔꺂???????          // ???β뼯爰???ш끽維???'chapter_1'?? ???繹먮냱議????뺢껸???ID?? ??? ??????⑥ろ맖 ??????썹땟?????꾣뤃罐???熬곣뫖利???
          // ?꿔꺂????쭍???????썹땟?????뺢껸????癲ル슢???????⑥쥓援??꿔꺂?????id?????꾩룆????fallback????Β??????
          story_config: meta?.charNames?.length
            ? {
                characters: meta.charNames.map((name, idx) => ({ id: idx + 2, name, profileUrl: '' })),
                chapters: Array.from({ length: Math.max(1, (sess.currentChapterIndex ?? 0) + 1) }, (_, i) => ({
                  id: `chapter_${i + 1}`,
                  title: `Chapter ${i + 1}` })),
                worldSetting: '' }
            : undefined,
          // [BUG FIX #33] lastChapterIndex ????썹땟????????????꿔꺂?????????뺢껸?????????嶺뚮??ｆ뤃?
          lastChapterIndex: sess.currentChapterIndex ?? 0 };
        return {
          storyId: sess.storyId, title, charNames, coverUrl,
          // [BUG FIX] AI ??????????곌떽?깆쓦(@??醫딆┫??? [L:?汝??吏??) ???붺몭?겹럷???????源낇꺙????????곌퇈?뗦틦?
          preview: (lastMsg?.content ?? '')
            .replace(/@\d+:[^\n]+/g, '')   // @2:e1+3 ??醫딆┫??????곌떽?깆쓦 ???곌퇈?뗦틦?
            .replace(/\[L:[^\]]+\][\s\S]*$/m, '') // [L:...] ?汝??吏????濚밸Ŧ??????곌퇈?뗦틦?
            .replace(/\[CHOICE_POINT\]/gi, '')     // CHOICE_POINT ???곌떽?깆쓦 ???곌퇈?뗦틦?
            .replace(/\n/g, ' ')
            .trim()
            .slice(0, 60),
          timeLabel: timeLabel(sess.lastUpdated ?? Date.now(), t as Record<string, string | undefined>, appLanguage),
          unread: 0, initial, storyObj
  };
      });
    setConversations(items);
  }, [sessions, t, appLanguage]);

  // ??[BUG FIX] ???繹먮냱議??????源껎꺘???β뼯爰귨㎘?undo ?????닻뇦?
  // ???뚯???? undoRef ????⑥ろ맖??undo ?筌??????????ㅿ폎??????3?????????癲ル슢캉???
  //       @ts-ignore??ToastService ???붺몭?겹럷????????쀪쑴??嚥????????썹땟??????筌???????????????
  // ????볥궚?? undoPending state + ???됰Ŧ六?????β뼯爰???熬곣뫖利??癒?걤???????繹먮냱議?undo ?筌????????????  //       3???????tap ??timer ??????+ UI ?꿔꺂??袁ㅻ븶筌믠뫀萸???⑤슢?뽫뵓??
  //       (???????????살퓢???꿔꺂??????熬곣뫀??MMKV/SQLite/KV??????꿔꺂??袁ㅻ븶?癲?clearSession ???붺몭?겹럷??沃섃뫚??嶺뚮Ĳ?됲걫 ??????????ъ군??
  const handleUndo = useCallback(() => {
    if (!undoRef.current) return;
    clearTimeout(undoRef.current.timeout);
    const restored = undoRef.current.item;
    setConversations(prev => {
      if (prev.some(c => c.storyId === restored.storyId)) return prev;
      return [restored, ...prev];
    });
    undoRef.current = null;
    setUndoPending(null);
    triggerHaptic('select');
  }, []);

  const handleDelete = useCallback((item: ConvItem) => {
    triggerHaptic('medium');

    // ????ㅼ굣???癲ル슢???域뱀빖夷???쎛 ???繹먮겧嫄х솾??癲ル슢캉???
    if (undoRef.current) {
      clearTimeout(undoRef.current.timeout);
      removeSession?.(undoRef.current.item.storyId);
      undoRef.current = null;
      setUndoPending(null);
    }

    // ?????UI ???곌퇈?뗦틦?
    setConversations(prev => prev.filter(c => c.storyId !== item.storyId));
    setUndoPending({ item });

    // 3???????繹먮냱議??????癲ル슢캉???
    const timeout = setTimeout(() => {
      removeSession?.(item.storyId);
      undoRef.current = null;
      setUndoPending(null);
    }, 3000);
    undoRef.current = { item, timeout };
  }, [removeSession]);

  const totalUnread = conversations.reduce((acc, c) => acc + c.unread, 0);
  const filtered = useMemo(() => {
    return fuzzySearch(
      conversations,
      searchQuery,
      [
        { name: 'title', weight: 0.45, getValue: item => item.title },
        { name: 'charNames', weight: 0.35, getValue: item => item.charNames },
        { name: 'preview', weight: 0.2, getValue: item => item.preview },
      ],
      { threshold: 0.32 },
    );
  }, [conversations, searchQuery]);

  const renderConvItem = useCallback(({ item, index }: ListRenderItemInfo<ConvItem>) => (
    <SwipeableConvCard
      item={item}
      index={index}
      deleteLabel={t?.deleteConv ?? ''}
      onDelete={() => handleDelete(item)}
      onPress={() => {
        if (!item.storyObj?.id) return;
        triggerHaptic('select');
        // StoryDetail???亦껋꼨援?? ?????(KV ??????꿔꺂?????용Ъ??????繹먮굝??汝??吏??좉텣?
        navigation.navigate('StoryDetail', {
          story: item.storyObj,
          isMyStory: false
        });
      }}
    />
  ), [navigation, handleDelete, t]);

  return (
    <View style={s.backdropRoot}>
      <SafeAreaView style={s.safeTransparent}>

        {/* ????諛몄? */}
        <View style={s.header}>
          {searchVisible ? (
            <AnimatedReanimated.View entering={FadeIn.duration(200)} style={s.searchBar}>
              <Search size={15} color="#797990" />
              <TextInput
                style={s.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t?.searchConversations ?? ''}
                placeholderTextColor="#4A4A5E"
                autoFocus
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              <PressableOpacity
                onPress={() => { setSearchVisible(false); setSearchQuery(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color="#797990" />
              </PressableOpacity>
            </AnimatedReanimated.View>
          ) : (
            <>
              <View>
                <Text style={s.headerTitle}>{t?.conversations2 ?? ''}</Text>
                {totalUnread > 0 ? (
                  <Text style={s.headerSub}>
                    {(t?.numUnreadMessages ?? '').replace('{n}', String(totalUnread))}
                  </Text>
                ) : (
                  <Text style={s.headerSub}>{String(conversations.length)}</Text>
                )}
              </View>
              <View style={s.headerBtns}>
                <PressableOpacity
                  style={s.headerBtn}
                  onPress={() => { triggerHaptic('select'); setSearchVisible(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={t?.search ?? ''}
                  accessibilityRole="button"
                >
                  <Search size={18} color="#C8C8D4" />
                </PressableOpacity>
                <PressableOpacity
                  style={[s.headerBtn, s.headerBtnGold]}
                  onPress={() => { triggerHaptic('light'); navigation.navigate('Home'); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={t?.newChat ?? ''}
                  accessibilityRole="button"
                >
                  <Plus size={20} color="#D4A853" />
                </PressableOpacity>
              </View>
            </>
          )}
        </View>

        {/* ????????*/}
        <View style={s.divider} />

        {/* ??????????諛몄? */}
        <View style={s.listHeader}>
          <MessageCircle size={13} color="#797990" />
          <Text style={s.listHeaderText}>
            {searchQuery ? `"${searchQuery}"` : (t?.latestOrder ?? '')}
          </Text>
          {totalUnread > 0 && !searchQuery && (
            <View style={s.totalBadge}>
              <Text style={s.totalBadgeText}>{totalUnread}</Text>
            </View>
          )}
          {searchQuery && (
            <Text style={s.searchCount}>{filtered.length}</Text>
          )}
        </View>

        {/* ??????ш끽維??????ㅻ쿋?????꿔꺂??節뉖き??1?????*/}
        {conversations.length > 0 && !searchQuery && !hasSeenSwipeHint && (
          <AnimatedReanimated.View entering={FadeIn.delay(800).duration(400)} exiting={FadeOut} style={s.swipeHintRow}>
            <ArrowLeft size={10} color="#3A3A50" />
            <Text style={s.swipeHint}>{t?.swipeToDelete ?? ''}</Text>
          </AnimatedReanimated.View>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            type={searchQuery ? 'search' : 'conversation'}
            title={searchQuery ? (t?.noSearchResults2 ?? '') : (t?.noChats ?? '')}
            subtitle={
              searchQuery
                ? (t?.searchNoResultsSubtitle ?? '')
                : (t?.homeToStartChat ?? '')
            }
            onRetry={searchQuery ? undefined : () => navigation.navigate('Home')}
            retryLabel={t?.exploreStories ?? ''}
          />
        ) : (
          <LegendList
            data={filtered}
            keyExtractor={(item: any) => String(item.storyId)}
            estimatedItemSize={74}
            recycleItems
            renderItem={renderConvItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.listContent}
          />
        )}
        {/* ??[BUG FIX] undo ?熬곣뫖利??癒?걤???3???????繹먮냱議?????源껎꺘 */}
        {undoPending && (
          <AnimatedReanimated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOut.duration(180)}
            style={s.undoBanner}
          >
            <Text style={s.undoBannerText} numberOfLines={1}>
              {(t?.deletedConv ?? '').replace('{n}', undoPending.item.title)}
            </Text>
            <PressableOpacity onPress={handleUndo} style={s.undoBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.undoBtnText}>{t?.undo ?? ''}</Text>
            </PressableOpacity>
          </AnimatedReanimated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  backdropRoot: { flex: 1, backgroundColor: '#050507' },
  safeTransparent: { flex: 1, backgroundColor: '#050507' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 10
  },
  headerBtns:  { flexDirection: 'row', gap: 8 },
  headerTitle: { fontSize: Typo.size.xl, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium, marginTop: 2 },
  headerBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0E0E14', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  headerBtnGold: { borderColor: 'rgba(212,168,83,0.35)' },

  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: Typography.fontFamily.regular,
    color: '#F0F0F5', padding: 0
  },
  searchCount: { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#D4A853' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(139,92,246,0.20)' },

  listHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, gap: 6
  },
  listHeaderText: {
    fontSize: 11, fontFamily: Typography.fontFamily.bold, color: '#797990',
    letterSpacing: 1.2, textTransform: 'uppercase', flex: 1
  },
  totalBadge: { backgroundColor: '#D4A853', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, elevation: 3 },
  totalBadgeText:  { fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  swipeHintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: 20, paddingBottom: 4, gap: 4 },
  swipeHint: {
    fontSize: 10, color: '#3A3A50',
    fontFamily: Typography.fontFamily.regular },

  // ??????ш끽維??
  swipeRoot: { overflow: 'hidden' },
  deleteAction: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: DELETE_WIDTH,
    backgroundColor: '#FF4444',
    alignItems: 'center', justifyContent: 'center'
  },
  deleteActionBtn: { alignItems: 'center', justifyContent: 'center', gap: 3, padding: 8 },
  deleteActionText: { fontSize: 10, color: '#FFF', fontFamily: Typography.fontFamily.semibold },

  // ??????⑤㈇????
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24',
    backgroundColor: '#050507'
  },
  itemUnread: { backgroundColor: 'rgba(212,168,83,0.06)', borderLeftWidth: 2, borderLeftColor: 'rgba(212,168,83,0.55)' },

  avatarWrap:  { position: 'relative' },
  avatar: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#0E0E14',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarActive: { borderColor: 'rgba(212,168,83,0.5)' },
  avatarImg:    { width: '100%', height: '100%' },
  avatarText:   { fontSize: 20, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  unreadDot: {
    position: 'absolute', top: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#D4A853',
    borderWidth: 2, borderColor: '#050507',
    elevation: 3
  },

  itemContent: { flex: 1, minWidth: 0 },
  itemTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 },
  itemBottom:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },

  itemName: { fontSize: 15, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', flex: 1, marginRight: 8 },
  itemNameBold:    { fontFamily: Typography.fontFamily.bold },
  itemSub:         { fontSize: 11, color: '#797990', fontFamily: Typography.fontFamily.regular, marginBottom: 1 },
  itemTime:        { fontSize: 11, color: '#797990', flexShrink: 0 },
  itemPreview: { fontSize: 13, color: '#7A7A90', flex: 1, marginRight: 8 },
  itemPreviewBold: { color: '#C8C8D4', fontFamily: Typography.fontFamily.medium },

  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#D4A853',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    elevation: 3
  },
  badgeText:   { fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#000' },
  listContent: { paddingBottom: 20 },
  undoBanner: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: 'rgba(18,18,28,0.97)',
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(167,139,250,0.4)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 10,
  },
  undoBannerText: { color: '#C8C8D4', fontSize: 13, fontFamily: Typography.fontFamily.regular, flex: 1, marginRight: 8 },
  undoBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: 'rgba(167,139,250,0.18)', borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(167,139,250,0.5)',
  },
  undoBtnText: { color: '#A78BFA', fontSize: 13, fontFamily: Typography.fontFamily.semibold },
});
