/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/admin/AdminDashboardScreen.tsx
// ADMIN WORKSTATION v3 — 고객지원 답장 + 스레드 뷰 추가
//
// 변경점:
//  - 문의 카드 클릭 → 스레드 대화 뷰 (기존: resolveInquiry alert)
//  - 어드민 답장 전송 (POST /admin/messages/:id/reply)
//  - 미읽은 문의 배지 (탭 레이블에 표시)
//  - 해결 완료 버튼 스레드 뷰 내에서 처리
//  - 나머지 탭(overview / users / alerts) 코드 원본 유지

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, TextInput,
  RefreshControl, KeyboardAvoidingView,
  Platform, Image, ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Users, MessageSquare,
  Activity, Zap, Clock,
  HardDrive, AlertTriangle, AlertCircle,
  Search, ShieldAlert, UserX, UserCheck,
  ArrowLeft, Send, CheckCircle, ChevronRight,
  Bell,
} from 'lucide-react-native';
import { Radius, Typography } from '../../constants/tokens';
import { RAMChecker } from '../../utils/RAMChecker';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import {
  AdminAPI,
  AdminInquiry,
  SystemAlert,
  AdminUser,
  SupportMessage,
} from '../../api/AdminAPI';
import type { ModerationQueueItem, ModerationQueueStatus } from '../../api/ModerationAPI';
import {
  filterModerationQueue,
  getModerationPriority,
  getModerationPriorityHintKey,
  getModerationPriorityMeta,
  getModerationQueueSummary,
  searchModerationQueue,
  sortModerationQueue,
  type ModerationQueueFilterKey,
} from '../../utils/moderationQueue';
import { getAdminModerationCopy } from '../../i18n/adminModerationCopy';
import { getAdminDashboardCopy } from '../../i18n/adminDashboardCopy';

type DashboardTab = 'overview' | 'inquiries' | 'reports' | 'users' | 'alerts';

// ─── 색상 상수 (기존 s.* 유지 + 추가) ────────────────────────
const C = {
  bg0:     '#050507',
  bg1:     '#08080C',
  surface: '#0F0F16',
  border:  '#1E1E2A',
  border0: '#1A1A24',
  text0:   '#F0F0F5',
  text1:   '#E8E8F0',
  text2:   '#C6CAD8',
  text3:   '#8A8A9E',
  text4:   '#6A6A80',
  text5:   '#4A4A60',
  accent:  '#D4A853',
  success: '#4ADE80',
  error:   '#F87171',
  warning: '#F59E0B',
} as const;

// ─── 유틸 ─────────────────────────────────────────────────────
function fmtTime(iso: string) {
  const { t, currentLanguage } = useLanguageStore.getState();
  const d = new Date(iso);
  const diffSeconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSeconds < 60) return t.timeJustNow ?? '';
  if (diffSeconds < 3600) {
    return (t.timeMinAgo ?? '').replace('{n}', String(Math.floor(diffSeconds / 60)));
  }
  if (diffSeconds < 86400) {
    return (t.timeHourAgo ?? '').replace('{n}', String(Math.floor(diffSeconds / 3600)));
  }
  if (diffSeconds < 604800) {
    return (t.timeDayAgo ?? '').replace('{n}', String(Math.floor(diffSeconds / 86400)));
  }
  return d.toLocaleDateString(currentLanguage || undefined, { month: 'short', day: 'numeric' });
}

const REPORT_STATUS_META: Record<ModerationQueueStatus, {
  color: string;
  backgroundColor: string;
  borderColor: string;
}> = {
  open: {
    color: C.warning,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.28)',
  },
  reviewing: {
    color: C.accent,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderColor: 'rgba(212,168,83,0.28)',
  },
  resolved: {
    color: C.success,
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderColor: 'rgba(74,222,128,0.28)',
  },
  rejected: {
    color: C.text3,
    backgroundColor: 'rgba(138,138,158,0.12)',
    borderColor: 'rgba(138,138,158,0.28)',
  },
  auto_hidden: {
    color: C.error,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.28)',
  },
};

const SYSTEM_RESOLUTION_TAG_PREFIX = '__mobile_admin_status__:';

function isModerationQueueStatus(value: string): value is ModerationQueueStatus {
  return value === 'open'
    || value === 'reviewing'
    || value === 'resolved'
    || value === 'rejected'
    || value === 'auto_hidden';
}

function getReportReasonLabel(reason: string) {
  const t = useLanguageStore.getState().t as Record<string, string | undefined>;
  switch (reason.trim().toLowerCase()) {
    case 'csam':
      return t.reportCsam ?? 'CSAM';
    case 'harassment':
      return t.reportHarassment ?? 'Harassment';
    case 'hate':
      return t.reportHate ?? 'Hate';
    case 'spam':
      return t.reportSpam ?? 'Spam';
    case 'violence':
      return t.reportViolence ?? 'Violence';
    case 'illegal':
      return t.reportIllegal ?? 'Illegal';
    case 'impersonation':
      return t.reportImpersonation ?? 'Impersonation';
    case 'other':
      return t.reportOther ?? 'Other';
    default:
      return reason;
  }
}

function getReportTargetLabel(report: ModerationQueueItem) {
  const copy = getAdminModerationCopy(useLanguageStore.getState().currentLanguage);
  return report.targetLabel?.trim() || `${copy.targetTypeLabels[report.targetType]} #${report.targetId}`;
}

function getResolutionPreset(status: ModerationQueueStatus) {
  return `${SYSTEM_RESOLUTION_TAG_PREFIX}${status}`;
}

function getResolutionStatusFromNote(resolution?: string | null): ModerationQueueStatus | null {
  if (!resolution) return null;
  const trimmed = resolution.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(SYSTEM_RESOLUTION_TAG_PREFIX)) {
    const maybeStatus = trimmed.slice(SYSTEM_RESOLUTION_TAG_PREFIX.length);
    return isModerationQueueStatus(maybeStatus) ? maybeStatus : null;
  }

  switch (trimmed.toLowerCase()) {
    case 'mobile admin reopened report':
    case 'mobile admin reopened the report.':
    case '모바일 관리자가 신고를 재오픈했습니다.':
      return 'open';
    case 'mobile admin started review':
    case 'mobile admin started review.':
    case '모바일 관리자가 검토를 시작했습니다.':
      return 'reviewing';
    case 'mobile admin resolved report':
    case 'mobile admin resolved the report.':
    case '모바일 관리자가 신고를 해결했습니다.':
      return 'resolved';
    case 'mobile admin rejected report':
    case 'mobile admin rejected the report.':
    case '모바일 관리자가 신고를 반려했습니다.':
      return 'rejected';
    case 'mobile admin auto-hidden content':
    case 'mobile admin hid the content.':
    case '모바일 관리자가 콘텐츠를 숨김 처리했습니다.':
      return 'auto_hidden';
    default:
      return null;
  }
}

function getResolutionDisplayText(
  resolution: string | undefined,
  systemResolutionNotes: Record<ModerationQueueStatus, string>,
) {
  const resolvedStatus = getResolutionStatusFromNote(resolution);
  if (resolvedStatus) {
    return systemResolutionNotes[resolvedStatus];
  }
  return resolution;
}

function formatLabeledCount(label: string, count: number) {
  return `${label}: ${count}`;
}

const REPORT_FILTERS: ModerationQueueFilterKey[] = [
  'actionable',
  'all',
  'open',
  'reviewing',
  'auto_hidden',
  'resolved',
  'rejected',
];

function getReportFilterLabel(filterKey: ModerationQueueFilterKey) {
  const copy = getAdminModerationCopy(useLanguageStore.getState().currentLanguage);
  switch (filterKey) {
    case 'actionable':
      return copy.filterActionable;
    case 'all':
      return copy.filterAll;
    default:
      return copy.statusLabels[filterKey];
  }
}

// ─── 채팅 버블 ────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: SupportMessage }) {
  const dashboardCopy = getAdminDashboardCopy(useLanguageStore(s => s.currentLanguage));
  const isAdmin = msg.sender === 'admin';
  return (
    <View style={[bs.wrap, isAdmin ? bs.wrapAdmin : bs.wrapUser]}>
      {isAdmin && (
        <View style={bs.senderBadge}>
          <Text style={bs.senderBadgeText}>{dashboardCopy.adminBadge}</Text>
        </View>
      )}
      <View style={[bs.bubble, isAdmin ? bs.bubbleAdmin : bs.bubbleUser]}>
        <Text style={[bs.bodyText, isAdmin && bs.bodyTextAdmin]}>
          {msg.body}
        </Text>
        {msg.photo_url ? (
          <Image
            source={{ uri: msg.photo_url }}
            style={bs.photo}
            resizeMode="cover"
          />
        ) : null}
      </View>
      <Text style={[bs.timeText, isAdmin && bs.timeTextAdmin]}>
        {fmtTime(msg.created_at)}
        {!isAdmin && !msg.read_by_admin && (
          <Text style={{ color: C.warning }}>  ● {dashboardCopy.unreadByAdmin}</Text>
        )}
      </Text>
    </View>
  );
}

// ─── 스레드 뷰 (문의 대화) ────────────────────────────────────
function InquiryThreadView({
  inquiry,
  token,
  onBack,
  onResolved,
}: {
  inquiry: AdminInquiry;
  token: string;
  onBack: () => void;
  onResolved: (id: string) => void;
}) {
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const dashboardCopy = getAdminDashboardCopy(currentLanguage);
  const t = useLanguageStore(s => s.t as Record<string, string | undefined>);
  const [thread, setThread]   = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const msgs = await AdminAPI.getInquiryThread(inquiry.id, token);
      setThread(msgs);
    } finally {
      setLoading(false);
    }
  }, [inquiry.id, token]);

  useEffect(() => { load(); }, [load]);

  // 30초 폴링
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const msg = await AdminAPI.replyToInquiry(inquiry.id, replyText.trim(), token);
      if (msg) {
        setThread(prev => [...prev, msg]);
        setReply('');
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
      } else {
        Alert.alert(dashboardCopy.inquirySendFailedTitle, dashboardCopy.inquirySendFailedBody);
      }
    } finally {
      setSending(false);
    }
  };

  const handleResolve = () => {
    Alert.alert(
      dashboardCopy.inquiryResolveTitle,
      dashboardCopy.inquiryResolveBody,
      [
        { text: t.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: dashboardCopy.inquiryResolveConfirm,
          onPress: async () => {
            const ok = await AdminAPI.resolveInquiry(inquiry.id, 'resolved', token);
            if (ok) onResolved(inquiry.id);
          },
        },
      ],
    );
  };

  const isResolved = inquiry.status === 'resolved';

  return (
    <KeyboardAvoidingView
      style={ts.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* 스레드 헤더 */}
      <View style={ts.header}>
        <TouchableOpacity style={ts.backBtn} onPress={onBack}>
          <ArrowLeft size={18} color={C.text0} />
        </TouchableOpacity>

        <View style={ts.headerTitleWrap}>
          <Text style={ts.headerTitle} numberOfLines={1}>{inquiry.title}</Text>
          <Text style={ts.headerSub}>{inquiry.name} · {inquiry.email}</Text>
        </View>

        {!isResolved && (
          <TouchableOpacity style={ts.resolveBtn} onPress={handleResolve}>
            <CheckCircle size={14} color={C.bg0} />
            <Text style={ts.resolveBtnText}>{dashboardCopy.inquiryResolveAction}</Text>
          </TouchableOpacity>
        )}
        {isResolved && (
          <View style={ts.resolvedBadge}>
            <Text style={ts.resolvedBadgeText}>{dashboardCopy.inquiryResolved}</Text>
          </View>
        )}
      </View>

      {/* 원본 문의 요약 */}
      <View style={ts.originalBox}>
        <Text style={ts.originalLabel}>{dashboardCopy.inquiryOriginalLabel}</Text>
        <Text style={ts.originalBody} numberOfLines={3}>{inquiry.body}</Text>
        <Text style={ts.originalTime}>{fmtTime(inquiry.created_at)}</Text>
      </View>

      {/* 대화 목록 */}
      {loading ? (
        <View style={ts.loadBox}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlashList
          ref={listRef as any}
          data={thread}
          estimatedItemSize={70}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <ChatBubble msg={item} />}
          contentContainerStyle={ts.threadList}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={ts.emptyThread}>
              <MessageSquare size={28} color={C.text5} />
              <Text style={ts.emptyThreadText}>{dashboardCopy.inquiryEmptyThread}</Text>
            </View>
          }
        />
      )}

      {/* 답장 입력 */}
      <View style={ts.inputBar}>
        <TextInput
          style={ts.input}
          value={replyText}
          onChangeText={setReply}
          placeholder={isResolved ? dashboardCopy.inquiryResolvedPlaceholder : dashboardCopy.inquiryReplyPlaceholder}
          placeholderTextColor={C.text4}
          multiline
          maxLength={800}
          editable={!isResolved}
        />
        <TouchableOpacity
          style={[ts.sendBtn, (!replyText.trim() || isResolved) && ts.sendBtnDim]}
          onPress={handleSend}
          disabled={sending || !replyText.trim() || isResolved}
        >
          {sending
            ? <ActivityIndicator size={14} color={C.bg0} />
            : <Send size={14} color={C.bg0} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── 문의 목록 행 ─────────────────────────────────────────────
function InquiryRow({
  inq,
  onPress,
}: {
  inq: AdminInquiry;
  onPress: () => void;
}) {
  const dashboardCopy = getAdminDashboardCopy(useLanguageStore(s => s.currentLanguage));
  const isResolved = inq.status === 'resolved';
  return (
    <TouchableOpacity style={ir.row} onPress={onPress} activeOpacity={0.7}>
      <View style={ir.left}>
        <MessageSquare size={16} color={isResolved ? C.success : C.accent} />
      </View>
      <View style={ir.center}>
        <View style={ir.topRow}>
          <Text style={ir.title} numberOfLines={1}>{inq.title}</Text>
          <Text style={ir.time}>{fmtTime(inq.created_at)}</Text>
        </View>
        <Text style={ir.sub}>{inq.name} · {inq.email}</Text>
        <Text style={ir.preview} numberOfLines={1}>{inq.body}</Text>
      </View>
      <View style={[ir.badge, isResolved ? ir.badgeOk : ir.badgePend]}>
        <Text style={[ir.badgeText, { color: isResolved ? C.success : C.warning }]}>
          {isResolved ? dashboardCopy.inquiryStatusDone : dashboardCopy.inquiryStatusPending}
        </Text>
      </View>
      <ChevronRight size={14} color={C.text5} style={s.chevronRight} />
    </TouchableOpacity>
  );
}

function ReportActionButton({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: 'warning' | 'success' | 'danger' | 'muted';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        rr.actionBtn,
        tone === 'warning' && rr.actionBtnWarning,
        tone === 'success' && rr.actionBtnSuccess,
        tone === 'danger' && rr.actionBtnDanger,
        tone === 'muted' && rr.actionBtnMuted,
        disabled && rr.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          rr.actionBtnText,
          tone === 'warning' && rr.actionBtnTextWarning,
          tone === 'success' && rr.actionBtnTextSuccess,
          tone === 'danger' && rr.actionBtnTextDanger,
          tone === 'muted' && rr.actionBtnTextMuted,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ReportQueueCard({
  item,
  isUpdating,
  onChangeStatus,
}: {
  item: ModerationQueueItem;
  isUpdating: boolean;
  onChangeStatus: (item: ModerationQueueItem, status: ModerationQueueStatus) => void;
}) {
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const moderationCopy = getAdminModerationCopy(currentLanguage);
  const statusMeta = REPORT_STATUS_META[item.status];
  const statusLabel = moderationCopy.statusLabels[item.status];
  const priority = getModerationPriority(item);
  const priorityMeta = getModerationPriorityMeta(priority);
  const priorityLabel = moderationCopy.priorityLabels[priority];
  const priorityHint = moderationCopy.hintLabels[getModerationPriorityHintKey(item)];
  const targetTypeLabel = moderationCopy.targetTypeLabels[item.targetType];

  return (
    <View style={rr.card}>
      <View style={rr.header}>
        <View style={rr.headerMain}>
          <Text style={rr.target} numberOfLines={1}>{getReportTargetLabel(item)}</Text>
          <Text style={rr.meta}>
            {targetTypeLabel} · {getReportReasonLabel(item.reason)} · {fmtTime(item.updatedAt ?? item.createdAt)}
          </Text>
        </View>
        <View style={rr.badgeCluster}>
          <View
            style={[
              rr.statusBadge,
              {
                backgroundColor: statusMeta.backgroundColor,
                borderColor: statusMeta.borderColor,
              },
            ]}
          >
            <Text style={[rr.statusBadgeText, { color: statusMeta.color }]}>{statusLabel}</Text>
          </View>
          <View
            style={[
              rr.priorityBadge,
              {
                backgroundColor: priorityMeta.backgroundColor,
                borderColor: priorityMeta.borderColor,
              },
            ]}
          >
            <Text style={[rr.priorityBadgeText, { color: priorityMeta.color }]}>{priorityLabel}</Text>
          </View>
        </View>
      </View>

      <Text style={rr.priorityHint}>{priorityHint}</Text>

      {item.detail ? (
        <Text style={rr.detail}>{item.detail}</Text>
      ) : (
        <Text style={rr.detailMuted}>{moderationCopy.noReportDetail}</Text>
      )}

      <View style={rr.metaRow}>
        <Text style={rr.metaItem}>{moderationCopy.reportPrefix} #{item.id}</Text>
        {item.reporterId ? <Text style={rr.metaItem}>{moderationCopy.reporterPrefix} {item.reporterId}</Text> : null}
        {item.assigneeId ? <Text style={rr.metaItem}>{moderationCopy.assigneePrefix} {item.assigneeId}</Text> : null}
      </View>

      {item.resolution ? (
        <View style={rr.resolutionBox}>
          <Text style={rr.resolutionLabel}>{moderationCopy.resolutionLabel}</Text>
          <Text style={rr.resolutionText}>
            {getResolutionDisplayText(item.resolution, moderationCopy.systemResolutionNotes)}
          </Text>
        </View>
      ) : null}

      <View style={rr.actionWrap}>
        {item.status !== 'reviewing' && (
          <ReportActionButton
            label={moderationCopy.actionReview}
            tone="warning"
            disabled={isUpdating}
            onPress={() => onChangeStatus(item, 'reviewing')}
          />
        )}
        {item.status !== 'auto_hidden' && (
          <ReportActionButton
            label={moderationCopy.actionHide}
            tone="danger"
            disabled={isUpdating}
            onPress={() => onChangeStatus(item, 'auto_hidden')}
          />
        )}
        {item.status !== 'resolved' && (
          <ReportActionButton
            label={moderationCopy.actionResolve}
            tone="success"
            disabled={isUpdating}
            onPress={() => onChangeStatus(item, 'resolved')}
          />
        )}
        {item.status !== 'rejected' && (
          <ReportActionButton
            label={moderationCopy.actionReject}
            tone="muted"
            disabled={isUpdating}
            onPress={() => onChangeStatus(item, 'rejected')}
          />
        )}
        {item.status !== 'open' && (
          <ReportActionButton
            label={moderationCopy.actionReopen}
            tone="muted"
            disabled={isUpdating}
            onPress={() => onChangeStatus(item, 'open')}
          />
        )}
      </View>

      {isUpdating && (
        <View style={rr.loadingRow}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={rr.loadingText}>{moderationCopy.changingStatus}</Text>
        </View>
      )}
    </View>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────
export function AdminDashboardScreen() {
  const user = useAuthStore(s => s.user);
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const t = useLanguageStore(s => s.t as Record<string, string | undefined>);
  const moderationCopy = getAdminModerationCopy(currentLanguage);
  const dashboardCopy = getAdminDashboardCopy(currentLanguage);

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  // 데이터
  const [ramInfo, setRamInfo]       = useState<any>(null);
  const [inquiries, setInquiries]   = useState<AdminInquiry[]>([]);
  const [reports, setReports]       = useState<ModerationQueueItem[]>([]);
  const [alerts, setAlerts]         = useState<SystemAlert[]>([]);
  const [searchQuery, setSearch]    = useState('');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState<ModerationQueueFilterKey>('actionable');
  const [users, setUsers]           = useState<AdminUser[]>([]);
  const [reportUpdatingId, setReportUpdatingId] = useState<string | null>(null);

  // 스레드 뷰
  const [activeInquiry, setActiveInq] = useState<AdminInquiry | null>(null);

  // 미읽은 카운트
  const [unreadCount, setUnread] = useState(0);

  const loadData = useCallback(async () => {
    if (!user?.jwtToken) return;
    setRefreshing(true);
    try {
      const [ram, inqs, moderationReports, alts, uc] = await Promise.all([
        RAMChecker.getInstance().check(),
        AdminAPI.getInquiries(user.jwtToken),
        AdminAPI.getReportsQueue(user.jwtToken),
        AdminAPI.getSystemAlerts(user.jwtToken),
        AdminAPI.getAdminUnreadCount(user.jwtToken),
      ]);
      setRamInfo(ram);
      setInquiries(inqs);
      setReports(moderationReports);
      setAlerts(alts);
      setUnread(uc);
    } catch (e) {
      console.warn('Dashboard load error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [user?.jwtToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // 미읽은 카운트 1분 폴링
  useEffect(() => {
    if (!user?.jwtToken) return;
    const poll = setInterval(async () => {
      const uc = await AdminAPI.getAdminUnreadCount(user.jwtToken!);
      setUnread(uc);
    }, 60_000);
    return () => clearInterval(poll);
  }, [user?.jwtToken]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user?.jwtToken) return;
    const res = await AdminAPI.searchUsers(searchQuery, user.jwtToken);
    setUsers(res);
  };

  const toggleUserBan = async (u: AdminUser) => {
    if (!user?.jwtToken) return;
    const next = u.status === 'banned' ? 'active' : 'banned';
    const nextLabel = next === 'banned' ? dashboardCopy.userSuspend : dashboardCopy.userRelease;
    const title = u.status === 'banned' ? dashboardCopy.userUnbanTitle : dashboardCopy.userBanTitle;
    const message = dashboardCopy.userBanMessage
      .replace('{nickname}', u.nickname)
      .replace('{status}', nextLabel);
    Alert.alert(
      title,
      message,
      [
        { text: t.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: t.confirm ?? 'Confirm',
          onPress: async () => {
            const ok = await AdminAPI.updateUserStatus(u.id, next as 'active' | 'banned', user.jwtToken!);
            if (ok) setUsers(prev => prev.map(item => item.id === u.id ? { ...item, status: next as 'active' | 'banned' } : item));
          },
        },
      ],
    );
  };

  const deleteUser = async (u: AdminUser) => {
    if (!user?.jwtToken) return;
    Alert.alert(
      dashboardCopy.userDeleteTitle,
      dashboardCopy.userDeleteMessage.replace('{nickname}', u.nickname),
      [
        { text: t.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: dashboardCopy.confirmDelete, style: 'destructive',
          onPress: async () => {
            const ok = await AdminAPI.deleteUser(u.id, user.jwtToken!);
            if (ok) setUsers(prev => prev.filter(item => item.id !== u.id));
          },
        },
      ],
    );
  };

  // 문의 스레드 열기
  const openInquiry = (inq: AdminInquiry) => {
    setActiveInq(inq);
    setActiveTab('inquiries');
  };

  // 해결 완료 콜백
  const handleResolved = (id: string) => {
    setInquiries(prev =>
      prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i),
    );
    if (activeInquiry?.id === id) {
      setActiveInq(prev => prev ? { ...prev, status: 'resolved' } : null);
    }
  };

  const pendingCount = inquiries.filter(i => i.status === 'pending').length;
  const moderationSummary = useMemo(() => getModerationQueueSummary(reports), [reports]);
  const actionableReportCount = moderationSummary.actionable;
  const sortedReports = useMemo(() => sortModerationQueue(reports), [reports]);
  const filteredReports = useMemo(() => {
    const statusFiltered = filterModerationQueue(sortedReports, reportStatusFilter);
    return searchModerationQueue(statusFiltered, reportSearchQuery);
  }, [reportSearchQuery, reportStatusFilter, sortedReports]);

  const changeReportStatus = (item: ModerationQueueItem, status: ModerationQueueStatus) => {
    if (!user?.jwtToken) return;

    const statusLabel = moderationCopy.statusLabels[status];
    const resolution = getResolutionPreset(status);
    const alertMessage = moderationCopy.statusChangeMessage
      .replace('{target}', getReportTargetLabel(item))
      .replace('{status}', statusLabel);

    Alert.alert(
      moderationCopy.statusChangeTitle,
      alertMessage,
      [
        { text: t.cancel ?? 'Cancel', style: 'cancel' },
        {
          text: moderationCopy.statusChangeConfirm,
          onPress: async () => {
            setReportUpdatingId(item.id);
            try {
              const ok = await AdminAPI.updateReportStatus(item.id, status, user.jwtToken!, resolution);
              if (!ok) {
                Alert.alert(moderationCopy.statusChangeFailedTitle, moderationCopy.statusChangeFailedBody);
                return;
              }

              setReports(prev => prev.map(report => (
                report.id === item.id
                  ? {
                      ...report,
                      status,
                      resolution,
                      updatedAt: new Date().toISOString(),
                    }
                  : report
              )));
            } finally {
              setReportUpdatingId(current => current === item.id ? null : current);
            }
          },
        },
      ],
    );
  };

  // ── 스레드 뷰 (Modal 대신 인라인) ──────────────────────────
  if (activeInquiry && activeTab === 'inquiries') {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <InquiryThreadView
          inquiry={activeInquiry}
          token={user?.jwtToken ?? ''}
          onBack={() => setActiveInq(null)}
          onResolved={handleResolved}
        />
      </SafeAreaView>
    );
  }

  const getFilterCount = (filterKey: ModerationQueueFilterKey) => {
    switch (filterKey) {
      case 'all':
        return moderationSummary.total;
      case 'actionable':
        return moderationSummary.actionable;
      case 'open':
        return moderationSummary.open;
      case 'reviewing':
        return moderationSummary.reviewing;
      case 'auto_hidden':
        return moderationSummary.autoHidden;
      case 'resolved':
        return moderationSummary.resolved;
      case 'rejected':
        return moderationSummary.rejected;
      default:
        return 0;
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* 고정 헤더 */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{dashboardCopy.headerTitle}</Text>
          <Text style={s.headerSub}>{dashboardCopy.headerSub}</Text>
        </View>
        <View style={s.headerActions}>
          {/* 미읽은 문의 알림 벨 */}
          {unreadCount > 0 && (
            <TouchableOpacity
              style={s.bellWrap}
              onPress={() => setActiveTab('inquiries')}
            >
              <Bell size={18} color={C.accent} />
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>{unreadCount}</Text>
              </View>
            </TouchableOpacity>
          )}
          <View style={[s.statusPill, alerts.length > 0 && s.statusPillError]}>
            <View style={[s.onlineDot, alerts.length > 0 && s.onlineDotError]} />
            <Text style={[s.statusPillTxt, alerts.length > 0 && s.statusPillTxtError]}>
              {alerts.length > 0
                ? dashboardCopy.statusIssues.replace('{count}', String(alerts.length))
                : dashboardCopy.statusOnline}
            </Text>
          </View>
        </View>
      </View>

      {/* 탭 */}
      <View style={s.tabBarShell}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
          <TabBtn id="overview"   label={dashboardCopy.overviewTab} active={activeTab} set={setActiveTab} />
          <TabBtn
            id="inquiries"
            label={dashboardCopy.helpTab}
            badge={pendingCount}
            active={activeTab}
            set={setActiveTab}
          />
          <TabBtn
            id="reports"
            label={dashboardCopy.reportsTab}
            badge={actionableReportCount}
            active={activeTab}
            set={setActiveTab}
          />
          <TabBtn id="users"  label={dashboardCopy.usersTab} active={activeTab} set={setActiveTab} />
          <TabBtn id="alerts" label={`${dashboardCopy.alertsTab} (${alerts.length})`} active={activeTab} set={setActiveTab} />
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#D4A853" />}
      >
        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <>
            <View style={s.metricGrid}>
              <MetricCard icon={<Users size={20} color={C.success} />}      label={dashboardCopy.metricActiveUsers} value="1,241" color={C.success} />
              <MetricCard icon={<MessageSquare size={20} color={C.accent} />} label={dashboardCopy.metricOpenTickets} value={String(pendingCount)} color={C.accent} />
            </View>

            <View style={s.moderationSummary}>
              <View style={s.moderationSummaryHeader}>
                <ShieldAlert size={18} color={C.warning} />
                <Text style={s.moderationSummaryTitle}>{moderationCopy.reportQueueTitle}</Text>
              </View>
              <Text style={s.moderationSummaryBody}>
                {formatLabeledCount(moderationCopy.actionableLabel, actionableReportCount)} · {formatLabeledCount(moderationCopy.criticalLabel, moderationSummary.critical)} · {formatLabeledCount(moderationCopy.autoHiddenLabel, moderationSummary.autoHidden)}
              </Text>
            </View>

            <View style={s.sectionHeader}>
              <Activity size={18} color={C.text3} />
              <Text style={s.sectionTitle}>{dashboardCopy.sectionRealTimeHealth}</Text>
            </View>
            <View style={s.healthCard}>
              <HealthRow icon={<HardDrive size={16} color={C.success} />} label={dashboardCopy.healthRam} value={ramInfo ? `${(ramInfo.availableRAM/1024).toFixed(1)}GB` : '...'} percent={ramInfo ? (ramInfo.availableRAM/ramInfo.totalRAM)*100 : 0} />
              <View style={s.divider} />
              <HealthRow icon={<Zap size={16} color={C.error} />} label={dashboardCopy.healthLlmLoad} value={dashboardCopy.healthLlmLoadValue} percent={85} />
            </View>

            <View style={s.sectionHeader}>
              <Clock size={18} color={C.text3} />
              <Text style={s.sectionTitle}>{dashboardCopy.sectionRecentModeration}</Text>
            </View>
            <View style={s.logBox}>
              {sortedReports.slice(0, 3).map(report => (
                <LogItem
                  key={report.id}
                  user={getReportReasonLabel(report.reason)}
                  action={moderationCopy.statusLabels[report.status]}
                  target={getReportTargetLabel(report)}
                  time={fmtTime(report.updatedAt ?? report.createdAt)}
                />
              ))}
              {sortedReports.length === 0 && (
                <>
                  <LogItem user={dashboardCopy.logSystem} action={dashboardCopy.logQueueReady} target={dashboardCopy.logNoActiveReports} time={t.timeJustNow ?? ''} />
                  <LogItem user={dashboardCopy.logAdmin} action={dashboardCopy.logStandby} target={dashboardCopy.logQueueSynced} time={t.timeJustNow ?? ''} />
                </>
              )}
            </View>

            {/* 최근 미해결 문의 미리보기 */}
            {pendingCount > 0 && (
              <>
                <View style={[s.sectionHeader, s.sectionHeaderMargin]}>
                  <MessageSquare size={18} color={C.accent} />
                  <Text style={s.sectionTitle}>{dashboardCopy.unresolvedInquiries} ({pendingCount})</Text>
                </View>
                <View style={s.sectionGap8}>
                  {inquiries.filter(i => i.status === 'pending').slice(0, 3).map(inq => (
                    <InquiryRow key={inq.id} inq={inq} onPress={() => openInquiry(inq)} />
                  ))}
                  {pendingCount > 3 && (
                    <TouchableOpacity
                      style={s.viewAllBtn}
                      onPress={() => setActiveTab('inquiries')}
                    >
                      <Text style={s.viewAllText}>{dashboardCopy.viewAll} ({pendingCount})</Text>
                      <ChevronRight size={14} color={C.accent} />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* ── INQUIRIES ── */}
        {activeTab === 'inquiries' && (
          <View style={s.listWrap}>
            {inquiries.length === 0 ? (
              <EmptyState label={dashboardCopy.noInquiries} />
            ) : (
              inquiries.map(inq => (
                <InquiryRow key={inq.id} inq={inq} onPress={() => openInquiry(inq)} />
              ))
            )}
          </View>
        )}

        {/* ── REPORTS ── */}
        {activeTab === 'reports' && (
          <View style={s.listWrap}>
            <View style={s.reportSummaryCard}>
              <Text style={s.reportSummaryTitle}>{moderationCopy.moderationQueueSummaryTitle}</Text>
              <Text style={s.reportSummaryText}>{formatLabeledCount(moderationCopy.immediateActionLabel, actionableReportCount)}</Text>
              <Text style={s.reportSummaryText}>{formatLabeledCount(moderationCopy.importantReportsLabel, moderationSummary.critical)} · {formatLabeledCount(moderationCopy.autoHiddenLabel, moderationSummary.autoHidden)}</Text>
              <Text style={s.reportSummaryText}>{formatLabeledCount(moderationCopy.totalReportsLabel, reports.length)} · {formatLabeledCount(moderationCopy.currentResultsLabel, filteredReports.length)}</Text>
            </View>

            <View style={s.searchBox}>
              <TextInput
                style={s.searchInput}
                placeholder={moderationCopy.reportSearchPlaceholder}
                placeholderTextColor={C.text4}
                value={reportSearchQuery}
                onChangeText={setReportSearchQuery}
              />
              <Search size={20} color={C.accent} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.reportFilterRow}
            >
              {REPORT_FILTERS.map(filter => {
                const active = reportStatusFilter === filter;
                const count = getFilterCount(filter);
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[s.reportFilterChip, active && s.reportFilterChipActive]}
                    onPress={() => setReportStatusFilter(filter)}
                  >
                    <Text style={[s.reportFilterChipText, active && s.reportFilterChipTextActive]}>
                      {getReportFilterLabel(filter)}
                    </Text>
                    <View style={[s.reportFilterCount, active && s.reportFilterCountActive]}>
                      <Text style={[s.reportFilterCountText, active && s.reportFilterCountTextActive]}>
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {reports.length === 0 ? (
              <EmptyState label={moderationCopy.noReports} />
            ) : filteredReports.length === 0 ? (
              <EmptyState label={moderationCopy.noMatchingReports} />
            ) : (
              filteredReports.map(report => (
                <ReportQueueCard
                  key={report.id}
                  item={report}
                  isUpdating={reportUpdatingId === report.id}
                  onChangeStatus={changeReportStatus}
                />
              ))
            )}
          </View>
        )}

        {/* ── USERS ── */}
        {activeTab === 'users' && (
          <View style={s.listWrap}>
            <View style={s.searchBox}>
              <TextInput
                style={s.searchInput}
                placeholder={dashboardCopy.userSearchPlaceholder}
                placeholderTextColor={C.text4}
                value={searchQuery}
                onChangeText={setSearch}
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity onPress={handleSearch}>
                <Search size={20} color={C.accent} />
              </TouchableOpacity>
            </View>

            {users.map(u => (
              <View key={u.id} style={s.userCard}>
                <View style={s.userInfo}>
                  <Text style={s.userName}>{u.nickname}</Text>
                  <Text style={s.userEmail}>{u.email}</Text>
                  <Text style={s.userDate}>{dashboardCopy.joinedLabel}: {u.created_at}</Text>
                </View>
                <TouchableOpacity
                  style={[s.banBtn, u.status === 'banned' && s.unbanBtn]}
                  onPress={() => toggleUserBan(u)}
                >
                  {u.status === 'banned'
                    ? <UserCheck size={18} color={C.success} />
                    : <UserX size={18} color={C.error} />}
                  <Text style={[s.banBtnTxt, u.status === 'banned' && s.txtSuccess]}>
                    {u.status === 'banned' ? dashboardCopy.userRelease : dashboardCopy.userSuspend}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.banBtn, s.banBtnMargin]} onPress={() => deleteUser(u)}>
                  <ShieldAlert size={18} color={C.error} />
                  <Text style={[s.banBtnTxt, s.txtError]}>{dashboardCopy.userDelete}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── ALERTS ── */}
        {activeTab === 'alerts' && (
          <View style={s.listWrap}>
            {alerts.length === 0 ? (
              <EmptyState label={dashboardCopy.noAlerts} />
            ) : (
              alerts.map(alt => (
                <View key={alt.id} style={[s.alertCard, alt.type === 'error' && s.alertCardError]}>
                  <View style={s.alertSide}>
                    {alt.type === 'error'
                      ? <AlertCircle size={20} color={C.error} />
                      : <AlertTriangle size={20} color={C.warning} />}
                  </View>
                  <View style={s.alertContent}>
                    <Text style={s.alertMsg}>{alt.message}</Text>
                    <Text style={s.alertSource}>{dashboardCopy.alertSource}: {alt.source} · {alt.timestamp}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────
function TabBtn({ id, label, badge, active, set }: {
  id: string; label: string; badge?: number;
  active: string; set: (v: any) => void;
}) {
  const isAct = active === id;
  return (
    <TouchableOpacity style={[s.tabBtn, isAct && s.tabBtnAct]} onPress={() => set(id)}>
      <View style={s.tabBtnContent}>
        <Text style={[s.tabBtnTxt, isAct && s.tabBtnTxtAct]}>{label}</Text>
        {badge != null && badge > 0 && (
          <View style={s.tabBadge}>
            <Text style={s.tabBadgeTxt}>{badge}</Text>
          </View>
        )}
      </View>
      {isAct && <View style={s.tabIndicator} />}
    </TouchableOpacity>
  );
}

function MetricCard({ icon, label, value, color: _color }: any) {
  return (
    <View style={s.metricCard}>
      <View style={s.metricHeader}>{icon}</View>
      <Text style={s.metricVal}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function HealthRow({ icon, label, value, percent }: any) {
  return (
    <View style={s.healthRow}>
      <View style={s.healthTop}>
        <View style={s.healthLabelBox}>{icon}<Text style={s.healthLabel}>{label}</Text></View>
        <Text style={s.healthValueText}>{value}</Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${percent}%` }, percent > 80 ? s.bgError : s.bgSuccess]} />
      </View>
    </View>
  );
}

function LogItem({ user, action, target, time }: any) {
  return (
    <View style={s.logItem}>
      <View style={s.logMain}>
        <Text style={s.logUser}>{user}</Text>
        <Text style={s.logAction}>{action}</Text>
        <Text style={s.logTarget}>{target}</Text>
      </View>
      <Text style={s.logTime}>{time}</Text>
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={s.emptyState}>
      <ShieldAlert size={48} color={C.border} />
      <Text style={s.emptyStateTxt}>{label}</Text>
    </View>
  );
}

// ─── 스타일: 버블 (bs) ────────────────────────────────────────
const bs = StyleSheet.create({
  wrap:          { maxWidth: '78%', gap: 4, marginVertical: 4 },
  wrapAdmin:     { alignSelf: 'flex-start', alignItems: 'flex-start' },
  wrapUser:      { alignSelf: 'flex-end',   alignItems: 'flex-end' },
  senderBadge:   {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: 'rgba(212,168,83,0.14)', borderRadius: 8, marginBottom: 2,
  },
  senderBadgeText: { color: C.accent, fontSize: 10, fontWeight: '700' },
  bubble:        { borderRadius: 16, padding: 12, gap: 6 },
  bubbleAdmin:   {
    backgroundColor: '#18181F',
    borderWidth: 1, borderColor: '#22222E',
    borderBottomLeftRadius: 4,
  },
  bubbleUser:    {
    backgroundColor: '#25252F',
    borderBottomRightRadius: 4,
  },
  bodyText:      { color: C.text0, fontSize: 14, lineHeight: 21 },
  bodyTextAdmin: { color: C.text1 },
  photo:         { width: 200, height: 150, borderRadius: 8 },
  timeText:      { color: C.text5, fontSize: 10, textAlign: 'right' },
  timeTextAdmin: { textAlign: 'left' },
});

// ─── 스타일: 스레드 뷰 (ts) ───────────────────────────────────
const ts = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.bg1, gap: 10,
  },
  headerTitleWrap: { flex: 1, marginHorizontal: 10 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1E1E28',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.text0, fontSize: 15, fontWeight: '700' },
  headerSub:   { color: C.text3, fontSize: 11, marginTop: 1 },
  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 12, backgroundColor: C.success,
  },
  resolveBtnText:  { color: C.bg0, fontSize: 12, fontWeight: '700' },
  resolvedBadge:   {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.30)',
  },
  resolvedBadgeText: { color: C.success, fontSize: 11, fontWeight: '700' },

  originalBox: {
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: 16, paddingVertical: 10, gap: 2,
  },
  originalLabel: { color: C.text4, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  originalBody:  { color: C.text2, fontSize: 13, lineHeight: 19 },
  originalTime:  { color: C.text5, fontSize: 10 },

  loadBox:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  threadList:    { padding: 16, gap: 4, paddingBottom: 24 },
  emptyThread:   { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyThreadText: { color: C.text4, fontSize: 13 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.bg1,
  },
  input: {
    flex: 1, minHeight: 38, maxHeight: 110,
    backgroundColor: '#1E1E28',
    borderRadius: 16, borderWidth: 1, borderColor: '#22222E',
    paddingHorizontal: 14, paddingVertical: 9,
    color: C.text0, fontSize: 14,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDim: { opacity: 0.35 },
});

// ─── 스타일: 문의 행 (ir) ─────────────────────────────────────
const ir = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 10,
  },
  left:    { width: 28, alignItems: 'center' },
  center:  { flex: 1, gap: 3 },
  topRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:   { color: C.text0, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  time:    { color: C.text5, fontSize: 11 },
  sub:     { color: C.text4, fontSize: 11 },
  preview: { color: C.text3, fontSize: 12 },
  badge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  badgePend: { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)' },
  badgeOk:   { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.25)' },
  badgeText: { fontSize: 10, fontWeight: '700' },
});

const rr = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMain: { flex: 1, gap: 4 },
  target: {
    color: C.text0,
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
  },
  meta: {
    color: C.text4,
    fontSize: 11,
  },
  badgeCluster: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  priorityHint: {
    color: C.accent,
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  detail: {
    color: C.text2,
    fontSize: 13,
    lineHeight: 19,
  },
  detailMuted: {
    color: C.text5,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    color: C.text5,
    fontSize: 11,
  },
  resolutionBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.18)',
    backgroundColor: 'rgba(212,168,83,0.08)',
    padding: 10,
    gap: 4,
  },
  resolutionLabel: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resolutionText: {
    color: C.text2,
    fontSize: 12,
    lineHeight: 18,
  },
  actionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnWarning: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.24)',
  },
  actionBtnSuccess: {
    backgroundColor: 'rgba(74,222,128,0.10)',
    borderColor: 'rgba(74,222,128,0.24)',
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderColor: 'rgba(248,113,113,0.24)',
  },
  actionBtnMuted: {
    backgroundColor: 'rgba(138,138,158,0.10)',
    borderColor: 'rgba(138,138,158,0.24)',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnTextWarning: {
    color: C.warning,
  },
  actionBtnTextSuccess: {
    color: C.success,
  },
  actionBtnTextDanger: {
    color: C.error,
  },
  actionBtnTextMuted: {
    color: C.text3,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: C.text4,
    fontSize: 12,
  },
});

// ─── 스타일: 메인 대시보드 (s) — 기존 유지 ────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg0 },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 24, fontFamily: Typography.fontFamily.bold, color: C.text0 },
  headerSub:   { fontSize: 13, color: C.text4, marginTop: 2 },

  // 벨 버튼
  bellWrap: { position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  bellBadgeText: { color: C.bg0, fontSize: 9, fontWeight: '700' },

  statusPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(74,222,128,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillError:   { backgroundColor: 'rgba(248,113,113,0.1)' },
  onlineDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  onlineDotError:    { backgroundColor: C.error },
  statusPillTxt:     { fontSize: 11, color: C.success, fontFamily: Typography.fontFamily.bold },
  statusPillTxtError:{ color: C.error },
  txtSuccess:        { color: C.success },
  txtError:          { color: C.error },
  chevronRight:      { marginLeft: 4 },
  headerActions:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionGap8:       { gap: 8 },
  sectionHeaderMargin: { marginTop: 24 },
  banBtnMargin:      { marginLeft: 8 },
  tabBtnContent:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bgSuccess:         { backgroundColor: C.success },
  bgError:           { backgroundColor: C.error },

  tabBarShell:   { borderBottomWidth: 1, borderBottomColor: C.border0 },
  tabBar:        { flexDirection: 'row', paddingHorizontal: 15 },
  tabBtn:        { paddingHorizontal: 15, paddingVertical: 12, marginRight: 5, position: 'relative' },
  tabBtnAct:     {},
  tabBtnTxt:     { fontSize: 13, color: C.text4, fontFamily: Typography.fontFamily.semibold },
  tabBtnTxtAct:  { color: C.accent },
  tabIndicator:  { position: 'absolute', bottom: 0, left: 15, right: 15, height: 2, backgroundColor: C.accent },
  tabBadge:      {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  tabBadgeTxt:   { color: C.bg0, fontSize: 9, fontWeight: '700' },

  scrollContent: { padding: 20, paddingBottom: 60 },
  metricGrid:    { flexDirection: 'row', gap: 12, marginBottom: 24 },
  metricCard:    { flex: 1, backgroundColor: C.surface, borderRadius: Radius.lg, padding: 16, borderWidth: 1, borderColor: C.border },
  metricHeader:  { marginBottom: 12 },
  metricVal:     { fontSize: 22, fontFamily: Typography.fontFamily.bold, color: C.text0 },
  metricLabel:   { fontSize: 12, color: C.text4, marginTop: 4 },
  moderationSummary: {
    marginBottom: 24,
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.18)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    gap: 6,
  },
  moderationSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moderationSummaryTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: C.text1,
  },
  moderationSummaryBody: {
    color: C.text3,
    fontSize: 12,
  },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle:  { fontSize: 12, fontFamily: Typography.fontFamily.bold, color: C.text3, textTransform: 'uppercase', letterSpacing: 1 },

  healthCard:      { backgroundColor: C.surface, borderRadius: Radius.xl, padding: 20, borderWidth: 1, borderColor: C.border, marginBottom: 24 },
  healthRow:       { paddingVertical: 10 },
  healthTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  healthLabelBox:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthLabel:     { fontSize: 13, color: C.text1 },
  healthValueText: { fontSize: 12, color: C.text3 },
  progressTrack:   { height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFill:    { height: '100%' },
  divider:         { height: 1, backgroundColor: C.border, marginVertical: 2 },

  logBox:    { backgroundColor: C.surface, borderRadius: Radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  logItem:   { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border0 },
  logMain:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logUser:   { fontSize: 11, color: C.accent, fontWeight: '800' },
  logAction: { fontSize: 11, color: C.text1 },
  logTarget: { fontSize: 11, color: C.text4 },
  logTime:   { fontSize: 10, color: C.text5 },

  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10,
    backgroundColor: 'rgba(212,168,83,0.07)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212,168,83,0.20)',
  },
  viewAllText: { color: C.accent, fontSize: 13, fontWeight: '600' },

  listWrap:    { gap: 10 },
  reportSummaryCard: {
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 4,
  },
  reportSummaryTitle: {
    color: C.text0,
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
  },
  reportSummaryText: {
    color: C.text4,
    fontSize: 12,
  },
  reportFilterRow: {
    gap: 8,
    paddingBottom: 4,
  },
  reportFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#0C0C14',
  },
  reportFilterChipActive: {
    borderColor: 'rgba(212,168,83,0.34)',
    backgroundColor: 'rgba(212,168,83,0.12)',
  },
  reportFilterChipText: {
    color: C.text3,
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  reportFilterChipTextActive: {
    color: C.text0,
  },
  reportFilterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: 'rgba(138,138,158,0.16)',
  },
  reportFilterCountActive: {
    backgroundColor: C.accent,
  },
  reportFilterCountText: {
    color: C.text3,
    fontSize: 10,
    fontWeight: '700',
  },
  reportFilterCountTextActive: {
    color: C.bg0,
  },
  searchBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0C0C14', paddingHorizontal: 16, height: 48, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  searchInput: { flex: 1, color: C.text0, fontSize: 14 },

  userCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, padding: 16, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border },
  userInfo:    { flex: 1 },
  userName:    { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: C.text0 },
  userEmail:   { fontSize: 12, color: C.text4, marginTop: 2 },
  userDate:    { fontSize: 11, color: C.text5, marginTop: 4 },
  banBtn:      { padding: 10, borderRadius: 8, backgroundColor: 'rgba(248,113,113,0.1)', alignItems: 'center', gap: 4 },
  unbanBtn:    { backgroundColor: 'rgba(74,222,128,0.1)' },
  banBtnTxt:   { fontSize: 11, color: C.error, fontFamily: Typography.fontFamily.bold },

  alertCard:      { flexDirection: 'row', backgroundColor: C.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  alertCardError: { borderColor: 'rgba(248,113,113,0.3)' },
  alertSide:      { width: 44, alignItems: 'center', paddingTop: 16 },
  alertContent:   { flex: 1, padding: 16, paddingLeft: 0 },
  alertMsg:       { fontSize: 14, color: C.text0, fontFamily: Typography.fontFamily.medium },
  alertSource:    { fontSize: 11, color: C.text4, marginTop: 6 },

  emptyState:    { padding: 60, alignItems: 'center', gap: 16 },
  emptyStateTxt: { color: C.text5, fontSize: 13 },
});
