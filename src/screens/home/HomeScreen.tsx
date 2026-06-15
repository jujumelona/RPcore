import { Typography } from '../../constants/tokens';
import { useState, useCallback, useRef, useEffect, useMemo, useDeferredValue, startTransition } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  Modal,
  RefreshControl } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { prefetchImageUris } from '../../components/CachedImage';
import { Story } from '../../types/navigation';

const SCR_W = Dimensions.get('window').width;
const CARD_PADDING       = 16;
const CARD_GAP           = 12;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };
const APP_NAV_TONE = '#050507';
import { filterEligibleStories,
  rankRecommendedStories,
  type RankableStory,
  type RecommendProfile } from '../../utils/recommendationRanker';
import { EmptyState } from '../../components/EmptyState';
import { useNotificationBadgeStore } from '../../store/notificationBadgeStore';
import { ReportModal } from '../../components/ReportModal';
import { StoryPreviewSheet } from '../../components/StoryPreviewSheet';
import { useLanguageStore } from '../../store/languageStore';
import { useUserProfileStore } from '../../store/userProfileStore';
import { appStorage } from '../../utils/storage';
import { StoryAPI } from '../../api/StoryAPI';
import { Bell, Search, Grid2X2, List, SlidersHorizontal } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { navigationRef } from '../../navigation/navigationRef';
import { StoryCard, StoryCardWide } from '../../components/StoryCard';
import { SortDropdown } from './components';
import { isReadyForHomeExposure,
  normalizeStory } from './utils/storyHelpers';


export function HomeScreen({
  navigation }: {
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
}) {
  const insets = useSafeAreaInsets();
  const { t, appLanguage } = useLanguageStore(
    useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })),
  );
  const { profile: userProfile, blockStory } = useUserProfileStore(
    useShallow(s => ({
      profile: s.profile,
      blockStory: s.blockStory })),
  );
  const { unreadCount, refresh: refreshNotifBadge } = useNotificationBadgeStore();
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [sortId, setSortId] = useState('recommended');
  const [previewStory, setPreviewStory] = useState<RankableStory | null>(null);
  const [menuStory, setMenuStory] = useState<RankableStory | null>(null);
  const [reportStoryTarget, setReportStoryTarget] = useState<RankableStory | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortVisible, setSortVisible] = useState(false);
  const sortAnchorY = useRef(52);

  const STORY_SORT_OPTIONS = useMemo(() => [
    { id: 'recommended', label: String(t?.sortRecommended ?? '') },
    { id: 'popular',     label: String(t?.sortPopular ?? '') },
    { id: 'latest',      label: String(t?.sortLatest ?? '') },
    { id: 'liked',       label: String(t?.sortLiked ?? '') },
    { id: 'following',   label: String(t?.sortFollowing ?? '') },
  ], [t]);
  const selectedSortLabel = useMemo(
    () => STORY_SORT_OPTIONS.find(option => option.id === sortId)?.label ?? '',
    [STORY_SORT_OPTIONS, sortId],
  );
  const notificationBadgeLabel = useMemo(
    () => (unreadCount > 9 ? '9+' : String(unreadCount)),
    [unreadCount],
  );

  const staticGenres = useMemo(
    () => [
      { id: 'all',       label: String(t?.genreAll ?? t?.all ?? '') },
      { id: 'romance',   label: String(t?.genreRomance ?? '') },
      { id: 'fantasy',   label: String(t?.genreFantasy ?? '') },
      { id: 'modern',    label: String(t?.genreModern ?? '') },
      { id: 'martial_arts', label: String(t?.genreMartial ?? '') },
      { id: 'mystery',   label: String(t?.genreMystery ?? '') },
      { id: 'thriller',  label: String(t?.genreThriller ?? '') },
      { id: 'action',    label: String(t?.genreAction ?? '') },
      { id: 'adventure', label: String(t?.genreAdventure ?? '') },
      { id: 'drama',     label: String(t?.genreDrama ?? '') },
      { id: 'history',   label: String(t?.genreHistory ?? '') },
      { id: 'daily',     label: String(t?.genreDaily ?? '') },
      { id: 'etc',       label: String(t?.genreEtc ?? '') },
    ],
    [t],
  );

  const genres = useMemo(() => {
    const counts = userProfile.playedGenreCounts || {};
    const all = staticGenres[0];
    const others = [...staticGenres.slice(1)].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return [all, ...others];
  }, [staticGenres, userProfile.playedGenreCounts]);


  const genreScrollRef = useRef<ScrollView>(null);
  const genreLayouts = useRef<Record<string, { x: number; width: number }>>({});

  const handleGenreSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedGenre(id);
    });
    const layout = genreLayouts.current[id];
    if (layout && genreScrollRef.current) {
      const scrollX = layout.x - SCR_W / 2 + layout.width / 2;
      genreScrollRef.current.scrollTo({ x: Math.max(0, scrollX), animated: true });
    }
  }, []);

  useEffect(() => {
    refreshNotifBadge();
    const unsub = navigation.addListener?.('focus', () => {
      refreshNotifBadge();
    });
    return () => {
      unsub?.();
    };
  }, [navigation, refreshNotifBadge]);

  const homeStoriesQuery = useInfiniteQuery({
    queryKey: [
      'home-stories',
      selectedGenre,
      sortId,
      userProfile?.followedAuthorIds?.length,
      appLanguage,
    ],
    enabled: !!appLanguage, // 언어 설정 완료 후에만 쿼리 실행
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const result = await StoryAPI.getStoriesPaged({
        genre: selectedGenre !== 'all' ? selectedGenre : undefined,
        sort: sortId,
        cursor: pageParam,
        limit: 20,
        lang: appLanguage,
        followedAuthorIds: sortId === 'following' ? (userProfile?.followedAuthorIds ?? []) : undefined });

      if (!pageParam && result.stories.length > 0) {
        try {
          appStorage.set(`@stories_cache_${appLanguage}`, JSON.stringify(result.stories));
        } catch {}
      }

      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: { hasMore?: boolean; nextCursor?: string | null }) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    select: (data: any) => ({
      stories: data.pages.flatMap((p: any) =>
        ((p.stories ?? []) as Record<string, unknown>[])
          .filter(story => isReadyForHomeExposure(story))
          .map(story => normalizeStory(story, appLanguage))
          .filter((s): s is RankableStory => s !== null),
      ) }),
    initialData: () => {
      if (!appLanguage) return undefined; // 언어 미감지 시 캐시 사용 안 함
      try {
        const cached = appStorage.getString(`@stories_cache_${appLanguage}`);
        if (!cached) return undefined;

        const parsed = (JSON.parse(cached) as Record<string, unknown>[])
          .filter(story => isReadyForHomeExposure(story));
        if (parsed.length === 0) return undefined;

        return {
          pages: [{ stories: parsed, nextCursor: null, hasMore: parsed.length >= 20 }],
          pageParams: [undefined] };
      } catch {
        return undefined;
      }
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60_000,
    placeholderData: (prev: any) => prev }) as unknown as any;

  const handleRefresh = useCallback(async () => {
    homeStoriesQuery.refetch().catch(() => {});
    refreshNotifBadge();
  }, [homeStoriesQuery, refreshNotifBadge]);

  const {
    data: infiniteData,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage } = homeStoriesQuery as unknown as {
    data?: { stories: RankableStory[] };
    isLoading: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
    hasNextPage?: boolean;
  };

  const recoProfile = useMemo<RecommendProfile>(
    () => ({
      likedStoryIds: userProfile?.likedStoryIds ?? [],
      followedAuthorIds: userProfile?.followedAuthorIds ?? [],
      blockedStoryIds: userProfile?.blockedStoryIds ?? [],
      blockedAuthorIds: userProfile?.blockedAuthorIds ?? [],
      blockedHashtags: userProfile?.blockedHashtags ?? [],
      reportedStoryIds: userProfile?.reportedStoryIds ?? [],
      playedGenreCounts: userProfile?.playedGenreCounts ?? {},
      preferredGenres: userProfile?.preferredGenres ?? [] }),
    [userProfile],
  );
  const deferredStories = useDeferredValue(infiniteData?.stories ?? []);
  const deferredRecoProfile = useDeferredValue(recoProfile);

  const eligibleStories = useMemo(() => {
    return filterEligibleStories(deferredStories, deferredRecoProfile);
  }, [deferredRecoProfile, deferredStories]);

  const rankedStories = useMemo(() => {
    if (sortId !== 'recommended') return eligibleStories;
    return rankRecommendedStories(eligibleStories, deferredRecoProfile, { skipFilter: true });
  }, [deferredRecoProfile, eligibleStories, sortId]);

  const toggleViewMode = useCallback(() => {
    startTransition(() => {
      setViewMode(v => v === 'grid' ? 'list' : 'grid');
    });
  }, []);

  const handleSortSelect = useCallback((id: string) => {
    setSortVisible(false);
    startTransition(() => {
      setSortId(id);
    });
  }, []);

  const featuredStory = viewMode === 'list' ? (rankedStories[0] ?? null) : null;
  const listStories = featuredStory ? rankedStories.filter(s => s.id !== featuredStory.id) : rankedStories;
  const listContentStyle = useMemo(
    () => ({
      ...st.listContent,
      paddingBottom: insets.bottom + 100,
      ...(viewMode === 'grid' ? { paddingHorizontal: CARD_PADDING } : {}),
    }),
    [insets.bottom, viewMode],
  );


  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: { coverUrl?: string } }> }) => {
      const uris = viewableItems
        .slice(0, 8)
        .map(v => v.item?.coverUrl)
        .filter(Boolean);
      if (uris.length > 0) prefetchImageUris(uris as string[], 'disk');
    },
    [],
  );

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<RankableStory>) => {
    if (viewMode === 'grid') {
      const GRID_W = (SCR_W - (CARD_PADDING * 2) - CARD_GAP) / 2;
      return (
        <View style={[st.gridItem, { width: GRID_W }]}>
          <StoryCard
            story={item}
            onPress={() => navigationRef.navigate('StoryDetail', { story: item })}
            onLongPress={() => setMenuStory(item)}
            t={t}
            index={index}
            appLanguage={appLanguage}
          />
        </View>
      );
    }
    return (
      <StoryCardWide
        story={item}
        onPress={() => navigationRef.navigate('StoryDetail', { story: item })}
        onLongPress={() => setMenuStory(item)}
        t={t}
        index={index}
        appLanguage={appLanguage}
      />
    );
  }, [viewMode, t, appLanguage]);


  const listHeaderComponent = useMemo(() => {
    if (!featuredStory) return null;
    return (
      <View style={st.featuredWrap}>
        {viewMode === 'grid' ? (
          <StoryCard
            story={featuredStory}
            onPress={() => navigationRef.navigate('StoryDetail', { story: featuredStory })}
            onLongPress={() => setMenuStory(featuredStory)}
            t={t}
            index={-1}
            appLanguage={appLanguage}
          />
        ) : (
          <StoryCardWide
            story={featuredStory}
            onPress={() => navigationRef.navigate('StoryDetail', { story: featuredStory })}
            onLongPress={() => setMenuStory(featuredStory)}
            t={t}
            index={-1}
            appLanguage={appLanguage}
          />
        )}
      </View>
    );
  }, [featuredStory, viewMode, t, appLanguage]);

  const handleReportFromMenu = useCallback(() => {
    if (!menuStory) return;
    setReportStoryTarget(menuStory);
    setMenuStory(null);
  }, [menuStory]);

  const handleBlockFromMenu = useCallback(() => {
    if (!menuStory?.id) return;
    blockStory(
      String(menuStory.id),
      String(menuStory.title ?? ''),
      String(menuStory.coverUrl ?? ''),
    ).catch(() => {});
    setMenuStory(null);
  }, [blockStory, menuStory]);

  const listEmptyComponent = useMemo(() => {
    if (isLoading || featuredStory) return null; // [BUG FIX] 추천 스토리가 있으면 빈 상태를 표시하지 않음
    return (
      <View style={st.emptyListWrap}>
        <EmptyState
          type="search"
          title={String(t?.noStoriesFound ?? '')}
          subtitle={String(t?.tryAnotherSearch ?? '')}
        />
      </View>
    );
  }, [isLoading, featuredStory, t]);

  return (
    <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>

      {/* Header */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <TouchableOpacity
            style={st.sortBtn}
            onPress={() => setSortVisible(true)}
          >
            <SlidersHorizontal size={22} color="#D4A853" />
            {sortId !== 'recommended' && (
              <Text style={st.sortBtnTxt}>{selectedSortLabel}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={st.viewModeBtn} onPress={toggleViewMode}>
            {viewMode === 'grid' ? <List size={22} color="#F0F0F5" /> : <Grid2X2 size={22} color="#F0F0F5" />}
          </TouchableOpacity>
        </View>

        <View style={st.headerRight}>
          <TouchableOpacity style={st.iconBtn} onPress={() => navigationRef.navigate('Search')}>
            <Search size={22} color="#F0F0F5" /> 
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => navigationRef.navigate('Notifications')}>
            <View>
              <Bell size={22} color="#F0F0F5" />
              {unreadCount > 0 && (
                <View style={st.notiBadge}>
                  <Text style={st.notiBadgeTxt}>{notificationBadgeLabel}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={genreScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.genreScroll}
        contentContainerStyle={st.genreContent}
      >
        {genres.map(g => {
          const selected = selectedGenre === g.id;
          return (
            <TouchableOpacity
              key={g.id}
              style={[st.genreChip, selected && st.genreChipOn]}
              onLayout={e => {
                genreLayouts.current[g.id] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width };
              }}
              onPress={() => handleGenreSelect(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={g.label}
            >
              <Text style={[st.genreTxt, selected && st.genreTxtOn]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlashList
        key={viewMode}
        style={st.storyList}
        data={listStories ?? []}
        renderItem={renderItem}
        keyExtractor={(item: RankableStory) => String(item.id)}
        numColumns={viewMode === 'grid' ? 2 : 1}
        ListHeaderComponent={listHeaderComponent}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={false} // useInfiniteQuery uses internal loading for refetch
            onRefresh={handleRefresh}
            tintColor="#D4A853"
            colors={['#D4A853']}
            progressBackgroundColor={APP_NAV_TONE}
          />
        }
        estimatedItemSize={viewMode === 'grid' ? 320 : 120}
        getItemType={(item: RankableStory) => `${viewMode}-${item.coverUrl ? 'cover' : 'no-cover'}`}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={st.footerLoading}>
              <Text style={st.loadingText}>{String(t?.loading ?? t?.loadingDefault ?? '')}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={listEmptyComponent}
      />

      <SortDropdown
        visible={sortVisible}
        current={sortId}
        options={STORY_SORT_OPTIONS}
        onSelect={handleSortSelect}
        onClose={() => setSortVisible(false)}
        anchorY={sortAnchorY.current}
      />

      <StoryPreviewSheet
        visible={!!previewStory}
        story={previewStory as Story}
        onClose={() => setPreviewStory(null)}
        onPrimaryAction={() => {
          if (!previewStory) return;
          navigation.navigate('Chat', { story: previewStory });
          setPreviewStory(null);
        }}
      />

      <Modal
        visible={!!menuStory}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuStory(null)}
      >
        <TouchableOpacity
          style={st.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuStory(null)}
        >
          <View style={st.menuBox}>
            <TouchableOpacity style={st.menuItem} onPress={handleReportFromMenu}>
              <Text style={st.menuItemText}>{String(t?.reportStory ?? '')}</Text>
            </TouchableOpacity>
            <View style={st.menuDivider} />
            <TouchableOpacity style={st.menuItem} onPress={handleBlockFromMenu}>
              <Text style={[st.menuItemText, st.menuItemTextDanger]}>{String(t?.blockStory ?? '')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {reportStoryTarget?.id ? (
        <ReportModal
          visible={!!reportStoryTarget}
          targetType="story"
          targetId={String(reportStoryTarget.id)}
          targetLabel={String(reportStoryTarget.title ?? '')}
          onClose={() => setReportStoryTarget(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: APP_NAV_TONE },

  header: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: APP_NAV_TONE },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4 },
  sortBtnTxt: {
    color: '#D4A853',
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium },
  viewModeBtn: {
    padding: 2 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14 },
  iconBtn: {
    padding: 4 },
  notiBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#D4A853',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: APP_NAV_TONE },
  notiBadgeTxt: {
    fontSize: 8,
    color: '#fff',
    fontFamily: Typography.fontFamily.bold },

  genreBar: {
    backgroundColor: APP_NAV_TONE,
    paddingBottom: 10,
    paddingTop: 4 },
  genreScroll: {
    flexGrow: 0,
    marginTop: 0,
    marginBottom: 4 },
  genreContent: {
    paddingHorizontal: 12,
    gap: 6 },
  genreChip: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginHorizontal: 0 },
  genreChipOn: {
    // Intentionally empty: selected state is handled by text styling only.
  },
  genreTxt: {
    fontSize: 16,
    color: '#656580',
    fontFamily: Typography.fontFamily.semibold },
  genreTxtOn: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.bold },

  storyList: {
    flex: 1,
    backgroundColor: APP_NAV_TONE },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2 },
  sectionTitleWrap: {
    paddingHorizontal: 4,
    marginBottom: 14 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5' },

  loadingText: {
    color: '#656580',
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    textAlign: 'center',
    marginTop: 20 },
  emptyListWrap: {
    paddingVertical: 40,
    alignItems: 'center' },
  footerLoading: {
    paddingVertical: 20,
    alignItems: 'center' },
  headerComp: {
    paddingTop: 4,
    minHeight: 10 },
  featuredWrap: {
    marginBottom: 20 },
  gridItem: {
    marginBottom: 18 },
  menuOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(0,0,0,0.44)' },
  menuBox: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#101217',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)' },
  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 16 },
  menuItemText: {
    color: '#F0F0F5',
    fontSize: 15,
    fontFamily: Typography.fontFamily.semibold },
  menuItemTextDanger: {
    color: '#FF6B6B' },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)' } });
