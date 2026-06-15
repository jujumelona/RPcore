// src/components/chat/MessageDateSeparator.tsx
// ═══════════════════════════════════════════════════════════════════
// Mattermost 메시지 타임스탬프 그룹핑 패턴 이식
//
// ✅ 날짜 구분선 (오늘/어제/N일 전/절대 날짜)
// ✅ 5분 이내 연속 메시지 → 발신자 이름 생략
// ✅ i18n 지원 (한국어/영어)
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';

// ── Types ──────────────────────────────────────────────────────────

export interface GroupableMessage {
  id: string;
  timestamp: number;
  speaker: number;
  speakerName: string;
}

export interface MessageGroup<T extends GroupableMessage> {
  /** 날짜 구분선 텍스트 (null이면 같은 날짜 내 후속 메시지) */
  dateSeparator: string | null;
  /** 발신자 정보 표시 여부 (false면 연속 메시지로 이름 생략) */
  showSender: boolean;
  /** 원본 메시지 */
  message: T;
}

// ── Constants ─────────────────────────────────────────────────────

const CONSECUTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5분

// 날짜 포맷은 i18n 키 + toLocaleDateString 자동 로케일 사용

// ── Date Formatting ───────────────────────────────────────────────

function getDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRelativeDate(ts: number, t: Record<string, string>): string {
  const now = new Date();
  const target = new Date(ts);

  const todayKey = getDateKey(now.getTime());
  const targetKey = getDateKey(ts);

  if (todayKey === targetKey) {
    return t.dateSeparator_today;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (getDateKey(yesterday.getTime()) === targetKey) {
    return t.dateSeparator_yesterday;
  }

  const diffDays = Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return t.dateSeparator_daysAgo.replace('{{count}}', String(diffDays));
  }

  // 7일 이상은 로케일 기본 포맷 사용
  if (target.getFullYear() === now.getFullYear()) {
    return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });
  }

  return target.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Grouping Logic ────────────────────────────────────────────────

export function groupMessages<T extends GroupableMessage>(
  messages: T[],
  t: Record<string, string>,
): MessageGroup<T>[] {
  if (!messages.length) return [];

  const result: MessageGroup<T>[] = [];
  let lastDateKey = '';
  let lastSpeaker = -1;
  let lastTimestamp = 0;

  for (const msg of messages) {
    const dateKey = getDateKey(msg.timestamp);
    const dateSeparator = dateKey !== lastDateKey
      ? formatRelativeDate(msg.timestamp, t)
      : null;

    // 같은 발신자 + 5분 이내 + 같은 날짜 → 이름 생략
    const isConsecutive =
      dateKey === lastDateKey &&
      msg.speaker === lastSpeaker &&
      msg.timestamp - lastTimestamp < CONSECUTIVE_THRESHOLD_MS;

    result.push({
      dateSeparator,
      showSender: !isConsecutive,
      message: msg });

    lastDateKey = dateKey;
    lastSpeaker = msg.speaker;
    lastTimestamp = msg.timestamp;
  }

  return result;
}

// ── Time Label Formatting ─────────────────────────────────────────

export function useFormatMessageTime() {
  const t = useTranslation();
  return useCallback((ts: number): string => {
    const d = new Date(ts);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const period = h < 12 ? t.timeAM : t.timePM;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${period} ${h12}:${m}`;
  }, [t]);
}

// Backward compatible export - use in components
export { useFormatMessageTime as formatMessageTime };

// ── React Component ───────────────────────────────────────────────

interface DateSeparatorProps {
  text: string;
}

export const DateSeparator = memo(function DateSeparator({ text }: DateSeparatorProps) {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.text}>{text}</Text>
      <View style={styles.line} />
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginVertical: 4 },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)' },
  text: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: 12 } });

// ── Hook for easy integration ─────────────────────────────────────

export function useMessageGroups<T extends GroupableMessage>(
  messages: T[],
): MessageGroup<T>[] {
  const t = useTranslation();
  return useMemo(
    () => groupMessages(messages, t),
    [messages, t],
  );
}
