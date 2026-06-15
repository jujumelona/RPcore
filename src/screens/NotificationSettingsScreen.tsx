
// src/screens/NotificationSettingsScreen.tsx
// Notification settings screen.
// Keeps the existing RPcore dark, gold, and violet palette.
//
import { Typography } from '../constants/tokens';
import React, { useCallback, useMemo } from 'react';
import { View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useNotificationPrefs, type NotifCategory } from '../store/notificationPreferences';
import { useTranslation } from '../hooks/useTranslation';
import { Heart, MessageSquare, Bell, ArrowLeft, Moon, ArrowRight, UserPlus, Zap, Library } from 'lucide-react-native';

const NotifCatIcon = ({ name, size = 16, color = '#8B5CF6' }: { name: string; size?: number; color?: string }) => {
  const props = { size, color, style: { width: 24 } };
  switch (name) {
    case 'heart':          return <Heart {...props} fill={color} />;
    case 'message-square': return <MessageSquare {...props} />;
    case 'bell':           return <Bell {...props} />;
    case 'user-plus':      return <UserPlus {...props} />;
    case 'zap':            return <Zap {...props} />;
    case 'library':        return <Library {...props} />;
    default:               return null;
  }
};

// Category config.

interface CategoryInfo {
  key: NotifCategory;
  icon: string;
  label: string;
  labelEn: string;
}

const CATEGORIES: CategoryInfo[] = [
  { key: 'new_follower', icon: 'user-plus', label: '새 팔로워', labelEn: 'New follower' },
  { key: 'like', icon: 'heart', label: '좋아요', labelEn: 'Like' },
  { key: 'comment', icon: 'message-square', label: '댓글', labelEn: 'Comment' },
  { key: 'mention', icon: 'zap', label: '멘션', labelEn: 'Mention' },
  { key: 'story_update', icon: 'zap', label: '스토리 업데이트', labelEn: 'Story update' },
  { key: 'chapter_release', icon: 'library', label: '새 챕터', labelEn: 'New chapter' },
  { key: 'system', icon: 'bell', label: '시스템', labelEn: 'System' },
];

// Component.

export default function NotificationSettingsScreen() {
  const nav = useNavigation();
  const t = useTranslation();
  const {
    globalEnabled,
    categories,
    dnd,
    setGlobalEnabled,
    toggleCategory,
    setDND } = useNotificationPrefs();

  const handleBack = useCallback(() => nav.goBack(), [nav]);

  // Read the current device timezone directly so OS changes are reflected.
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch { return 'UTC'; }
  }, []);

  const getCatLabel = (cat: CategoryInfo) =>
    (t as Record<string, string>)[`notifCat_${cat.key}`] || cat.label;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <ArrowLeft size={22} color={'#E8E6E3'} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t.notifSettingsTitle}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Global notifications */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Bell size={18} color="#D4A853" />
              <Text style={styles.rowLabel}>
                {t.notifGlobal}
              </Text>
            </View>
            <Switch
              value={globalEnabled}
              onValueChange={setGlobalEnabled}
              trackColor={{ false: '#333', true: '#D4A853' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Categories */}
        <View style={[styles.section, !globalEnabled && styles.disabled]}>
          <Text style={styles.sectionTitle}>
            {t.notifCategories}
          </Text>
          {CATEGORIES.map(cat => (
            <View key={cat.key} style={styles.row}>
              <View style={styles.rowLeft}>
                <NotifCatIcon name={cat.icon} />
                <Text style={styles.rowLabel}>{getCatLabel(cat)}</Text>
              </View>
              <Switch
                value={categories[cat.key]}
                onValueChange={() => toggleCategory(cat.key)}
                disabled={!globalEnabled}
                trackColor={{ false: '#333', true: '#8B5CF6' }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        {/* DND */}
        <View style={[styles.section, !globalEnabled && styles.disabled]}>
          <Text style={styles.sectionTitle}>
            {(t as Record<string, string>).notifDND || '방해금지 모드'}
          </Text>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Moon size={18} color="#D4A853" />
              <Text style={styles.rowLabel}>
                {(t as Record<string, string>).notifDNDEnable || '방해금지'}
              </Text>
            </View>
            <Switch
              value={dnd.enabled}
              onValueChange={(v) => setDND({ enabled: v })}
              disabled={!globalEnabled}
              trackColor={{ false: '#333', true: '#D4A853' }}
              thumbColor="#fff"
            />
          </View>

          {dnd.enabled && (
            <View style={styles.dndTimeRow}>
              <View style={styles.dndTimeBlock}>
                <Text style={styles.dndLabel}>
                  {(t as Record<string, string>).notifDNDStart || '시작'}
                </Text>
                <Text style={styles.dndTime}>{dnd.startTime}</Text>
              </View>
              <ArrowRight size={16} color="#666" style={{ marginHorizontal: 12 }} />
              <View style={styles.dndTimeBlock}>
                <Text style={styles.dndLabel}>
                  {(t as Record<string, string>).notifDNDEnd || '종료'}
                </Text>
                <Text style={styles.dndTime}>{dnd.endTime}</Text>
              </View>
            </View>
          )}

          <Text style={styles.timezoneHint}>
            {(t as Record<string, string>).notifTimezone || '타임존'}: {timezone}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Styles.

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
    fontSize: 13, fontWeight: '600', color: '#D4A853', marginBottom: 14,
    textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1e' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#E8E6E3' },
  disabled: { opacity: 0.4 },
  dndTimeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16 },
  dndTimeBlock: { alignItems: 'center' },
  dndLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  dndTime: {
    fontSize: 24, fontWeight: '700', color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  timezoneHint: { fontSize: 11, color: '#555', textAlign: 'center', marginTop: 8 } });




