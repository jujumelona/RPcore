import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableOpacity } from '../components/PressableOpacity';
import { Typography, Radius } from '../constants/tokens';
import { appStorage } from '../utils/storage';
import { ONBOARDING_KEY } from './onboarding';
import { useAuthStore, CURRENT_CONSENT_VERSION, type AuthUser } from '../store/authStore';
import { ToastService } from '../components/Toast';
import { SERVER_BASE } from '../config/ApiConfig';
import { writeAuthStorage } from '../utils/authSecureStorage';

const AUTH_STORAGE_KEY = 'auth_user_v1';
const GOLD = '#D4A853';
const PURPLE = '#8B5CF6';
const PURPLE_L = '#A78BFA';

export function TestEntryScreen({ navigation }: { navigation?: any }) {
  const user = useAuthStore(s => s.user);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log('[TestEntry] Current user:', user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    } : 'No user');
  }, [user]);

  const handleEnter = async () => {
    console.log('[TestEntry] Starting auto login...');
    setIsLoading(true);
    
    try {
      // 하드코딩된 테스트 계정으로 자동 로그인
      const testEmail = 'bnm4564085@gmail.com';
      const testPassword = '@Juju456456';
      
      console.log('[TestEntry] Logging in with test account:', testEmail);
      
      // 서버에 로그인 요청 (구글 로그인 대신 직접 인증)
      const response = await fetch(`${SERVER_BASE}/login/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword })
      });
      
      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }
      
      const { token, user: serverUser } = await response.json();
      
      const user: AuthUser = {
        id: serverUser.id,
        email: testEmail,
        name: serverUser.nickname || 'Test User',
        photo: serverUser.avatarUrl || null,
        consentVersion: serverUser.consentVersion || CURRENT_CONSENT_VERSION,
        consentDate: serverUser.consentDate || new Date().toISOString(),
        jwtToken: token,
        token,
        refreshToken: serverUser.refreshToken,
        role: serverUser.role || 'admin'
      };
      
      // authStore에 저장
      await writeAuthStorage(AUTH_STORAGE_KEY, JSON.stringify(user));
      useAuthStore.setState({ user, isLoading: false });
      
      console.log('[TestEntry] Login success:', { id: user.id, email: user.email, role: user.role });
      
      appStorage.set(ONBOARDING_KEY, '1');
      navigation?.reset?.({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      console.error('[TestEntry] Login error:', error);
      ToastService.error('자동 로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={s.root}>
      {/* 배경 글로우 - 골드 + 퍼플 */}
      <View style={s.glowGold} />
      <View style={s.glowPurple} />
      <View style={s.glowGold2} />
      
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={s.container}>
          {/* 브랜드 로고 */}
          <View style={s.logoPill}>
            <Text style={s.logoText}>RP</Text>
            <View style={s.logoLine} />
            <Text style={[s.logoText, { color: GOLD }]}>core</Text>
          </View>

          <Text style={s.title}>Test Entry</Text>
          <Text style={s.desc}>
            QA 빌드용 임시 화면입니다.{'\n'}
            온보딩을 건너뛰고 바로 앱에 진입합니다.
          </Text>

          {user && (
            <View style={s.userInfo}>
              <Text style={s.userInfoLabel}>현재 로그인:</Text>
              <Text style={s.userInfoText}>{user.email}</Text>
              <Text style={s.userInfoText}>Role: {user.role ?? 'user'}</Text>
            </View>
          )}

          {/* 골드-퍼플 그라데이션 버튼 */}
          <PressableOpacity 
            style={[s.button, isLoading && s.buttonDisabled]} 
            onPress={handleEnter}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[GOLD, '#E8B86D', PURPLE_L]}
              start={[0, 0]}
              end={[1, 0]}
              style={s.buttonGradient}
            >
              <Text style={s.buttonText}>{isLoading ? '로그인 중...' : '테스트 계정 로그인'}</Text>
            </LinearGradient>
          </PressableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050507',
  },
  glowGold: {
    position: 'absolute',
    top: -120,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(212,168,83,0.25)',
  },
  glowPurple: {
    position: 'absolute',
    top: -100,
    right: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(139,92,246,0.20)',
  },
  glowGold2: {
    position: 'absolute',
    bottom: -150,
    left: '50%',
    marginLeft: -175,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(212,168,83,0.15)',
  },
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 20,
  },
  logoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(212,168,83,0.6)',
    backgroundColor: 'rgba(212,168,83,0.08)',
    elevation: 6,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#F0E8D0',
    letterSpacing: 1.2,
  },
  logoLine: {
    width: 1.5,
    height: 14,
    backgroundColor: 'rgba(212,168,83,0.5)',
    marginHorizontal: 3,
  },
  title: {
    fontSize: 28,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -0.5,
  },
  desc: {
    fontSize: 14,
    lineHeight: 22,
    color: '#9A9AAF',
    textAlign: 'center',
    fontFamily: Typography.fontFamily.regular,
    maxWidth: 320,
  },
  button: {
    marginTop: 12,
    minWidth: 200,
    borderRadius: Radius.md,
    overflow: 'hidden',
    elevation: 8,
  },
  buttonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Typography.fontFamily.extrabold,
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  userInfo: {
    backgroundColor: '#0C0C14',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1A1A24',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
    alignSelf: 'stretch',
    marginHorizontal: 28,
  },
  userInfoLabel: {
    fontSize: 11,
    color: '#797990',
    fontFamily: Typography.fontFamily.medium,
  },
  userInfoText: {
    fontSize: 13,
    color: '#C8C8D4',
    fontFamily: Typography.fontFamily.regular,
  },
});
