 
/* eslint-disable @typescript-eslint/no-unused-vars */
 
import { Typography } from '../constants/tokens';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { View, Text, StyleSheet, StatusBar, Modal } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useUserProfileStore } from '../store/userProfileStore';
import { useAuthStore } from '../store/authStore';
import { isOwner, resolveDisplayName } from '../core/user';
import { Check, ChevronDown, ChevronLeft, MoreVertical, Plus } from 'lucide-react-native';
import { useLanguageStore } from '../store/languageStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ScreenProps, Story } from '../types/navigation';
import { StoryCard } from '../components/StoryCard';
import { StoryAPI } from '../api/StoryAPI';
import { ReportModal } from '../components/ReportModal';
import { ToastService } from '../components/Toast';
import { sanitizeNullableImageUrl } from '../utils/imageUrlPolicy';
import {
  extractCoverUrl,
  extractLocalizedStoryFields,
  extractStoryTags,
  formatStoryDate,
  isReadyForHomeExposure,
  parseStoryConfig,
  pickString,
} from './home/utils/storyHelpers';

const CARD_PADDING = 14;

type RawStory = Record<string, any>;

function asNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

export function AuthorProfileScreen({ navigation, route }: ScreenProps<'AuthorProfile'>) {
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const authorId = String(
    routeParams.authorId ??
      routeParams.author_id ??
      routeParams.userId ??
      routeParams.user_id ??
      '',
  );
  const paramName =
    typeof routeParams.authorName === 'string'
      ? routeParams.authorName
      : typeof routeParams.author_name === 'string'
        ? routeParams.author_name
        : undefined;
  const paramAvatar =
    typeof routeParams.authorAvatar === 'string'
      ? routeParams.authorAvatar
      : typeof routeParams.author_avatar === 'string'
        ? routeParams.author_avatar
        : undefined;

  const myProfile = useUserProfileStore(s => s.profile);
  const authUser = useAuthStore(s => s.user);
  const isFollowingFn = useUserProfileStore(s => s.isFollowing);
  const toggleFollow = useUserProfileStore(s => s.toggleFollow);
  const blockAuthor = useUserProfileStore(s => s.blockAuthor);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const t = useLanguageStore(s => s.t);
  const isMe = isOwner(authUser, authorId);

  const authorName = isMe
    ? myProfile?.name || resolveDisplayName(authUser, paramName || '')
    : paramName || '';
  const authorAvatar = isMe
    ? sanitizeNullableImageUrl(myProfile?.avatarUri ?? null)
    : sanitizeNullableImageUrl(paramAvatar || null);

  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [sortId, setSortId] = useState<'latest' | 'likes' | 'recommended'>('latest');
  const [menuVisible, setMenuVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const SORT_OPTIONS = useMemo(
    () => [
      { id: 'latest' as const, label: t.sortLatestLabel },
      { id: 'likes' as const, label: t.sortLikesLabel },
      { id: 'recommended' as const, label: t.sortRecommendedLabel },
    ],
    [t],
  );

  useEffect(() => {
    if (authorId) setFollowing(isFollowingFn(authorId));
  }, [authorId, isFollowingFn]);

  const toNavigationStory = useCallback(
    (raw: any): Story => {
      const record = raw as Record<string, unknown>;
      const cfg = parseStoryConfig(record);
      const localized = extractLocalizedStoryFields(record, appLanguage);
      const coverUrl = extractCoverUrl(record);
      const coverUrls = Array.from(
        new Set(
          [
            ...(Array.isArray(record.cover_urls) ? record.cover_urls : []),
            ...(Array.isArray(record.coverUrls) ? record.coverUrls : []),
            ...(Array.isArray(cfg.cover_urls) ? cfg.cover_urls : []),
            ...(Array.isArray(cfg.storeCoverUris) ? cfg.storeCoverUris : []),
            ...(coverUrl ? [coverUrl] : []),
          ]
            .map(value => String(value ?? '').trim())
            .filter(Boolean),
        ),
      );

      return {
        ...(record as unknown as Story),
        id: String(record.id ?? ''),
        title: pickString(localized.title, record.title, cfg.title, cfg.storyTitle, '제목 없음'),
        description: pickString(
          localized.description,
          record.description,
          cfg.description,
          cfg.storyDesc,
          cfg.worldSetting,
          '',
        ),
        coverUrl: coverUrls[0] ?? '',
        cover_urls: coverUrls,
        author: authorName,
        authorId,
        likeCount: asNumber(record.likeCount ?? record.like_count),
        viewCount: asNumber(record.viewCount ?? record.view_count),
        tags: extractStoryTags(record),
        genre: pickString(record.genre, cfg.genre),
        isAdult: !!record.isAdult,
        story_config: (record.story_config ?? record.storyConfig ?? cfg) as Story['story_config'],
      };
    },
    [appLanguage, authorId, authorName],
  );

  const { data: rawStories = [], isLoading: loading } = useQuery<RawStory[]>({
    queryKey: ['author-stories', authorId, appLanguage],
    queryFn: async () => {
      const stories = await StoryAPI.getStories({ authorId, lang: appLanguage });
      return Array.isArray(stories) ? (stories as RawStory[]) : [];
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!authorId && !!appLanguage,
  });

  const stories = useMemo<RawStory[]>(() => {
    const arr = rawStories.filter(item => isReadyForHomeExposure(item as Record<string, unknown>));
    switch (sortId) {
      case 'likes':
        arr.sort((a, b) => asNumber(b.like_count ?? b.likeCount) - asNumber(a.like_count ?? a.likeCount));
        break;
      case 'latest':
        arr.reverse();
        break;
      default:
        break;
    }
    return arr;
  }, [rawStories, sortId]);

  const profileDate = useMemo(() => {
    const firstStory = rawStories[0] as Record<string, unknown> | undefined;
    if (!firstStory) return '';
    return formatStoryDate(
      pickString(
        firstStory.created_at,
        firstStory.createdAt,
        firstStory.published_at,
        firstStory.publishedAt,
        firstStory.updated_at,
        firstStory.updatedAt,
      ),
    );
  }, [rawStories]);

  const handleFollow = async () => {
    if (!authorId || followPending) return;
    setFollowPending(true);
    try {
      setFollowing(await toggleFollow(authorId));
    } finally {
      setFollowPending(false);
    }
  };

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <Animated.View entering={FadeIn.delay(index * 50).springify()}>
        <StoryCard
          story={toNavigationStory(item)}
          onPress={() => navigation.navigate('StoryDetail', { story: toNavigationStory(item) })}
          appLanguage={appLanguage}
          index={index}
        />
      </Animated.View>
    ),
    [navigation, appLanguage, toNavigationStory],
  );

  const currentSortLabel =
    SORT_OPTIONS.find(s => s.id === sortId)?.label ?? t.sortLatestLabel;

  return (
    <SafeAreaView style={st.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#050507" translucent={false} />

      <View style={st.header}>
        <TouchableOpacity style={st.headerBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={26} color="#F0F0F5" />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>
          {authorName || t.authorFallback}
        </Text>
        <View style={st.headerRightActions}>
          <TouchableOpacity style={st.headerBtn} onPress={() => setMenuVisible(true)}>
            <MoreVertical size={20} color="#8A8A9E" />
          </TouchableOpacity>
        </View>
      </View>

      <FlashList
        data={stories ?? []}
        renderItem={renderItem}
        keyExtractor={(item: RawStory) => String(item.id ?? '')}
        numColumns={2}
        estimatedItemSize={200}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.listContent}
        ListEmptyComponent={
          loading ? (
            <View style={st.loadingBox}>
              <Text style={st.emptyTxt}>{t.loading}</Text>
            </View>
          ) : (
            <Text style={st.emptyTxt}>{t.noStories}</Text>
          )
        }
        ListHeaderComponent={
          <>
            <Animated.View entering={FadeInDown.springify()} style={st.profileSection}>
              <View style={st.profileHeroRow}>
                {authorAvatar ? (
                  <Image source={{ uri: authorAvatar }} style={st.avatar} />
                ) : (
                  <View style={st.avatarPlaceholder}>
                    <Text style={st.avatarInitial}>{(authorName || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                )}

                <View style={st.profileTextBlock}>
                  <Text style={st.authorNameGlow} numberOfLines={1}>
                    {authorName || t.authorFallback}
                  </Text>
                  {!!profileDate && <Text style={st.authorDateText}>{profileDate}</Text>}
                </View>

                {!!authorId && (
                  <View style={st.profileHeroFollowSlot}>
                  <TouchableOpacity
                    style={[st.followBtn, following && st.followBtnOn, followPending && st.followBtnDisabled]}
                    onPress={handleFollow}
                    disabled={!authorId || followPending || isMe}
                  >
                    <View style={st.followBtnInner}>
                      {following ? <Check size={14} color="#CFC3FF" /> : <Plus size={14} color="#F0F0F5" />}
                      <Text style={[st.followBtnTxt, following && st.followBtnTxtOn]}>
                        {following ? t.followingBtn : t.followBtn}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  </View>
                )}
              </View>
            </Animated.View>

            <View style={st.sortRow}>
              <Text style={st.storiesLabel}>
                {t.storiesCount.replace(
                  '{count}',
                  String(stories.length > 0 ? stories.length : ''),
                )}
              </Text>
              <TouchableOpacity style={st.sortBtn} onPress={() => setSortVisible(true)}>
                <Text style={st.sortTxt}>{currentSortLabel}</Text>
                <ChevronDown size={12} color="#8A8A9E" />
              </TouchableOpacity>
            </View>
          </>
        }
      />

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={st.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={st.menuBox}>
            <TouchableOpacity
              style={st.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setReportModalVisible(true);
              }}
            >
              <Text style={st.menuTxt}>{t.reportUser}</Text>
            </TouchableOpacity>
            <View style={st.menuDiv} />
            <TouchableOpacity
              style={st.menuItem}
              onPress={() => {
                setMenuVisible(false);
                blockAuthor(authorId).catch(() => {});
                ToastService.info(t.blockToast);
              }}
            >
              <Text style={[st.menuTxt, st.menuTxtDanger]}>{t.blockUser}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={sortVisible} transparent animationType="fade" onRequestClose={() => setSortVisible(false)}>
        <TouchableOpacity style={st.menuOverlay} activeOpacity={1} onPress={() => setSortVisible(false)}>
          <View style={[st.menuBox, st.sortMenuBox]}>
            {SORT_OPTIONS.map((o, i) => (
              <TouchableOpacity
                key={o.id}
                style={[st.menuItem, sortId === o.id && st.menuItemActive, i === SORT_OPTIONS.length - 1 && st.menuItemLast]}
                onPress={() => {
                  setSortId(o.id);
                  setSortVisible(false);
                }}
              >
                <Text style={[st.menuTxt, sortId === o.id && st.menuTxtActive]}>{o.label}</Text>
                {sortId === o.id && <Check size={14} color="#F0F0F5" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <ReportModal
        visible={reportModalVisible}
        targetType="user"
        targetId={authorId}
        onClose={() => setReportModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050507' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 50,
    borderBottomWidth: 0.5,
    borderBottomColor: '#0E0E14',
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    marginHorizontal: 8,
  },

  profileSection: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#0E0E14',
  },
  profileHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minWidth: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#D4A853',
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0C0C14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D4A853',
  },
  avatarInitial: {
    fontSize: 28,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.extrabold,
  },
  profileTextBlock: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
    marginLeft: 12,
  },
  profileHeroFollowSlot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 'auto',
    alignSelf: 'center',
    flexShrink: 0,
  },
  authorNameGlow: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#E6C46A',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(138,92,246,0.42)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  authorDateText: {
    fontSize: 13,
    color: '#8A8A9E',
    fontFamily: Typography.fontFamily.medium,
  },
  followBtn: {
    minWidth: 92,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#6D4AFF',
    backgroundColor: '#6D4AFF',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  followBtnOn: {
    borderColor: '#6D4AFF',
    backgroundColor: 'rgba(109,74,255,0.16)',
  },
  followBtnDisabled: { opacity: 0.6 },
  followBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  followBtnTxt: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
  },
  followBtnTxtOn: { color: '#CFC3FF' },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 8,
  },
  storiesLabel: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
    color: '#8A8A9E',
  },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortTxt: { fontSize: 13, color: '#8A8A9E' },
  listContent: { paddingHorizontal: CARD_PADDING, paddingBottom: 30 },
  loadingBox: { padding: 40 },
  emptyTxt: { textAlign: 'center', color: '#757585', fontSize: 14, marginTop: 40 },

  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 16,
  },
  menuBox: {
    backgroundColor: '#0C0C14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C38',
    minWidth: 180,
    overflow: 'hidden',
  },
  sortMenuBox: { minWidth: 160 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#181820',
  },
  menuItemActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  menuItemLast: { borderBottomWidth: 0 },
  menuTxt: { fontSize: 15, color: '#C8C8D4' },
  menuTxtActive: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  menuTxtDanger: { color: '#FF5555' },
  menuDiv: { height: 0.5, backgroundColor: '#1A1A24' },
});
