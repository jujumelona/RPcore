
/* eslint-disable @typescript-eslint/no-unused-vars */

// src/screens/BackupRestoreScreen.tsx
// ═══════════════════════════════════════════════════════════════════
//  Tachiyomi 백업/복원 화면
//  — RPcore 디자인 시스템 (#050507 다크, #D4A853 골드)
// ═══════════════════════════════════════════════════════════════════

import { Typography } from '../constants/tokens';
import React, { useState, useCallback } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { createBackup,
  restoreBackup,
  saveBackupToFile,
  loadBackupFromFile,
  type BackupSection } from '../utils/BackupRestore';
import { useTranslation } from '../hooks/useTranslation';
import { ArrowLeft, Settings, TrendingUp, Shield, Bell, FileEdit, Upload, Download as DownloadIcon } from 'lucide-react-native';

// ── Section Config ────────────────────────────────────────────────

interface SectionItem {
  key: BackupSection;
  icon: string;
  label: string;
  labelEn: string;
}

const SECTIONS: SectionItem[] = [
  { key: 'settings',           icon: 'settings', label: '설정',          labelEn: 'Settings' },
  { key: 'readingStats',       icon: 'trending-up', label: '리딩 통계',     labelEn: 'Reading Stats' },
  { key: 'contentFilterRules', icon: 'shield', label: '콘텐츠 필터',   labelEn: 'Content Filters' },
  { key: 'notificationPrefs',  icon: 'bell', label: '알림 설정',     labelEn: 'Notification Prefs' },
  { key: 'drafts',             icon: 'file-edit', label: '드래프트',       labelEn: 'Drafts' },
];

const SectionIcon = ({ name }: { name: string }) => {
  const props = { size: 18, color: '#D4A853', style: { width: 28 } };
  switch (name) {
    case 'settings':      return <Settings {...props} />;
    case 'trending-up':   return <TrendingUp {...props} />;
    case 'shield':        return <Shield {...props} />;
    case 'bell':          return <Bell {...props} />;
    case 'file-edit':     return <FileEdit {...props} />;
    default:              return null;
  }
};

// ── Component ─────────────────────────────────────────────────────

export default function BackupRestoreScreen() {
  const nav = useNavigation();
  const t = useTranslation() as Record<string, string>;
  const [selected, setSelected] = useState<Record<BackupSection, boolean>>({
    settings: true,
    readingStats: true,
    bookmarks: true,
    readingProgress: true,
    contentFilterRules: true,
    notificationPrefs: true,
    drafts: true });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleBack = useCallback(() => nav.goBack(), [nav]);

  const toggleSection = (key: BackupSection) => {
    setSelected(s => ({ ...s, [key]: !s[key] }));
  };

  const selectedSections = Object.entries(selected)
    .filter(([_k, v]) => v)
    .map(([k]) => k as BackupSection);
  const unknownError = t.unknownError ?? '';

  // ── 백업 (내보내기) ───────────────────────────────────────────

  const handleBackup = useCallback(async () => {
    setLoading(true);
    setLastResult(null);
    try {
      const backup = await createBackup(selectedSections);
      const filepath = await saveBackupToFile(backup);
      if (filepath) {
        setLastResult(`✅ ${t.backupSuccess}\n📁 ${filepath}`);
      } else {
        setLastResult(`❌ ${t.backupFailed}`);
      }
    } catch (err: any) {
      setLastResult(`❌ ${err?.message ?? unknownError}`);
    } finally {
      setLoading(false);
    }
  }, [selectedSections, t, unknownError]);

  // ── 복원 (가져오기) ───────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    Alert.alert(
      t.restoreConfirmTitle,
      t.restoreConfirmMsg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.restoreBtn,
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setLastResult(null);
            try {
              // 파일 선택은 DocumentPicker 사용 (없으면 기본 경로)
              let filepath: string | null = null;
              try {
                const { default: DocumentPicker } = require('react-native-document-picker');
                const res = await DocumentPicker.pickSingle({ type: ['application/json'] });
                filepath = res.uri;
              } catch {
                setLastResult(`❌ ${t.noFileSelected}`);
                setLoading(false);
                return;
              }

              if (!filepath) {
                setLoading(false);
                return;
              }

              const backup = await loadBackupFromFile(filepath);
              if (!backup) {
                setLastResult(`❌ ${t.invalidBackup}`);
                setLoading(false);
                return;
              }

              const result = await restoreBackup(backup, selectedSections);
              setLastResult(
                `✅ ${t.restoreSuccess}\n` +
                `${result.restored.join(', ') || '-'}\n` +
                `${result.skipped.join(', ') || '-'}`,
              );
            } catch (err: any) {
              setLastResult(`❌ ${err?.message ?? unknownError}`);
            } finally {
              setLoading(false);
            }
          } },
      ],
    );
  }, [selectedSections, t, unknownError]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color={'#F0F0F5'} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t.backupRestoreTitle}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 섹션 선택 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t.selectSections}
          </Text>
          {SECTIONS.map(sec => (
            <View key={sec.key} style={styles.row}>
              <View style={styles.rowLeft}>
                <SectionIcon name={sec.icon} />
                <Text style={styles.rowLabel}>
                  {t[`backup_${sec.key}`]}
                </Text>
              </View>
              <Switch
                value={selected[sec.key]}
                onValueChange={() => toggleSection(sec.key)}
                trackColor={{ false: '#333', true: '#D4A853' }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        {/* 액션 버튼 */}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.btn, styles.btnBackup]}
            onPress={handleBackup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#050507" size="small" />
            ) : (
              <View style={styles.btnContent}>
                <Upload size={18} color="#050507" />
                <Text style={styles.btnBackupText}>
                  {t.backupBtn}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnRestore]}
            onPress={handleRestore}
            disabled={loading}
          >
            <View style={styles.btnContent}>
              <DownloadIcon size={18} color="#D4A853" />
              <Text style={styles.btnRestoreText}>
                {t.restoreBtn}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* 결과 */}
        {lastResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{lastResult}</Text>
          </View>
        )}

        {/* 안내 */}
        <Text style={styles.hint}>
          {t.backupHint}
        </Text>
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
  section: {
    backgroundColor: '#0d0d10', borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#1a1a1e' },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#D4A853',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1e' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#E8E6E3' },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  btn: { flex: 1, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnBackup: { backgroundColor: '#D4A853' },
  btnBackupText: { fontSize: 15, fontWeight: '700', color: '#050507' },
  btnRestore: { backgroundColor: '#0d0d10', borderWidth: 1, borderColor: '#D4A853' },
  btnRestoreText: { fontSize: 15, fontWeight: '700', color: '#D4A853' },
  resultBox: {
    backgroundColor: '#0d0d10', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#1a1a1e' },
  resultText: { fontSize: 13, color: '#E8E6E3', lineHeight: 20 },
  hint: { fontSize: 12, color: '#555', textAlign: 'center', lineHeight: 18 } });
