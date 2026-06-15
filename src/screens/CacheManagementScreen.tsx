
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/CacheManagementScreen.tsx
// ═══════════════════════════════════════════════════════════════════
//  캐시 관리 화면 — 카테고리별 크기 표시 + 개별/일괄 삭제
// ═══════════════════════════════════════════════════════════════════

import { Typography } from '../constants/tokens';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CacheManager, formatBytes, type CacheSummary } from '../utils/CacheManager';
import { useTranslation } from '../hooks/useTranslation';
import { HardDrive, ArrowLeft, Image as ImageIcon, BookOpen, Trash2, ClipboardList } from 'lucide-react-native';

const CatIcon = ({ id }: { id: string }) => {
  const props = { size: 20, color: '#D4A853', style: { width: 28 } };
  switch (id) {
    case 'images':   return <ImageIcon {...props} />;
    case 'chapters': return <BookOpen {...props} />;
    case 'temp':     return <Trash2 {...props} />;
    case 'logs':     return <ClipboardList {...props} />;
    default:         return null;
  }
};

export default function CacheManagementScreen() {
  const nav = useNavigation();
  const t = useTranslation() as Record<string, string>;
  const [summary, setSummary] = useState<CacheSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await CacheManager.getCacheSummary();
    setSummary(s);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleClear = (id: string, label: string) => {
    Alert.alert(
      t.cacheClearTitle,
      `${label} ${t.cacheClearMsg}`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete, style: 'destructive',
          onPress: async () => {
            setClearing(id);
            await CacheManager.clearCategory(id);
            await refresh();
            setClearing(null);
          } },
      ],
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      t.cacheClearAllTitle,
      t.cacheClearAllMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.deleteAll, style: 'destructive',
          onPress: async () => {
            setClearing('all');
            await CacheManager.clearAll();
            await refresh();
            setClearing(null);
          } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color={'#F0F0F5'} />
        </Pressable>
        <Text style={styles.headerTitle}>{t.cacheTitle}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color="#D4A853" style={{ marginTop: 40 }} />
        ) : summary ? (
          <>
            {/* 총 크기 */}
            <View style={styles.totalCard}>
              <HardDrive size={22} color="#D4A853" />
              <Text style={styles.totalValue}>{formatBytes(summary.totalBytes)}</Text>
              <Text style={styles.totalLabel}>{t.totalCache}</Text>
            </View>

            {/* 카테고리별 */}
            {summary.categories.map(cat => (
              <View key={cat.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <CatIcon id={cat.id} />
                  <View>
                    <Text style={styles.rowLabel}>
                      {t[`cache_${cat.id}`]}
                    </Text>
                    <Text style={styles.rowSize}>{formatBytes(cat.sizeBytes)}</Text>
                  </View>
                </View>
                <Pressable
                  style={[styles.clearBtn, cat.sizeBytes === 0 && styles.clearBtnDisabled]}
                  onPress={() => handleClear(cat.id, cat.label)}
                  disabled={cat.sizeBytes === 0 || clearing !== null}
                >
                  {clearing === cat.id ? (
                    <ActivityIndicator color="#D4A853" size="small" />
                  ) : (
                    <Text style={[styles.clearBtnText, cat.sizeBytes === 0 && { opacity: 0.3 }]}>
                      {t.delete}
                    </Text>
                  )}
                </Pressable>
              </View>
            ))}

            {/* 전체 삭제 */}
            <Pressable
              style={[styles.clearAllBtn, summary.totalBytes === 0 && styles.clearBtnDisabled]}
              onPress={handleClearAll}
              disabled={summary.totalBytes === 0 || clearing !== null}
            >
              {clearing === 'all' ? (
                <ActivityIndicator color="#050507" />
              ) : (
                <Text style={styles.clearAllText}>
                   {t.clearAllCache}
                </Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050507' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: '#1a1a1e' },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#E8E6E3', fontFamily: Typography.fontFamily.bold },
  scroll: { padding: 16, paddingBottom: 40 },
  totalCard: {
    alignItems: 'center', paddingVertical: 24, marginBottom: 16,
    backgroundColor: '#0d0d10', borderRadius: 16,
    borderWidth: 0.5, borderColor: '#D4A85330' },
  totalIcon: { fontSize: 36, marginBottom: 4 },
  totalValue: { fontSize: 32, fontWeight: '800', color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  totalLabel: { fontSize: 13, color: '#888', marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0d0d10', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 0.5, borderColor: '#1a1a1e' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#E8E6E3' },
  rowSize: { fontSize: 12, color: '#888', marginTop: 2 },
  clearBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: '#D4A85350' },
  clearBtnDisabled: { opacity: 0.3 },
  clearBtnText: { fontSize: 13, color: '#D4A853', fontWeight: '600' },
  clearAllBtn: {
    marginTop: 10, paddingVertical: 16, borderRadius: 14,
    backgroundColor: '#D4A853', alignItems: 'center' },
  clearAllText: { fontSize: 15, fontWeight: '700', color: '#050507' } });
