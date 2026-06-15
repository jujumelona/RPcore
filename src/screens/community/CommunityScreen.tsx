
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/CommunityScreen.tsx - PREMIUM REDESIGN v2
// [sanitized comment]
import React, { useState, useCallback } from 'react';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { PressableOpacity } from '../../components/PressableOpacity';
import { useUiOverlayStore } from '../../store/uiOverlayStore';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Typography } from '../../constants/tokens';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonPostList } from '../../components/Skeleton';
import { useFocusEffect } from '@react-navigation/native';
import { useLanguageStore } from '../../store/languageStore';
import { LANGUAGE_LIST } from '../../i18n/languages';
import { Heart, MessageCircle, Eye, PenLine, Search, X, BookOpen, Check } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';
import { CURRENT_CONSENT_VERSION, useAuthStore } from '../../store/authStore';
import { authedFetch } from '../../utils/authedFetch';
import { hasConsented, isAdmin, isOwner, resolveDisplayName } from '../../core/user';
import {
  filterCommunityFeedPosts,
  normalizeCommunityFeedPost,
  type CommunityFeedPost,
} from '../../community/communityModels';
import { useUserProfileStore } from '../../store/userProfileStore';
import { formatCount } from '../../utils/formatCount';


function formatTime(timestamp: string, t: Record<string, string | undefined>): string {
  const d = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (d < 60) return String(t?.timeJustNowShort ?? '');
  if (d < 3600) return String(t?.timeMinAgoShort ?? '').replace('{n}', String(Math.floor(d / 60)));
  if (d < 86400) return String(t?.timeHourAgoShort ?? '').replace('{n}', String(Math.floor(d / 3600)));
  return String(t?.timeDayAgoShort ?? '').replace('{n}', String(Math.floor(d / 86400)));
}

const PostCard = React.memo(function PostCard({
  post,
  t,
  onPress,
  index,
  lang = 'ko',
  viewer
  }: {
  post: CommunityFeedPost;
  t: Record<string, string | undefined>;
  onPress: () => void;
  index: number;
  lang?: string;
  viewer: ReturnType<typeof useAuthStore.getState>['user'];
}) {
  const authorName = isOwner(viewer, post.authorId)
    ? resolveDisplayName(viewer, post.author)
    : post.author;

  const isNovel = post.boardType === 'webnovel';

  return (
    <Animated.View entering={FadeInDown.delay(index * 45).springify().damping(22)}>
      <PressableOpacity
        style={[s.postCard, isNovel && s.postCardNovel]}
        activeOpacity={0.88}
        onPress={onPress}
      >
        {/* 웹소설 좌측 강조 바 */}
        {isNovel && <View style={s.novelBar} />}

        {/* 태그 + 게시판 뱃지 */}
        {(post.tags.length > 0 || isNovel) && (
          <View style={s.tagRow}>
            {post.tags.slice(0, 3).map((tag) => (
              <View key={tag.id} style={s.tag}>
                <Text style={s.tagText}>#{tag.label}</Text>
              </View>
            ))}
            {isNovel && (
              <View style={[s.tag, s.tagNovel]}>
                <BookOpen size={9} color={'#D4A853'} />
                <Text style={[s.tagText, { color: '#D4A853' }]}>{t?.tabNovelShare || '웹소설'}</Text>
              </View>
            )}
          </View>
        )}

        {/* 제목 */}
        <Text style={s.postTitle} numberOfLines={2}>{post.title}</Text>

        {/* 내용 미리보기 */}
        {!!post.content && (
          <Text style={s.postContent} numberOfLines={2}>{post.content}</Text>
        )}

        {/* 메타 행 */}
        <View style={s.postMeta}>
          <View style={s.metaLeft}>
            {/* 아바타 이니셜 */}
            <View style={s.authorAvatar}>
              <Text style={s.authorAvatarText}>
                {authorName?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={s.postAuthor}>{authorName}</Text>
            <Text style={s.dot}>·</Text>
            <Text style={s.postTime}>{formatTime(post.createdAt, t)}</Text>
          </View>
          <View style={s.metaRight}>
            <View style={s.metaItem}>
              <Heart size={11} color={'#FF6B8B'} />
              <Text style={s.metaCount}>{formatCount(post.likeCount, lang)}</Text>
            </View>
            <View style={s.metaItem}>
              <MessageCircle size={11} color={'#60A5FA'} />
              <Text style={s.metaCount}>{formatCount(post.commentCount, lang)}</Text>
            </View>
            <View style={s.metaItem}>
              <Eye size={11} color={'#797990'} />
              <Text style={s.metaCount}>{formatCount(post.viewCount, lang)}</Text>
            </View>
          </View>
        </View>
      </PressableOpacity>
    </Animated.View>
  );
});

export function CommunityScreen({ navigation }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const { t, isRTL, lang } = useLanguageStore(useShallow(s => ({ t: s.t, isRTL: s.isRTL, lang: s.appLanguage })));  // ??[FIX] s.lang ??s.appLanguage
  const authUser = useAuthStore(s => s.user);
  const jwtToken = authUser?.jwtToken ?? '';
  const { blockedAuthorIds, blockedHashtags } = useUserProfileStore(useShallow(s => ({
    blockedAuthorIds: s.profile.blockedAuthorIds ?? [],
    blockedHashtags: s.profile.blockedHashtags ?? [],
  })));
  const insets = useSafeAreaInsets();
  const [activeBoard, setActiveBoard] = useState<'all' | 'free' | 'webnovel'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterLang, setSelectedFilterLang] = useState<string>(lang);

  // [BUG-5 FIX] 앱 언어 변경 시 selectedFilterLang 동기화
  React.useEffect(() => {
    setSelectedFilterLang(lang);
  }, [lang]);

  // ── 상호배제 패널 관리 (중앙 스토어) ────────────────────────────
  const { togglePanel, closePanel, closeAll, isOpen } = useUiOverlayStore();
  const showLangMenu   = isOpen('community_lang');
  const searchVisible  = isOpen('community_search');

  useFocusEffect(
    useCallback(() => () => {
      closeAll();
    }, [closeAll]),
  );

  const openSearch = useCallback(() => {
    closeAll();           // lang메뉴 포함 모두 닫고
    togglePanel('community_search');
  }, [closeAll, togglePanel]);

  const closeSearch = useCallback(() => {
    closePanel('community_search');
    setSearchQuery('');
  }, [closePanel]);

  const toggleLangMenu = useCallback(() => {
    if (isOpen('community_search')) return; // 검색 중엔 lang메뉴 무시
    togglePanel('community_lang');
  }, [isOpen, togglePanel]);

  const showAllLangs = selectedFilterLang === 'all';
  const filterLang = showAllLangs ? lang : selectedFilterLang;

  const BOARDS = [
    { type: 'all' as const, label: String(t?.tabAll ?? t?.all ?? '') },
    { type: 'free' as const, label: String(t?.tabFree ?? '') },
    { type: 'webnovel' as const, label: String(t?.tabNovelShare ?? '') },
  ];

  const { data: infiniteData, isLoading: loading, isFetchingNextPage, isRefetching, fetchNextPage, hasNextPage, refetch: fetchPosts } = useInfiniteQuery({
    queryKey: ['community-posts', activeBoard, filterLang, showAllLangs, searchQuery, !!jwtToken],
    queryFn: async ({ pageParam }) => {
      const query: Record<string, string> = {
        lang: filterLang,
        show_all_langs: String(showAllLangs),
        search: searchQuery,
        limit: '20'
  };
      if (activeBoard !== 'all') query.board_type = activeBoard;
      if (pageParam) query.cursor = String(pageParam);
      const params = Object.entries(query)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      // [BUG FIX] raw fetch → authedFetch 사용: JWT 만료 자동 처리 + 자동 로그아웃 포함
      const response = await authedFetch(`/community/posts?${params}`);
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      const posts = Array.isArray(data.posts)
        ? data.posts
          .map(normalizeCommunityFeedPost)
          .filter((post): post is CommunityFeedPost => post !== null)
        : [];
      const nextCursor: string | null = data.nextCursor ?? null;
      // [BUG FIX] hasMore 계산 수정 — StoryAPI.getStoriesPaged와 동일 패턴
      // 서버가 nextCursor를 명시적으로 주면 그것을 신뢰, 없으면 limit 기준 휴리스틱
      const hasMore = nextCursor !== null ? Boolean(nextCursor) : posts.length >= 20;
      return { posts, nextCursor, hasMore };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap(p => p.posts),
    staleTime: 60 * 1000, gcTime: 10 * 60_000, retry: 1, placeholderData: (prev) => prev
  });

  const posts = filterCommunityFeedPosts(infiniteData ?? [], {
    blockedAuthorIds,
    blockedTags: blockedHashtags,
  });
  const listPosts = posts;

  const handlePostPress = useCallback((post: CommunityFeedPost) => {
    if (post.boardType === 'webnovel') navigation.navigate('CommunityPostDetail', { postId: post.id });
    else navigation.navigate('CommunityPostDetail', { postId: post.id });
  }, [navigation]);

  const renderPostItem = useCallback(({ item, index }: ListRenderItemInfo<CommunityFeedPost>) => (
    <PostCard post={item} t={t} onPress={() => handlePostPress(item)} index={index} lang={lang} viewer={authUser} />
  ), [handlePostPress, t, lang, authUser]);

  const emptyTitle = activeBoard === 'webnovel'
    ? String(t?.noWebnovels ?? '')
    : searchQuery ? String(t?.noSearchResult2 ?? '')
    : String(t?.noPosts ?? '');
  const canWrite = activeBoard !== 'webnovel'
    && (isAdmin(authUser) || hasConsented(authUser, CURRENT_CONSENT_VERSION));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>

      {/* Header */}
      <View style={[s.header, isRTL && styles.rowReverse]}>
        {searchVisible ? (
          <View style={s.searchRow}>
            <Search size={16} color={'#797990'} />
            <TextInput
              style={s.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={String(t?.searchDots ?? t?.search ?? '')}
              placeholderTextColor={'#757585'}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => fetchPosts()}
            />
            <PressableOpacity onPress={closeSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={'#797990'} />
            </PressableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.headerTitle}>{String(t?.community ?? '')}</Text>
            <View style={s.headerRight}>
              <PressableOpacity style={[s.iconBtn, s.langFilterBtn]} onPress={toggleLangMenu}>
                <Text style={[s.langFilterTxt, showLangMenu && s.langFilterTxtActive]}>
                  {selectedFilterLang === 'all' ? String(t?.all ?? '') : selectedFilterLang.toUpperCase()}
                </Text>
              </PressableOpacity>
              <PressableOpacity style={s.iconBtn} onPress={openSearch}>
                <Search size={19} color={'#8A8A9E'} />
              </PressableOpacity>
            </View>
          </>
        )}
      </View>

            {/* 다국어 선택 */}
      {showLangMenu && (
        <Animated.View entering={FadeInDown.springify()} style={s.langMenu}>
          <ScrollView style={styles._maxHeight} showsVerticalScrollIndicator={false} bounces={false}>
            <PressableOpacity
              style={[s.langMenuItem, selectedFilterLang === 'all' && s.langMenuItemActive]}
              onPress={() => { setSelectedFilterLang('all'); closePanel('community_lang'); }}
            >
              <Text style={[s.langMenuText, selectedFilterLang === 'all' && s.langMenuTextActive]}>
                {String(t?.allLanguages ?? '')}
              </Text>
            </PressableOpacity>
            <View style={s.langMenuDivider} />
            {LANGUAGE_LIST.map((l) => (
              <PressableOpacity
                key={l.code}
                style={[s.langMenuItem, selectedFilterLang === l.code && s.langMenuItemActive]}
                onPress={() => { setSelectedFilterLang(l.code); closePanel('community_lang'); }}
              >
                <Text style={[s.langMenuText, selectedFilterLang === l.code && s.langMenuTextActive]}>
                  {l.nativeName}
                </Text>
                {l.code === lang && <Check size={14} color="#D4A853" />}
              </PressableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* [sanitized comment] */}
      <View style={s.tabs}>
        {BOARDS.map(board => {
          const isActive = activeBoard === board.type;
          return (
            <PressableOpacity key={board.type} style={s.tabItem} onPress={() => setActiveBoard(board.type)}>
              <Text style={[s.tabText, isActive && s.tabActive]}>{board.label}</Text>
              {isActive && <View style={s.tabUnder} />}
            </PressableOpacity>
          );
        })}
      </View>

            {/* 장르 필터 목록 */}
      {loading ? (
        <SkeletonPostList count={6} />
      ) : posts.length === 0 ? (
        <EmptyState type="empty" title={emptyTitle} subtitle="" />
      ) : (
        <FlashList
          data={listPosts ?? []}
          keyExtractor={(item: CommunityFeedPost) => String(item.id)}
          contentContainerStyle={s.listContent}
          renderItem={renderPostItem}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          onRefresh={() => fetchPosts()}
          refreshing={loading || isRefetching}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={130}
          // [sanitized comment]
          // [sanitized comment]
          // [sanitized comment]
          overrideItemLayout={(layout: { size?: number }, item: CommunityFeedPost) => {
            const hasTags = item.tags.length > 0;
            const isNovel = item.boardType === 'webnovel';
            layout.size = isNovel ? 160 : hasTags ? 140 : 120;
          }}
          // [sanitized comment]
          // [sanitized comment]
          getItemType={(item: CommunityFeedPost) => item.boardType}
          ListHeaderComponent={null}
          ListFooterComponent={isFetchingNextPage ? (
            <View style={styles._alignItems}>
            <Text style={styles.loadingTxt}>{String(t?.loadingMore ?? '')}</Text>
            </View>
          ) : null}
        />
      )}

      {/* [sanitized comment] */}
      {canWrite && (
        <PressableOpacity
          style={[s.fab, { bottom: insets.bottom + 68 }]}
          onPress={() => navigation.navigate('WritePost', {
            boardType: 'free',
            lang: showAllLangs ? lang : selectedFilterLang
  })}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#D4A853', '#B8860B']}
            start={[0, 0]} end={[1, 1]}
            style={s.fabGradient}
          >
            <PenLine size={22} color={'#050507'} />
          </LinearGradient>
        </PressableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 54
  },
  headerTitle: { fontSize: 24, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.6 },
  headerRight: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)' },
  langFilterBtn: { paddingHorizontal: 8, width: 'auto' as 'auto', minWidth: 40 },
  langFilterTxt: { fontSize: 11, fontFamily: Typography.fontFamily.bold, color: '#8A8A9E', letterSpacing: 0.5 },
  langFilterTxtActive: { color: '#D4A853' },
  searchRow:   { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0C0C14', borderRadius: Radius.md, paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1, borderColor: '#181820' },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular },

  langMenu:           { backgroundColor: '#111118', marginHorizontal: 16, marginBottom: 8, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: '#181820' },
  langMenuItem:       { paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  langMenuItemActive: { backgroundColor: 'rgba(212,168,83,0.07)' },
  langMenuText:       { fontSize: 14, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },
  langMenuTextActive: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  langMenuDivider:    { height: 0.5, backgroundColor: '#181820', marginHorizontal: 12 },

  tabs:     { flexDirection: 'row' },
  tabItem:  { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabText:  { fontSize: 14, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabActive:{ color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabUnder: {
    position: 'absolute', bottom: 0,
    height: 2.5, width: 32,
    backgroundColor: '#D4A853', borderRadius: 2,
    alignSelf: 'center',
    left: undefined, right: undefined,
    elevation: 3
  },

  listContent: { paddingHorizontal: 14, paddingVertical: 8, gap: 8, paddingBottom: 100 },
  postCard: {
    backgroundColor: '#0E0E14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 16, gap: 8,
    position: 'relative', overflow: 'hidden',
    elevation: 2
  },
  postCardNovel: {
    borderColor: 'rgba(212,168,83,0.25)',
    backgroundColor: '#0C0C12'
  },
  novelBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: '#8B5CF6',
    borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg
  },
  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag:       { backgroundColor: '#1A1A24', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#181820' },
  tagNovel:  { backgroundColor: 'rgba(212,168,83,0.08)', borderColor: 'rgba(212,168,83,0.28)', flexDirection: 'row', alignItems: 'center', gap: 3 },
  tagText:   { fontSize: 10, color: '#6A6A80', fontFamily: Typography.fontFamily.medium },
  postTitle: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', letterSpacing: -0.2 },
  postContent: { fontSize: 13, color: '#8A8A9E', lineHeight: 20, fontFamily: Typography.fontFamily.regular },
  postMeta:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  metaLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#1E1E2E',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2A2A3A'
  },
  authorAvatarText: { fontSize: 9, fontFamily: Typography.fontFamily.bold, color: '#8A8A9E' },
  postAuthor:{ fontSize: 11, color: '#5A5A70', fontFamily: Typography.fontFamily.medium },
  dot:       { fontSize: 10, color: '#3A3A4E' },
  postTime: { fontSize: 11, color: '#5A5A6E', fontFamily: Typography.fontFamily.regular },
  metaRight: { flexDirection: 'row', gap: 10 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaCount: { fontSize: 11, color: '#6A6A84', fontFamily: Typography.fontFamily.regular },

  fab: {
    position: 'absolute', right: 16,
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
    elevation: 20,
    zIndex: 999
  },
  fabGradient: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }
  });

const styles = StyleSheet.create({
  _maxHeight: {
    maxHeight: 260
  },
  _featuredHeader: {
    marginHorizontal: -14,
    marginBottom: 10,
    gap: 8
  },
  _alignItems: {
    paddingVertical: 16,
    alignItems: 'center'
  },
  rowReverse: { flexDirection: 'row-reverse' },
  loadingTxt: { color: '#757585', fontSize: 12, fontFamily: Typography.fontFamily.regular }
  });
