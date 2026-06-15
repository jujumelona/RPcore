import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Radius, Typo, Typography } from '../../../constants/tokens';
import type { LicenseType } from '../OpenSourceLicensesData';
import { getLicenseColor, getLicenseStats } from '../OpenSourceLicensesData';

interface LicenseStatsProps {
  libraries: any[];
}

export const LicenseStats: React.FC<LicenseStatsProps> = ({ libraries }) => {
  const stats = getLicenseStats(libraries);
  const totalLibraries = libraries.length;

  const sortedLicenses = Object.entries(stats)
    .sort(([, a], [, b]) => b - a) as [LicenseType, number][];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>라이선스 통계</Text>
      <Text style={styles.subtitle}>총 {totalLibraries}개 라이브러리</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {sortedLicenses.map(([license, count]) => {
          const percentage = totalLibraries > 0
            ? ((count / totalLibraries) * 100).toFixed(1)
            : '0.0';
          const color = getLicenseColor(license);

          return (
            <View key={license} style={styles.statItem}>
              <View
                style={[
                  styles.statBadge,
                  { backgroundColor: color },
                ]}
              >
                <Text style={styles.statLicense}>{license}</Text>
              </View>
              <Text style={styles.statCount}>{count}개</Text>
              <Text style={styles.statPercentage}>{percentage}%</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB' },
  title: {
    fontSize: Typo.size.h3,
    fontFamily: Typography.fontFamily.semibold,
    color: '#111827',
    marginBottom: 4 },
  subtitle: {
    fontSize: Typo.size.md,
    color: '#6B7280',
    marginBottom: 12 },
  scrollContainer: {
    flex: 1 },
  scrollContent: {
    paddingRight: 16 },
  statItem: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 80 },
  statBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    marginBottom: 4,
    minWidth: 60,
    alignItems: 'center' },
  statLicense: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.medium,
    color: '#0E0E14',
    textAlign: 'center' },
  statCount: {
    fontSize: Typo.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: '#111827',
    marginBottom: 2 },
  statPercentage: {
    fontSize: Typo.size.sm,
    color: '#6B7280' } });
