
// src/screens/MyContentScreen.tsx
// 내 글 관리 — 내가 작성한 커뮤니티 게시글 + 댓글 목록, 삭제/수정 가능

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator, TextInput, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2, Edit3, MessageCircle, FileText, Heart } from 'lucide-react-native';
import { authedFetch } from '../utils/authedFetch';
import { useLanguageStore } from '../store/languageStore';
import { useShallow } from 'zustand/react/shallow';
import {
  normalizeCommunityBoardType,
  normalizeCommunityFeedPost,
  type CommunityFeedPost,
} from '../community/communityModels';

// ─── Types ──────────────────────────────────────────────────────────────────
interface MyComment {
  id: string;
  content: string;
  post_id: string;
  post_title?: string;
  like_count: number;
  created_at: string;
}

type Tab = 'free' | 'webnovel' | 'comments';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRelativeTime(iso: string, t: Record<string, string | undefined>, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return t.timeJustNow ?? '';
  if (m < 60) return (t.timeMinAgo ?? '').replace('{n}', String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return (t.timeHourAgo ?? '').replace('{n}', String(h));
  const d = Math.floor(h / 24);
  if (d < 30) return (t.timeDayAgo ?? '').replace('{n}', String(d));
  return new Date(iso).toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchMyPosts(): Promise<CommunityFeedPost[]> {
  const res = await authedFetch('/community/posts/mine');
  if (!res.ok) throw new Error('posts fetch failed');
  const data = await res.json() as { posts?: unknown[] };
  return Array.isArray(data.posts)
    ? data.posts
        .map((post) => {
          if (post && typeof post === 'object') {
            const record = post as Record<string, unknown>;
            if (record.board_type === undefined && record.boardType === undefined) {
              return normalizeCommunityFeedPost({ ...record, board_type: 'free' });
            }
          }
          return normalizeCommunityFeedPost(post);
        })
        .filter((post): post is CommunityFeedPost => post !== null)
    : [];
}

async function fetchMyComments(): Promise<MyComment[]> {
  const res = await authedFetch('/community/comments/mine');
  if (!res.ok) throw new Error('comments fetch failed');
  const data = await res.json() as { comments?: MyComment[] };
  return data.comments ?? [];
}

async function deletePost(postId: string): Promise<void> {
  const res = await authedFetch(`/community/posts/${postId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('delete post failed');
}

async function deleteComment(commentId: string): Promise<void> {
  const res = await authedFetch(`/community/comments/${commentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('delete comment failed');
}

async function updateComment(commentId: string, content: string): Promise<void> {
  const res = await authedFetch(`/community/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }) });
  if (!res.ok) throw new Error('update comment failed');
}

// ─── Post Item ────────────────────────────────────────────────────────────────
const PostItem = React.memo(function PostItem({
  item,
  onDelete }: {
  item: CommunityFeedPost;
  onDelete: (id: string) => void;
}) {
  const { t, appLanguage } = useLanguageStore(useShallow((s: any) => ({ t: s.t, appLanguage: s.appLanguage })));
  const boardType = normalizeCommunityBoardType(item.boardType);
  const boardTypeLabel = boardType === 'webnovel'
    ? (t?.webnovelTag ?? '')
    : (t?.myContentTabFree ?? '');
  return (
    <View style={st.card}>
      <View style={st.cardHeader}>
        <View style={st.boardBadge}>
          <FileText size={10} color="#9D8DF1" />
          <Text style={st.boardBadgeText}>{boardTypeLabel}</Text>
        </View>
        <Text style={st.timeText}>{formatRelativeTime(item.createdAt, t as Record<string, string | undefined>, appLanguage)}</Text>
      </View>

      <Text style={st.postTitle} numberOfLines={2}>{item.title ?? t?.defaultStoryTitle}</Text>
      <Text style={st.postContent} numberOfLines={3}>{item.content}</Text>

      <View style={st.cardFooter}>
        <View style={st.metaRow}>
          <View style={st.metaItem}>
            <Heart size={12} color="#EF4444" fill={item.likeCount > 0 ? "#EF4444" : "transparent"} />
            <Text style={st.metaText}>{item.likeCount ?? 0}</Text>
          </View>
          <View style={st.metaItem}>
            <MessageCircle size={12} color="#666" />
            <Text style={st.metaText}>{item.commentCount ?? 0}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={st.deleteBtn}
          onPress={() => {
            Alert.alert(t?.deletePost ?? '', t?.deletePostConfirm ?? '', [
              { text: t?.cancel ?? '', style: 'cancel' },
              { text: t?.delete ?? '', style: 'destructive', onPress: () => onDelete(item.id) },
            ]);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Trash2 size={16} color="#FF5555" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── Comment Item ─────────────────────────────────────────────────────────────
const CommentItem = React.memo(function CommentItem({
  item,
  onDelete,
  onEdit }: {
  item: MyComment;
  onDelete: (id: string) => void;
  onEdit: (item: MyComment) => void;
}) {
  const { t, appLanguage } = useLanguageStore(useShallow((s: any) => ({ t: s.t, appLanguage: s.appLanguage })));
  return (
    <View style={st.card}>
      <View style={st.cardHeader}>
        <View style={st.boardBadge}>
          <MessageCircle size={10} color="#9D8DF1" />
          <Text style={st.boardBadgeText}>{t?.comment ?? ''}</Text>
        </View>
        <Text style={st.timeText}>{formatRelativeTime(item.created_at, t as Record<string, string | undefined>, appLanguage)}</Text>
      </View>

      {item.post_title ? (
        <Text style={st.postTitleSmall} numberOfLines={1}>{item.post_title}</Text>
      ) : null}
      <Text style={st.postContent} numberOfLines={4}>{item.content}</Text>

      <View style={st.cardFooter}>
        <View style={st.metaRow}>
          <View style={st.metaItem}>
            <Heart size={12} color="#EF4444" fill={item.like_count > 0 ? "#EF4444" : "transparent"} />
            <Text style={st.metaText}>{item.like_count ?? 0}</Text>
          </View>
        </View>
        <View style={st.actionRow}>
          <TouchableOpacity
            style={[st.deleteBtn, { marginRight: 10 }]}
            onPress={() => onEdit(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Edit3 size={16} color="#9D8DF1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={st.deleteBtn}
            onPress={() => {
              Alert.alert(t?.deleteComment ?? '', t?.deleteCommentConfirm ?? '', [
                { text: t?.cancel ?? '', style: 'cancel' },
                { text: t?.delete ?? '', style: 'destructive', onPress: () => onDelete(item.id) },
              ]);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash2 size={16} color="#FF5555" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// ─── Edit Modal ────────────────────────────────────────────────────────────────
function EditCommentModal({
  visible,
  initialText,
  onSave,
  onClose }: {
  visible: boolean;
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);

  React.useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.modalOverlay}>
        <View style={st.modalBox}>
          <Text style={st.modalTitle}>{useLanguageStore.getState().t.editComment ?? ''}</Text>
          <TextInput
            style={st.editInput}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            placeholder={useLanguageStore.getState().t.commentPlaceholder ?? ''}
            placeholderTextColor="#555"
            autoFocus
          />
          <Text style={st.charCount}>{text.length} / 1000</Text>
          <View style={st.modalBtnRow}>
            <TouchableOpacity style={st.modalBtnCancel} onPress={onClose}>
              <Text style={st.modalBtnCancelText}>{useLanguageStore.getState().t.cancel ?? ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.modalBtnSave, !text.trim() && { opacity: 0.5 }]}
              onPress={() => { if (text.trim()) { onSave(text.trim()); onClose(); } }}
              disabled={!text.trim()}
            >
              <Text style={st.modalBtnSaveText}>{useLanguageStore.getState().t.save ?? ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function MyContentScreen({ navigation }: { navigation: any }) {
  const { t, appLanguage } = useLanguageStore(useShallow((s: any) => ({ t: s.t, appLanguage: s.appLanguage })));
  const [activeTab, setActiveTab] = useState<Tab>('free');
  const [editTarget, setEditTarget] = useState<MyComment | null>(null);
  const qc = useQueryClient();

  const postsQuery = useQuery({
    queryKey: ['my-posts'],
    queryFn: fetchMyPosts,
    retry: 1 });

  const commentsQuery = useQuery({
    queryKey: ['my-comments'],
    queryFn: fetchMyComments,
    retry: 1 });

  const deletPostMut = useMutation({
    mutationFn: deletePost,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-posts'] }),
    onError: () => Alert.alert(t?.error ?? '', t?.deletePostFailed ?? '') });

  const delCommentMut = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-comments'] }),
    onError: () => Alert.alert(t?.error ?? '', t?.deleteCommentFailed ?? '') });

  const editCommentMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateComment(id, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-comments'] }),
    onError: () => Alert.alert(t?.error ?? '', t?.editCommentFailed ?? '') });

  const handleDeletePost = useCallback((id: string) => {
    deletPostMut.mutate(id);
  }, [deletPostMut]);

  const handleDeleteComment = useCallback((id: string) => {
    delCommentMut.mutate(id);
  }, [delCommentMut]);

  const handleEditSave = useCallback((content: string) => {
    if (!editTarget) return;
    editCommentMut.mutate({ id: editTarget.id, content });
  }, [editTarget, editCommentMut]);

  const allPosts = postsQuery.data ?? [];
  const freePosts = allPosts.filter(p => p.boardType === 'free');
  const webnovelPosts = allPosts.filter(p => p.boardType === 'webnovel');
  const comments = commentsQuery.data ?? [];
  const isLoading = activeTab === 'comments' ? commentsQuery.isLoading : postsQuery.isLoading;
  const isRefreshing = activeTab === 'comments' ? commentsQuery.isFetching : postsQuery.isFetching;
  const posts = activeTab === 'free' ? freePosts : activeTab === 'webnovel' ? webnovelPosts : [];

  const renderPost = useCallback(({ item }: { item: CommunityFeedPost }) => (
    <PostItem item={item} onDelete={handleDeletePost} />
  ), [handleDeletePost]);

  const renderComment = useCallback(({ item }: { item: MyComment }) => (
    <CommentItem
      item={item}
      onDelete={handleDeleteComment}
      onEdit={setEditTarget}
    />
  ), [handleDeleteComment]);

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} color="#F0F0F5" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t?.myContent ?? t?.myPosts ?? ''}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={st.tabRow}>
        <TouchableOpacity
          style={[st.tab, activeTab === 'free' && st.tabActive]}
          onPress={() => setActiveTab('free')}
        >
          <FileText size={14} color={activeTab === 'free' ? '#9D8DF1' : '#666'} />
          <Text style={[st.tabText, activeTab === 'free' && st.tabTextActive]}>
            {(t?.myContentTabFree ?? '')}{freePosts.length > 0 ? ` (${freePosts.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.tab, activeTab === 'webnovel' && st.tabActive]}
          onPress={() => setActiveTab('webnovel')}
        >
          <FileText size={14} color={activeTab === 'webnovel' ? '#9D8DF1' : '#666'} />
          <Text style={[st.tabText, activeTab === 'webnovel' && st.tabTextActive]}>
            {(t?.webnovelTag ?? '')}{webnovelPosts.length > 0 ? ` (${webnovelPosts.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.tab, activeTab === 'comments' && st.tabActive]}
          onPress={() => setActiveTab('comments')}
        >
          <MessageCircle size={14} color={activeTab === 'comments' ? '#9D8DF1' : '#666'} />
          <Text style={[st.tabText, activeTab === 'comments' && st.tabTextActive]}>
            {(t?.comment ?? '')}{comments.length > 0 ? ` (${comments.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={st.centered}>
          <ActivityIndicator color="#9D8DF1" size="large" />
        </View>
      ) : activeTab !== 'comments' ? (
        <FlashList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          estimatedItemSize={140}
          contentContainerStyle={posts.length === 0 ? st.emptyContainer : st.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => postsQuery.refetch()}
              tintColor="#9D8DF1"
            />
          }
          ListEmptyComponent={
            <View style={st.emptyBox}>
              <FileText size={40} color="#333" />
              <Text style={st.emptyTitle}>{t?.noPostsYet ?? ''}</Text>
              <Text style={st.emptyDesc}>{t?.writeSomething ?? ''}</Text>
            </View>
          }
        />
      ) : (
        <FlashList
          data={comments}
          keyExtractor={i => i.id}
          renderItem={renderComment}
          estimatedItemSize={120}
          contentContainerStyle={comments.length === 0 ? st.emptyContainer : st.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => commentsQuery.refetch()}
              tintColor="#9D8DF1"
            />
          }
          ListEmptyComponent={
            <View style={st.emptyBox}>
              <MessageCircle size={40} color="#333" />
              <Text style={st.emptyTitle}>{t?.noCommentsYet ?? ''}</Text>
              <Text style={st.emptyDesc}>{t?.leaveComment ?? ''}</Text>
            </View>
          }
        />
      )}

      {/* Edit modal */}
      <EditCommentModal
        visible={editTarget !== null}
        initialText={editTarget?.content ?? ''}
        onSave={handleEditSave}
        onClose={() => setEditTarget(null)}
      />
    </SafeAreaView>
  );
}

export default MyContentScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#08080F' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52, borderBottomWidth: 0.5, borderBottomColor: '#1A1A28' },
  headerTitle:   { fontSize: 17, fontWeight: '600', color: '#F0F0F5', letterSpacing: -0.3 },

  tabRow:        { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#1A1A28' },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: '#9D8DF1' },
  tabText:       { fontSize: 14, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#9D8DF1', fontWeight: '600' },

  listContent:   { padding: 14, gap: 10 },
  emptyContainer: { flex: 1 },
  emptyBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 10 },
  emptyTitle:    { fontSize: 16, color: '#888', fontWeight: '600' },
  emptyDesc:     { fontSize: 13, color: '#555' },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card:          { backgroundColor: '#0F0F1C', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#1E1E30' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  boardBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1A1A2E', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  boardBadgeText:{ fontSize: 10, color: '#9D8DF1', fontWeight: '600' },
  timeText:      { fontSize: 11, color: '#555' },

  postTitle:     { fontSize: 15, fontWeight: '600', color: '#E8E8F0', marginBottom: 5, lineHeight: 21 },
  postTitleSmall:{ fontSize: 12, color: '#666', marginBottom: 6, fontStyle: 'italic' },
  postContent:   { fontSize: 13, color: '#999', lineHeight: 19, marginBottom: 10 },

  cardFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow:       { flexDirection: 'row', gap: 12 },
  metaItem:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:      { fontSize: 12, color: '#666' },
  actionRow:     { flexDirection: 'row', alignItems: 'center' },
  deleteBtn:     { padding: 4 },

  // Edit modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox:      { backgroundColor: '#0F0F1C', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle:    { fontSize: 17, fontWeight: '700', color: '#F0F0F5', marginBottom: 14, textAlign: 'center' },
  editInput:     { backgroundColor: '#181828', borderRadius: 12, padding: 14, color: '#F0F0F5', fontSize: 14, lineHeight: 20, minHeight: 120, textAlignVertical: 'top', borderWidth: 0.5, borderColor: '#2A2A40' },
  charCount:     { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 6, marginBottom: 16 },
  modalBtnRow:   { flexDirection: 'row', gap: 10 },
  modalBtnCancel:{ flex: 1, backgroundColor: '#1A1A2E', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
  modalBtnSave:  { flex: 1, backgroundColor: '#9D8DF1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' } });
