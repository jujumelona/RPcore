/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/policy/SupportChatScreen.tsx
// 고객지원 채팅 화면 (마이페이지 → 고객지원)
//
// 기능:
//  - 기존 문의 목록 + 스레드 대화 보기
//  - 새 문의 생성 (제목 + 첫 메시지)
//  - 기존 문의에 추가 메시지
//  - 어드민 답장 자동 폴링 (30초)
//  - 미읽은 답장 배지

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Image,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Send, Plus, ChevronRight,
  MessageSquare, Clock, Image as ImageIcon, X,
} from 'lucide-react-native';
import { AdminAPI, AdminInquiry, SupportMessage } from '../../api/AdminAPI';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { ToastService } from '../../components/Toast';
import { openImageLibrary, requestPhotoLibraryPermission } from '../../utils/runtimePermissions';
import { Spinner } from '../../components/ui/Spinner';
import type { ScreenProps } from '../../types/navigation';
import { useShallow } from 'zustand/react/shallow';

// ─── 상수 ─────────────────────────────────────────────────────
const C = {
  bg0:      '#050507',
  bg1:      '#08080C',
  bg2:      '#0E0E14',
  surface0: '#18181F',
  surface1: '#1E1E28',
  border0:  '#1A1A24',
  border1:  '#22222E',
  text0:    '#F0F0F5',
  text1:    '#C8C8D4',
  text2:    '#8A8A9E',
  text3:    '#797990',
  accent:   '#D4A853',
  accentDim:'rgba(212,168,83,0.14)',
  success:  '#4ADE80',
  pending:  '#F59E0B',
} as const;

type ViewMode = 'list' | 'thread' | 'new';

// ─── 유틸 ─────────────────────────────────────────────────────
function ListSeparator() {
  return <View style={styles.separator} />;
}

function getSupportLabels(t: Record<string, string | undefined>) {
  return {
    title: t.supportTitle || '',
    newInquiry: t.supportNewInquiry || '',
    statusResolved: t.supportStatusResolved || '',
    statusInProgress: t.supportStatusInProgress || '',
    adminBadge: t.supportAdminBadge || '',
    emptyTitle: t.supportEmptyTitle || '',
    emptyDescription: t.supportEmptyDescription || '',
    firstInquiry: t.supportFirstInquiry || '',
    threadEmpty: t.supportThreadEmpty || '',
    messagePlaceholder: t.supportMessagePlaceholder || '',
    guideTitle: t.supportGuideTitle || '',
    guideDescription: t.supportGuideDescription || '',
    subjectLabel: t.supportSubjectLabel || '',
    subjectPlaceholder: t.supportSubjectPlaceholder || '',
    contentLabel: t.supportContentLabel || '',
    contentPlaceholder: t.supportContentPlaceholder || '',
    attachmentLabel: t.supportAttachmentLabel || '',
    attachmentAdd: t.supportAttachmentAdd || '',
    attachmentChange: t.supportAttachmentChange || '',
    sendInquiry: t.supportSendInquiry || '',
    sendingInquiry: t.supportSendingInquiry || '',
    sendFailed: t.supportSendFailed || '',
    createSuccess: t.supportCreateSuccess || '',
    createFailed: t.supportCreateFailed || '',
    needLogin: t.supportNeedLogin || '',
    photoPermission: t.supportPhotoPermission || '',
    titleRequired: t.supportTitleRequired || '',
    contentRequired: t.supportContentRequired || '',
    timeJustNow: t.supportTimeJustNow || '',
    timeMinAgo: t.supportTimeMinAgo || '',
    timeHourAgo: t.supportTimeHourAgo || '',
    timeDayAgo: t.supportTimeDayAgo || '',
  };
}

function fmtTime(iso: string, labels: ReturnType<typeof getSupportLabels>, locale: string) {
  const d = new Date(iso);
  const diffSeconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSeconds < 60) return labels.timeJustNow;
  if (diffSeconds < 3600) {
    return labels.timeMinAgo.replace('{n}', String(Math.floor(diffSeconds / 60)));
  }
  if (diffSeconds < 86400) {
    return labels.timeHourAgo.replace('{n}', String(Math.floor(diffSeconds / 3600)));
  }
  if (diffSeconds < 604800) {
    return labels.timeDayAgo.replace('{n}', String(Math.floor(diffSeconds / 86400)));
  }
  return d.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

// ─── 문의 목록 아이템 ──────────────────────────────────────────
function InquiryRow({
  item,
  onPress,
}: {
  item: AdminInquiry;
  onPress: () => void;
}) {
  const { t, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })));
  const labels = getSupportLabels(t as Record<string, string | undefined>);
  const isResolved = item.status === 'resolved';
  const hasUnread  = (item.unread_reply_count ?? 0) > 0;

  return (
    <TouchableOpacity style={styles.inquiryRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.inquiryIconWrap}>
        <MessageSquare size={18} color={hasUnread ? C.accent : C.text3} />
        {hasUnread && (
          <View style={styles.unreadDot}>
            <Text style={styles.unreadDotText}>{item.unread_reply_count}</Text>
          </View>
        )}
      </View>

      <View style={styles.inquiryInfo}>
        <View style={styles.inquiryTopRow}>
          <Text style={styles.inquiryTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.inquiryTime}>{fmtTime(item.created_at, labels, appLanguage)}</Text>
        </View>
        <View style={styles.inquiryBottomRow}>
          <Text style={styles.inquiryPreview} numberOfLines={1}>
            {item.last_reply_preview ?? item.body}
          </Text>
          <View style={[
            styles.statusPill,
            isResolved ? styles.statusPillResolved : styles.statusPillPending,
          ]}>
            <Text style={[styles.statusPillText, isResolved ? styles.statusPillTextResolved : styles.statusPillTextPending]}>
              {isResolved ? labels.statusResolved : labels.statusInProgress}
            </Text>
          </View>
        </View>
      </View>

      <ChevronRight size={16} color={C.text3} />
    </TouchableOpacity>
  );
}

// ─── 채팅 버블 ────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: SupportMessage }) {
  const { t, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })));
  const labels = getSupportLabels(t as Record<string, string | undefined>);
  const isUser = msg.sender === 'user';
  return (
    <View style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapAdmin]}>
      {!isUser && (
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>{labels.adminBadge}</Text>
        </View>
      )}
      <View style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAdmin,
      ]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {msg.body}
        </Text>
        {msg.photo_url ? (
          <Image
            source={{ uri: msg.photo_url }}
            style={styles.bubbleImage}
            resizeMode="cover"
          />
        ) : null}
      </View>
      <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
        {fmtTime(msg.created_at, labels, appLanguage)}
        {isUser && !msg.read_by_admin && (
          <Text style={styles.unreadMark}>  ●</Text>
        )}
      </Text>
    </View>
  );
}

// ─── 메인 ────────────────────────────────────────────────────
export function SupportChatScreen({ navigation }: ScreenProps<'SupportChat'>) {
  const user = useAuthStore(s => s.user);
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const labels = getSupportLabels(t as Record<string, string | undefined>);

  const [view, setView]             = useState<ViewMode>('list');
  const [inquiries, setInquiries]   = useState<AdminInquiry[]>([]);
  const [activeInquiry, setActive]  = useState<AdminInquiry | null>(null);
  const [thread, setThread]         = useState<SupportMessage[]>([]);
  const [loading, setLoading]       = useState(false);
  const [threadLoading, setTLoading]= useState(false);
  const [sending, setSending]       = useState(false);

  // 입력
  const [inputText, setInput]       = useState('');
  const [photoUri, setPhotoUri]     = useState<string | null>(null);

  // 새 문의
  const [newTitle, setNewTitle]     = useState('');
  const [newBody, setNewBody]       = useState('');
  const [newPhoto, setNewPhoto]     = useState<string | null>(null);
  const [creating, setCreating]     = useState(false);

  const flatRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 문의 목록 로드 ──────────────────────────────────────────
  const loadInquiries = useCallback(async () => {
    if (!user?.jwtToken) return;
    setLoading(true);
    try {
      const res = await AdminAPI.getMyInquiries(user.jwtToken);
      setInquiries(res);
    } finally {
      setLoading(false);
    }
  }, [user?.jwtToken]);

  useEffect(() => { loadInquiries(); }, [loadInquiries]);

  // ── 스레드 로드 ────────────────────────────────────────────
  const loadThread = useCallback(async (inquiryId: string) => {
    if (!user?.jwtToken) return;
    setTLoading(true);
    try {
      const msgs = await AdminAPI.getInquiryThread(inquiryId, user.jwtToken);
      setThread(msgs);
      await AdminAPI.markThreadRead(inquiryId, user.jwtToken);
    } finally {
      setTLoading(false);
    }
  }, [user?.jwtToken]);

  // ── 폴링: 스레드 뷰에서 30초마다 새 답장 확인 ──────────────
  useEffect(() => {
    if (view === 'thread' && activeInquiry) {
      pollRef.current = setInterval(() => {
        loadThread(activeInquiry.id);
      }, 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [view, activeInquiry, loadThread]);

  // 스레드 열기
  const openThread = (inquiry: AdminInquiry) => {
    setActive(inquiry);
    setView('thread');
    loadThread(inquiry.id);
  };

  // ── 메시지 전송 ────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim() || !activeInquiry || !user?.jwtToken) return;
    setSending(true);
    try {
      const msg = await AdminAPI.sendUserMessage(
        activeInquiry.id,
        inputText.trim(),
        user.jwtToken,
        photoUri ?? undefined,
      );
      if (msg) {
        setThread(prev => [...prev, msg]);
        setInput('');
        setPhotoUri(null);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      ToastService.error(labels.sendFailed);
    } finally {
      setSending(false);
    }
  };

  // ── 새 문의 생성 ───────────────────────────────────────────
  const handleCreate = async () => {
    if (!newTitle.trim()) { ToastService.error(labels.titleRequired); return; }
    if (!newBody.trim())  { ToastService.error(labels.contentRequired); return; }
    if (!user?.jwtToken)  { ToastService.error(labels.needLogin); return; }
    setCreating(true);
    try {
      const created = await AdminAPI.createInquiry(
        newTitle.trim(), newBody.trim(), user.jwtToken, newPhoto ?? undefined,
      );
      if (created) {
        ToastService.success(labels.createSuccess);
        setNewTitle(''); setNewBody(''); setNewPhoto(null);
        await loadInquiries();
        setView('list');
      } else {
        ToastService.error(labels.createFailed);
      }
    } finally {
      setCreating(false);
    }
  };

  // ── 사진 선택 ──────────────────────────────────────────────
  const pickPhoto = async (setter: (uri: string) => void) => {
    const granted = await requestPhotoLibraryPermission();
    if (!granted) { ToastService.error(labels.photoPermission); return; }
    const res = await openImageLibrary({ mediaType: 'photo', quality: 0.7, selectionLimit: 1 });
    if (!res.didCancel && !res.errorCode) {
      const uri = res.assets?.[0]?.uri;
      if (uri) setter(uri);
    }
  };

  // ── 렌더 ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (view === 'list') navigation.goBack();
            else { setView('list'); setActive(null); setThread([]); }
          }}
        >
          <ArrowLeft size={20} color={C.text0} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {view === 'list'   ? labels.title :
             view === 'new'    ? labels.newInquiry :
             activeInquiry?.title ?? labels.title}
          </Text>
          {view === 'thread' && activeInquiry && (
            <View style={[
              styles.headerPill,
              activeInquiry.status === 'resolved' ? styles.headerPillResolved : styles.headerPillPending,
            ]}>
              <Text style={[
                styles.headerPillText,
                activeInquiry.status === 'resolved' ? styles.headerPillTextResolved : styles.headerPillTextPending,
              ]}>
                {activeInquiry.status === 'resolved' ? labels.statusResolved : labels.statusInProgress}
              </Text>
            </View>
          )}
        </View>

        {view === 'list' && (
          <TouchableOpacity style={styles.newBtn} onPress={() => setView('new')}>
            <Plus size={18} color={C.accent} />
            <Text style={styles.newBtnText}>{labels.newInquiry}</Text>
          </TouchableOpacity>
        )}
        {view !== 'list' && <View style={styles.headerPillSpacer} />}
      </View>

      {/* ─ LIST VIEW ─ */}
      {view === 'list' && (
        <>
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : inquiries.length === 0 ? (
            <View style={styles.centerBox}>
              <MessageSquare size={40} color={C.text3} />
              <Text style={styles.emptyTitle}>{labels.emptyTitle}</Text>
              <Text style={styles.emptyDesc}>
                {labels.emptyDescription}
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setView('new')}>
                <Plus size={16} color={C.bg0} />
                <Text style={styles.emptyBtnText}>{labels.firstInquiry}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlashList
              data={inquiries}
              estimatedItemSize={80}
              keyExtractor={i => i.id}
              renderItem={({ item }) => (
                <InquiryRow item={item} onPress={() => openThread(item)} />
              )}
              ItemSeparatorComponent={ListSeparator}
              contentContainerStyle={styles.listContent}
              onRefresh={loadInquiries}
              refreshing={loading}
            />
          )}
        </>
      )}

      {/* ─ THREAD VIEW ─ */}
      {view === 'thread' && (
        <KeyboardAvoidingView
          style={styles.threadView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {threadLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : (
            <FlashList
              ref={flatRef}
              data={thread}
              estimatedItemSize={70}
              keyExtractor={m => m.id}
              renderItem={({ item }) => <ChatBubble msg={item} />}
              contentContainerStyle={styles.threadContent}
              onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <View style={styles.threadEmpty}>
                  <Clock size={28} color={C.text3} />
                  <Text style={styles.emptyDesc}>{labels.threadEmpty}</Text>
                </View>
              }
            />
          )}

          {/* 입력창 */}
          <View style={styles.inputBar}>
            {photoUri && (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photoUri }} style={styles.photoThumb} resizeMode="cover" />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUri(null)}>
                  <X size={12} color={C.text0} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => pickPhoto(setPhotoUri)}
              >
                <ImageIcon size={18} color={C.text3} />
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInput}
                placeholder={labels.messagePlaceholder}
                placeholderTextColor={C.text3}
                multiline
                maxLength={800}
              />

              <TouchableOpacity
                style={[styles.sendBtn, (!inputText.trim() && !photoUri) && styles.sendBtnDim]}
                onPress={handleSend}
                disabled={sending || (!inputText.trim() && !photoUri)}
              >
                {sending
                  ? <Spinner size={16} color={C.bg0} />
                  : <Send size={16} color={C.bg0} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ─ NEW INQUIRY VIEW ─ */}
      {view === 'new' && (
        <KeyboardAvoidingView
          style={styles.newView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.newScroll}
            contentContainerStyle={styles.newContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* 안내 카드 */}
            <View style={styles.guideCard}>
              <View style={styles.guideHeader}>
                <MessageSquare size={18} color={C.accent} />
                <Text style={styles.guideTitle}>{labels.guideTitle}</Text>
              </View>
              <Text style={styles.guideDesc}>
                {labels.guideDescription}
              </Text>
            </View>

            {/* 제목 */}
            <Text style={styles.fieldLabel}>{labels.subjectLabel}</Text>
            <TextInput
              style={styles.fieldInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={labels.subjectPlaceholder}
              placeholderTextColor={C.text3}
              maxLength={100}
            />

            {/* 내용 */}
            <Text style={[styles.fieldLabel, styles.fieldLabelMargin]}>{labels.contentLabel}</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldArea]}
              value={newBody}
              onChangeText={setNewBody}
              placeholder={labels.contentPlaceholder}
              placeholderTextColor={C.text3}
              multiline
              textAlignVertical="top"
              maxLength={1200}
            />
            <Text style={styles.counter}>{newBody.length}/1200</Text>

            {/* 첨부 */}
            <View style={styles.attachRow}>
              <Text style={styles.fieldLabel}>{labels.attachmentLabel}</Text>
              <TouchableOpacity
                style={styles.attachPick}
                onPress={() => pickPhoto(setNewPhoto)}
              >
                <ImageIcon size={14} color={C.accent} />
                <Text style={styles.attachPickText}>{newPhoto ? labels.attachmentChange : labels.attachmentAdd}</Text>
              </TouchableOpacity>
            </View>
            {newPhoto && (
              <View style={styles.newPhotoWrap}>
                <Image source={{ uri: newPhoto }} style={styles.newPhotoImg} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.newPhotoRemove}
                  onPress={() => setNewPhoto(null)}
                >
                  <X size={14} color={C.text0} />
                </TouchableOpacity>
              </View>
            )}

            {/* 전송 */}
            <TouchableOpacity
              style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating
                ? <Spinner size={16} color={C.bg0} />
                : <Send size={16} color={C.bg0} />}
              <Text style={styles.submitText}>
                {creating ? labels.sendingInquiry : labels.sendInquiry}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg0 },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border0,
    backgroundColor: C.bg1,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface0,
  },
  headerCenter: {
    flex: 1, marginHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  headerTitle: {
    color: C.text0, fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
  },
  headerPillText: { fontSize: 11, fontWeight: '600' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: C.accentDim,
    borderWidth: 1, borderColor: C.accent + '44',
  },
  newBtnText: { color: C.accent, fontSize: 13, fontWeight: '700' },

  // 목록
  inquiryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.bg1,
    gap: 12,
  },
  inquiryIconWrap: { position: 'relative', width: 36, alignItems: 'center' },
  unreadDot: {
    position: 'absolute', top: -6, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadDotText: { color: C.bg0, fontSize: 9, fontWeight: '700' },
  inquiryInfo: { flex: 1, gap: 4 },
  inquiryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inquiryTitle: { color: C.text0, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  inquiryTime:  { color: C.text3, fontSize: 11 },
  inquiryBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inquiryPreview: { color: C.text2, fontSize: 12, flex: 1, marginRight: 8 },
  statusPill: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  statusPillResolved: {
    borderColor: C.success,
    backgroundColor: 'rgba(74,222,128,0.10)',
  },
  statusPillPending: {
    borderColor: C.pending,
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
  statusPillTextResolved: { color: C.success },
  statusPillTextPending: { color: C.pending },
  headerPillResolved: { backgroundColor: 'rgba(74,222,128,0.12)' },
  headerPillPending: { backgroundColor: 'rgba(245,158,11,0.12)' },
  headerPillTextResolved: { color: C.success },
  headerPillTextPending: { color: C.pending },
  headerPillSpacer: { width: 72 },
  listContent: { paddingBottom: 32 },
  threadView: { flex: 1 },
  newView: { flex: 1 },
  newScroll: { flex: 1 },
  fieldLabelMargin: { marginTop: 16 },
  submitBtnDisabled: { opacity: 0.6 },
  statusPillText: { fontSize: 10, fontWeight: '600' },
  separator: { height: 1, backgroundColor: C.border0 },

  // 공통
  centerBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  emptyTitle: { color: C.text0, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyDesc:  { color: C.text2, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 20, backgroundColor: C.accent,
  },
  emptyBtnText: { color: C.bg0, fontSize: 14, fontWeight: '700' },

  // 스레드
  threadContent: { padding: 16, gap: 12, paddingBottom: 24 },
  threadEmpty:   { alignItems: 'center', paddingTop: 60, gap: 10 },
  bubbleWrap:    { maxWidth: '78%', gap: 4 },
  bubbleWrapUser:  { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapAdmin: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  adminBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: C.accentDim,
    borderRadius: 8, marginBottom: 2,
  },
  adminBadgeText: { color: C.accent, fontSize: 10, fontWeight: '700' },
  bubble: {
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    gap: 8,
  },
  bubbleUser:  { backgroundColor: C.accent, borderBottomRightRadius: 4 },
  bubbleAdmin: {
    backgroundColor: C.surface1,
    borderWidth: 1, borderColor: C.border1,
    borderBottomLeftRadius: 4,
  },
  bubbleText:     { color: C.text0, fontSize: 14, lineHeight: 21 },
  bubbleTextUser: { color: C.bg0 },
  bubbleImage: { width: '100%', height: 180, borderRadius: 10 },
  bubbleTime:     { color: C.text3, fontSize: 10, marginHorizontal: 4 },
  bubbleTimeUser: { textAlign: 'right' },
  unreadMark: { color: C.text3 },

  // 입력바
  inputBar: {
    borderTopWidth: 1, borderTopColor: C.border0,
    backgroundColor: C.bg1,
    paddingHorizontal: 12, paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    gap: 8,
  },
  photoPreview: {
    position: 'relative', width: 64, height: 64, borderRadius: 8,
    overflow: 'hidden', marginBottom: 4,
  },
  photoThumb:  { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 3, right: 3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
  },
  attachBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, backgroundColor: C.surface0,
  },
  input: {
    flex: 1, minHeight: 36, maxHeight: 120,
    backgroundColor: C.surface0,
    borderRadius: 18, borderWidth: 1, borderColor: C.border1,
    paddingHorizontal: 14, paddingVertical: 8,
    color: C.text0, fontSize: 14,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDim: { opacity: 0.35 },

  // 새 문의
  newContent: { padding: 20, gap: 0, paddingBottom: 40 },
  guideCard: {
    backgroundColor: C.surface0,
    borderRadius: 14, borderWidth: 1, borderColor: C.border1,
    padding: 16, marginBottom: 24, gap: 6,
  },
  guideHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  guideTitle: { color: C.text0, fontSize: 15, fontWeight: '700' },
  guideDesc:  { color: C.text2, fontSize: 13, lineHeight: 20 },
  fieldLabel: {
    color: C.text3, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: C.surface0,
    borderRadius: 12, borderWidth: 1, borderColor: C.border0,
    paddingHorizontal: 14, paddingVertical: 12,
    color: C.text0, fontSize: 14,
  },
  fieldArea:  { minHeight: 160 },
  counter: { color: C.text3, fontSize: 11, textAlign: 'right', marginTop: 6 },
  attachRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 20, marginBottom: 10,
  },
  attachPick: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: C.accentDim,
    borderWidth: 1, borderColor: C.accent + '44',
  },
  attachPickText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  newPhotoWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  newPhotoImg:  { width: '100%', height: 200 },
  newPhotoRemove: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: {
    marginTop: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14, paddingVertical: 14,
  },
  submitText: { color: C.bg0, fontSize: 15, fontWeight: '700' },
});

