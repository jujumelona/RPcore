// src/screens/community/components/AuthorCard.tsx
// ✅ 팔로우 버튼 통합 — userProfileStore.toggleFollow + isFollowing 연결

import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { ChevronRight, UserCheck, UserPlus } from 'lucide-react-native';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { Space, Radius, Typography } from '../../../constants/tokens';
import { useUserProfileStore } from '../../../store/userProfileStore';
import { useShallow } from 'zustand/react/shallow';

interface AuthorCardProps {
  authorId:         string;
  authorName:       string;
  navigation:       import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
  authorLabel:      string;
  viewProfileLabel: string;
  /** 팔로우 버튼 표시 여부 (기본 true) */
  showFollowBtn?:   boolean;
}

export function AuthorCard({
  authorId,
  authorName,
  navigation,
  authorLabel,
  viewProfileLabel,
  showFollowBtn = true }: AuthorCardProps) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const { isFollowing, toggleFollow } = useUserProfileStore(
    useShallow(s => ({ isFollowing: s.isFollowing, toggleFollow: s.toggleFollow })),
  );

  const following = isFollowing(authorId);

  const handleFollowPress = useCallback(async () => {
    try {
      await toggleFollow(authorId);
    } catch {
      // 낙관적 업데이트로 이미 UI가 반영되어 있으므로 rollback은 store에서 처리
    }
  }, [authorId, toggleFollow]);

  const initial = (authorName ?? '?')[0]?.toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(260).springify().damping(22)}>
      <Animated.View style={style}>
        <View style={styles.authorCard}>
          {/* 프로필 → 작가 페이지 */}
          <PressableOpacity
            style={styles.authorLeft}
            onPressIn={() => {
              scale.value = withSpring(0.97, { stiffness: 260, damping: 20 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { stiffness: 260, damping: 20 });
            }}
            onPress={() => navigation.navigate('AuthorProfile', { authorId })}
            activeOpacity={1}
          >
            <View style={styles.authorAvatar}>
              <Text style={styles.authorInitial}>{initial}</Text>
            </View>

            <View style={styles.authorInfo}>
              <Text style={styles.authorLabel}>{authorLabel}</Text>
              <Text style={styles.authorName}>{authorName}</Text>
            </View>

            <View style={styles.authorChevronWrap}>
              <Text style={styles.authorProfileLink}>{viewProfileLabel}</Text>
              <ChevronRight size={14} color={'#D4A853'} />
            </View>
          </PressableOpacity>

          {/* 팔로우 버튼 */}
          {showFollowBtn && (
            <PressableOpacity
              style={[styles.followBtn, following && styles.followBtnActive]}
              onPress={handleFollowPress}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {following
                ? <UserCheck size={14} color={'#4ADE80'} />
                : <UserPlus  size={14} color={'#F0F0F5'} />}
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </PressableOpacity>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space['4'],
    backgroundColor: 'rgba(18,20,28,0.75)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Space['3'],
    gap: Space['3'] },
  authorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space['3'] },
  authorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(212,168,83,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: `${'#D4A853'}60` },
  authorInitial: { fontSize: 18, fontFamily: Typography.fontFamily.extrabold, color: '#D4A853' },
  authorInfo: { flex: 1, gap: 2 },
  authorLabel: {
    fontSize: 10,
    color: '#797990',
    fontFamily: Typography.fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8 },
  authorName: { fontSize: 15, color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  authorChevronWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  authorProfileLink: { fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.semibold },

  // 팔로우 버튼
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)' },
  followBtnActive: {
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74,222,128,0.10)' },
  followBtnText: {
    fontSize: 12,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.semibold },
  followBtnTextActive: {
    color: '#4ADE80' } });
