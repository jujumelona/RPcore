 
 
// src/screens/community/TagBrowserScreen.tsx
// 태그 탐색 + 즐겨찾기 + 태그별 게시글 피드

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, TextInput,
  ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Hash, Star, Search, X, ArrowLeft, TrendingUp, Flame } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import { createMMKVStorage } from '../../utils/mmkvZustandStorage';

import { useLanguageStore } from '../../store/languageStore';
import { useAuthStore } from '../../store/authStore';
import { authedFetch } from '../../utils/authedFetch';
import { PressableOpacity } from '../../components/PressableOpacity';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonPostList } from '../../components/Skeleton';
import { Radius, Typography } from '../../constants/tokens';
import { formatCount } from '../../utils/formatCount';
import { fuzzySearch } from '../../utils/fuzzySearch';
import {
  filterCommunityFeedPosts,
  normalizeCommunityFeedPost,
  type CommunityFeedPost,
} from '../../community/communityModels';
import { useUserProfileStore } from '../../store/userProfileStore';

const kvStorage = createMMKVStorage({ id: 'tag-browser' });
const FAV_KEY = 'favorite_tags';

function getFavoriteTags(): string[] {
  try { return JSON.parse((kvStorage.getItem(FAV_KEY) as string | null) ?? '[]'); } catch { return []; }
}
function saveFavoriteTags(tags: string[]) {
  kvStorage.setItem(FAV_KEY, JSON.stringify(tags));
}

interface TagInfo {
  name: string;
  post_count: number;
  trending?: boolean;
}

function fmtTime(ts: string, t: Record<string, string | undefined>, locale: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return t.timeJustNow ?? '';
  if (d < 3600) return (t.timeMinAgo ?? '').replace('{n}', String(Math.floor(d / 60)));
  if (d < 86400) return (t.timeHourAgo ?? '').replace('{n}', String(Math.floor(d / 3600)));
  if (d < 604800) return (t.timeDayAgo ?? '').replace('{n}', String(Math.floor(d / 86400)));
  return new Date(ts).toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

export function TagBrowserScreen({ navigation }: any) {
  const { lang, t } = useLanguageStore(useShallow(s => ({ lang: s.appLanguage, t: s.t })));
  const jwtToken = useAuthStore(s => s.user?.jwtToken ?? '');
  const { blockedAuthorIds, blockedHashtags } = useUserProfileStore(useShallow(s => ({
    blockedAuthorIds: s.profile.blockedAuthorIds ?? [],
    blockedHashtags: s.profile.blockedHashtags ?? [],
  })));
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(getFavoriteTags);

  // ── 태그 목록 조회 ──────────────────────────────────────────────────────
  const tagsQuery = useQuery({
    queryKey: ['tags', 'all', jwtToken],
    queryFn: async () => {
      const resp = await authedFetch('/community/tags');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return (data.tags ?? []) as TagInfo[];
    },
    staleTime: 5 * 60_000 });

  // ── 선택 태그의 게시글 ─────────────────────────────────────────────────
  const tagPostsQuery = useInfiniteQuery({
    queryKey: ['tag-posts', selectedTag, jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tag: selectedTag!, limit: '20' });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/community/posts?${params}`);
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
    enabled: !!selectedTag });
  
 

  // eslint-disable-next-line
  const tags = tagsQuery.data ?? [];
  const filtered = useMemo(() => {
    return fuzzySearch(
      tags,
      search,
      [{ name: 'name', weight: 1, getValue: tag => tag.name }],
      { threshold: 0.28 },
    );
  }, [tags, search]);

  const favTags = filtered.filter(t => favorites.includes(t.name));
  const trendingTags = filtered.filter(t => t.trending && !favorites.includes(t.name));
  const allTags = filtered.filter(t => !t.trending && !favorites.includes(t.name));

  const toggleFav = useCallback((name: string) => {
    setFavorites(prev => {
      const next = prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name];
      saveFavoriteTags(next);
      return next;
    });
  }, []);

  const tagPosts = filterCommunityFeedPosts(tagPostsQuery.data ?? [], {
    blockedAuthorIds,
    blockedTags: blockedHashtags,
  });

  const renderTagPost = useCallback(({ item, index }: ListRenderItemInfo<CommunityFeedPost>) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <PressableOpacity
        style={s.postCard}
        onPress={() => {
          if (item.boardType === 'webnovel') navigation.navigate('CommunityPostDetail', { postId: item.id });
          else navigation.navigate('CommunityPostDetail', { postId: item.id });
        }}
      >
        {item.boardType === 'webnovel' && <View style={s.novelBar} />}
        <Text style={s.postTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.content && <Text style={s.postPreview} numberOfLines={1}>{item.content}</Text>}
        <View style={s.postMeta}>
          <Text style={s.postAuthor}>@{item.author}</Text>
          <Text style={s.postDot}>·</Text>
          <Text style={s.postTime}>{fmtTime(item.createdAt, t as Record<string, string | undefined>, lang)}</Text>
        </View>
      </PressableOpacity>
    </Animated.View>
  ), [navigation]);

  // ── 태그 뷰 ──────────────────────────────────────────────────────────────
  if (selectedTag) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={'#050507'} />
        <View style={s.header}>
          <PressableOpacity style={s.backBtn} onPress={() => setSelectedTag(null)}>
            <ArrowLeft size={20} color={'#F0F0F5'} />
          </PressableOpacity>
          <View style={s.tagHeader}>
            <Hash size={16} color={'#D4A853'} />
            <Text style={s.headerTitle}>{selectedTag}</Text>
          </View>
          <PressableOpacity onPress={() => toggleFav(selectedTag)} hitSlop={8}>
            <Star size={18} color={favorites.includes(selectedTag) ? '#D4A853' : '#797990'} fill={favorites.includes(selectedTag) ? '#D4A853' : 'none'} />
          </PressableOpacity>
        </View>

        {tagPostsQuery.isLoading ? (
          <SkeletonPostList count={5} />
        ) : tagPosts.length === 0 ? (
          <EmptyState
            type="empty"
            title={(t?.noTagPosts ?? '').replace('{tag}', selectedTag)}
            subtitle=""
          />
        ) : (
          <FlashList
            data={tagPosts}
            keyExtractor={(i: CommunityFeedPost) => i.id}
            renderItem={renderTagPost}
            estimatedItemSize={120}
            contentContainerStyle={s.listPad}
            showsVerticalScrollIndicator={false}
            onEndReached={() => { if (tagPostsQuery.hasNextPage && !tagPostsQuery.isFetchingNextPage) tagPostsQuery.fetchNextPage(); }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={tagPostsQuery.isFetchingNextPage ? (
              <View style={s.loader}><ActivityIndicator color={'#D4A853'} /></View>
            ) : null}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── 태그 목록 뷰 ──────────────────────────────────────────────────────────
  // eslint-disable-next-line
  const TagChip = ({ tag }: { tag: TagInfo }) => (
    <PressableOpacity style={s.chip} onPress={() => setSelectedTag(tag.name)}>
      <Hash size={11} color={'#8B5CF6'} />
      <Text style={s.chipTxt}>{tag.name}</Text>
      <Text style={s.chipCount}>{formatCount(tag.post_count, lang)}</Text>
      {tag.trending && <Flame size={11} color={'#FF6B4A'} />}
      <PressableOpacity onPress={() => toggleFav(tag.name)} hitSlop={6}>
        <Star size={11} color={favorites.includes(tag.name) ? '#D4A853' : '#3A3A4E'} fill={favorites.includes(tag.name) ? '#D4A853' : 'none'} />
      </PressableOpacity>
    </PressableOpacity>
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />
      <View style={s.header}>
        <Text style={s.headerTitle}>{t?.tagBrowserTitle ?? ''}</Text>
      </View>

      {/* 검색 */}
      <View style={s.searchWrap}>
        <Search size={15} color={'#797990'} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t?.tagSearchPlaceholder ?? ''}
          placeholderTextColor={'#757585'}
        />
        {!!search && (
          <PressableOpacity onPress={() => setSearch('')}>
            <X size={14} color={'#797990'} />
          </PressableOpacity>
        )}
      </View>

      {tagsQuery.isLoading ? (
        <View style={s.loader}><ActivityIndicator color={'#D4A853'} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollPad}>
          {/* 즐겨찾기 */}
          {favTags.length > 0 && (
            <Animated.View entering={FadeIn.duration(300)}>
              <View style={s.section}>
                <Star size={14} color={'#D4A853'} />
                <Text style={s.sectionTitle}>{t?.favoriteTags ?? ''}</Text>
              </View>
              <View style={s.chipRow}>
                {favTags.map(t => <TagChip key={t.name} tag={t} />)}
              </View>
            </Animated.View>
          )}

          {/* 트렌딩 */}
          {trendingTags.length > 0 && (
            <Animated.View entering={FadeIn.delay(60).duration(300)}>
              <View style={s.section}>
                <TrendingUp size={14} color={'#FF6B4A'} />
                <Text style={s.sectionTitle}>{t?.trendingTags ?? ''}</Text>
              </View>
              <View style={s.chipRow}>
                {trendingTags.map(t => <TagChip key={t.name} tag={t} />)}
              </View>
            </Animated.View>
          )}

          {/* 전체 */}
          {allTags.length > 0 && (
            <Animated.View entering={FadeIn.delay(120).duration(300)}>
              <View style={s.section}>
                <Hash size={14} color={'#8B5CF6'} />
                <Text style={s.sectionTitle}>{t?.allTags ?? ''}</Text>
              </View>
              <View style={s.chipRow}>
                {allTags.map(t => <TagChip key={t.name} tag={t} />)}
              </View>
            </Animated.View>
          )}

          {filtered.length === 0 && (
            <EmptyState
              type="empty"
              title={(t?.noTagResult ?? '').replace('{q}', search)}
              subtitle={t?.emptySearchSub ?? ''}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, gap: 10 },
  headerTitle: { fontSize: 22, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.5, flex: 1 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#0C0C14' },
  tagHeader: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12, height: 44,
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, borderWidth: 1, borderColor: '#181820' },
  searchInput: { flex: 1, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular },

  scrollPad: { paddingHorizontal: 14, paddingBottom: 100 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#C8C8D4' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0E0E18', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  chipTxt: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#C8C8D4' },
  chipCount: { fontSize: 10, color: '#797990', fontFamily: Typography.fontFamily.regular },

  listPad: { paddingHorizontal: 14, paddingVertical: 8, paddingBottom: 100 },
  postCard: {
    backgroundColor: '#0E0E14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, marginBottom: 8, gap: 6, position: 'relative', overflow: 'hidden' },
  novelBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#8B5CF6', borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg },
  postTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  postPreview: { fontSize: 13, color: '#8A8A9E', fontFamily: Typography.fontFamily.regular },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postAuthor: { fontSize: 11, color: '#5A5A70', fontFamily: Typography.fontFamily.medium },
  postDot: { fontSize: 10, color: '#3A3A4E' },
  postTime: { fontSize: 11, color: '#5A5A6E', fontFamily: Typography.fontFamily.regular },
  loader: { paddingVertical: 24, alignItems: 'center' } });
