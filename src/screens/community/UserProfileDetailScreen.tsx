
// src/screens/community/UserProfileDetailScreen.tsx
// Bluesky social-app (MIT) 프로필 헤더 + 팔로워/팔로잉 모달 패턴 이식

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, Modal,
  TouchableWithoutFeedback, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ArrowLeft, Users, BookOpen, Heart, Flag, Ban,
  MessageCircle, Eye, ChevronRight, X, UserCheck, UserPlus } from 'lucide-react-native';
import { useShallow } from 'zustand/react/shallow';

import { useLanguageStore } from '../../store/languageStore';
import { useAuthStore } from '../../store/authStore';
import { authedFetch } from '../../utils/authedFetch';
 
import { PressableOpacity } from '../../components/PressableOpacity';
 
import { EmptyState } from '../../components/EmptyState';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SkeletonPostList } from '../../components/Skeleton';
import { ToastService } from '../../components/Toast';
import { Radius, Typography } from '../../constants/tokens';
import { formatCount } from '../../utils/formatCount';
import { useFollow } from '../../hooks/useFollow';
import {
  normalizeCommunityFeedPost,
  type CommunityFeedPost,
} from '../../community/communityModels';

interface AuthorProfile {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string;
  bio?: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  story_count: number;
  is_following?: boolean;
}

interface FollowUser {
  id: string;
  name: string;
  avatar_url?: string;
}

const DEFAULT_FOLLOW_LIST_TYPE: 'followers' | 'following' = 'followers';

function fmtDate(ts?: string) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function fmtTime(ts: string, t: any) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return t.timeMinAgo.replace('{n}', String(Math.floor(d / 60)));
  if (d < 86400) return t.timeHourAgo.replace('{n}', String(Math.floor(d / 3600)));
  return t.timeDayAgo.replace('{n}', String(Math.floor(d / 86400)));
}

// ── FollowListModal (Bluesky 팔로워/팔로잉 리스트 패턴) ─────────────────────
function FollowListModal({
  visible, title, authorId, type, onClose, navigation, t
}: {
  visible: boolean; title: string; authorId: string;
  type: 'followers' | 'following'; onClose: () => void; navigation: any; t: any;
}) {
  const followListQuery = useQuery({
    queryKey: ['follow-list', authorId, type],
    queryFn: async () => {
      const resp = await authedFetch(`/authors/${authorId}/${type}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return (data.users ?? []) as FollowUser[];
    },
    enabled: visible && !!authorId,
    staleTime: 30_000 });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={ms.overlay} />
      </TouchableWithoutFeedback>
      <Animated.View entering={SlideInDown.springify().damping(20)} style={ms.sheet}>
        <View style={ms.sheetHandle} />
        <View style={ms.sheetHeader}>
          <Text style={ms.sheetTitle}>{title}</Text>
          <PressableOpacity onPress={onClose}><X size={18} color={'#797990'} /></PressableOpacity>
        </View>
        {followListQuery.isLoading ? (
          <ActivityIndicator color={'#D4A853'} style={{ marginTop: 24 }} />
        ) : (
          <FlashList
            data={followListQuery.data ?? []}
            keyExtractor={(u: FollowUser) => u.id}
            estimatedItemSize={56}
            renderItem={({ item }: { item: FollowUser }) => (
              <PressableOpacity
                style={ms.userRow}
                onPress={() => { onClose(); navigation.navigate('AuthorProfile', { authorId: item.id, authorName: item.name }); }}
              >
                <View style={ms.userAvatar}>
                  <Text style={ms.userAvatarTxt}>{item.name[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={ms.userName}>{item.name}</Text>
                <ChevronRight size={14} color={'#4A4A5E'} />
              </PressableOpacity>
            )}
            // eslint-disable-next-line
            ListEmptyComponent={<EmptyState type="empty" title={t.nothing} subtitle="" />}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export function UserProfileDetailScreen({ route, navigation }: any) {
  const authorId: string = route.params?.authorId ?? '';
  const { lang, t } = useLanguageStore(useShallow(s => ({ lang: s.appLanguage, t: s.t })));
  const currentUser = useAuthStore(s => s.user);
  const jwtToken = currentUser?.jwtToken ?? '';
  const insets = useSafeAreaInsets();

  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
  const [tab, setTab] = useState<'posts' | 'stories'>('posts');

  // ── 프로필 조회 ──────────────────────────────────────────────────────────
  const profileQuery = useQuery({
    queryKey: ['author-profile-detail', authorId, jwtToken],
    queryFn: async () => {
      const resp = await authedFetch(`/authors/${authorId}/profile`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.author as AuthorProfile;
    },
    staleTime: 60_000,
    enabled: !!authorId });

  const profile = profileQuery.data;

  // ── 팔로우 ───────────────────────────────────────────────────────────────
  const { isFollowing, followerCount, isPending: followPending, toggleFollow } = useFollow({
    authorId,
    initialFollowing: profile?.is_following ?? false,
    initialFollowerCount: profile?.follower_count ?? 0,
    invalidateKeys: [['author-profile-detail', authorId], ['follow-feed']] });

  // ── 게시글 목록 ──────────────────────────────────────────────────────────
  const postsQuery = useInfiniteQuery({
    queryKey: ['author-posts', authorId, tab, jwtToken],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20', tab });
      if (pageParam) params.set('cursor', String(pageParam));
      const resp = await authedFetch(`/authors/${authorId}/posts?${params}`);
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
    enabled: !!authorId });

  const posts = postsQuery.data ?? [];
  const isMe = currentUser?.id === authorId;
  const authorDate = fmtDate((profile as any)?.created_at ?? (profile as any)?.createdAt ?? posts[posts.length - 1]?.created_at ?? posts[0]?.created_at);

  const handleReport = useCallback(async () => {
    try {
      await authedFetch(`/authors/${authorId}/report`, { method: 'POST' });
      ToastService.success(t.reportSubmitted);
    } catch {
      ToastService.error(t.reportFail);
    }
  }, [authorId, t.reportFail, t.reportSubmitted]);

  const handleBlock = useCallback(async () => {
    try {
      await authedFetch(`/authors/${authorId}/block`, { method: 'POST' });
      ToastService.success(t.blockConfirmed);
      navigation.goBack();
    } catch {
      ToastService.error(t.blockFail);
    }
  }, [authorId, navigation, t.blockConfirmed, t.blockFail]);

  const renderPost = useCallback(({ item, index }: ListRenderItemInfo<CommunityFeedPost>) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <PressableOpacity
        style={[s.postCard, item.boardType === 'webnovel' && s.postCardNovel]}
        onPress={() => {
          if (item.boardType === 'webnovel') navigation.navigate('CommunityPostDetail', { postId: item.id });
          else navigation.navigate('CommunityPostDetail', { postId: item.id });
        }}
      >
        {item.boardType === 'webnovel' && <View style={s.novelBar} />}
        <Text style={s.postTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.content && <Text style={s.postPreview} numberOfLines={1}>{item.content}</Text>}
        <View style={s.postMeta}>
          <Heart size={10} color={'#FF6B8B'} /><Text style={s.metaTxt}>{formatCount(item.likeCount, lang)}</Text>
          <MessageCircle size={10} color={'#60A5FA'} /><Text style={s.metaTxt}>{item.commentCount}</Text>
          <Eye size={10} color={'#797990'} /><Text style={s.metaTxt}>{formatCount(item.viewCount, lang)}</Text>
          <Text style={s.metaDot}>·</Text>
          <Text style={s.metaTxt}>{fmtTime(item.createdAt, t)}</Text>
        </View>
      </PressableOpacity>
    </Animated.View>
  ), [navigation, lang, t]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} translucent />

      {/* 헤더 */}
      <View style={[s.navBar, { paddingTop: insets.top + 8 }]}>
        <PressableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={'#F0F0F5'} />
        </PressableOpacity>
        {!isMe && (
          <View style={s.navActions}>
            <PressableOpacity style={s.menuBtn} onPress={handleReport}>
              <Flag size={16} color={'#8A8A9E'} />
            </PressableOpacity>
            <PressableOpacity style={s.menuBtn} onPress={handleBlock}>
              <Ban size={16} color={'#8A8A9E'} />
            </PressableOpacity>
          </View>
        )}
      </View>

      {profileQuery.isLoading ? (
        <View style={s.loadWrap}><ActivityIndicator color={'#D4A853'} /></View>
      ) : !profile ? (
        <EmptyState type="error" title={t.profileLoadFail} subtitle="" />
      ) : (
        <FlashList
          data={posts}
          keyExtractor={(item: CommunityFeedPost) => item.id}
          renderItem={renderPost}
          estimatedItemSize={120}
          contentContainerStyle={s.listPad}
          showsVerticalScrollIndicator={false}
          onEndReached={() => { if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) postsQuery.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={postsQuery.isRefetching} onRefresh={() => postsQuery.refetch()} tintColor={'#D4A853'} />
          }
          ListHeaderComponent={(
            <>
              {/* 커버 + 아바타 헤더 */}
              <Animated.View entering={FadeIn.duration(400)}>
                <LinearGradient
                  colors={['rgba(139,92,246,0.3)', 'rgba(212,168,83,0.15)', '#050507']}
                  style={s.coverGradient}
                />
                <View style={s.profileSection}>
                  <View style={s.profileHeroRow}>
                    <View style={s.avatarWrap}>
                      <LinearGradient colors={['#8B5CF6', '#D4A853']} style={s.avatarGrad}>
                        <Text style={s.avatarTxt}>{profile.name[0]?.toUpperCase() ?? '?'}</Text>
                      </LinearGradient>
                    </View>
                    <View style={s.profileMetaCol}>
                      <Text style={s.profileNameGlow}>{profile.name}</Text>
                      {!!authorDate && <Text style={s.authorDateText}>{authorDate}</Text>}
                    </View>
                    {!isMe && (
                      <View style={s.profileHeroFollowSlot}>
                        <PressableOpacity
                          style={[s.followBtn, isFollowing && s.followBtnActive]}
                          onPress={toggleFollow}
                          disabled={followPending}
                        >
                          {isFollowing
                            ? <UserCheck size={15} color={'#CFC3FF'} />
                            : <UserPlus size={15} color={'#FFFFFF'} />
                          }
                          <Text style={[s.followBtnTxt, isFollowing && s.followBtnTxtActive]}>
                            {isFollowing ? t.followingBtn : t.followBtn}
                          </Text>
                        </PressableOpacity>
                      </View>
                    )}
                  </View>
                  {!!profile.bio && <Text style={s.profileBio}>{profile.bio}</Text>}

                  {/* 팔로워/팔로잉 카운터 */}
                  <View style={s.statsRow}>
                    <PressableOpacity style={s.stat} onPress={() => setFollowModal('followers')}>
                      <Text style={s.statNum}>{formatCount(followerCount, lang)}</Text>
                      <Text style={s.statLabel}>{t.follower}</Text>
                    </PressableOpacity>
                    <View style={s.statDivider} />
                    <PressableOpacity style={s.stat} onPress={() => setFollowModal('following')}>
                      <Text style={s.statNum}>{formatCount(profile.following_count, lang)}</Text>
                      <Text style={s.statLabel}>{t.following}</Text>
                    </PressableOpacity>
                    <View style={s.statDivider} />
                    <View style={s.stat}>
                      <Text style={s.statNum}>{profile.post_count}</Text>
                      <Text style={s.statLabel}>{t.postCount}</Text>
                    </View>
                  </View>

                </View>

                {/* 탭 */}
                <View style={s.tabs}>
                  {(['posts', 'stories'] as const).map(k => (
                    <PressableOpacity key={k} style={s.tabItem} onPress={() => setTab(k)}>
                      <Text style={[s.tabTxt, tab === k && s.tabActive]}>
                        {k === 'posts' ? t.postCount : t.storiesLabel}
                      </Text>
                      {tab === k && <View style={s.tabUnder} />}
                    </PressableOpacity>
                  ))}
                </View>
              </Animated.View>
            </>
          )}
          ListEmptyComponent={<EmptyState type="empty" title={t.noPostsLabel} subtitle="" />}
          ListFooterComponent={postsQuery.isFetchingNextPage ? (
            <View style={s.loader}><ActivityIndicator color={'#D4A853'} /></View>
          ) : null}
        />
      )}

      {/* 팔로워/팔로잉 모달 */}
      <FollowListModal
        visible={!!followModal}
        title={followModal === 'followers' ? t.follower : t.followingBtn}
        authorId={authorId}
        type={followModal ?? DEFAULT_FOLLOW_LIST_TYPE}
        onClose={() => setFollowModal(null)}
        navigation={navigation}
        t={t}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(12,12,20,0.8)', alignItems: 'center', justifyContent: 'center' },
  navActions: { flexDirection: 'row', gap: 8 },
  menuBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(12,12,20,0.8)', alignItems: 'center', justifyContent: 'center' },

  coverGradient: { height: 120 },
  profileSection: { paddingHorizontal: 20, gap: 10, marginTop: -50 },
  profileHeroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%', flexWrap: 'nowrap' },
  profileMetaCol: { flex: 1, flexBasis: 0, minWidth: 0, gap: 2, justifyContent: 'center' },
  profileHeroFollowSlot: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 'auto', flexShrink: 0 },
  avatarWrap: { borderRadius: 46, overflow: 'hidden', elevation: 12 },
  avatarGrad: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', borderRadius: 44, flexShrink: 0 },
  avatarTxt: { fontSize: 36, fontFamily: Typography.fontFamily.extrabold, color: '#050507' },
  profileName: { fontSize: 22, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', letterSpacing: -0.4 },
  profileNameGlow: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#E6C46A',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(138,92,246,0.48)',
    textShadowRadius: 12,
  },
  authorDateText: { fontSize: 12, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },
  profileBio: { fontSize: 13, color: '#8A8A9E', textAlign: 'left', lineHeight: 20, fontFamily: Typography.fontFamily.regular },
  statsRow: { flexDirection: 'row', marginTop: 8, backgroundColor: '#0C0C18', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#181820', overflow: 'hidden' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statNum: { fontSize: 18, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5' },
  statLabel: { fontSize: 11, color: '#797990', fontFamily: Typography.fontFamily.regular },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#1A1A24', alignSelf: 'stretch' },
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#6D4AFF', borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 11, marginTop: 0 },
  followBtnActive: { backgroundColor: 'rgba(109,74,255,0.16)', borderWidth: 1.5, borderColor: '#6D4AFF' },
  followBtnTxt: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#FFFFFF' },
  followBtnTxtActive: { color: '#CFC3FF' },

  tabs: { flexDirection: 'row', marginTop: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#181820' },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabTxt: { fontSize: 14, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabActive: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabUnder: { position: 'absolute', bottom: 0, height: 2.5, width: 36, backgroundColor: '#D4A853', borderRadius: 2 },

  listPad: { paddingHorizontal: 14, paddingBottom: 100 },
  postCard: {
    backgroundColor: '#0E0E14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, marginTop: 8, gap: 6, position: 'relative', overflow: 'hidden' },
  postCardNovel: { borderColor: 'rgba(212,168,83,0.2)', backgroundColor: '#0C0C12' },
  novelBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#8B5CF6', borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg },
  postTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  postPreview: { fontSize: 12, color: '#8A8A9E', fontFamily: Typography.fontFamily.regular },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 10, color: '#6A6A84', fontFamily: Typography.fontFamily.regular },
  metaDot: { fontSize: 10, color: '#3A3A4E' },

  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loader: { paddingVertical: 16, alignItems: 'center' } });

// ── Modal styles ────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0E0E18', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingBottom: 40, maxHeight: '70%' },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#2A2A3A', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#181820' },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' },
  userAvatarTxt: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#8B5CF6' },
  userName: { flex: 1, fontSize: 15, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5' } });
