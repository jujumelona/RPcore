
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/webnovel/WebNovelReaderScreen.tsx
// ?????????????????????????????????????????????????????????????????????????????
//  v3 ?꾩쟾??//  ??WebNovelEmotionStatusBar ?꾩쟾 ?곕룞 (濡쒖뺄 ?뚯꽕 ?꾩슜)
//    - ?ㅽ겕濡??꾩튂 ???꾩옱 ?⑤씫 ID 怨꾩궛 ??prefixEmotions[paraId] ?ㅼ떆媛?諛섏쁺
//    - ?⑤씫 ?덉씠?꾩썐 y醫뚰몴 痢≪젙?쇰줈 ?뺥솗??para?뭙motion 留ㅽ븨
//  ???쒕━利? ?먰뵾?뚮뱶 紐⑸줉 媛먯젙 ?곹깭 ?곗냽 ?쒖떆
//  ???몃Ъ?ъ쟾: ?앹꽦 ??梨꾩썙吏?CHAR ?꾨줈???꾩쟾 ?쒖떆
//  ???ъ빱??紐⑤뱶, ?ш컻 諛곕꼫, 踰≫꽣 寃??紐⑤몢 ?좎?
// ?????????????????????????????????????????????????????????????????????????????
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView,
  TouchableOpacity as RNTouchable, Platform, Share } from 'react-native';
import { SkiaChapterBurst } from '../../components/SkiaParticleSystem';
import type { ScreenProps } from '../../types/navigation';
import { appStorage } from '../../utils/storage';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import { SkeletonBox } from '../../components/ui/Skeleton';
import { Radius, Typography } from '../../constants/tokens';
import { ToastService } from '../../components/Toast';
import { useLanguageStore } from '../../store/languageStore';
import { authedFetch } from '../../utils/authedFetch';
import { ArrowLeft, ArrowRight, Heart, MessageCircle, Eye,
  Download, Check, Settings, Users, BookOpen, X, Clock, BookDown } from 'lucide-react-native';
import { vectorSearch } from '../../core/vector/VectorSearch';
import { NativeAdStrip, AD_IDS } from '../../components/ads/AdManager';
import { useShallow } from 'zustand/react/shallow';
import Animated, {
  FadeInUp, FadeIn, SlideInDown, FadeInDown, FadeOut, SlideInUp,
  useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { useReaderSettingsStore, READER_THEMES, type ReaderTheme } from '../../store/readerSettingsStore';
import { useReaderContextStore } from '../../store/readerContextStore';
import { useReadingStatsStore } from '../../store/readingStatsStore';
import { resolveStoredNovelEmotionSnapshot } from '../../reader/emotionLocator';
import { buildScrollReaderLocator } from '../../reader/scrollLocator';
import HighlightableText from '../../components/HighlightableText';
import { NovelReader } from '../../components/novel/NovelReader';
import { ReaderSettingsSheet } from '../../components/reader/ReaderSettingsSheet';
import { CharacterDictionarySheet, type NovelCharacter } from '../../components/reader/CharacterDictionarySheet';
import {
  NovelCompanionBar,
  type ParagraphItem,
  getNovelCompanionEnabled,
  setNovelCompanionEnabled,
} from '../../components/reader/NovelCompanionBar';
import { llamaEngine, modelDownloader } from '../../core/llama';
import { getUIPhrases } from '../../i18n/uiPhrases';
import type { WNEmotions, StoredWebNovel } from '../../utils/webNovelStorage';
import { getWebNovel, saveWebNovel } from '../../utils/webNovelStorage';
import { WebNovelEmotionPanel } from './WebNovelEmotionPanel';
import { WebNovelEmotionStatusBar } from './WebNovelEmotionStatusBar';
import { getDownloadedNovels, saveDownloadedNovel } from './DownloadedNovelsScreen';
import { exportNovelToEpub } from '../../utils/epubExport';

const DEFAULT_WEBNOVEL_SOURCE = 'community';

// ?????????????????????????????????????????????????????????????????????????????

interface WebNovelPost {
  id:            string;
  title:         string;
  content:       string;
  novel_content: string;
  author:        string;
  author_id:     string;
  created_at:    string;
  view_count:    number;
  like_count:    number;
  comment_count: number;
  tags:          string[];
  characters?:   NovelCharacter[];
  storyId?:      string;
  storedNovel?:  StoredWebNovel;
}

function removeDownloadedNovel(novelId: string): void {
  try {
    const next = getDownloadedNovels().filter(item => String(item.id) !== String(novelId));
    appStorage.set('@downloaded_novels', JSON.stringify(next));
  } catch {}
}

function normalizeWebNovelPost(raw: Partial<WebNovelPost> & Record<string, unknown>): WebNovelPost {
  return {
    id:            typeof raw.id            === 'string' ? raw.id            : '',
    title:         typeof raw.title         === 'string' ? raw.title         : '',
    content:       typeof raw.content       === 'string' ? raw.content       : '',
    novel_content: typeof raw.novel_content === 'string' ? raw.novel_content : '',
    author:        typeof raw.author        === 'string' ? raw.author        : '',
    author_id:     typeof raw.author_id     === 'string' ? raw.author_id     : '',
    created_at:    typeof raw.created_at    === 'string' ? raw.created_at    : '',
    view_count:    typeof raw.view_count    === 'number' ? raw.view_count    : 0,
    like_count:    typeof raw.like_count    === 'number' ? raw.like_count    : 0,
    comment_count: typeof raw.comment_count === 'number' ? raw.comment_count : 0,
    tags:          Array.isArray(raw.tags)   ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    characters:    Array.isArray(raw.characters) ? raw.characters as NovelCharacter[] : [],
    storyId:       typeof raw.storyId       === 'string' ? raw.storyId       : '',
    storedNovel:   raw.storedNovel as StoredWebNovel | undefined,
  };
}

function toFileSourceUri(path: string): string {
  const normalized = path.trim();
  if (/^[a-z]+:\/\//i.test(normalized)) return normalized;
  return `file://${normalized}`;
}

// ?? ?ш컻 諛곕꼫 ????????????????????????????????????????????????????????????????
function ResumeBanner({ percent, onResume, onDismiss, t }: {
  percent: number; onResume: () => void; onDismiss: () => void; t: Record<string, string | undefined>;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(400).springify()} style={rs.resumeBanner}>
      <BookOpen size={14} color="#D4A853" />
      <Text style={rs.resumeTxt}>{(t?.resumeReading ?? '').replace('{n}', String(Math.round(percent)))}</Text>
      <RNTouchable style={rs.resumeBtn} onPress={onResume}>
        <Text style={rs.resumeBtnTxt}>{t?.resumeMove}</Text>
      </RNTouchable>
      <RNTouchable onPress={onDismiss} style={rs.resumeDismiss}>
        <Text style={rs.resumeDismissTxt}>{t?.resumeClose}</Text>
      </RNTouchable>
    </Animated.View>
  );
}

// ?????????????????????????????????????????????????????????????????????????????
//  Main Screen
// ?????????????????????????????????????????????????????????????????????????????
export function WebNovelReaderScreen({ route, navigation }: ScreenProps<'WebNovelReader'>) {
  const routeParams = route.params as { novelId?: string; source?: string } | undefined;
  const postId      = routeParams?.novelId ?? '';
  const source      = routeParams?.source || DEFAULT_WEBNOVEL_SOURCE;
  const isLocal     = source === 'local';
  const isDownloaded= source === 'downloaded';

  const { t, isRTL, appLanguage } = useLanguageStore(
    useShallow(s => ({ t: s.t, isRTL: s.isRTL, appLanguage: s.appLanguage })),
  );

  const { settings, getProgress, saveProgress } = useReaderSettingsStore(
    useShallow(s => ({ settings: s.settings, getProgress: s.getProgress, saveProgress: s.saveProgress })),
  );
  const patchReaderContext = useReaderContextStore(s => s.patchSnapshot);
  const clearReaderContext = useReaderContextStore(s => s.clearSnapshot);
  const readerSnapshot = useReaderContextStore(s => (postId ? s.snapshots[postId] : undefined));
  const theme = READER_THEMES[settings.theme as ReaderTheme] ?? READER_THEMES.dark;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    try {
      const { NavigationBar } = require('expo-navigation-bar');
      NavigationBar.setBackgroundColorAsync(theme.bg).catch(() => {});
      NavigationBar.setButtonStyleAsync(settings.theme === 'white' ? 'dark' : 'light').catch(() => {});
    } catch {}
  }, [settings.theme, theme.bg]);

  const { startSession, endSession } = useReadingStatsStore(
    useShallow(s => ({ startSession: s.startSession, endSession: s.endSession })),
  );

  // ?? 媛먯젙 ?쒖뒪????????????????????????????????????????????????????????????
  const uiPhrases     = useMemo(() => getUIPhrases(appLanguage), [appLanguage]);
  const [showEmotionPanel, setShowEmotionPanel] = useState(false);
  const [showEmotionStatusBar, setShowEmotionStatusBar] = useState(true);
  const [companionEnabled, setCompanionEnabled] = useState(() => getNovelCompanionEnabled());
  const [companionAvailable, setCompanionAvailable] = useState(false);
  const [activeCompanionParagraphId, setActiveCompanionParagraphId] = useState<number | null>(null);
  const [selectedCompanionText, setSelectedCompanionText] = useState('');
  // ?꾩옱 ?⑤씫???대떦?섎뒗 媛먯젙 ?곹깭 (prefixEmotions[currentParaId])
  const [currentEmotions, setCurrentEmotions] = useState<Record<number, WNEmotions>>({});
  // ?댁쟾 ?⑤씫 媛먯젙 (罹먮┃???ъ쟾 ?명? 寃뚯씠吏??
  const [prevEmotions, setPrevEmotions]       = useState<Record<number, WNEmotions>>({});
  const currentEmotionsRef = useRef<Record<number, WNEmotions>>({});
  const lastParaIdForEmotionRef = useRef<number>(-1);
  const activeCompanionParagraphRef = useRef<number | null>(null);
  const selectedCompanionTextRef = useRef('');
  // ?쒖꽦 storedNovel (濡쒖뺄 ?꾩슜)
  const storedNovelRef = useRef<StoredWebNovel | null>(null);
  // ?⑤씫 y醫뚰몴 留? paraId ??y (ScrollView ?대? 湲곗?)
  const paraYMap = useRef<Map<number, number>>(new Map());

  // ?숇컲??諛??ㅽ겕濡??ㅽ봽??(throttle)
  const [scrollOffsetState, setScrollOffsetState] = useState(0);
  const lastCompanionScrollUpdateRef = useRef(0);

  // ?? ?곹깭 ?????????????????????????????????????????????????????????????????
  const [post,          setPost]          = useState<WebNovelPost | null>(null);
  const [episodes,      setEpisodes]      = useState<StoredWebNovel[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [liked,         setLiked]         = useState(false);
  const [saved,         setSaved]         = useState(isDownloaded || isLocal);
  const [chapterBurst,  setChapterBurst]  = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showChars,     setShowChars]     = useState(false);
  const [focusMode,     setFocusMode]     = useState(false);
  const [isExportingEpub, setIsExportingEpub] = useState(false);
  const [showResume,    setShowResume]    = useState(false);
  const [resumePercent, setResumePercent] = useState(0);
  const [searchResults,    setSearchResults]    = useState<any[]>([]);
  const [_isSearching,     setIsSearching]      = useState(false);
  const [originalPosition, setOriginalPosition] = useState<number | null>(null);
  const localSavedNovelId = postId ? `community_local_${postId}` : '';

  // ?? refs ?????????????????????????????????????????????????????????????????
  const scrollRef       = useRef<ScrollView>(null);
  const contentHeight   = useRef(0);
  const scrollHeight    = useRef(0);
  const currentOffset   = useRef(0);
  const saveTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordCount       = useRef(0);
  const isMountedRef    = useRef(true);
  const missingRef      = useRef(false);
  const episodeOffsets  = useRef<Record<string, number>>({});

  const scrollProgress  = useSharedValue(0);
  const uiOpacity       = useSharedValue(1);
  const uiStyle         = useAnimatedStyle(() => ({ opacity: uiOpacity.value }));
  activeCompanionParagraphRef.current = activeCompanionParagraphId;
  selectedCompanionTextRef.current = selectedCompanionText;

  useEffect(() => {
    if (isLocal) {
      setSaved(true);
      return;
    }
    if (!postId) {
      setSaved(isDownloaded);
      return;
    }
    const alreadySaved = isDownloaded
      ? getDownloadedNovels().some(item => String(item.id) === String(postId))
      : !!getWebNovel(localSavedNovelId);
    setSaved(isDownloaded || alreadySaved);
  }, [isDownloaded, isLocal, localSavedNovelId, postId]);

  // ?? ?ъ빱??紐⑤뱶 ??????????????????????????????????????????????????????????
  const toggleFocus = useCallback(() => {
    const next = !focusMode;
    setFocusMode(next);
    uiOpacity.value = withTiming(next ? 0 : 1, { duration: 250 });
  }, [focusMode, uiOpacity]);

  const findActiveParagraphIdForOffset = useCallback((offsetY: number): number | null => {
    let bestParaId = -1;
    let bestY = -1;

    paraYMap.current.forEach((y, paraId) => {
      if (y <= offsetY + scrollHeight.current * 0.6 && y > bestY) {
        bestY = y;
        bestParaId = paraId;
      }
    });

    return bestParaId >= 0 ? bestParaId : null;
  }, []);

  // ?? ?ㅽ겕濡????꾩옱 ?⑤씫 ??媛먯젙 ?낅뜲?댄듃 ??????????????????????????????????
  const updateEmotionsFromScroll = useCallback((offsetY: number): number | null => {
    const bestParaId = findActiveParagraphIdForOffset(offsetY);
    return bestParaId;
  }, [findActiveParagraphIdForOffset]);

  // ?? ?ш컻 ?????????????????????????????????????????????????????????????????
  const restoreScroll = useCallback(() => {
    if (!postId) return;
    const prog = getProgress(postId);
    if (prog && prog.scrollOffset > 50) {
      const total = contentHeight.current - scrollHeight.current;
      const pct   = total > 0 ? (prog.scrollOffset / total) * 100 : 0;
      if (pct > 2) { setResumePercent(pct); setShowResume(true); }
    }
  }, [postId, getProgress]);

  const doResume = useCallback(() => {
    if (!postId) return;
    const prog = getProgress(postId);
    if (prog) scrollRef.current?.scrollTo({ y: prog.scrollOffset, animated: true });
    setShowResume(false);
  }, [postId, getProgress]);

  const progressBarStyle = useAnimatedStyle(() => ({ width: `${scrollProgress.value * 100}%` }));

  const headerOpacity    = useSharedValue(0);
  const animHeaderStyle  = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));

  const invalidMsg = t?.invalidAccess ?? t?.errorOccurred ?? t?.error ?? '';
  const genericErrorMessage = t?.errorOccurred ?? t?.error ?? '';
  const searchErrorMessage = t?.searchError ?? genericErrorMessage;

  // ?? ?숇컲??諛붿슜 ?꾩껜 臾몃떒 ?섏쭛 ?????????????????????????????????????????????
  const allParagraphs = useMemo((): ParagraphItem[] => {
    if (isLocal && episodes.length > 0) {
      return episodes.flatMap(ep => ep.paragraphs.map(p => ({ id: p.id, text: p.text })));
    }
    if (post) {
      const raw = post.novel_content || '';
      return raw.split(/\n\n+/).filter(Boolean).map((text, i) => ({ id: i, text }));
    }
    return [];
  }, [isLocal, episodes, post]);

  const getParagraphTextById = useCallback((paragraphId: number | null | undefined): string | undefined => {
    if (typeof paragraphId !== 'number') return undefined;
    return allParagraphs.find(item => item.id === paragraphId)?.text;
  }, [allParagraphs]);

  const syncActiveCompanionParagraph = useCallback((paragraphId: number | null) => {
    const paragraphChanged = activeCompanionParagraphRef.current !== paragraphId;

    activeCompanionParagraphRef.current = paragraphId;
    setActiveCompanionParagraphId(prev => (prev === paragraphId ? prev : paragraphId));

    if (paragraphChanged && selectedCompanionTextRef.current) {
      selectedCompanionTextRef.current = '';
      setSelectedCompanionText('');
    }
  }, []);

  const publishReaderContext = useCallback((offsetY: number, totalH: number, visibleH: number) => {
    if (!postId) return null;

    const paragraphId = findActiveParagraphIdForOffset(offsetY);
    const locator = buildScrollReaderLocator({
      bookId: postId,
      chapterIndex: 0,
      offsetY,
      contentHeight: totalH,
      viewportHeight: visibleH,
      paragraphId: paragraphId ?? undefined,
    });
    syncActiveCompanionParagraph(paragraphId);

    patchReaderContext(postId, {
      locator,
      chapterId: locator.chapterId,
      paragraphId: paragraphId ?? undefined,
      paragraphText: getParagraphTextById(paragraphId),
      selectedText: selectedCompanionTextRef.current || undefined,
      updatedAt: Date.now(),
    });

    return locator;
  }, [
    findActiveParagraphIdForOffset,
    getParagraphTextById,
    patchReaderContext,
    postId,
    syncActiveCompanionParagraph,
  ]);

  // ?? ?ㅽ겕濡??몃뱾???????????????????????????????????????????????????????????
  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const offsetY  = e.nativeEvent.contentOffset.y;
      const totalH   = e.nativeEvent.contentSize.height;
      const visibleH = e.nativeEvent.layoutMeasurement.height;
      const max      = totalH - visibleH;

      currentOffset.current = offsetY;
      contentHeight.current = totalH;
      scrollHeight.current  = visibleH;
      scrollProgress.value  = max > 0 ? Math.min(1, offsetY / max) : 0;
      const activeParagraphId = isLocal
        ? updateEmotionsFromScroll(offsetY)
        : findActiveParagraphIdForOffset(offsetY);
      if (isLocal) {
        syncActiveCompanionParagraph(activeParagraphId);
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (postId) {
          const locator = buildScrollReaderLocator({
            bookId: postId,
            chapterIndex: 0,
            offsetY,
            contentHeight: totalH,
            viewportHeight: visibleH,
            paragraphId: activeParagraphId ?? undefined,
          });
          saveProgress({
            novelId: postId,
            chapterIndex: 0,
            scrollOffset: offsetY,
            totalChapters: 1,
            lastReadAt: Date.now(),
            locator,
          });
        }
      }, 300);

      const now = Date.now();
      if (now - lastCompanionScrollUpdateRef.current > 500) {
        lastCompanionScrollUpdateRef.current = now;
        setScrollOffsetState(offsetY);
        publishReaderContext(offsetY, totalH, visibleH);
      }
    },
    [
      findActiveParagraphIdForOffset,
      isLocal,
      postId,
      publishReaderContext,
      saveProgress,
      scrollProgress,
      syncActiveCompanionParagraph,
      updateEmotionsFromScroll,
    ],
  );

  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  // ?? ?곗씠??濡쒕뱶 ???????????????????????????????????????????????????????????
  const fetchPost = useCallback(async () => {
    if (!postId) return;
    const { getWebNovelsByStory, getWebNovel } = require('../../utils/webNovelStorage');

    // 1. 濡쒖뺄 ?뚯꽕
    if (isLocal) {
      try {
        const currentNovel: StoredWebNovel | null = getWebNovel(postId);
        if (currentNovel && isMountedRef.current) {
          storedNovelRef.current = currentNovel;

          // 珥덇린 媛먯젙: prefixEmotions[-1] ?먮뒗 initialEmotions
          const initSlot = currentNovel.prefixEmotions?.[-1] ?? {};
          setCurrentEmotions(initSlot);

          const storyNovels: StoredWebNovel[] = getWebNovelsByStory(currentNovel.storyId);
          const sorted = storyNovels.sort((a: StoredWebNovel, b: StoredWebNovel) =>
            (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
          setEpisodes(sorted);

          setPost(normalizeWebNovelPost({
            id:            currentNovel.id,
            title:         currentNovel.title,
            novel_content: currentNovel.paragraphs.map(p => p.text).join('\n\n'),
            characters:    currentNovel.characters as unknown as NovelCharacter[],
            created_at:    new Date(currentNovel.createdAt).toISOString(),
            storyId:       currentNovel.storyId,
            storedNovel:   currentNovel,
          }));
        }
      } catch (err) {
        console.error('Local fetch error:', err);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
      return;
    }

    // 2. ?ㅼ슫濡쒕뱶???뚯꽕
    if (isDownloaded) {
      try {
        const found = getDownloadedNovels().find((item) => String(item.id) === String(postId));
        if (found && isMountedRef.current) {
          setPost(normalizeWebNovelPost({
            id: found.id, title: found.title,
            content: found.preview ?? '',
            novel_content: found.novelContent ?? '',
            author: found.authorName ?? '', author_id: '',
            created_at: new Date(found.downloadedAt).toISOString(),
            view_count: 0, like_count: 0, comment_count: 0,
            tags: [], characters: Array.isArray(found.characters) ? found.characters as NovelCharacter[] : [],
            storyId: found.storyId,
          }));
        } else if (isMountedRef.current) {
          ToastService.error(genericErrorMessage);
          safeGoBack();
        }
      } catch {
        if (isMountedRef.current) safeGoBack();
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
      return;
    }

    // 3. ?쒕쾭 ?뚯꽕
    try {
      const response = await authedFetch(`/community/posts/${postId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!isMountedRef.current) return;
      if (data.post) {
        setPost(normalizeWebNovelPost(data.post as Partial<WebNovelPost> & Record<string, unknown>));
      } else {
        ToastService.error(genericErrorMessage);
        safeGoBack();
      }
    } catch (error) {
      console.error('Failed to fetch post:', error);
      if (!isMountedRef.current) return;
      ToastService.error(genericErrorMessage);
      safeGoBack();
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [postId, isDownloaded, isLocal, t, safeGoBack]);

  // ?? 踰≫꽣 寃??????????????????????????????????????????????????????????????
  const handleSearchContext = useCallback(async (query: string) => {
    if (!post) return;
    setSelectedCompanionText(query);
    selectedCompanionTextRef.current = query;
    if (postId) {
      patchReaderContext(postId, {
        paragraphId: activeCompanionParagraphRef.current ?? undefined,
        paragraphText: getParagraphTextById(activeCompanionParagraphRef.current),
        selectedText: query,
        updatedAt: Date.now(),
      });
    }
    setIsSearching(true);
    setOriginalPosition(currentOffset.current);
    try {
      const results = await vectorSearch.search(query, 5, 0.4, { storyId: post.storyId });
      setSearchResults(results.filter(r => r.text !== query));
    } catch {
      ToastService.error(t?.searchError ?? genericErrorMessage);
    } finally {
      setIsSearching(false);
    }
  }, [getParagraphTextById, patchReaderContext, post, postId, t]);

  const jumpToText = useCallback((text: string) => {
    const targetEp = episodes.find(ep => {
      const content = ep.paragraphs.map(p => p.text).join('\n\n').toLowerCase();
      return content.includes(text.toLowerCase());
    });
    if (targetEp) {
      const offset = episodeOffsets.current[targetEp.id];
      if (offset !== undefined) scrollRef.current?.scrollTo({ y: offset, animated: true });
      setSearchResults([]);
    } else if (post) {
      const content = (post.novel_content || '').toLowerCase();
      if (content.includes(text.toLowerCase())) scrollRef.current?.scrollTo({ y: 0, animated: true });
      setSearchResults([]);
    }
  }, [episodes, post]);

  const returnToOriginal = useCallback(() => {
    if (originalPosition !== null) {
      scrollRef.current?.scrollTo({ y: originalPosition, animated: true });
      setOriginalPosition(null);
    }
  }, [originalPosition]);

  const checkLiked = useCallback(async () => {
    if (!postId || isDownloaded || isLocal) return;
    try {
      const response = await authedFetch(`/community/posts/${postId}/liked`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (isMountedRef.current) setLiked(data.liked);
    } catch {}
  }, [postId, isDownloaded, isLocal]);

  // ?? 留덉슫??/ ?몃쭏?댄듃 ????????????????????????????????????????????????????
  useEffect(() => {
    if (!postId) return;
    isMountedRef.current = true;
    fetchPost();
    checkLiked();
    const chapterId = `webnovel-${postId}`;
    startSession(postId, chapterId);
    
    setCompanionAvailable(false);
    if (companionEnabled) {
      const loadModelForCompanion = async () => {
        try {
          const isDownloaded = await modelDownloader.isModelDownloaded('gemma-3-270m').catch(() => false);
          if (!isDownloaded) {
            console.log('[WebNovelReader] 270M model not downloaded - companion disabled for this session');
            if (isMountedRef.current) setCompanionAvailable(false);
            return;
          }

          const loadedModelId = llamaEngine.getLoadedModelId();
          if (loadedModelId !== 'gemma-3-270m') {
            console.log('[WebNovelReader] Switching to 270M model (current:', loadedModelId, ')');
            await llamaEngine.load('gemma-3-270m', true);
            console.log('[WebNovelReader] 270M model loaded successfully');
          } else {
            console.log('[WebNovelReader] 270M model already loaded');
          }
          if (isMountedRef.current) setCompanionAvailable(true);
        } catch (err) {
          console.error('[WebNovelReader] Failed to load 270M model:', err);
          if (isMountedRef.current) setCompanionAvailable(false);
        }
      };
      loadModelForCompanion();
    }
    
    return () => {
      isMountedRef.current = false;
      if (saveTimer.current)    clearTimeout(saveTimer.current);
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      clearReaderContext(postId);
      endSession(wordCount.current);
    };
  }, [postId, fetchPost, checkLiked, startSession, endSession, companionEnabled, clearReaderContext]);

  useEffect(() => {
    if (restoreTimer.current) { clearTimeout(restoreTimer.current); restoreTimer.current = null; }
    if (!loading && post) {
      const safe = typeof post.novel_content === 'string' ? post.novel_content : '';
      wordCount.current = safe.split(/\s+/).filter(Boolean).length;
      restoreTimer.current = setTimeout(() => {
        restoreTimer.current = null;
        restoreScroll();
        publishReaderContext(currentOffset.current, contentHeight.current, scrollHeight.current);
      }, 600);
    }
    return () => { if (restoreTimer.current) { clearTimeout(restoreTimer.current); restoreTimer.current = null; } };
  }, [loading, post, publishReaderContext, restoreScroll]);

  useEffect(() => {
    if (postId || missingRef.current) return;
    missingRef.current = true;
    ToastService.error(invalidMsg);
    safeGoBack();
  }, [postId, invalidMsg, safeGoBack]);

  // ?? ?≪뀡 ?????????????????????????????????????????????????????????????????
  const handleLike = async () => {
    if (!postId) { ToastService.error(invalidMsg); return; }
    try {
      const response = await authedFetch(`/community/posts/${postId}/like`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLiked(data.liked);
      if (post) {
        const serverCount = data.likeCount ?? data.like_count;
        const newCount = typeof serverCount === 'number' ? serverCount : post.like_count + (data.liked ? 1 : -1);
        setPost({ ...post, like_count: newCount });
      }
    } catch { ToastService.error(genericErrorMessage); }
  };

  const handleSave = useCallback(() => {
    if (!post) return;
    try {
      if (!isDownloaded && !isLocal) {
        const existingLocal = getWebNovel(localSavedNovelId);
        if (!existingLocal) {
          const paragraphs = (post.novel_content || post.content || '')
            .split(/\n\n+/)
            .map(text => text.trim())
            .filter(Boolean)
            .map((text, index) => ({ id: index, text }));

          const safeParagraphs = paragraphs.length > 0
            ? paragraphs
            : [{ id: 0, text: (post.content || post.title || '').trim() }];

          const characters = (Array.isArray(post.characters) ? post.characters : [])
            .map((char) => {
              const numericId = Number(char?.id);
              if (!Number.isFinite(numericId)) return null;
              return {
                ...char,
                id: numericId,
              };
            })
            .filter((char): char is NonNullable<typeof char> => char !== null);
          const initialEmotions: Record<number, { e1: number; e2: number; e3: number; e4: number; e5: number }> = {};
          for (const char of characters) {
            if (typeof char?.id !== 'number') continue;
            initialEmotions[char.id] = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
          }

          saveWebNovel({
            id: localSavedNovelId,
            storyId: post.storyId || post.id,
            title: post.title,
            createdAt: Date.parse(post.created_at || '') || Date.now(),
            paragraphs: safeParagraphs,
            emotionData: {},
            initialEmotions,
            characters,
          });
        }
        setSaved(true);
        ToastService.success(t?.saved ?? '');
        navigation.navigate('MyWebNovels');
        return;
      }

      const already = getDownloadedNovels().some(item => String(item.id) === String(post.id));
      if (!already) {
        saveDownloadedNovel({
          id: post.id, title: post.title, authorName: post.author,
          preview: post.content?.slice(0, 100) ?? '',
          novelContent: post.novel_content,
          characters: post.characters ?? [],
          downloadedAt: Date.now(), storyId: post.storyId,
        });
        setSaved(true);
        ToastService.success(t?.downloadedNovels ?? '');
      } else {
        removeDownloadedNovel(post.id);
        setSaved(false);
        ToastService.info(t?.deleteSuccessToast ?? '');
      }
    } catch {}
  }, [isDownloaded, isLocal, localSavedNovelId, navigation, post, t]);

  const handleLocalShare = useCallback(() => {
    if (!post) return;
    const preview = (post.content || post.novel_content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    navigation.navigate('WriteNovelPost', { novelId: post.id, novelTitle: post.title, novelPreview: preview });
  }, [navigation, post]);

  const exportCurrentNovelAsEpub = useCallback(async () => {
    if (!post || isExportingEpub) return null;

    setIsExportingEpub(true);
    try {
      const exportedPath = await exportNovelToEpub({
        title: post.title,
        author: post.author || 'Unknown',
        content: post.novel_content || '',
        language: appLanguage,
      });

      if (!exportedPath) {
        ToastService.info(t?.downloadNovel ?? '');
        return null;
      }

      return {
        path: exportedPath,
        source: toFileSourceUri(exportedPath),
      };
    } finally {
      setIsExportingEpub(false);
    }
  }, [appLanguage, isExportingEpub, post, t]);

  const handleReaderShare = useCallback(async () => {
    if (isLocal) {
      handleLocalShare();
      return;
    }

    const exported = await exportCurrentNovelAsEpub();
    if (!exported || !post) return;

    try {
      await Share.share({
        title: post.title,
        message: `${post.title} ??RPcore`,
        url: exported.source,
      });
    } catch {}
  }, [exportCurrentNovelAsEpub, handleLocalShare, isLocal, post]);

  const handleOpenInEpub = useCallback(async () => {
    if (!post) return;

    const exported = await exportCurrentNovelAsEpub();
    if (!exported) return;

    navigation.navigate('EpubReaderSpike', {
      bookId: `epub-export:${post.id}`,
      src: exported.source,
      title: post.title,
    });
  }, [exportCurrentNovelAsEpub, navigation, post]);

  const handleCompanionEnabledChange = useCallback((next: boolean) => {
    setNovelCompanionEnabled(next);
    setCompanionEnabled(next);
    if (!next) {
      setCompanionAvailable(false);
      llamaEngine.stopGeneration().catch(() => {});
    }
  }, []);

  const activeStoredNovel = isLocal ? (post?.storedNovel ?? storedNovelRef.current ?? null) : null;

  const emotionSnapshot = useMemo(
    () => resolveStoredNovelEmotionSnapshot(
      activeStoredNovel,
      readerSnapshot,
      activeCompanionParagraphId,
    ),
    [activeCompanionParagraphId, activeStoredNovel, readerSnapshot],
  );

  useEffect(() => {
    if (!isLocal) return;

    const nextParagraphId = emotionSnapshot.paragraphId ?? -1;
    const nextEmotions = emotionSnapshot.emotions;

    if (nextParagraphId !== lastParaIdForEmotionRef.current) {
      setPrevEmotions(currentEmotionsRef.current);
      currentEmotionsRef.current = nextEmotions;
      lastParaIdForEmotionRef.current = nextParagraphId;
    }

    setCurrentEmotions(prev => (prev === nextEmotions ? prev : nextEmotions));
  }, [emotionSnapshot, isLocal]);

  // ?? Guards ????????????????????????????????????????????????????????????????
  if (!postId) {
    return (
      <View style={[g.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} translucent={false} />
        <View style={g.guard}><Text style={[g.guardText, { color: theme.text }]}>{invalidMsg}</Text></View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[g.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} translucent={false} />
        <View style={g.header}>
          <TouchableOpacity style={g.backBtn} onPress={() => navigation.goBack()}>
            {isRTL ? <ArrowRight size={22} color={theme.text} /> : <ArrowLeft size={22} color={theme.text} />}
          </TouchableOpacity>
        </View>
        <View style={g.skeletonPad}>
          <SkeletonBox w="80%" h={28} style={{ marginBottom: 12 }} />
          <SkeletonBox w="40%" h={14} style={{ marginBottom: 28 }} />
          {[100, 100, 80, 100, 90, 100, 70].map((w, i) => (
            <SkeletonBox key={i} w={`${w}%`} h={14} style={{ marginBottom: 10 }} />
          ))}
        </View>
      </View>
    );
  }

  if (!post) return null;

  const formattedDate = post.created_at
    ? new Date(post.created_at).toLocaleDateString(appLanguage, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const postTags       = Array.isArray(post.tags)       ? post.tags       : [];
  const postCharacters = Array.isArray(post.characters) ? post.characters : [];
  const safeContent    = typeof post.novel_content === 'string' ? post.novel_content : '';
  const hasCharacters  = postCharacters.length > 0;

  // 濡쒖뺄 ?쒕━利? storedNovel 罹먮┃??紐⑸줉 (媛먯젙諛붿슜)
  const storedChars = activeStoredNovel?.characters ?? [];
  const hasEmotions = isLocal && storedChars.length > 0 && storedChars.some(c => c.id >= 2);
  const emotionBasisLabel = hasEmotions
    ? typeof emotionSnapshot.paragraphId === 'number' && emotionSnapshot.paragraphId >= 0
      ? `${uiPhrases.readingBasisPrefix}: ${uiPhrases.readingBasisParagraph} ${emotionSnapshot.paragraphId + 1}`
      : uiPhrases.emotionDockSubtitle
    : undefined;

  const contentTextStyle = {
    fontSize:       settings.fontSize,
    lineHeight:     settings.fontSize * settings.lineHeight,
    letterSpacing:  0.2,
    fontFamily:     settings.fontFamily,
    color:          theme.text,
    marginBottom:   settings.paragraphSpacing,
  };

  // ?? ?뚮뜑 ?????????????????????????????????????????????????????????????????
  return (
    <View style={[g.container, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle={settings.theme === 'white' ? 'dark-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
      />

      <SkiaChapterBurst trigger={chapterBurst} onComplete={() => setChapterBurst(false)} />

      {/* 吏꾪뻾 諛?*/}
      <View style={[g.progressTrack, { backgroundColor: theme.secondary + '20' }]}>
        <Animated.View style={[g.progressFill, progressBarStyle]} />
      </View>

      {/* ?ъ빱??紐⑤뱶 ?좉? ?ㅻ쾭?덉씠 */}
      <RNTouchable style={StyleSheet.absoluteFill} activeOpacity={1} onPress={toggleFocus} />

      {/* UI ?덉씠??*/}
      <Animated.View style={[StyleSheet.absoluteFill, uiStyle, { pointerEvents: focusMode ? 'none' : 'box-none' }]}>

        {/* Sticky ?ㅻ뜑 */}
        <Animated.View style={[g.stickyHeader, animHeaderStyle, { backgroundColor: theme.bg }]}>
          <Text style={[g.stickyTitle, { color: theme.text }]} numberOfLines={1}>{post.title}</Text>
        </Animated.View>

        {/* ?곷떒 ?ㅻ뜑 */}
        <Animated.View entering={FadeInUp.springify()} style={[g.header, { backgroundColor: theme.bg }]}>
          <View style={g.headerLeft}>
            <TouchableOpacity style={g.backBtn} onPress={() => navigation.goBack()}>
              {isRTL ? <ArrowRight size={22} color={theme.text} /> : <ArrowLeft size={22} color={theme.text} />}
            </TouchableOpacity>
            {isLocal && (
              <TouchableOpacity
                style={[g.aiToggleBtn, companionEnabled && g.aiToggleBtnActive]}
                onPress={() => handleCompanionEnabledChange(!companionEnabled)}
              >
                <Text style={[g.aiToggleTxt, { color: companionEnabled ? '#D4A853' : theme.secondary }]}>AI</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={g.headerRight}>
            {!isLocal && (
              <View style={g.headerMeta}>
                <Eye size={13} color={theme.secondary} />
                <Text style={[g.headerMetaTxt, { color: theme.secondary }]}>{post.view_count}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[g.iconBtn, hasCharacters && g.iconBtnActive]}
              onPress={() => setShowChars(true)}
            >
              <Users size={17} color={hasCharacters ? '#D4A853' : theme.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[g.iconBtn, isExportingEpub && { opacity: 0.55 }]}
              onPress={handleOpenInEpub}
              disabled={isExportingEpub}
            >
              <BookDown size={17} color={theme.secondary} />
            </TouchableOpacity>
            <TouchableOpacity style={g.iconBtn} onPress={() => setShowSettings(true)}>
              <Settings size={17} color={theme.secondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* 寃??寃곌낵 */}
        {searchResults.length > 0 && (
          <Animated.View entering={SlideInUp} exiting={FadeOut} style={g.searchOverlay}>
            <View style={[g.searchHeader, { backgroundColor: theme.bg }]}>
              <Text style={[g.searchText, { color: theme.text }]}>
                {`${t?.searchResults ?? ''} (${searchResults.length})`}
              </Text>
              <TouchableOpacity onPress={() => setSearchResults([])}>
                <X size={18} color={theme.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.searchScroll}>
              {searchResults.map((res, i) => (
                <TouchableOpacity
                  key={i}
                  style={[g.searchCard, { backgroundColor: theme.secondary + '15', borderColor: theme.secondary + '30' }]}
                  onPress={() => jumpToText(res.text)}
                >
                  <Text style={[g.searchCardTxt, { color: theme.text }]} numberOfLines={3}>{res.text}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ?먮옒 ?꾩튂濡?*/}
        {originalPosition !== null && searchResults.length === 0 && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={g.returnBox}>
            <TouchableOpacity style={[g.returnBtn, { backgroundColor: '#D4A853' }]} onPress={returnToOriginal}>
              <Clock size={16} color="#000" />
              <Text style={g.returnBtnTxt}>{t?.returnToOriginal ?? ''}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* 愿묎퀬 */}
        {!isLocal && <NativeAdStrip adUnitId={AD_IDS.NATIVE_WEBNOVEL} />}

        {hasEmotions && (
          <WebNovelEmotionStatusBar
            characters={storedChars}
            currentEmotions={currentEmotions}
            visible={showEmotionStatusBar}
            onToggle={() => setShowEmotionStatusBar(prev => !prev)}
            tier="mid"
            phrases={uiPhrases}
            basisLabel={emotionBasisLabel}
          />
        )}

        {/* ?섎떒 ?≪뀡 諛?*/}
        <Animated.View
          entering={SlideInDown.delay(200).springify()}
          style={[
            g.actionBar,
            {
              backgroundColor: theme.bg,
              borderTopColor: theme.secondary + '20',
              bottom: Platform.OS === 'android' ? 16 : 0,
              display: isLocal ? 'none' : 'flex',
            },
          ]}
        >
          {!isLocal && (
            <>
              {!isDownloaded && (
                <TouchableOpacity style={[g.actionBtn, liked && g.actionBtnActive]} onPress={handleLike}>
                  <Heart size={18} color={liked ? '#FF5555' : theme.secondary} fill={liked ? '#FF5555' : 'none'} />
                  <Text style={[g.actionTxt, { color: theme.secondary }, liked && { color: '#FF5555' }]}>{post.like_count}</Text>
                </TouchableOpacity>
              )}
              {!isDownloaded && (
                <TouchableOpacity style={g.actionBtn} onPress={() => navigation.navigate('CommunityPostDetail', { postId: post.id })}>
                  <MessageCircle size={18} color={theme.secondary} />
                  <Text style={[g.actionTxt, { color: theme.secondary }]}>{post.comment_count}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[g.actionBtn, saved && g.actionBtnActive]} onPress={handleSave}>
                {saved ? <Check size={18} color="#D4A853" /> : <Download size={18} color={theme.secondary} />}
                <Text style={[g.actionTxt, { color: theme.secondary }, saved && { color: '#D4A853' }]}>
                  {saved ? (t?.saved ?? '') : (t?.downloadNovel ?? '')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </Animated.View>

      {/* 蹂몃Ц ?ㅽ겕濡?*/}
      <ScrollView
        ref={scrollRef}
        style={[g.scroll, { marginTop: 88 }]}
        contentContainerStyle={[
          g.scrollContent,
          { paddingBottom: isLocal ? 96 : 160 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(_, h) => { contentHeight.current = h; }}
        onLayout={e => { scrollHeight.current = e.nativeEvent.layout.height; }}
      >
        {showResume && (
          <ResumeBanner percent={resumePercent} onResume={doResume} onDismiss={() => setShowResume(false)} t={t} />
        )}

        {/* ?쒕ぉ */}
        <Animated.View entering={FadeInUp.delay(100).springify()}>
          <Text style={[g.novelTitle, { color: theme.text }, isRTL && g.right]}>{post.title}</Text>
        </Animated.View>

        {/* ???+ ?좎쭨 */}
        {!isLocal && (
          <Animated.View entering={FadeInUp.delay(150).springify()} style={[g.metaRow, isRTL && g.rtl]}>
            <Text style={[g.authorTxt, { color: theme.secondary }]}>{`@${post.author}`}</Text>
            {!!formattedDate && <Text style={[g.dateTxt, { color: theme.secondary }]}>{formattedDate}</Text>}
          </Animated.View>
        )}

        {/* ?쒓렇 */}
        {!isLocal && postTags.length > 0 && (
          <Animated.View entering={FadeInUp.delay(180).springify()} style={g.tagRow}>
            {postTags.map((tag, idx) => (
              <View key={idx} style={g.tag}>
                <Text style={g.tagTxt}>#{tag}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* 援щ텇??*/}
        <Animated.View entering={FadeIn.delay(200).duration(400)} style={g.divider}>
          <LinearGradient
            colors={['transparent', 'rgba(212,168,83,0.30)', 'transparent']}
            start={[0, 0]} end={[1, 0]}
            style={{ height: 1, width: '100%' }}
          />
        </Animated.View>

        {/* ?? 蹂몃Ц: ?쒕━利?濡쒖뺄) ?? */}
        {isLocal && episodes.length > 1 ? (
          episodes.map((ep, idx) => (
            <Animated.View
              key={ep.id}
              entering={FadeInUp.delay(240 + idx * 50).springify()}
              style={{ marginBottom: 40 }}
              onLayout={e => { episodeOffsets.current[ep.id] = e.nativeEvent.layout.y; }}
            >
              <View style={[g.episodeHeader, { borderColor: theme.secondary + '30' }]}>
                <Text style={[g.episodeSmallTitle, { color: theme.text }]}>{ep.title}</Text>
              </View>

              {/* ?⑤씫蹂??덉씠?꾩썐 痢≪젙 ??paraYMap */}
              {ep.paragraphs.map(para => (
                <View
                  key={para.id}
                  onLayout={e => {
                    // episodes[0] 留?媛먯젙 異붿쟻 (?꾩옱 ep 湲곗?)
                    if (ep.id === (storedNovelRef.current?.id ?? '')) {
                      paraYMap.current.set(para.id, e.nativeEvent.layout.y + (episodeOffsets.current[ep.id] ?? 0));
                    }
                  }}
                >
                  <HighlightableText
                    text={para.text}
                    novelId={ep.id}
                    chapterId={ep.id}
                    style={contentTextStyle}
                    onSearchContext={handleSearchContext}
                  />
                </View>
              ))}

              {idx < episodes.length - 1 && (
                <View style={g.episodeDivider}>
                  <Text style={{ color: theme.secondary, fontSize: 10, opacity: 0.5 }}>{'······'}</Text>
                </View>
              )}
            </Animated.View>
          ))
        ) : isLocal && episodes.length === 1 ? (
          // ?⑦렪 濡쒖뺄
          <Animated.View entering={FadeInUp.delay(240).springify()}>
            {episodes[0]?.paragraphs.map(para => (
              <View
                key={para.id}
                onLayout={e => { paraYMap.current.set(para.id, e.nativeEvent.layout.y); }}
              >
                <HighlightableText
                  text={para.text}
                  novelId={post.id}
                  chapterId={`webnovel-${post.id}`}
                  style={contentTextStyle}
                  onSearchContext={handleSearchContext}
                />
              </View>
            ))}
          </Animated.View>
        ) : (
          // ?쒕쾭 / ?ㅼ슫濡쒕뱶 ?뚯꽕
          <Animated.View entering={FadeInUp.delay(240).springify()}>
            <NovelReader 
              content={safeContent} 
              highlightedText={selectedCompanionText} 
              onAnnotate={handleSearchContext} 
            />
          </Animated.View>
        )}
      </ScrollView>

      {/* ?ㅼ젙 ?쒗듃 */}
      <ReaderSettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onShare={handleReaderShare}
        themeColors={theme}
      />

      {/* ?몃Ъ?ъ쟾 ?쒗듃 */}
      <CharacterDictionarySheet
        visible={showChars}
        onClose={() => setShowChars(false)}
        characters={postCharacters}
        novelTitle={post.title}
        liveEmotions={isLocal ? currentEmotions : undefined}
        prevLiveEmotions={isLocal ? prevEmotions : undefined}
        themeColors={theme}
      />

      {hasEmotions && (
        <WebNovelEmotionPanel
          visible={showEmotionPanel}
          onToggle={() => setShowEmotionPanel(prev => !prev)}
          characters={storedChars}
          currentEmotions={currentEmotions}
          phrases={uiPhrases}
          title={uiPhrases.emotionDockTitle}
          subtitle={emotionBasisLabel}
          theme={theme}
        />
      )}

      {companionEnabled && companionAvailable && (
        <NovelCompanionBar
          paragraphs={allParagraphs}
          paraYMap={paraYMap}
          scrollOffset={scrollOffsetState}
          viewportH={scrollHeight.current}
          appLanguage={appLanguage}
          novelLanguage={undefined}
          currentParagraphId={activeCompanionParagraphId}
          selectedText={selectedCompanionText}
          enabled={true}
          onEnabledChange={handleCompanionEnabledChange}
        />
      )}
    </View>
  );
}

// ?? ?ш컻 諛곕꼫 ?ㅽ?????????????????????????????????????????????????????????????
const rs = StyleSheet.create({
  resumeBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(212,168,83,0.10)', borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
    gap: 8, borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)' },
  resumeTxt:    { flex: 1, fontSize: 13, fontFamily: Typography.fontFamily.medium, color: '#D4A853' },
  resumeBtn:    { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(212,168,83,0.15)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(212,168,83,0.4)' },
  resumeBtnTxt: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, color: '#D4A853' },
  resumeDismiss:    { padding: 4 },
  resumeDismissTxt: { fontSize: 12, color: '#555570' },
});

// ?? 硫붿씤 ?ㅽ???????????????????????????????????????????????????????????????
const g = StyleSheet.create({
  container: { flex: 1 },
  guard:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  guardText: { fontSize: 14, textAlign: 'center' },
  skeletonPad: { padding: 20 },

  progressTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 200 },
  progressFill:  { height: 2, backgroundColor: '#D4A853' },

  stickyHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 99,
    paddingTop: 40, paddingBottom: 10, paddingHorizontal: 60,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  stickyTitle: { fontSize: 15, fontFamily: Typography.fontFamily.semibold, textAlign: 'center' },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 44, paddingHorizontal: 16, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.18)' },
  aiToggleBtn: {
    minWidth: 42,
    height: 32,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  aiToggleBtnActive: {
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderColor: 'rgba(212,168,83,0.35)',
  },
  aiToggleTxt: { fontSize: 12, fontFamily: Typography.fontFamily.semibold, letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMetaTxt: { fontSize: 12, fontFamily: Typography.fontFamily.regular },
  iconBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.18)' },
  iconBtnActive: { backgroundColor: 'rgba(212,168,83,0.22)' },

  episodeHeader:     { marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1 },
  episodeSmallTitle: { fontSize: 20, fontFamily: Typography.fontFamily.bold },
  episodeDivider:    { height: 60, alignItems: 'center', justifyContent: 'center' },

  searchOverlay: {
    position: 'absolute', top: 100, left: 16, right: 16, zIndex: 100,
    borderRadius: 12, overflow: 'hidden',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  searchText:   { fontSize: 13, fontFamily: Typography.fontFamily.bold },
  searchScroll: { padding: 10, gap: 10 },
  searchCard:   { width: 220, padding: 12, borderRadius: 10, borderWidth: 1 },
  searchCardTxt:{ fontSize: 12, lineHeight: 18 },
  returnBox:    { position: 'absolute', bottom: 100, alignSelf: 'center', zIndex: 100 },
  returnBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  returnBtnTxt: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#000' },

  // ?? 媛먯젙 諛??섑띁 ??
  scroll:       { flex: 1 },
  scrollContent:{ paddingHorizontal: 22, paddingTop: 16 },

  novelTitle: { fontSize: 26, fontFamily: Typography.fontFamily.extrabold, marginBottom: 14, lineHeight: 34, letterSpacing: -0.5 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  authorTxt:  { fontSize: 13, fontFamily: Typography.fontFamily.medium },
  dateTxt:    { fontSize: 12, fontFamily: Typography.fontFamily.regular },
  tagRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  tag: { backgroundColor: 'rgba(212,168,83,0.07)', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)' },
  tagTxt: { fontSize: 11, color: '#E8C070', fontFamily: Typography.fontFamily.medium },
  divider:    { marginVertical: 20, overflow: 'hidden' },

  actionBar: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', borderTopWidth: 1,
    paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 8,
    gap: 8, zIndex: 50 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  actionBtnActive: { backgroundColor: 'rgba(212,168,83,0.10)', borderColor: 'rgba(212,168,83,0.35)' },
  actionTxt: { fontSize: 13, fontFamily: Typography.fontFamily.semibold },

  rtl:   { flexDirection: 'row-reverse' },
  right: { textAlign: 'right' },
});

