/**
 * src/screens/chat/ChatScreenRefactored.tsx
 * Refactored Chat Screen with enhanced UI, engine stability, and loading states.
 */

import { Typography } from '../../constants/tokens';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Text, StyleSheet, Dimensions,
  TouchableOpacity, View, TextInput,
  ActivityIndicator,
  Keyboard,
  Alert, Platform
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowUp, Bookmark as BookmarkIcon, ChevronDown } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ReduceMotion, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguageStore } from '../../store/languageStore';
import { getUIPhrases } from '../../i18n/uiPhrases';
import { useShallow } from 'zustand/react/shallow';
import type { ScreenProps } from '../../types/navigation';
import { useChatEngineCore } from './core/ChatEngineCore';
import { ChatHeader } from './components/ChatHeader';
import { ChatMessage } from './components/ChatMessage';
import { ChatDrawer, CharacterPanel, SettingsPanel, HistoryPanel } from './components/ChatDrawer';
import { ChoicePanel } from './components/ChoicePanel';
import { SkeletonItem } from '../../components/SkeletonItem';
import { LoadingSpinnerLottie } from '../../components/LoadingSpinnerLottie';
import { BookmarkList } from './components/BookmarkList';
import { StoryConfig, StoryCharacter } from '../../types/StoryContract';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ProfileSheet } from '../../components/modal/ProfileSheet';
import { PremiumImageViewer } from '../../components/PremiumImageViewer';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { ToastService } from '../../components/Toast';
import { AndroidScreen } from '../../components/AndroidScreen';
import { AnimatedBackground, useBackgroundManager, type BackgroundConfig } from '../../components/AnimatedBackground';
import { EditModal } from '../../components/modal/EditModal';
import { useAuthStore } from '../../store/authStore';
import { useModelStore, type EngineWarmState } from '../../store/modelStore';
import { clipboardSetString } from '../../utils/ClipboardUtils';
import { StoryAPI } from '../../api/StoryAPI';
import llamaEngine from '../../core/llama/LlamaEngine';
import { getModelBadgeMeta, resolveStoryModelId } from '../../utils/storyModelMeta';
import { appStorage } from '../../utils/storage';
import {
  getNormalizedChatStoryConfig,
  buildRenderableChatStory,
  hasHydratedChatStory,
  needsHydratedChatStory,
  normalizeChatStoryPayload,
  resolveChatHydrationResult
} from './utils/normalizeStoryForChat';
import { getLocalImagePath } from '../../utils/imageDownloader';
import { formatChatTextForDisplay } from '../../utils/chatDisplayText';
import { getVisibleChatUserName, resolveChatUserName } from '../../utils/chatUserName';
import { buildCharacterChatStoryFromSource } from '../../utils/characterChat';
import RNFS from '../../utils/fileSystemCompat';
import ChatInputBar, { type ReplyTarget } from '../ChatInputBar';
import { useUserProfileStore } from '../../store/userProfileStore';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;
const MAX_INPUT_LEN = 500;

const HEADER_OVERLAY_HEIGHT = 64;
const BOTTOM_OVERLAY_PADDING = 100;
const BOTTOM_FOLLOW_THRESHOLD = 160;
const BOTTOM_FOLLOW_BURST_DELAYS = [0, 48, 128, 240] as const;
const CHAT_INPUT_NATIVE_ID = 'story-chat-input';

const logChatDebug = (...args: unknown[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};

const warnChatDebug = (...args: unknown[]) => {
  if (__DEV__) {
    console.warn(...args);
  }
};

type DrawerTab = 'characters' | 'history' | 'settings';
type GroupPosition = 'first' | 'middle' | 'last' | 'solo';
type GroupableMessage = { role?: string; characterId?: string | number | null };
type ChatListNoticeItem = { id: string; type: 'ai_notice' };

function isSameMessageRun(left?: GroupableMessage, right?: GroupableMessage) {
  if (!left || !right || left.role !== right.role) return false;
  if (left.role === 'user') return true;
  if (left.role === 'ai') {
    return String(left.characterId ?? '') === String(right.characterId ?? '');
  }
  return false;
}

function getMessageGroupPosition(
  previousMessage: GroupableMessage | undefined,
  currentMessage: GroupableMessage | undefined,
  nextMessage: GroupableMessage | undefined,
): GroupPosition {
  if (!currentMessage || (currentMessage.role !== 'ai' && currentMessage.role !== 'user')) {
    return 'solo';
  }

  const hasPrevious = isSameMessageRun(previousMessage, currentMessage);
  const hasNext = isSameMessageRun(currentMessage, nextMessage);

  if (hasPrevious && hasNext) return 'middle';
  if (hasPrevious) return 'last';
  if (hasNext) return 'first';
  return 'solo';
}

function getNarratorGroupPosition(
  previousMessage: GroupableMessage | undefined,
  currentMessage: GroupableMessage | undefined,
  nextMessage: GroupableMessage | undefined,
): GroupPosition {
  if (currentMessage?.role !== 'narrator') return 'solo';

  const hasPrevious = previousMessage?.role === 'narrator';
  const hasNext = nextMessage?.role === 'narrator';

  if (hasPrevious && hasNext) return 'middle';
  if (hasPrevious) return 'last';
  if (hasNext) return 'first';
  return 'solo';
}

export const ChatScreenRefactored: React.FC<ScreenProps<'Chat'>> = ({ navigation, route }) => {
  const routeParams = route.params as ScreenProps<'Chat'>['route']['params'] | undefined;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 0);
  const bottomSafeInset = Math.max(insets.bottom, 0);
  const { appLanguage: appLang, t } = useLanguageStore(useShallow(s => ({ appLanguage: s.appLanguage, t: s.t })));
  const phrases = useMemo(() => getUIPhrases(appLang), [appLang]);
  const activeModelId = useModelStore(s => s.activeModelId);
  const engineWarmState = useModelStore(s => s.engineWarmState);
  const [liveEngineState, setLiveEngineState] = useState(() => llamaEngine.getState());
  const routeStory = useMemo(
    () => normalizeChatStoryPayload(routeParams?.story),
    [routeParams?.story],
  );
  const routeCharacter = routeParams?.character;
  const routeLastChapterIndex = routeParams?.lastChapterIndex;
  const routeResumeMode = routeParams?.resumeMode ?? true;
  const routeAdapterSelection = routeParams?.adapterSelection;
  const fallbackStory = useMemo(() => ({
    id: '__invalid_chat_route__',
    title: 'Story',
    story_config: {
      title: 'Story',
      characters: [],
      backgrounds: [],
      chapters: []
    }
  }), []);
  const [resolvedStory, setResolvedStory] = useState<any>(routeStory ?? fallbackStory);
  const [isResolvingStory, setIsResolvingStory] = useState(false);
  const [storyResolveFailed, setStoryResolveFailed] = useState(false);
  const hydrationRequestIdRef = useRef(0);

  useEffect(() => {
    setResolvedStory(routeStory ?? fallbackStory);
    setStoryResolveFailed(false);
  }, [fallbackStory, routeStory]);

  useEffect(() => {
    setLiveEngineState(llamaEngine.getState());
    return llamaEngine.onStateChange((nextState) => {
      setLiveEngineState(current => (current === nextState ? current : nextState));
    });
  }, []);

  const effectiveEngineWarmState = useMemo<EngineWarmState>(() => {
    if (liveEngineState === 'ready' || liveEngineState === 'generating') {
      return 'ready';
    }
    if (liveEngineState === 'loading' || liveEngineState === 'warming') {
      return 'warming';
    }
    if (liveEngineState === 'error') {
      return 'error';
    }
    return engineWarmState;
  }, [engineWarmState, liveEngineState]);

  useEffect(() => {
    if (!routeStory?.id) {
      setIsResolvingStory(false);
      return;
    }
    if (!needsHydratedChatStory(routeStory)) {
      setResolvedStory(routeStory);
      setIsResolvingStory(false);
      return;
    }

    const requestId = hydrationRequestIdRef.current + 1;
    hydrationRequestIdRef.current = requestId;
    let cancelled = false;
    const controller = new AbortController();

    setIsResolvingStory(true);
    setStoryResolveFailed(false);

    (async () => {
      try {
        const fetchedStory = await StoryAPI.getStory(String(routeStory.id), appLang, {
          signal: controller.signal
        });
        if (cancelled || hydrationRequestIdRef.current !== requestId || !isMountedRef.current) return;

        const hydration = resolveChatHydrationResult(routeStory, fetchedStory);
        setResolvedStory(hydration.story);
        setStoryResolveFailed(hydration.failed);
      } catch {
        if (!cancelled && hydrationRequestIdRef.current === requestId && isMountedRef.current) {
          const hydration = resolveChatHydrationResult(routeStory, null);
          setResolvedStory(hydration.story);
          setStoryResolveFailed(hydration.failed);
        }
      } finally {
        if (!cancelled && hydrationRequestIdRef.current === requestId && isMountedRef.current) {
          setIsResolvingStory(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [appLang, routeStory]);

  const sourceRouteStory = useMemo(
    () => normalizeChatStoryPayload(resolvedStory ?? routeStory ?? fallbackStory),
    [fallbackStory, resolvedStory, routeStory],
  );
  const shouldDelayCharacterChat = useMemo(() => {
    if (!routeCharacter || !routeStory) return false;
    return needsHydratedChatStory(routeStory)
      && !storyResolveFailed
      && !hasHydratedChatStory(sourceRouteStory);
  }, [routeCharacter, routeStory, sourceRouteStory, storyResolveFailed]);
  const effectiveRouteStory = useMemo(() => {
    if (!routeCharacter) {
      return sourceRouteStory;
    }
    if (shouldDelayCharacterChat) {
      return fallbackStory;
    }
    return normalizeChatStoryPayload(buildCharacterChatStoryFromSource(sourceRouteStory, routeCharacter));
  }, [fallbackStory, routeCharacter, shouldDelayCharacterChat, sourceRouteStory]);
  const renderableStory = useMemo(
    () => buildRenderableChatStory(effectiveRouteStory, appLang),
    [appLang, effectiveRouteStory],
  );
  const hasValidRouteStory = !!routeStory?.id;

  const storyId = String((renderableStory as Record<string, unknown> | undefined)?.id ?? '');
  const storyConfig = useMemo(
    () => {
      const config = getNormalizedChatStoryConfig(renderableStory) as StoryConfig;
      logChatDebug('[ChatScreen] storyConfig loaded:', {
        hasBackgrounds: Array.isArray(config.backgrounds),
        backgroundCount: Array.isArray(config.backgrounds) ? config.backgrounds.length : 0,
        hasCharacters: Array.isArray(config.characters),
        characterCount: Array.isArray(config.characters) ? config.characters.length : 0
      });
      return config;
    },
    [renderableStory],
  );
  const screenTitle = useMemo(() => {
    const title = String(effectiveRouteStory?.title ?? storyConfig?.title ?? '').trim();
    return title === 'Story' ? '' : title;
  }, [effectiveRouteStory?.title, storyConfig?.title]);
  const isStoryReady = hasValidRouteStory && hasHydratedChatStory(renderableStory);

  // [FIX] Validate remote image URLs against the local cache before rendering.
  const [validatedImagePaths, setValidatedImagePaths] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    const imageLookupStoryId = String(
      ((storyConfig as unknown as Record<string, unknown> | undefined)?.imageLookupStoryId ?? storyId),
    );

    const validateImages = async () => {
      const pathMap: Record<string, string> = {};
      const characterUrls = new Set<string>();

      // Validate character image paths against the local cache first.
      const extracted = Array.isArray(storyConfig.characters) ? storyConfig.characters : [];
      for (const char of extracted) {
        const charId = Number((char as any).id ?? 0);
        if (!Number.isFinite(charId) || charId < 1) continue;

        const imageUris = Array.isArray((char as any).imageUris)
          ? (char as any).imageUris.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];
        const candidateUrls = imageUris.length > 0
          ? imageUris
          : [(char as any).profileUrl, (char as any).profile_url]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        for (const originalUrl of candidateUrls) {
          if (!originalUrl.startsWith('http')) continue;
          characterUrls.add(originalUrl);
        }
      }

      for (const originalUrl of characterUrls) {
        if (cancelled) return;
        const localPath = await getLocalImagePath(originalUrl, imageLookupStoryId);
        pathMap[originalUrl] = localPath;
        logChatDebug('[ChatScreen] Character image:', { originalUrl, localPath, isLocal: localPath.startsWith('file://') });
      }

      const backgroundUrls = new Set<string>();

      // Validate background image paths against the local cache first.
      const backgrounds = Array.isArray(storyConfig.backgrounds) ? storyConfig.backgrounds : [];
      for (const bg of backgrounds) {
        const originalUrl = (bg as any).uri || (bg as any).imageUrl || (bg as any).image_url || '';

        if (originalUrl && originalUrl.startsWith('http')) {
          backgroundUrls.add(originalUrl);
        }
      }

      for (const originalUrl of backgroundUrls) {
        if (cancelled) return;
        const localPath = await getLocalImagePath(originalUrl, imageLookupStoryId);
        pathMap[originalUrl] = localPath;
        logChatDebug('[ChatScreen] Background image:', { originalUrl, localPath, isLocal: localPath.startsWith('file://') });
      }

      if (cancelled) return;
      logChatDebug('[ChatScreen] Image validation complete:', { totalImages: Object.keys(pathMap).length, localCount: Object.values(pathMap).filter(p => p.startsWith('file://')).length });
      setValidatedImagePaths(prev => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(pathMap);
        const isSame = prevKeys.length === nextKeys.length
          && nextKeys.every(key => prev[key] === pathMap[key]);
        return isSame ? prev : pathMap;
      });
    };

    validateImages();
    return () => {
      cancelled = true;
    };
  }, [storyConfig, storyId]);

  const characters = useMemo(() => {
    const extracted = Array.isArray(storyConfig.characters) ? storyConfig.characters : [];
    if (extracted.length > 0) {
      return (extracted as unknown as StoryCharacter[]).map(char => {
        const charId = Number(char.id ?? 0);
        if (!Number.isFinite(charId) || charId < 1) return char;

        const imageUris = Array.isArray(char.imageUris) ? char.imageUris : [];
        const normalizedImageUris = imageUris
          .map(uri => validatedImagePaths[uri] || uri)
          .filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0);
        const originalUrl = imageUris[0] || char.profileUrl || char.profile_url || '';

        if (!originalUrl || !originalUrl.startsWith('http')) {
          return {
            ...char,
            imageUris: normalizedImageUris.length > 0 ? normalizedImageUris : imageUris,
          };
        }

        // 野꺜筌앹빖留?野껋럥以?????(嚥≪뮇類??癒?뮉 ?癒?궚 URL)
        const validatedPath = validatedImagePaths[originalUrl] || originalUrl;

        return {
          ...char,
          imageUris: normalizedImageUris.length > 0 ? normalizedImageUris : [validatedPath, ...imageUris.slice(1)],
          profileUrl: validatedPath,
          _originalUrl: originalUrl
        };
      });
    }
    return Array.isArray(storyConfig.characters) ? storyConfig.characters : [];
  }, [storyConfig, validatedImagePaths]);

  useEffect(() => {
    logChatDebug('[ChatScreen] characters loaded:', characters.map(character => ({
      id: character.id,
      name: character.name,
      hasImage: !!(character.imageUris?.[0] || character.profileUrl || character.profile_url),
    })));
  }, [characters]);

  const myProfile = useAuthStore(state => state.user);
  const userCharacterImages = useMemo(() => {
    const protagonist = characters.find((character: any) => Number(character?.id) === 1);
    const protagonistImageUris = Array.isArray((protagonist as any)?.imageUris)
      ? ((protagonist as any).imageUris as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const protagonistProfileUrl = typeof (protagonist as any)?.profileUrl === 'string' ? (protagonist as any).profileUrl : '';
    const protagonistLegacyProfileUrl = typeof (protagonist as any)?.profile_url === 'string' ? (protagonist as any).profile_url : '';
    if (protagonistImageUris.length > 0) return protagonistImageUris;
    return [protagonistProfileUrl, protagonistLegacyProfileUrl]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }, [characters]);

  const resolvedUserAvatarUri = userCharacterImages[0] ?? '';

  const backgrounds = useMemo(() => {
    const result = Array.isArray(storyConfig.backgrounds) ? (storyConfig.backgrounds as unknown as BackgroundConfig[]) : [];

    // [FIX] Reuse cached local background paths when the original source is remote.
    const withLocalPaths = result.map(bg => {
      const originalUrl = (bg as any).uri || bg.imageUrl || (bg as any).image_url || '';
      if (!originalUrl || !originalUrl.startsWith('http')) {
        return { ...bg, imageUrl: originalUrl };
      }

      // 野꺜筌앹빖留?野껋럥以?????(嚥≪뮇類??癒?뮉 ?癒?궚 URL)
      const validatedPath = validatedImagePaths[originalUrl] || originalUrl;

      return { ...bg, imageUrl: validatedPath, _originalUrl: originalUrl };
    });

    logChatDebug('[ChatScreen] backgrounds loaded:', withLocalPaths.length, withLocalPaths.map(bg => ({ id: bg.id, hasUrl: !!bg.imageUrl, isLocal: bg.imageUrl?.startsWith('file://') })));
    return withLocalPaths;
  }, [storyConfig, effectiveRouteStory, storyId, validatedImagePaths]);

  const { currentBackgroundUrl, checkBackgroundTrigger } = useBackgroundManager(backgrounds);

  useEffect(() => {
    logChatDebug('[ChatScreen] currentBackgroundUrl:', currentBackgroundUrl);
  }, [currentBackgroundUrl]);

  const routeUserName = useMemo(() => {
    const candidate = (renderableStory as Record<string, unknown> | undefined)?.userName;
    return typeof candidate === 'string' ? candidate.trim() : '';
  }, [renderableStory]);
  const authUserName = useAuthStore(state => state.user?.name ?? '');
  const profileUserName = useUserProfileStore(state => state.profile.name);
  const storyUserName = useMemo(() => {
    const configRecord = storyConfig as unknown as Record<string, unknown>;
    const rawUserSetting = configRecord?.userSetting ?? configRecord?.user_setting;
    const parsedUserSetting = typeof rawUserSetting === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(rawUserSetting);
          return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
        } catch {
          return {};
        }
      })()
      : (rawUserSetting && typeof rawUserSetting === 'object'
        ? rawUserSetting as Record<string, unknown>
        : {});
    const configUserName = parsedUserSetting.name;
    const protagonist = Array.isArray(storyConfig.characters)
      ? storyConfig.characters.find(character => Number(character.id) === 1)
      : undefined;

    return resolveChatUserName(
      routeUserName,
      typeof configUserName === 'string' ? configUserName : '',
      typeof protagonist?.name === 'string' ? protagonist.name : '',
    );
  }, [routeUserName, storyConfig]);
  const displayUserName = useMemo(() => {
    const localizedUserLabel = typeof t?.speakerUser === 'string'
      ? t.speakerUser.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
      : '';
    return getVisibleChatUserName(
      storyUserName,
      authUserName,
      profileUserName,
      localizedUserLabel,
      'Me',
    );
  }, [authUserName, profileUserName, storyUserName, t?.speakerUser]);
  useEffect(() => {
    logChatDebug('[ChatScreen] user name resolved:', {
      routeUserName,
      storyUserName,
      authUserName,
      profileUserName,
      displayUserName,
    });
  }, [authUserName, displayUserName, profileUserName, routeUserName, storyUserName]);

  const chatEngineOptions = useMemo(() => ({
    initialChapterIndex: routeCharacter ? 0 : routeLastChapterIndex,
    displayUserName,
    resumeMode: routeResumeMode,
    story: renderableStory as typeof routeStory,
    adapterSelection: routeAdapterSelection,
    enabled: isStoryReady,
  }), [displayUserName, isStoryReady, renderableStory, routeAdapterSelection, routeCharacter, routeLastChapterIndex, routeResumeMode]);

  const {
    messageState, streamingState, sessionState,
    sendMessage, selectChoice, bookmarkMessage, editMessage,
    reactToMessage, scrollToBottom, scrollToMessage,
    addEventHandler, removeEventHandler, flatListRef
  } = useChatEngineCore(storyId, storyConfig, chatEngineOptions);
  const inputLocked = !isStoryReady || isResolvingStory || messageState.isProcessingMessage || sessionState.isKVLoading;
  useEffect(() => {
    logChatDebug('[ChatScreen] readiness:', {
      hasValidRouteStory,
      isStoryReady,
      isResolvingStory,
      isKVLoading: sessionState.isKVLoading,
      isInteractiveChatReady: hasValidRouteStory && isStoryReady && !isResolvingStory && !sessionState.isKVLoading,
      messageCount: messageState.messages.length,
      characterCount: characters.length,
      engineWarmState,
      liveEngineState,
      effectiveEngineWarmState,
    });
  }, [characters.length, effectiveEngineWarmState, engineWarmState, hasValidRouteStory, isResolvingStory, isStoryReady, liveEngineState, messageState.messages.length, sessionState.isKVLoading]);

  const [drawerTab, setDrawerTab] = useState<DrawerTab>('characters');
  const [inputText, setInputText] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [activeActionMessageId, setActiveActionMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editModal, setEditModal] = useState({ visible: false, messageId: '', text: '' });
  const [bookmarkVisible, setBookmarkVisible] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [profileModal, setProfileModal] = useState<{ visible: boolean; type: 'character' | 'user'; charId?: number; }>({ visible: false, type: 'user' });
  const [allowSoftInput, setAllowSoftInput] = useState(false);
  const [bottomOverlayHeight, setBottomOverlayHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const isMountedRef = useRef(true);
  const scrollTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const textInputRef = useRef<TextInput | null>(null);
  const softInputReadyRef = useRef(false);
  const softInputUnlockAtRef = useRef(0);
  // [BUG FIX #13] Avoid duplicate initial auto-scroll bursts on the first layout pass.
  const hasInitialLayoutRef = useRef(false);
  const pendingEntryAnchorRef = useRef(true);
  const offsetYFromBottomRef = useRef(0);
  const scrollOffsetRef = useRef(0); // current scroll Y for keyboard compensation
  const isNearBottomRef = useRef(true); // tracks whether the list is effectively pinned to bottom
  const forceBottomFollowUntilRef = useRef(0);
  const autoScrollActiveRef = useRef(true);
  const manualScrollLockRef = useRef(false);
  const generationActiveRef = useRef(false);
  const kvStartStoryIdRef = useRef('');
  const kvStartModelIdRef = useRef('');

  const clearScheduledScrolls = useCallback(() => {
    if (scrollTimeoutsRef.current) {
      scrollTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      scrollTimeoutsRef.current.clear();
    }
  }, []);

  const engageManualScrollLock = useCallback(() => {
    manualScrollLockRef.current = true;
    autoScrollActiveRef.current = false;
    forceBottomFollowUntilRef.current = 0;
    clearScheduledScrolls();
  }, [clearScheduledScrolls]);

  const releaseManualScrollLock = useCallback(() => {
    manualScrollLockRef.current = false;
  }, []);

  const disableSoftInput = useCallback(() => {
    setAllowSoftInput(false);
    textInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const enableSoftInputByUserGesture = useCallback(() => {
    if (inputLocked || !softInputReadyRef.current) return;
    setAllowSoftInput(true);
  }, [inputLocked]);

  useEffect(() => {
    if (!allowSoftInput || inputLocked) return;
    // Wait until the soft input guard is fully released before requesting focus.
    if (!softInputReadyRef.current) return;
    const frameId = requestAnimationFrame(() => {
      if (!allowSoftInput || inputLocked || !softInputReadyRef.current) return;
      return;
    });
    return () => cancelAnimationFrame(frameId);
  }, [allowSoftInput, inputLocked]);

  const requestBottomFollow = useCallback((durationMs = 1400) => {
    forceBottomFollowUntilRef.current = Math.max(
      forceBottomFollowUntilRef.current,
      Date.now() + durationMs,
    );
  }, []);

  const shouldAutoFollowBottom = useCallback(() => {
    return isNearBottomRef.current || Date.now() < forceBottomFollowUntilRef.current;
  }, []);

  const jumpToBottom = useCallback((force = false) => {
    releaseManualScrollLock();
    if (force) {
      requestBottomFollow(1400);
    }
    autoScrollActiveRef.current = true;
    setActiveActionMessageId(null);
    setShowScrollToBottom(false);
    // [FIX] Inverted FlatList: offset 0 is visually perfectly at the latest message.
    flatListRef.current?.scrollToOffset({ offset: 0, animated: !force });
  }, [releaseManualScrollLock, requestBottomFollow]);

  // Sync scroll seamlessly when the keyboard affects list bottom padding
  // [FIX] Disabled manual scrolling. Inverted FlatList naturally anchors content to keyboard without jump/warping.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setIsKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setIsKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scheduleScrollToBottom = useCallback((delayMs: number, options?: { force?: boolean }) => {
    if (options?.force) {
      requestBottomFollow(Math.max(1200, delayMs + 900));
    }
    const timeoutId = setTimeout(() => {
      scrollTimeoutsRef.current.delete(timeoutId);
      if (options?.force || shouldAutoFollowBottom()) {
        jumpToBottom(options?.force);
      }
    }, delayMs);
    scrollTimeoutsRef.current.add(timeoutId);
  }, [jumpToBottom, requestBottomFollow, shouldAutoFollowBottom]);

  const queueBottomAnchorBurst = useCallback((options?: { force?: boolean; delays?: readonly number[] }) => {
    const delays = options?.delays ?? BOTTOM_FOLLOW_BURST_DELAYS;
    delays.forEach(delay => scheduleScrollToBottom(delay, { force: options?.force }));
  }, [scheduleScrollToBottom]);

  useEffect(() => {
    logChatDebug('[ChatScreen] myProfile:', {
      hasProfile: !!myProfile,
      hasPhoto: !!myProfile?.photo,
      hasAvatarUri: !!myProfile?.avatarUri,
      photo: myProfile?.photo,
      avatarUri: myProfile?.avatarUri
    });
  }, [myProfile]);
  const storyStartedModelId = useMemo(
    () => resolveStoryModelId(effectiveRouteStory as Record<string, unknown> | undefined),
    [effectiveRouteStory],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Use a ref to track if we currently only have intro messages, avoiding stale closures in event listeners
  const hasOnlyIntroMessagesRef = useRef(false);
  const hasMessagesRef = useRef(false);
  useEffect(() => {
    const msgs = messageState?.messages ?? [];
    hasMessagesRef.current = msgs.length > 0;
    hasOnlyIntroMessagesRef.current = msgs.length > 0 && msgs.every(m => m.isIntro);
  }, [messageState?.messages]);

  useEffect(() => {
    hasInitialLayoutRef.current = false;
    pendingEntryAnchorRef.current = true;
    offsetYFromBottomRef.current = 0;
    isNearBottomRef.current = true;
    autoScrollActiveRef.current = true;
    manualScrollLockRef.current = false;
    generationActiveRef.current = false;
    forceBottomFollowUntilRef.current = 0;
    setBottomOverlayHeight(0);
    setShowScrollToBottom(false);
    // [FIX] Removed requestBottomFollow(2000) which forced scrolling down even when only intro was present
  }, [storyId]);

  useEffect(() => {
    generationActiveRef.current = liveEngineState === 'generating' || !!messageState.isProcessingMessage || !!streamingState.isActive;
  }, [liveEngineState, messageState.isProcessingMessage, streamingState.isActive]);

  useEffect(() => {
    if (!storyId) {
      kvStartStoryIdRef.current = '';
      kvStartModelIdRef.current = '';
      return;
    }

    if (kvStartStoryIdRef.current !== storyId) {
      kvStartStoryIdRef.current = storyId;
      kvStartModelIdRef.current = storyStartedModelId || activeModelId || '';
      return;
    }

    if (!kvStartModelIdRef.current && (storyStartedModelId || activeModelId)) {
      kvStartModelIdRef.current = storyStartedModelId || activeModelId || '';
    }
  }, [storyId, storyStartedModelId, activeModelId]);

  const loadedModelId = llamaEngine.getLoadedModelId();
  const liveModelId = loadedModelId ?? activeModelId;
  const kvStartModelId = kvStartModelIdRef.current || storyStartedModelId || activeModelId;
  const modelBadge = useMemo(() => getModelBadgeMeta(liveModelId, t), [liveModelId, t]);
  const kvStartBadge = useMemo(() => getModelBadgeMeta(kvStartModelId, t), [kvStartModelId, t]);

  // [BUG FIX] 筌뤴뫀???븍뜆?ょ㎉?揶쏅Ŋ? ?????뵝
  useEffect(() => {
    if (!storyStartedModelId || !activeModelId) return;
    if (storyStartedModelId === activeModelId) return;
    // Notify only once when the active model differs from the story's starting model.
    const notifiedKey = `model_notified_${storyId}`;
    if (appStorage.getBoolean(notifiedKey)) return;

    const storyModel = getModelBadgeMeta(storyStartedModelId, t);
    if (!storyModel) return;
    (async () => {
      try {
        const notificationModule = await import('../../services/NotificationService');
        const msgs = notificationModule.MODEL_SWITCH_MESSAGES[appLang] ?? notificationModule.MODEL_SWITCH_MESSAGES.en;
        await notificationModule.default.displayLocal({
          type: 'model_switch_required',
          title: msgs.title,
          body: msgs.body(storyModel.fullLabel),
          data: {
            targetScreen: 'MyPage',
            currentModelId: activeModelId,
            requiredModelId: storyStartedModelId,
          },
        });
      } catch (error) {
        warnChatDebug('[ChatScreen] model switch notification skipped:', error);
      }
    })();
    appStorage.set(notifiedKey, true);
  }, [storyStartedModelId, activeModelId, storyId, appLang, t]);

  const kvStatus = useMemo(() => {
    if (!activeModelId && !kvStartBadge) {
      return { label: t.modelNone, tone: 'red' as const };
    }
    if (isResolvingStory || sessionState.isKVLoading) {
      return kvStartBadge
        ? {
          label: kvStartBadge.fullLabel,
          tone: kvStartBadge.tone
        }
        : { label: t.kvLoading, tone: 'gold' as const };
    }
    if (effectiveEngineWarmState === 'warming') {
      return { label: t.modelLoading, tone: 'silver' as const };
    }
    if (effectiveEngineWarmState === 'error') {
      return { label: t.modelError, tone: 'red' as const };
    }
    if (kvStartBadge) {
      return {
        label: kvStartBadge.fullLabel,
        tone: kvStartBadge.tone
      };
    }
    return { label: t.modelPending, tone: 'neutral' as const };
  }, [activeModelId, effectiveEngineWarmState, isResolvingStory, kvStartBadge, sessionState.isKVLoading, t]);

  const topLoadingLabel = useMemo(() => {
    if (isResolvingStory || !isStoryReady) {
      return t.preparingStory;
    }
    return kvStatus.label;
  }, [isResolvingStory, isStoryReady, kvStatus.label, t]);

  const uiCharacters = useMemo(() => {
    const byId = new Map<number, any>();

    characters.forEach((character: any) => {
      const numericId = Number(character?.id);
      if (!Number.isFinite(numericId) || numericId < 2) return;
      byId.set(numericId, {
        ...character,
        id: numericId,
        name: character?.name ?? `Character ${numericId}`,
        profileUrl: character?.imageUris?.[0] || character?.profileUrl || character?.profile_url || '',
      });
    });

    [...(messageState.messages ?? [])]
      .reverse()
      .forEach(message => {
        const numericId = Number(message.characterId);
        if (!Number.isFinite(numericId) || numericId < 2 || byId.has(numericId)) return;
        byId.set(numericId, {
          id: numericId,
          name: message.characterName ?? `Character ${numericId}`,
          profileUrl: message.characterProfileUrl ?? '',
        });
      });

    return Array.from(byId.values()).sort((left, right) => Number(left.id) - Number(right.id));
  }, [characters, messageState.messages]);

  const profileData = useMemo(() => {
    if (!profileModal.visible) return null;
    if (profileModal.type === 'user') {
      return { images: userCharacterImages, name: displayUserName, age: '', gender: '', traits: '', personality: '', personalityExample: '', description: '' };
    }
    const char = uiCharacters.find((c: any) => Number(c.id) === profileModal.charId) ?? uiCharacters[0];
    if (!char) return null;
    const rawImageUris = (char as StoryCharacter).imageUris;
    const imageUris = Array.isArray(rawImageUris)
      ? rawImageUris.filter(Boolean)
      : [];
    const profileUrl = char.profileUrl || (char as any).profile_url || '';
    return {
      images: imageUris.length > 0 ? imageUris : (profileUrl ? [profileUrl] : []),
      name: char.name,
      age: (char as StoryCharacter).age ?? '',
      gender: (char as StoryCharacter).gender ?? '',
      traits: (char as StoryCharacter).traits ?? '',
      appearance: (char as StoryCharacter).appearance ?? '',
      personality: char.personality ?? '',
      personalityExample: (char as StoryCharacter).personalityExample ?? '',
      setting: (char as StoryCharacter).setting ?? '',
      description: (char as StoryCharacter).description ?? ''
    };
  }, [displayUserName, profileModal, uiCharacters, userCharacterImages]);

  const kvHints = useMemo(() => (
    [t.loadingHint1, t.loadingHint2, t.loadingHint3]
  ), [t]);

  useEffect(() => {
    if (hasValidRouteStory) return;
    ToastService.error(t.invalidAccess);
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [hasValidRouteStory, navigation, t]);

  useEffect(() => {
    if (!storyResolveFailed || !hasValidRouteStory || isStoryReady) return;
    ToastService.error(t.storyLoadFailed);
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [hasValidRouteStory, isStoryReady, navigation, storyResolveFailed, t]);

  useEffect(() => {
    if (!kvStartBadge) return;
    // KV ??뽰삂 獄쏄퀣?揶쎛 ??됱뱽 ??甕곕뜆肉????곕뱜 ??낅쑓??꾨뱜
  }, [kvStartBadge]);

  useEffect(() => {
    return () => clearScheduledScrolls();
  }, [clearScheduledScrolls]);

  useEffect(() => {
    return () => disableSoftInput();
  }, [disableSoftInput]);

  useEffect(() => {
    if (hasValidRouteStory && isStoryReady && !isResolvingStory && !sessionState.isKVLoading) return;
    disableSoftInput();
  }, [disableSoftInput, hasValidRouteStory, isResolvingStory, isStoryReady, sessionState.isKVLoading]);

  useEffect(() => {
    const onMessage = (e: any) => {
      if (e.type === 'message_sent') {
        releaseManualScrollLock();
        queueBottomAnchorBurst({ force: true });
        return;
      }
      if (e.type === 'streaming_started') {
        if (manualScrollLockRef.current) return;
        queueBottomAnchorBurst({ force: true, delays: [0, 96] });
        return;
      }
      if (e.type === 'message_received') {
        if (manualScrollLockRef.current) return;
        if (shouldAutoFollowBottom() && !hasOnlyIntroMessagesRef.current) {
          queueBottomAnchorBurst({ force: Date.now() < forceBottomFollowUntilRef.current, delays: [40, 160] });
        }
        const msgs = e.payload?.messages || [e.payload?.message];
        for (const msg of msgs) {
          const content = msg?.content?.trim();
          if (content) {
            checkBackgroundTrigger(content).catch(() => { });
          }
        }
      }
      if (e.type === 'session_restored') {
        pendingEntryAnchorRef.current = true;
        
        if (hasOnlyIntroMessagesRef.current) {
          forceBottomFollowUntilRef.current = 0;
          clearScheduledScrolls();
          flatListRef.current?.scrollToEnd({ animated: false });
        } else {
          queueBottomAnchorBurst({ force: true, delays: [0, 160, 360] });
        }
      }
    };
    addEventHandler(onMessage);
    return () => removeEventHandler(onMessage);
  }, [
    addEventHandler,
    checkBackgroundTrigger,
    releaseManualScrollLock,
    queueBottomAnchorBurst,
    removeEventHandler,
    shouldAutoFollowBottom,
    clearScheduledScrolls,
  ]);

  const closeActionMenu = useCallback(() => {
    setActiveActionMessageId(null);
  }, []);

  const toggleActionMenu = useCallback((messageId: string) => {
    setActiveActionMessageId(current => current === messageId ? null : messageId);
  }, []);

  const handleSend = useCallback(() => {
    if (inputLocked) return;
    if (!inputText.trim()) return;
    closeActionMenu();
    releaseManualScrollLock();
    autoScrollActiveRef.current = true;
    sendMessage(inputText, replyTo);
    setInputText('');
    setReplyTo(null);
    queueBottomAnchorBurst({ force: true });
  }, [closeActionMenu, inputLocked, inputText, queueBottomAnchorBurst, releaseManualScrollLock, replyTo, sendMessage]);

  const handleStopGeneration = useCallback(() => {
    llamaEngine.stopGeneration().catch(() => { });
  }, []);

  useFocusEffect(
    useCallback(() => {
      // [FIX] Reset soft-input readiness on focus entry so keyboard state cannot leak across screen transitions.
      // disableSoftInput() runs before dismiss/blur hooks finish, so we guard the next focus attempt until the lock expires.
      // This keeps TextInput focus and keyboard reopening from racing each other during screen entry.
      softInputReadyRef.current = false;
      pendingEntryAnchorRef.current = true;
      if (hasMessagesRef.current) {
        if (!hasOnlyIntroMessagesRef.current) {
          requestBottomFollow(1800);
        } else {
          clearScheduledScrolls();
          flatListRef.current?.scrollToEnd({ animated: false });
        }
      }
      // [FIX] Hold soft input unlock briefly to avoid reopening the keyboard during entry animations.
      softInputUnlockAtRef.current = Date.now() + 800;
      setAllowSoftInput(false);
      Keyboard.dismiss();
      textInputRef.current?.blur();
      const entryTimer = setTimeout(() => {
        if (hasMessagesRef.current) {
          if (!hasOnlyIntroMessagesRef.current) {
            queueBottomAnchorBurst({ force: true, delays: [0, 120, 320] });
          } else {
            clearScheduledScrolls();
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }
      }, 60);
      const readyFrame = requestAnimationFrame(() => {
        softInputReadyRef.current = true;
      });
      const fallbackTimer = setTimeout(() => {
        softInputReadyRef.current = true;
      }, 320);
      return () => {
        clearTimeout(entryTimer);
        cancelAnimationFrame(readyFrame);
        clearTimeout(fallbackTimer);
        softInputReadyRef.current = false;
        softInputUnlockAtRef.current = 0;
        disableSoftInput();
      };
    }, [disableSoftInput, queueBottomAnchorBurst, requestBottomFollow]),
  );

  const handleChoiceSelect = useCallback((choice: any) => {
    closeActionMenu();
    selectChoice(choice);
  }, [closeActionMenu, selectChoice]);

  const handleScroll = useCallback((event: any) => {
    const { contentOffset } = event.nativeEvent;
    scrollOffsetRef.current = contentOffset.y; // track for keyboard compensation
    // [FIX] With inverted list, contentOffset.y perfectly represents distance from bottom newest message.
    const distanceFromBottom = contentOffset.y;
    offsetYFromBottomRef.current = distanceFromBottom;
    isNearBottomRef.current = distanceFromBottom < BOTTOM_FOLLOW_THRESHOLD;
    if (isNearBottomRef.current) {
      releaseManualScrollLock();
      autoScrollActiveRef.current = true;
    }
    setShowScrollToBottom(currentValue => {
      if (distanceFromBottom > 220) return true;
      if (distanceFromBottom < 72) return false;
      return currentValue;
    });
    closeActionMenu();
  }, [closeActionMenu, releaseManualScrollLock]);

  const handleEditConfirm = () => {
    closeActionMenu();
    if (editModal.messageId) editMessage(editModal.messageId, editModal.text);
    setEditModal({ visible: false, messageId: '', text: '' });
  };

  const handleCopy = (content: string) => {
    clipboardSetString(content);
    ToastService.success(t.copiedToClipboard);
  };

  const openDrawer = useCallback((tab: DrawerTab = drawerTab) => {
    closeActionMenu();
    disableSoftInput();
    setDrawerTab(tab);
    setIsDrawerOpen(true);
  }, [closeActionMenu, disableSoftInput, drawerTab]);

  const openBookmarks = useCallback(() => {
    closeActionMenu();
    disableSoftInput();
    setIsDrawerOpen(false);
    setBookmarkVisible(true);
  }, [closeActionMenu, disableSoftInput]);

  const handleRestartFromBeginning = useCallback(() => {
    setIsDrawerOpen(false);
    if (!storyId) return;
    const title = t.startStory;
    const message = t.resetConfirmMsg;
    const cancelLabel = t.cancel;
    const confirmLabel = t.reset;
    const successMessage = t.resetSuccess;
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => {
          (async () => {
            try {
              const storyDataCleanup = await import('../../utils/storyDataCleanup');
              await storyDataCleanup.resetStoryToDownloadedBaseline(storyId);
              ToastService.success(successMessage);
            } catch {
              ToastService.error(t.resetFailed);
            }
          })();
        },
      },
    ]);
  }, [storyId, t]);

  const openProfile = useCallback((characterId?: string) => {
    closeActionMenu();
    setProfileModal({
      visible: true,
      type: characterId ? 'character' : 'user',
      charId: characterId ? Number(characterId) : undefined,
    });
  }, [closeActionMenu]);

  const closeProfileSheet = useCallback(() => {
    setProfileModal(current => ({ ...current, visible: false }));
  }, []);

  const focusComposerFromAction = useCallback(() => {
    closeActionMenu();
    closeProfileSheet();
    if (inputLocked) return;
    enableSoftInputByUserGesture();
    const focusTimer = setTimeout(() => {
      scrollTimeoutsRef.current.delete(focusTimer);
      if (!isMountedRef.current) return;
      textInputRef.current?.focus();
    }, 180);
    scrollTimeoutsRef.current.add(focusTimer);
  }, [closeActionMenu, closeProfileSheet, enableSoftInputByUserGesture, inputLocked]);

  const openCharactersFromProfile = useCallback(() => {
    closeProfileSheet();
    openDrawer('characters');
  }, [closeProfileSheet, openDrawer]);

  // [FIX] useMemo嚥?揶쏅Ŋ??????쐭筌띾뜄??reverse+find ??쑴??獄쎻뫗?
  const lastAiMsg = useMemo(
    () => [...messageState.messages].reverse().find(m => m.role === 'ai'),
    [messageState.messages],
  );
  const activeChoices = lastAiMsg?.choices && lastAiMsg.choices.length > 0 && !lastAiMsg.choices.some(c => c.isSelected) ? lastAiMsg.choices : null;
  const messages = messageState?.messages ?? [];
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const hasIntroSeededMessages = useMemo(
    () => messages.some(message => (
      message.isIntro
      || String(message.setId ?? '').startsWith('intro_')
      || String(message.id ?? '').startsWith('intro_')
    )),
    [messages],
  );
  const listData = useMemo(
    () => (
      hasIntroSeededMessages
        ? [...reversedMessages, { id: '__chat_ai_notice__', type: 'ai_notice' } as ChatListNoticeItem]
        : reversedMessages
    ),
    [hasIntroSeededMessages, reversedMessages],
  );
  const hasOnlyIntroMessages = useMemo(
    () => messages.length > 0 && messages.every(message => message.isIntro),
    [messages],
  );
  const generatingCharacter = messageState.isProcessingMessage
    ? uiCharacters.find((c: any) => Number(c.id) >= 2)
    : null;
  const sendPulseAnimStyle = useAnimatedStyle(() => ({}));
  const isInteractiveChatReady = hasValidRouteStory && isStoryReady && !isResolvingStory && !sessionState.isKVLoading;


  useEffect(() => {
    logChatDebug('[ChatScreen] composer:', {
      isInteractiveChatReady,
      inputLocked,
      activeChoiceCount: activeChoices?.length ?? 0,
      hasOnlyIntroMessages,
      bottomOverlayHeight,
      bottomSafeInset,
    });
  }, [activeChoices?.length, bottomOverlayHeight, bottomSafeInset, hasOnlyIntroMessages, inputLocked, isInteractiveChatReady]);
  const drawerSummary = useMemo(() => (
    <View style={styles.drawerSummaryCard}>
      <Text style={styles.drawerSummaryTitle} numberOfLines={1}>
        {screenTitle}
      </Text>
      <View style={styles.drawerBadgeRow}>
        {modelBadge ? (
          <View
            style={[
              styles.drawerBadge,
              modelBadge.tone === 'gold' && styles.drawerBadgeGold,
              modelBadge.tone === 'silver' && styles.drawerBadgeSilver,
              modelBadge.tone === 'red' && styles.drawerBadgeRed,
            ]}
          >
            <Text style={styles.drawerBadgeText}>{modelBadge.label}</Text>
          </View>
        ) : null}
        <View
          style={[
            styles.drawerBadge,
            kvStatus.tone === 'gold' && styles.drawerBadgeGold,
            kvStatus.tone === 'silver' && styles.drawerBadgeSilver,
            kvStatus.tone === 'red' && styles.drawerBadgeRed,
          ]}
        >
          <Text style={styles.drawerBadgeText} numberOfLines={1}>{kvStatus.label}</Text>
        </View>
      </View>
      <View style={styles.drawerQuickActionRow}>
        <TouchableOpacity style={styles.drawerQuickAction} onPress={openBookmarks}>
          <BookmarkIcon size={15} color="#F3D06F" />
          <Text style={styles.drawerQuickActionText}>Bookmarks</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [kvStatus.label, kvStatus.tone, modelBadge, openBookmarks, screenTitle]);

  if (!hasValidRouteStory) {
    return (
      <AndroidScreen style={styles.container} animated={false}>
        <View style={styles.invalidRouteFiller} />
      </AndroidScreen>
    );
  }

  const renderDrawerContent = () => {
    switch (drawerTab) {
      case 'characters': return (
        <CharacterPanel
          characters={uiCharacters as any}
          onCharacterSelect={id => {
            setIsDrawerOpen(false);
            openProfile(String(id));
          }}

        />
      );
      case 'history': return (
        <HistoryPanel
          messages={messageState.messages as any}
          userName={displayUserName}
          onMessageSelect={id => {
            const idx = messages.findIndex(m => m.id === id);
            if (idx >= 0) {
              const invertedIdx = messages.length - 1 - idx;
              flatListRef.current?.scrollToIndex?.({ index: invertedIdx, animated: true, viewPosition: 0.3 });
            }
            setIsDrawerOpen(false);
          }}
        />
      );
      case 'settings': return (
        <SettingsPanel
          onSettingChange={() => { }}
          onRestartStory={handleRestartFromBeginning}
          restartLabel={t.startStory}
        />
      );
      default: return null;
    }
  };

  return (
    <AndroidScreen style={styles.container} animated={false} withTopInset={false}>
      {currentBackgroundUrl ? <AnimatedBackground imageUrl={currentBackgroundUrl} /> : null}
      <OfflineBanner />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlashList estimatedItemSize={120}
          inverted
          ref={flatListRef}
          style={{ flex: 1 }}
          data={listData}
          keyExtractor={m => m.id}
          renderItem={({ item, index }) => {
          if ((item as ChatListNoticeItem).type === 'ai_notice') {
            return (
              <View style={styles.aiNoticeWrap}>
                <Text numberOfLines={1} style={styles.aiNoticeText}>
                  {t.chatAiGeneratedNotice}
                </Text>
              </View>
            );
          }

          // [FIX] Reversed indices map differently.
          // In reversed list, 'item' is newest at 0. 'index + 1' is historically previous message (older).
          // 'index - 1' is historically next message (newer).
          const previousMessage = index < reversedMessages.length - 1 ? reversedMessages[index + 1] : undefined;
          const nextMessage = index > 0 ? reversedMessages[index - 1] : undefined;

          // characterImageUris lookup comes from the normalized character list.
          const msg = item as any;
          const characterImageUris = msg.characterId != null
            ? characters.find(c => Number(c.id) === Number(msg.characterId))?.imageUris
            : undefined;

          return (
            <ChatMessage
              message={msg}
              isOwn={msg.role === 'user'}
              isStreaming={msg.isStreaming ?? false}
              onBookmark={() => bookmarkMessage(msg.id)}
              onCopy={handleCopy}
              onChoiceSelect={handleChoiceSelect}
              onEdit={(id, text) => setEditModal({ visible: true, messageId: id, text })}
              actionsVisible={activeActionMessageId === msg.id}
              onToggleActions={toggleActionMenu}
              onCloseActions={closeActionMenu}
              onReact={(_, emoji) => reactToMessage(msg.id, emoji)}
              onReply={() => {
                closeActionMenu();
                setReplyTo({
                  id: msg.id,
                  role: msg.role,
                  text: msg.role === 'user'
                    ? msg.content
                    : formatChatTextForDisplay(msg.content ?? '', displayUserName),
                  senderName: msg.characterName ?? displayUserName,
                });
              }}
              onProfilePress={openProfile}
              storyId={storyId}
              charId={msg.characterId ? Number(msg.characterId) : undefined}
              groupPosition={getMessageGroupPosition(previousMessage, msg as any, nextMessage)}
              narratorPosition={getNarratorGroupPosition(previousMessage, msg as any, nextMessage)}
              userAvatarUri={resolvedUserAvatarUri}
              userName={displayUserName}
              characterImageUris={characterImageUris}
            />
          );
        }}
          contentContainerStyle={{
            paddingHorizontal: 0,
            paddingVertical: 10,

              flexGrow: 1,
              // [FIX] Inverted styling swaps top and bottom padding semantics.
              paddingBottom: HEADER_OVERLAY_HEIGHT + topInset + 12,
              paddingTop: 16,
          }}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          if (generationActiveRef.current) {
            engageManualScrollLock();
          } else {
            autoScrollActiveRef.current = false;
          }
          closeActionMenu();
        }}
        onLayout={() => {
          if (!hasInitialLayoutRef.current) {
            hasInitialLayoutRef.current = true;
            if (messages.length > 0) {
              if (hasOnlyIntroMessages) {
                forceBottomFollowUntilRef.current = 0;
                clearScheduledScrolls();
                flatListRef.current?.scrollToEnd({ animated: false });
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
              } else {
                queueBottomAnchorBurst({ force: true, delays: [0, 96] });
              }
            }
          }
        }}
        onContentSizeChange={() => {
          if (messages.length === 0) return;
          if (pendingEntryAnchorRef.current) {
            pendingEntryAnchorRef.current = false;
            if (hasOnlyIntroMessages) {
              forceBottomFollowUntilRef.current = 0;
              clearScheduledScrolls();
              flatListRef.current?.scrollToEnd({ animated: false });
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
            } else {
              queueBottomAnchorBurst({ force: true, delays: [0, 96, 240] });
            }
            return;
          }
          if (hasOnlyIntroMessages) {
            forceBottomFollowUntilRef.current = 0;
            clearScheduledScrolls();
            flatListRef.current?.scrollToEnd({ animated: false });
            return;
          }
          // Auto-scroll: always follow bottom unless user manually scrolled away
          if (!manualScrollLockRef.current && (autoScrollActiveRef.current || shouldAutoFollowBottom())) {
            queueBottomAnchorBurst({ force: true, delays: [0, 48, 140] });
          }
        }}
        scrollEventThrottle={32}
        initialNumToRender={12}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        ListEmptyComponent={
          ((isResolvingStory || !isStoryReady || sessionState.isKVLoading) && hasValidRouteStory) ? (

              <View style={{ flex: 1, padding: 16, paddingTop: 100, gap: 24, justifyContent: 'flex-end', flexDirection: 'column-reverse' }}>
                <SkeletonItem height={64} width="70%" borderRadius={16} />
                <SkeletonItem height={100} width="85%" borderRadius={20} style={{ alignSelf: 'flex-end' }} />
                <SkeletonItem height={80} width="60%" borderRadius={16} />
                <SkeletonItem height={140} width="90%" borderRadius={20} style={{ alignSelf: 'flex-end' }} />
              </View>

          ) : null

        }
        ListFooterComponent={null}
      />

      <Animated.View
        style={styles.headerOverlay}
        pointerEvents="box-none"
      >
        <ChatHeader
          title={screenTitle}
          characters={uiCharacters as any}
          isSoundEnabled={false}
          modelBadgeLabel={modelBadge?.label}
          modelBadgeTone={modelBadge?.tone}
          statusLabel={kvStatus.label}
          statusTone={kvStatus.tone}
          onBack={() => {
            closeActionMenu();
            if (inputText.trim()) {
              setLeaveConfirm(true);
              return;
            }
            navigation.goBack();
          }}
          onMenu={() => openDrawer()}
          onCharacters={() => openDrawer('characters')}
          onSettings={() => openDrawer('settings')}
          onSoundToggle={() => { }}
          topInset={topInset}
        />
      </Animated.View>

      {(isResolvingStory || !isStoryReady || sessionState.isKVLoading) && hasValidRouteStory ? (
        <View pointerEvents="none" style={[styles.topLoadingBannerWrap, { top: topInset + HEADER_OVERLAY_HEIGHT + 4 }]}>
          <View style={styles.topLoadingBanner}>
            <LoadingSpinnerLottie visible={true} size={28} />
            <Text style={styles.topLoadingBannerText} numberOfLines={1}>
              {sessionState.isKVLoading ? (kvHints[0] ?? topLoadingLabel) : topLoadingLabel}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Scroll to Bottom FAB Removed per user request */}

      {isInteractiveChatReady ? (
        <View style={{ backgroundColor: 'rgba(8, 10, 15, 0.85)', paddingTop: 4, paddingHorizontal: 6, paddingBottom: 4 }}>
          {activeChoices ? (
            <ChoicePanel choices={activeChoices} onSelect={handleChoiceSelect} userName={displayUserName} />
          ) : (
            <ChatInputBar
              ref={textInputRef}
              stickToKeyboard={false}
              userInput={inputText}
              onChangeText={setInputText}
              onSend={handleSend}
              onFocus={() => closeActionMenu()}
              isTyping={messageState.isProcessingMessage}
              engineWarmState={effectiveEngineWarmState}
              activeChoiceEvent={null}
              charName={generatingCharacter?.name}
              charPulseAnimStyle={sendPulseAnimStyle}
              deleteMode={false}
              selectedCount={0}
              onCancelDelete={() => { }}
              onConfirmDelete={() => { }}
              onStopGeneration={handleStopGeneration}
              replyTarget={replyTo}
              onCancelReply={() => {
                closeActionMenu();
                setReplyTo(null);
              }}
              accentColor="#D4A853"
              textInputProps={{
                nativeID: CHAT_INPUT_NATIVE_ID,
                autoFocus: false,
                blurOnSubmit: false,
                returnKeyType: 'send',
                caretHidden: !allowSoftInput,
                showSoftInputOnFocus: allowSoftInput,
                onSubmitEditing: () => {
                  if (!inputLocked && inputText.trim()) {
                    handleSend();
                  }
                },
                onPressIn: () => {
                  closeActionMenu();
                  if (Date.now() < softInputUnlockAtRef.current) {
                    disableSoftInput();
                    return;
                  }
                  if (!softInputReadyRef.current) {
                    disableSoftInput();
                    return;
                  }
                  if (!allowSoftInput) {
                    enableSoftInputByUserGesture();
                    requestAnimationFrame(() => {
                      textInputRef.current?.focus();
                    });
                    return;
                  }
                  textInputRef.current?.focus();
                },
                onBlur: () => setAllowSoftInput(false),
                onFocus: () => {
                  closeActionMenu();
                  if (!softInputReadyRef.current || inputLocked || !allowSoftInput) {
                    disableSoftInput();
                  }
                },
              }}
            />
          )}
        </View>
      ) : null}
      </KeyboardAvoidingView>

      <View style={{ height: Math.max(bottomSafeInset, 0), backgroundColor: 'rgba(8, 10, 15, 0.85)' }} />



      <EditModal
        visible={editModal.visible}
        text={editModal.text}
        onChangeText={nextText => setEditModal(p => ({ ...p, text: nextText }))}
        onCancel={() => setEditModal({ visible: false, messageId: '', text: '' })}
        onConfirm={handleEditConfirm}
      />

      <ConfirmModal
        visible={leaveConfirm}
        title={t.leaveChat}
        message={t.unsavedWarning}
        onRequestClose={() => setLeaveConfirm(false)}
        actions={[
          { label: t.leaveConfirmTitle, variant: 'danger', onPress: () => { setLeaveConfirm(false); navigation.goBack(); } },
          { label: t.leaveConfirmCancel, variant: 'default', onPress: () => setLeaveConfirm(false) },
        ]}
      />

      <BookmarkList
        visible={bookmarkVisible}
        onClose={() => setBookmarkVisible(false)}
        messages={messageState.messages as any}
        userName={displayUserName}
        onMessageSelect={id => {
          const idx = messages.findIndex(m => m.id === id);
          if (idx >= 0) {
            const invertedIdx = messages.length - 1 - idx;
            flatListRef.current?.scrollToIndex?.({ index: invertedIdx, animated: true, viewPosition: 0.3 });
          }
          setBookmarkVisible(false);
          closeActionMenu();
        }}
        flatListRef={flatListRef as any}
        isInverted={true}
      />

      {profileData && profileModal.type === 'user' && (
        <ProfileSheet
          visible={profileModal.visible}
          onClose={closeProfileSheet}
          primaryActionLabel={t.bookmark}
          onPrimaryAction={() => {
            closeProfileSheet();
            openBookmarks();
          }}
          {...profileData}
        />
      )}

      {profileData && profileModal.type === 'character' && (
        <PremiumImageViewer
          visible={profileModal.visible}
          images={profileData.images || []}
          initialIndex={0}
          charInfo={{
            name: profileData.name || '',
            age: profileData.age || '',
            gender: profileData.gender || '',
            hideStats: true,
            hideStoryMeta: true,
            hideActions: true,
            detailRows: (() => {
              const pickText = (...vals: any[]) => vals.filter(v => typeof v === 'string' && v.trim().length > 0)[0] || '';
              return [
                {
                  label: '',
                  value: pickText(profileData.appearance, profileData.traits),
                },
                {
                  label: '',
                  value: pickText(profileData.personality, profileData.description, profileData.setting),
                },
              ].filter(row => row.value.trim().length > 0);
            })()
          }}
          onClose={closeProfileSheet}
        />
      )}

      <ChatDrawer
        isVisible={isDrawerOpen}
        currentTab={drawerTab}
        width={DRAWER_WIDTH}
        onClose={() => {
          disableSoftInput();
          setIsDrawerOpen(false);
        }}
        onTabChange={setDrawerTab}
        summary={drawerSummary}
        topInset={topInset}
      >
        {renderDrawerContent()}
      </ChatDrawer>

    </AndroidScreen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  keyboardArea: { flex: 1 },
  invalidRouteFiller: { flex: 1 },
  messageListContent: {
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topLoadingBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 19,
  },
  topLoadingBanner: {
    maxWidth: '88%',
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10151E',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.16)',
  },
  topLoadingBannerText: {
    color: '#F0D27E',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  scrollToBottomFab: {
    position: 'absolute',
    right: 16,
    zIndex: 21,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 16, 24, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  bottomOverlay: {
    paddingHorizontal: 8,
    paddingTop: 4,
    gap: 4,
    backgroundColor: 'rgba(8, 10, 15, 0.75)', // semi-transparent
  },
  bottomOverlayAndroid: {
    backgroundColor: 'rgba(8, 10, 15, 0.75)',
  },
  bottomSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
  },
  bottomStickyAndroid: {
    elevation: 18,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111722',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  replyBarAccent: { width: 3, height: 38, backgroundColor: '#D4A853', borderRadius: 2, marginRight: 10 },
  replyBarBody: { flex: 1 },
  replyBarMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  replyBarName: { fontSize: 11, color: '#F0D27E', fontFamily: Typography.fontFamily.semibold },
  replyBarText: { fontSize: 12, color: '#BEC7D7', lineHeight: 17 },
  replyBarClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 5,
    backgroundColor: '#0D0D14',
  },
  composerShell: {
    flex: 1,
    minHeight: 38,
    borderRadius: 18,
    backgroundColor: '#171D28',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingRight: 8,
    justifyContent: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#0F141B',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    minHeight: 36,
    backgroundColor: 'transparent',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F0F0F5',
    fontSize: 14,
    maxHeight: 90,
    textAlignVertical: 'top',
  },
  charCountBadge: {
    alignSelf: 'flex-end',
    marginTop: -2,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  charCountText: {
    fontSize: 10,
    color: '#929CB0',
    fontFamily: Typography.fontFamily.medium,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D4A853',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sendBtnDisabled: {
    backgroundColor: '#25252F',
    borderColor: 'rgba(255,255,255,0.03)',
  },
  drawerSummaryCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#10151E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: 10,
  },
  drawerSummaryTitle: {
    color: '#F4F7FB',
    fontSize: 16,
    fontFamily: Typography.fontFamily.semibold,
  },
  drawerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  drawerBadge: {
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    backgroundColor: '#171D28',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  drawerBadgeGold: {
    backgroundColor: 'rgba(212,168,83,0.18)',
    borderColor: 'rgba(212,168,83,0.30)',
  },
  drawerBadgeSilver: {
    backgroundColor: 'rgba(203,213,225,0.16)',
    borderColor: 'rgba(203,213,225,0.26)',
  },
  drawerBadgeRed: {
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderColor: 'rgba(239,68,68,0.26)',
  },
  drawerBadgeText: {
    color: '#F4F7FB',
    fontSize: 10,
    fontFamily: Typography.fontFamily.semibold,
  },
  drawerQuickActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  drawerQuickAction: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  drawerQuickActionText: {
    color: '#E4E9F2',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  aiNoticeWrap: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 16, 24, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aiNoticeText: {
    color: '#AEB7C8',
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,5,9,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000
  },
  loadingText: {
    color: '#D4A853',
    fontSize: 16,
    marginTop: 12,
    fontFamily: Typography.fontFamily.bold
  }
});
