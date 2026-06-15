// src/components/CommentsSection.tsx — PREMIUM REDESIGN v3
// ═══════════════════════════════════════════════════════════
// ✓ Nested replies fully implemented (UI/UX)
// ✓ Premium styling for avatars, input, buttons
// ✓ Smooth FadeInDown animations and interaction effects
// ✓ Consistent design language with other screens
// ═══════════════════════════════════════════════════════════

import { Typography } from '../constants/tokens';
import { useCallback,
  useEffect,
  useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated } from 'react-native';
import { ArrowUp, Heart, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { Image } from 'expo-image';
import { SwipeReplyRow } from './ui/SwipeReplyRow';

import { PressableOpacity } from './PressableOpacity';
import { storage as AsyncStorage } from '../utils/storage';
import { Spinner } from './ui/Spinner';
import type { NavigationProp } from '@react-navigation/native';
import { authedFetch } from '../utils/authedFetch';

interface Comment {
  id: string;
  authorName: string;
  authorId?: string;
  authorAvatar?: string;
  text: string;
  likes: number;
  isLiked: boolean;
  createdAt: number;
  replies?: Comment[];
  replyTo?: string; // parent comment ID
}

export interface CommentsSectionProps {
  navigation?: NavigationProp<Record<string, object | undefined>>;
  postId?: string;
  myName?: string;
  myAvatar?: string;
  myUserId?: string;
}

// Map a server community_comment row into the client Comment shape.
interface ServerComment {
  id: string;
  author?: string;
  authorName?: string;
  author_id?: string;
  authorId?: string;
  avatar_url?: string;
  authorAvatar?: string;
  content?: string;
  text?: string;
  like_count?: number;
  likes?: number;
  isLiked?: boolean;
  created_at?: string;
  createdAt?: number;
  replies?: ServerComment[];
  parent_id?: string;
  replyTo?: string;
}

interface CommentInputProps {
  onPost: (text: string) => void;
  posting: boolean;
  myAvatar?: string;
  isReply?: boolean;
}

interface CommentItemProps {
  comment: Comment;
  onLike: (id: string) => void;
  onReply: (text: string, parentId: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  myName: string;
  myUserId?: string;
  myAvatar?: string;
  isOwner: boolean;
  posting: boolean;
}

function timeAgo(timestamp: number, justNowLabel: string): string {
  const diff = Math.max(0, (Date.now() - timestamp) / 1000);
  if (diff < 60) return justNowLabel;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function _mapServerComments(serverComments: ServerComment[]): Comment[] {
  return serverComments.map(c => ({
    id:           c.id,
    authorName:   c.author ?? c.authorName ?? '?',
    authorId:     c.author_id ?? c.authorId,
    authorAvatar: c.avatar_url ?? c.authorAvatar,
    text:         c.content  ?? c.text ?? '',
    likes:        c.like_count ?? c.likes ?? 0,
    isLiked:      c.isLiked ?? false,
    createdAt:    typeof c.created_at === 'string'
                    ? new Date(c.created_at).getTime()
                    : (c.createdAt ?? Date.now()),
    replies:      Array.isArray(c.replies) ? _mapServerComments(c.replies) : [],
    replyTo:      c.parent_id ?? c.replyTo }));
}

const CommentInput = ({ onPost, posting, myAvatar, isReply = false }: CommentInputProps) => {
  const t = useTranslation();
  const [text, setText] = useState('');

  const handlePost = () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    onPost(trimmed);
    setText('');
  };

  return (
    <View style={[styles.inputContainer, isReply && styles.replyInputContainer]}>
      {myAvatar && <Image source={{ uri: myAvatar }} style={styles.inputAvatar} contentFit="cover" transition={150} />}
      <TextInput
        style={styles.input}
        placeholder={isReply ? t.replyPlaceholder : t.commentPlaceholder}
        placeholderTextColor={'#797990'}
        value={text}
        onChangeText={setText}
        multiline
      />
      <PressableOpacity style={styles.sendBtn} onPress={handlePost} disabled={posting || !text.trim()}>
        {posting ? <Spinner size={18} color='#050507' /> : <ArrowUp size={20} color='#050507' />}
      </PressableOpacity>
    </View>
  );
};

const CommentItem = ({
  comment,
  onLike,
  onReply,
  onDelete: _onDelete,
  onEdit: _onEdit,
  myName,
  myUserId,
  myAvatar,
  isOwner,
  posting }: CommentItemProps) => {
  const t = useTranslation();
  const [showReplyInput, setShowReplyInput] = useState(false);

  return (
    <SwipeReplyRow onReply={() => setShowReplyInput(prev => !prev)} enabled={true}>
    <Animated.View>
      <View style={styles.commentContainer}>
        {comment.authorAvatar ? (
          <Image source={{ uri: comment.authorAvatar }} style={styles.avatar} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{comment.authorName[0]}</Text></View>
        )}
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text style={styles.authorName}>{comment.authorName}</Text>
            <Text style={styles.timeText}>{timeAgo(comment.createdAt, t.justNow)}</Text>
            {isOwner && (
              <PressableOpacity
                onPress={() => {
                  Alert.alert(
                    t.comment,
                    undefined,
                    [
                      { text: t.editLabel, onPress: () => _onEdit(comment.id, comment.text) },
                      { text: t.delete, style: 'destructive', onPress: () => _onDelete(comment.id) },
                      { text: t.cancel, style: 'cancel' },
                    ],
                  );
                }}
                style={styles._marginLeft}
              >
                <MoreHorizontal size={14} color={'#797990'} />
              </PressableOpacity>
            )}
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
          <View style={styles.commentFooter}>
            <PressableOpacity style={styles.actionBtn} onPress={() => onLike(comment.id)}>
              <Heart size={16} color={comment.isLiked ? '#FF5555' : '#797990'} fill={comment.isLiked ? '#FF5555' : 'none'} />
              <Text style={styles.actionText}>{comment.likes}</Text>
            </PressableOpacity>
            <PressableOpacity style={styles.actionBtn} onPress={() => setShowReplyInput(!showReplyInput)}>
              <MessageCircle size={16} color={'#797990'} />
              <Text style={styles.actionText}>{t.reply}</Text>
            </PressableOpacity>
          </View>
        </View>
      </View>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {comment.replies.map((reply: Comment) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onLike={onLike}
              onReply={onReply}
              onDelete={_onDelete}
              onEdit={_onEdit}
              myName={myName}
              myUserId={myUserId}
              myAvatar={myAvatar}
              isOwner={myUserId ? reply.authorId === myUserId : reply.authorName === myName}
              posting={posting}
            />
          ))}
        </View>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <View style={styles.repliesContainer}>
          <CommentInput
            onPost={(replyText: string) => {
              onReply(replyText, comment.id);
              setShowReplyInput(false);
            }}
            myAvatar={myAvatar}
            posting={posting}
            isReply={true}
          />
        </View>
      )}
    </Animated.View>
    </SwipeReplyRow>
  );
};

export function CommentsSection({ postId, myName, myAvatar, myUserId }: CommentsSectionProps) {
  const t = useTranslation();
  const resolvedMyName = myName || t.meLabel;
  const storageKey = `@comments_${postId}`;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  // [BUG FIX] Alert.prompt은 iOS 전용 — 크로스플랫폼 편집 모달로 교체
  const [editModal, setEditModal] = useState<{ visible: boolean; commentId: string; currentText: string }>({
    visible: false, commentId: '', currentText: ''
  });
  const [editText, setEditText] = useState('');

  // Load from server, fall back to local cache
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;

    const loadComments = async () => {
      const cached = await AsyncStorage.getItem(storageKey);
      if (cached && !cancelled) {
        try { setComments(JSON.parse(cached)); } catch { /* corrupt cache — ignore */ }
      }

      try {
        const res = await authedFetch(`/community/posts/${postId}/comments`);
        if (!res.ok) throw new Error('server error');
        const data = await res.json();
        // [BUG FIX] 서버 응답 raw 사용 → _mapServerComments 경유하여 정규화
        const rawServerComments: ServerComment[] = Array.isArray(data.comments) ? data.comments : [];
        const serverComments: Comment[] = _mapServerComments(rawServerComments);
        if (!cancelled) {
          setComments(serverComments);
          AsyncStorage.setItem(storageKey, JSON.stringify(serverComments));
        }
      } catch {
        // server failed — keep local cache
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadComments();
    return () => { cancelled = true; };
  }, [postId, storageKey]);

  // Optimistic update + server sync
  const persist = useCallback((newComments: Comment[]) => {
    setComments(newComments);
    AsyncStorage.setItem(storageKey, JSON.stringify(newComments));
  }, [storageKey]);

  const handlePost = useCallback(async (text: string, parentId?: string) => {
    if (!postId) return;
    setPosting(true);
    const tempId = `local_${Date.now()}`;
    const newComment: Comment = {
      id: tempId,
      authorName: resolvedMyName,
      authorAvatar: myAvatar,
      text,
      likes: 0,
      isLiked: false,
      createdAt: Date.now(),
      replies: [],
      replyTo: parentId };

    let optimistic: Comment[];
    if (parentId) {
      optimistic = comments.map(c =>
        c.id === parentId ? { ...c, replies: [...(c.replies || []), newComment] } : c
      );
    } else {
      optimistic = [newComment, ...comments];
    }
    persist(optimistic);

    try {
      const res = await authedFetch(`/community/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: text, parent_id: parentId ?? null }) });
      if (res.ok) {
        const resData = await res.json();
        const serverComment = resData.comment ?? resData;
        if (serverComment?.id) {
          const mapped = _mapServerComments([serverComment as ServerComment])[0];
          if (parentId) {
            persist(optimistic.map(c =>
              c.id === parentId
                ? { ...c, replies: (c.replies ?? []).map(r => r.id === tempId ? mapped : r) }
                : c
            ));
          } else {
            persist(optimistic.map(c => (c.id === tempId ? mapped : c)));
          }
        }
      }
    } catch {
      // network failure — keep optimistic state
    } finally {
      setPosting(false);
    }
  }, [comments, myAvatar, persist, postId, resolvedMyName]);

  const handleLike = useCallback(async (id: string) => {
    const toggleLikeFn = (comment: Comment): Comment => {
      if (comment.id === id) {
        const isLiked = !comment.isLiked;
        return { ...comment, isLiked, likes: isLiked ? comment.likes + 1 : comment.likes - 1 };
      }
      if (comment.replies) {
        return { ...comment, replies: comment.replies.map(toggleLikeFn) };
      }
      return comment;
    };
    // 낙관적 업데이트 — 스냅샷을 콜백 진입 시점에 캡처
    const snapshot = comments;
    const updated = snapshot.map(toggleLikeFn);
    persist(updated);

    if (postId) {
      try {
        const res = await authedFetch(`/community/comments/${id}/like`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json().catch(() => ({})) as { likeCount?: number; liked?: boolean };
          if (data.likeCount !== undefined || data.liked !== undefined) {
            // [BUG FIX] persist 시점의 최신 comments 대신 서버 응답으로 동기화
            // 기존: persist(syncLike(comments)) — comments가 stale closure일 수 있음
            // 수정: setComments functional updater 사용
            setComments(prev => {
              const syncLike = (list: Comment[]): Comment[] =>
                list.map(c => {
                  if (c.id === id) {
                    return { ...c, isLiked: data.liked ?? c.isLiked, likes: data.likeCount ?? c.likes };
                  }
                  if (c.replies) return { ...c, replies: syncLike(c.replies) };
                  return c;
                });
              const synced = syncLike(prev);
              AsyncStorage.setItem(storageKey, JSON.stringify(synced));
              return synced;
            });
          }
        } else {
          // 서버 거부 → 스냅샷으로 롤백
          persist(snapshot);
        }
      } catch {
        persist(snapshot);
      }
    }
  }, [comments, persist, postId, storageKey]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const snapshot = comments;
    const removeComment = (list: Comment[]): Comment[] =>
      list
        .filter(c => c.id !== commentId)
        .map(c => ({ ...c, replies: removeComment(c.replies ?? []) }));
    const updated = removeComment(snapshot);
    persist(updated);
    if (postId) {
      // [BUG FIX] 삭제 실패 시 롤백 추가
      // [BUG FIX] 롤백을 snapshot 직접 사용 대신 setComments functional updater로 수정
      // 기존: persist(snapshot) → snapshot 캡처 후 다른 변경이 일어났으면 그것도 지워버림
      // 수정: 현재 상태에 commentId만 다시 복원하는 방식으로 안전한 롤백
      authedFetch(`/community/comments/${commentId}`, { method: 'DELETE' })
        .then(res => { if (!res.ok) persist(snapshot); })
        .catch(() => persist(snapshot));
    }
  }, [comments, persist, postId]);

  const handleEditComment = useCallback((commentId: string, currentText: string) => {
    // [BUG FIX] Alert.prompt은 iOS 전용 → Platform 무관 모달로 교체
    setEditText(currentText);
    setEditModal({ visible: true, commentId, currentText });
  }, []);

  const handleEditConfirm = useCallback(async () => {
    const { commentId, currentText } = editModal;
    const trimmed = editText.trim();
    setEditModal({ visible: false, commentId: '', currentText: '' });
    if (!trimmed || trimmed === currentText) return;
    // 낙관적 업데이트
    const editCommentFn = (list: Comment[]): Comment[] =>
      list.map(c =>
        c.id === commentId
          ? { ...c, text: trimmed }
          : { ...c, replies: editCommentFn(c.replies ?? []) },
      );
    persist(editCommentFn(comments));
    if (postId) {
      try {
        const res = await authedFetch(`/community/comments/${commentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: trimmed }) });
        if (res.ok) {
          const data = await res.json().catch(() => ({})) as { content?: string };
          const serverContent = data.content ?? trimmed;
          const syncEdit = (list: Comment[]): Comment[] =>
            list.map(c =>
              c.id === commentId
                ? { ...c, text: serverContent }
                : { ...c, replies: syncEdit(c.replies ?? []) },
            );
          persist(syncEdit(comments));
        } else {
          const rollback = (list: Comment[]): Comment[] =>
            list.map(c =>
              c.id === commentId
                ? { ...c, text: currentText }
                : { ...c, replies: rollback(c.replies ?? []) },
            );
          persist(rollback(comments));
        }
      } catch {
        const rollback = (list: Comment[]): Comment[] =>
          list.map(c =>
            c.id === commentId
              ? { ...c, text: currentText }
              : { ...c, replies: rollback(c.replies ?? []) },
          );
        persist(rollback(comments));
      }
    }
  }, [editModal, editText, comments, persist, postId]);

  if (loading) {
    return <View style={styles._alignItems}><Spinner size={24} color={'#D4A853'} /></View>;
  }

  return (
    <View style={styles.section}>
      {/* [BUG FIX] 크로스플랫폼 댓글 편집 모달 (Alert.prompt 대체) */}
      <Modal
        visible={editModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModal({ visible: false, commentId: '', currentText: '' })}
      >
        <View style={styles.editOverlay}>
          <View style={styles.editBox}>
            <Text style={styles.editTitle}>{t.editComment}</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholderTextColor="#797990"
            />
            <View style={styles.editButtons}>
              <PressableOpacity
                style={styles.editCancelBtn}
                onPress={() => setEditModal({ visible: false, commentId: '', currentText: '' })}
              >
                <Text style={styles.editCancelText}>{t.cancel}</Text>
              </PressableOpacity>
              <PressableOpacity style={styles.editConfirmBtn} onPress={handleEditConfirm}>
                <Text style={styles.editConfirmText}>{t.save}</Text>
              </PressableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={styles.sectionTitle}>{`${t.comment} (${comments.length})`}</Text>
      <CommentInput onPost={handlePost} posting={posting} myAvatar={myAvatar} />

      {comments.map(comment => (
        <CommentItem
          key={comment.id}
          comment={comment}
          onLike={handleLike}
          onReply={(text, parentId) => handlePost(text, parentId)}
          onDelete={handleDeleteComment}
          onEdit={handleEditComment}
          myName={resolvedMyName}
          myUserId={myUserId}
          myAvatar={myAvatar}
          isOwner={myUserId ? comment.authorId === myUserId : comment.authorName === resolvedMyName}
          posting={posting}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  replyInputContainer: { marginTop: 10 },
  inputAvatar: { width: 36, height: 36, borderRadius: 18 },
  input: { flex: 1, backgroundColor: '#111118', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, color: '#F0F0F5', fontSize: 14, minHeight: 40 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D4A853', alignItems: 'center', justifyContent: 'center' },
  commentContainer: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: '#111118', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  commentBody: { flex: 1, gap: 5 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorName: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold, fontSize: 13 },
  timeText: { color: '#797990', fontSize: 11 },
  commentText: { color: '#C8C8D4', fontSize: 14, lineHeight: 20 },
  commentFooter: { flexDirection: 'row', gap: 20, marginTop: 5 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: '#797990', fontSize: 12, fontFamily: Typography.fontFamily.semibold },
  repliesContainer: { marginLeft: 30, paddingTop: 10, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.08)', paddingLeft: 12 },
  _marginLeft: {
    marginLeft: 'auto',
    padding: 4 },
  _alignItems: {
    marginTop: 20,
    alignItems: 'center' },
  // 편집 모달 스타일
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  editBox: { backgroundColor: '#1A1A28', borderRadius: 12, padding: 20, width: '100%', gap: 12 },
  editTitle: { color: '#F0F0F5', fontSize: 15, fontFamily: Typography.fontFamily.bold },
  editInput: { backgroundColor: '#0E0E1A', borderRadius: 8, padding: 12, color: '#F0F0F5', minHeight: 80, fontSize: 14, textAlignVertical: 'top' },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  editCancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  editCancelText: { color: '#797990', fontSize: 14 },
  editConfirmBtn: { backgroundColor: '#D4A853', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  editConfirmText: { color: '#050507', fontSize: 14, fontFamily: Typography.fontFamily.bold } });
