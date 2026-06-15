import { Typography } from '../constants/tokens';
import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { RootStackParamList, BottomTabParamList } from '../types/navigation';
import { BottomTabBar } from '../components/BottomTabBar';
import { navigationRef } from './navigationRef';
import { PolicyUpdateBanner } from '../policy/PolicyUpdateBanner';
import { EngineErrorBoundary } from '../components/EngineErrorBoundary';
import llamaEngine from '../core/llama/LlamaEngine';

import { HomeScreen } from '../screens/home';
import { OnboardingScreen, ONBOARDING_KEY } from '../screens/onboarding';
import { TestEntryScreen } from '../screens/TestEntryScreen';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { appStorage } from '../utils/storage';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<BottomTabParamList>();

type LazyScreen = React.ComponentType<Record<string, unknown>>;
type ScreenComponent = React.ComponentType<any>;
type ScreenModule = Record<string, unknown>;
type ScreenLoader = () => ScreenModule;

function resolveScreenComponent(
  loadModule: ScreenLoader,
  exportName?: string,
): ScreenComponent {
  const mod = loadModule();
  const defaultExport = mod.default;
  const candidate =
    (exportName ? mod[exportName] : undefined) ??
    (typeof defaultExport === 'function' ? defaultExport : undefined) ??
    (exportName &&
    defaultExport &&
    typeof defaultExport === 'object'
      ? (defaultExport as Record<string, unknown>)[exportName]
      : undefined);

  if (typeof candidate === 'function') {
    return candidate as ScreenComponent;
  }

  throw new Error(`Unable to resolve screen export: ${exportName ?? 'default'}`);
}

function lazyNamedScreen(loadModule: ScreenLoader, exportName: string): () => ScreenComponent {
  return () => resolveScreenComponent(loadModule, exportName);
}

function lazyDefaultScreen(loadModule: ScreenLoader): () => ScreenComponent {
  return () => resolveScreenComponent(loadModule);
}

const getCreateScreen = lazyNamedScreen(() => require('../screens/CreateScreen'), 'CreateScreen');
const getStoryScreen = lazyNamedScreen(() => require('../screens/StoryScreen'), 'StoryScreen');
const getProfileScreen = lazyNamedScreen(() => require('../screens/MyPageScreen'), 'MyPageScreen');
const getCommunityScreen = lazyNamedScreen(() => require('../screens/community'), 'CommunityScreen');
const getCommunityPostDetailScreen = lazyNamedScreen(() => require('../screens/community'), 'CommunityPostDetailScreen');
const getStoryDetailScreen = lazyNamedScreen(() => require('../screens/StoryDetailScreen'), 'StoryDetailScreen');
const getStoryDetailDebugScreen = lazyNamedScreen(() => require('../screens/StoryDetailDebugScreen'), 'StoryDetailDebugScreen');
const getChatScreen = lazyNamedScreen(() => require('../screens/chat'), 'ChatScreen');
const getSearchScreen = lazyNamedScreen(() => require('../screens/SearchScreen'), 'SearchScreen');
const getNotificationsScreen = lazyNamedScreen(() => require('../screens/NotificationsScreen'), 'NotificationsScreen');
const getAuthorProfileScreen = lazyNamedScreen(() => require('../screens/AuthorProfileScreen'), 'AuthorProfileScreen');
const getCharacterDetailScreen = lazyNamedScreen(() => require('../screens/CharacterDetailScreen'), 'CharacterDetailScreen');
const getCharacterListScreen = lazyNamedScreen(() => require('../screens/characters'), 'CharacterListScreen');
const getAIStoryChatScreen = lazyNamedScreen(() => require('../screens/AIStoryChatScreen'), 'AIStoryChatScreen');
const getLanguageSettingsScreen = lazyNamedScreen(() => require('../screens/LanguageSettingsScreen'), 'LanguageSettingsScreen');
const getPolicyScreen = lazyNamedScreen(() => require('../screens/policy'), 'PolicyScreen');
const getDataPolicyScreen = lazyNamedScreen(() => require('../screens/policy'), 'DataPolicyScreen');
const getContactAdminScreen = lazyNamedScreen(() => require('../screens/policy'), 'ContactAdminScreen');
const getAccessibilityScreen = lazyNamedScreen(() => require('../screens/AccessibilityScreen'), 'AccessibilityScreen');
const getAdminPanelScreen = lazyNamedScreen(() => require('../screens/AdminPanelScreen'), 'AdminPanelScreen');
const getAdminDashboardScreen = lazyNamedScreen(() => require('../screens/admin/AdminDashboardScreen'), 'AdminDashboardScreen');
const getAdminAnnouncementScreen = lazyNamedScreen(() => require('../screens/AdminAnnouncementScreen'), 'AdminAnnouncementScreen');
const getNovelShareScreen = lazyNamedScreen(() => require('../screens/webnovel'), 'NovelShareScreen');
const getWebNovelReaderScreen = lazyNamedScreen(() => require('../screens/webnovel'), 'WebNovelReaderScreen');
const getEpubReaderSpikeScreen = lazyNamedScreen(() => require('../screens/webnovel'), 'EpubReaderSpikeScreen');
const getMyWebNovelsScreen = lazyNamedScreen(() => require('../screens/webnovel'), 'MyWebNovelsScreen');
const getWriteNovelPostScreen = lazyNamedScreen(() => require('../screens/webnovel'), 'WriteNovelPostScreen');
const getWebNovelLibraryScreen = lazyNamedScreen(() => require('../screens/webnovel/WebNovelLibraryScreen'), 'WebNovelLibraryScreen');
const getAIWebNovelChatScreen = lazyNamedScreen(() => require('../screens/AIWebNovelChatScreen'), 'AIWebNovelChatScreen');
const getWritePostScreen = lazyNamedScreen(() => require('../screens/WritePostScreen'), 'WritePostScreen');
const getOpenSourceLicensesScreen = lazyNamedScreen(() => require('../screens/licenses'), 'OpenSourceLicensesScreen');
const getBlockManagementScreen = lazyNamedScreen(() => require('../screens/BlockManagementScreen'), 'BlockManagementScreen');
const getConversationsScreen = lazyNamedScreen(() => require('../screens/ConversationsScreen'), 'ConversationsScreen');
const getMyContentScreen = lazyNamedScreen(() => require('../screens/MyContentScreen'), 'MyContentScreen');
const getMyStoriesScreen = lazyNamedScreen(() => require('../screens/MyStoriesScreen'), 'MyStoriesScreen');
const getDownloadedNovelsScreen = lazyNamedScreen(() => require('../screens/webnovel/DownloadedNovelsScreen'), 'DownloadedNovelsScreen');
const getFollowFeedScreen = lazyNamedScreen(() => require('../screens/community/FollowFeedScreen'), 'FollowFeedScreen');
const getTagBrowserScreen = lazyNamedScreen(() => require('../screens/community/TagBrowserScreen'), 'TagBrowserScreen');
const getLikesBookmarksScreen = lazyNamedScreen(() => require('../screens/community/LikesBookmarksScreen'), 'LikesBookmarksScreen');
const getUserProfileDetailScreen = lazyNamedScreen(() => require('../screens/community/UserProfileDetailScreen'), 'UserProfileDetailScreen');
const getChatHistorySearchScreen = lazyNamedScreen(() => require('../screens/chat/ChatHistorySearch'), 'ChatHistorySearch');
const getNotificationSettingsScreen = lazyDefaultScreen(() => require('../screens/NotificationSettingsScreen'));
const getReadingStatsScreen = lazyDefaultScreen(() => require('../screens/ReadingStatsScreen'));
const getBackupRestoreScreen = lazyDefaultScreen(() => require('../screens/BackupRestoreScreen'));
const getCacheManagementScreen = lazyDefaultScreen(() => require('../screens/CacheManagementScreen'));

const NAVIGATION_WARMUP_LOADERS = [
  getCreateScreen,
  getStoryScreen,
  getCommunityScreen,
  getProfileScreen,
  getStoryDetailScreen,
  getChatScreen,
  getSearchScreen,
  getNotificationsScreen,
  getMyStoriesScreen,
  getWebNovelLibraryScreen,
] as const;

function scheduleNavigationWarmup(): () => void {
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  NAVIGATION_WARMUP_LOADERS.forEach((loadScreen, index) => {
    const timer = setTimeout(() => {
      try {
        loadScreen();
      } catch {
        // Navigation warmup is best-effort only.
      }
    }, 900 + index * 140);

    timers.push(timer);
  });

  return () => {
    timers.forEach(clearTimeout);
  };
}

// ???? StoryEditor 嚥≪뮆逾??癒?쑎 ??媛?UI ????????????????????????????????????????????????????????????????????????????????????????
function StoryEditorFallback({ onRetry }: { onRetry: () => void }) {
  const t = useLanguageStore(s => s.t);
  return (
    <View style={s.fallback}>
      <Text style={s.fallbackTitle}>{t?.loadFailed ?? ''}</Text>
      <Pressable onPress={onRetry} style={s.retryBtn}>
        <Text style={s.retryText}>{t?.retry ?? ''}</Text>
      </Pressable>
    </View>
  );
}

// ???? StoryEditor Lazy Screen ??????????????????????????????????????????????????????????????????????????????????????????????????
function StoryEditorRouteScreen(props: Record<string, unknown>) {
  const [state, setState] = React.useState<
    | { status: 'loading' }
    | { status: 'ready'; Component: LazyScreen }
    | { status: 'error'; message: string }
  >({ status: 'loading' });

  const loadScreen = React.useCallback(() => {
    setState({ status: 'loading' });

    // Metro lazy require can throw synchronously, so guard state updates.
    let active = true;
    try {
      const loaded = require('../screens/story-editor') as {
        StoryEditorScreen?: LazyScreen;
        default?: LazyScreen | { StoryEditorScreen?: LazyScreen };
      };

      const resolved =
        loaded.StoryEditorScreen ??
        (typeof loaded.default === 'function'
          ? (loaded.default as LazyScreen)
          : (loaded.default as Record<string, LazyScreen> | undefined)?.StoryEditorScreen);

      if (resolved && active) {
        setState({ status: 'ready', Component: resolved });
      } else if (active) {
        setState({
          status: 'error',
          message: 'StoryEditorScreen export not found in story-editor module.' });
      }
    } catch (error) {
      if (active) {
        const msg = error instanceof Error ? error.message : String(error);
        setState({ status: 'error', message: msg });
      }
    }

    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    return loadScreen();
  }, [loadScreen]);

  if (state.status === 'loading') return <View style={s.placeholder} />;
  if (state.status === 'error') return <StoryEditorFallback onRetry={loadScreen} />;
  return <state.Component {...props} />;
}

// ???? Deep-link ??쇱젟 ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['rpcore://'],
  config: {
    screens: {
      Main: '',
      StoryDetail: 'story/:storyId',
      AuthorProfile: 'author/:authorId',
      CharacterList: 'characters',
      Policy: 'policy',
      AccessibilitySettings: 'accessibility',
      FollowFeed: 'feed',
      TagBrowser: 'tags/:initialTag?',
      WebNovelLibrary: 'library',
      UserProfileDetail: 'user/:authorId',
      NotificationSettings: 'notification-settings',
      ReadingStats: 'reading-stats',
      BackupRestore: 'backup',
      CacheManagement: 'cache' } } };

const renderTabBar = (
  tabProps: import('@react-navigation/bottom-tabs').BottomTabBarProps,
) => <BottomTabBar {...tabProps} />;

// ???? ????뽮퐣: ??0) -> ??뽰삂(1) -> ??쎈꽅??2) -> ?뚣끇???딅뼒(3) -> ?袁⑥쨮??4) ????????????????????
function MainTabs() {
  return (
    <Tab.Navigator
      id="main-tabs"
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: true }}
    >
      <Tab.Screen name="Home"      component={HomeScreen} />
      <Tab.Screen name="Create"    getComponent={getCreateScreen} />
      <Tab.Screen name="Story"     getComponent={getStoryScreen} />
      <Tab.Screen name="Community" getComponent={getCommunityScreen} />
      <Tab.Screen name="Profile"   getComponent={getProfileScreen} />
    </Tab.Navigator>
  );
}

// ???? ?룐뫂??Navigator ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
export function AppNavigator() {
  const user = useAuthStore(s => s.user);
  const isInitialized = useAuthStore(s => s.isInitialized);

  React.useEffect(() => {
    return scheduleNavigationWarmup();
  }, []);

  // BUG-08 fix: wait for auth init before rendering to avoid Onboarding flash
  if (!isInitialized) {
    return null;
  }

  // [FIX] DEBUG_BYPASS_AUTH嚥???밴쉐?????쟿??곷뮞?????醫뤾쿃?? ??쇱젫 API ?紐꾪뀱???????븍뜃?
  // 'debug.token.placeholder'??野껋럩??TestEntry嚥?癰귣?沅????쇱젫 ?醫뤾쿃 ??얜굣
  const isValidToken = user?.jwtToken && user.jwtToken !== 'debug.token.placeholder';
  const initialRoute = isValidToken ? 'Main' : 'TestEntry';

  if (__DEV__) {
    console.log('[AppNavigator] Routing decision:', {
      hasUser: !!user,
      userId: user?.id,
      hasToken: !!user?.jwtToken,
      tokenPreview: user?.jwtToken ? user.jwtToken.substring(0, 20) + '...' : 'none',
      isValidToken,
      initialRoute,
    });
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <EngineErrorBoundary onSoftReset={() => llamaEngine.softReset([]).catch(() => {})}>
        <Stack.Navigator
          id="root-stack"
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: '#050507' } }}
        >
          <Stack.Screen
            name="TestEntry"
            component={TestEntryScreen}
            options={{ animation: 'none' }}
          />
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            initialParams={{ skipToLogin: appStorage.getString(ONBOARDING_KEY) === '1' }}
            options={{ animation: 'none' }}
          />
          <Stack.Screen name="Main"                component={MainTabs}                options={{ animation: 'none' }} />
          <Stack.Screen 
            name="StoryDetail" 
            getComponent={getStoryDetailScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen name="StoryDetailDebug"    getComponent={getStoryDetailDebugScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="CharacterDetail"     getComponent={getCharacterDetailScreen} />
          <Stack.Screen name="CharacterList"       getComponent={getCharacterListScreen}       options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AuthorProfile"       getComponent={getAuthorProfileScreen} />
          <Stack.Screen name="Notifications"       getComponent={getNotificationsScreen}       options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Search"              getComponent={getSearchScreen}              options={{ animation: 'fade' }} />
          <Stack.Screen name="Chat"                getComponent={getChatScreen}                options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AIStoryChat"         getComponent={getAIStoryChatScreen}         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="StoryEditor"         component={StoryEditorRouteScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AIWebNovelChat"      getComponent={getAIWebNovelChatScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="LanguageSettings"    getComponent={getLanguageSettingsScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AccessibilitySettings" getComponent={getAccessibilityScreen}     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="OpenSourceLicenses"  getComponent={getOpenSourceLicensesScreen}  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="DataPolicy"          getComponent={getDataPolicyScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ContactAdmin"        getComponent={getContactAdminScreen}        options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AdminPanel"          getComponent={getAdminPanelScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AdminDashboard"      getComponent={getAdminDashboardScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AdminAnnouncement"   getComponent={getAdminAnnouncementScreen}   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="NovelShare"          getComponent={getNovelShareScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="WebNovelReader"      getComponent={getWebNovelReaderScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="EpubReaderSpike"     getComponent={getEpubReaderSpikeScreen}     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="MyWebNovels"         getComponent={getMyWebNovelsScreen}         options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="WriteNovelPost"      getComponent={getWriteNovelPostScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="WritePost"           getComponent={getWritePostScreen}           options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="CommunityPostDetail" getComponent={getCommunityPostDetailScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Policy"              getComponent={getPolicyScreen}              options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="BlockManagement"     getComponent={getBlockManagementScreen}     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Conversations"       getComponent={getConversationsScreen}       options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="MyContent"           getComponent={getMyContentScreen}           options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="MyStories"           getComponent={getMyStoriesScreen}           options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="DownloadedNovels"    getComponent={getDownloadedNovelsScreen}    options={{ animation: 'slide_from_right' }} />
          {/* ???? ?醫됲뇣 ?뚣끇???딅뼒/?諭???筌?쑵???遺얇늺 ???? */}
          <Stack.Screen name="FollowFeed"          getComponent={getFollowFeedScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="TagBrowser"          getComponent={getTagBrowserScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="LikesBookmarks"      getComponent={getLikesBookmarksScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="UserProfileDetail"   getComponent={getUserProfileDetailScreen}   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="WebNovelLibrary"     getComponent={getWebNovelLibraryScreen}     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ChatHistorySearch"   getComponent={getChatHistorySearchScreen}   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="NotificationSettings" getComponent={getNotificationSettingsScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ReadingStats"           getComponent={getReadingStatsScreen}           options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="BackupRestore"          getComponent={getBackupRestoreScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="CacheManagement"        getComponent={getCacheManagementScreen}        options={{ animation: 'slide_from_right' }} />
          {/* DownloadedNovelReader??WebNovelReader(source='downloaded')嚥????? */}
          {/* WebNovelDetail 筌잛텎oc ??깆뒭?紐껊뮉 WebNovelReader嚥??귐됰뼄?????*/}
        </Stack.Navigator>
        <PolicyUpdateBanner />
      </EngineErrorBoundary>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: '#050507' },
  fallback: {
    flex: 1,
    backgroundColor: '#050507',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12 },
  fallbackTitle: {
    fontSize: 16,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.semibold,
    textAlign: 'center' },
  fallbackSub: {
    fontSize: 13,
    color: '#8A8A9E',
    textAlign: 'center',
    lineHeight: 20 },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.40)',
    backgroundColor: 'rgba(212,168,83,0.10)' },
  retryText: {
    fontSize: 14,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.medium } });

