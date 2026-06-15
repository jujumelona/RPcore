import { Typography } from '../constants/tokens';
import { useShallow } from 'zustand/react/shallow';
// src/screens/MyPageScreen.tsx — v9 PREMIUM
import { triggerHaptic } from '../utils/haptics';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, TextInput, Image, Keyboard, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Globe, Bell, ChevronRight, LogOut,
  MessageSquare, BookOpen, Camera, Cpu,
  Shield, Settings, UserX, FileText, Lock, Pencil } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ToastService } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { ModelSelector } from '../ui/ModelSelector';
import { KeyboardAwareWrapper } from '../components/KeyboardAwareWrapper';
import { useModelStore } from '../store/modelStore';
import { useUserProfileStore } from '../store/userProfileStore';
import { appStorage } from '../utils/storage';
import { MODEL_SWITCH_LOCK_ERROR, MODEL_INSUFFICIENT_RAM_ERROR } from '../utils/modelUtils';
import { useLanguageStore } from '../store/languageStore';
import { getScreenTranslations } from '../i18n/SCREENS-TRANSLATION';
import { useAuthStore, authedFetch } from '../store/authStore';
import { SERVER_BASE } from '../config/ApiConfig';
import { useSettingsStore } from '../store/settingsStore';
import { isAdmin as hasAdminRole } from '../core/user';
import RNFS from '../utils/fileSystemCompat';
import { launchImageLibrary as _launchImageLibrary } from 'react-native-image-picker';
const launchImageLibrary = _launchImageLibrary;

type Nav = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;

// 숨겨진 어드민 진입 — 5번 탭
function AdminSecretAccess({ navigation }: { navigation: Nav }) {
  const [tapCount, setTapCount] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, []);
  const handleTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (next >= 5) {
      setTapCount(0);
      navigation.navigate('AdminPanel');
    } else {
      timerRef.current = setTimeout(() => setTapCount(0), 2000);
    }
  };
  return (
    <TouchableOpacity onPress={handleTap} activeOpacity={1} style={ric.secretBtn}>
      <Text style={ric.secretTxt}>{tapCount > 0 ? `···${tapCount}/5` : ' '}</Text>
    </TouchableOpacity>
  );
}

// 설정 행 컴포넌트
function RowItem({
  icon, label, sublabel, onPress, rightEl, labelStyle, destructive }: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  rightEl?: React.ReactNode;
  labelStyle?: object;
  destructive?: boolean;
}) {
  const inner = (
    <View style={st.row}>
      <View style={st.rowLeft}>
        <View style={[st.iconBox, destructive && st.iconBoxDestructive]}>{icon}</View>
        <View>
          <Text style={[st.rowLabel, destructive && st.rowLabelDestructive, labelStyle]}>{label}</Text>
          {!!sublabel && <Text style={st.rowSublabel}>{sublabel}</Text>}
        </View>
      </View>
      {rightEl !== undefined ? rightEl : (
        onPress ? <ChevronRight size={15} color={'#2E2E44'} strokeWidth={2} /> : null
      )}
    </View>
  );
  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.65}>
      {inner}
    </TouchableOpacity>
  );
}

export function MyPageScreen({ navigation }: { navigation: Nav }) {
  const { t, appLanguage } = useLanguageStore(useShallow(s => ({ t: s.t, appLanguage: s.appLanguage })));
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const { signOut, deleteAccount, user } = useAuthStore();
  const isAdmin = hasAdminRole(user);
  const scrollRef = useRef<ScrollView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const nameFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { profile: storeProfile, setProfile: setGlobalProfile } = useUserProfileStore();
  const [profile, setProfile] = useState(storeProfile);
  const [editingName, setEditingName] = useState(false);
  const [nameTemp, setNameTemp] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const {
    activeModelId, downloadedModels, switchModel,
    isSwitching: switching, refresh: refreshModels
  } = useModelStore();
  const activeModel = React.useMemo(
    () => downloadedModels.find(m => m.id === activeModelId),
    [activeModelId, downloadedModels],
  );
  const switchableModels = React.useMemo(
    () => downloadedModels.filter(m => m.id !== activeModelId),
    [activeModelId, downloadedModels],
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showModelManager, setShowModelManager] = useState(false);
  const [showModelManagerContent, setShowModelManagerContent] = useState(false);
  const hapticEnabled = useSettingsStore(s => s.hapticEnabled);
  const setHapticEnabled = useSettingsStore(s => s.setHapticEnabled);

  const saveProfile = async (updated: typeof storeProfile) => {
    setProfile(updated);
    // [BUG FIX] AsyncStorage → appStorage(MMKV) — userProfileStore도 MMKV로 읽으므로 같은 스토리지 사용
    appStorage.set('user_profile', JSON.stringify(updated));
    setGlobalProfile(updated);
  };

  useEffect(() => { 
    // [BUG FIX] 로컬 파일 URI를 막 설정했을 때 서버 URL로 덮어쓰여 깜빡이는 현상 방지
    if (profile.avatarUri?.startsWith('file://') && storeProfile.avatarUri?.startsWith('http')) {
      return;
    }
    setProfile(storeProfile); 
  }, [storeProfile, profile.avatarUri]);

  useEffect(() => {
    return () => {
      if (nameFocusTimerRef.current !== null) {
        clearTimeout(nameFocusTimerRef.current);
        nameFocusTimerRef.current = null;
      }
      if (scrollTopTimerRef.current !== null) {
        clearTimeout(scrollTopTimerRef.current);
        scrollTopTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showModelManager) {
      setShowModelManagerContent(false);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        setShowModelManagerContent(true);
      }
    });

    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [showModelManager]);

  const [signOutModal, setSignOutModal] = useState(false);
  const [deleteAccModal, setDeleteAccModal] = useState(false);
  const contactEmail = 'fdje0303@gmail.com';

  const handleSignOut = () => { triggerHaptic('medium'); setSignOutModal(true); };
  const handleDeleteAccount = () => { triggerHaptic('medium'); setDeleteAccModal(true); };

  const doSignOut = async () => { setSignOutModal(false); await signOut(); };
  const doDeleteAccount = async () => {
    setDeleteAccModal(false);
    const result = await deleteAccount();
    if (!result.success) ToastService.error(result.error ?? t.errorOccurred);
  };

  const handleAvatarPress = () => {
    if (!launchImageLibrary) return;
    launchImageLibrary(
      { mediaType: 'photo', includeBase64: false, quality: 0.8, selectionLimit: 1 },
      async (res: any) => {
        if (res.didCancel || res.errorCode) return;
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        let persistentUri = uri;
        try {
          const ext = uri.includes('.png') ? 'png' : 'jpg';
          const destPath = `${RNFS.DocumentDirectoryPath}/avatar_${Date.now()}.${ext}`;
          if (profile.avatarUri?.startsWith('file://')) {
            const oldPath = profile.avatarUri.replace('file://', '');
            RNFS.exists(oldPath).then((exists: boolean) => {
              if (exists) RNFS.unlink(oldPath).catch(() => {});
            });
          }
          const sourcePath = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
          await RNFS.copyFile(sourcePath, destPath);
          persistentUri = `file://${destPath}`;
        } catch {}
        saveProfile({ ...profile, avatarUri: persistentUri });
        // [BUG FIX #32] 서버에 아바타 업로드 — 로컬만 저장하면 다기기/재로그인 시 유실
        // 서버 업로드는 fire-and-forget (실패해도 로컬 UX에 영향 없음)
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: persistentUri,
            type: persistentUri.endsWith('.png') ? 'image/png' : 'image/jpeg',
            name: 'avatar' } as any);
          authedFetch(`${SERVER_BASE}/user/avatar`, {
            method: 'POST',
            body: formData }).then(async (response) => {
            if (response.ok) {
              const data = await response.json().catch(() => ({}));
              if (data.avatarUrl) {
                // [BUG FIX] 로컬 URI가 이미 존재하면 서버 URL로 당장 교체하지 않음 (플리커 방지)
                // 서버에는 성공적으로 올라갔으므로, 다음 앱 실행 시에는 서버 URL이 반영됨.
                // 다만 MMKV에는 최신 서버 URL을 저장해두어 동기화 유지
                const { useUserProfileStore: _ups } = await import('../store/userProfileStore');
                const latestProfile = _ups.getState().profile;
                
                // 전역 스토어와 스토리지에는 서버 URL 저장 (영속성)
                appStorage.set('user_profile', JSON.stringify({ ...latestProfile, avatarUri: data.avatarUrl }));
                setGlobalProfile({ ...latestProfile, avatarUri: data.avatarUrl });
                
                // [CRITICAL] 로컬 state 'profile'은 persistentUri를 유지하여 플리커 방지
                // storeProfile이 백그라운드에서 바뀌어도 useEffect([storeProfile])가 state를 persistentUri -> data.avatarUrl로
                // 덮어씌움으로써 발생하던 '깜빡임' 현상을 막기 위해 handleAvatarPress 내부에서 락을 걸거나,
                // storeProfile이 바뀔 때 file:// 로 시작하는 로컬 URI가 이미 있으면 덮어쓰지 않게 수정.
                
                const cur = useAuthStore.getState().user;
                if (cur) useAuthStore.setState({ user: { ...cur, photo: data.avatarUrl } });
              }
            }
          }).catch(() => {});
        } catch {}
      }
    );
  };

  const startEditName = () => {
    setNameTemp(profile.name);
    setEditingName(true);
    if (nameFocusTimerRef.current !== null) {
      clearTimeout(nameFocusTimerRef.current);
    }
    nameFocusTimerRef.current = setTimeout(() => {
      nameFocusTimerRef.current = null;
      nameInputRef.current?.focus();
    }, 80);
  };
  const confirmEditName = async () => {
    if (isUpdatingName) return;
    const trimmed = nameTemp.trim();
    if (!trimmed) { ToastService.error(t?.enterName); return; }
    setIsUpdatingName(true);
    try {
      const res = await authedFetch(`${SERVER_BASE}/user/profile`, {
        method: 'PUT',
        body: JSON.stringify({ nickname: trimmed }) });
      // [BUG FIX] res.json()을 한 번만 호출 — ok/error 양쪽에서 각각 호출하면
      // 첫 호출이 body stream을 소비해 두 번째 호출에서 빈 객체 반환
      const resBody = await res.json().catch(() => ({})) as { error?: string; token?: string };
      if (!res.ok) {
        ToastService.error(resBody.error ?? t.errorOccurred);
        return;
      }
      // [BUG FIX] saveProfile을 try 블록 안으로 이동 — 네트워크 에러 시 로컬 저장 방지
      // 기존: try/catch 바깥에 있어 서버 저장 실패(catch)에도 로컬에 이름이 저장됨
      // 수정: 서버 성공 응답 확인 후에만 로컬 프로필 저장
      try {
        // resBody는 위에서 이미 파싱됨
        if (resBody.token) {
          const cur = useAuthStore.getState().user;
          if (cur) {
            const { writeAuthStorage } = await import('../utils/authSecureStorage');
            const updated = { ...cur, name: trimmed, jwtToken: resBody.token };
            useAuthStore.setState({ user: updated });
            await writeAuthStorage('auth_user_v1', JSON.stringify(updated));
          }
        }
      } catch {}
      await saveProfile({ ...profile, name: trimmed, handle: `@${trimmed.toLowerCase().replace(/\s+/g, '_')}` });
      // [BUG FIX #31] authStore.user.name 필드도 동기화 (nickname 변경 시 일관성 유지)
      try {
        const authUser = useAuthStore.getState().user;
        if (authUser) {
          useAuthStore.setState({ user: { ...authUser, name: trimmed } });
        }
      } catch {}
      setEditingName(false);
      Keyboard.dismiss();
      ToastService.success(t.nicknameChanged);
    } catch {
      ToastService.error(t.errorOccurred);
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleModelSwitch = async (modelId: string) => {
    if (switching || modelId === activeModelId) return;
    try {
      // [PERF] 마이페이지에서는 모델 ID만 변경하고 엔진 로딩은 실제 채팅 진입 시로 미룸 (Lazy Load)
      // 엔진 로딩 시 발생하는 대량의 RAM 점유 및 크래시 위험 방지.
      await switchModel(modelId, false);
      
      // [BUG FIX #5] 모델 전환 후 실제 활성화된 ID와 요청한 ID 비교
      const { activeModelId: actualId } = useModelStore.getState();
      if (actualId !== modelId) {
        // 하드웨어 제약 등으로 자동 폴백된 경우
        ToastService.warning(t.modelFallbackWarn);
      } else {
        ToastService.success(t.modelChanged);
      }
      if (scrollTopTimerRef.current !== null) {
        clearTimeout(scrollTopTimerRef.current);
      }
      scrollTopTimerRef.current = setTimeout(() => {
        scrollTopTimerRef.current = null;
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 150);
    } catch (e: unknown) {
      const code = (e as any)?.code;
      if (code === MODEL_SWITCH_LOCK_ERROR) {
        ToastService.warning(
          t.switchModelDuringChat
        );
      } else if (code === MODEL_INSUFFICIENT_RAM_ERROR) {
        // ← 이게 핵심: RAM 부족 시 명확한 안내
        ToastService.error(
          t.insufficientRamForModel
        );
      } else {
        ToastService.error(`${t.error}: ${((e as Error)?.message ?? t.retry)}`);
      }
    }
  };

  // 내 스토리 수 & 받은 좋아요 합계
  const [myStats, setMyStats] = React.useState({ storyCount: 0, totalLikes: 0 });
  React.useEffect(() => {
    let cancelled = false;
    let statsTimer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      statsTimer = setTimeout(() => {
        if (cancelled) return;
        try {
          const raw = appStorage.getString('@my_stories');
          const list = raw ? JSON.parse(raw) : [];
          const mergedStories = new Map<string, any>();

          appStorage.getAllKeys()
            .filter(key => key.startsWith('@story_draft_'))
            .forEach((key) => {
              try {
                const draftRaw = appStorage.getString(key);
                if (!draftRaw) return;
                const draft = JSON.parse(draftRaw);
                const storyId = String(draft.storyId ?? key.slice('@story_draft_'.length)).trim();
                if (!storyId) return;
                mergedStories.set(storyId, { id: storyId, status: 'draft', likeCount: 0 });
              } catch {}
            });

          if (Array.isArray(list)) {
            list.forEach((story: any) => {
              if (story?.id) {
                mergedStories.set(String(story.id), story);
              }
            });
          }

          const nextStories = [...mergedStories.values()];
          const approved = nextStories.filter((s: any) => s?.status === 'approved' || s?.status === 'published');
          const totalLikes = nextStories.reduce((acc: number, s: any) => acc + (Number(s?.likeCount) || 0), 0);
          if (!cancelled) {
            setMyStats({ storyCount: approved.length, totalLikes });
          }
        } catch {
          if (!cancelled) {
            setMyStats({ storyCount: 0, totalLikes: 0 });
          }
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      task.cancel?.();
      if (statsTimer !== null) {
        clearTimeout(statsTimer);
      }
    };
  }, []);

  return (
    <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
      <KeyboardAwareWrapper
        ref={scrollRef}
        style={st.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        extraBottomPadding={100}
      >
        {/* ─── 프로필 히어로 ─── */}
        <View style={st.heroSection}>
          <LinearGradient
            colors={['rgba(212,168,83,0.06)', 'rgba(167,139,250,0.04)', 'transparent']}
            start={[0, 0]} end={[1, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <TouchableOpacity
            style={st.avatarWrap}
            onPress={() => { triggerHaptic('light'); handleAvatarPress(); }}
            activeOpacity={0.85}
          >
            {profile.avatarUri
              ? <Image source={{ uri: profile.avatarUri }} style={st.avatarImg} />
              : (
                <View style={st.avatarFallback}>
                  <Text style={st.avatarInitial}>{profile.name.charAt(0).toUpperCase()}</Text>
                </View>
              )
            }
            <View style={st.avatarBadge}>
              <Camera size={11} color="#050507" strokeWidth={2.5} />
            </View>
          </TouchableOpacity>

          {editingName ? (
            <View style={st.nameEditRow}>
              <TextInput
                ref={nameInputRef}
                style={st.nameInput}
                value={nameTemp}
                onChangeText={setNameTemp}
                onSubmitEditing={confirmEditName}
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={20}
                returnKeyType="done"
                selectionColor="#D4A853"
              />
                <TouchableOpacity onPress={confirmEditName} style={st.confirmBtn} disabled={isUpdatingName}>
                  <Text style={st.confirmBtnTxt}>{isUpdatingName ? '...' : t.confirm}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => !isUpdatingName && setEditingName(false)} style={st.cancelNameBtn} disabled={isUpdatingName}>
                  <Text style={st.cancelNameTxt}>{t.cancel}</Text>
                </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.nameRow} onPress={startEditName} activeOpacity={0.7}>
              <Text style={st.userName}>{profile.name}</Text>
              <View style={st.editBadge}>
                <Pencil size={10} color="#D4A853" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          )}
          {/* @handle removed per user request */}

          <View style={st.statsRow}>
            {[
              { value: myStats.totalLikes, label: t.likesReceivedLabel },
              { value: profile?.followedAuthorIds?.length ?? 0, label: t.following },
              { value: myStats.storyCount, label: t.storiesLabel },
            ].map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={st.statDivider} />}
                <View style={st.statCell}>
                  <Text style={st.statValue}>{item.value}</Text>
                  <Text style={st.statLabel}>{item.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <View style={st.quickRow}>
            {[
              { icon: <BookOpen size={18} color="#6A6A86" strokeWidth={1.6} />, label: t.myStories, route: 'MyStories' },
              { icon: <FileText size={18} color="#6A6A86" strokeWidth={1.6} />, label: t.myWebNovels, route: 'MyWebNovels' },
              { icon: <MessageSquare size={18} color="#6A6A86" strokeWidth={1.6} />, label: t.myContent, route: 'MyContent' },
            ].map((item) => (
              <TouchableOpacity
                key={item.route}
                style={st.quickBtn}
                onPress={() => navigation.navigate(item.route as never)}
                activeOpacity={0.7}
              >
                {item.icon}
                <Text style={st.quickBtnTxt}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ─── AI 모델 ─── */}
        <View style={st.group}>
          <Text style={st.groupTitle}>{t.aiModel}</Text>
          <View style={st.modelCard}>
            <LinearGradient
              colors={['rgba(167,139,250,0.06)', 'transparent']}
              style={StyleSheet.absoluteFillObject}
              start={[0, 0]} end={[1, 1]}
            />
            <View style={st.modelCardInner}>
              <View style={st.modelCardLeft}>
                <Text style={st.modelCardLabel}>
                  {t.currentModel}{switching ? ` - ${t.applying}` : ''}
                </Text>
                <Text style={st.modelCardName}>
                  {activeModel
                    ? (t[activeModel.nameKey] ?? activeModel.name)
                    : (downloadedModels.length === 0 ? t.noModelDownloaded : '-')}
                </Text>
                {activeModel && (
                  <Text style={st.modelCardDesc}>
                    {t[activeModel.summaryKeys.line2] ?? activeModel.summary.line2}
                  </Text>
                )}
              </View>
              <View style={[st.modelDot, switching && st.modelDotSwitching]} />
            </View>
          </View>

          {switchableModels.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[st.modelSwitchRow, switching && st.modelSwitchRowDisabled]}
              onPress={() => handleModelSwitch(m.id)}
              disabled={switching}
              activeOpacity={0.7}
            >
              <View style={st.modelSwitchLeft}>
                <Text style={st.modelSwitchName}>
                  {t[m.nameKey] ?? m.name}
                </Text>
                <Text style={st.modelSwitchDesc}>
                  {t[m.summaryKeys.line1] ?? m.summary.line1}
                </Text>
              </View>
              <View style={st.modelSwitchBtn}>
                <Text style={st.modelSwitchBtnTxt}>{switching ? '...' : t.switchModel}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {downloadedModels.length === 0 && (
            <View style={st.noModelBanner}>
              <Text style={st.noModelTxt}>{t.downloadModelFirst}</Text>
              <Text style={st.noModelSub}>{t.noModelDownloadedSub}</Text>
            </View>
          )}

          <RowItem
            icon={<Cpu size={16} color="#525268" strokeWidth={1.5} />}
            label={t.modelManager}
            onPress={() => setShowModelManager(v => !v)}
            rightEl={
              <ChevronRight
                size={15}
                color={'#2E2E44'}
                strokeWidth={2}
                style={{ transform: [{ rotate: showModelManager ? '90deg' : '0deg' }] }}
              />
            }
          />
          {showModelManager && (
            <View style={st.modelManagerWrap}>
              {showModelManagerContent ? (
                <ModelSelector onModelChange={refreshModels} />
              ) : (
                <Text style={{ color: '#797990', fontSize: 13 }}>
                  {t.loading ?? screenT.loading}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ─── 설정 ─── */}
        <View style={st.group}>
          <Text style={st.groupTitle}>{t.settings}</Text>
          <RowItem
            icon={<Globe size={16} color="#525268" strokeWidth={1.5} />}
            label={t.languageSettings}
            onPress={() => navigation.navigate('LanguageSettings')}
          />
          <RowItem
            icon={<Bell size={16} color="#525268" strokeWidth={1.5} />}
            label={t.notifications}
            rightEl={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#1E1E2C', true: 'rgba(212,168,83,0.5)' }}
                thumbColor={notificationsEnabled ? '#D4A853' : '#3A3A50'}
                ios_backgroundColor="#1E1E2C"
              />
            }
          />
          <RowItem
            icon={<Settings size={16} color="#525268" strokeWidth={1.5} />}
            label={t.settingsHaptic}
            sublabel={hapticEnabled ? t.settingsHapticOn : t.settingsHapticOff}
            rightEl={
              <Switch
                value={hapticEnabled}
                onValueChange={setHapticEnabled}
                trackColor={{ false: '#1E1E2C', true: 'rgba(212,168,83,0.5)' }}
                thumbColor={hapticEnabled ? '#D4A853' : '#3A3A50'}
                ios_backgroundColor="#1E1E2C"
              />
            }
          />
          <RowItem
            icon={<FileText size={16} color="#525268" strokeWidth={1.5} />}
            label={t.openSourceLicenses}
            onPress={() => navigation.navigate('OpenSourceLicenses')}
          />
          <RowItem
            icon={<UserX size={16} color="#525268" strokeWidth={1.5} />}
            label={t.blockManagement}
            onPress={() => navigation.navigate('BlockManagement')}
          />
        </View>

        {/* ─── 고객지원 ─── */}
        <View style={st.group}>
          <Text style={st.groupTitle}>{t.support}</Text>
          <RowItem
            icon={<MessageSquare size={16} color="#525268" strokeWidth={1.5} />}
            label={t.support}
            onPress={() => navigation.navigate('ContactAdmin')}
          />
        </View>

        {/* ─── 법적 고지 ─── */}
        <View style={st.group}>
          <Text style={st.groupTitle}>{t.legalNotice}</Text>
          <RowItem icon={<FileText size={16} color="#525268" strokeWidth={1.5} />} label={t.termsOfService} onPress={() => navigation.navigate('Policy', { tab: 'terms' })} />
          <RowItem icon={<Lock size={16} color="#525268" strokeWidth={1.5} />} label={t.privacyPolicy} onPress={() => navigation.navigate('Policy', { tab: 'privacy' })} />
          <RowItem icon={<Settings size={16} color="#525268" strokeWidth={1.5} />} label={t.communityGuidelines} onPress={() => navigation.navigate('Policy', { tab: 'operation' })} />
          <RowItem icon={<Shield size={16} color="#525268" strokeWidth={1.5} />} label={t.minorProtectionPolicy} onPress={() => navigation.navigate('Policy', { tab: 'youth' })} />
        </View>

        {isAdmin && (
          <View style={st.group}>
            <Text style={st.groupTitle}>{t.adminPanel ?? screenT.adminPanelBtn}</Text>
            <RowItem
              icon={<Shield size={16} color="#D4A853" strokeWidth={1.5} />}
              label={t.adminPanel}
              onPress={() => navigation.navigate('AdminPanel')}
              labelStyle={st.goldText}
            />
          </View>
        )}

        {/* ─── 계정 관리 ─── */}
        <View style={st.group}>
          <Text style={st.groupTitle}>{t.accountManagement}</Text>
          <RowItem
            icon={<LogOut size={16} color="#525268" strokeWidth={1.5} />}
            label={t.signOut}
            onPress={handleSignOut}
          />
          <RowItem
            icon={<UserX size={16} color="#C0392B" strokeWidth={1.5} />}
            label={t.deleteAccount}
            onPress={handleDeleteAccount}
            destructive
          />
        </View>

        {/* ─── 푸터 ─── */}
        <View style={st.footer}>
          <Text style={st.footerVersion}>
            <Text style={st.footerBrand}>RPcore</Text>
            <Text style={st.footerVersionMuted}> Beta | 2026</Text>
          </Text>
          <Text style={st.footerEmail}>{contactEmail}</Text>
          {!isAdmin && <AdminSecretAccess navigation={navigation} />}
        </View>
      </KeyboardAwareWrapper>

      <ConfirmModal
        visible={signOutModal}
        icon="alert-circle-outline"
        iconColor={'#F59E0B'}
        title={t.signOut}
        message={t.signOutConfirm}
        onRequestClose={() => setSignOutModal(false)}
        actions={[
          { label: t.signOut, variant: 'danger', onPress: doSignOut },
          { label: t.cancel, variant: 'default', onPress: () => setSignOutModal(false) },
        ]}
      />
      <ConfirmModal
        visible={deleteAccModal}
        icon="alert-circle-outline"
        iconColor={'#FF5555'}
        title={t.deleteAccount}
        message={t.deleteAccountConfirm}
        onRequestClose={() => setDeleteAccModal(false)}
        actions={[
          { label: t.confirm, variant: 'danger', onPress: doDeleteAccount },
          { label: t.cancel, variant: 'default', onPress: () => setDeleteAccModal(false) },
        ]}
      />
    </SafeAreaView>
  );
}

const ric = StyleSheet.create({
  secretBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  secretTxt: { fontSize: 10, color: '#0E0E14' } });

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#050507' },
  scroll: { flex: 1 },
  heroSection: {
    alignItems: 'center',
    paddingTop: 36, paddingBottom: 28,
    paddingHorizontal: 20,
    overflow: 'hidden' },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatarFallback: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#0E0E14',
    borderWidth: 2, borderColor: '#D4A853',
    alignItems: 'center', justifyContent: 'center' },
  avatarImg: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: '#D4A853' },
  avatarInitial: { fontSize: 34, fontFamily: Typography.fontFamily.light, color: '#3A3A52' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#D4A853',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#050507' },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  userName:    { fontSize: 22, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', letterSpacing: -0.5 },
  editBadge:   {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.25)',
    alignItems: 'center', justifyContent: 'center' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, width: '100%' },
  nameInput: {
    flex: 1,
    borderBottomWidth: 1.5, borderBottomColor: '#D4A853',
    fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5',
    paddingVertical: 6, textAlign: 'center' },
  confirmBtn: {
    backgroundColor: '#D4A853', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10 },
  confirmBtnTxt: { fontSize: 12, fontFamily: Typography.fontFamily.bold, color: '#050507' },
  cancelNameBtn: {
    borderWidth: 1, borderColor: '#222232', backgroundColor: '#0E0E14',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  cancelNameTxt: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#797990' },
  userHandle:  { fontSize: 13, fontFamily: Typography.fontFamily.regular, color: '#3A3A52', marginBottom: 20 },
  statsRow: {
    flexDirection: 'row', width: '100%',
    backgroundColor: '#0A0A10',
    borderRadius: 16, borderWidth: 1, borderColor: '#16161E',
    paddingVertical: 18, marginBottom: 14 },
  statCell:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 20, fontFamily: Typography.fontFamily.extrabold, color: '#D4A853', letterSpacing: -0.5 },
  statLabel:   { fontSize: 10, fontFamily: Typography.fontFamily.medium, color: '#3A3A52', marginTop: 4, letterSpacing: 0.3 },
  statDivider: { width: 1, height: 28, backgroundColor: '#1A1A24', alignSelf: 'center' },
  quickRow: { flexDirection: 'row', gap: 8, width: '100%' },
  quickBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#0A0A10', borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1, borderColor: '#16161E' },
  quickBtnTxt: { fontSize: 10, fontFamily: Typography.fontFamily.medium, color: '#525268', letterSpacing: 0.2 },
  group: {
    marginTop: 8, marginHorizontal: 16,
    backgroundColor: '#0A0A10',
    borderRadius: 16, borderWidth: 1, borderColor: '#14141C',
    overflow: 'hidden', marginBottom: 2 },
  groupTitle: {
    fontSize: 10, fontFamily: Typography.fontFamily.semibold, color: '#3A3A52',
    letterSpacing: 1.4, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#14141C' },
  rowLeft:             { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconBox:             { width: 22, alignItems: 'center', justifyContent: 'center' },
  iconBoxDestructive:  {},
  rowLabel:            { fontSize: 15, fontFamily: Typography.fontFamily.regular, color: '#C0C0D0' },
  rowSublabel:         { fontSize: 12, fontFamily: Typography.fontFamily.regular, color: '#525268', marginTop: 2 },
  rowLabelDestructive: { color: '#E05555' },
  modelCard: {
    marginHorizontal: 12, marginBottom: 8,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
    overflow: 'hidden' },
  modelCardInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14 },
  modelCardLeft:   { flex: 1 },
  modelCardLabel:  { fontSize: 9, fontFamily: Typography.fontFamily.semibold, color: '#3A3A52', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  modelCardName:   { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#E0E0F0', letterSpacing: -0.2 },
  modelCardDesc:   { fontSize: 11, fontFamily: Typography.fontFamily.regular, color: '#454560', marginTop: 4 },
  modelDot:        { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#34D399' },
  modelDotSwitching: { backgroundColor: '#FBBF24' },
  modelSwitchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: '#070710', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#14141C' },
  modelSwitchRowDisabled: { opacity: 0.4 },
  modelSwitchLeft: { flex: 1 },
  modelSwitchName: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#8A8A9E' },
  modelSwitchDesc: { fontSize: 11, fontFamily: Typography.fontFamily.regular, color: '#3A3A50', marginTop: 2 },
  modelSwitchBtn:  {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#101018', borderWidth: 1, borderColor: '#181820' },
  modelSwitchBtnTxt: { fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#797990' },
  noModelBanner: {
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: '#070710', borderRadius: 10, padding: 14,
    borderLeftWidth: 2, borderLeftColor: 'rgba(212,168,83,0.4)',
    borderWidth: 1, borderColor: '#14141C' },
  noModelTxt: { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#D4A853' },
  noModelSub: { fontSize: 11, fontFamily: Typography.fontFamily.regular, color: '#454560', marginTop: 4, lineHeight: 16 },
  modelManagerWrap: { marginTop: 4, backgroundColor: '#040406', marginHorizontal: -1 },
  footer:        { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 6 },
  footerVersion: { fontSize: 11, fontFamily: Typography.fontFamily.regular, textAlign: 'center' },
  footerBrand:   { color: '#7B68D6', fontFamily: Typography.fontFamily.semibold },
  footerVersionMuted: { color: '#58586E' },
  footerEmail:   { fontSize: 11, fontFamily: Typography.fontFamily.medium, color: '#70708A', textAlign: 'center' },
  goldText:      { color: '#D4A853' } });
