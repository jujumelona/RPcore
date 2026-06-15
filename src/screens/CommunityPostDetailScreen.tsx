
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useCallback, useEffect, useState } from 'react';
import { Dimensions, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withSpring,
  runOnJS } from 'react-native-reanimated';
import { useMutation, useQueryClient } from '@tanstack/react-query';


import { CircleAlert, ArrowLeft, ArrowRight, BookOpen, ChevronRight, Clock, Flag, Heart, MessageCircle, MessageSquare, MoreVertical } from 'lucide-react-native';

import { Space, Radius, Typography, Typo } from '../constants/tokens';
import { PressableOpacity } from '../components/PressableOpacity';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { getCommunityNovelPost, toggleLikeCommunityNovelPost } from '../utils/communityNovelStore';
import { getWebNovel, saveWebNovel } from '../utils/webNovelStorage';
import { NovelAPI, type NovelPostDetail } from '../api/NovelAPI';
import { CommentsSection } from '../components/CommentsSection';
import { PremiumBackdrop } from '../components/ui/PremiumSurface';
import { ReportModal } from '../components/ReportModal';
import { isOwner } from '../core/user';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmModal } from '../components/ConfirmModal';
import { ToastService } from '../components/Toast';

const HERO_HEIGHT = 220;

function formatTime(timestamp: number, t: Record<string, string | undefined>): string {
  const diffSeconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return t.timeJustNow!;
  if (diffSeconds < 3600) return t.timeMinAgo!.replace('{n}', String(Math.floor(diffSeconds / 60)));
  if (diffSeconds < 86400) return t.timeHourAgo!.replace('{n}', String(Math.floor(diffSeconds / 3600)));
  return t.timeDayAgo!.replace('{n}', String(Math.floor(diffSeconds / 86400)));
}

function AuthorCard({
  authorId,
  authorName,
  navigation,
  authorLabel,
  viewProfileLabel }: {
  authorId: string;
  authorName: string;
  navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
  authorLabel: string;
  viewProfileLabel: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const initial = (authorName ?? '?')[0]?.toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(260).springify().damping(22)} style={style}>
      <PressableOpacity
        style={styles.authorCard}
        onPressIn={() => {
          scale.value = withSpring(0.97, { stiffness: 260, damping: 20 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { stiffness: 260, damping: 20 });
        }}
        onPress={() => navigation.navigate('AuthorProfile', { authorId })}
        activeOpacity={1}
      >
        <View style={styles.authorAvatar}>
          <Text style={styles.authorInitial}>{initial}</Text>
        </View>

        <View style={styles.authorInfo}>
          <Text style={styles.authorLabel}>{authorLabel}</Text>
          <Text style={styles.authorName}>{authorName}</Text>
        </View>

        <View style={styles.authorChevronWrap}>
          <Text style={styles.authorProfileLink}>{viewProfileLabel}</Text>
          <ChevronRight size={14} color={'#D4A853'} />
        </View>
      </PressableOpacity>
    </Animated.View>
  );
}

function NovelHeroBanner({ title, tags }: { title: string; tags: string[] }) {
  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.heroBanner}>
      <LinearGradient
        colors={['#08080C', '#0E0E14', '#050507']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />

        <View style={styles.heroContent}>
          <BookOpen size={32} color={'#D4A853'} style={{ marginBottom: 10 }} />
          <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>

          {tags.length > 0 && (
            <View style={styles.heroTagRow}>
              {tags.slice(0, 4).map(tag => (
                <View key={tag} style={styles.heroTag}>
                  <Text style={styles.heroTagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export function CommunityPostDetailScreen({ route, navigation }: { route: import('@react-navigation/native').RouteProp<import('../types/navigation').RootStackParamList, 'CommunityPostDetail'>; navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>> }) {
  const { postId, isLocal } = route.params;
  const user = useAuthStore(state => state.user);
  const { t } = useLanguageStore();
  const queryClient = useQueryClient();

  const [post, setPost] = useState<NovelPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [manageModal, setManageModal] = useState(false);
  const [_ownerMenuVisible, _setOwnerMenuVisible] = useState(false);

  const isAuthor = isOwner(user, post?.authorId);

  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const buttonScale = useSharedValue(1);
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));

  const labels = {
    postTitle: t.writePost,
    notFound: t.noPosts,
    goBack: t.back,
    author: t.authorLabel,
    viewProfile: t.viewAll,
    preview: t.novelPreview,
    authorNote: t.authorNote,
    readWebNovel: t.webnovelTag };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        if (isLocal) {
          const local = getCommunityNovelPost(postId);
          if (local && !cancelled) {
            const novel = getWebNovel(local.novelId);
            setPost({
              id: local.id,
              title: local.title,
              content: local.content,
              tags: local.tags,
              novelPreview: local.novelPreview,
              authorId: local.authorId,
              authorName: local.authorName,
              likeCount: local.likeCount,
              commentCount: local.commentCount,
              likedByMe: local.likedByMe,
              createdAt: local.createdAt,
              lang: 'en',
              boardType: 'webnovel',
              novelBody: novel?.paragraphs ?? [],
              emotionData: novel?.emotionData ?? {},
              characters: novel?.characters ?? [] });
            setLiked(local.likedByMe);
          }
        } else {
          const data = await NovelAPI.getPost(postId);
          if (!cancelled && data) {
            setPost(data);
            setLiked(data.likedByMe);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, isLocal]);

  // ✅ [OPT] TanStack useMutation — 서버 좋아요 토글 낙관적 업데이트
  // onMutate: 즉시 UI 반영 → 서버 응답 대기 없이 하트 애니메이션 + 카운트 변경
  // onError:  서버 실패 시 이전 상태로 자동 롤백
  // onSettled: 서버 응답으로 최종 동기화 + QueryCache 갱신
  const likeMutation = useMutation({
    mutationFn: async (_nextLiked: boolean) => {
      if (isLocal) {
        if (!post) throw new Error('post not found');
        return toggleLikeCommunityNovelPost(post.id);
      }
      const token = user?.jwtToken ?? '';
      if (!token || !post) throw new Error('unauthenticated or post not found');
      return NovelAPI.toggleLike(post.id, token);
    },
    onMutate: async (nextLiked: boolean) => {
      // 낙관적 업데이트: 즉시 UI에 반영
      const previousLiked = liked;
      const previousPost  = post;
      setLiked(nextLiked);
      setPost(prev => prev ? {
        ...prev,
        likedByMe: nextLiked,
        likeCount: prev.likeCount + (nextLiked ? 1 : -1) } : prev);
      // 커뮤니티 목록 캐시도 낙관적 업데이트
      queryClient.setQueriesData(
        { queryKey: ['community-posts'] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              posts: (page.posts as any[] | undefined)?.map((p: any) =>
                p.id === post?.id
                  ? { ...p, like_count: p.like_count + (nextLiked ? 1 : -1), liked_by_me: nextLiked }
                  : p,
              ) })) };
        },
      );
      return { previousLiked, previousPost };
    },
    onError: (_err, _nextLiked, context) => {
      // 실패 시 이전 상태로 롤백
      if (context) {
        setLiked(context.previousLiked);
        setPost(context.previousPost);
      }
    },
    onSuccess: (result) => {
      // 서버 응답으로 최종 동기화
      if (result && typeof result === 'object' && 'likedByMe' in result) {
        setPost(prev => prev ? {
          ...prev,
          likedByMe: (result as any).likedByMe,
          likeCount: (result as any).likeCount ?? prev.likeCount } : prev);
        setLiked((result as any).likedByMe);
      }
    },
    onSettled: () => {
      // 커뮤니티 목록 캐시 백그라운드 리프레시
      queryClient.invalidateQueries({ queryKey: ['community-posts'], refetchType: 'none' });
    } });

  const handleLike = useCallback(() => {
    if (!post) return;
    heartScale.value = withSpring(1.5, { damping: 8, stiffness: 400 }, () => {
      heartScale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });
    likeMutation.mutate(!liked);
  }, [heartScale, liked, post, likeMutation]);

  const handleReadNovel = useCallback(() => {
    if (!post || post.novelBody.length === 0) return;

    // ✅ [FIX] saveWebNovel / getWebNovel / navigation 은 JS thread 함수이므로
    //    withSpring callback(worklet context) 바깥에서 먼저 처리한다.
    //    worklet 내에서 직접 호출하면 Reanimated 런타임 크래시 발생.
    const cacheId = `community_${post.id}`;
    if (!getWebNovel(cacheId)) {
      // [BUG FIX] initialEmotions: {} → characters에서 초기 감정 구성
      // buildPrefixEmotions가 initialEmotions를 기반으로 모든 prefix를 계산하므로
      // 빈 객체를 전달하면 감정 바가 항상 0으로 시작함
      const initialEmotions: Record<number, { e1: number; e2: number; e3: number; e4: number; e5: number }> = {};
      for (const char of post.characters) {
        initialEmotions[char.id] = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
      }
      saveWebNovel({
        id: cacheId,
        storyId: post.id,
        title: post.title,
        createdAt: post.createdAt,
        paragraphs: post.novelBody,
        emotionData: post.emotionData,
        initialEmotions,
        characters: post.characters });
    }

    const doNavigate = () => navigation.navigate('WebNovelReader', { novelId: cacheId });

    buttonScale.value = withSpring(0.93, { damping: 20, stiffness: 400 }, () => {
      buttonScale.value = withSpring(1, { damping: 12, stiffness: 300 });
      runOnJS(doNavigate)();
    });
  }, [buttonScale, navigation, post]);

  // ✅ [FIX] 본인 게시물 삭제
  const handleDeletePost = useCallback(() => {
    setDeleteModal(true);
  }, []);

  const doDelete = useCallback(async () => {
    setDeleteModal(false);
    const token = user?.jwtToken ?? '';
    if (!token || !post) return;
    const ok = await NovelAPI.deletePost(post.id, token);
    if (ok) {
      navigation.goBack();
    } else {
      ToastService.error(t.postDeleteFailed);
    }
  }, [navigation, post, user, t]);

  // ✅ [FIX #1] 본인 게시물 수정 — 기존엔 post 데이터 없이 빈 WritePost로 이동해 새 글 작성 화면이 열리는 버그
  // post의 id, title, content, boardType을 params로 전달하여 WritePostScreen이 편집 모드로 열림
  const handleEditPost = useCallback(() => {
    if (!post) return;
    navigation.navigate('WritePost', {
      editPostId:      post.id,
      initialTitle:    post.title,
      initialContent:  post.content ?? '',
      ...(post.boardType ? { boardType: post.boardType } : {}) });
  }, [navigation, post]);

  // ✅ [FIX] 신고 핸들러 — Alert 가짜 신고 → ReportModal 실제 서버 전송
  const handleReport = useCallback(() => {
    setReportVisible(true);
  }, []);

  if (loading) {
    return (
      <View style={styles.backdropRoot}>
        <PremiumBackdrop animated />
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}><Spinner size={32} color={'#D4A853'} /></View>
      </SafeAreaView>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.backdropRoot}>
        <PremiumBackdrop animated />
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <CircleAlert size={48} color={'#797990'} />
          <Text style={styles.emptyText}>{labels.notFound}</Text>
          <PressableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>{labels.goBack}</Text>
          </PressableOpacity>
        </View>
      </SafeAreaView>
      </View>
    );
  }

  const hasNovel = post.novelBody.length > 0;

  return (
    <View style={styles.backdropRoot}>
      <PremiumBackdrop animated />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
    <SafeAreaView style={styles.safe}>

      <Animated.View entering={FadeIn.duration(220)} style={styles.header}>
        <PressableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={22} color={'#F0F0F5'} />
        </PressableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{labels.postTitle}</Text>
        {isAuthor ? (
          <PressableOpacity
            onPress={() => setManageModal(true)}
            style={styles.backButton}
          >
            <MoreVertical size={20} color={'#8A8A9E'} />
          </PressableOpacity>
        ) : (
          <PressableOpacity onPress={handleReport} style={styles.backButton}>
            <Flag size={20} color={'#8A8A9E'} />
          </PressableOpacity>
        )}
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: hasNovel ? 100 : 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <NovelHeroBanner title={post.title} tags={post.tags} />

        <AuthorCard
          authorId={post.authorId}
          authorName={post.authorName}
          navigation={navigation}
          authorLabel={labels.author}
          viewProfileLabel={labels.viewProfile}
        />

        <Animated.View entering={FadeInDown.delay(130).duration(220)} style={styles.metaRow}>
          <Clock size={13} color={'#797990'} />
          <Text style={styles.metaTime}>{formatTime(post.createdAt, t)}</Text>
          <View style={styles.metaDot} />
          <Heart size={13} color={'#797990'} />
          <Text style={styles.metaTime}>{post.likeCount}</Text>
          <View style={styles.metaDot} />
          <MessageCircle size={13} color={'#797990'} />
          <Text style={styles.metaTime}>{post.commentCount}</Text>
        </Animated.View>

        {!!post.novelPreview && (
          <Animated.View entering={FadeInDown.delay(170).duration(240)} style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <BookOpen size={15} color={'#D4A853'} />
              <Text style={styles.previewLabel}>{labels.preview}</Text>
            </View>
            <View style={styles.previewDivider} />
            <Text style={styles.previewText}>{post.novelPreview}</Text>
          </Animated.View>
        )}

        {!!post.content && (
          <Animated.View entering={FadeInDown.delay(210).duration(240)} style={styles.authorNoteCard}>
            <View style={styles.authorNoteHeader}>
              <MessageSquare size={14} color={'#797990'} />
              <Text style={styles.authorNoteLabel}>{labels.authorNote}</Text>
            </View>
            <Text style={styles.authorNoteText}>{post.content}</Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(240).duration(220)} style={styles.reactRow}>
          <PressableOpacity style={styles.likeButton} onPress={handleLike} activeOpacity={0.8}>
            <Animated.View style={heartStyle}>
              <Heart size={22} color={liked ? '#FF5555' : '#797990'} fill={liked ? '#FF5555' : 'none'} />
            </Animated.View>
            <Text style={[styles.likeCount, liked && { color: '#FF5555' }]}>{post.likeCount}</Text>
          </PressableOpacity>
        </Animated.View>

        <View style={styles.divider} />
        <CommentsSection
          postId={post.id}
          navigation={navigation}
          myName={user?.name ?? t.drawerYou}
          myAvatar={user?.avatarUri ?? undefined}
        />
      </ScrollView>

      {hasNovel && (
        <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.ctaBar}>
          <PressableOpacity style={styles.ctaButton} onPress={handleReadNovel} activeOpacity={1}>
            <Animated.View style={[styles.ctaButtonInner, buttonStyle]}>
              <BookOpen size={20} color={'#050507'} />
              <Text style={styles.ctaButtonText}>{labels.readWebNovel}</Text>
              <ArrowRight size={18} color={'#050507'} />
            </Animated.View>
          </PressableOpacity>
        </Animated.View>
      )}

      {/* ✅ [FIX] 게시물 신고 — ReportModal 실제 서버 전송 */}
      {post && (
        <ReportModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          targetType="post"
          targetId={post.id}
        />
      )}
      {/* 삭제 확인 모달 */}
      <ConfirmModal
        visible={deleteModal}
        icon="trash-outline"
        iconColor={'#FF5555'}
        title={t.postDeleteTitle}
        message={t.deleteConfirmMsg}
        onRequestClose={() => setDeleteModal(false)}
        actions={[
          { label: t.delete, variant: 'danger', onPress: doDelete },
          { label: t.cancel, variant: 'default', onPress: () => setDeleteModal(false) },
        ]}
      />
      {/* 관리 모달 */}
      <ConfirmModal
        visible={manageModal}
        icon="create-outline"
        iconColor={'#D4A853'}
        title={t.postManage}
        onRequestClose={() => setManageModal(false)}
        actions={[
          { label: t.editComment, variant: 'primary', onPress: () => { setManageModal(false); handleEditPost(); } },
          { label: t.delete, variant: 'danger', onPress: () => { setManageModal(false); handleDeletePost(); } },
          { label: t.cancel, variant: 'default', onPress: () => setManageModal(false) },
        ]}
      />
    </SafeAreaView>
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdropRoot: { flex: 1, backgroundColor: '#050507' },
  safe: { flex: 1, backgroundColor: '#050507' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space['4'],
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typo.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5' },

  scroll: { flex: 1 },
  scrollContent: { gap: Space['3'] },

  heroBanner: { marginHorizontal: 0, height: HERO_HEIGHT, width: SCREEN_WIDTH },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Space['5'],
    position: 'relative',
    overflow: 'hidden' },
  heroDeco1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: `${'#D4A853'}12` },
  heroDeco2: {
    position: 'absolute',
    top: 30,
    right: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${'#D4A853'}08` },
  heroContent: { gap: 10 },
  heroTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#F0F0F5',
    lineHeight: 28,
    letterSpacing: -0.3 },
  heroTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroTag: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)' },
  heroTagText: { fontSize: 11, color: '#8A8A9E' },

  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space['4'],
    backgroundColor: 'rgba(18,20,28,0.75)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Space['3'],
    gap: Space['3'] },
  authorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(212,168,83,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: `${'#D4A853'}60` },
  authorInitial: { fontSize: 18, fontFamily: Typography.fontFamily.extrabold, color: '#D4A853' },
  authorInfo: { flex: 1, gap: 2 },
  authorLabel: {
    fontSize: 10,
    color: '#797990',
    fontFamily: Typography.fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8 },
  authorName: { fontSize: 15, color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  authorChevronWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  authorProfileLink: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.semibold },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Space['5'] },
  metaTime: { fontSize: 12, color: '#797990' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#797990' },

  previewCard: {
    marginHorizontal: Space['4'],
    backgroundColor: 'rgba(18,20,28,0.75)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.30)',
    padding: 16,
    gap: 10 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewLabel: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  previewDivider: { height: 1, backgroundColor: 'rgba(212,168,83,0.30)' },
  previewText: { fontSize: 14, color: '#C8C8D4', lineHeight: 22, fontStyle: 'italic' },

  authorNoteCard: {
    marginHorizontal: Space['4'],
    backgroundColor: '#18181F',
    borderRadius: Radius.md,
    padding: Space['4'],
    gap: 8 },
  authorNoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorNoteLabel: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.semibold },
  authorNoteText: { fontSize: 14, color: '#8A8A9E', lineHeight: 22 },

  reactRow: { paddingHorizontal: Space['5'], paddingVertical: Space['1'] },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: '#18181F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)' },
  likeCount: { fontSize: 14, color: '#797990', fontFamily: Typography.fontFamily.semibold },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#1A1A24',
    marginHorizontal: Space['4'] },

  ctaBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space['4'],
    paddingVertical: Space['3'],
    paddingBottom: Space['5'],
    backgroundColor: `${'#050507'}F0`,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24' },
  ctaButton: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#D4A853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10 },
  ctaButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#D4A853',
    paddingVertical: 15,
    borderRadius: Radius.lg },
  ctaButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#050507',
    letterSpacing: 0.3 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: '#797990' },
  backLink: { fontSize: 14, color: '#D4A853', marginTop: 4 } });
