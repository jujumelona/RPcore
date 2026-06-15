
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/ReadingStatsScreen.tsx
// ═══════════════════════════════════════════════════════════════════
//  Tachiyomi 리딩 통계 대시보드 화면
//  — RPcore 디자인 시스템 적용
// ═══════════════════════════════════════════════════════════════════

import { Typography } from '../constants/tokens';
import React, { useMemo, useCallback } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useReadingStatsStore,
  formatReadTime } from '../store/readingStatsStore';
import { useTranslation } from '../hooks/useTranslation';
import { ArrowLeft, Flame, Clock, FileText, BookOpen } from 'lucide-react-native';

// ── Stat Card ─────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: string; label: string; color: string;
}) {
  return (
    <View style={[styles.card, { borderColor: color + '30' }]}>
      <Icon size={22} color={color} style={{ marginBottom: 6 }} />
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

// ── Week Chart ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _WeekChart({ data }: { data: { date: string; readTimeMs: number }[] }) {
  const maxMs = Math.max(...data.map(d => d.readTimeMs), 1);
  const days = ['일', '월', '화', '수', '목', '금', '토'];

  return (
      
     
     
    <View style={styles.chart}>
      {data.map((d) => {
        const height = Math.max((d.readTimeMs / maxMs) * 100, 4);
        const dayOfWeek = new Date(d.date).getDay();
        return (
          <View key={d.date} style={styles.chartCol}>
            <View style={[styles.chartBar, { height, backgroundColor: d.readTimeMs > 0 ? '#D4A853' : '#1a1a1e' }]} />
            <Text style={[styles.chartDay, d.readTimeMs > 0 && { color: '#D4A853' }]}>
              {days[dayOfWeek] ?? ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────

export default function ReadingStatsScreen() {
  const nav = useNavigation();
  const t = useTranslation() as Record<string, string>;
  const {
    totalReadTimeMs,
    totalWordsRead,
    totalChaptersRead,
    getStreak,
    getWeeklyStats,
    getMonthlyTotal } = useReadingStatsStore();

  const streak = useMemo(() => getStreak(), [getStreak]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _weekly = useMemo(() => getWeeklyStats(), [getWeeklyStats]);
  const monthly = useMemo(() => getMonthlyTotal(), [getMonthlyTotal]);

  const handleBack = useCallback(() => nav.goBack(), [nav]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color={'#F0F0F5'} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t.readingStatsTitle}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 스트릭 배너 */}
        <View style={styles.streakBanner}>
          <Flame size={40} color={'#D4A853'} fill={'#D4A853'} style={{ marginBottom: 4 }} />
          <Text style={styles.streakValue}>{streak}</Text>
          <Text style={styles.streakLabel}>{t.readingStreak}</Text>
        </View>

        {/* 총 통계 카드 */}
        <View style={styles.cardRow}>
          <StatCard
            icon={Clock}
            value={formatReadTime(totalReadTimeMs)}
            label={t.totalReadTime}
            color="#D4A853"
          />
          <StatCard
            icon={FileText}
            value={totalWordsRead.toLocaleString()}
            label={t.totalWords}
            color="#8B5CF6"
          />
          <StatCard
            icon={BookOpen}
            value={String(totalChaptersRead)}
            label={t.totalChapters}
            color="#5B9BD5"
          />
        </View>

        {/* 월간 요약 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.monthlyStats}</Text>
          <View style={styles.monthRow}>
            <View style={styles.monthItem}>
              <Text style={styles.monthValue}>{formatReadTime(monthly.readTimeMs)}</Text>
              <Text style={styles.monthLabel}>{t.readTime}</Text>
            </View>
            <View style={styles.monthDivider} />
            <View style={styles.monthItem}>
              <Text style={styles.monthValue}>{monthly.wordsRead.toLocaleString()}</Text>
              <Text style={styles.monthLabel}>{t.words}</Text>
            </View>
            <View style={styles.monthDivider} />
            <View style={styles.monthItem}>
              <Text style={styles.monthValue}>{monthly.chaptersRead}</Text>
              <Text style={styles.monthLabel}>{t.chapters}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050507' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#1a1a1e' },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#E8E6E3', fontFamily: Typography.fontFamily.bold },
  scroll: { padding: 16, paddingBottom: 40 },

  // Streak
  streakBanner: {
    alignItems: 'center', paddingVertical: 24, marginBottom: 16,
    backgroundColor: '#0d0d10', borderRadius: 16,
    borderWidth: 0.5, borderColor: '#D4A85330' },
  streakIcon: { fontSize: 40, marginBottom: 4 },
  streakValue: { fontSize: 48, fontWeight: '800', color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  streakLabel: { fontSize: 14, color: '#999', marginTop: 4 },

  // Cards
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  card: {
    flex: 1, backgroundColor: '#0d0d10', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 0.5 },
  cardIcon: { fontSize: 22, marginBottom: 6 },
  cardValue: { fontSize: 18, fontWeight: '700', fontFamily: Typography.fontFamily.bold },
  cardLabel: { fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center' },

  // Section
  section: {
    backgroundColor: '#0d0d10', borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#1a1a1e' },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#D4A853',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 },

  // Chart
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120 },
  chartCol: { alignItems: 'center', flex: 1 },
  chartBar: { width: 20, borderRadius: 4, minHeight: 4 },
  chartDay: { fontSize: 11, color: '#555', marginTop: 6 },

  // Monthly
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  monthItem: { flex: 1, alignItems: 'center' },
  monthValue: { fontSize: 16, fontWeight: '700', color: '#E8E6E3', fontFamily: Typography.fontFamily.bold },
  monthLabel: { fontSize: 11, color: '#888', marginTop: 4 },
  monthDivider: { width: 1, height: 30, backgroundColor: '#1a1a1e' } });
