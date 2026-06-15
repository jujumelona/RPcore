

import { memo, useCallback, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { BookOpen, CircleCheckBig, Circle, RefreshCw, Share2, Trash2, X, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { EmptyState } from '../../components/EmptyState';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ToastService } from '../../components/Toast';
import { PressableOpacity } from '../../components/PressableOpacity';
import { Radius, Space, Shadow, Typography, Typo } from '../../constants/tokens';
import { getScreenTranslations } from '../../i18n/SCREENS-TRANSLATION';
import { useLanguageStore } from '../../store/languageStore';
import { deleteWebNovels, getWebNovel, getWebNovelList } from '../../utils/webNovelStorage';

interface NovelMeta {
  id: string;
  storyId: string;
  title: string;
  createdAt: number;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const NovelCard = memo(function NovelCard({
  item,
  selectMode,
  selected,
  index,
  onPress,
  onLongPress,
}: {
  item: NovelMeta;
  selectMode: boolean;
  selected: boolean;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Animated.View entering={selectMode ? undefined : FadeInDown.delay(index * 18).duration(180)}>
      <PressableOpacity
        activeOpacity={0.985}
        scaleDown={0.994}
        style={[s.card, selected && s.cardSelected]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
      >
        <View style={s.iconWrap}>
          {selectMode
            ? (selected
              ? <CircleCheckBig size={22} color="#D4A853" />
              : <Circle size={22} color="#797990" />)
            : <BookOpen size={20} color="#D4A853" />}
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={s.cardMeta}>{formatDate(item.createdAt)}</Text>
        </View>
        {!selectMode && <ChevronRight size={16} color="#797990" />}
      </PressableOpacity>
    </Animated.View>
  );
});

function SelectionBar({ count, total, onSelectAll, onDelete, onShare, onCancel, t }: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onDelete: () => void;
  onShare: () => void;
  onCancel: () => void;
  t: Record<string, string | undefined>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(140)}
      exiting={FadeOutDown.duration(100)}
      style={s.selectBar}
    >
      <PressableOpacity style={s.selectBarCancel} onPress={onCancel}>
        <X size={20} color="#8A8A9E" />
      </PressableOpacity>
      <PressableOpacity style={s.selectAllBtn} onPress={onSelectAll}>
        <Text style={s.selectAllTxt}>
          {count === total ? t?.deselectAll : t?.selectAll}
        </Text>
      </PressableOpacity>
      <Text style={s.selectBarCount}>{`${count}/${total}`}</Text>
      <View style={s.actionBtns}>
        <PressableOpacity
          style={[s.actionBtn, s.shareBtn, count === 0 && s.actionBtnDisabled]}
          onPress={onShare}
          disabled={count === 0}
        >
          <Share2 size={15} color={count > 0 ? '#D4A853' : '#797990'} />
          <Text style={[s.actionBtnTxt, count > 0 && { color: '#D4A853' }]}>{t?.share}</Text>
        </PressableOpacity>
        <PressableOpacity
          style={[s.actionBtn, s.deleteBtn, count === 0 && s.actionBtnDisabled]}
          onPress={onDelete}
          disabled={count === 0}
        >
          <Trash2 size={15} color={count > 0 ? '#FF5555' : '#797990'} />
          <Text style={[s.actionBtnTxt, count > 0 && { color: '#FF5555' }]}>{t?.delete}</Text>
        </PressableOpacity>
      </View>
    </Animated.View>
  );
}

export function MyWebNovelsScreen({ navigation }: {
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
}) {
  const insets = useSafeAreaInsets();
  const { appLanguage } = useLanguageStore(
    useShallow((state) => ({ appLanguage: state.appLanguage })),
  );
  const screenText = getScreenTranslations(appLanguage);
  const t = screenText as Record<string, string | undefined>;

  const [novels, setNovels] = useState<NovelMeta[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [deleteNovelModal, setDeleteNovelModal] = useState<{ visible: boolean; ids: string[] }>({ visible: false, ids: [] });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadNovels = useCallback(() => {
    setNovels(getWebNovelList());
  }, []);

  const enterSelectMode = useCallback((firstId: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([firstId]));
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
    if (selectedIds.size === novels.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(novels.map(novel => novel.id)));
  }, [novels, selectedIds.size]);

  const doDeleteNovels = useCallback(() => {
    const { ids } = deleteNovelModal;
    setDeleteNovelModal({ visible: false, ids: [] });
    deleteWebNovels(ids);
    loadNovels();
    exitSelectMode();
    ToastService.success((t?.numDeleted ?? '').replace('{n}', String(ids.length)));
  }, [deleteNovelModal, exitSelectMode, loadNovels, t]);

  useFocusEffect(useCallback(() => {
    loadNovels();
  }, [loadNovels]));

  const handlePress = useCallback((item: NovelMeta) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }
    navigation.navigate('WebNovelReader', { novelId: item.id, source: 'local' });
  }, [navigation, selectMode, toggleSelect]);

  const handleLongPress = useCallback((item: NovelMeta) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }
    enterSelectMode(item.id);
  }, [enterSelectMode, selectMode, toggleSelect]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    setDeleteNovelModal({ visible: true, ids });
  }, [selectedIds]);

  const handleBulkShare = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    exitSelectMode();

    if (ids.length === 1) {
      const novel = getWebNovel(ids[0]);
      if (!novel) return;
      navigation.navigate('WriteNovelPost', {
        novelId: novel.id,
        novelTitle: novel.title,
        novelPreview: novel.paragraphs?.[0]?.text?.slice(0, 120) ?? '',
      });
      return;
    }

    ToastService.info((t?.numShared ?? '').replace('{n}', String(ids.length)));
  }, [exitSelectMode, navigation, selectedIds, t]);

  return (
    <>
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <View style={s.header}>
          {selectMode ? (
            <>
            <PressableOpacity style={s.iconBtn} onPress={exitSelectMode}>
                <X size={20} color="#C8C8D4" />
              </PressableOpacity>
              <Text style={s.selectTitle}>{`${selectedIds.size}/${novels.length}`}</Text>
              <PressableOpacity style={s.selectAllBtn2} onPress={selectAll}>
                <Text style={s.selectAllTxt2}>
                  {selectedIds.size === novels.length ? t?.deselectAll : t?.selectAll}
                </Text>
              </PressableOpacity>
            </>
          ) : (
            <>
              <PressableOpacity style={s.iconBtn} onPress={() => navigation.goBack()}>
                <ChevronLeft size={20} color="#C8C8D4" />
              </PressableOpacity>
              <View>
                <Text style={s.headerTitle}>{t?.myWebNovelsOwn}</Text>
                <Text style={s.headerSubtitle}>
                  {novels.length > 0
                    ? (t?.numSaved ?? '').replace('{n}', String(novels.length))
                    : t?.noWebNovels}
                </Text>
              </View>
              <PressableOpacity style={s.iconBtn} onPress={loadNovels}>
                <RefreshCw size={18} color="#8A8A9E" />
              </PressableOpacity>
            </>
          )}
        </View>

        {novels.length === 0 ? (
          <View style={s.emptyWrap}>
            <EmptyState title="" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[s.listContent, selectMode && s.listContentSelect]}
            showsVerticalScrollIndicator={false}
          >
            {novels.map((item, index) => (
              <NovelCard
                key={item.id}
                item={item}
                index={index}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                onPress={() => handlePress(item)}
                onLongPress={() => handleLongPress(item)}
              />
            ))}
          </ScrollView>
        )}

        {selectMode && (
          <SelectionBar
            t={t}
            count={selectedIds.size}
            total={novels.length}
            onSelectAll={selectAll}
            onDelete={handleBulkDelete}
            onShare={handleBulkShare}
            onCancel={exitSelectMode}
          />
        )}
      </View>

      <ConfirmModal
        visible={deleteNovelModal.visible}
        icon="trash-outline"
        iconColor="#FF5555"
        title={t?.novelDeleteTitle}
        message={(t?.novelDeleteMsg ?? '').replace('{n}', String(deleteNovelModal.ids.length))}
        onRequestClose={() => setDeleteNovelModal({ visible: false, ids: [] })}
        actions={[
          { label: t?.delete, variant: 'danger', onPress: doDeleteNovels },
          { label: t?.cancel, variant: 'default', onPress: () => setDeleteNovelModal({ visible: false, ids: [] }) },
        ]}
      />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space['4'], height: 56 },
  headerTitle: { fontSize: Typo.size.xl, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  headerSubtitle: { fontSize: Typo.size.xs, color: '#797990', marginTop: 1 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.04)' },
  selectTitle: { flex: 1, fontSize: Typo.size.base, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', textAlign: 'center' },
  selectAllBtn2: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectAllTxt2: { fontSize: Typo.size.xs, color: '#8A8A9E' },
  listContent: { paddingHorizontal: Space['4'], paddingTop: 8, paddingBottom: 32, gap: 8 },
  listContentSelect: { paddingHorizontal: Space['4'], paddingTop: 8, paddingBottom: 100, gap: 8 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Space['6'] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#1A1A24',
    padding: 14,
    gap: 12,
    ...Shadow.sm,
  },
  cardSelected: { borderColor: '#D4A853', backgroundColor: 'rgba(212,168,83,0.14)' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: '#0E0E14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1A1A24',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: Typo.size.base, fontFamily: Typography.fontFamily.medium, color: '#F0F0F5', marginBottom: 3 },
  cardMeta: { fontSize: Typo.size.xs, fontFamily: Typography.fontFamily.regular, color: '#797990' },
  selectBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0E0E14',
    borderTopWidth: 1,
    borderTopColor: '#181820',
    paddingHorizontal: Space['4'],
    paddingVertical: 12,
    paddingBottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 12,
  },
  selectBarCancel: { padding: 8 },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectAllTxt: { fontSize: Typo.size.xs, color: '#8A8A9E' },
  selectBarCount: { flex: 1, fontSize: Typo.size.sm, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', textAlign: 'center' },
  actionBtns: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1 },
  shareBtn: { borderColor: 'rgba(212,168,83,0.3)', backgroundColor: 'rgba(212,168,83,0.14)' },
  deleteBtn: { borderColor: 'rgba(255,77,109,0.3)', backgroundColor: 'rgba(255,77,109,0.08)' },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnTxt: { fontSize: Typo.size.sm, fontFamily: Typography.fontFamily.semibold, color: '#797990' },
});
