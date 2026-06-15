import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  Flow,
  Annotation as EpubAnnotation,
  Bookmark as EpubBookmark,
  Location as EpubLocation,
  Section as EpubSection,
} from '@epubjs-react-native/core';
import { Reader, ReaderProvider, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import { ArrowLeft, Bookmark, BookMarked, Highlighter, RefreshCcw } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';

import { PressableOpacity } from '../../components/PressableOpacity';
import { Radius, Typography } from '../../constants/tokens';
import {
  buildEpubReaderLocator,
  mapEpubAnnotation,
  mapEpubBookmark,
  resolveEpubInitialLocation,
} from '../../reader/epubLocator';
import {
  loadLastEpubSpikeSource,
  loadPersistedEpubAnnotations,
  loadPersistedEpubBookmarks,
  saveLastEpubSpikeSource,
  savePersistedEpubAnnotations,
  savePersistedEpubBookmarks,
} from '../../reader/epubStateStorage';
import { useReaderContextStore } from '../../store/readerContextStore';
import { READER_THEMES, type ReaderTheme, useReaderSettingsStore } from '../../store/readerSettingsStore';
import { useLanguageStore } from '../../store/languageStore';
import type { ScreenProps } from '../../types/navigation';

export const EPUB_SPIKE_SAMPLE_SRC = 'https://s3.amazonaws.com/moby-dick/OPS/package.opf';
export const EPUB_SPIKE_SAMPLE_TITLE = 'Moby-Dick Sample';

function deriveBookId(source: string): string {
  return `epub:${source.trim()}`;
}

function buildReaderTheme(theme: { bg: string; text: string }, fontFamily: string) {
  return {
    body: {
      background: theme.bg,
      color: theme.text,
      'font-family': fontFamily,
      'line-height': '1.85',
      'padding-left': '18px',
      'padding-right': '18px',
    },
    a: { color: '#D4A853' },
    '::selection': { background: 'rgba(212, 168, 83, 0.35)' },
  };
}

function formatLocationText(currentLocation: EpubLocation | null, currentSection: EpubSection | null): string {
  if (!currentLocation) return '0%';

  const percent = currentLocation.start?.percentage;
  const safePercent = typeof percent === 'number' && Number.isFinite(percent)
    ? `${Math.round(percent * 100)}%`
    : '0%';

  if (currentSection?.label) return `${currentSection.label} 쨌 ${safePercent}`;
  if (currentLocation.start?.href) return `${currentLocation.start.href} 쨌 ${safePercent}`;
  return safePercent;
}

function formatProgressionLabel(progression: number | undefined): string {
  if (typeof progression !== 'number' || !Number.isFinite(progression)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(progression * 100)))}%`;
}

function EpubReaderSpikeContent({ route, navigation }: ScreenProps<'EpubReaderSpike'>) {
  const routeParams = route.params;
  const { settings, getProgress, saveProgress } = useReaderSettingsStore(
    useShallow(s => ({
      settings: s.settings,
      getProgress: s.getProgress,
      saveProgress: s.saveProgress,
    })),
  );
  const theme = READER_THEMES[settings.theme as ReaderTheme] ?? READER_THEMES.dark;
  const patchReaderContext = useReaderContextStore(s => s.patchSnapshot);
  const clearReaderContext = useReaderContextStore(s => s.clearSnapshot);
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const [sourceInput, setSourceInput] = useState(
    (routeParams?.src ?? loadLastEpubSpikeSource()) || (__DEV__ ? EPUB_SPIKE_SAMPLE_SRC : ''),
  );
  const [activeSource, setActiveSource] = useState(routeParams?.src ?? '');
  const [activeTitle, setActiveTitle] = useState(routeParams?.title ?? EPUB_SPIKE_SAMPLE_TITLE);
  const [flowMode, setFlowMode] = useState<Flow>(settings.scrollMode === 'vertical' ? 'scrolled-doc' : 'paginated');
  const [statusText, setStatusText] = useState(t?.epubStatusWaiting ?? '');
  const [currentSection, setCurrentSection] = useState<EpubSection | null>(null);
  const [lastSelection, setLastSelection] = useState('');
  const [readerError, setReaderError] = useState<string | null>(null);

  const activeBookId = useMemo(
    () => routeParams?.bookId?.trim() || (activeSource.trim() ? deriveBookId(activeSource) : ''),
    [activeSource, routeParams?.bookId],
  );
  const savedProgress = activeBookId ? getProgress(activeBookId) : undefined;
  const initialLocation = useMemo(() => resolveEpubInitialLocation(savedProgress?.locator), [savedProgress?.locator]);
  const initialBookmarks = useMemo(
    () => (activeBookId ? loadPersistedEpubBookmarks(activeBookId) : []),
    [activeBookId],
  );
  const initialAnnotations = useMemo(
    () => (activeBookId ? loadPersistedEpubAnnotations(activeBookId) : []),
    [activeBookId],
  );

  const {
    addAnnotation,
    addBookmark,
    annotations,
    bookmarks,
    changeFlow,
    changeFontFamily,
    changeFontSize,
    changeTheme,
    currentLocation,
    isBookmarked,
    removeBookmark,
    removeSelection,
  } = useReader();

  useEffect(() => {
    if (!activeSource.trim()) return;
    saveLastEpubSpikeSource(activeSource);
  }, [activeSource]);

  useEffect(() => {
    if (!activeBookId) return undefined;

    return () => {
      clearReaderContext(activeBookId);
    };
  }, [activeBookId, clearReaderContext]);

  useEffect(() => {
    setStatusText(activeSource.trim() ? (t?.epubStatusOpening ?? '') : (t?.epubStatusWaiting ?? ''));
  }, [activeSource, t]);

  useEffect(() => {
    changeTheme(buildReaderTheme(theme, settings.fontFamily));
    changeFontFamily(settings.fontFamily);
    changeFontSize(`${settings.fontSize * 100 / 16}%`);
  }, [changeFontFamily, changeFontSize, changeTheme, settings.fontFamily, settings.fontSize, theme]);

  useEffect(() => {
    changeFlow(flowMode);
  }, [changeFlow, flowMode]);

  const normalizedBookmarks = useMemo(
    () => (activeBookId ? bookmarks.map(bookmark => mapEpubBookmark(activeBookId, bookmark)) : []),
    [activeBookId, bookmarks],
  );
  const normalizedAnnotations = useMemo(
    () => (activeBookId ? annotations.map(annotation => mapEpubAnnotation(activeBookId, annotation)) : []),
    [activeBookId, annotations],
  );

  const toggleBookmark = useCallback(() => {
    if (!currentLocation) return;

    if (isBookmarked) {
      const matched = bookmarks.find(bookmark => bookmark.location?.start?.cfi === currentLocation.start?.cfi);
      if (matched) removeBookmark(matched);
      return;
    }

    addBookmark(currentLocation, { title: activeTitle, source: activeSource });
  }, [activeSource, activeTitle, addBookmark, bookmarks, currentLocation, isBookmarked, removeBookmark]);

  const handleOpenPress = useCallback(() => {
    const nextSource = sourceInput.trim();
    if (!nextSource) return;

    setReaderError(null);
    setCurrentSection(null);
    setLastSelection('');
    setActiveTitle(routeParams?.title ?? EPUB_SPIKE_SAMPLE_TITLE);
    setActiveSource(nextSource);
  }, [routeParams?.title, sourceInput]);

  const handleSamplePress = useCallback(() => {
    setSourceInput(EPUB_SPIKE_SAMPLE_SRC);
    setReaderError(null);
    setActiveTitle(EPUB_SPIKE_SAMPLE_TITLE);
    setActiveSource(EPUB_SPIKE_SAMPLE_SRC);
  }, []);

  const handleLocationChange = useCallback(
    (totalLocations: number, location: EpubLocation, progress: number, section: EpubSection | null) => {
      if (!activeBookId) return;

      const locator = buildEpubReaderLocator({
        bookId: activeBookId,
        location,
        currentSection: section,
        progress,
      });

      setCurrentSection(section);
      saveProgress({
        novelId: activeBookId,
        chapterIndex: location.start?.location ?? 0,
        scrollOffset: 0,
        totalChapters: Math.max(totalLocations, 1),
        pageIndex: locator.pageIndex,
        lastReadAt: Date.now(),
        locator,
      });
      patchReaderContext(activeBookId, {
        locator,
        chapterId: section?.id,
        updatedAt: Date.now(),
      });
    },
    [activeBookId, patchReaderContext, saveProgress],
  );

  const handleChangeBookmarks = useCallback((nextBookmarks: EpubBookmark[]) => {
    if (!activeBookId) return;
    savePersistedEpubBookmarks(activeBookId, nextBookmarks);
  }, [activeBookId]);

  const handleChangeAnnotations = useCallback((nextAnnotations: EpubAnnotation[]) => {
    if (!activeBookId) return;
    savePersistedEpubAnnotations(activeBookId, nextAnnotations);
  }, [activeBookId]);

  const locationText = formatLocationText(currentLocation, currentSection);
  const headerTitle = activeTitle.trim() || routeParams?.title?.trim() || String(t?.epubReaderTitle ?? t?.libraryTitle ?? '');

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      <View style={s.header}>
        <PressableOpacity style={s.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={18} color={theme.text} />
        </PressableOpacity>
        <View style={s.headerCopy}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{headerTitle}</Text>
          <Text style={[s.subtitle, { color: theme.secondary }]}>{t?.epubReaderSubtitle ?? ''}</Text>
        </View>
      </View>

      <View style={[s.controlCard, { borderColor: `${theme.secondary}33`, backgroundColor: `${theme.secondary}12` }]}>
        <Text style={[s.label, { color: theme.secondary }]}>{t?.epubSourceLabel ?? ''}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t?.epubSourcePlaceholder ?? ''}
          placeholderTextColor="#73738A"
          style={[
            s.sourceInput,
            { color: theme.text, borderColor: `${theme.secondary}30`, backgroundColor: `${theme.bg}F5` },
          ]}
          value={sourceInput}
          onChangeText={setSourceInput}
        />

        <View style={s.buttonRow}>
          <PressableOpacity style={s.primaryButton} onPress={handleOpenPress}>
            <Text style={s.primaryButtonText}>{t?.epubReadAction ?? ''}</Text>
          </PressableOpacity>
          <PressableOpacity style={[s.secondaryButton, { borderColor: `${theme.secondary}30` }]} onPress={handleSamplePress}>
            <RefreshCcw size={16} color={theme.text} />
            <Text style={[s.secondaryButtonText, { color: theme.text }]}>{t?.epubSampleAction ?? ''}</Text>
          </PressableOpacity>
          <PressableOpacity
            style={[s.secondaryButton, { borderColor: `${theme.secondary}30` }]}
            onPress={() => setFlowMode(prev => (prev === 'scrolled-doc' ? 'paginated' : 'scrolled-doc'))}
          >
            <BookMarked size={16} color={theme.text} />
            <Text style={[s.secondaryButtonText, { color: theme.text }]}>
              {flowMode === 'scrolled-doc' ? (t?.epubFlowVertical ?? '') : (t?.epubFlowPaged ?? '')}
            </Text>
          </PressableOpacity>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaCard}>
            <Text style={s.metaLabel}>{t?.epubLocationLabel ?? ''}</Text>
            <Text style={s.metaValue} numberOfLines={1}>{locationText}</Text>
          </View>
          <View style={s.metaCard}>
            <Text style={s.metaLabel}>{t?.epubBookmarksLabel ?? ''}</Text>
            <Text style={s.metaValue}>{normalizedBookmarks.length}</Text>
          </View>
          <View style={s.metaCard}>
            <Text style={s.metaLabel}>{t?.epubAnnotationsLabel ?? ''}</Text>
            <Text style={s.metaValue}>{normalizedAnnotations.length}</Text>
          </View>
        </View>

        <View style={s.buttonRow}>
          <PressableOpacity
            style={[s.secondaryButton, { borderColor: `${theme.secondary}30` }]}
            disabled={!currentLocation}
            onPress={toggleBookmark}
          >
            <Bookmark size={16} color={isBookmarked ? '#D4A853' : theme.text} />
            <Text style={[s.secondaryButtonText, { color: theme.text }]}>
              {isBookmarked ? (t?.epubRemoveBookmarkAction ?? '') : (t?.bookmark ?? '')}
            </Text>
          </PressableOpacity>
          <PressableOpacity
            style={[s.secondaryButton, { borderColor: `${theme.secondary}30` }]}
            onPress={() => {
              removeSelection();
              setLastSelection('');
            }}
          >
            <Highlighter size={16} color={theme.text} />
            <Text style={[s.secondaryButtonText, { color: theme.text }]}>{t?.epubClearSelectionAction ?? ''}</Text>
          </PressableOpacity>
        </View>

        <Text style={[s.statusText, { color: readerError ? '#FF7D7D' : theme.secondary }]}>
          {readerError ?? statusText}
        </Text>
      </View>

      <View style={[s.selectionCard, { borderColor: `${theme.secondary}22`, backgroundColor: `${theme.secondary}10` }]}>
        <Text style={[s.label, { color: theme.secondary }]}>{t?.epubSelectedTextLabel ?? ''}</Text>
        <Text style={[s.selectionText, { color: theme.text }]} numberOfLines={3}>
          {lastSelection.trim() || (t?.epubSelectedTextHint ?? '')}
        </Text>
      </View>

      {(normalizedBookmarks.length > 0 || normalizedAnnotations.length > 0) && (
        <View style={[s.selectionCard, { borderColor: `${theme.secondary}22`, backgroundColor: `${theme.secondary}10` }]}>
          <Text style={[s.label, { color: theme.secondary }]}>{t?.epubReadingNotesLabel ?? ''}</Text>
          {normalizedBookmarks.slice(0, 3).map(bookmark => (
            <View key={bookmark.id} style={s.noteRow}>
              <Bookmark size={13} color="#D4A853" />
              <View style={s.noteCopy}>
                <Text style={[s.noteTitle, { color: theme.text }]} numberOfLines={1}>
                  {bookmark.label || (t?.epubBookmarkFallback ?? t?.bookmark ?? '')}
                </Text>
                <Text style={[s.noteMeta, { color: theme.secondary }]}>
                  {formatProgressionLabel(bookmark.locator.progression)}
                </Text>
              </View>
            </View>
          ))}
          {normalizedAnnotations.slice(0, 2).map(annotation => (
            <View key={annotation.id} style={s.noteRow}>
              <Highlighter size={13} color="#D4A853" />
              <View style={s.noteCopy}>
                <Text style={[s.noteTitle, { color: theme.text }]} numberOfLines={2}>
                  {annotation.quote || (t?.epubHighlightFallback ?? t?.highlightTitle ?? '')}
                </Text>
                <Text style={[s.noteMeta, { color: theme.secondary }]}>
                  {annotation.note || formatProgressionLabel(annotation.locator.progression)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {activeSource.trim() ? (
        <View style={s.readerWrap}>
          <Reader
            key={`${activeBookId}:${activeSource}`}
            src={activeSource}
            fileSystem={useFileSystem}
            initialLocation={initialLocation}
            initialBookmarks={initialBookmarks}
            initialAnnotations={initialAnnotations}
            enableSelection
            keepScrollOffsetOnLocationChange
            flow={flowMode}
            menuItems={[
              {
                key: 'highlight-selection',
                label: t?.epubHighlightAction ?? t?.highlightTitle ?? '',
                action: (cfiRange: string, text: string) => {
                  addAnnotation(
                    'highlight',
                    cfiRange,
                    { source: 'epub-spike', note: text.slice(0, 120) },
                    { color: '#D4A853', opacity: 0.28 },
                  );
                  setLastSelection(text);
                  return true;
                },
              },
            ]}
            defaultTheme={buildReaderTheme(theme, settings.fontFamily)}
            onStarted={() => {
              setReaderError(null);
              setStatusText(t?.epubStatusOpening ?? '');
            }}
            onReady={(_totalLocations, _location, progress) => {
              setReaderError(null);
              setStatusText(`${t?.epubReaderReady ?? ''} ${Math.round(progress)}%`);
            }}
            onChangeSection={setCurrentSection}
            onLocationChange={handleLocationChange}
            onSelected={selectedText => {
              setLastSelection(selectedText);
              if (!activeBookId) return;
              patchReaderContext(activeBookId, {
                chapterId: currentSection?.id,
                selectedText,
                updatedAt: Date.now(),
              });
            }}
            onDisplayError={reason => {
              setReaderError(reason);
              setStatusText(reason);
            }}
            onChangeBookmarks={handleChangeBookmarks}
            onChangeAnnotations={handleChangeAnnotations}
            renderLoadingFileComponent={props => (
                <View style={s.loadingState}>
                  <ActivityIndicator color="#D4A853" />
                <Text style={s.loadingTitle}>{t?.epubStatusOpening ?? ''}</Text>
                <Text style={s.loadingSub}>{props.fileSize > 0 ? `${Math.round(props.downloadProgress)}%` : (t?.loading ?? '')}</Text>
              </View>
            )}
            renderOpeningBookComponent={() => (
              <View style={s.loadingState}>
                <ActivityIndicator color="#D4A853" />
                <Text style={s.loadingTitle}>{activeTitle}</Text>
                <Text style={s.loadingSub}>{t?.epubPreparingReader ?? ''}</Text>
              </View>
            )}
          />
        </View>
      ) : (
        <View style={s.emptyState}>
          <Text style={[s.emptyTitle, { color: theme.text }]}>{t?.epubNoSourceTitle ?? ''}</Text>
          <Text style={[s.emptyBody, { color: theme.secondary }]}>
            {t?.epubNoSourceBody ?? ''}
          </Text>
          {__DEV__ && (
            <PressableOpacity style={s.primaryButton} onPress={handleSamplePress}>
              <Text style={s.primaryButtonText}>{t?.epubOpenSampleAction ?? ''}</Text>
            </PressableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export function EpubReaderSpikeScreen(props: ScreenProps<'EpubReaderSpike'>) {
  return (
    <ReaderProvider>
      <EpubReaderSpikeContent {...props} />
    </ReaderProvider>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  headerCopy: { flex: 1, gap: 2 },
  title: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.extrabold,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  controlCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 10,
  },
  selectionCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
  },
  sourceInput: {
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4A853',
  },
  primaryButtonText: {
    color: '#101014',
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
  },
  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaCard: {
    minWidth: 92,
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.18)',
    gap: 4,
  },
  metaLabel: {
    color: '#8A8A9E',
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
  },
  metaValue: {
    color: '#F0F0F5',
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    lineHeight: 18,
  },
  selectionText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.regular,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noteCopy: {
    flex: 1,
    gap: 2,
  },
  noteTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.medium,
  },
  noteMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Typography.fontFamily.regular,
  },
  readerWrap: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#080810',
  },
  loadingTitle: {
    color: '#F0F0F5',
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
  },
  loadingSub: {
    color: '#8A8A9E',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 19,
    fontFamily: Typography.fontFamily.bold,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.regular,
    marginBottom: 8,
  },
});
