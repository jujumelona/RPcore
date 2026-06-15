/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/SearchScreen.tsx — 스토리 + 캐릭터 통합 검색 v3

import { triggerHaptic } from '../utils/haptics';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { View, Text, StyleSheet, StatusBar, ScrollView, Keyboard, Modal, Dimensions } from 'react-native';
import { PressableOpacity } from '../components/PressableOpacity';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { appStorage } from '../utils/storage';
import { Radius, Typography } from '../constants/tokens';
import { Story } from '../types/navigation';
import { StoryAPI } from '../api/StoryAPI';
import type { SafeStoryResponse } from '../types/schemas';
import { EmptyState } from '../components/EmptyState';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';
import { db } from '../core/sqlite/Database';
import { formatCount } from '../utils/formatCount';
import { fuzzySearch } from '../utils/fuzzySearch';
import { SERVER_BASE } from '../config/ApiConfig';
import type { CharacterCardData } from './characters/components/CharacterCard';
import { StoryCard, StoryCardWide } from '../components/StoryCard';
import { buildCharacterChatNavigationParams, buildCharacterSearchCardStory } from '../utils/characterChat';
import { Check, List, SlidersHorizontal, Grid2X2, Search, XCircle,
  Clock, X, MessageSquare, Users, Heart } from 'lucide-react-native';
import { useLanguageStore } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { extractCoverUrl,
  extractLocalizedStoryFields,
  extractStoryTags,
  isReadyForHomeExposure,
  parseStoryConfig,
  pickString } from './home/utils/storyHelpers';

const RECENT_SEARCHES_KEY = '@recent_searches';
const MAX_RECENT = 10;
const STORY_CACHE_KEY = '@stories_cache';

/* ─── 최근 검색어 헬퍼 ───────────────────────────────────────────── */
function loadRecentSearches(): string[] {
  try { const r = appStorage.getString(RECENT_SEARCHES_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function addRecentSearch(query: string): string[] {
  const list = loadRecentSearches();
  const updated = [query, ...list.filter(s => s !== query)].slice(0, MAX_RECENT);
  appStorage.set(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  return updated;
}
function removeRecentSearch(query: string): string[] {
  const updated = loadRecentSearches().filter(s => s !== query);
  appStorage.set(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  return updated;
}

/* ─── 스토리 로컬 검색 ───────────────────────────────────────────── */
function searchStoriesLocal(stories: Story[], query: string): Story[] {
  if (!query.trim()) return [];
  return fuzzySearch(
    stories,
    query,
    [
      { name: 'title', weight: 0.45, getValue: story => story.title },
      { name: 'description', weight: 0.25, getValue: story => story.description ?? '' },
      { name: 'tags', weight: 0.2, getValue: story => story.tags ?? [] },
      { name: 'author', weight: 0.1, getValue: story => story.author ?? '' },
    ],
    { limit: 40, threshold: 0.34 },
  );
}

/* ─── 캐릭터 API ─────────────────────────────────────────────────── */
async function fetchCharactersSearch({
  sort, search, cursor, token }: { sort: string; search: string; cursor?: string; token?: string }) {
  try {
    const params = new URLSearchParams();
    params.set('sort', sort);
    params.set('limit', '20');
    if (search) params.set('q', search);
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(
      `${SERVER_BASE}/characters?${params.toString()}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    return {
      characters: (data.characters ?? []) as CharacterCardData[],
      nextCursor: data.next_cursor as string | undefined,
      hasMore: !!data.has_more };
  } catch {
    return { characters: [], hasMore: false };
  }
}

function toNavigationStory(
  raw: SafeStoryResponse | Record<string, unknown>,
  appLanguage: string,
  t?: Record<string, string>,
): Story {
  const record = raw as Record<string, unknown>;
  const cfg = parseStoryConfig(record);
  const localized = extractLocalizedStoryFields(record, appLanguage);
  const coverUrl = extractCoverUrl(record);
  const coverUrls = Array.from(new Set([
    ...(Array.isArray(record.cover_urls) ? record.cover_urls : []),
    ...(Array.isArray(record.coverUrls) ? record.coverUrls : []),
    ...(Array.isArray(cfg.cover_urls) ? cfg.cover_urls : []),
    ...(Array.isArray(cfg.storeCoverUris) ? cfg.storeCoverUris : []),
    ...(coverUrl ? [coverUrl] : []),
  ].map(value => String(value ?? '').trim()).filter(Boolean)));
  const tags = extractStoryTags(record);

  return {
    ...(record as unknown as Story),
    id: String(record.id ?? ''),
    title: pickString(localized.title, record.title, cfg.title, cfg.storyTitle, t?.defaultStoryTitle),
    description: pickString(
      localized.description,
      record.description,
      cfg.description,
      cfg.storyDesc,
      cfg.worldSetting,
      '',
    ),
    coverUrl: coverUrls[0] ?? '',
    cover_urls: coverUrls.length > 0 ? coverUrls : (coverUrl ? [coverUrl] : []),
    author: pickString(record.author, record.author_name, record.author_nickname, cfg.authorName, cfg.author_name),
    authorId: pickString(record.authorId, record.author_id),
    likeCount: Number(record.likeCount ?? record.like_count ?? 0) || 0,
    viewCount: Number(record.viewCount ?? record.view_count ?? 0) || 0,
    tags,
    genre: pickString(record.genre, cfg.genre),
    story_config: (record.story_config ?? record.storyConfig ?? cfg) as unknown as Story['story_config'] };
}

function toNavigationStories(
  items: Array<SafeStoryResponse | Record<string, unknown>>,
  appLanguage: string,
  t?: Record<string, string>,
): Story[] {
  return items
    .filter(item => isReadyForHomeExposure(item as Record<string, unknown>))
    .map(item => toNavigationStory(item, appLanguage, t))
    .filter(story => story.id.length > 0);
}

/* ─── 정렬 드롭다운 컴포넌트 ─────────────────────────────────────── */
function SortMenu({
  visible, current, options, onSelect, onClose }: {
  visible: boolean; current: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <PressableOpacity style={s.sortOverlay} activeOpacity={1} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(160)} style={s.sortBox}>
          {options.map((o, i) => (
            <PressableOpacity
              key={o.id}
              style={[s.sortItem, o.id === current && s.sortItemOn, i === options.length - 1 && s.sortItemLast]}
              onPress={() => { onSelect(o.id); onClose(); }}
            >
              <Text style={[s.sortTxt, o.id === current && s.sortTxtOn]}>{o.label}</Text>
              {o.id === current && <Check size={13} color="#D4A853" />}
            </PressableOpacity>
          ))}
        </Animated.View>
      </PressableOpacity>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export function SearchScreen({ navigation }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const { t, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })));
  const token = useAuthStore(s => s.user?.jwtToken);

  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [_cachedStories, setCachedStories] = useState<Story[]>([]);
  const cachedRef = useRef<Story[]>([]);
  const [storyResults, setStoryResults] = useState<Story[]>([]);

  const [activeTab, setActiveTab] = useState<'story' | 'character'>('story');
  const [storySortId, setStorySortId] = useState('recommended');
  const [charSortId, setCharSortId] = useState('recommended');
  const [charViewMode, setCharViewMode] = useState<'grid' | 'list'>('list');
  const [storyViewMode, setStoryViewMode] = useState<'grid' | 'list'>('list');
  const [storySortVisible, setStorySortVisible] = useState(false);
  const [charSortVisible, setCharSortVisible] = useState(false);

  const STORY_SORT_OPTIONS = useMemo(() => [
    { id: 'recommended', label: String(t?.sortRecommended ?? '') },
    { id: 'popular',     label: String(t?.sortPopular ?? '') },
    { id: 'latest',      label: String(t?.sortLatest ?? '') },
    { id: 'liked',       label: String(t?.sortLiked ?? '') },
  ], [t]);

  const CHAR_SORT_OPTIONS = useMemo(() => [
    { id: 'recommended', label: String(t?.sortRecommended ?? '') },
    { id: 'popular',     label: String(t?.sortPopular ?? '') },
    { id: 'latest',      label: String(t?.sortLatest ?? '') },
    { id: 'liked',       label: String(t?.sortLiked ?? '') },
  ], [t]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 캐릭터 무한 스크롤 쿼리 ─────────────────────────────────── */
  const charQuery = useInfiniteQuery({
    queryKey: ['search-characters', charSortId, query, activeTab],
    queryFn: ({ pageParam }) =>
      fetchCharactersSearch({ sort: charSortId, search: query, cursor: pageParam as string | undefined, token }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.hasMore ? last.nextCursor : undefined,
    enabled: activeTab === 'character',
    staleTime: 60_000 });

  const charItems = useMemo(
    () => charQuery.data?.pages.flatMap(p => p.characters) ?? [],
    [charQuery.data?.pages],
  );

  /* ── FTS5 대화 기록 ─────────────────────────────────────────── */
  const { data: conversationResults = [] } = useQuery({
    queryKey: ['fts-search', query],
    queryFn: () => db.searchConversations(query.trim(), 30),
    enabled: query.trim().length >= 2 && hasSearched && activeTab === 'story',
    staleTime: 30_000,
    select: (rows) => rows.map(r => ({
      id: String(r.id), content: r.content.slice(0, 80),
      storyId: r.story_id, speakerId: r.speaker_id })) });

  /* ── 초기 로드 ──────────────────────────────────────────────── */
  useEffect(() => {
    setRecentSearches(loadRecentSearches());
    // [BUG FIX #36] STORY_CACHE_KEY에서 읽기만 하고 쓰지 않아 캐시가 항상 비어있던 버그 수정
    // 캐시 읽기 → 만료 검증 → 미사용/만료 시 서버 fetch 후 저장
    const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30분
    const cached = (() => {
      try {
        const r = appStorage.getString(STORY_CACHE_KEY);
        if (!r) return null;
        const parsed = JSON.parse(r);
        if (!Array.isArray(parsed.stories)) return null;
        if (Date.now() - (parsed._cachedAt ?? 0) > SEARCH_CACHE_TTL) return null;
        return parsed.stories;
      } catch { return null; }
    })();
    const normalizedCached = Array.isArray(cached)
      ? toNavigationStories(cached as Array<Record<string, unknown>>, appLanguage, t)
      : [];

    if (normalizedCached.length > 0) {
      setCachedStories(normalizedCached); cachedRef.current = normalizedCached;
    } else if (appLanguage) {
      StoryAPI.getStoriesPaged({ sort: 'latest', lang: appLanguage }).then(({ stories }) => {
        const normalizedStories = toNavigationStories(stories as Array<Record<string, unknown>>, appLanguage, t);
        setCachedStories(normalizedStories); cachedRef.current = normalizedStories;
        // 캐시에 저장
        try { appStorage.set(STORY_CACHE_KEY, JSON.stringify({ stories: normalizedStories, _cachedAt: Date.now() })); } catch {
          // Ignore cache errors
        }
      }).catch(() => {
        // Ignore API errors
      });
    }
    const currentDebounce = debounceRef.current;
    return () => { if (currentDebounce) clearTimeout(currentDebounce); };
  }, [appLanguage, t]);

  /* ── 검색 핸들러 ─────────────────────────────────────────────── */
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length > 0) {
      debounceRef.current = setTimeout(async () => {
        const localResults = searchStoriesLocal(cachedRef.current, q);
        if (localResults.length > 0) {
          setStoryResults(localResults);
          setHasSearched(true);
          return;
        }

        if (appLanguage) {
          try {
            const serverResults = await StoryAPI.getStories({ search: q.trim(), lang: appLanguage });
            setStoryResults(toNavigationStories(serverResults as Array<Record<string, unknown>>, appLanguage, t));
          } catch {
            setStoryResults([]);
          }
        }
        setHasSearched(true);
      }, 300);
    } else {
      setStoryResults([]);
      setHasSearched(false);
    }
  }, [appLanguage, t]);

  // [MEMORY LEAK FIX] debounce 타이머 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    setRecentSearches(addRecentSearch(query.trim()));
    handleSearch(query);
  }, [query, handleSearch]);

  const handleRecentTap = (term: string) => {
    setQuery(term);
    setRecentSearches(addRecentSearch(term));
    handleSearch(term);
  };

  /* ─── 렌더러 ──────────────────────────────────────────────────── */
  const renderStoryItem = useCallback(({ item, index }: { item: Story; index: number }) => {
    if (storyViewMode === 'grid') {
      return (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35).springify()} style={s.gridCardWrapper}>
          <StoryCard
            story={item}
            onPress={() => navigation.navigate('StoryDetail', { story: item })}
            appLanguage={appLanguage}
            index={index}
          />
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.delay(index * 35).springify()}>
        <StoryCardWide
          story={item}
          onPress={() => navigation.navigate('StoryDetail', { story: item })}
          appLanguage={appLanguage}
          index={index}
        />
      </Animated.View>
    );
  }, [navigation, appLanguage, storyViewMode]);

  const handleCharacterChatPress = useCallback((item: CharacterCardData) => {
    const { story, character } = buildCharacterChatNavigationParams({
      id: item.id,
      name: item.name,
      age: item.age,
      personality: item.personality,
      description: item.personality,
      imageUrls: item.imageUrls,
      imageUrl: item.profileUrl,
      storyId: item.storyId,
      storyTitle: item.storyTitle,
      likeCount: item.likeCount,
      playerCount: item.playerCount,
      tags: item.tags,
      genre: item.genre,
    });

    navigation.navigate('Chat', {
      story,
      character,
      resumeMode: true,
    });
  }, [navigation]);

  const renderCharGrid = useCallback(({ item, index }: { item: CharacterCardData; index: number }) => (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify()} style={s.charGridItem}>
      <PressableOpacity
        style={s.charCard}
        onPress={() => handleCharacterChatPress(item)}
      >
        <View style={s.charImgWrap}>
          {item.imageUrls?.[0]
            ? <Image source={{ uri: item.imageUrls[0] }} style={s.charImg} contentFit="cover" />
            : <View style={[s.charImg, s.charImgFallback]}><Users size={24} color="#6060A0" /></View>}
        </View>
        <View style={s.charInfo}>
          <Text style={s.charName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.charPersonality} numberOfLines={2}>{item.personality}</Text>
          <View style={s.charMeta}>
            <Heart size={10} color="#FF7E9D" />
            <Text style={s.charMetaTxt}>{formatCount(item.likeCount ?? 0, appLanguage)}</Text>
          </View>
        </View>
      </PressableOpacity>
    </Animated.View>
  ), [appLanguage, handleCharacterChatPress]);

  const renderCharList = useCallback(({ item, index }: { item: CharacterCardData; index: number }) => (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35).springify()}>
      <StoryCardWide
        story={buildCharacterSearchCardStory({
          id: item.id,
          name: item.name,
          age: item.age,
          personality: item.personality,
          description: item.personality,
          imageUrls: item.imageUrls,
          imageUrl: item.profileUrl,
          storyId: item.storyId,
          storyTitle: item.storyTitle,
          likeCount: item.likeCount,
          playerCount: item.playerCount,
          tags: item.tags,
          genre: item.genre,
        })}
        onPress={() => handleCharacterChatPress(item)}
        appLanguage={appLanguage}
        index={index}
      />
    </Animated.View>
  ), [appLanguage, handleCharacterChatPress]);

  const currentSortLabel = activeTab === 'story'
    ? (STORY_SORT_OPTIONS.find(o => o.id === storySortId)?.label ?? STORY_SORT_OPTIONS[0]?.label ?? '')
    : (CHAR_SORT_OPTIONS.find(o => o.id === charSortId)?.label ?? CHAR_SORT_OPTIONS[0]?.label ?? '');

  /* ─── 필터 바 (탭+정렬+뷰모드) ────────────────────────────────── */
  const filterBar = (
    <View style={s.filterBar}>
      {/* 탭 */}
      <View style={s.tabs}>
        <PressableOpacity style={[s.tab, activeTab === 'story' && s.tabActive]} onPress={() => setActiveTab('story')}>
          <Text style={[s.tabTxt, activeTab === 'story' && s.tabTxtActive]}>
            {String(t?.tabStories ?? t?.story ?? '')}
          </Text>
        </PressableOpacity>
        <PressableOpacity style={[s.tab, activeTab === 'character' && s.tabActive]} onPress={() => { triggerHaptic('select'); setActiveTab('character'); }}>
          <Users size={13} color={activeTab === 'character' ? '#D4A853' : '#9090B0'} />
          <Text style={[s.tabTxt, activeTab === 'character' && s.tabTxtActive]}>
            {String(t?.tabCharacters ?? t?.characters ?? '')}
          </Text>
        </PressableOpacity>
      </View>

      {/* 정렬 + 뷰모드 */}
      <View style={s.filterRight}>
        <PressableOpacity
          style={s.sortBtn}
          onPress={() => activeTab === 'story' ? setStorySortVisible(true) : setCharSortVisible(true)}
        >
          <SlidersHorizontal size={13} color="#D4A853" />
          <Text style={s.sortBtnTxt}>{currentSortLabel}</Text>
        </PressableOpacity>
        {activeTab === 'character' && (
          <PressableOpacity style={s.viewModeBtn} onPress={() => setCharViewMode(v => v === 'grid' ? 'list' : 'grid')}>
            {charViewMode === 'grid' ? <List size={16} color="#A0A0C0" /> : <Grid2X2 size={16} color="#A0A0C0" />}
          </PressableOpacity>
        )}
        {activeTab === 'story' && (
          <PressableOpacity style={s.viewModeBtn} onPress={() => setStoryViewMode(v => v === 'grid' ? 'list' : 'grid')}>
            {storyViewMode === 'grid' ? <List size={16} color="#A0A0C0" /> : <Grid2X2 size={16} color="#A0A0C0" />}
          </PressableOpacity>
        )}
      </View>
    </View>
  );

  /* ─── 메인 렌더 ─────────────────────────────────────────────── */
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050507" translucent={false} />

      {/* 검색창 */}
      <View style={s.header}>
        <View style={s.searchBarWrap}>
          <Search size={17} color="#797990" />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={handleSearch}
            onSubmitEditing={handleSubmit}
            placeholder={t?.searchPlaceholder ?? t?.search}
            placeholderTextColor="#6868A0"
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <PressableOpacity onPress={() => { setQuery(''); setStoryResults([]); setHasSearched(false); }} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
              <XCircle size={16} color="#797990" />
            </PressableOpacity>
          )}
        </View>
        <PressableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelTxt}>{t?.cancelSearch}</Text>
        </PressableOpacity>
      </View>

      {filterBar}

      {/* 정렬 드롭다운 */}
      <SortMenu visible={storySortVisible} current={storySortId} options={STORY_SORT_OPTIONS}
        onSelect={setStorySortId} onClose={() => setStorySortVisible(false)} />
      <SortMenu visible={charSortVisible} current={charSortId} options={CHAR_SORT_OPTIONS}
        onSelect={setCharSortId} onClose={() => setCharSortVisible(false)} />

      {/* 컨텐츠 영역 */}
      {activeTab === 'story' ? (
        !hasSearched ? (
          /* 최근 검색어 */
          <View style={s.recentWrap}>
            {recentSearches.length > 0 && (
              <View style={s.recentHeader}>
                <Text style={s.recentTitle}>{String(t?.recentSearches ?? '')}</Text>
                <PressableOpacity onPress={() => { appStorage.remove(RECENT_SEARCHES_KEY); setRecentSearches([]); }}>
                  <Text style={s.clearAllTxt}>{String(t?.clearAll ?? '')}</Text>
                </PressableOpacity>
              </View>
            )}
            {recentSearches.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} onScrollBeginDrag={Keyboard.dismiss}>
                {recentSearches.map((term, idx) => (
                  <Animated.View key={term} entering={FadeInDown.delay(idx * 30).springify()} style={s.recentItem}>
                    <PressableOpacity style={s.recentTermBtn} onPress={() => handleRecentTap(term)}>
                      <Clock size={14} color="#757585" />
                      <Text style={s.recentTerm}>{term}</Text>
                    </PressableOpacity>
                    <PressableOpacity onPress={() => setRecentSearches(removeRecentSearch(term))} style={s.removeBtn}>
                      <X size={15} color="#757585" />
                    </PressableOpacity>
                  </Animated.View>
                ))}
              </ScrollView>
            ) : (
              <View style={s.emptyRecent}>
                <Search size={32} color="#4A4A6A" />
                <Text style={s.emptyRecentTxt}>{String(t?.noRecentSearches ?? '')}</Text>
              </View>
            )}
          </View>
        ) : storyResults.length === 0 ? (
          <EmptyState type="search" title={t?.noSearchResults2} subtitle={t?.noSearchResultsHint2} />
        ) : (
          <FlashList
            key={`story-${storyViewMode}`}
            data={storyResults ?? []}
            keyExtractor={(item: Story) => String(item.id)}
            numColumns={storyViewMode === 'grid' ? 2 : 1}
            contentContainerStyle={storyViewMode === 'grid' ? s.charGridContent : s.resultList}
            showsVerticalScrollIndicator={false}
            renderItem={renderStoryItem}
            estimatedItemSize={storyViewMode === 'grid' ? 240 : 120}
            ListFooterComponent={conversationResults.length > 0 ? (
              <View style={s.convSection}>
                <View style={s.convHeader}>
                  <MessageSquare size={13} color="#D4A853" />
                  <Text style={s.convTitle}>
                    {`${String(t?.conversationHistory ?? '')} (${conversationResults.length})`}
                  </Text>
                </View>
                {conversationResults.slice(0, 5).map((cr: Record<string,unknown>) => (
                  <View key={String(cr.id)} style={s.convItem}>
                    <Text style={s.convContent} numberOfLines={2}>{String(cr.content)}</Text>
                    <Text style={s.convMeta}>{String(cr.speakerId)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          />
        )
      ) : (
        /* 캐릭터 탭 */
        !hasSearched ? (
          /* [FIX #4] 캐릭터 탭도 스토리 탭과 동일하게 최근 검색어 표시 */
          <View style={s.recentWrap}>
            {recentSearches.length > 0 && (
              <View style={s.recentHeader}>
                <Text style={s.recentTitle}>{String(t?.recentSearches ?? '')}</Text>
                <PressableOpacity onPress={() => { appStorage.remove(RECENT_SEARCHES_KEY); setRecentSearches([]); }}>
                  <Text style={s.clearAllTxt}>{String(t?.clearAll ?? '')}</Text>
                </PressableOpacity>
              </View>
            )}
            {recentSearches.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} onScrollBeginDrag={Keyboard.dismiss}>
                {recentSearches.map((term, idx) => (
                  <Animated.View key={term} entering={FadeInDown.delay(idx * 30).springify()} style={s.recentItem}>
                    <PressableOpacity style={s.recentTermBtn} onPress={() => handleRecentTap(term)}>
                      <Clock size={14} color="#757585" />
                      <Text style={s.recentTerm}>{term}</Text>
                    </PressableOpacity>
                    <PressableOpacity onPress={() => setRecentSearches(removeRecentSearch(term))} style={s.removeBtn}>
                      <X size={15} color="#757585" />
                    </PressableOpacity>
                  </Animated.View>
                ))}
              </ScrollView>
            ) : (
              <View style={s.emptyRecent}>
                <Users size={32} color="#4A4A6A" />
                <Text style={s.emptyRecentTxt}>{String(t?.noRecentSearches ?? '')}</Text>
              </View>
            )}
          </View>
        ) :
        charItems.length === 0 && !charQuery.isLoading ? (
          <EmptyState
            type="empty"
            title={String(t?.emptyCharacter ?? t?.noSearchResults2 ?? '')}
            subtitle={String(t?.emptyCharacterSub ?? t?.noSearchResultsHint2 ?? '')}
          />
        ) : (
          <FlashList
            key={charViewMode}
            data={charItems ?? []}
            keyExtractor={(item: CharacterCardData) => String(item.id)}
            numColumns={charViewMode === 'grid' ? 2 : 1}
            renderItem={charViewMode === 'grid' ? renderCharGrid : renderCharList}
            estimatedItemSize={charViewMode === 'grid' ? 220 : 110}
            contentContainerStyle={charViewMode === 'grid' ? s.charGridContent : s.charListContent}
            showsVerticalScrollIndicator={false}
            onEndReached={() => { if (charQuery.hasNextPage && !charQuery.isFetchingNextPage) charQuery.fetchNextPage(); }}
            onEndReachedThreshold={0.4}
          />
        )
      )}

    </SafeAreaView>
  );
}

/* ─── 스타일 ───────────────────────────────────────────────────── */
const SCR_W = 375;
const CHAR_CARD_W = (SCR_W - 28 - 10) / 2;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  searchBarWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, height: 44, gap: 8,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.35)', elevation: 3 },
  searchInput: { flex: 1, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular, paddingVertical: 0, height: 44 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 8 },
  cancelTxt: { fontSize: 14, color: '#C8C8D4', fontFamily: Typography.fontFamily.medium },

  /* 필터 바 */
  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: 0.5, borderBottomColor: '#1A1A24' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#D4A853' },
  tabTxt: { fontSize: 13, fontFamily: Typography.fontFamily.medium, color: '#9090B0' },
  tabTxtActive: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },

  filterRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(212,168,83,0.1)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(212,168,83,0.22)' },
  sortBtnTxt: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853' },
  viewModeBtn: { padding: 6 },

  /* 정렬 드롭다운 */
  sortOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sortBox: {
    position: 'absolute', top: 100, right: 16,
    backgroundColor: '#111118', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#222232', minWidth: 150, overflow: 'hidden',
    elevation: 16 },
  sortItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 0.5, borderBottomColor: '#181820' },
  sortItemOn: { backgroundColor: 'rgba(212,168,83,0.07)' },
  sortTxt: { fontSize: 13, color: '#C0C0D4', fontFamily: Typography.fontFamily.medium },
  sortTxtOn: { color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },
  sortItemLast: { borderBottomWidth: 0 },

  /* 최근 검색 */
  recentWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  recentTitle: { fontSize: 12, color: '#9090B0', fontFamily: Typography.fontFamily.semibold, letterSpacing: 1, textTransform: 'uppercase' },
  clearAllTxt: { fontSize: 12, color: '#9090B0', fontFamily: Typography.fontFamily.regular },
  recentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: '#1A1A24' },
  recentTermBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recentTerm: { fontSize: 14, color: '#C8C8D4', fontFamily: Typography.fontFamily.regular },
  removeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  emptyRecent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyRecentTxt: { fontSize: 15, color: '#9090B0', fontFamily: Typography.fontFamily.medium },

  /* 스토리 검색 결과 */
  resultList: { paddingHorizontal: 16, paddingBottom: 100, gap: 8, paddingTop: 4 },
  resultCard: {
    flexDirection: 'row', backgroundColor: '#0E0E14',
    borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)', elevation: 2 },
  resultImgWrap: { position: 'relative' },
  resultImg: { width: 86, height: 120 },
  resultImgFallback: { backgroundColor: '#111118' },
  resultImgOverlay: StyleSheet.absoluteFillObject as any,
  resultInfo: { flex: 1, padding: 12, justifyContent: 'space-between' },
  resultTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  resultDesc: { fontSize: 12, color: '#8A8A9E', lineHeight: 17, fontFamily: Typography.fontFamily.regular },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { backgroundColor: 'rgba(212,168,83,0.08)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(212,168,83,0.18)' },
  tagText: { fontSize: 10, color: '#C4A24A', fontFamily: Typography.fontFamily.medium },
  resultMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLikePair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultAuthor: { fontSize: 11, color: '#797990', fontFamily: Typography.fontFamily.regular },
  resultLike: { fontSize: 11, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },

  /* 대화 기록 */
  convSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  convHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  convTitle: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.medium },
  convItem: { backgroundColor: '#0E0E14', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  convContent: { fontSize: 13, color: '#C8C8D4', lineHeight: 19, fontFamily: Typography.fontFamily.regular },
  convMeta: { fontSize: 10, color: '#757585', marginTop: 4, fontFamily: Typography.fontFamily.regular },

  /* 캐릭터 그리드 */
  charGridContent: { paddingHorizontal: 14, paddingBottom: 100, paddingTop: 4, gap: 10 },
  charListContent: { paddingBottom: 100, paddingTop: 4 },
  charGridItem: { width: CHAR_CARD_W },
  charCard: {
    backgroundColor: '#0E0E14', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A1A28', overflow: 'hidden', elevation: 2 },
  charImgWrap: { width: '100%', height: CHAR_CARD_W * 1.3, overflow: 'hidden' },
  charImg: { width: '100%', height: '100%' },
  charImgFallback: { backgroundColor: '#12121E', alignItems: 'center', justifyContent: 'center' },
  charInfo: { padding: 10, gap: 4 },
  charName: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#E0E0F0' },
  charPersonality: { fontSize: 11, color: '#7878A0', fontFamily: Typography.fontFamily.regular, lineHeight: 16 },
  charMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  charMetaTxt: { fontSize: 11, color: '#9090B0', fontFamily: Typography.fontFamily.medium },

  /* 캐릭터 리스트 */
  charListCard: {
    flexDirection: 'row', marginHorizontal: 14, marginBottom: 8,
    backgroundColor: '#0E0E14', borderRadius: 12,
    borderWidth: 1, borderColor: '#1A1A28', overflow: 'hidden' },
  charListImgWrap: { width: 90, height: 120, flexShrink: 0 },
  charListImg: { width: '100%', height: '100%' },
  charListInfo: { flex: 1, padding: 12, justifyContent: 'center', gap: 4 },

  /* 그리드 모드 추가 */
  gridCard: {
    backgroundColor: '#0E0E14', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1A1A28', elevation: 2 },
  gridImgWrap: { width: '100%', height: 180, position: 'relative' },
  gridImg: { width: '100%', height: '100%' },
  gridGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  gridStats: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', gap: 6 },
  gridStatItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridStatTxt: { fontSize: 10, color: '#fff', fontFamily: Typography.fontFamily.medium },
  gridInfo: { padding: 10, gap: 2 },
  gridTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#E0E0F0' },
  gridAuthor: { fontSize: 11, color: '#7878A0', fontFamily: Typography.fontFamily.regular },
  gridCardWrapper: { width: (Dimensions.get('window').width - 40) / 2, marginBottom: 12 } });
