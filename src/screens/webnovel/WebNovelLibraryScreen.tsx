
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/webnovel/WebNovelLibraryScreen.tsx
// LNReader (MIT) library + updates 패턴 이식
// — 다운로드/온라인 탭, 진행률, 정렬/필터, 검색

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, TextInput,
  RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { Library, Download, Search, X, SlidersHorizontal, BookOpen, Star, Clock } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';

import en from '../../locales/en/webnovel_library.json';
import ko from '../../locales/ko/webnovel_library.json';
import ja from '../../locales/ja/webnovel_library.json';
import zhCN from '../../locales/zh-CN/webnovel_library.json';
import zhTW from '../../locales/zh-TW/webnovel_library.json';
import es from '../../locales/es/webnovel_library.json';
import pt from '../../locales/pt/webnovel_library.json';
 
import fr from '../../locales/fr/webnovel_library.json';
import de from '../../locales/de/webnovel_library.json';
import it from '../../locales/it/webnovel_library.json';
import ru from '../../locales/ru/webnovel_library.json';
import th from '../../locales/th/webnovel_library.json';
import tr from '../../locales/tr/webnovel_library.json';
import hi from '../../locales/hi/webnovel_library.json';
import ar from '../../locales/ar/webnovel_library.json';

const TRANSLATIONS: Record<string, any> = { en, ko, ja, 'zh-CN': zhCN, 'zh-TW': zhTW, es, pt, fr, de, it, ru, th, tr, hi, ar };

import { useLanguageStore } from '../../store/languageStore';
import { useAuthStore } from '../../store/authStore';
import { useReaderSettingsStore } from '../../store/readerSettingsStore';
import { formatLastReadTimestamp, getNovelProgressRatio } from '../../reader/progressMetrics';
import { authedFetch } from '../../utils/authedFetch';
import { PressableOpacity } from '../../components/PressableOpacity';
import { EmptyState } from '../../components/EmptyState';
import { Radius, Typography } from '../../constants/tokens';
import { fuzzySearch } from '../../utils/fuzzySearch';
import { EPUB_SPIKE_SAMPLE_SRC, EPUB_SPIKE_SAMPLE_TITLE } from './EpubReaderSpikeScreen';
import { getDownloadedNovels, type DownloadedNovel } from './DownloadedNovelsScreen';
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { formatCount } from '../../utils/formatCount';

interface NovelCard {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  tags: string[];
  chapter_count: number;
  update_at: string;
  rating?: number;
  is_downloaded?: boolean;
  description?: string;
  t?: Record<string, string>;
}

type SortMode = 'recent' | 'rating' | 'chapters';
type TabMode = 'library' | 'updates';

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${Math.min(100, ratio * 100)}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 3, backgroundColor: '#1A1A2E', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#8B5CF6', borderRadius: 2 } });

// ── Novel Card ─────────────────────────────────────────────────────────────
const NovelItem = React.memo(function NovelItem({
  novel, index, onPress, readProgress, lastReadLabel }: {
  novel: NovelCard; index: number; onPress: () => void; readProgress?: number; lastReadLabel?: string;
}) {
  const ratio = readProgress ?? 0;
  return (
    <Animated.View entering={FadeInDown.delay(index * 35).springify().damping(22)}>
      <PressableOpacity style={ns.card} onPress={onPress} activeOpacity={0.87}>
        {/* 커버 */}
        <View style={ns.cover}>
          <Text style={ns.coverTxt}>{novel.title[0]}</Text>
          {novel.is_downloaded && (
            <View style={ns.dlBadge}>
              <Download size={9} color={'#fff'} />
            </View>
          )}
        </View>

        {/* 정보 */}
        <View style={ns.info}>
          <Text style={ns.title} numberOfLines={2}>{novel.title}</Text>
          <Text style={ns.author} numberOfLines={1}>@{novel.author}</Text>
          {!!novel.description && (
            <Text style={ns.desc} numberOfLines={2}>{novel.description}</Text>
          )}
          <View style={ns.row}>
            <BookOpen size={10} color={'#8B5CF6'} />
            <Text style={ns.metaTxt}>{novel.t?.episodeCount?.replace('{n}', String(novel.chapter_count)) ?? `${novel.chapter_count}화`}</Text>
            {novel.rating != null && (
              <>
                <Star size={10} color={'#D4A853'} fill={'#D4A853'} />
                <Text style={ns.metaTxt}>{novel.rating.toFixed(1)}</Text>
              </>
            )}
          </View>
          {ratio > 0 && (
            <View style={{ marginTop: 4 }}>
              <ProgressBar ratio={ratio} />
              <View style={ns.progressMetaRow}>
                <Text style={ns.progressTxt}>
                  {novel.t?.readPercent?.replace('{n}', String(Math.round(ratio * 100))) ?? `${Math.round(ratio * 100)}% read`}
                </Text>
                {!!lastReadLabel && (
                  <View style={ns.lastReadRow}>
                    <Clock size={10} color={'#6F6F88'} />
                    <Text style={ns.lastReadTxt}>{lastReadLabel}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </PressableOpacity>
    </Animated.View>
  );
});

// ── Main ───────────────────────────────────────────────────────────────────
 
export function WebNovelLibraryScreen({ navigation }: any) {
   
  const { lang, isRTL } = useLanguageStore(useShallow(s => ({ lang: s.appLanguage, isRTL: s.isRTL })));
  const t = (() => {
    let result = TRANSLATIONS.en;
    if (lang && TRANSLATIONS[lang]) result = TRANSLATIONS[lang];
    else if (lang && TRANSLATIONS[lang.split('-')[0]]) result = TRANSLATIONS[lang.split('-')[0]];
    return result;
  })();
  const jwtToken = useAuthStore(s => s.user?.jwtToken ?? '');
  const progressMap = useReaderSettingsStore(s => s.progressMap);

  const [tab, setTab] = useState<TabMode>('library');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [showSort, setShowSort] = useState(false);
  const [downloadedNovels, setDownloadedNovels] = useState<DownloadedNovel[]>([]);

  const refreshDownloadedNovels = useCallback(() => {
    setDownloadedNovels(getDownloadedNovels());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshDownloadedNovels();
    }, [refreshDownloadedNovels]),
  );

  // ── 도서관 조회 ──────────────────────────────────────────────────────────
  const libraryQuery = useQuery({
    queryKey: ['webnovel-library', tab, jwtToken],
    queryFn: async () => {
      const endpoint = tab === 'library' ? '/webnovel/library' : '/webnovel/updates';
      const resp = await authedFetch(endpoint);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return (data.novels ?? []) as NovelCard[];
    },
    staleTime: 60_000 });

  // eslint-disable-next-line
  const novels = libraryQuery.data ?? [];
  const downloadedIdSet = useMemo(
    () => new Set(downloadedNovels.map(novel => String(novel.id))),
    [downloadedNovels],
  );
  const libraryItems = useMemo(() => {
    if (tab !== 'library') return novels;

    const merged = new Map<string, NovelCard>();

    novels.forEach(novel => {
      const id = String(novel.id);
      merged.set(id, {
        ...novel,
        is_downloaded: Boolean(novel.is_downloaded) || downloadedIdSet.has(id),
      });
    });

    downloadedNovels.forEach(novel => {
      const id = String(novel.id);
      const existing = merged.get(id);
      if (existing) {
        merged.set(id, {
          ...existing,
          is_downloaded: true,
          description: existing.description || novel.preview,
        });
        return;
      }

      merged.set(id, {
        id,
        title: novel.title,
        author: novel.authorName || 'local',
        tags: [],
        chapter_count: 1,
        update_at: new Date(novel.downloadedAt).toISOString(),
        description: novel.preview,
        is_downloaded: true,
      });
    });

    return [...merged.values()];
  }, [downloadedIdSet, downloadedNovels, novels, tab]);

  const filtered = useMemo(() => {
    let list = libraryItems;
    if (search) {
      list = fuzzySearch(
        list,
        search,
        [
          { name: 'title', weight: 0.5, getValue: novel => novel.title },
          { name: 'author', weight: 0.2, getValue: novel => novel.author },
          { name: 'description', weight: 0.2, getValue: novel => novel.description ?? '' },
          { name: 'tags', weight: 0.1, getValue: novel => novel.tags ?? [] },
        ],
        { threshold: 0.34 },
      );
    }
    list = [...list].sort((a, b) => {
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === 'chapters') return b.chapter_count - a.chapter_count;
      // recent
      return new Date(b.update_at).getTime() - new Date(a.update_at).getTime();
    });
    return list;
  }, [libraryItems, search, sort]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<NovelCard>) => {
    const progress = progressMap[item.id];
    const ratio = getNovelProgressRatio(progress);
    const lastReadLabel = formatLastReadTimestamp(progress?.lastReadAt, lang || 'en');
    return (
      <NovelItem
        novel={{ ...item, t }}
        index={index}
        readProgress={ratio}
        lastReadLabel={lastReadLabel || undefined}
        onPress={() => navigation.navigate('WebNovelDetail', { novelId: item.id, novelTitle: item.title })}
      />
    );
  }, [lang, navigation, progressMap, t]);

  const SORT_OPTIONS: { key: SortMode; label: string; icon: any }[] = [
    { key: 'recent', label: t?.sortRecent, icon: Clock },
    { key: 'rating', label: t?.sortRating, icon: Star },
    { key: 'chapters', label: t?.sortChapters, icon: BookOpen },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />

      {/* 헤더 */}
      <View style={[s.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <Library size={20} color={'#D4A853'} />
        <Text style={[s.headerTitle, isRTL && { textAlign: 'right' }]}>{t?.libraryTitle}</Text>
        {__DEV__ && (
          <PressableOpacity
            style={s.epubBtn}
            onPress={() => navigation.navigate('EpubReaderSpike', {
              src: EPUB_SPIKE_SAMPLE_SRC,
              title: EPUB_SPIKE_SAMPLE_TITLE,
            })}
          >
            <Text style={s.epubBtnTxt}>EPUB</Text>
          </PressableOpacity>
        )}
        <PressableOpacity style={s.sortBtn} onPress={() => setShowSort(v => !v)}>
          <SlidersHorizontal size={16} color={'#8A8A9E'} />
        </PressableOpacity>
      </View>

      {/* 탭 */}
      <View style={[s.tabs, isRTL && { flexDirection: 'row-reverse' }]}>
        {(['library', 'updates'] as TabMode[]).map(k => (
          <PressableOpacity key={k} style={s.tabItem} onPress={() => setTab(k)}>
            <Text style={[s.tabTxt, tab === k && s.tabActive]}>
              {k === 'library' ? t?.tabMyLibrary : t?.tabUpdates}
            </Text>
            {tab === k && <View style={s.tabUnder} />}
          </PressableOpacity>
        ))}
      </View>

      {/* 정렬 드롭다운 */}
      {showSort && (
        <Animated.View entering={FadeIn.duration(150)} style={s.sortPanel}>
          {SORT_OPTIONS.map(({ key, label, icon: Icon }) => (
            <PressableOpacity key={key} style={[s.sortOption, sort === key && s.sortActive]} onPress={() => { setSort(key); setShowSort(false); }}>
              <Icon size={13} color={sort === key ? '#D4A853' : '#8A8A9E'} />
              <Text style={[s.sortTxt, sort === key && { color: '#D4A853' }]}>{label}</Text>
            </PressableOpacity>
          ))}
        </Animated.View>
      )}

      {/* 검색 */}
      <View style={[s.searchWrap, isRTL && { flexDirection: 'row-reverse' }]}>
        <Search size={14} color={'#797990'} />
        <TextInput
          style={[s.searchInput, isRTL && { textAlign: 'right' }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t?.searchPlaceholder}
          placeholderTextColor={'#757585'}
        />
        {!!search && (
          <PressableOpacity onPress={() => setSearch('')}>
            <X size={13} color={'#797990'} />
          </PressableOpacity>
        )}
      </View>

      {/* 본문 */}
      {libraryQuery.isLoading ? (
        <View style={s.loader}><ActivityIndicator color={'#D4A853'} /></View>
      ) : filtered.length === 0 ? (
        <EmptyState
          type="empty"
          title={tab === 'library' ? t?.emptyLibrary : t?.noUpdates}
          subtitle={tab === 'library' ? (t?.emptyLibraryHint ?? '') : ''}
        />
      ) : (
        <FlashList
          data={filtered ?? []}
          keyExtractor={(item: NovelCard) => item.id}
          renderItem={renderItem}
          estimatedItemSize={110}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listPad}
          refreshControl={
            <RefreshControl refreshing={libraryQuery.isRefetching} onRefresh={() => libraryQuery.refetch()} tintColor={'#D4A853'} />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, gap: 8 },
  headerTitle: { flex: 1, fontSize: 22, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.4 },
  epubBtn: {
    minWidth: 50,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.35)',
    backgroundColor: 'rgba(212,168,83,0.08)',
    paddingHorizontal: 12,
  },
  epubBtnTxt: {
    color: '#D4A853',
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.2,
  },
  sortBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#181820' },

  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#181820', marginBottom: 4 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabTxt: { fontSize: 14, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabActive: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabUnder: { position: 'absolute', bottom: 0, height: 2.5, width: 36, backgroundColor: '#D4A853', borderRadius: 2 },

  sortPanel: {
    position: 'absolute', top: 54 + 45, right: 16, zIndex: 100,
    backgroundColor: '#13131E', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#1E1E2E', overflow: 'hidden', elevation: 8 },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  sortActive: { backgroundColor: 'rgba(212,168,83,0.08)' },
  sortTxt: { fontSize: 14, color: '#A0A0B4', fontFamily: Typography.fontFamily.medium },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginBottom: 10, height: 42,
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, borderWidth: 1, borderColor: '#181820' },
  searchInput: { flex: 1, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular },
  listPad: { paddingHorizontal: 14, paddingBottom: 100 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' } });

// ── Novel Item Styles ───────────────────────────────────────────────────────
const ns = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#13131E' },
  cover: {
    width: 60, height: 88, borderRadius: 8, backgroundColor: '#1A1A2E',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', overflow: 'hidden', position: 'relative' },
  coverTxt: { fontSize: 26, fontFamily: Typography.fontFamily.extrabold, color: '#8B5CF6' },
  dlBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#8B5CF6', borderRadius: 4, padding: 2 },
  info: { flex: 1, gap: 4, justifyContent: 'center' },
  title: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  author: { fontSize: 11, color: '#797990', fontFamily: Typography.fontFamily.medium },
  desc: { fontSize: 12, color: '#6A6A84', fontFamily: Typography.fontFamily.regular, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 11, color: '#6A6A84', fontFamily: Typography.fontFamily.regular },
  progressMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressTxt: { fontSize: 9, color: '#8B5CF6', fontFamily: Typography.fontFamily.semibold, marginTop: 2 },
  lastReadRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lastReadTxt: { fontSize: 10, color: '#6F6F88', fontFamily: Typography.fontFamily.regular },
});

