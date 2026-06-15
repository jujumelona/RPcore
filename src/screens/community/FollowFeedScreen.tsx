
// src/screens/community/FollowFeedScreen.tsx
// Bluesky social-app (MIT) Following/ForYou 피드 아키텍처 이식
// — 팔로잉 피드 + 추천 피드 탭 무한스크롤, 낙관적 좋아요, 작가 아바타 행

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, TextInput,
    
   
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Pressable, ActivityIndicator, RefreshControl } from 'react-native';
 
 
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
  
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
 
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Animated, { FadeInDown, FadeIn, SlideInDown } from 'react-native-reanimated';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MessageCircle, Eye, Users, Sparkles, Search, X, ChevronRight } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';

import { useLanguageStore } from '../../store/languageStore';
import { useAuthStore } from '../../store/authStore';
import { authedFetch } from '../../utils/authedFetch';
import { PressableOpacity } from '../../components/PressableOpacity';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonPostList } from '../../components/Skeleton';
import { Radius, Typography } from '../../constants/tokens';
import { formatCount } from '../../utils/formatCount';
import { useOptimisticLike } from '../../hooks/useOptimisticLike';
import {
  filterCommunityFeedPosts,
  normalizeCommunityFeedPost,
  type CommunityFeedPost,
} from '../../community/communityModels';
import { useUserProfileStore } from '../../store/userProfileStore';

// ── Types ──────────────────────────────────────────────────────────────────
interface FeedAuthor {
  id: string;
  name: string;
  avatar_url?: string;
  story_count: number;
}

// ── Helper ─────────────────────────────────────────────────────────────────
function fmtTime(ts: string, t: Record<string, string | undefined>) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return t.justNow ?? '';
  if (d < 3600) return (t.minutesAgo ?? '').replace('{n}', String(Math.floor(d / 60)));
  if (d < 86400) return (t.hoursAgo ?? '').replace('{n}', String(Math.floor(d / 3600)));
  return (t.daysAgo ?? '').replace('{n}', String(Math.floor(d / 86400)));
}

// ── PostCard ───────────────────────────────────────────────────────────────
const PostCard = React.memo(function PostCard({
  post, index, onPress, lang, t }: {
  post: CommunityFeedPost; index: number; onPress: () => void; lang: string; t: Record<string, string | undefined>;
}) {
  const { isLiked, likeCount, toggleLike } = useOptimisticLike({
    postId: post.id,
    initialLiked: post.likedByMe ?? false,
    initialCount: post.likeCount,
    invalidateKeys: [['follow-feed'], ['recommended-feed']] });

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(22)}>
      <PressableOpacity style={s.card} onPress={onPress} activeOpacity={0.87}>
        {post.boardType === 'webnovel' && <View style={s.novelBar} />}

        {/* 태그 */}
        {post.tags.length > 0 && (
          <View style={s.tagRow}>
            {post.tags.slice(0, 3).map((tag) => (
              <View key={tag.id} style={[s.tag, post.boardType === 'webnovel' && s.tagNovel]}>
                <Text style={[s.tagTxt, post.boardType === 'webnovel' && { color: '#D4A853' }]}>#{tag.label}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.title} numberOfLines={2}>{post.title}</Text>
        {!!post.content && (
          <Text style={s.preview} numberOfLines={2}>{post.content}</Text>
        )}

        {/* 메타 */}
        <View style={s.metaRow}>
          <View style={s.metaLeft}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>{post.author?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
            <Text style={s.author}>{post.author}</Text>
            <Text style={s.dot}>·</Text>
            <Text style={s.time}>{fmtTime(post.createdAt, t)}</Text>
          </View>
          <View style={s.metaRight}>
            <PressableOpacity style={s.metaBtn} onPress={toggleLike} hitSlop={8}>
              <Heart size={12} color={isLiked ? '#FF6B8B' : '#797990'} fill={isLiked ? '#FF6B8B' : 'none'} />
              <Text style={[s.metaCount, isLiked && { color: '#FF6B8B' }]}>{formatCount(likeCount, lang)}</Text>
            </PressableOpacity>
            <View style={s.metaBtn}>
              <MessageCircle size={12} color={'#60A5FA'} />
              <Text style={s.metaCount}>{formatCount(post.commentCount, lang)}</Text>
            </View>
            <View style={s.metaBtn}>
              <Eye size={12} color={'#797990'} />
              <Text style={s.metaCount}>{formatCount(post.viewCount, lang)}</Text>
            </View>
          </View>
        </View>
      </PressableOpacity>
    </Animated.View>
  );
});

// ── AuthorChip ─────────────────────────────────────────────────────────────
const AuthorChip = React.memo(function AuthorChip({
  author, onPress, t }: { author: FeedAuthor; onPress: () => void; t: Record<string, string | undefined> }) {
  return (
    <PressableOpacity style={s.authorChip} onPress={onPress}>
      <View style={s.authorAvatar}>
        <Text style={s.authorAvatarTxt}>{author.name?.[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      { }
      <Text style={s.authorName} numberOfLines={1}>{author.name}</Text>
      <Text style={s.authorSub}>{(t.episodeUnit ?? '').replace('{n}', String(author.story_count))}</Text>
     { }
    </PressableOpacity>
  );
 
});

 
// ── Main Screen ────────────────────────────────────────────────────────────
export function FollowFeedScreen({ navigation }: any) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { t, lang } = useLanguageStore(useShallow(s => ({ t: s.t, lang: s.appLanguage })));
  const jwtToken = useAuthStore(s => s.user?.jwtToken ?? '');
  const { blockedAuthorIds, blockedHashtags } = useUserProfileStore(useShallow(s => ({
    blockedAuthorIds: s.profile.blockedAuthorIds ?? [],
    blockedHashtags: s.profile.blockedHashtags ?? [],
  })));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'following' | 'recommended'>('following');
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // ── Following 피드 ─────────────────────────────────────────────────────
  const followingQuery = useInfiniteQuery({
    queryKey: ['follow-feed', jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/community/following-feed?${params}`);
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
    enabled: tab === 'following' && !!jwtToken });

  // ── Recommended 피드 ───────────────────────────────────────────────────
  const recommendedQuery = useInfiniteQuery({
    queryKey: ['recommended-feed', jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/community/recommended?${params}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const posts = Array.isArray(data.posts)
        ? data.posts
            .map(normalizeCommunityFeedPost)
            .filter((post): post is CommunityFeedPost => post !== null)
        : [];
      return {
        posts,
        authors: (data.featured_authors ?? []) as FeedAuthor[],
        nextCursor: data.nextCursor as string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: p => p.nextCursor ?? undefined,
    select: d => ({
      posts: d.pages.flatMap(p => p.posts),
      authors: d.pages[0]?.authors ?? [] }),
    staleTime: 120_000,
    enabled: tab === 'recommended' && !!jwtToken });

  const activeQuery = tab === 'following' ? followingQuery : recommendedQuery;
  const rawPosts: CommunityFeedPost[] = tab === 'following'
    ? (followingQuery.data ?? [])
    : (recommendedQuery.data as any)?.posts ?? [];
  const posts = filterCommunityFeedPosts(rawPosts, {
    blockedAuthorIds,
    blockedTags: blockedHashtags,
  });
  const featuredAuthors: FeedAuthor[] = (recommendedQuery.data as any)?.authors ?? [];

  const handlePost = useCallback((post: CommunityFeedPost) => {
    if (post.boardType === 'webnovel') navigation.navigate('CommunityPostDetail', { postId: post.id });
    else navigation.navigate('CommunityPostDetail', { postId: post.id });
  }, [navigation]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<CommunityFeedPost>) => (
    <PostCard post={item} index={index} onPress={() => handlePost(item)} lang={lang} t={t} />
  ), [handlePost, lang, t]);

  const TABS = [
    { key: 'following' as const, label: t?.tabFollowing ?? '', icon: Users },
    { key: 'recommended' as const, label: t?.tabRecommended ?? '', icon: Sparkles },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />

      {/* 헤더 */}
      <View style={s.header}>
        {searchVisible ? (
          <View style={s.searchRow}>
            <Search size={15} color={'#797990'} />
            <TextInput
              ref={searchRef}
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t?.feedSearchPlaceholder ?? ''}
              placeholderTextColor={'#757585'}
              autoFocus
            />
            <PressableOpacity onPress={() => { setSearchVisible(false); setSearch(''); }}>
              <X size={15} color={'#797990'} />
            </PressableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.headerTitle}>{t?.feedTitle ?? ''}</Text>
            <PressableOpacity style={s.iconBtn} onPress={() => setSearchVisible(true)}>
              <Search size={18} color={'#8A8A9E'} />
            </PressableOpacity>
          </>
        )}
      </View>

      {/* 탭 */}
      <View style={s.tabs}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <PressableOpacity key={key} style={s.tabItem} onPress={() => setTab(key)}>
              <Icon size={14} color={active ? '#D4A853' : '#797990'} />
              <Text style={[s.tabTxt, active && s.tabActive]}>{label}</Text>
              {active && <View style={s.tabUnder} />}
            </PressableOpacity>
          );
        })}
      </View>

      {/* 본문 */}
      {activeQuery.isLoading ? (
        <SkeletonPostList count={5} />
      ) : posts.length === 0 ? (
        <EmptyState
          type="empty"
          title={tab === 'following' ? (t?.noFollowingPosts ?? '') : (t?.noRecommendedPosts ?? '')}
          subtitle={tab === 'following' ? (t?.followAuthorsHint ?? '') : ''}
        />
      ) : (
        <FlashList
          data={posts ?? []}
          keyExtractor={(item: CommunityFeedPost) => item.id}
          renderItem={renderItem}
          estimatedItemSize={130}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
              activeQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={() => activeQuery.refetch()}
              tintColor={'#D4A853'}
            />
          }
          ListHeaderComponent={
            tab === 'recommended' && featuredAuthors.length > 0 ? (
              <Animated.View entering={FadeIn.duration(400)} style={s.authorSection}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>{t?.featuredAuthors ?? ''}</Text>
                  <PressableOpacity onPress={() => navigation.navigate('AuthorProfile', { authorId: '' })}>
                    <ChevronRight size={14} color={'#797990'} />
                  </PressableOpacity>
                </View>
                <FlashList
                  data={featuredAuthors ?? []}
                  keyExtractor={(a: FeedAuthor) => a.id}
                  renderItem={({ item }) => (
                    <AuthorChip
                      author={item}
                      t={t}
                      onPress={() => navigation.navigate('AuthorProfile', { authorId: item.id, authorName: item.name })}
                    />
                  )}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  estimatedItemSize={80}
                  contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
                />
              </Animated.View>
            ) : null
          }
          ListFooterComponent={activeQuery.isFetchingNextPage ? (
            <View style={s.loadMore}>
              <ActivityIndicator size="small" color={'#D4A853'} />
            </View>
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 54 },
  headerTitle: { fontSize: 24, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.6 },
  iconBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)' },
  searchRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1, borderColor: '#181820' },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular },

  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#181820' },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12, position: 'relative' },
  tabTxt: { fontSize: 14, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabActive: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabUnder: { position: 'absolute', bottom: 0, height: 2.5, width: 40, backgroundColor: '#D4A853', borderRadius: 2, alignSelf: 'center' },

  listContent: { paddingHorizontal: 14, paddingVertical: 8, paddingBottom: 100 },
  card: {
    backgroundColor: '#0E0E14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 16, gap: 8, marginBottom: 8,
    position: 'relative', overflow: 'hidden', elevation: 2 },
  novelBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#8B5CF6', borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { backgroundColor: '#1A1A24', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#181820' },
  tagNovel: { backgroundColor: 'rgba(212,168,83,0.08)', borderColor: 'rgba(212,168,83,0.28)' },
  tagTxt: { fontSize: 10, color: '#6A6A80', fontFamily: Typography.fontFamily.medium },
  title: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', letterSpacing: -0.2 },
  preview: { fontSize: 13, color: '#8A8A9E', lineHeight: 20, fontFamily: Typography.fontFamily.regular },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A2A3A' },
  avatarTxt: { fontSize: 9, fontFamily: Typography.fontFamily.bold, color: '#8A8A9E' },
  author: { fontSize: 11, color: '#5A5A70', fontFamily: Typography.fontFamily.medium },
  dot: { fontSize: 10, color: '#3A3A4E' },
  time: { fontSize: 11, color: '#5A5A6E', fontFamily: Typography.fontFamily.regular },
  metaRight: { flexDirection: 'row', gap: 8 },
  metaBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaCount: { fontSize: 11, color: '#6A6A84', fontFamily: Typography.fontFamily.regular },

  authorSection: { paddingVertical: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  authorChip: { alignItems: 'center', gap: 4, width: 72 },
  authorAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(212,168,83,0.3)' },
  authorAvatarTxt: { fontSize: 20, fontFamily: Typography.fontFamily.bold, color: '#D4A853' },
  authorName: { fontSize: 11, fontFamily: Typography.fontFamily.semibold, color: '#C8C8D4', textAlign: 'center', maxWidth: 70 },
  authorSub: { fontSize: 10, color: '#797990', fontFamily: Typography.fontFamily.regular },

  loadMore: { paddingVertical: 16, alignItems: 'center' } });
