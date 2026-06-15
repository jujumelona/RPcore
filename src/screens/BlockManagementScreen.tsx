/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/BlockManagementScreen.tsx
// ──────────────────────────────────────────────────────────────────────────────
// 차단 관리 화면
//  탭 1: 차단한 스토리  — X 버튼으로 해제
//  탭 2: 차단한 작가    — X 버튼으로 해제
//  탭 3: 차단한 해시태그 — # 태그 입력 추가 + X 해제
//
// ✅ [FIX] BlockItem / EmptyState icon prop: string -> React.ComponentType 수정
// ✅ 차단 해제 로직 실제 store 연동
// ✅ 해시태그 엔터/버튼 추가, 중복 방지
// ✅ 3곳에서 진입 가능: MyPage / StoryDetail / AuthorProfile
// ──────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar,
  TextInput, Dimensions, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserProfileStore } from '../store/userProfileStore';
import { ToastService } from '../components/Toast';
import { Radius, Typography } from '../constants/tokens';
import { PressableOpacity } from '../components/PressableOpacity';
import { BookOpen, User, Tag, X, ChevronLeft,
  type LucideIcon } from 'lucide-react-native';
import { useLanguageStore } from '../store/languageStore';
import type { ScreenProps } from '../types/navigation';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

type TabType = 'story' | 'author' | 'hashtag';

const SCREEN_W = (Dimensions.get('window') ?? { width: 375, height: 812 }).width;
const DEFAULT_BLOCK_TAB: TabType = 'story';


export function BlockManagementScreen({ navigation, route }: ScreenProps<'BlockManagement'>) {
  const t = useLanguageStore(s => s.t);
  const profile        = useUserProfileStore(s => s.profile);
  const unblockStory   = useUserProfileStore(s => s.unblockStory);
  const unblockAuthor  = useUserProfileStore(s => s.unblockAuthor);
  const unblockHashtag = useUserProfileStore(s => s.unblockHashtag);
  const blockHashtag   = useUserProfileStore(s => s.blockHashtag);
  const tabs = useMemo<Array<{ key: TabType; label: string; Icon: LucideIcon }>>(() => ([
    { key: 'story', label: t?.blockedStories ?? '', Icon: BookOpen },
    { key: 'author', label: t?.blockedAuthors ?? '', Icon: User },
    { key: 'hashtag', label: t?.blockedTags ?? '', Icon: Tag },
  ]), [t]);

  const tabWidth = SCREEN_W / Math.max(tabs.length, 1);
  const initialTab: TabType = route?.params?.tab ?? DEFAULT_BLOCK_TAB;
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [tagInput, setTagInput]   = useState('');
  const inputRef = useRef<TextInput>(null);

  const indicatorX = useSharedValue(tabs.findIndex(tab => tab.key === initialTab) * tabWidth);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }] }));

  const switchTab = useCallback((tab: TabType) => {
    const idx = tabs.findIndex(tabItem => tabItem.key === tab);
    setActiveTab(tab);
    indicatorX.value = withSpring(idx * tabWidth, { damping: 12, stiffness: 80 });
  }, [indicatorX, tabs, tabWidth]);

  // ── 해시태그 추가 ──────────────────────────────────────────────
  const handleAddHashtag = async () => {
    const raw = tagInput.trim().replace(/^#+/, '');
    if (!raw) return;
    if ((profile.blockedHashtags ?? []).includes(raw)) {
      setTagInput('');
      return;
    }
    await blockHashtag(raw);
    setTagInput('');
    ToastService.success(t?.blockConfirmed ?? '');
  };

  // ── 차단 해제 ──────────────────────────────────────────────────
  const handleUnblockStory = async (id: string) => {
    await unblockStory(id);
    ToastService.info(t?.unblockStoryToast ?? '');
  };

  const handleUnblockAuthor = async (id: string) => {
    await unblockAuthor(id);
    ToastService.info(t?.unblockAuthorToast ?? '');
  };

  const handleUnblockHashtag = async (tag: string) => {
    await unblockHashtag(tag);
  };

  const countFor = (tab: TabType) => {
    if (tab === 'story')   return (profile.blockedStoryIds  ?? []).length;
    if (tab === 'author')  return (profile.blockedAuthorIds ?? []).length;
    return (profile.blockedHashtags ?? []).length;
  };

  return (
    <View style={s.backdropRoot}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} translucent={false} />

      <SafeAreaView style={styles._flex}>

        {/* 헤더 */}
        <View style={s.header}>
          <PressableOpacity
            style={s.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronLeft size={22} color={'#C8C8D4'} />
          </PressableOpacity>
          <Text style={s.headerTitle}>{t?.blockManagement ?? ''}</Text>
          <View style={s.backBtn} />
        </View>

        {/* 안내 배너 */}
        <View style={s.infoBanner}>
          <Text style={s.infoText}>
            {t?.filterDesc ?? ''}
          </Text>
        </View>

        {/* 탭 바 */}
        <View style={s.tabBar}>
          {tabs.map(({ key, label, Icon }) => {
            const isActive = activeTab === key;
            const cnt = countFor(key);
            return (
              <PressableOpacity
                key={key}
                style={s.tabItem}
                onPress={() => switchTab(key)}
                activeOpacity={0.7}
              >
                <Icon size={16} color={isActive ? '#D4A853' : '#797990'} style={styles._marginBottom} />
                <Text style={[s.tabLabel, isActive && s.tabLabelActive]}>{label}</Text>
                {cnt > 0 && (
                  <View style={[s.tabBadge, isActive && s.tabBadgeActive]}>
                    <Text style={[s.tabBadgeText, isActive && s.tabBadgeTextActive]}>{cnt}</Text>
                  </View>
                )}
              </PressableOpacity>
            );
          })}
          <Animated.View style={[s.tabIndicator, { width: tabWidth }, indicatorStyle]} />
        </View>

        {/* 콘텐츠 */}
        <View style={styles._flex1}>

          {/* ── 차단한 스토리 ── */}
          {activeTab === 'story' && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
              {(profile.blockedStoryIds ?? []).length === 0 ? (
                <EmptyState Icon={BookOpen} message={t?.noBlockedStories ?? ''} />
              ) : (
                (profile.blockedStoryIds ?? []).map((id: string) => (
                  <Animated.View key={id} entering={FadeInDown.duration(200)}>
                    <BlockItem
                      Icon={BookOpen}
                      label={id}
                      subLabel={t?.story ?? ''}
                      onUnblock={() => handleUnblockStory(id)}
                    />
                  </Animated.View>
                ))
              )}
              <View style={styles._height} />
            </ScrollView>
          )}

          {/* ── 차단한 작가 ── */}
          {activeTab === 'author' && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
              {(profile.blockedAuthorIds ?? []).length === 0 ? (
                <EmptyState Icon={User} message={t?.noBlockedAuthors ?? ''} />
              ) : (
                (profile.blockedAuthorIds ?? []).map((id: string) => (
                  <Animated.View key={id} entering={FadeInDown.duration(200)}>
                    <BlockItem
                      Icon={User}
                      label={id}
                      subLabel={t?.authorLabel ?? ''}
                      onUnblock={() => handleUnblockAuthor(id)}
                    />
                  </Animated.View>
                ))
              )}
              <View style={styles._height} />
            </ScrollView>
          )}

          {/* ── 차단한 해시태그 ── */}
          {activeTab === 'hashtag' && (
            <KeyboardAvoidingView behavior={'height'} style={styles._flex1}>
              {/* 태그 입력 */}
              <View style={s.tagInputWrap}>
                <View style={s.tagInputRow}>
                  <Text style={s.hashPrefix}>#</Text>
                  <TextInput
                    ref={inputRef}
                    style={s.tagInput}
                    value={tagInput}
                    onChangeText={setTagInput}
                    placeholder={t?.tagInputPlaceholder ?? ''}
                    placeholderTextColor={'#797990'}
                    returnKeyType="done"
                    onSubmitEditing={handleAddHashtag}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <PressableOpacity
                    style={[s.tagAddBtn, !tagInput.trim() && s.tagAddBtnDisabled]}
                    onPress={handleAddHashtag}
                    disabled={!tagInput.trim()}
                  >
                    <Text style={[s.tagAddText, !tagInput.trim() && s.tagAddTextDisabled]}>{t?.add ?? ''}</Text>
                  </PressableOpacity>
                </View>
                <Text style={s.tagHint}>{t?.blockedTagHint ?? ''}</Text>
              </View>

              {/* 태그 목록 */}
              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.tagListContent}
                showsVerticalScrollIndicator={false}
              >
                {(profile.blockedHashtags ?? []).length === 0 ? (
                  <EmptyState Icon={Tag} message={t?.noBlockedHashtags ?? ''} />
                ) : (
                  <View style={s.tagChipWrap}>
                    {(profile.blockedHashtags ?? []).map((tag: string) => (
                      <HashtagChip key={tag} tag={tag} onRemove={() => handleUnblockHashtag(tag)} />
                    ))}
                  </View>
                )}
                <View style={styles._height} />
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────────

function BlockItem({
  Icon, label, subLabel, onUnblock, unblockLabel }: {
  Icon: LucideIcon;
  label: string;
  subLabel: string;
  onUnblock: () => void;
  unblockLabel?: string;
}) {
  return (
    <View style={item.wrap}>
      <View style={item.iconWrap}>
        <Icon size={18} color={'#797990'} />
      </View>
      <View style={styles._flex1}>
        <Text style={item.label} numberOfLines={1}>{label}</Text>
        <Text style={item.sub}>{subLabel}</Text>
      </View>
      <PressableOpacity
        style={item.unblockBtn}
        onPress={onUnblock}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={14} color={'#8A8A9E'} />
        {unblockLabel ? <Text style={item.unblockText}>{unblockLabel}</Text> : null}
      </PressableOpacity>
    </View>
  );
}

function HashtagChip({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  return (
    <View style={chip.wrap}>
      <Text style={chip.label}>#{tag}</Text>
      <PressableOpacity
        style={chip.xBtn}
        onPress={onRemove}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <X size={13} color={'#8A8A9E'} />
      </PressableOpacity>
    </View>
  );
}

function EmptyState({ Icon, message }: { Icon: LucideIcon; message: string }) {
  return (
    <View style={empty.wrap}>
      <View style={empty.iconWrap}>
        <Icon size={32} color={'#797990'} />
      </View>
      <Text style={empty.text}>{message}</Text>
    </View>
  );
}

// ── 스타일 ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdropRoot: { flex: 1, backgroundColor: '#050507' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  backBtn:     { width: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', flex: 1, textAlign: 'center' },

  infoBanner: {
    backgroundColor: '#0C0C14', borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24', paddingHorizontal: 16, paddingVertical: 10 },
  infoText: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.regular, lineHeight: 17 },

  tabBar: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24', position: 'relative', backgroundColor: '#08080C' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4, minHeight: 54 },
  tabLabel:       { fontSize: 11, color: '#797990', textAlign: 'center', fontFamily: Typography.fontFamily.medium, letterSpacing: 0.2 },
  tabLabelActive: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tabBadge:       { position: 'absolute', top: 8, right: '20%', backgroundColor: '#181820', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeActive: { backgroundColor: 'rgba(212,168,83,0.14)' },
  tabBadgeText:       { fontSize: 9, color: '#797990', fontFamily: Typography.fontFamily.bold },
  tabBadgeTextActive: { color: '#D4A853' },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, backgroundColor: '#D4A853', borderRadius: 1 },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  tagInputWrap: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  tagInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#1A1A24',
    paddingHorizontal: 14, paddingVertical: 4 },
  hashPrefix:  { fontSize: 16, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tagInput:    { flex: 1, fontSize: 15, color: '#F0F0F5', paddingVertical: 10, fontFamily: Typography.fontFamily.regular },
  tagAddBtn:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(212,168,83,0.14)', borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)' },
  tagAddBtnDisabled: { backgroundColor: 'rgba(18,20,28,0.75)', borderColor: 'rgba(255,255,255,0.08)' },
  tagAddText:        { fontSize: 13, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  tagAddTextDisabled:{ color: '#797990' },
  tagHint:     { fontSize: 11, color: '#797990', marginTop: 8, lineHeight: 16, paddingHorizontal: 2 },
  tagListContent: { paddingHorizontal: 16, paddingTop: 16 },
  tagChipWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });

const item = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  iconWrap:   { width: 38, height: 38, borderRadius: 10, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24', alignItems: 'center', justifyContent: 'center' },
  label:      { fontSize: 14, color: '#C8C8D4', fontFamily: Typography.fontFamily.regular },
  sub:        { fontSize: 11, color: '#757585', fontFamily: Typography.fontFamily.regular, marginTop: 2 },
  unblockBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24' },
  unblockText:{ fontSize: 11, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium } });

const chip = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24' },
  label: { fontSize: 13, color: '#C8C8D4', fontFamily: Typography.fontFamily.medium },
  xBtn:  { width: 18, height: 18, borderRadius: 9, backgroundColor: '#181820', alignItems: 'center', justifyContent: 'center' } });

const empty = StyleSheet.create({
  wrap:    { alignItems: 'center', paddingTop: 80, paddingBottom: 40, gap: 12 },
  iconWrap:{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24', alignItems: 'center', justifyContent: 'center' },
  text:    { fontSize: 14, color: '#797990', textAlign: 'center' } });

const styles = StyleSheet.create({
  _flex: {
    flex: 1,
    backgroundColor: 'transparent' },
  _marginBottom: {
    marginBottom: 3 },
  _flex1: {
    flex: 1 },
  _height: {
    height: 40 } });
