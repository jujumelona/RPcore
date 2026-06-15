// src/components/StoryProgress.tsx
// ══════════════════════════════════════════════════════════════
// 스토리 진행 상황 추적 컴포넌트
// 챕터 진행률, 발견한 엔딩, 대화 수 등 표시
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { View, Text, StyleSheet } from 'react-native';
import { EmotionColors } from '../constants/EmotionColors';
import { Radius, Typography } from '../constants/tokens';

interface StoryProgressProps {
  completion: number;
  endingsFound: number;
  totalEndings: number;
  messageCount: number;
  visitedChapters: number;
  totalChapters: number;
}

export function StoryProgress({
  completion,
  endingsFound,
  totalEndings,
  messageCount,
  visitedChapters,
  totalChapters }: StoryProgressProps) {
  const t = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.storyProgress}</Text>
      
      <View style={styles.statsGrid}>
        <StatItem
          label={t.progressRate}
          value={`${completion}%`}
          color={EmotionColors.neutral.primary}
        />
        <StatItem
          label={t.endingsFound}
          value={`${endingsFound}/${totalEndings}`}
          color={EmotionColors.e5_love.primary}
        />
        <StatItem
          label={t.messageCount}
          value={messageCount.toString()}
          color={EmotionColors.e1_joy.primary}
        />
        <StatItem
          label={t.visitedChapters}
          value={`${visitedChapters}/${totalChapters}`}
          color={EmotionColors.e2_sadness.primary}
        />
      </View>
      
      {/* 진행률 바 */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${completion}%`,
                backgroundColor: EmotionColors.neutral.primary },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  color: string;
}

function StatItem({ label, value, color }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0C0C14',
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A1A24' },
  title: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    marginBottom: 16 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16 },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0E0E14',
    borderRadius: Radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1A1A24' },
  statLabel: {
    fontSize: 11,
    color: '#797990',
    marginBottom: 6,
    fontFamily: Typography.fontFamily.regular },
  statValue: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold },
  progressBarContainer: {
    marginTop: 4 },
  progressBar: {
    height: 6,
    backgroundColor: '#0E0E14',
    borderRadius: 3,
    overflow: 'hidden' },
  progressFill: {
    height: '100%',
    borderRadius: 3 } });
