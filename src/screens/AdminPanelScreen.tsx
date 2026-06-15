/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/AdminPanelScreen.tsx
// 어드민 전용 스토리 심사 패널
//
// 기능:
//   - 상태별 스토리 목록 조회 (pending / approved / rejected / suspended)
//   - 승인 (POST /admin/stories/:id/approve)
//   - 반려 (POST /admin/stories/:id/reject) — 사유 필수, 프리셋 제공
//   - 정지 (POST /admin/stories/:id/suspend)
//   - 스토리 미리보기 모달 (기본정보 / JSON config / HTML 구조 미리보기)

import { Typography } from '../constants/tokens';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, ActivityIndicator,
  Modal, Alert, RefreshControl, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Megaphone, ArrowLeft, Sparkles, RefreshCcw, History, Eye, Check, X, Ban, Pencil } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { SERVER_BASE } from '../config/ApiConfig';
import { useAuthStore } from '../store/authStore';
import { isAdmin } from '../core/user';
import { getAdminPanelCopy } from '../i18n/adminPanelCopy';
import { authedFetch } from '../utils/authedFetch';
import { useLanguageStore } from '../store/languageStore';
import { useShallow } from 'zustand/react/shallow';

// ─── 타입 ────────────────────────────────────────────────────
type StoryStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface AdminStory {
  id: string;
  title: string;
  description: string;
  genre: string;
  thumb_url: string | null;
  status: StoryStatus;
  reject_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  author_nickname: string;
  author_email: string;
  is_update: number;  // 0 = 신규, 1 = 수정 승인 요청
}

// ─── 서버 API 헬퍼 ──────────────────────────────────────────
// [BUG FIX] authedFetch 사용 — 10초 타임아웃, 만료 토큰 자동 로그아웃 포함
// 기존: bare fetch 사용 → 타임아웃 없음, 만료 토큰 감지 안 됨
async function adminFetch(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<any> {
  const res = await authedFetch(`${SERVER_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

// ─── 유틸 ────────────────────────────────────────────────────
function fmtDate(s: string | null) {
  if (!s) return '—';
  return s.replace('T', ' ').slice(0, 16);
}

const STATUS_COLOR: Record<StoryStatus, string> = {
  pending:   '#F59E0B',
  approved:  '#10B981',
  rejected:  '#EF4444',
  suspended: '#6B7280' };

function getStatusLabels(copy: ReturnType<typeof getAdminPanelCopy>): Record<StoryStatus, string> {
  return {
    pending: copy.statusPending,
    approved: copy.statusApproved,
    rejected: copy.statusRejected,
    suspended: copy.statusSuspended };
}

type TranslationMap = Record<string, string | undefined>;

type AdminUiLabels = {
  cancel: string;
  goBack: string;
  reviewPanelTitle: string;
  htmlPreview: string;
  previewAction: string;
  previousRejectReason: string;
  intro: string;
  worldSetting: string;
  noValue: string;
  userSetting: string;
  traits: string;
  characters: string;
  background: string;
  backgroundImages: string;
  chapters: string;
  chapterNumber: string;
  goal: string;
  introMessage: string;
  image: string;
  ending: string;
  loading: string;
  name: string;
  title: string;
  personality: string;
  submittedMetaPrefix: string;
  updateRequest: string;
  newSubmission: string;
  overviewTab: string;
  configTab: string;
  author: string;
  genre: string;
  submitted: string;
};

function getLocalizedGender(value: string | null | undefined, t: TranslationMap): string {
  if (!value) return '';
  if (value === 'male') return t?.genderMale ?? value;
  if (value === 'female') return t?.genderFemale ?? value;
  if (value === 'other') return t?.genderOther ?? value;
  return value;
}

function getAdminUiLabels(
  t: TranslationMap,
  copy: ReturnType<typeof getAdminPanelCopy>,
): AdminUiLabels {
  return {
    cancel: t?.cancel ?? '',
    goBack: t?.goBack ?? '',
    reviewPanelTitle: t?.reviewPanelTitle ?? '',
    htmlPreview: t?.htmlPreview ?? '',
    previewAction: t?.previewAction ?? '',
    previousRejectReason: t?.previousRejectReason ?? '',
    intro: t?.intro ?? '',
    worldSetting: t?.worldSetting ?? '',
    noValue: t?.noValue ?? '',
    userSetting: t?.userSetting ?? '',
    traits: t?.traits ?? '',
    characters: t?.characters ?? '',
    background: t?.background ?? '',
    backgroundImages: t?.editorBgLabel ?? '',
    chapters: copy.chaptersLabel,
    chapterNumber: t?.editorChapterNum ?? '',
    goal: t?.editorChapterAiGoal ?? '',
    introMessage: t?.introMessage ?? '',
    image: t?.editorIntroImage ?? '',
    ending: t?.endingLabel ?? '',
    loading: t?.loading ?? '',
    name: t?.editorCharName ?? '',
    title: t?.titlePlaceholder ?? '',
    personality: t?.personality ?? '',
    submittedMetaPrefix: copy.submittedMetaPrefix,
    updateRequest: copy.updateRequest,
    newSubmission: copy.newSubmission,
    overviewTab: copy.overviewTab,
    configTab: copy.configTab,
    author: copy.authorLabel,
    genre: copy.genreLabel,
    submitted: copy.submittedLabel,
  };
}

// ─── 상태 뱃지 ──────────────────────────────────────────────
function StatusBadge({ status }: { status: StoryStatus }) {
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const copy = getAdminPanelCopy(currentLanguage as Parameters<typeof getAdminPanelCopy>[0]);
  const statusLabels = getStatusLabels(copy);
  const color = STATUS_COLOR[status];
  return (
    <View style={[st.badge, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={[st.badgeText, { color }]}>{statusLabels[status]}</Text>
    </View>
  );
}

// ─── 반려 사유 모달 ─────────────────────────────────────────
const REJECT_PRESETS = [
  '가이드라인 위반 콘텐츠 포함',
  '설명/캐릭터 정보 부족',
  '불완전한 챕터 구성',
  '저작권 침해 우려',
  '청소년 유해 콘텐츠 (연령제한 미설정)',
  '스팸 또는 허위 정보',
];

function RejectModal({
  visible, onClose, onConfirm, loading }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const copy = getAdminPanelCopy(currentLanguage as Parameters<typeof getAdminPanelCopy>[0]);
  const rejectPresets = copy.rejectPresets.length > 0 ? copy.rejectPresets : REJECT_PRESETS;
  const [reason, setReason] = useState('');
  useEffect(() => { if (!visible) setReason(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.overlay}>
        <View style={st.sheetBox}>
          <Text style={st.sheetTitle}>{copy.rejectTitle}</Text>
          <Text style={st.sheetSub}>{copy.rejectSubtitle}</Text>

          {/* 프리셋 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.presetScroll}>
            {rejectPresets.map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setReason(p)}
                style={[st.preset, reason === p && st.presetActive]}
              >
                <Text style={[st.presetText, reason === p && st.presetTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            style={st.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder={copy.rejectPlaceholder}
            placeholderTextColor="#444"
            multiline
            numberOfLines={4}
          />

          <View style={st.modalBtns}>
            <TouchableOpacity style={st.modalCancel} onPress={onClose}>
              <Text style={st.modalCancelText}>{t?.cancel ?? ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.modalConfirm, (!reason.trim() || loading) && st.modalConfirmDisabled]}
              disabled={!reason.trim() || loading}
              onPress={() => onConfirm(reason.trim())}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.modalConfirmText}>{copy.confirmReject}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 스토리 미리보기 모달 ───────────────────────────────────
type PreviewTab = 'info' | 'config' | 'html';

function buildHtml(
  story: AdminStory,
  cfg: import('../types/StoryContract').StoryConfig,
  statusLabels: Record<StoryStatus, string>,
  labels: AdminUiLabels,
): string {
  const chars = cfg?.characters ?? [];
  const chapters = cfg?.chapters   ?? [];
  const hashtags: string = (cfg?.hashtags ?? cfg?.storyHashtag ?? '').split(' ').filter(Boolean)
    .map((t: string) => `<span class="tag">${t}</span>`).join(' ');

  const charRows = chars.map((c: import('../types/StoryContract').StoryCharacter) =>
    `<tr><td>${c.name ?? ''}</td><td>${(c.personality ?? '').slice(0, 80)}</td></tr>`
  ).join('');

  const chRows = chapters.map((ch: import('../types/StoryContract').StoryChapter, i: number) =>
    `<tr><td>${i + 1}</td><td>${ch.title ?? ''}</td><td>${(ch.aiGoal ?? '').slice(0, 80)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#111;color:#ddd;padding:20px;font-size:13px;line-height:1.6}
  h1{font-size:20px;color:#fff;margin-bottom:8px}
  h2{font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px}
  .meta{color:#777;font-size:12px;margin-bottom:10px}
  .desc{color:#bbb;white-space:pre-wrap;background:#1a1a1a;padding:12px;border-radius:8px;margin-bottom:6px}
  .tag{display:inline-block;background:#222;border-radius:12px;padding:2px 10px;font-size:11px;color:#888;margin:2px}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{background:#1e1e1e;color:#666;text-align:left;padding:6px 10px;font-size:11px;font-weight:600}
  td{padding:6px 10px;border-bottom:1px solid #1e1e1e;vertical-align:top;color:#ccc}
  .badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;
         background:${STATUS_COLOR[story.status]}22;color:${STATUS_COLOR[story.status]};border:1px solid ${STATUS_COLOR[story.status]}}
</style></head><body>
<h1>${story.title}</h1>
<div class="meta">
  ${labels.genre}: <b>${story.genre}</b> &nbsp;·&nbsp;
  ${labels.author}: <b>${story.author_nickname}</b> &nbsp;·&nbsp;
  ${labels.submitted}: ${fmtDate(story.submitted_at)} &nbsp;
  <span class="badge">${statusLabels[story.status]}</span>
</div>
<div style="margin-bottom:12px">${hashtags}</div>

<h2>${labels.intro}</h2>
<div class="desc">${story.description || labels.noValue}</div>

<h2>${labels.worldSetting}</h2>
<div class="desc">${cfg?.worldSetting || labels.noValue}</div>

<h2>${labels.characters} (${chars.length})</h2>
<table>
  <tr><th>${labels.name}</th><th>${labels.personality}</th></tr>
  ${charRows || `<tr><td colspan="2" style="color:#555">${labels.noValue}</td></tr>`}
</table>

<h2>${labels.chapters} (${chapters.length})</h2>
<table>
  <tr><th>#</th><th>${labels.title}</th><th>${labels.goal}</th></tr>
  ${chRows || `<tr><td colspan="3" style="color:#555">${labels.noValue}</td></tr>`}
</table>
</body></html>`;
}

function PreviewModal({
  visible, story, onClose }: {
  visible: boolean;
  story: AdminStory | null;
  onClose: () => void;
}) {
  const token  = useAuthStore(s => s.user?.jwtToken ?? '');
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const copy = getAdminPanelCopy(currentLanguage as Parameters<typeof getAdminPanelCopy>[0]);
  const statusLabels = getStatusLabels(copy);
  const labels = getAdminUiLabels(t, copy);
  const [tab,     setTab]     = useState<PreviewTab>('info');
  const [detail,  setDetail]  = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // [fix] exhaustive-deps: story, token 추가
  useEffect(() => {
    if (!visible || !story) return;
    setDetail(null); setLoading(true); setTab('info');
    let cancelled = false;
    adminFetch(`/story-meta/${story.id}`, token)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, story, token]);

  if (!story) return null;
  const cfg = detail?.story_config ?? {};
  const backgroundItems = (cfg.backgrounds ?? []).filter(
    (background: import('../types/StoryContract').StoryBackground) => background.imageUrl,
  );

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={st.previewRoot}>
        <StatusBar barStyle="light-content" />

        {/* 헤더 */}
        <View style={st.previewHeader}>
          <TouchableOpacity onPress={onClose} style={st.iconBtn}>
            <ArrowLeft size={22} color="#888" />
          </TouchableOpacity>
          <Text style={st.previewTitle} numberOfLines={1}>{story.title}</Text>
          <View style={st.statusGroup}>
            <StatusBadge status={story.status} />
            <View style={story.is_update ? st.updateBadgeEdit : st.updateBadgeNew}>
              <View style={st.updateRow}>
                {story.is_update ? <Pencil size={12} color="#D4A853" /> : <Sparkles size={12} color="#10B981" />}
                <Text style={story.is_update ? st.updateTextEdit : st.updateTextNew}>
                  {story.is_update ? labels.updateRequest : labels.newSubmission}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 탭 */}
        <View style={st.tabBar}>
          {(['info', 'config', 'html'] as PreviewTab[]).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[st.tabBtn, tab === t && st.tabBtnActive]}
            >
              <Text style={[st.tabBtnText, tab === t && st.tabBtnTextActive]}>
                {t === 'info' ? labels.overviewTab : t === 'config' ? labels.configTab : labels.htmlPreview}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading
          ? <ActivityIndicator color="#fff" style={st.centerLoader} size="large" />
          : (
            <ScrollView contentContainerStyle={st.previewScrollContent}>

              {/* 기본 정보 탭 */}
              {tab === 'info' && (
                <>
                  <InfoBlock label={copy.authorLabel} value={`${story.author_nickname}  (${story.author_email})`} emptyValueLabel={labels.noValue} />
                  <InfoBlock label={copy.genreLabel} value={story.genre} emptyValueLabel={labels.noValue} />
                  <InfoBlock label={copy.submittedLabel} value={fmtDate(story.submitted_at)} emptyValueLabel={labels.noValue} />
                  {story.reject_reason && (
                    <InfoBlock label={labels.previousRejectReason} value={story.reject_reason} accent="#FFA040" emptyValueLabel={labels.noValue} />
                  )}
                  <BlockBox label={labels.intro} text={story.description} emptyValueLabel={labels.noValue} />
                  <BlockBox label={labels.worldSetting} text={cfg.worldSetting} emptyValueLabel={labels.noValue} />
                  {cfg.userSetting && (
                    <View style={st.blockBox}>
                      <Text style={st.blockLabel}>{labels.userSetting}</Text>
                      <View style={st.charRow}>
                        <View style={st.avatarBox}>
                          <Text style={st.avatarEmoji} />
                        </View>
                        <View style={st.charInfo}>
                          {cfg.userSetting.name ? (
                            <Text style={st.charName}>{cfg.userSetting.name}</Text>
                          ) : null}
                          {(cfg.userSetting.age || cfg.userSetting.gender) ? (
                            <Text style={st.charMeta}>
                              {[cfg.userSetting.age, getLocalizedGender(cfg.userSetting.gender, t)].filter(Boolean).join('  ·  ')}
                            </Text>
                          ) : null}
                          {cfg.userSetting.traits ? (
                            <Text style={st.charMeta}>{labels.traits}: {cfg.userSetting.traits}</Text>
                          ) : null}
                          {cfg.userSetting.description ? (
                            <Text style={st.charDesc} numberOfLines={3}>{cfg.userSetting.description}</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 캐릭터 — 이미지 포함 */}
                  <View style={st.blockBox}>
                    <Text style={st.blockLabel}>{labels.characters} ({(cfg.characters ?? []).length})</Text>
                    {(cfg.characters ?? []).map((c: import('../types/StoryContract').StoryCharacter, i: number) => (
                      <View key={i} style={st.charRow}>
                        {c.profileUrl ? (
                          <Image
                            source={{ uri: c.profileUrl }}
                            style={st.charImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={st.avatarBox}>
                            <Text style={st.avatarEmoji} />
                          </View>
                        )}
                        <View style={st.charInfo}>
                          <Text style={st.charName}>{c.name || labels.noValue}</Text>
                          {(c.age || c.gender) ? <Text style={st.charMeta}>{[c.age, getLocalizedGender(c.gender, t)].filter(Boolean).join(' · ')}</Text> : null}
                          <Text style={st.charDescMt} numberOfLines={3}>{c.personality ?? ''}</Text>
                          {c.traits ? <Text style={st.charMeta}>{labels.traits}: {c.traits}</Text> : null}
                        </View>
                      </View>
                    ))}
                    {!(cfg.characters?.length) && <Text style={st.blockEmpty}>{labels.noValue}</Text>}
                  </View>

                  {/* 배경 이미지 */}
                  {backgroundItems.length > 0 && (
                    <View style={st.blockBox}>
                      <Text style={st.blockLabel}>{labels.backgroundImages} ({backgroundItems.length})</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.bgScroll}>
                        {backgroundItems.map((b: import('../types/StoryContract').StoryBackground, i: number) => (
                          <View key={i} style={st.bgItem}>
                            <Image
                              source={{ uri: b.uri }}
                              style={st.bgImg}
                              resizeMode="cover"
                            />
                            <Text style={st.bgLabel}>{b.label || `${labels.background} ${i + 1}`}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* 챕터 */}
                  <View style={st.blockBox}>
                    <Text style={st.blockLabel}>{labels.chapters} ({(cfg.chapters ?? []).length})</Text>
                    {(cfg.chapters ?? []).map((ch: import('../types/StoryContract').StoryChapter, i: number) => (
                      <View key={i} style={st.chapterItem}>
                        <Text style={st.chapterTitle}>
                          {labels.chapterNumber} {i + 1}. {ch.title || labels.noValue}{ch.isEnding ? `   ${labels.ending}` : ''}
                        </Text>
                        {ch.aiGoal ? <Text style={st.chapterGoal}>{labels.goal}: {ch.aiGoal}</Text> : null}
                        {ch.background ? <Text style={st.chapterBg}>{labels.background}: {typeof ch.background === 'string' ? ch.background : ch.background?.label ?? ''}</Text> : null}
                      </View>
                    ))}
                    {!(cfg.chapters?.length) && <Text style={st.blockEmpty}>{labels.noValue}</Text>}
                  </View>

                  {/* 소개 메시지 */}
                  {cfg.introMessages && Object.keys(cfg.introMessages).length > 0 && (
                    <View style={st.blockBox}>
                      <Text style={st.blockLabel}>{labels.introMessage}</Text>
                      {Object.entries(cfg.introMessages).map(([key, msgs]: [string, any]) => (
                        Array.isArray(msgs) && msgs.length > 0 ? (
                          <View key={key} style={st.introKeyBox}>
                            <Text style={st.introKeyText}>{key}</Text>
                            {msgs.map((m: import('../store/chatStore').ChatMessage, i: number) => (
                              <Text key={i} style={st.introMsg}>
                                {m.speakerType === 'image' ? ` ${labels.image}` : `${m.speakerLabel ?? m.speakerType}: ${m.text ?? ''}`}
                              </Text>
                            ))}
                          </View>
                        ) : null
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* JSON 탭 */}
              {tab === 'config' && (
                <View style={st.codeBox}>
                  <Text style={st.codeText}>
                    {detail ? JSON.stringify(detail.story_config, null, 2) : labels.loading}
                  </Text>
                </View>
              )}

              {/* HTML 미리보기 탭 */}
              {tab === 'html' && (
                <View style={st.codeBox}>
                  <Text style={st.codeTextGreen}>
                    {detail ? buildHtml(story, cfg, statusLabels, labels) : labels.loading}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
      </SafeAreaView>
    </Modal>
  );
}

function InfoBlock({
  label,
  value,
  accent,
  emptyValueLabel,
}: {
  label: string;
  value?: string | null;
  accent?: string;
  emptyValueLabel: string;
}) {
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={[st.infoValue, accent ? { color: accent } : undefined]}>{value || emptyValueLabel}</Text>
    </View>
  );
}

function BlockBox({ label, text, emptyValueLabel }: { label: string; text?: string; emptyValueLabel: string }) {
  return (
    <View style={st.blockBox}>
      <Text style={st.blockLabel}>{label}</Text>
      <Text style={st.blockText}>{text || emptyValueLabel}</Text>
    </View>
  );
}

// ─── 메인 화면 ──────────────────────────────────────────────
export function AdminPanelScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const token = user?.jwtToken ?? '';
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const { t } = useLanguageStore(useShallow(s => ({ t: s.t })));
  const copy = getAdminPanelCopy(currentLanguage as Parameters<typeof getAdminPanelCopy>[0]);
  const statusLabels = getStatusLabels(copy);
  const labels = getAdminUiLabels(t, copy);

  const [statusFilter, setStatusFilter] = useState<StoryStatus>('pending');
  const [stories,   setStories]   = useState<AdminStory[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [rejectId,  setRejectId]  = useState<string | null>(null);
  const [previewStory, setPreviewStory] = useState<AdminStory | null>(null);

  // ── 목록 로드 ─────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await adminFetch(`/admin/stories?status=${statusFilter}`, token);
      setStories(data.stories ?? []);
    } catch (e: unknown) {
      Alert.alert(copy.loadFailedTitle, e instanceof Error ? e.message : copy.loadStoriesFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line
  }, [statusFilter, token]);

  useEffect(() => { load(); }, [load]);

  // ── 승인 ──────────────────────────────────────────────────
  const handleApprove = (story: AdminStory) => {
    Alert.alert(
      copy.approveStoryTitle,
      copy.approveStoryMessage.replace('{title}', story.title),
      [
        { text: labels.cancel, style: 'cancel' },
        {
          text: copy.approveAction,
          onPress: async () => {
            setActionId(story.id);
            try {
              await adminFetch(`/admin/stories/${story.id}/approve`, token, {
                method: 'POST',
                body: JSON.stringify({ note: copy.approvedByAdminPanel }) });
              setStories(p => p.filter(s => s.id !== story.id));
            } catch (e: unknown) {
              Alert.alert(copy.approveFailedTitle, e instanceof Error ? e.message : copy.requestFailed);
            } finally {
              setActionId(null);
            }
          } },
      ],
    );
  };

  // ── 반려 확정 ─────────────────────────────────────────────
  const handleRejectConfirm = async (reason: string) => {
    if (!rejectId) return;
    setActionId(rejectId);
    try {
      await adminFetch(`/admin/stories/${rejectId}/reject`, token, {
        method: 'POST',
        body: JSON.stringify({ reason }) });
      setStories(p => p.filter(s => s.id !== rejectId));
      setRejectId(null);
    } catch (e: unknown) {
      Alert.alert(copy.rejectFailedTitle, e instanceof Error ? e.message : copy.requestFailed);
    } finally {
      setActionId(null);
    }
  };

  // ── 정지 ──────────────────────────────────────────────────
  const handleSuspend = (story: AdminStory) => {
    Alert.alert(
      copy.suspendStoryTitle,
      copy.suspendStoryMessage.replace('{title}', story.title),
      [
        { text: labels.cancel, style: 'cancel' },
        {
          text: copy.suspendAction, style: 'destructive',
          onPress: async () => {
            setActionId(story.id);
            try {
              await adminFetch(`/admin/stories/${story.id}/suspend`, token, {
                method: 'POST',
                body: JSON.stringify({ reason: copy.suspendedByAdminPanel }) });
              setStories(p => p.filter(s => s.id !== story.id));
            } catch (e: unknown) {
              Alert.alert(copy.suspendFailedTitle, e instanceof Error ? e.message : copy.requestFailed);
            } finally {
              setActionId(null);
            }
          } },
      ],
    );
  };

  // ── 어드민 아닌 경우 차단 ─────────────────────────────────
  if (!isAdmin(user)) {
    return (
      <SafeAreaView style={st.rootCentered}>
        <Text style={st.deniedText}>{copy.adminRoleRequired}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.deniedBtn}>
          <Text style={st.deniedBtnText}>{labels.goBack}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.root}>
      <StatusBar barStyle="light-content" />

      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.iconBtn}>
          <ArrowLeft size={22} color="#888" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{labels.reviewPanelTitle}</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('AdminAnnouncement')} 
          style={st.iconBtn}
        >
          <Megaphone size={20} color="#D4A853" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => load(true)} style={st.iconBtn}>
          <RefreshCcw size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* 상태 필터 */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={st.filterScroll}
        contentContainerStyle={st.filterScrollContent}
      >
        {(['pending', 'approved', 'rejected', 'suspended'] as StoryStatus[]).map(s => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatusFilter(s)}
            style={[
              st.filterChip,
              statusFilter === s && {
                borderColor: STATUS_COLOR[s],
                backgroundColor: STATUS_COLOR[s] + '22' },
            ]}
          >
            <Text style={[
              st.filterText,
              statusFilter === s && { color: STATUS_COLOR[s] },
              statusFilter === s && st.filterTextActive,
            ]}>
              {statusLabels[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 목록 */}
      {loading
        ? <ActivityIndicator color="#fff" style={st.centerLoader} size="large" />
        : (
          <ScrollView
            contentContainerStyle={st.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#555" />
            }
          >
            {stories.length === 0 && (
              <View style={st.emptyView}>
                <Text style={st.emptyText}>
                  {statusFilter === 'pending' ? copy.noStoriesWaiting : copy.noStoriesInStatus}
                </Text>
              </View>
            )}

            {stories.map(story => (
              <View key={story.id} style={st.card}>

                {/* 카드 헤더 */}
                <View style={st.cardHeader}>
                  <View style={st.cardHeaderLeft}>
                    <Text style={st.cardTitle} numberOfLines={2}>{story.title}</Text>
                    <Text style={st.cardMeta}>
                      {story.author_nickname}  ·  {story.genre}  ·  {labels.submittedMetaPrefix} {fmtDate(story.submitted_at)}
                    </Text>
                  </View>
                  <View style={st.cardHeaderRight}>
                    <StatusBadge status={story.status} />
                    <View style={story.is_update ? st.updateBadgeEdit : st.updateBadgeNew}>
                      <View style={st.updateRow}>
                        {story.is_update ? <Pencil size={11} color="#D4A853" /> : <Sparkles size={11} color="#10B981" />}
                        <Text style={story.is_update ? st.updateTextEdit : st.updateTextNew}>
                          {story.is_update ? labels.updateRequest : labels.newSubmission}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 소개 */}
                <Text style={st.cardDesc} numberOfLines={3}>{story.description}</Text>

                {/* 이전 반려 사유 */}
                {story.reject_reason && (
                  <View style={st.rejectBox}>
                    <History size={12} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={st.rejectText}>{labels.previousRejectReason}: {story.reject_reason}</Text>
                  </View>
                )}

                {/* 액션 버튼 */}
                <View style={st.actionRow}>
                  {/* 미리보기 — 항상 표시 */}
                  <TouchableOpacity
                    style={st.btnPreview}
                    onPress={() => setPreviewStory(story)}
                  >
                    <Eye size={16} color="#D4A853" />
                    <Text style={st.btnPreviewText}>{labels.previewAction}</Text>
                  </TouchableOpacity>

                  {/* 심사중: 승인 + 반려 */}
                  {story.status === 'pending' && (
                    <>
                      <TouchableOpacity
                        style={[st.btnApprove, actionId === story.id && st.btnDisabled]}
                        disabled={actionId === story.id}
                        onPress={() => handleApprove(story)}
                      >
                        {actionId === story.id
                          ? <ActivityIndicator color="#10B981" size="small" />
                          : (
                            <>
                              <Check size={16} color="#10B981" />
                              <Text style={st.btnApproveText}>{copy.approveAction}</Text>
                            </>
                          )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.btnReject, actionId === story.id && st.btnDisabled]}
                        disabled={actionId === story.id}
                        onPress={() => setRejectId(story.id)}
                      >
                        <X size={16} color="#EF4444" />
                        <Text style={st.btnRejectText}>{copy.rejectAction}</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* 승인됨: 정지 */}
                  {story.status === 'approved' && (
                    <TouchableOpacity
                      style={[st.btnSuspend, actionId === story.id && st.btnDisabled]}
                      disabled={actionId === story.id}
                      onPress={() => handleSuspend(story)}
                    >
                      <Ban size={16} color="#EF4444" />
                      <Text style={st.btnSuspendText}>{copy.suspendAction}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

      {/* 반려 사유 모달 */}
      <RejectModal
        visible={!!rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={handleRejectConfirm}
        loading={actionId === rejectId}
      />

      {/* 미리보기 모달 */}
      <PreviewModal
        visible={!!previewStory}
        story={previewStory}
        onClose={() => setPreviewStory(null)}
      />
    </SafeAreaView>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' },
  rootCentered: { flex: 1, backgroundColor: '#050507', justifyContent: 'center', alignItems: 'center' },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#0C0C14' },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 16, fontFamily: Typography.fontFamily.bold, textAlign: 'center' },
  iconBtn:     { padding: 10 },
  backArrow:   { color: '#888', fontSize: 22, lineHeight: 26 },
  refreshIcon: { color: '#666', fontSize: 20 },

  // 접근 거부
  deniedText:    { color: '#EF4444', fontSize: 18, fontFamily: Typography.fontFamily.bold },
  deniedBtn:     { marginTop: 20 },
  deniedBtnText: { color: '#666' },

  // 필터
  filterScroll:        { flexGrow: 0 },
  filterScrollContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#181820',
    backgroundColor: '#0E0E14' },
  filterText:       { fontSize: 13, color: '#555' },
  filterTextActive: { fontFamily: Typography.fontFamily.bold },

  // 목록
  centerLoader: { marginTop: 60 },
  listContent:  { padding: 16, gap: 12, paddingBottom: 40 },
  emptyView:    { alignItems: 'center', paddingTop: 80 },
  emptyText:    { color: '#444', fontSize: 14 },

  // 카드
  card: {
    backgroundColor: '#0E0E14', borderRadius: 12,
    borderWidth: 1, borderColor: '#1E1E1E',
    padding: 14, gap: 10 },
  cardHeader:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeaderLeft:  { flex: 1 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 4 },
  cardTitle: { color: '#FFF', fontSize: 15, fontFamily: Typography.fontFamily.bold, lineHeight: 22 },
  cardMeta:  { color: '#555', fontSize: 11, marginTop: 3 },
  cardDesc:  { color: '#888', fontSize: 13, lineHeight: 19 },
  updateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // 업데이트 뱃지
  updateBadgeNew: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#1A3A1A', borderWidth: 1, borderColor: '#22C55E' },
  updateBadgeEdit: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#1E3A5F', borderWidth: 1, borderColor: '#3B82F6' },
  updateTextNew:  { fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#4ADE80' },
  updateTextEdit: { fontSize: 10, fontFamily: Typography.fontFamily.bold, color: '#60A5FA' },

  // 뱃지
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, flexShrink: 0 },
  badgeText: { fontSize: 11, fontFamily: Typography.fontFamily.bold },

  // 반려 사유 표시
  rejectBox:  { backgroundColor: '#1A0808', borderRadius: 6, padding: 8, borderWidth: 1, borderColor: '#3A1212' },
  rejectText: { color: '#EF4444', fontSize: 12, lineHeight: 18 },

  // 액션 버튼 행
  actionRow: { flexDirection: 'row', gap: 7, marginTop: 2 },
  btnDisabled: { opacity: 0.4 },
  btnPreview: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#181820', backgroundColor: '#0E0E14',
    alignItems: 'center' },
  btnPreviewText: { color: '#888', fontSize: 13, fontFamily: Typography.fontFamily.semibold },
  btnApprove: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#10B981', backgroundColor: '#0A2318',
    alignItems: 'center' },
  btnApproveText: { color: '#10B981', fontSize: 13, fontFamily: Typography.fontFamily.bold },
  btnReject: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#EF4444', backgroundColor: '#200808',
    alignItems: 'center' },
  btnRejectText: { color: '#EF4444', fontSize: 13, fontFamily: Typography.fontFamily.bold },
  btnSuspend: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#4B5563', backgroundColor: '#0E0E14',
    alignItems: 'center' },
  btnSuspendText: { color: '#9CA3AF', fontSize: 13, fontFamily: Typography.fontFamily.bold },

  // 반려 모달 시트
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheetBox: {
    backgroundColor: '#0E0E14', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 12,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#222' },
  sheetTitle: { color: '#FFF', fontSize: 18, fontFamily: Typography.fontFamily.bold },
  sheetSub:   { color: '#555', fontSize: 13, marginTop: -4 },
  presetScroll: { marginBottom: 12 },
  preset: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16, borderWidth: 1, borderColor: '#181820',
    backgroundColor: '#0C0C14', marginRight: 6 },
  presetActive:         { borderColor: '#7C3AED', backgroundColor: '#1A0A2E' },
  presetText:           { color: '#555', fontSize: 12 },
  presetTextActive:     { color: '#C4B5FD', fontFamily: Typography.fontFamily.bold },
  reasonInput: {
    backgroundColor: '#0C0C14', borderRadius: 10,
    borderWidth: 1, borderColor: '#181820',
    color: '#EEE', padding: 12, fontSize: 14,
    minHeight: 90, textAlignVertical: 'top' },
  modalBtns:            { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center' },
  modalCancelText:      { color: '#888', fontSize: 15, fontFamily: Typography.fontFamily.semibold },
  modalConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#EF4444', backgroundColor: '#200808',
    alignItems: 'center' },
  modalConfirmDisabled: { opacity: 0.35 },
  modalConfirmText:     { color: '#EF4444', fontSize: 15, fontFamily: Typography.fontFamily.bold },

  // 미리보기 모달
  previewRoot:          { flex: 1, backgroundColor: '#050507' },
  previewScrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  statusGroup:          { alignItems: 'flex-end', gap: 3 },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#0C0C14', gap: 8 },
  previewTitle: { flex: 1, color: '#FFF', fontSize: 15, fontFamily: Typography.fontFamily.bold },
  tabBar:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#0C0C14' },
  tabBtn:           { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:     { borderBottomWidth: 2, borderBottomColor: '#FFF' },
  tabBtnText:       { color: '#444', fontSize: 12, fontFamily: Typography.fontFamily.semibold },
  tabBtnTextActive: { color: '#FFF' },

  // 미리보기 내용
  blockBox: {
    backgroundColor: '#0E0E14', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#1E1E1E', gap: 4 },
  blockLabel: { color: '#555', fontSize: 11, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 },
  blockText:  { color: '#BBB', fontSize: 13, lineHeight: 20 },
  blockEmpty: { color: '#333', fontSize: 13 },
  codeBox: {
    backgroundColor: '#080808', borderRadius: 8, padding: 14,
    borderWidth: 1, borderColor: '#1E1E1E' },
  codeText: {
    color: '#888', fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 18 },
  codeTextGreen: {
    color: '#7EC8A0', fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 18 },

  // 캐릭터 / 사용자 설정
  charRow:    { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'flex-start' },
  charInfo:   { flex: 1 },
  charImg:    { width: 52, height: 52, borderRadius: 8, backgroundColor: '#222', flexShrink: 0 },
  avatarBox:  { width: 52, height: 52, borderRadius: 8, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarEmoji: { color: '#444', fontSize: 20 },
  charName:   { color: '#FFF', fontSize: 13, fontFamily: Typography.fontFamily.bold },
  charMeta:   { color: '#666', fontSize: 11, marginTop: 2 },
  charDesc:   { color: '#AAA', fontSize: 12, marginTop: 4, lineHeight: 17 },
  charDescMt: { color: '#AAA', fontSize: 12, marginTop: 2, lineHeight: 17 },

  // 배경 이미지
  bgScroll: { marginTop: 8 },
  bgItem:   { marginRight: 8, alignItems: 'center' },
  bgImg:    { width: 100, height: 70, borderRadius: 6, backgroundColor: '#222' },
  bgLabel:  { color: '#666', fontSize: 10, marginTop: 3 },

  // 챕터
  chapterItem:  { marginTop: 8, borderBottomWidth: 1, borderBottomColor: '#0C0C14', paddingBottom: 8 },
  chapterTitle: { color: '#DDD', fontSize: 13, fontFamily: Typography.fontFamily.semibold },
  chapterGoal:  { color: '#888', fontSize: 12, marginTop: 2 },
  chapterBg:    { color: '#666', fontSize: 11, marginTop: 2 },

  // 인트로 메시지
  introKeyBox:  { marginTop: 6 },
  introKeyText: { color: '#555', fontSize: 11 },
  introMsg:     { color: '#AAA', fontSize: 12, marginTop: 2 },

  // InfoBlock
  infoRow:   { flexDirection: 'row', gap: 10 },
  infoLabel: { color: '#555', fontSize: 12, width: 90, flexShrink: 0, paddingTop: 1 },
  infoValue: { color: '#CCC', fontSize: 12, flex: 1, lineHeight: 18 },
  linkText: {color: '#00BFFF'},
  liveColor: { color: '#00BFFF' } });
