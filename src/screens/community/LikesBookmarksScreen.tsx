 
 
// src/screens/community/LikesBookmarksScreen.tsx
// 좋아요 게시글 / 북마크 스토리 / 웹소설 단락북마크 3탭

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Heart, Bookmark, BookOpen, ArrowLeft } from 'lucide-react-native';
  
 

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useLanguageStore } from '../../store/languageStore';
import { useAuthStore } from '../../store/authStore';
import { authedFetch } from '../../utils/authedFetch';
import { PressableOpacity } from '../../components/PressableOpacity';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonPostList } from '../../components/Skeleton';
import { Radius, Typography } from '../../constants/tokens';
import {
  filterCommunityFeedPosts,
  normalizeCommunityFeedPost,
  type CommunityFeedPost,
} from '../../community/communityModels';
import { useUserProfileStore } from '../../store/userProfileStore';
import { useShallow } from 'zustand/react/shallow';

interface BookmarkedStory {
  id: string;
  title: string;
  description: string;
  author: string;
  coverUrl?: string;
  likeCount: number;
}

interface NovelBookmark {
  postId: string;
  postTitle: string;
  paragraph: string;
  bookmarkedAt: number;
}

function fmtTime(ts: string, t: Record<string, string | undefined>) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return t.justNow ?? '';
  if (d < 3600) return (t.minutesAgo ?? '').replace('{n}', String(Math.floor(d / 60)));
  if (d < 86400) return (t.hoursAgo ?? '').replace('{n}', String(Math.floor(d / 3600)));
  return (t.daysAgo ?? '').replace('{n}', String(Math.floor(d / 86400)));
}

type Tab = 'likes' | 'bookmarks' | 'passages';

const TAB_CONFIG: { key: Tab; labelKey: 'tabLikes' | 'tabBookmarks' | 'tabPassages'; icon: typeof Heart }[] = [
  { key: 'likes', labelKey: 'tabLikes', icon: Heart },
  { key: 'bookmarks', labelKey: 'tabBookmarks', icon: Bookmark },
  { key: 'passages', labelKey: 'tabPassages', icon: BookOpen },
];

export function LikesBookmarksScreen({ navigation }: any) {
  const jwtToken = useAuthStore(s => s.user?.jwtToken ?? '');
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const { blockedAuthorIds, blockedHashtags } = useUserProfileStore(useShallow(s => ({
    blockedAuthorIds: s.profile.blockedAuthorIds ?? [],
    blockedHashtags: s.profile.blockedHashtags ?? [],
  })));
  const [tab, setTab] = useState<Tab>('likes');

  // ── 좋아요 게시글 ──────────────────────────────────────────────────────
  const likesQuery = useInfiniteQuery({
    queryKey: ['my-likes', jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/community/my-likes?${params}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const posts = Array.isArray(data.posts)
        ? data.posts
            .map(normalizeCommunityFeedPost)
            .filter((post): post is CommunityFeedPost => post !== null)
        : [];
      return { posts, nextCursor: data.nextCursor as string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: p => p.nextCursor ?? undefined,
    select: d => d.pages.flatMap(p => p.posts),
    staleTime: 60_000,
    enabled: tab === 'likes' && !!jwtToken });

  // ── 북마크 스토리 ──────────────────────────────────────────────────────
  const bookmarksQuery = useInfiniteQuery({
    queryKey: ['my-bookmarks', jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/story/bookmarks?${params}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return { stories: (data.stories ?? []) as BookmarkedStory[], nextCursor: data.nextCursor as string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: p => p.nextCursor ?? undefined,
    select: d => d.pages.flatMap(p => p.stories),
    staleTime: 60_000,
    enabled: tab === 'bookmarks' && !!jwtToken });

  // ── 단락 북마크 (MMKV 로컬에서 읽기) ──────────────────────────────────
  const passagesQuery = useInfiniteQuery({
    queryKey: ['my-passages', jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/community/my-passage-bookmarks?${params}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return { bookmarks: (data.bookmarks ?? []) as NovelBookmark[], nextCursor: data.nextCursor as string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: p => p.nextCursor ?? undefined,
    select: d => d.pages.flatMap(p => p.bookmarks),
    staleTime: 60_000,
    enabled: tab === 'passages' && !!jwtToken });

  // ── Render ─────────────────────────────────────────────────────────────
  const renderLike = useCallback(({ item, index }: ListRenderItemInfo<CommunityFeedPost>) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <PressableOpacity
        style={[s.card, item.boardType === 'webnovel' && s.cardNovel]}
        onPress={() => {
          if (item.boardType === 'webnovel') navigation.navigate('CommunityPostDetail', { postId: item.id });
          else navigation.navigate('CommunityPostDetail', { postId: item.id });
        }}
      >
        {item.boardType === 'webnovel' && <View style={s.novelBar} />}
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.content && <Text style={s.cardSub} numberOfLines={1}>{item.content}</Text>}
        <View style={s.cardMeta}>
          <Heart size={10} color={'#FF6B8B'} fill={'#FF6B8B'} />
          <Text style={s.cardMetaTxt}>{item.likeCount}</Text>
          <Text style={s.cardDot}>·</Text>
          <Text style={s.cardMetaTxt}>@{item.author}</Text>
          <Text style={s.cardDot}>·</Text>
          <Text style={s.cardMetaTxt}>{fmtTime(item.createdAt, t)}</Text>
        </View>
      </PressableOpacity>
    </Animated.View>
  ), [navigation, t]);

  const renderBookmark = useCallback(({ item, index }: ListRenderItemInfo<BookmarkedStory>) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <PressableOpacity
        style={s.card}
        onPress={() => navigation.navigate('StoryDetail', { story: item })}
      >
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.description && <Text style={s.cardSub} numberOfLines={2}>{item.description}</Text>}
        <View style={s.cardMeta}>
          <Bookmark size={10} color={'#8B5CF6'} fill={'#8B5CF6'} />
          <Text style={s.cardMetaTxt}>{t?.saved ?? ''}</Text>
          <Text style={s.cardDot}>·</Text>
          <Text style={s.cardMetaTxt}>@{item.author}</Text>
        </View>
      </PressableOpacity>
    </Animated.View>
  ), [navigation, t?.saved]);

  const renderPassage = useCallback(({ item, index }: ListRenderItemInfo<NovelBookmark>) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <PressableOpacity
        style={s.passageCard}
        onPress={() => navigation.navigate('WebNovelReader', { novelId: item.postId })}
      >
        <Text style={s.passageTitle} numberOfLines={1}>{item.postTitle}</Text>
        <View style={s.quoteLine} />
        <Text style={s.passageText} numberOfLines={4}>{item.paragraph}</Text>
        <Text style={s.passageDate}>
          {new Date(item.bookmarkedAt).toLocaleDateString()}
        </Text>
      </PressableOpacity>
    </Animated.View>
  ), [navigation]);

  type DataItem = CommunityFeedPost | BookmarkedStory | NovelBookmark;
  const activeQuery = tab === 'likes' ? likesQuery : tab === 'bookmarks' ? bookmarksQuery : passagesQuery;
  const filteredLikes = filterCommunityFeedPosts(likesQuery.data ?? [], {
    blockedAuthorIds,
    blockedTags: blockedHashtags,
  });
  const data = tab === 'likes' ? filteredLikes : tab === 'bookmarks' ? (bookmarksQuery.data ?? []) : (passagesQuery.data ?? []);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />

      {/* 헤더 */}
      <View style={s.header}>
        <PressableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={'#F0F0F5'} />
        </PressableOpacity>
        <Text style={s.headerTitle}>{t?.likesBookmarksTitle ?? ''}</Text>
      </View>

      {/* 탭 */}
      <View style={s.tabs}>
        {TAB_CONFIG.map(({ key, labelKey, icon: Icon }) => {
          const active = tab === key;
          return (
            <PressableOpacity key={key} style={s.tabItem} onPress={() => setTab(key)}>
              <Icon size={13} color={active ? '#D4A853' : '#797990'} />
              <Text style={[s.tabTxt, active && s.tabActive]}>{t?.[labelKey] ?? ''}</Text>
              {active && <View style={s.tabUnder} />}
            </PressableOpacity>
          );
        })}
      </View>

      {/* 본문 */}
      {activeQuery.isLoading ? (
        <SkeletonPostList count={5} />
      ) : data.length === 0 ? (
        <EmptyState
          type="empty"
          title={
            tab === 'likes' ? (t?.noLikedPosts ?? '') :
            tab === 'bookmarks' ? (t?.noBookmarks ?? '') :
            (t?.noPassages ?? '')
          }
          subtitle=""
        />
      ) : (
        <FlashList
          data={(data as DataItem[]) ?? []}
          keyExtractor={(item: DataItem) => (item as any).id ?? (item as any).postId ?? String((item as any).bookmarkedAt)}
          renderItem={
            tab === 'likes' ? (renderLike as any) :
            tab === 'bookmarks' ? (renderBookmark as any) :
            (renderPassage as any)
          }
          estimatedItemSize={tab === 'passages' ? 160 : 120}
          contentContainerStyle={s.listPad}
          showsVerticalScrollIndicator={false}
          onEndReached={() => { if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) activeQuery.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={() => activeQuery.refetch()}
              tintColor={'#D4A853'}
            />
          }
          ListFooterComponent={activeQuery.isFetchingNextPage ? (
            <View style={s.loader}><ActivityIndicator color={'#D4A853'} /></View>
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, gap: 12 },
  headerTitle: { fontSize: 20, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.4 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#0C0C14' },

  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#181820' },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, position: 'relative' },
  tabTxt: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabActive: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabUnder: { position: 'absolute', bottom: 0, height: 2.5, width: 36, backgroundColor: '#D4A853', borderRadius: 2 },

  listPad: { paddingHorizontal: 14, paddingVertical: 8, paddingBottom: 100 },
  card: {
    backgroundColor: '#0E0E14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, marginBottom: 8, gap: 6, position: 'relative', overflow: 'hidden' },
  cardNovel: { borderColor: 'rgba(212,168,83,0.2)', backgroundColor: '#0C0C12' },
  novelBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#8B5CF6', borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg },
  cardTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  cardSub: { fontSize: 13, color: '#8A8A9E', fontFamily: Typography.fontFamily.regular },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaTxt: { fontSize: 11, color: '#6A6A84', fontFamily: Typography.fontFamily.regular },
  cardDot: { fontSize: 10, color: '#3A3A4E' },

  passageCard: {
    backgroundColor: '#0C0C14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.2)',
    padding: 14, marginBottom: 8, gap: 8 },
  passageTitle: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853' },
  quoteLine: { width: 3, height: 'auto', backgroundColor: 'rgba(212,168,83,0.4)', borderRadius: 2, marginLeft: 4 },
  passageText: { fontSize: 14, color: '#C8C8D4', lineHeight: 22, fontFamily: Typography.fontFamily.regular, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(212,168,83,0.3)' },
  passageDate: { fontSize: 10, color: '#5A5A70', fontFamily: Typography.fontFamily.regular, textAlign: 'right' },

  loader: { paddingVertical: 16, alignItems: 'center' } });
