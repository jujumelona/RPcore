import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LegendList } from '@legendapp/list';
import Animated, { FadeInDown, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import {
  BookOpen,
  ChevronLeft,
  Circle,
  CircleCheckBig,
  Clock,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';

import { PressableOpacity } from '../../components/PressableOpacity';
import { EmptyState } from '../../components/EmptyState';
import { ToastService } from '../../components/Toast';
import { Typography } from '../../constants/tokens';
import { formatLastReadTimestamp, getNovelProgressRatio } from '../../reader/progressMetrics';
import { useLanguageStore } from '../../store/languageStore';
import { useReaderSettingsStore } from '../../store/readerSettingsStore';
import { appStorage } from '../../utils/storage';

const DL_NOVELS_KEY = '@downloaded_novels';

type TranslationMap = Record<string, string | undefined>;

export interface DownloadedNovel {
  id: string;
  title: string;
  authorName: string;
  preview: string;
  novelContent: string;
  downloadedAt: number;
  lang?: string;
  storyId?: string;
  characters?: unknown[];
}

function normalizeDownloadedNovel(raw: unknown): DownloadedNovel | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id) : '';
  const title = typeof record.title === 'string' ? record.title : '';

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    authorName: typeof record.authorName === 'string' ? record.authorName : '',
    preview: typeof record.preview === 'string' ? record.preview : '',
    novelContent: typeof record.novelContent === 'string' ? record.novelContent : '',
    downloadedAt: typeof record.downloadedAt === 'number' ? record.downloadedAt : Date.now(),
    lang: typeof record.lang === 'string' ? record.lang : undefined,
    storyId: typeof record.storyId === 'string' ? record.storyId : undefined,
    characters: Array.isArray(record.characters) ? record.characters : undefined,
  };
}

export function saveDownloadedNovel(novel: DownloadedNovel): void {
  try {
    const raw = appStorage.getString(DL_NOVELS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const normalized = Array.isArray(list)
      ? list.map(normalizeDownloadedNovel).filter((item): item is DownloadedNovel => item !== null)
      : [];
    const filtered = normalized.filter(item => item.id !== novel.id);
    appStorage.set(DL_NOVELS_KEY, JSON.stringify([novel, ...filtered]));
  } catch {}
}

export function getDownloadedNovels(): DownloadedNovel[] {
  try {
    const raw = appStorage.getString(DL_NOVELS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map(normalizeDownloadedNovel)
      .filter((item): item is DownloadedNovel => item !== null);
  } catch {
    return [];
  }
}

function deleteDownloadedNovels(ids: string[]): void {
  try {
    const list = getDownloadedNovels();
    appStorage.set(
      DL_NOVELS_KEY,
      JSON.stringify(list.filter(item => !ids.includes(item.id))),
    );
  } catch {}
}

function formatDownloadDate(ts: number, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts));
  } catch {
    const date = new Date(ts);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }
}

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <View style={st.progressTrack}>
      <View style={[st.progressFill, { width: `${Math.min(100, ratio * 100)}%` }]} />
    </View>
  );
}

function NovelCard({
  item,
  index,
  selectMode,
  selected,
  locale,
  progressRatio,
  lastReadLabel,
  onPress,
  onLongPress,
}: {
  item: DownloadedNovel;
  index: number;
  selectMode: boolean;
  selected: boolean;
  locale: string;
  progressRatio: number;
  lastReadLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const hasProgress = progressRatio > 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(20)}>
      <PressableOpacity
        style={[st.card, selected && st.cardSelected]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.88}
      >
        <View style={st.iconWrap}>
          {selectMode ? (
            selected ? <CircleCheckBig size={20} color="#D4A853" /> : <Circle size={20} color="#6A6A82" />
          ) : (
            <BookOpen size={18} color="#D4A853" />
          )}
        </View>

        <View style={st.cardBody}>
          <View style={st.cardHeaderRow}>
            <Text style={st.cardTitle} numberOfLines={2}>{item.title}</Text>
            {hasProgress && (
              <View style={st.resumeBadge}>
                <Text style={st.resumeBadgeText}>{Math.round(progressRatio * 100)}%</Text>
              </View>
            )}
          </View>

          <Text style={st.cardAuthor} numberOfLines={1}>
            {item.authorName ? `@${item.authorName}` : ''}
          </Text>
          <Text style={st.cardPreview} numberOfLines={2}>{item.preview || item.novelContent}</Text>

          {hasProgress && (
            <View style={st.progressWrap}>
              <ProgressBar ratio={progressRatio} />
              <View style={st.progressMetaRow}>
                <Text style={st.progressText}>{Math.round(progressRatio * 100)}%</Text>
                {!!lastReadLabel && (
                  <View style={st.lastReadRow}>
                    <Clock size={10} color="#6A6A80" />
                    <Text style={st.lastReadText}>{lastReadLabel}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <Text style={st.cardDate}>{formatDownloadDate(item.downloadedAt, locale)}</Text>
        </View>
      </PressableOpacity>
    </Animated.View>
  );
}

function SelectionBar({
  count,
  total,
  onSelectAll,
  onDelete,
  onCancel,
  t,
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
  t: TranslationMap;
}) {
  const allSelected = total > 0 && count === total;

  return (
    <Animated.View
      entering={SlideInDown.duration(300).springify().damping(38).stiffness(260)}
      exiting={SlideOutDown.duration(200)}
      style={st.selectBar}
    >
      <PressableOpacity style={st.selectBarCancel} onPress={onCancel}>
        <X size={20} color="#8A8A9E" />
      </PressableOpacity>

      <PressableOpacity style={st.selectAllBtn} onPress={onSelectAll}>
        <Text style={st.selectAllText}>
          {allSelected ? (t?.deselectAll ?? '') : (t?.selectAll ?? '')}
        </Text>
      </PressableOpacity>

      <Text style={st.selectBarCount}>{count}</Text>

      <PressableOpacity
        style={[st.deleteBtn, count === 0 && st.deleteBtnDisabled]}
        onPress={onDelete}
        disabled={count === 0}
      >
        <Trash2 size={15} color={count > 0 ? '#FF5555' : '#797990'} />
        <Text style={[st.deleteBtnText, count > 0 && st.deleteBtnTextDanger]}>
          {t?.delete ?? ''}
        </Text>
      </PressableOpacity>
    </Animated.View>
  );
}

export function DownloadedNovelsScreen({ navigation }: {
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
}) {
  const { t, appLanguage } = useLanguageStore(
    useShallow(s => ({ t: s.t as TranslationMap, appLanguage: s.appLanguage })),
  );
  const progressMap = useReaderSettingsStore(s => s.progressMap);
  const [novels, setNovels] = useState<DownloadedNovel[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setNovels(getDownloadedNovels());
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const displayNovels = useMemo(() => {
    return [...novels].sort((left, right) => {
      const leftLastRead = progressMap[left.id]?.lastReadAt ?? 0;
      const rightLastRead = progressMap[right.id]?.lastReadAt ?? 0;
      const leftScore = Math.max(leftLastRead, left.downloadedAt);
      const rightScore = Math.max(rightLastRead, right.downloadedAt);
      return rightScore - leftScore;
    });
  }, [novels, progressMap]);

  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === displayNovels.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(displayNovels.map(item => item.id)));
  }, [displayNovels, selectedIds.size]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);

    Alert.alert(
      t?.delete ?? '',
      (t?.novelDeleteMsg ?? '').replace('{n}', String(ids.length)),
      [
        { text: t?.cancel ?? '', style: 'cancel' },
        {
          text: t?.delete ?? '',
          style: 'destructive',
          onPress: () => {
            deleteDownloadedNovels(ids);
            load();
            exitSelectMode();
            ToastService.success(t?.deleteSuccessToast ?? '');
          },
        },
      ],
    );
  }, [exitSelectMode, load, selectedIds, t]);

  const handlePress = useCallback((item: DownloadedNovel) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }

    navigation.navigate('WebNovelReader', { novelId: item.id, source: 'downloaded' });
  }, [navigation, selectMode, toggleSelect]);

  const renderItem = useCallback(({ item, index }: { item: DownloadedNovel; index: number }) => {
    const progress = progressMap[item.id];
    const progressRatio = getNovelProgressRatio(progress);
    const lastReadLabel = formatLastReadTimestamp(progress?.lastReadAt, appLanguage);

    return (
      <NovelCard
        item={item}
        index={index}
        selectMode={selectMode}
        selected={selectedIds.has(item.id)}
        locale={appLanguage}
        progressRatio={progressRatio}
        lastReadLabel={lastReadLabel || undefined}
        onPress={() => handlePress(item)}
        onLongPress={() => {
          if (selectMode) toggleSelect(item.id);
          else enterSelectMode(item.id);
        }}
      />
    );
  }, [appLanguage, enterSelectMode, handlePress, progressMap, selectMode, selectedIds, toggleSelect]);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050507" />

      <View style={st.header}>
        {selectMode ? (
          <PressableOpacity style={st.iconBtn} onPress={exitSelectMode}>
            <X size={20} color="#C8C8D4" />
          </PressableOpacity>
        ) : (
          <PressableOpacity style={st.iconBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color="#C8C8D4" />
          </PressableOpacity>
        )}

        <View style={st.headerCopy}>
          <Text style={st.headerTitle}>
            {selectMode ? `${selectedIds.size}` : (t?.downloadedNovels ?? '')}
          </Text>
          {!selectMode && displayNovels.length > 0 && (
            <Text style={st.headerSub}>{displayNovels.length}</Text>
          )}
        </View>

        <PressableOpacity style={st.iconBtn} onPress={load}>
          <RefreshCw size={16} color="#8A8A9E" />
        </PressableOpacity>
      </View>

      {displayNovels.length === 0 ? (
        <View style={st.emptyWrap}>
          <EmptyState
            title={t?.emptyLibrary ?? t?.downloadedNovels ?? ''}
            subtitle={t?.emptyLibraryHint ?? ''}
          />
        </View>
      ) : (
        <LegendList
          data={displayNovels}
          renderItem={renderItem}
          keyExtractor={(item: DownloadedNovel) => item.id}
          estimatedItemSize={124}
          recycleItems
          contentContainerStyle={[st.listContent, selectMode && st.listContentSelect]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectMode && (
        <SelectionBar
          count={selectedIds.size}
          total={displayNovels.length}
          onSelectAll={selectAll}
          onDelete={handleBulkDelete}
          onCancel={exitSelectMode}
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#16161E',
  },
  headerCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#0E0E14',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
  },
  headerSub: {
    fontSize: 11,
    color: '#6A6A80',
    fontFamily: Typography.fontFamily.regular,
    marginTop: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 8,
  },
  listContentSelect: {
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0C0C14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A1A24',
    padding: 14,
    gap: 12,
  },
  cardSelected: {
    borderColor: '#D4A853',
    backgroundColor: 'rgba(212,168,83,0.08)',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0E0E14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1A1A24',
    flexShrink: 0,
    marginTop: 2,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
    color: '#E0E0F0',
    lineHeight: 20,
  },
  resumeBadge: {
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.35)',
  },
  resumeBadgeText: {
    fontSize: 10,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold,
  },
  cardAuthor: {
    fontSize: 11,
    color: '#6A6A80',
    fontFamily: Typography.fontFamily.regular,
  },
  cardPreview: {
    fontSize: 12,
    color: '#5A5A72',
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 17,
  },
  progressWrap: {
    marginTop: 4,
    gap: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#161625',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D4A853',
  },
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressText: {
    fontSize: 10,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold,
  },
  lastReadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastReadText: {
    fontSize: 10,
    color: '#6A6A80',
    fontFamily: Typography.fontFamily.regular,
  },
  cardDate: {
    fontSize: 10,
    color: '#3A3A50',
    fontFamily: Typography.fontFamily.regular,
    marginTop: 2,
  },
  selectBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0E0E14',
    borderTopWidth: 1,
    borderTopColor: '#181820',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 12,
  },
  selectBarCancel: {
    padding: 8,
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectAllText: {
    fontSize: 11,
    color: '#8A8A9E',
    fontFamily: Typography.fontFamily.medium,
  },
  selectBarCount: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    textAlign: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,85,85,0.3)',
    backgroundColor: 'rgba(255,85,85,0.08)',
  },
  deleteBtnDisabled: {
    opacity: 0.35,
  },
  deleteBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
    color: '#797990',
  },
  deleteBtnTextDanger: {
    color: '#FF5555',
  },
});


