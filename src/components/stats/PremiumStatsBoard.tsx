// src/components/stats/PremiumStatsBoard.tsx
// PREMIUM STATS v1 - Powered by GiftedCharts
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Typography } from '../../constants/tokens';
import { Play, BarChart3 } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const POINTER_CONFIG = {
  pointerStripColor: 'rgba(96,165,250,0.3)',
  pointer1Color: '#60A5FA',
  radius: 6,
  pointerLabelComponent: PointerLabel };

function PointerLabel(items: any) {
  return (
    <View style={s.pointerLabel}>
      <Text style={s.pointerVal}>{items[0].value}</Text>
    </View>
  );
}

export function PremiumStatsBoard({ views = [], genre = [] }: { views?: any[], genre?: any[] }) {
  return (
    <View style={s.root}>
      {/* 1. 상단 요약 카드 (Glassmorphism) - 조회수 중심 */}
      <View style={s.summaryRow}>
        <StatSummaryCard
          icon={<Play size={16} color="#60A5FA" fill="#60A5FA" />}
          label="총 재생횟수"
          value={views.reduce((acc, v) => acc + (v.value || 0), 0).toLocaleString()}
          sub="+12% vs last week"
        />
      </View>

      {/* 2. 메인 추이 차트 (Line Chart) */}
      <View style={s.chartCard}>
        <View style={s.cardHeader}>
          <BarChart3 size={18} color="#8A8A9E" />
          <Text style={s.cardTitle}>재생횟수 추이</Text>
        </View>
        <View style={s.chartWrapper}>
          <LineChart
            data={views}
            width={width - 80}
            height={160}
            spacing={(width - 100) / (views.length || 7)}
            initialSpacing={10}
            color1="#60A5FA"
            thickness={3}
            dataPointsColor1="#60A5FA"
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={0}
            yAxisTextStyle={s.chartAxisText}
            xAxisLabelTextStyle={s.chartAxisText}
            hideRules
            showVerticalLines={false}
            pointerConfig={POINTER_CONFIG}
            curved
            animateOnDataChange
            animationDuration={1000}
            areaChart
            startFillColor="rgba(96,165,250,0.35)"
            endFillColor="rgba(96,165,250,0.01)"
          />
        </View>
      </View>

      {/* 3. 장르별 실적 (Bar Chart) - 있다면 표시 */}
      {genre.length > 0 && (
        <View style={s.chartCard}>
          <Text style={s.cardTitle}>장르별 창작 비중 (%)</Text>
          <View style={s.chartWrapper}>
            <BarChart
              horizontal
              barWidth={18}
              barBorderRadius={4}
              frontColor="#60A5FA"
              data={genre}
              yAxisThickness={0}
              xAxisThickness={0}
              hideRules
              noOfSections={3}
              yAxisLabelTextStyle={s.chartAxisText}
              width={width - 100}
              height={140}
              isAnimated
            />
          </View>
        </View>
      )}
    </View>
  );
}

function StatSummaryCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
}) {
  return (
    <View style={s.summaryCard}>
      <LinearGradient
        colors={['rgba(96,165,250,0.06)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={s.summaryIconWrap}>{icon}</View>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryVal}>{value}</Text>
      <Text style={s.summarySub}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 0, gap: 16, marginBottom: 0, marginTop: 8 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1, backgroundColor: '#0F0F16', borderRadius: Radius.lg,
    padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden'
  },
  summaryIconWrap: { marginBottom: 8 },
  summaryLabel: { fontSize: 11, color: '#6A6A80', fontFamily: Typography.fontFamily.medium },
  summaryVal: { fontSize: 20, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginVertical: 4 },
  summarySub: { fontSize: 10, color: '#60A5FA', fontFamily: Typography.fontFamily.semibold },

  chartCard: {
    backgroundColor: '#0F0F16', borderRadius: Radius.xl,
    padding: 18, borderWidth: 1, borderColor: '#1E1E2A'
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  cardTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#E8E8F0' },
  chartWrapper: { alignItems: 'center', marginTop: 10 },
  chartAxisText: { color: '#4A4A60', fontSize: 10 },
  
  pointerLabel: {
    backgroundColor: '#1E1E2E', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: '#60A5FA'
  },
  pointerVal: { color: '#60A5FA', fontWeight: 'bold', fontSize: 12 }
});
