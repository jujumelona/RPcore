/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/StoryEditorScreen.tsx
// 전체 개선

import { Typography } from '../../constants/tokens';
import React, { useState, useRef, useCallback, startTransition, useEffect, useMemo, useDeferredValue } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Dimensions, Platform, PermissionsAndroid, Modal,
  KeyboardAvoidingView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, runOnJS, FadeInDown } from 'react-native-reanimated';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
// [sanitized comment]
import { useMutation, useQueryClient } from '@tanstack/react-query';
// [sanitized comment]
import * as Sentry from '@sentry/react-native';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import { Image } from 'expo-image';
import { ToastService } from '../../components/Toast';
import { useLanguageStore } from '../../store/languageStore';
import { useUserProfileStore } from '../../store/userProfileStore';
import { useAuthStore } from '../../store/authStore';
import { editorToSavePayload } from '../../utils/PromptEngine';
import { appStorage, storage as AsyncStorage } from '../../utils/storage';
import { launchImageLibrary } from 'react-native-image-picker';
import { clipboardGetString, clipboardSetString } from '../../utils/ClipboardUtils';
import { LANGUAGE_LIST, Language } from '../../i18n/languages';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, GripVertical, Languages, X, XCircle, ChevronUp, ChevronDown, ArrowRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput as RNTextInput } from 'react-native';
// [sanitized comment]
import { nitroCompressImage } from '../../native/NitroImageProcessor';
import { AIAssistantModal } from './components/AIAssistantModal';
import { authedFetch } from '../../utils/authedFetch';
import { StoryAPI } from '../../api/StoryAPI';
import { getModelBadgeMeta, resolveStoryModelId } from '../../utils/storyModelMeta';
import { sanitizeNullableImageUrl } from '../../utils/imageUrlPolicy';
import { STORY_EDITOR_GENRE_IDS, getStoryGenreOptions, normalizeStoryGenre } from '../../utils/storyGenres';
import { getStoryStylePresetOptions, normalizeStoryStylePreset } from '../../utils/storyStylePresets';
import { getScreenTranslations } from '../../i18n/SCREENS-TRANSLATION';

const { width } = (Dimensions.get('window') ?? { width: 375, height: 812 });
const PAD = 16;
const TRACK_W = width - PAD * 2 - 32;
const DRAFT_KEY_PREFIX = '@story_draft_';
const LEGACY_DRAFT_PREFIXES = ['@story_editor_draft_v1:', '@story_editor_draft_v2:', '@story_editor_draft_v3:'] as const;
const MY_STORIES_KEY = '@my_stories';
const READ_ONLY_INPUT_TEXT_COLOR = '#E5E8EF';

type StoryEditorTextInputProps = React.ComponentProps<typeof RNTextInput>;

const TextInput = React.forwardRef<React.ElementRef<typeof RNTextInput>, StoryEditorTextInputProps>(
  ({ editable = true, showSoftInputOnFocus, caretHidden, contextMenuHidden, selectTextOnFocus, style, ...props }, ref) => {
    const isReadOnly = editable === false;

    return (
      <RNTextInput
        ref={ref}
        {...props}
        style={[style, isReadOnly && { color: READ_ONLY_INPUT_TEXT_COLOR }]}
        editable={editable}
        showSoftInputOnFocus={isReadOnly ? false : showSoftInputOnFocus}
        caretHidden={isReadOnly ? true : caretHidden}
        contextMenuHidden={isReadOnly ? true : contextMenuHidden}
        selectTextOnFocus={isReadOnly ? false : selectTextOnFocus}
      />
    );
  },
);
TextInput.displayName = 'StoryEditorTextInput';

async function migrateLegacyDrafts(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const legacyKeys = (allKeys as string[]).filter((key) =>
      LEGACY_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))
    );
    if (legacyKeys.length > 0) {
      await AsyncStorage.multiRemove(legacyKeys);
    }
  } catch {
    // Ignore migration failures; not critical for editor startup.
  }
}

// [sanitized comment]
interface EmotionValues { e1: number; e2: number; e3: number; e4: number; e5: number; }

interface CharacterDraft {
  id: number; name: string; imageUris: string[];
  emotions?: EmotionValues; personality: string; personalityExample: string;
  age?: string; gender?: string; traits?: string; description?: string;
  appearance?: string; speech?: string;
}
type PersistedCharacterDraft = Omit<CharacterDraft, 'emotions'>;
interface UserSetting { name: string; age: string; gender: string; traits: string; description: string; }
interface ChapterDraft {
  id: string; title: string; aiGoal: string;
  characterGoals: Record<number, string>;
  prevSummary: string; chapterInfo: string; triggers: TriggerDraft[];
  choiceEvents: ChoiceEventDraft[];
isEnding?: boolean; // 선택지 없는 챕터 = 엔딩 챕터 (스택 무한)
}
interface TriggerDraft {
  type: 'cache' | 'conversation' | 'emotion';
  emotionChar?: number;
  emotionCode?: string;
  emotionDir?: 'above' | 'below' | 'reach';
  emotionValue?: number;
  convCount?: number;
}
interface ChoiceOptionDraft {
  id: string;
  label: string;
  targetChapterId: string;
}
interface ChoiceEventDraft {
  id: string;
  prompt: string;
  triggerConditions: TriggerDraft[];
  options: ChoiceOptionDraft[];
}
interface IntroMessage {
  id: string; speakerType: 'narrator' | 'user' | 'character' | 'image' | 'emotion_delta';
  speakerCharId?: number; content: string; imageUri?: string;
}
const NARRATOR_CHAR_ID = 0;
const USER_CHAR_ID = 1;

function isLocalDraftStoryId(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.startsWith('draft_') || normalized.startsWith('story_');
}

async function readResponseDebugBody(
  response: { clone: () => { json: () => Promise<unknown>; text: () => Promise<string> } },
): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {}
  try {
    return await response.clone().text();
  } catch {}
  return null;
}

function getServerErrorMessage(debugBody: unknown): string {
  if (typeof debugBody === 'string') return debugBody;
  if (
    debugBody &&
    typeof debugBody === 'object' &&
    typeof (debugBody as { error?: unknown }).error === 'string'
  ) {
    return (debugBody as { error: string }).error;
  }
  return '';
}

function summarizeChaptersForDebug(chapters: ChapterDraft[]): Array<Record<string, unknown>> {
  return chapters.map((chapter, index) => {
    const targetChapterIds = (chapter.choiceEvents ?? []).reduce<string[]>((acc, event) => {
      (event.options ?? []).forEach((option) => {
        const normalizedTarget = option.targetChapterId?.trim();
        if (normalizedTarget) acc.push(normalizedTarget);
      });
      return acc;
    }, []);

    return {
      order: index + 1,
      id: chapter.id,
      title: chapter.title,
      isEnding: Boolean(chapter.isEnding),
      choiceEventCount: chapter.choiceEvents?.length ?? 0,
      targetChapterIds,
    };
  });
}

function createIntroMessageId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeIntroSpeakerMeta(
  speakerType: IntroMessage['speakerType'] | string | undefined,
  speakerCharId?: number | null,
): Pick<IntroMessage, 'speakerType' | 'speakerCharId'> {
  if (speakerType === 'image') return { speakerType: 'image', speakerCharId: undefined };
  if (speakerType === 'user' || speakerCharId === USER_CHAR_ID) {
    return { speakerType: 'user', speakerCharId: USER_CHAR_ID };
  }
  if (speakerType === 'character' && typeof speakerCharId === 'number' && speakerCharId >= 2) {
    return { speakerType: 'character', speakerCharId };
  }
  return { speakerType: 'narrator', speakerCharId: NARRATOR_CHAR_ID };
}

function normalizeIntroMessage(
  message: { speakerType?: string; speakerCharId?: number; id?: string; content?: string; imageUrl?: string; imageUri?: string },
): IntroMessage {
  const speakerType = message.speakerType === 'image'
    || message.speakerType === 'user'
    || message.speakerType === 'character'
    || message.speakerType === 'narrator'
    ? message.speakerType
    : 'narrator';
  const normalizedSpeaker = normalizeIntroSpeakerMeta(speakerType, message.speakerCharId);
  return {
    id: message.id ?? createIntroMessageId(),
    ...normalizedSpeaker,
    content: message.content ?? '',
    imageUri: message.imageUri ?? message.imageUrl,
  };
}

type NormalizableIntroMessage = Partial<IntroMessage> & { imageUrl?: string };

function normalizeIntroMessagesMap(
  introMap: Record<string, unknown> | null | undefined,
): Record<string, IntroMessage[]> {
  if (!introMap || typeof introMap !== 'object') return {};

  return Object.entries(introMap).reduce<Record<string, IntroMessage[]>>((acc, [chapterId, messages]) => {
    if (!Array.isArray(messages)) return acc;
    acc[chapterId] = messages.map(message => {
      const normalizedMessage = message as NormalizableIntroMessage;
      return normalizeIntroMessage(normalizedMessage);
    });
    return acc;
  }, {});
}

function normalizeRoleLabel(value?: string | null): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function matchesRoleLabel(
  label: string | undefined | null,
  candidates: Array<string | undefined | null>,
): boolean {
  const normalized = normalizeRoleLabel(label);
  if (!normalized) return false;
  return candidates.some((candidate) => normalizeRoleLabel(candidate) === normalized);
}

function isNarratorLabel(label?: string | null, localizedLabel?: string | null): boolean {
  return matchesRoleLabel(label, [
    localizedLabel,
    '\uB0B4\uB808\uC774\uC158',
    '\uB098\uB808\uC774\uC158',
    'narrator',
    'narration',
  ]);
}

function isUserLabel(
  label?: string | null,
  localizedLabel?: string | null,
  customUserName?: string | null,
): boolean {
  return matchesRoleLabel(label, [
    localizedLabel,
    customUserName,
    '\uC0AC\uC6A9\uC790',
    '\uC720\uC800',
    'user',
  ]);
}

function pickMoreCompleteText(primary?: string | null, secondary?: string | null): string {
  const primaryText = typeof primary === 'string' ? primary.trim() : '';
  const secondaryText = typeof secondary === 'string' ? secondary.trim() : '';
  if (!primaryText) return secondaryText;
  if (!secondaryText) return primaryText;
  return primaryText.length >= secondaryText.length ? primaryText : secondaryText;
}

function mergeCharacterDrafts(primary: CharacterDraft, secondary: CharacterDraft): CharacterDraft {
  return {
    ...primary,
    name: pickMoreCompleteText(primary.name, secondary.name),
    imageUris: Array.from(new Set([...(primary.imageUris ?? []), ...(secondary.imageUris ?? [])].filter(Boolean))),
    personality: pickMoreCompleteText(primary.personality, secondary.personality),
    personalityExample: pickMoreCompleteText(primary.personalityExample, secondary.personalityExample),
    age: pickMoreCompleteText(primary.age, secondary.age),
    gender: pickMoreCompleteText(primary.gender, secondary.gender),
    traits: pickMoreCompleteText(primary.traits, secondary.traits),
    description: pickMoreCompleteText(primary.description, secondary.description),
    appearance: pickMoreCompleteText(primary.appearance, secondary.appearance),
    speech: pickMoreCompleteText(primary.speech, secondary.speech),
  };
}

function overwriteDuplicateCharactersById(characters: CharacterDraft[]): CharacterDraft[] {
  const latestById = new Map<number, CharacterDraft>();
  characters.forEach((character) => {
    latestById.set(character.id, character);
  });
  return Array.from(latestById.values()).sort((a, b) => a.id - b.id);
}

function hasCharacterStateAnomalies(
  characters: CharacterDraft[],
  narratorLabel?: string | null,
  userLabel?: string | null,
  customUserName?: string | null,
): boolean {
  const seenIds = new Set<number>();
  let hasNarrator = false;
  let hasUser = false;

  for (const character of characters) {
    if (seenIds.has(character.id)) return true;
    seenIds.add(character.id);

    if (character.id === NARRATOR_CHAR_ID) hasNarrator = true;
    if (character.id === USER_CHAR_ID) hasUser = true;

    if (
      character.id >= 2 &&
      (isNarratorLabel(character.name, narratorLabel) || isUserLabel(character.name, userLabel, customUserName))
    ) {
      return true;
    }
  }

  return !hasNarrator || !hasUser;
}

function getUniqueRegularCharacters(
  characters: CharacterDraft[],
  narratorLabel?: string | null,
  userLabel?: string | null,
  customUserName?: string | null,
): CharacterDraft[] {
  return characters
    .filter(character =>
      character.id >= 2 &&
      !isNarratorLabel(character.name, narratorLabel) &&
      !isUserLabel(character.name, userLabel, customUserName)
    )
    .sort((a, b) => a.id - b.id)
    .reduce<CharacterDraft[]>((acc, character) => {
      const existingIndex = acc.findIndex(existing => existing.id === character.id);
      if (existingIndex === -1) {
        acc.push(character);
      } else {
        acc[existingIndex] = mergeCharacterDrafts(acc[existingIndex], character);
      }
      return acc;
    }, []);
}
interface BackgroundItem { id: string; uri: string; label: string; conditions: BGCondition[]; }
interface BGCondition {
  type: 'chapter' | 'emotion';
  chapterId?: string;
  charId?: number;
  emotionCode?: string;
  dir?: 'above' | 'below';
  value?: number;
}

function normalizeBackgroundCondition(raw: unknown): BGCondition {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

  return {
    type: 'chapter',
    chapterId: typeof source.chapterId === 'string' ? source.chapterId : undefined,
  };
}

function normalizeBackgroundItems(rawBackgrounds: unknown): BackgroundItem[] {
  if (!Array.isArray(rawBackgrounds)) return [];

  return rawBackgrounds.map((background, index) => {
    const source = background && typeof background === 'object'
      ? background as Record<string, unknown>
      : {};
    const baseId = typeof source.id === 'string' && source.id.trim().length > 0
      ? source.id.trim()
      : 'bg';
    const uri = typeof source.uri === 'string' && source.uri.trim().length > 0
      ? source.uri.trim()
      : typeof source.imageUrl === 'string' && source.imageUrl.trim().length > 0
        ? source.imageUrl.trim()
        : typeof source.image_url === 'string' && source.image_url.trim().length > 0
          ? source.image_url.trim()
          : '';

    return {
      id: `${baseId}_${index}`,
      uri,
      label: typeof source.label === 'string' ? source.label : '',
      conditions: Array.isArray(source.conditions)
        ? source.conditions.map(normalizeBackgroundCondition)
        : [],
    };
  });
}

function stripCharacterEmotionFields(character: CharacterDraft): PersistedCharacterDraft {
  const { emotions: _emotions, ...rest } = character;
  return {
    ...rest,
    personalityExample: character.personalityExample ?? '',
  };
}

function sanitizeChoiceEventsForPersistence(choiceEvents: ChoiceEventDraft[]): ChoiceEventDraft[] {
  return (choiceEvents ?? []).map((choiceEvent) => ({
    ...choiceEvent,
    triggerConditions: (choiceEvent.triggerConditions ?? []).filter((trigger) => trigger?.type !== 'emotion'),
    options: (choiceEvent.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      targetChapterId: option.targetChapterId,
    })),
  }));
}

function sanitizeChapterForPersistence<T extends ChapterDraft & { intro?: IntroMessage[] }>(chapter: T): T {
  return {
    ...chapter,
    triggers: (chapter.triggers ?? []).filter((trigger) => trigger?.type !== 'emotion'),
    choiceEvents: sanitizeChoiceEventsForPersistence(chapter.choiceEvents ?? []),
    ...(Array.isArray(chapter.intro)
      ? {
          intro: chapter.intro.filter((message) => message?.speakerType !== 'emotion_delta'),
        }
      : {}),
  };
}

function sanitizeIntroMessagesMapForPersistence(
  introMap: Record<string, IntroMessage[]>,
): Record<string, IntroMessage[]> {
  return Object.fromEntries(
    Object.entries(introMap ?? {}).map(([chapterId, messages]) => [
      chapterId,
      (messages ?? []).filter((message) => message?.speakerType !== 'emotion_delta'),
    ]),
  );
}

function sanitizeBackgroundsForPersistence(backgrounds: BackgroundItem[]): BackgroundItem[] {
  return (backgrounds ?? []).map((background) => ({
    ...background,
    conditions: (background.conditions ?? []).filter((condition) => condition?.type !== 'emotion'),
  }));
}

// ── 아이콘은 components/StoryEditorIcons.tsx에서 import ──────────────────

function getGuides(t: Record<string, string | undefined>): Record<string, string> {
  const screenT = getScreenTranslations(useLanguageStore.getState().appLanguage);
  return {
    storyTitle:        t?.guideStoryTitle ?? '',
    storyDesc:         t?.guideStoryDesc ?? '',
    storyGenre:        (t as Record<string, string | undefined>).genreLabelAI ?? screenT.storyGenreGuide,
    storyStylePreset:  (t as Record<string, string | undefined>).stylePresetGuide ?? '',
    storyHashtag:      t?.guideStoryHashtag ?? '',
    storeCover:        t?.guideStoreCover ?? '',
    characterName:     t?.guideCharName ?? '',
    characterImage:    t?.guideCharImage ?? '',
    characterEmotion:  '',
    characterPersonality: t?.guideCharPersonality ?? '',
    characterExample:  t?.guideCharExample ?? '',
    worldSetting:      t?.guideWorldSetting ?? '',
    aiGoal:            t?.guideAiGoal ?? '',
    characterGoal:     t?.guideCharGoal ?? '',
    prevSummary:       t?.guidePrevSummary ?? '',
    chapterInfo:       t?.guideChapterInfo ?? '',
    chapterTrigger:    '',
    intro:             t?.guideIntro ?? '',
    background:        t?.guideBackground ?? '',
    choiceEvent:       (t as Record<string, string | undefined>).tooltipChoiceEvent ?? screenT.tooltipChoiceEvent
  };
}

async function requestImagePermission(t: Record<string, string | undefined>): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const sdkVersion = Platform.Version as number;
    const permission = sdkVersion >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
    const result = await PermissionsAndroid.request(permission, {
      title: t?.imgPermTitle ?? '', message: t?.imgPermMsg ?? '',
      buttonPositive: t?.imgPermAllow ?? '', buttonNegative: t?.imgPermDeny ?? ''
  });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

type PickImageOptions = {
  targetAspectRatio?: number;
  maxWidth?: number;
  maxHeight?: number;
};

// [sanitized comment]
async function pickImage(
  t: Record<string, string | undefined>,
  options?: PickImageOptions,
): Promise<string | null> {
  const granted = await requestImagePermission(t);
  if (!granted) { ToastService.error(t?.imgPermNeeded ?? ''); return null; }
  try {
    return new Promise(resolve => {
      launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 }, async (response: import('react-native-image-picker').ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) { resolve(null); return; }
        const uri = response.assets?.[0]?.uri ?? null;
        if (!uri) { resolve(null); return; }
        if (!options?.targetAspectRatio && !options?.maxWidth && !options?.maxHeight) {
          resolve(uri);
          return;
        }
        try {
          const compressed = await nitroCompressImage(uri, {
            maxWidth: options?.maxWidth ?? 1024,
            maxHeight: options?.maxHeight ?? 1024,
            quality: 0.9,
            format: 'webp',
            targetAspectRatio: options?.targetAspectRatio });
          resolve(compressed.uri);
        } catch {
          resolve(uri);
        }
      });
    });
  } catch { ToastService.error(t?.imgPermLibrary ?? ''); return null; }
}

// [sanitized comment]
async function pickImages(
  t: Record<string, string | undefined>,
  maxCount: number = 5,
  options?: PickImageOptions,
): Promise<string[]> {
  const granted = await requestImagePermission(t);
  if (!granted) { ToastService.error(t?.imgPermNeeded ?? ''); return []; }
  try {
    return new Promise(resolve => {
      launchImageLibrary(
        { mediaType: 'photo', quality: 1, selectionLimit: Math.max(1, maxCount) },
        async (response: import('react-native-image-picker').ImagePickerResponse) => {
          if (response.didCancel || response.errorCode) { resolve([]); return; }
          const uris = (response.assets ?? [])
            .map((a: import('react-native-image-picker').Asset) => a.uri)
            .filter(Boolean) as string[];
          if (!options?.targetAspectRatio && !options?.maxWidth && !options?.maxHeight) {
            resolve(uris);
            return;
          }
          const processed = await Promise.all(
            uris.map(async uri => {
              try {
                const compressed = await nitroCompressImage(uri, {
                  maxWidth: options?.maxWidth ?? 1024,
                  maxHeight: options?.maxHeight ?? 1024,
                  quality: 0.9,
                  format: 'webp',
                  targetAspectRatio: options?.targetAspectRatio });
                return compressed.uri;
              } catch {
                return uri;
              }
            }),
          );
          resolve(processed);
        }
      );
    });
  } catch { ToastService.error(t?.imgPermLibrary ?? ''); return []; }
}

// [sanitized comment]
// [sanitized comment]
// type: 'cover' | 'bg' | 'char_extra'  (profile? type='profile')
async function uploadImageToR2(
  localUri: string,
  type: 'cover' | 'bg' | 'profile',
  storyId: string,
  jwtToken: string,
  options?: { bgIndex?: number; charId?: string },
): Promise<string | null> {
  if (localUri.startsWith('http')) return localUri;
  try {
    // [sanitized comment]
    // [sanitized comment]
    let uploadUri = localUri;
    try {
      const maxDim = type === 'profile' ? 512 : type === 'cover' ? 1024 : 1280;
      const compressed = await nitroCompressImage(localUri, {
        maxWidth: maxDim,
        maxHeight: maxDim,
        quality: 0.82,
        format: 'webp',
        targetAspectRatio: type === 'cover' ? 2 / 3 : type === 'profile' ? 1 : undefined });
      uploadUri = compressed.uri;
      Sentry.addBreadcrumb({
        category: 'image.upload',
message: `이미지 압축 완료: ${compressed.sizeBytes} bytes (${type})`,
        level: 'info'
  });
} catch { /* 이미지 압축 실패 무시 */ }

    const form = new FormData();
    form.append('file', {
      uri: uploadUri,
      type: 'image/webp',
      name: `upload_${Date.now()}.webp`
  } as unknown as Blob);
    form.append('type', type);
    form.append('story_id', storyId);
    if (options?.bgIndex !== undefined) form.append('bg_index', String(options.bgIndex));
    if (options?.charId !== undefined)  form.append('char_id', options.charId);

    // [BUG FIX] authedFetch가 이미 Authorization 헤더를 추가하므로 중복 헤더 제거
    const res = await authedFetch('/r2/upload', {
      method: 'POST',
      body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[R2Upload] 실패:', res.status, body);
      return null;
    }
    const data = await res.json();
    return data.url ?? null;
  } catch (err) {
    console.warn('[R2Upload] 오류:', err);
    return null;
  }
}

// Upload a list of local URIs to R2; returns public URLs (falls back to local URI on failure)
async function uploadImages(
  uris: string[],
  type: 'cover' | 'bg' | 'profile',
  storyId: string,
  jwtToken: string,
): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const url = await uploadImageToR2(uris[i], type, storyId, jwtToken, { bgIndex: i });
    results.push(url ?? uris[i]); // Fall back to the local URI when the upload does not return a remote URL.
  }
  return results;
}

function isRemoteAssetUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri);
}

function hasAssetUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.trim().length > 0;
}

function countRemoteAssetUris(uris: Array<string | null | undefined>): number {
  return uris.filter(isRemoteAssetUri).length;
}

function hasPendingCoverUpload(
  sourceUris: Array<string | null | undefined>,
  uploadedUris: Array<string | null | undefined>,
): boolean {
  const sourceAssetCount = sourceUris.filter(hasAssetUri).length;
  if (sourceAssetCount === 0) return false;
  return countRemoteAssetUris(uploadedUris) < sourceAssetCount;
}

function hasPendingBackgroundUpload(
  sourceItems: BackgroundItem[],
  uploadedItems: BackgroundItem[],
): boolean {
  return sourceItems.some((bg, index) => {
    if (!hasAssetUri(bg.uri)) return false;
    return !isRemoteAssetUri(uploadedItems[index]?.uri);
  });
}

function hasPendingCharacterUpload(
  sourceItems: CharacterDraft[],
  uploadedItems: CharacterDraft[],
): boolean {
  return sourceItems.some(sourceCharacter => {
    const sourceAssetCount = Array.isArray(sourceCharacter.imageUris)
      ? sourceCharacter.imageUris.filter(hasAssetUri).length
      : 0;
    if (sourceAssetCount === 0) return false;
    const uploadedCharacter = uploadedItems.find(character => character.id === sourceCharacter.id);
    const uploadedUris = Array.isArray(uploadedCharacter?.imageUris) ? uploadedCharacter.imageUris : [];
    return countRemoteAssetUris(uploadedUris) < sourceAssetCount;
  });
}

function getFirstCharacterFallbackCover(characters: CharacterDraft[]): string {
  const firstCharacter = getUniqueRegularCharacters(characters)[0];
  const firstRemoteImage = firstCharacter?.imageUris.find(isRemoteAssetUri);
  return firstRemoteImage ?? '';
}

function getChapterValidationMessage(
  chapters: ChapterDraft[],
  backgrounds: BackgroundItem[],
  t?: Record<string, string | undefined>,
): string | null {
  const screenT = getScreenTranslations(useLanguageStore.getState().appLanguage);
  const chapterIds = new Set<string>();
  const chapterIndexById = new Map<string, number>();

  for (const [index, chapter] of chapters.entries()) {
    if (!chapter.id) {
      return `${t?.chapter ?? screenT.editorChapterText} ${index + 1}: ${(t as Record<string, string | undefined> | undefined)?.chapterIdMissing ?? screenT.chapterIdMissing}`;
    }
    if (chapterIds.has(chapter.id)) {
      return `${t?.chapter ?? screenT.editorChapterText} ${index + 1}: ${(t as Record<string, string | undefined> | undefined)?.chapterIdDuplicate ?? screenT.chapterIdDuplicate}`;
    }
    chapterIds.add(chapter.id);
    chapterIndexById.set(chapter.id, index);
  }

  for (const [chapterIndex, chapter] of chapters.entries()) {
    for (const [eventIndex, event] of (chapter.choiceEvents ?? []).entries()) {
      const options = event.options ?? [];
      const optionsWithTarget = options.filter(option => option.targetChapterId.trim().length > 0);
      if (optionsWithTarget.length > 0 && optionsWithTarget.length !== options.length) {
        return `${t?.chapter ?? screenT.editorChapterText} ${chapterIndex + 1}: ${(t as Record<string, string | undefined> | undefined)?.chapterTargetRequired ?? screenT.chapterTargetRequired} (${eventIndex + 1})`;
      }

      for (const [optionIndex, option] of options.entries()) {
        const targetChapterId = option.targetChapterId.trim();
        if (!targetChapterId) continue;

        const targetIndex = chapterIndexById.get(targetChapterId);
        if (targetIndex === undefined) {
          return `${t?.chapter ?? screenT.editorChapterText} ${chapterIndex + 1}: ${(t as Record<string, string | undefined> | undefined)?.chapterTargetMissing ?? screenT.chapterTargetMissing} (${eventIndex + 1}-${optionIndex + 1})`;
        }
        if (targetIndex <= chapterIndex) {
          return `${t?.chapter ?? screenT.editorChapterText} ${chapterIndex + 1}: ${(t as Record<string, string | undefined> | undefined)?.chapterTargetOrder ?? screenT.chapterTargetOrder} (${eventIndex + 1}-${optionIndex + 1})`;
        }
      }
    }
  }

  for (const [backgroundIndex, background] of backgrounds.entries()) {
    for (const [conditionIndex, condition] of (background.conditions ?? []).entries()) {
      if (condition.type !== 'chapter') continue;
      if (!condition.chapterId) continue;
      if (!chapterIds.has(condition.chapterId)) {
        return `${(t as Record<string, string | undefined> | undefined)?.background ?? screenT.backgroundLabel} ${backgroundIndex + 1}: ${(t as Record<string, string | undefined> | undefined)?.chapterConditionInvalid ?? screenT.chapterConditionInvalid} (${conditionIndex + 1})`;
      }
    }
  }

  return null;
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

function GuideButton({ guideKey, t }: { guideKey: string; t: Record<string, string | undefined> }) {
  const [visible, setVisible] = useState(false);
  const guides = getGuides(t);

  return (
    <View>
      <TouchableOpacity style={s.guideBtn} onPress={() => setVisible(v => !v)}>
        <Text style={s.guideBtnText}>?</Text>
      </TouchableOpacity>
      {visible && (
        <TouchableOpacity activeOpacity={1} onPress={() => setVisible(false)} style={s.guideBalloon}>
          <View style={s.guideBalloonArrow} />
          <Text style={s.guideBalloonText}>{guides[guideKey] ?? ''}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function FieldRow({ label, guideKey, t, children }: { label: string; guideKey: string; t: Record<string, string | undefined>; children: React.ReactNode }) {
  return (
    <View style={s.fieldRow}>
      <View style={s.fieldHeader}>
        <Text style={s.fieldLabel}>{label}</Text>
        <GuideButton guideKey={guideKey} t={t} />
      </View>
      {children}
    </View>
  );
}

const IntroBubble = React.memo(function IntroBubble({ msg, chars, onLongPress }: { msg: IntroMessage; chars: CharacterDraft[]; onLongPress: () => void }) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const normalizedSpeaker = normalizeIntroSpeakerMeta(msg.speakerType, msg.speakerCharId);
  const char = chars.find(c => c.id === normalizedSpeaker.speakerCharId);
  const effectiveSpeakerType = normalizedSpeaker.speakerType;
  if (effectiveSpeakerType === 'image') return (
    <TouchableOpacity onLongPress={onLongPress} style={s.introBubbleImageWrap}>
      <View style={{ width: '100%' }}>
        {msg.imageUri
          ? <Image source={{ uri: msg.imageUri }} style={s.introBubbleImage} contentFit="contain" />
          : <Text style={s.narratorText}>{t?.editorIntroImage}</Text>}
        {msg.content ? <Text style={s.introBubbleImageCaption}>{msg.content}</Text> : null}
      </View>
    </TouchableOpacity>
  );
  if (effectiveSpeakerType === 'narrator') return (
    <TouchableOpacity onLongPress={onLongPress} style={s.narratorBubble}>
      <Text style={s.narratorText}>{msg.content}</Text>
    </TouchableOpacity>
  );
  if (effectiveSpeakerType === 'user') return (
    <TouchableOpacity onLongPress={onLongPress} style={s.userBubbleRow}>
      <View style={s.userBubble}><Text style={s.userText}>{msg.content}</Text></View>
    </TouchableOpacity>
  );
  return (
    <TouchableOpacity onLongPress={onLongPress} style={s.aiBubbleRow}>
      <View style={s.aiAvatar}><Text style={s.aiAvatarText}>{char?.name?.[0] ?? (t?.character ?? screenT.characterLabel)?.[0] ?? screenT.aiShortLabel}</Text></View>
      <View>
        <Text style={s.aiName}>{char?.name ?? t?.character ?? screenT.characterLabel}</Text>
        <View style={s.aiBubble}><Text style={s.aiText}>{msg.content}</Text></View>
      </View>
    </TouchableOpacity>
  );
});

// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
function ChapterRangeTranslate({
  chapters,
  chapterMultiLangData,
  onApply,
  title
  }: {
  chapters: ChapterDraft[];
  chapterMultiLangData: Record<string, Record<string, any>>;
  onApply: (result: Record<string, Record<string, any>>) => void;
  title?: string;
}) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [fromInput, setFromInput] = React.useState('1');
  const [toInput, setToInput] = React.useState(String(Math.max(chapters.length, 1)));

  const maxChapter = Math.max(chapters.length, 1);
  const parsedFrom = Math.min(maxChapter, Math.max(1, parseInt(fromInput, 10) || 1));
  const parsedTo = Math.min(maxChapter, Math.max(1, parseInt(toInput, 10) || chapters.length || 1));
  const startChapter = Math.min(parsedFrom, parsedTo);
  const endChapter = Math.max(parsedFrom, parsedTo);
  const fromIdx = startChapter - 1;
  const toIdx = endChapter - 1;
  const selectedChapters = chapters.slice(fromIdx, toIdx + 1);

  // 선택지 있는 챕터만 번역 필요
  const translatableChapters = selectedChapters.filter(ch => ch.choiceEvents && ch.choiceEvents.length > 0);

  const isChapterDone = (ch: ChapterDraft): boolean => {
    // 선택지 없으면 번역 불필요 → 자동 완료
    if (!ch.choiceEvents || ch.choiceEvents.length === 0) return true;
    const data = chapterMultiLangData[ch.id];
    return !!(data && Object.keys(data).length >= LANGUAGE_LIST.length);
  };

  const translatedCount = translatableChapters.filter(ch => isChapterDone(ch)).length;
  const totalTranslatable = translatableChapters.length;
  const allDone = totalTranslatable === 0 || translatedCount >= totalTranslatable;

  return (
    <View style={[s.translateCard, { borderStyle: 'dashed', marginTop: 4, flexDirection: 'column', alignItems: 'stretch', gap: 0 }]}>
      {/* 헤더 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={s.translateCardTitle}>{title ?? (t as Record<string, string | undefined>).editorSectionTranslate ?? t?.chapter}</Text>
        {allDone && totalTranslatable > 0
          ? <Check size={18} color={'#10B981'} />
          : totalTranslatable > 0
            ? <Text style={{ fontSize: 11, color: '#797990' }}>{translatedCount}/{totalTranslatable}</Text>
            : null}
      </View>

      {/* 모든 챕터 칩 표시 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {chapters.map((ch, idx) => {
          const needsTranslation = ch.choiceEvents && ch.choiceEvents.length > 0;
          const done = isChapterDone(ch);
          const inRange = idx >= fromIdx && idx <= toIdx;
          return (
            <View key={ch.id} style={{
              paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
              backgroundColor: done ? 'rgba(16,185,129,0.15)' : (inRange ? '#181820' : '#111118'),
              borderWidth: 1, borderColor: done ? '#10B981' : (inRange ? '#2C2C38' : '#181820'),
              flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 11, color: done ? '#10B981' : (inRange ? (needsTranslation ? '#F0F0F5' : '#8A8A9E') : '#5C5C70') }}>
                {`${screenT.editorChapterText} ${idx + 1}`}
              </Text>
              {done && <Check size={9} color={'#10B981'} />}
            </View>
          );
        })}
      </View>

      {/* 번역하기 버튼 */}
      {!allDone && (
        <TouchableOpacity
          style={[s.rangeTranslateBtn, { alignSelf: 'stretch', alignItems: 'center' }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.82}
        >
          <Text style={{ fontSize: 12, color: '#D4A853', fontFamily: Typography.fontFamily.bold }}>
            {(t as Record<string, string | undefined>).multiLangTranslate ?? screenT.translate}
          </Text>
        </TouchableOpacity>
      )}
      {allDone && totalTranslatable > 0 && (
        <TouchableOpacity
          style={[s.rangeTranslateBtn, { alignSelf: 'stretch', alignItems: 'center', borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.08)' }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.82}
        >
          <Text style={{ fontSize: 12, color: '#10B981', fontFamily: Typography.fontFamily.bold }}>
            {(t as Record<string, string | undefined>).multiLangRetry ?? screenT.multiLangRetry}
          </Text>
        </TouchableOpacity>
      )}

      <TranslationPasteModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={`${t?.chapter ?? screenT.editorChapterText} ${t?.multiLangTranslate ?? screenT.translate}`}
        doneCount={translatedCount}
        extraControls={(
          <View style={{ backgroundColor: '#08080C', borderRadius: 10, borderWidth: 1, borderColor: '#181820', padding: 12, gap: 10 }}>
            <Text style={{ color: '#8A8A9E', fontSize: 12, fontFamily: Typography.fontFamily.bold }}>
              {(t as Record<string, string | undefined>).editorChapterText ?? screenT.editorChapterText} {startChapter}~{endChapter}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={s.rangeInput}
                value={fromInput}
                onChangeText={setFromInput}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={'#757585'}
                maxLength={4}
              />
              <Text style={s.translateCardDesc}>~</Text>
              <TextInput
                style={s.rangeInput}
                value={toInput}
                onChangeText={setToInput}
                keyboardType="number-pad"
                placeholder={String(chapters.length || 1)}
                placeholderTextColor={'#757585'}
                maxLength={4}
              />
              <Text style={[s.translateCardDesc, { marginLeft: 2 }]}>
                {`${selectedChapters.length} ${(t as Record<string, string | undefined>).multiLangChapters ?? screenT.chaptersLabel}`}
              </Text>
            </View>
          </View>
        )}
        pasteButtonLabel={screenT.pasteTranslation}
        buildPromptFn={(langs) => buildAllChaptersPrompt(chapters, langs, fromIdx, toIdx)}
        parseFn={(text) => {
          const r = parseAllChaptersPaste(text, selectedChapters, 0);
          // ✅ [BUG FIX] 챕터 개수 반환 (언어 개수가 아님)
          return r;
        }}
        onConfirm={(text) => {
          const result = parseAllChaptersPaste(text, selectedChapters, 0);
          // 선택지 있는 챕터 번역 결과 확인
          const manualTranslated = Object.keys(result).filter(id => {
            const v = result[id];
            return v && Object.values(v).some((entry: any) => !entry?._auto);
          });
          if (manualTranslated.length === 0 && selectedChapters.some(ch => ch.choiceEvents.length > 0)) {
            ToastService.info((t as Record<string, string | undefined>).translateFormatError ?? t?.error ?? screenT.translateFormatError);
            return;
          }
          // 선택지 없는 챕터 자동 완료 처리
          onApply(result);
          setModalVisible(false);
        }}
      />
    </View>
  );
}

function makeChapter1(): ChapterDraft {
  const screenT = getScreenTranslations(useLanguageStore.getState().appLanguage);
  const t = useLanguageStore.getState().t;
  return { id: 'chapter_1', title: `${t?.editorChapterNum ?? screenT.editorChapterText} 1`, aiGoal: '', characterGoals: {}, prevSummary: '', chapterInfo: '', triggers: [{ type: 'cache' }], choiceEvents: [] };
}

// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
// [sanitized comment]

// [sanitized comment]
// [sanitized comment]
// [sanitized comment]

function buildMultiLangPrompt(title: string, desc: string, hashtags: string, langs?: Language[]): string {
  const list = langs && langs.length > 0 ? langs : LANGUAGE_LIST;
  const langCodes = list.map(l => l.code.toUpperCase()).join(', ');

  const outputFormat = list.map(l => {
    return [
      `LANG_${l.code.toUpperCase()}_TITLE: [${l.nativeName} title]`,
      `LANG_${l.code.toUpperCase()}_DESC: [${l.nativeName} description]`,
      `LANG_${l.code.toUpperCase()}_TAGS: [${l.nativeName} tags]`
    ].join('\n');
  }).join('\n');

  return (
    `Translate the following story info into all specified languages.\n\n` +
    `[SOURCE]\nTITLE: ${title}\nDESC: ${desc}\nTAGS: ${hashtags}\n\n` +
    `[TRANSLATION RULES]\n` +
    `- Translate naturally for each language\n` +
    `- Do NOT translate {U} or {u} placeholders\n` +
    `- Output ONLY the format below, no comments or variable names\n\n` +
    `[TARGET LANGUAGES: ${langCodes}]\n\n` +
    `[OUTPUT FORMAT - output this exact format only]\n` +
    outputFormat
  );
}

function parseMultiLangPaste(raw: string): Record<string, { title: string; description: string; hashtags: string }> {
  const result: Record<string, { title: string; description: string; hashtags: string }> = {};
  const kv = buildKV(raw);

  for (const lang of LANGUAGE_LIST) {
    const lc = lcKey(lang.code);
    const t = kv[`LANG_${lc}_TITLE`];
    const d = kv[`LANG_${lc}_DESC`];
    const h = kv[`LANG_${lc}_TAGS`];
    if (t || d) {
      result[lang.code] = { title: t || '', description: d || '', hashtags: h || '' };
    }
  }
  return result;
}

function buildIntroPrompt(introMsgs: IntroMessage[], langs: Language[]): string {
  const list = langs.length > 0 ? langs : LANGUAGE_LIST;
  const langCodes = list.map(l => l.code.toUpperCase()).join(', ');
  const textMsgs = introMsgs.filter(m => m.speakerType !== 'image' && m.content?.trim());

  const outputFormat = list.map(l => {
    const lines: string[] = [];
    textMsgs.forEach((_, i) => {
      lines.push(`LANG_${l.code.toUpperCase()}_INTRO_${i + 1}: [${l.nativeName} intro message ${i + 1}]`);
    });
    return lines.join('\n');
  }).join('\n');

  return `Translate the following intro messages into all specified languages.

[SOURCE]
${textMsgs.map((m, i) => `INTRO_${i + 1}: ${m.content}`).join('\n')}

[TRANSLATION RULES]
- Translate naturally for each language
- Do NOT translate {U} or {u} placeholders
- Output ONLY the format below, no comments or variable names

[TARGET LANGUAGES: ${langCodes}]

[OUTPUT FORMAT - output this exact format only]
${outputFormat}`;
}

function parseIntroPaste(raw: string, introMsgs: IntroMessage[]): Record<string, Record<string, string>> {
  const kv = buildKV(raw);
  const result: Record<string, Record<string, string>> = {};
  const textMsgs = introMsgs.filter(m => m.speakerType !== 'image' && m.content?.trim());

  for (const lang of LANGUAGE_LIST) {
    const lc = lcKey(lang.code);
    const langIntro: Record<string, string> = {};
    textMsgs.forEach((msg, i) => {
      const val = kv[`LANG_${lc}_INTRO_${i + 1}`];
      if (val) langIntro[msg.id] = val;
    });
    if (Object.keys(langIntro).length > 0) result[lang.code] = langIntro;
  }
  return result;
}

// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
function buildKV(raw: string): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    // [sanitized comment]
    const clean = line.replace(/^[\s\-*>[\]#]+/, '');
    const idx = clean.indexOf(':');
    if (idx < 1) continue;
    // [sanitized comment]
    const k = clean.slice(0, idx)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const v = clean.slice(idx + 1).trim();
    if (k && v) kv[k] = v;
  }
  return kv;
}
// Normalise lang.code for use as KV key (replace all non-alphanumeric chars with _)
function lcKey(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}


// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
function TranslationPastePage({
  visible, onClose, onConfirm, parseFn
  }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
  parseFn: (text: string) => Record<string, any>;
}) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const [text, setText] = React.useState('');
  // ✅ [PERFORMANCE FIX] recognized 계산 제거 - 매 타이핑마다 parseFn 실행하지 않음
  // 확인 버튼 누를 때만 검증
  const [recognized, setRecognized] = React.useState(0);

  const handleClipboardPaste = async () => {
    try {
      const clipText = await clipboardGetString();
      if (!clipText?.trim()) { ToastService.info(t?.clipboardEmpty ?? screenT.clipboardEmpty); return; }
      setText(clipText);
      // 붙여넣기 후에만 계산 - 비동기 처리로 UI 블록 방지
      if (clipText.length > 120000) {
        setRecognized(0);
        return;
      }
      setTimeout(() => {
        try {
          const count = Object.keys(parseFn(clipText)).length;
          setRecognized(count);
        } catch {
          setRecognized(0);
        }
      }, 80);
    } catch { ToastService.info(t?.pasteFailed ?? screenT.pasteFailed); }
  };

  const handleConfirm = () => {
    if (!text.trim()) { ToastService.info((t as Record<string, string | undefined>).translationResultRequired ?? screenT.translationResultRequired); return; }
    // 확인 시에만 파싱
    const pendingText = text;
    setText('');
    setRecognized(0);
    onClose();
    setTimeout(() => {
      onConfirm(pendingText);
    }, 0);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#050507' }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#181820' }}>
          <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 4 }} hitSlop={8}>
            <ArrowLeft size={22} color={'#8A8A9E'} />
          </TouchableOpacity>
          <Text style={{ color: '#F0F0F5', fontSize: 16, fontFamily: Typography.fontFamily.bold, flex: 1 }}>{(t as Record<string, string | undefined>).pasteTranslationResult ?? screenT.pasteTranslation}</Text>
          {recognized > 0 && (
            <View style={{ backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' }}>
              <Text style={{ color: '#C084FC', fontSize: 12, fontFamily: Typography.fontFamily.bold }}>{recognized} {(t as Record<string, string | undefined>).languagesRecognized ?? screenT.languagesRecognized}</Text>
            </View>
          )}
        </View>

        {/* Translation action buttons */}
        <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: '#0E0E14' }}>
          <TouchableOpacity
            style={{ backgroundColor: '#0E0E14', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.5)', paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            onPress={handleClipboardPaste}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#C084FC', fontSize: 15, fontFamily: Typography.fontFamily.bold }}>{(t as Record<string, string | undefined>).pasteFromClipboard ?? screenT.pasteFromClipboard}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[{ backgroundColor: '#8B5CF6', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, !text.trim() && { opacity: 0.35 }]}
            onPress={handleConfirm}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: Typography.fontFamily.bold }}>
              {recognized > 0 ? `${(t as Record<string, string | undefined>).confirm ?? screenT.confirm} (${recognized})` : ((t as Record<string, string | undefined>).confirm ?? screenT.confirm)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* [sanitized comment] */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            <View style={{ margin: 16, backgroundColor: '#08080C', borderRadius: 10, borderWidth: 1, borderColor: '#181820', overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#181820', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#797990', fontSize: 11, fontFamily: Typography.fontFamily.bold }}>{(t as Record<string, string | undefined>).pasteContentLabel ?? screenT.pasteContentLabel}</Text>
                {text.trim() && (
                  <TouchableOpacity onPress={() => setText('')}>
                    <Text style={{ color: '#797990', fontSize: 11 }}>{(t as Record<string, string | undefined>).clearText ?? screenT.clearText}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={{ color: '#C8C8D4', fontSize: 12, padding: 12, minHeight: 300, textAlignVertical: 'top', fontFamily: 'monospace' }}
                value={text}
                onChangeText={setText}
                multiline
                placeholder={(t as Record<string, string | undefined>).pasteInputPlaceholder ?? screenT.pasteInputPlaceholder}
                placeholderTextColor={'#2C2C38'}
              />
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

      </SafeAreaView>
    </Modal>
  );
}

// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
function TranslationPasteModal({
  visible, onClose, buildPromptFn, parseFn, onConfirm, title, doneCount, extraControls, pasteButtonLabel
  }: {
  visible: boolean;
  onClose: () => void;
  buildPromptFn: (langs: Language[]) => string;
  parseFn: (text: string) => Record<string, any>;
  onConfirm: (text: string) => void;
  title?: string;
  doneCount?: number;
  extraControls?: React.ReactNode;
  pasteButtonLabel?: string;
}) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const [selectedCodes, setSelectedCodes] = React.useState<Set<string>>(new Set(LANGUAGE_LIST.map(l => l.code)));
  const [pastePageVisible, setPastePageVisible] = React.useState(false);

  const toggleLang = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) { next.delete(code); } else { next.add(code); }
      return next;
    });
  };

  const selectedLangs = LANGUAGE_LIST.filter(l => selectedCodes.has(l.code));

  const handleCopyPrompt = () => {
    if (selectedLangs.length === 0) { ToastService.info((t as Record<string, string | undefined>).selectAtLeastOneLanguage ?? screenT.selectAtLeastOneLanguage); return; }
    const prompt = buildPromptFn(selectedLangs);
    clipboardSetString(prompt);
    ToastService.success(((t as Record<string, string | undefined>).copiedTranslationPrompt ?? screenT.copiedTranslationPrompt).replace('{count}', String(selectedLangs.length)));
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#050507' }}>
          {/* Modal header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#181820' }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 4 }} hitSlop={8}>
              <ArrowLeft size={22} color={'#8A8A9E'} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}><Languages size={18} color={'#F0F0F5'} /><Text style={{ color: '#F0F0F5', fontSize: 16, fontFamily: Typography.fontFamily.bold }}>{title ?? screenT.translate}</Text></View>
            {(doneCount ?? 0) > 0 && (
              <View style={{ backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' }}>
                <Text style={{ color: '#C084FC', fontSize: 12, fontFamily: Typography.fontFamily.bold }}>{`${(t as Record<string, string | undefined>).translationComplete ?? screenT.translationComplete} ${doneCount}`}</Text>
              </View>
            )}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* ✅ 번역 보관 안내: 사용자가 텍스트 입력기를 보고 번역이 날아갔다고 착각하지 않도록 방지 */}
            {(doneCount ?? 0) > 0 && (
              <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: '#10B981', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Check size={24} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#10B981', fontSize: 14, fontFamily: Typography.fontFamily.bold, marginBottom: 4 }}>
                    {doneCount}개 언어 번역 데이터 보관 중 ✅
                  </Text>
                  <Text style={{ color: '#F0F0F5', fontSize: 12, opacity: 0.8, lineHeight: 18 }}>
                    기존에 번역하신 내용은 뒷단에 안전하게 저장되어 있습니다. 추가할 언어가 없다면 그냥 창을 닫으셔도 날아가지 않습니다!
                  </Text>
                </View>
              </View>
            )}

            {/* 다국어 번역 */}
            <View style={{ backgroundColor: '#08080C', borderRadius: 10, borderWidth: 1, borderColor: '#181820', padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#8A8A9E', fontSize: 12, fontFamily: Typography.fontFamily.bold }}>{`${(t as Record<string, string | undefined>).selectLanguages ?? screenT.selectLangForTranslation} (${selectedLangs.length}/${LANGUAGE_LIST.length})`}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setSelectedCodes(new Set(LANGUAGE_LIST.map(l => l.code)))}>
                <Text style={{ color: '#D4A853', fontSize: 11 }}>{(t as Record<string, string | undefined>).selectAll ?? screenT.selectAllLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedCodes(new Set())}>
                    <Text style={{ color: '#8A8A9E', fontSize: 11 }}>{(t as Record<string, string | undefined>).clearText ?? screenT.clearText}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {LANGUAGE_LIST.map(l => {
                  const selected = selectedCodes.has(l.code);
                  return (
                    <TouchableOpacity
                      key={l.code}
                      onPress={() => toggleLang(l.code)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: selected ? '#D4A853' : '#2C2C38', backgroundColor: selected ? 'rgba(212,168,83,0.12)' : '#0E0E14' }}
                    >
                      <Text style={{ color: selected ? '#D4A853' : '#797990', fontSize: 11, fontWeight: selected ? '700' : '400' }}>{l.nativeName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* [sanitized comment] */}
            <TouchableOpacity
              style={[{ backgroundColor: '#0E0E14', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.5)', paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, selectedLangs.length === 0 && { opacity: 0.35 }]}
              onPress={handleCopyPrompt}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#C084FC', fontSize: 15, fontFamily: Typography.fontFamily.bold }}>
                {(t as Record<string, string | undefined>).copyPromptBtn ?? screenT.copyPromptBtn}{selectedLangs.length > 0 ? ` (${selectedLangs.length})` : ''}
              </Text>
            </TouchableOpacity>

            {extraControls ? (
              <View style={{ gap: 8 }}>
                {extraControls}
              </View>
            ) : null}

            <Text style={{ color: '#8A8A9E', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 8 }}>
              {(t as Record<string, string | undefined>).translateWorkflow ?? screenT.translateWorkflow}
            </Text>

            <TouchableOpacity
              style={{ backgroundColor: '#8B5CF6', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              onPress={() => setPastePageVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: Typography.fontFamily.bold }}>{pasteButtonLabel ?? ((t as Record<string, string | undefined>).pasteResultTitle ?? screenT.pasteTranslationResult)}</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* [sanitized comment] */}
      <TranslationPastePage
        visible={pastePageVisible}
        onClose={() => setPastePageVisible(false)}
        parseFn={parseFn}
        onConfirm={(text) => {
          setPastePageVisible(false);
          onClose();
          setTimeout(() => {
            onConfirm(text);
          }, 24);
        }}
      />
    </>
  );
}

// [sanitized comment]
function buildAllCharsPrompt(characters: CharacterDraft[], langs: Language[], userSetting?: UserSetting): string {
  const list = langs.length > 0 ? langs : LANGUAGE_LIST;
  const langCodes = list.map(l => l.code).join(', ');
  const allChars = characters.filter(c => c.id >= 1);

  const instrMap: Record<string, any> = {
    ko: { name: '이름', age: '나이', gender: '성별', traits: '특징' },
    en: { name: 'Name', age: 'Age', gender: 'Gender', traits: 'Traits' },
    ja: { name: '名前', age: '年齢', gender: '性別', traits: '特徴' },
    zh: { name: '名字', age: '年龄', gender: '性别', traits: '特征' },
    es: { name: 'Nombre', age: 'Edad', gender: 'Género', traits: 'Rasgos' },
    fr: { name: 'Nom', age: 'Âge', gender: 'Genre', traits: 'Traits' },
    de: { name: 'Name', age: 'Alter', gender: 'Geschlecht', traits: 'Eigenschaften' },
    pt: { name: 'Nome', age: 'Idade', gender: 'Gênero', traits: 'Traços' },
    ru: { name: 'Имя', age: 'Возраст', gender: 'Пол', traits: 'Черты' },
    vi: { name: 'Tên', age: 'Tuổi', gender: 'Giới tính', traits: 'Đặc điểm' },
    th: { name: 'ชื่อ', age: 'อายุ', gender: 'เพศ', traits: 'ลักษณะ' },
    id: { name: 'Nama', age: 'Usia', gender: 'Jenis Kelamin', traits: 'Ciri' },
    it: { name: 'Nome', age: 'Età', gender: 'Genere', traits: 'Tratti' },
    tr: { name: 'İsim', age: 'Yaş', gender: 'Cinsiyet', traits: 'Özellikler' },
    hi: { name: 'नाम', age: 'आयु', gender: 'लिंग', traits: 'लक्षण' } };

  const origBlock = allChars.map(char => {
    const age = char.id === 1 ? (userSetting?.age ?? '') : (char.age ?? '');
    const gender = char.id === 1 ? (userSetting?.gender ?? '') : (char.gender ?? '');
    const traits = char.id === 1 ? (userSetting?.traits ?? '') : (char.traits ?? '');
    const label = char.id === 1 ? `[Character #1 (protagonist)]` : `[Character #${char.id}]`;
    return `${label}
NAME_${char.id}: ${char.name}
${age ? `AGE_${char.id}: ${age}` : ''}
${gender ? `GENDER_${char.id}: ${gender}` : ''}
${traits ? `TRAITS_${char.id}: ${traits}` : ''}`;
  }).join('\n');

  const fmtBlock = allChars.map(char =>
    list.map(l => {
      const im = instrMap[l.code] || instrMap.en;
      return `LANG_${l.code}_${char.id}_NAME: [${l.nativeName} ${im.name}]
LANG_${l.code}_${char.id}_AGE: [${l.nativeName} ${im.age}]
LANG_${l.code}_${char.id}_GENDER: [${l.nativeName} ${im.gender} (translate gender to ${l.nativeName})]
LANG_${l.code}_${char.id}_TRAITS: [${l.nativeName} ${im.traits}]`;
    }).join('\n')
  ).join('\n');

  return `Translate all character info into every specified language.

[SOURCE]
${origBlock}

[TRANSLATION RULES]
- Translate naturally for each language
- Translate names to the target language equivalent; keep ages as-is; translate genders (e.g. male -> 남성 in ko)
- Do NOT translate {U} or {u} placeholders
- Output ONLY the format below, no variable names, comments, or markdown

[TARGET LANGUAGES: ${langCodes}]

[OUTPUT FORMAT - output this exact format only]
${fmtBlock}`;
}

function parseAllCharsPaste(raw: string, characters: CharacterDraft[]): Record<number, Record<string, any>> {
  const kv = buildKV(raw);
  const result: Record<number, Record<string, any>> = {};
  // [sanitized comment]
  // [sanitized comment]
  const allChars = getUniqueRegularCharacters(characters);
  for (const char of allChars) {
    const charData: Record<string, any> = {};
    for (const lang of LANGUAGE_LIST) {
      const lc = lcKey(lang.code);
      const name = kv[`LANG_${lc}_${char.id}_NAME`];
      const age = kv[`LANG_${lc}_${char.id}_AGE`];
      const gender = kv[`LANG_${lc}_${char.id}_GENDER`];
      const traits = kv[`LANG_${lc}_${char.id}_TRAITS`];
      if (name || age || gender || traits) {
        charData[lang.code] = { name: name || '', age: age || '', gender: gender || '', traits: traits || '' };
      }
    }
    if (Object.keys(charData).length > 0) result[char.id] = charData;
  }
  return result;
}

// [sanitized comment]
// [sanitized comment]
// [sanitized comment]
function buildAllChaptersPrompt(allChapters: ChapterDraft[], langs: Language[], fromIdx: number = 0, toIdx?: number): string {
  const chapters = allChapters.slice(fromIdx, toIdx !== undefined ? toIdx + 1 : undefined);
  const list = langs.length > 0 ? langs : LANGUAGE_LIST;
  const langCodes = list.map(l => l.code).join(', ');

  const translatableChapters = chapters.filter(ch => ch.choiceEvents.length > 0);

  const origBlock = translatableChapters.map((ch) => {
    const chIdx = fromIdx + chapters.indexOf(ch);
    const lines = [`[Chapter ${chIdx + 1}]\nCH_${chIdx + 1}_TITLE: ${ch.title}`];
    ch.choiceEvents.forEach((evt, ei) => {
      lines.push(`CH_${chIdx + 1}_EVT_${ei + 1}_PROMPT: ${evt.prompt || '(none)'}`);
      evt.options.forEach((opt, oi) => {
        lines.push(`CH_${chIdx + 1}_EVT_${ei + 1}_OPT_${oi + 1}: ${opt.label || '(none)'}`);
      });
    });
    return lines.join('\n');
  }).join('\n');

  const fmtBlock = translatableChapters.map((ch) => {
    const chIdx = fromIdx + chapters.indexOf(ch);
    return list.map(l => {
      const flines = [`LANG_${l.code}_CH_${chIdx + 1}_TITLE: [${l.nativeName} chapter title]`];
      ch.choiceEvents.forEach((evt, ei) => {
        flines.push(`LANG_${l.code}_CH_${chIdx + 1}_EVT_${ei + 1}_PROMPT: [${l.nativeName} prompt text]`);
        evt.options.forEach((_: import('../../types/StoryContract').ChoiceOption, oi: number) => {
          flines.push(`LANG_${l.code}_CH_${chIdx + 1}_EVT_${ei + 1}_OPT_${oi + 1}: [${l.nativeName} choice option]`);
        });
      });
      return flines.join('\n');
    }).join('\n');
  }).join('\n');

  return `Translate the following chapters into all specified languages.\n\nIncludes only ${translatableChapters.length} chapters that have choice events.\nEnding chapters without choices are auto-completed.\n\n[SOURCE]\n${origBlock}\n\n[TRANSLATION RULES]\n- Translate naturally for each language\n- Do NOT translate {U} or {u} placeholders\n- Output ONLY the format below, no variable names, comments, or markdown\n\n[TARGET LANGUAGES: ${langCodes}]\n\n[OUTPUT FORMAT - output this exact format only]\n${fmtBlock}`;
}

// ✅ [BUG FIX] 챕터 번역 파싱 - 순서 상관없이 인식
function parseAllChaptersPaste(raw: string, chapters: ChapterDraft[], fromIdx: number = 0): Record<string, Record<string, any>> {
  const kv = buildKV(raw);
  const result: Record<string, Record<string, any>> = {};
  
  // 입력된 모든 챕터 번호 찾기
  const inputChapterNumbers = new Set<number>();
  Object.keys(kv).forEach(key => {
    const match = key.match(/CH_(\d+)_/);
    if (match) {
      inputChapterNumbers.add(parseInt(match[1], 10));
    }
  });
  
  chapters.forEach((ch, i) => {
    const globalIdx = fromIdx + i;
    const chapterNumber = globalIdx + 1;
    
    // 이 챕터 번호가 입력에 있는지 확인
    if (!inputChapterNumbers.has(chapterNumber)) {
      // 입력에 없으면 자동 완성 (선택지 없는 챕터)
      if (ch.choiceEvents.length === 0) {
        const autoEntry: Record<string, any> = {};
        for (const lang of LANGUAGE_LIST) {
          autoEntry[lang.code] = { title: ch.title, _auto: true };
        }
        result[ch.id] = autoEntry;
      }
      return;
    }
    
    if (ch.choiceEvents.length === 0) {
      const autoEntry: Record<string, any> = {};
      for (const lang of LANGUAGE_LIST) {
        autoEntry[lang.code] = { title: ch.title, _auto: true };
      }
      result[ch.id] = autoEntry;
      return;
    }
    const langData: Record<string, any> = {};
    for (const lang of LANGUAGE_LIST) {
      const lc = lcKey(lang.code);
      const title = kv[`LANG_${lc}_CH_${chapterNumber}_TITLE`];
      if (!title) continue;
      const entry: Record<string, string> = { title };
      ch.choiceEvents.forEach((evt, ei) => {
        const prompt = kv[`LANG_${lc}_CH_${chapterNumber}_EVT_${ei + 1}_PROMPT`];
        if (prompt) entry[`evt_${ei}_prompt`] = prompt;
        evt.options.forEach((_: import('../../types/StoryContract').ChoiceOption, oi: number) => {
          const opt = kv[`LANG_${lc}_CH_${chapterNumber}_EVT_${ei + 1}_OPT_${oi + 1}`];
          if (opt) entry[`evt_${ei}_opt_${oi}`] = opt;
        });
      });
      langData[lang.code] = entry;
    }
    if (Object.keys(langData).length > 0) result[ch.id] = langData;
  });
  return result;
}

// [sanitized comment]
export function StoryEditorScreen({ navigation, route }: { navigation: import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>; route: import('@react-navigation/native').RouteProp<Record<string, object | undefined>> }) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const screenT = React.useMemo(() => getScreenTranslations(appLanguage), [appLanguage]);
  const applyName = useUserProfileStore(s => s.applyName);
  const jwtToken    = useAuthStore(s => s.user?.jwtToken ?? '');
  const authUser    = useAuthStore(s => s.user);
  const myProfile   = useUserProfileStore(s => s.profile);

  const TABS = React.useMemo(() => [
    { id: 'story', label: t?.story },
    { id: 'characters', label: t?.character },
    { id: 'world', label: t?.worldSetting },
    { id: 'chapters', label: t?.chapter },
    { id: 'intro', label: t?.editorTabIntro },
    { id: 'background', label: t?.background },
    { id: 'graph', label: (t as any).chapterGraphLabel ?? screenT.chapterFlow },
    { id: 'translate', label: (t as any).multiLangBtn ?? screenT.translate },
  ], [screenT, t]);
  const existingStory = (route?.params as any)?.story;
  const loadStoryId = (route?.params as any)?.storyId;
  const imageOnlyMode = Boolean((route?.params as any)?.imageOnly);
  const draftStorageId = React.useMemo(() => {
    if (typeof loadStoryId === 'string' && loadStoryId.trim().length > 0) return loadStoryId.trim();
    if (typeof existingStory?.id === 'string' && existingStory.id.trim().length > 0) return existingStory.id.trim();
    return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, [existingStory?.id, loadStoryId]);
  const initialStoryModelId = React.useMemo(
    () => resolveStoryModelId(existingStory as Record<string, unknown> | undefined),
    [existingStory],
  );
const prefill = (route?.params as any)?.prefill; // AI 채팅에서 스토리 데이터 전달받음
const fromAIChat = (route?.params as any)?.fromAIChat ?? false; // AI 채팅에서 온 경우
  const [activeTab, setActiveTab] = useState('story');
  const [status, setStatus] = useState<string>(existingStory?.status ?? (existingStory?.isApproved ? 'published' : 'draft'));
  const [storyModelId, setStoryModelId] = useState(initialStoryModelId);
  const isServerLocked = status === 'published' || status === 'approved' || status === 'suspended';
  const isImageOnlyEditor = imageOnlyMode || status === 'review' || status === 'pending';
  const isLocked = isServerLocked || isImageOnlyEditor;
  const canEditImages = !isServerLocked || imageOnlyMode;
  const storyModelBadge = React.useMemo(() => getModelBadgeMeta(storyModelId, t), [storyModelId, t]);
  const linkedServerStoryId = React.useMemo(() => {
    if (typeof existingStory?.id === 'string' && existingStory.id.trim().length > 0 && !isLocalDraftStoryId(existingStory.id)) {
      return existingStory.id.trim();
    }
    if (typeof loadStoryId === 'string' && loadStoryId.trim().length > 0 && !isLocalDraftStoryId(loadStoryId)) {
      return loadStoryId.trim();
    }
    return '';
  }, [existingStory?.id, loadStoryId]);
  const clearLocalDraftArtifacts = useCallback((ids: Array<string | undefined>) => {
    const targetIds = Array.from(
      new Set(
        ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
      ),
    );
    if (targetIds.length === 0) return;

    targetIds.forEach(targetId => {
      appStorage.remove(`${DRAFT_KEY_PREFIX}${targetId}`);
    });

    const rawStories = appStorage.getString(MY_STORIES_KEY) ?? null;
    const list = rawStories ? (() => { try { return JSON.parse(rawStories); } catch { return []; } })() : [];
    const nextList = list.filter((story: { id?: string }) => !targetIds.includes(String(story?.id ?? '')));
    appStorage.set(MY_STORIES_KEY, JSON.stringify(nextList));

    const activeDraftId = appStorage.getString('@active_draft_id');
    if (activeDraftId && targetIds.includes(activeDraftId)) {
      appStorage.remove('@active_draft_id');
    }
  }, []);
  const pruneRelatedDraftArtifacts = useCallback((currentDraftId: string, nextTitle?: string, nextDesc?: string) => {
    const keepIds = new Set(
      [currentDraftId, draftStorageId, isLocalDraftStoryId(loadStoryId) ? loadStoryId : undefined]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(value => value.trim()),
    );
    const duplicateIds = new Set<string>();

    appStorage.getAllKeys()
      .filter(key => key.startsWith(DRAFT_KEY_PREFIX))
      .forEach(key => {
        const rawDraft = appStorage.getString(key) ?? null;
        if (!rawDraft) return;

        try {
          const draft = JSON.parse(rawDraft) as Record<string, unknown>;
          const candidateId = String(draft.storyId ?? key.slice(DRAFT_KEY_PREFIX.length)).trim();
          if (!candidateId || keepIds.has(candidateId)) return;

          const candidateLinkedServerStoryId = typeof draft.linkedServerStoryId === 'string'
            ? draft.linkedServerStoryId.trim()
            : '';
          const sameLinkedServerStory =
            !!linkedServerStoryId &&
            candidateLinkedServerStoryId === linkedServerStoryId;

          if (sameLinkedServerStory) {
            duplicateIds.add(candidateId);
          }
        } catch {}
      });

    if (duplicateIds.size > 0) {
      clearLocalDraftArtifacts([...duplicateIds]);
    }
  }, [clearLocalDraftArtifacts, draftStorageId, linkedServerStoryId, loadStoryId]);
  const visibleTabs = React.useMemo(
    () => (
      isImageOnlyEditor
        ? TABS.filter(tab => tab.id === 'story' || tab.id === 'characters' || tab.id === 'background')
        : TABS
    ),
    [TABS, isImageOnlyEditor],
  );
  const tabScrollRef = useRef<ScrollView>(null);
  const [aiModalVisible, setAiModalVisible] = useState<boolean>(!fromAIChat && Boolean((route?.params as Record<string, unknown> | undefined)?.aiAssist));

  const [_multiLangExpanded, setMultiLangExpanded] = useState(
    !!(prefill?.multiLangData && Object.keys(prefill.multiLangData).length > 0)
  );
  const [multiLangTranslations, setMultiLangTranslations] = useState<Record<string, { title: string; description: string; hashtags: string }>>(
    prefill?.multiLangData ?? {}
  );

  const [storyTitle, setStoryTitle] = useState(existingStory?.title ?? prefill?.storyTitle ?? '');
  const [storyDesc, setStoryDesc] = useState(existingStory?.description ?? prefill?.storyDesc ?? '');
  // ✅ [BUG FIX] storyGenre 상태 누락 — 장르 선택해도 저장 안 되던 버그
  // [BUG FIX] _setStoryGenre → setStoryGenre: underscore prefix 제거, setter 실제로 사용 가능하게 수정
  const [storyGenre, setStoryGenre] = useState<string>(
    (() => {
      try {
        const cfg2 = typeof existingStory?.story_config === 'string'
          ? JSON.parse(existingStory.story_config) : (existingStory?.story_config ?? {});
        return normalizeStoryGenre(existingStory?.genre ?? cfg2.genre ?? prefill?.storyGenre ?? '');
      } catch { return ''; }
    })()
  );
  const [storyStylePreset, setStoryStylePreset] = useState<string>(
    (() => {
      try {
        const cfg2 = typeof existingStory?.story_config === 'string'
          ? JSON.parse(existingStory.story_config) : (existingStory?.story_config ?? {});
        return normalizeStoryStylePreset(
          cfg2.storyStylePreset ?? cfg2.story_style_preset ?? prefill?.storyStylePreset ?? ''
        );
      } catch {
        return normalizeStoryStylePreset(prefill?.storyStylePreset ?? '');
      }
    })()
  );
  // [sanitized comment]
  const initHashtag = (): string => {
    if (prefill?.storyHashtag) return prefill.storyHashtag;
    try {
      const cfg2 = typeof existingStory?.story_config === 'string'
        ? JSON.parse(existingStory.story_config) : (existingStory?.story_config ?? {});
      if (cfg2.tags && Array.isArray(cfg2.tags)) return cfg2.tags.map((tag: string) => `#${tag}`).join(' ');
      if (typeof cfg2.storyHashtag === 'string') return cfg2.storyHashtag;
    } catch {}
    return '';
  };
  const [storyHashtag, setStoryHashtag] = useState(initHashtag);
  const storyGenreOptions = React.useMemo(
    () => getStoryGenreOptions(STORY_EDITOR_GENRE_IDS, t as Record<string, string | undefined>),
    [t],
  );
  const storyStylePresetOptions = React.useMemo(
    () => getStoryStylePresetOptions(t as Record<string, string | undefined>),
    [t],
  );
  const deferredStoryTitle = useDeferredValue(storyTitle);
  const deferredStoryDesc = useDeferredValue(storyDesc);
  const deferredStoryHashtag = useDeferredValue(storyHashtag);
  const deferredStoryGenre = useDeferredValue(storyGenre);
  const deferredStoryStylePreset = useDeferredValue(storyStylePreset);
  // [sanitized comment]
  const initCovers = (): string[] => {
    if (existingStory?.cover_urls && Array.isArray(existingStory.cover_urls)) return existingStory.cover_urls.slice(0, 3);
    const single = existingStory?.cover_url ?? existingStory?.coverUrl ?? null;
    if (single) return [single];
    // story_config 백업 파싱
    try {
      const cfg2 = typeof existingStory?.story_config === 'string'
        ? JSON.parse(existingStory.story_config) : (existingStory?.story_config ?? {});
      if (Array.isArray(cfg2.cover_urls) && cfg2.cover_urls.length > 0) return cfg2.cover_urls.slice(0, 3);
      if (cfg2.cover_url) return [cfg2.cover_url];
    } catch {}
    return [];
  };
  const [storeCoverUris, setStoreCoverUris] = useState<string[]>(initCovers);
  const [coverPreviewIdx, setCoverPreviewIdx] = useState(0);

  const normalizeUserSetting = useCallback((
    rawValue?: UserSetting | Record<string, unknown> | string | null,
    fallbackChar?: Partial<CharacterDraft> | Record<string, unknown> | null,
  ): UserSetting => {
    const rawObject = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : {};
    const fallback = fallbackChar && typeof fallbackChar === 'object' ? fallbackChar as Record<string, unknown> : {};
    const pickStringValue = (...values: unknown[]) => {
      for (const value of values) {
        if (typeof value === 'string') return value;
      }
      return '';
    };

    return {
      name: pickStringValue(rawObject.name, fallback.name),
      age: pickStringValue(rawObject.age, fallback.age),
      gender: pickStringValue(rawObject.gender, fallback.gender),
      traits: pickStringValue(rawObject.traits, rawObject.appearance, fallback.traits, fallback.appearance),
      description: typeof rawValue === 'string'
        ? rawValue
        : pickStringValue(rawObject.description, rawObject.setting, rawObject.user_setting, fallback.personality, fallback.description) };
  }, []);

  const buildFixedCharacters = useCallback((
    rawChars: CharacterDraft[],
    rawUserSetting?: UserSetting | Record<string, unknown> | string | null,
  ): CharacterDraft[] => {
    const normalizedUser = normalizeUserSetting(rawUserSetting, rawChars.find((char) => char.id === USER_CHAR_ID) ?? null);
    const narrator = rawChars.find(char => char.id === NARRATOR_CHAR_ID || isNarratorLabel(char.name, t?.speakerNarrator)) ?? {
      id: 0,
      name: t?.speakerNarrator,
      imageUris: [],
      personality: '',
      personalityExample: '',
      age: '',
      gender: '',
      traits: '' };
    const userSource = rawChars.find(char => char.id === USER_CHAR_ID || isUserLabel(char.name, t?.speakerUser, normalizedUser.name));
    const uniqueRegularCharacters = getUniqueRegularCharacters(
      rawChars,
      t?.speakerNarrator,
      t?.speakerUser,
      normalizedUser.name,
    );

    // [BUG FIX] 성별 필드 우선순위 수정: userSource.gender를 최우선으로 사용
    return [
      narrator,
      {
        id: 1,
        name: userSource?.name ?? t?.speakerUser,
        imageUris: Array.isArray(userSource?.imageUris) ? userSource.imageUris : [],
        personality: normalizedUser.description || userSource?.personality || userSource?.description || '',
        personalityExample: userSource?.speech || userSource?.personalityExample || '',
        age: userSource?.age || normalizedUser.age || '',
        gender: userSource?.gender || normalizedUser.gender || '',
        traits: userSource?.traits || userSource?.appearance || normalizedUser.traits || '',
        description: normalizedUser.description || userSource?.description || userSource?.personality || '',
        appearance: userSource?.appearance || userSource?.traits || normalizedUser.traits || '',
        speech: userSource?.speech || userSource?.personalityExample || '' },
      ...uniqueRegularCharacters,
    ];
  }, [t, normalizeUserSetting]);

  // 서버/설정 캐릭터를 에디터 초안 형태로 정규화한다.
  const normalizeCharFromConfig = useCallback((
    c: import('../../types/StoryContract').StoryCharacter,
    fallbackId?: number,
  ): CharacterDraft => {
    const raw = c as unknown as Record<string, unknown>;
    const normalizedId = Number(c.id ?? c.char_index ?? fallbackId ?? 0) || 0;
    const primaryImage = typeof c.profileUrl === 'string' && c.profileUrl
      ? c.profileUrl
      : typeof c.profile_url === 'string' && c.profile_url
        ? c.profile_url
        : '';

    // [BUG FIX] 성별 필드 우선순위 수정: c.gender를 최우선으로 사용
    const genderValue = c.gender ?? raw.gender ?? '';

    return {
      id: normalizedId > 0 ? normalizedId : (fallbackId ?? 0),
      name: String(c.name ?? ''),
      imageUris: Array.isArray(c.imageUris)
        ? c.imageUris.filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0)
        : primaryImage ? [primaryImage] : [],
      personality: String(c.personality ?? raw.personality ?? ''),
      personalityExample: String(c.personalityExample ?? c.speech ?? c.speech_pattern ?? c.speechPattern ?? ''),
      age: String(c.age ?? ''),
      gender: String(genderValue),
      traits: String(c.traits ?? raw.appearance ?? c.appearance ?? ''),
      description: String(c.description ?? c.setting ?? raw.setting ?? raw.user_setting ?? ''),
      appearance: String(c.appearance ?? raw.appearance ?? c.traits ?? ''),
      speech: String(c.speech ?? c.personalityExample ?? c.speech_pattern ?? c.speechPattern ?? '') };
  }, []);

  // [sanitized comment]
  const buildPrefillChars = useCallback(() => {
    const base: CharacterDraft[] = [
      { id: 0, name: t?.speakerNarrator, imageUris: [], personality: '', personalityExample: '', age: '', gender: '', traits: '' },
      { 
        id: 1, 
        name: t?.speakerUser, 
        imageUris: [], 
        personality: prefill?.userSetting?.description ?? '', 
        personalityExample: '', 
        age: prefill?.userSetting?.age ?? '', 
        gender: prefill?.userSetting?.gender ?? '', 
        traits: prefill?.userSetting?.traits ?? '',
        description: prefill?.userSetting?.description ?? '',
        appearance: prefill?.userSetting?.traits ?? '',
        speech: '' 
      },
    ];
    // [sanitized comment]
    const cfg = existingStory?.story_config;
    const rawCfg = typeof cfg === 'string' ? (() => { try { return JSON.parse(cfg); } catch { return null; } })() : cfg;
    const rawCfgChars = rawCfg?.characters;
    if (Array.isArray(rawCfgChars) && rawCfgChars.length > 0) {
      return buildFixedCharacters(
        rawCfgChars.map((char, index) => normalizeCharFromConfig(char, index + 2)),
        rawCfg?.userSetting,
      );
    }
    if (prefill?.characters?.length) {
      const normalizedPrefillChars: CharacterDraft[] = prefill.characters.map(
        (char: any, index: number) => normalizeCharFromConfig(char, index + 2)
      );
      return buildFixedCharacters(normalizedPrefillChars, prefill?.userSetting);
    }
    return base;
  }, [t, prefill, existingStory, buildFixedCharacters, normalizeCharFromConfig]);

  const [characters, setCharacters] = useState<CharacterDraft[]>(() => buildPrefillChars());
  const [selectedCharIdx, setSelectedCharIdx] = useState(1);

  // [sanitized comment]
  const [charMultiLangData, setCharMultiLangData] = useState<Record<number, Record<string, { name: string; age: string; gender: string; traits: string }>>>(
    prefill?.charMultiLangData ?? {}
  );

  // [sanitized comment]
  const [storyTranslateModalVisible, setStoryTranslateModalVisible] = useState(false);
  const [charTranslateModalVisible, setCharTranslateModalVisible] = useState(false);
  const [introTranslateModalVisible, setIntroTranslateModalVisible] = useState(false);
  const [chapterTranslateModalIdx, setChapterTranslateModalIdx] = useState<number | null>(null);

  const [chapterMultiLangData, setChapterMultiLangData] = useState<Record<string, Record<string, any>>>({});
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [introMultiLangData, setIntroMultiLangData] = useState<Record<string, Record<string, any>>>(
    prefill?.introMultiLangData && typeof prefill.introMultiLangData === 'object' ? prefill.introMultiLangData : {}
  );
  const [worldSetting, setWorldSetting] = useState(prefill?.worldSetting ?? '');
  const [userSetting, setUserSetting] = useState<UserSetting>({
    name:        prefill?.userSetting?.name        ?? '',
    age:         prefill?.userSetting?.age         ?? '',
    gender:      prefill?.userSetting?.gender      ?? '',
    traits:      prefill?.userSetting?.traits      ?? '',
    description: prefill?.userSetting?.description ?? ''
  });
  const sanitizeCharacters = useCallback((items: CharacterDraft[]) => {
    const dedupedItems = overwriteDuplicateCharactersById(items);
    if (!hasCharacterStateAnomalies(dedupedItems, t?.speakerNarrator, t?.speakerUser, userSetting.name)) {
      return dedupedItems;
    }
    return overwriteDuplicateCharactersById(buildFixedCharacters(dedupedItems, userSetting));
  }, [buildFixedCharacters, t, userSetting]);
  const sanitizedCharacters = React.useMemo(
    () => sanitizeCharacters(characters),
    [characters, sanitizeCharacters],
  );
  const regularCharacters = React.useMemo(
    () => getUniqueRegularCharacters(sanitizedCharacters, t?.speakerNarrator, t?.speakerUser, userSetting.name),
    [sanitizedCharacters, t, userSetting.name],
  );
  const deferredSanitizedCharacters = useDeferredValue(sanitizedCharacters);
  const deferredRegularCharacters = useDeferredValue(regularCharacters);
  const deferredMultiLangTranslations = useDeferredValue(multiLangTranslations);
  const deferredCharMultiLangData = useDeferredValue(charMultiLangData);
  const deferredChapterMultiLangData = useDeferredValue(chapterMultiLangData);
  const deferredIntroMultiLangData = useDeferredValue(introMultiLangData);

  const { introLangsDone, isStoryDone, isCharDone, isIntroDone } = React.useMemo(() => {
    const sDone = Object.keys(deferredMultiLangTranslations || {}).length;
    const tChars = deferredRegularCharacters;
    const cLangsDone = tChars.length === 0
      ? (LANGUAGE_LIST?.length || 15)
      : Math.min(...tChars.map(c => Object.keys(deferredCharMultiLangData?.[c.id] || {}).length));
    const iLangsDone = (LANGUAGE_LIST || []).filter(l => 
      l && deferredIntroMultiLangData?.[l.code] && Object.keys(deferredIntroMultiLangData[l.code] || {}).length > 0
    ).length;

    const limit = (LANGUAGE_LIST?.length || 15);
    return {
      introLangsDone: iLangsDone,
      isStoryDone: sDone >= limit,
      isCharDone: tChars.length === 0 || cLangsDone >= limit,
      isIntroDone: iLangsDone >= limit };
  }, [deferredCharMultiLangData, deferredIntroMultiLangData, deferredMultiLangTranslations, deferredRegularCharacters]);

  // Prefill chapter fields - reflects characterGoals / prevSummary / choiceEvents
  const buildPrefillChapters = (): ChapterDraft[] => {
    const cfg = existingStory?.story_config;
    const cfgChapters = typeof cfg === 'string'
      ? (() => { try { return JSON.parse(cfg).chapters; } catch { return null; } })()
      : cfg?.chapters;
    const sourceChapters = prefill?.chapters?.length
      ? prefill.chapters
      : (Array.isArray(cfgChapters) ? cfgChapters : null);
    if (!sourceChapters?.length) return [makeChapter1()];
    return sourceChapters.map((ch: import('../../types/StoryContract').StoryChapter, i: number) => ({
      id: `chapter_${i + 1}`,
      title: ch.title ?? `${t?.editorChapterNum ?? screenT.editorChapterText} ${i + 1}`,
      aiGoal: ch.aiGoal ?? '',
      characterGoals: ch.characterGoals ?? {},
      prevSummary: ch.prevSummary ?? '',
      chapterInfo: ch.chapterInfo ?? '',
      triggers: ch.triggers?.length ? ch.triggers : [{ type: 'cache' as const }],
      choiceEvents: Array.isArray(ch.choiceEvents)
        ? ch.choiceEvents.map((choiceEvent: any) => ({
            ...choiceEvent,
            triggerConditions: Array.isArray(choiceEvent?.triggerConditions)
              ? choiceEvent.triggerConditions.filter((trigger: any) => trigger?.type !== 'emotion')
              : [],
            options: Array.isArray(choiceEvent?.options)
              ? choiceEvent.options.map((option: any) => ({
                  id: option?.id ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  label: option?.label ?? '',
                  targetChapterId: option?.targetChapterId ?? '',
                }))
              : [],
          }))
        : [],
      isEnding: ch.isEnding ?? false
  }));
  };

  // [sanitized comment]
  const buildPrefillIntroMessages = (): Record<string, IntroMessage[]> => {
    const msgs: Record<string, IntroMessage[]> = {};
    const prefillIntroMap = (!Array.isArray(prefill?.introMessages) && prefill?.introMessages && typeof prefill.introMessages === 'object')
      ? prefill.introMessages
      : {};
    if (!prefill?.chapters?.length) {
      msgs.chapter_1 = [];
      const chapterOnePrefill = Array.isArray(prefill?.introMessages)
        ? prefill.introMessages
        : (Array.isArray(prefillIntroMap.chapter_1) ? prefillIntroMap.chapter_1 : []);
      if (chapterOnePrefill.length) {
        chapterOnePrefill.forEach((m: import('../../types/StoryContract').StoryIntroMessage) => {
          msgs.chapter_1.push(normalizeIntroMessage(m));
        });
      }
      return msgs;
    }
    prefill.chapters.forEach((ch: import('../../types/StoryContract').StoryChapter, i: number) => {
      const chId = `chapter_${i + 1}`;
      // [sanitized comment]
      const fromPrefillMap = Array.isArray(prefillIntroMap[chId]) ? prefillIntroMap[chId] : [];
      const fallbackTopLevel = i === 0 && Array.isArray(prefill?.introMessages) ? prefill.introMessages : [];
      const chIntroMessages = ch.introMessages;
      const srcMsgs = Array.isArray(chIntroMessages) && chIntroMessages.length > 0
        ? chIntroMessages
        : (fromPrefillMap.length > 0 ? fromPrefillMap : fallbackTopLevel);
      msgs[chId] = srcMsgs.map((m: import('../../types/StoryContract').StoryIntroMessage) => normalizeIntroMessage(m));
    });
    return msgs;
  };

  const [chapters, setChapters] = useState<ChapterDraft[]>(() => buildPrefillChapters());
  const [introExpanded, setIntroExpanded] = useState<Record<string, boolean>>({ chapter_1: true });
  const [introMessages, setIntroMessages] = useState<Record<string, IntroMessage[]>>(() => buildPrefillIntroMessages());
  const deferredChapters = useDeferredValue(chapters);
  const deferredIntroMessages = useDeferredValue(introMessages);
  const [introSpeaker, setIntroSpeaker] = useState<'narrator' | 'user' | 'character'>('narrator');
  const [introSpeakerCharId, setIntroSpeakerCharId] = useState(NARRATOR_CHAR_ID);
  const [introInput, setIntroInput] = useState('');
  const [activeIntroKey, setActiveIntroKey] = useState('chapter_1');
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>(
    // [sanitized comment]
    prefill?.backgrounds?.length
      ? normalizeBackgroundItems(prefill.backgrounds)
      : [{ id: 'bg_default', uri: '', label: (t as Record<string, string | undefined>).defaultBackground ?? screenT.editorBgDefault, conditions: [] }]
  );
  // [sanitized comment]
  const isSubmittingRef = React.useRef(false);
  const queryClient = useQueryClient();
  React.useEffect(() => { migrateLegacyDrafts(); }, []);
  React.useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab('story');
    }
  }, [activeTab, visibleTabs]);

  const uploadCoverAssets = useCallback(async (storyId: string, uris: string[]): Promise<string[]> => (
    Promise.all(
      uris.map(async (uri, index) => {
        if (!uri || uri.startsWith('http')) return uri;
        const uploaded = await uploadImageToR2(uri, 'cover', storyId, jwtToken, { bgIndex: index });
        return uploaded ?? uri;
      }),
    )
  ), [jwtToken]);

  const uploadBackgroundAssets = useCallback(async (storyId: string, items: BackgroundItem[]): Promise<BackgroundItem[]> => (
    Promise.all(
      items.map(async (bg, index) => {
        if (!bg.uri || bg.uri.startsWith('http')) return bg;
        const uploaded = await uploadImageToR2(bg.uri, 'bg', storyId, jwtToken, { bgIndex: index });
        return { ...bg, uri: uploaded ?? bg.uri };
      }),
    )
  ), [jwtToken]);

  const uploadCharacterAssets = useCallback(async (storyId: string, items: CharacterDraft[]): Promise<CharacterDraft[]> => (
    Promise.all(
      items.map(async character => {
        if (character.id < 1 || character.imageUris.length === 0) return character;
        const nextUris = await Promise.all(
          character.imageUris.map(async (uri, index) => {
            if (!uri || uri.startsWith('http')) return uri;
            const uploaded = await uploadImageToR2(uri, 'profile', storyId, jwtToken, {
              bgIndex: index,
              charId: String(character.id) });
            return uploaded ?? uri;
          }),
        );
        return { ...character, imageUris: nextUris.filter(Boolean) };
      }),
    )
  ), [jwtToken]);

  // [sanitized comment]
  // [sanitized comment]
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!storyTitle.trim()) throw new Error(t?.toastTitleRequired);
      const storyId = draftStorageId;
      const charactersToPersist = sanitizedCharacters.map(c => ({ ...c, personalityExample: '' }));
      const draftCharacters = charactersToPersist.map(stripCharacterEmotionFields);
      const draftChapters = chapters.map((chapter) => sanitizeChapterForPersistence(chapter));
      const draftBackgrounds = sanitizeBackgroundsForPersistence(backgrounds);
      const draftIntroMessages = sanitizeIntroMessagesMapForPersistence(introMessages);
      pruneRelatedDraftArtifacts(storyId, storyTitle, storyDesc);
      const draft = {
        storyId, storyTitle, storyDesc, storyHashtag,
        storyGenre: storyGenre || undefined,
        linkedServerStoryId: linkedServerStoryId || undefined,
        worldSetting,
        userSetting,
        characters: draftCharacters,
        chapters: draftChapters,
        backgrounds: draftBackgrounds,
        introMessages: draftIntroMessages,
        multiLangTranslations: Object.keys(multiLangTranslations).length > 0 ? multiLangTranslations : undefined,
        charMultiLangData:     Object.keys(charMultiLangData).length > 0     ? charMultiLangData     : undefined,
        chapterMultiLangData:  Object.keys(chapterMultiLangData).length > 0  ? chapterMultiLangData  : undefined,
        introMultiLangData: Object.keys(introMultiLangData).length > 0 ? introMultiLangData : undefined,
        storeCoverUris: storeCoverUris.length > 0 ? storeCoverUris : undefined,
        savedAt: Date.now()
  };
      appStorage.set(`${DRAFT_KEY_PREFIX}${storyId}`, JSON.stringify(draft));
      appStorage.set('@active_draft_id', storyId);
      const rawList = appStorage.getString(MY_STORIES_KEY) ?? null;
      const list = rawList ? (() => { try { return JSON.parse(rawList); } catch { return []; } })() : [];
      const existingIdx = list.findIndex((s: { id: string }) => s.id === storyId);
      const entry = {
        id: storyId, title: storyTitle ?? t?.defaultStoryTitle,
        status: 'draft' as const, updatedAt: Date.now(),
        viewCount: existingIdx >= 0 ? list[existingIdx].viewCount : 0,
        likeCount: existingIdx >= 0 ? list[existingIdx].likeCount : 0,
        description: storyDesc,
        genre: storyGenre || undefined,
        cover_urls: storeCoverUris,
        story_config: {
          cover_urls: storeCoverUris,
          linkedServerStoryId: linkedServerStoryId || undefined,
          genre: storyGenre || undefined,
          storyStylePreset: storyStylePreset || undefined,
          story_style_preset: storyStylePreset || undefined,
          storyHashtag,
          worldSetting }
  };
      if (existingIdx >= 0) list[existingIdx] = entry;
      else list.unshift(entry);
      appStorage.set(MY_STORIES_KEY, JSON.stringify(list));
      return storyId;
    },
    onSuccess: () => {
      ToastService.success(t?.toastSaveOk ?? screenT.toastSaveOk);
      queryClient.invalidateQueries({ queryKey: ['my-stories'] });
      // [BUG FIX] 임시저장 후 즉시 CreateScreen으로 이동
      (navigation.navigate as any)('Main', { screen: 'Create' });
    },
    onError: (e: unknown) => {
      ToastService.error((e as Error)?.message ?? (t?.toastSaveFail ?? screenT.saveFailed));
    }
  });

  const saveDraft = useCallback(() => {
    saveDraftMutation.mutate();
  }, [saveDraftMutation]);

  // [BUG FIX] 무음 백그라운드 자동 저장 (Auto-Save)
  // 유저가 임시저장 버튼을 누르지 않아도, 2초간 입력이 없으면 MMKV에 안전하게 상태를 플러시하여
  // 다국어 입력 지연이나 렌더링 부하로 인한 앱 크래시 시 데이터 유실을 완벽히 방지합니다.
  useEffect(() => {
    if (!storyTitle.trim()) return;
    const timeout = setTimeout(() => {
      startTransition(() => {
        try {
          const storyId = draftStorageId;
          const charactersToPersist = sanitizedCharacters.map(c => ({ ...c, personalityExample: '' }));
          const draftCharacters = charactersToPersist.map(stripCharacterEmotionFields);
          const draftChapters = chapters.map((chapter) => sanitizeChapterForPersistence(chapter));
          const draftBackgrounds = sanitizeBackgroundsForPersistence(backgrounds);
          const draftIntroMessages = sanitizeIntroMessagesMapForPersistence(introMessages);
          
          const draft = {
            storyId, storyTitle, storyDesc, storyHashtag,
            storyGenre: storyGenre || undefined,
            storyStylePreset: storyStylePreset || undefined,
            linkedServerStoryId: linkedServerStoryId || undefined,
            worldSetting,
            userSetting,
            characters: draftCharacters,
            chapters: draftChapters,
            backgrounds: draftBackgrounds,
            introMessages: draftIntroMessages,
            multiLangTranslations: Object.keys(multiLangTranslations).length > 0 ? multiLangTranslations : undefined,
            charMultiLangData:     Object.keys(charMultiLangData).length > 0     ? charMultiLangData     : undefined,
            chapterMultiLangData:  Object.keys(chapterMultiLangData).length > 0  ? chapterMultiLangData  : undefined,
            introMultiLangData: Object.keys(introMultiLangData).length > 0 ? introMultiLangData : undefined,
            storeCoverUris: storeCoverUris.length > 0 ? storeCoverUris : undefined,
            savedAt: Date.now()
          };
          appStorage.set(`${DRAFT_KEY_PREFIX}${storyId}`, JSON.stringify(draft));
          appStorage.set('@active_draft_id', storyId);

          const rawList = appStorage.getString(MY_STORIES_KEY) ?? null;
          const list = rawList ? (() => { try { return JSON.parse(rawList); } catch { return []; } })() : [];
          const existingIdx = list.findIndex((s: { id: string }) => s.id === storyId);
          const entry = {
            id: storyId, title: storyTitle ?? t?.defaultStoryTitle,
            status: 'draft' as const, updatedAt: Date.now(),
            viewCount: existingIdx >= 0 ? list[existingIdx].viewCount : 0,
            likeCount: existingIdx >= 0 ? list[existingIdx].likeCount : 0,
            description: storyDesc,
            genre: storyGenre || undefined,
            cover_urls: storeCoverUris,
            story_config: {
              cover_urls: storeCoverUris,
              linkedServerStoryId: linkedServerStoryId || undefined,
              genre: storyGenre || undefined,
              storyStylePreset: storyStylePreset || undefined,
              story_style_preset: storyStylePreset || undefined,
              storyHashtag,
              worldSetting }
          };
          if (existingIdx >= 0) list[existingIdx] = entry;
          else list.unshift(entry);
          appStorage.set(MY_STORIES_KEY, JSON.stringify(list));
        } catch (e) {
          console.warn('[AutoSave bgSync] failed', e);
        }
      });
    }, 2000);
    return () => clearTimeout(timeout);
  }, [
    backgrounds, chapters, charMultiLangData, chapterMultiLangData, draftStorageId, introMessages, introMultiLangData,
    linkedServerStoryId, multiLangTranslations, sanitizedCharacters, storeCoverUris, storyDesc, storyGenre,
    storyStylePreset,
    storyHashtag, storyTitle, t, userSetting, worldSetting
  ]);


  const saveImagesOnlyMutation = useMutation({
    mutationFn: async () => {
      const storyId = existingStory?.id ?? loadStoryId;
      if (!storyId || isLocalDraftStoryId(String(storyId))) {
        throw new Error('missing_story_id');
      }
      const charactersToPersist = sanitizedCharacters.map(c => ({ ...c, personalityExample: '' }));

      const finalCoverUris = await uploadCoverAssets(storyId, storeCoverUris);
      const finalBackgrounds = await uploadBackgroundAssets(storyId, backgrounds);
      const finalCharacters = await uploadCharacterAssets(storyId, charactersToPersist);
      const hasPendingCover = hasPendingCoverUpload(storeCoverUris, finalCoverUris);
      if (hasPendingCover) throw new Error('cover_upload_failed');
      if (hasPendingBackgroundUpload(backgrounds, finalBackgrounds)) throw new Error('background_upload_failed');
      if (hasPendingCharacterUpload(charactersToPersist, finalCharacters)) throw new Error('character_upload_failed');
      const coverFallback = getFirstCharacterFallbackCover(finalCharacters);
      const resolvedCoverUris = finalCoverUris.length > 0
        ? finalCoverUris.filter(isRemoteAssetUri)
        : (coverFallback ? [coverFallback] : []);

      setStoreCoverUris(resolvedCoverUris);
      setBackgrounds(finalBackgrounds);
      setCharacters(finalCharacters);

      const result = await StoryAPI.updateStoryImages(storyId, {
        cover_urls: resolvedCoverUris,
        bg_urls: finalBackgrounds.map(bg => bg.uri ?? ''),
        characters: finalCharacters
          .filter(character => character.id >= 1)
          .map(character => ({ id: character.id, imageUris: character.imageUris })) }, jwtToken);

      if (!result.success) {
        throw new Error('image_update_failed');
      }

      const draftKey = `${DRAFT_KEY_PREFIX}${storyId}`;
      const rawDraft = appStorage.getString(draftKey) ?? null;
      if (rawDraft) {
        try {
          const draft = JSON.parse(rawDraft) as Record<string, unknown>;
          draft.storeCoverUris = resolvedCoverUris;
          draft.backgrounds = sanitizeBackgroundsForPersistence(finalBackgrounds);
          draft.characters = finalCharacters.map(stripCharacterEmotionFields);
          appStorage.set(draftKey, JSON.stringify(draft));
        } catch {}
      }

      return storyId;
    },
    onMutate: () => {
      ToastService.info((t as Record<string, string | undefined>).saving ?? screenT.savingLabel);
    },
    onSuccess: () => {
      ToastService.success((t as Record<string, string | undefined>).saveSuccess ?? t?.toastSaveOk ?? screenT.toastSaveOk);
      queryClient.invalidateQueries({ queryKey: ['my-stories'] });
    },
    onError: (e: unknown) => {
      ToastService.error((t as Record<string, string | undefined>).saveFailed ?? (e as Error)?.message ?? screenT.saveFailed);
    } });

  const saveImagesOnly = useCallback(() => {
    saveImagesOnlyMutation.mutate();
  }, [saveImagesOnlyMutation]);

  // [sanitized comment]
  // [sanitized comment]
  // [sanitized comment]
  const saveToServerMutation = useMutation({
    mutationFn: async () => {
      if (isSubmittingRef.current) throw new Error('already_submitting');
      isSubmittingRef.current = true;
      let saveStage = 'start';
      try {

      const storyId = draftStorageId;
      // [BUG FIX] 500 에러 방어: 로컬 드래프트 ID(story_...)인 경우 서버에선 존재하지 않으므로 isNew=true로 취급 (POST 유도)
      const isNew = !existingStory?.id && (!loadStoryId || isLocalDraftStoryId(loadStoryId));
      let workingStoryId = storyId;
      const createServerDraft = async (): Promise<string> => {
        saveStage = 'create-server-draft';
        const bootstrapRes = await authedFetch('/story-meta', {
          method: 'POST',
          body: JSON.stringify({
            title: storyTitle,
            description: storyDesc,
            genre: storyGenre || undefined,
            story_config: {} }) });
        if (!bootstrapRes.ok) {
          const bootstrapBody = await readResponseDebugBody(bootstrapRes);
          console.warn('[StoryEditor] Draft bootstrap failed', {
            status: bootstrapRes.status,
            responseBody: bootstrapBody,
            title: storyTitle,
            description: storyDesc,
            genre: storyGenre || undefined,
          });
          throw new Error(getServerErrorMessage(bootstrapBody) || `Create draft failed ${bootstrapRes.status}`);
        }
        const bootstrapData = await bootstrapRes.json().catch(() => ({}));
        if (!bootstrapData?.id) throw new Error('create_draft_missing_id');
        return bootstrapData.id;
      };
      if (isNew) {
        workingStoryId = await createServerDraft();
      }
      const charactersToPersist = sanitizedCharacters.map(c => ({ ...c, personalityExample: '' }));

      Sentry.addBreadcrumb({ category: 'editor.save', message: `저장 시작: ${storyId} (isNew: ${isNew})`, level: 'info',
        data: { isNew, chapters: chapters.length, characters: charactersToPersist.length } });

      // [sanitized comment]
      saveStage = 'upload-cover-assets';
      let finalCoverUris = await uploadCoverAssets(workingStoryId, storeCoverUris);
      // 업로드 실패 시에도 현재 선택된 이미지 유지
      if (finalCoverUris.length === 0 && storeCoverUris.length > 0) {
        finalCoverUris = storeCoverUris;
      }
        Sentry.addBreadcrumb({ category: 'editor.upload', message: '단일 이미지 업로드 시작', level: 'info' });
      saveStage = 'upload-background-assets';
      let finalBackgrounds = await uploadBackgroundAssets(workingStoryId, backgrounds);
      const hasLocalBgs = false;
      if (hasLocalBgs) {
        Sentry.addBreadcrumb({ category: 'editor.upload', message: '커버 이미지 업로드 시작', level: 'info' });
        const uploadedBgUris = await uploadImages(
          backgrounds.map(bg => bg.uri).filter(Boolean), 'bg', workingStoryId, jwtToken
        );
        finalBackgrounds = backgrounds.map((bg, i) => ({ ...bg, uri: uploadedBgUris[i] ?? bg.uri }));
        setBackgrounds(finalBackgrounds); // Update state immediately after upload
      }

      saveStage = 'upload-character-assets';
      let finalCharacters = await uploadCharacterAssets(workingStoryId, charactersToPersist);
      const hasLocalCharImages = false;
      if (hasLocalCharImages) {
        Sentry.addBreadcrumb({ category: 'editor.upload', message: '추가 이미지 업로드 시작', level: 'info' });
        const uploadedChars = await Promise.all(
          charactersToPersist.map(async (c) => {
            if (c.id < 1 || c.imageUris.length === 0) return c;
            const uploadedUris: string[] = [];
            for (let imgIdx = 0; imgIdx < c.imageUris.length; imgIdx++) {
              const uri = c.imageUris[imgIdx];
              if (uri && !uri.startsWith('http')) {
                const url = await uploadImageToR2(uri, 'profile', workingStoryId, jwtToken, { bgIndex: imgIdx, charId: String(c.id) });
                uploadedUris.push(url ?? uri);
              } else {
                uploadedUris.push(uri);
              }
            }
            return { ...c, imageUris: uploadedUris };
          })
        );
        finalCharacters = uploadedChars;
        setCharacters(finalCharacters); // Update state immediately after upload
      }

      const hasLocalCover = false;
      if (hasLocalCover) {
        finalCoverUris = await uploadImages(storeCoverUris, 'cover', workingStoryId, jwtToken);
        setStoreCoverUris(finalCoverUris); // Update state immediately after upload
      }

      if (finalCoverUris.some(u => !isRemoteAssetUri(u))) {
        saveStage = 'reupload-cover-assets';
        finalCoverUris = await uploadImages(finalCoverUris, 'cover', workingStoryId, jwtToken);
        setStoreCoverUris(finalCoverUris); // Update state to persist uploaded URLs locally
      }

      // ✅ [BUG FIX] 이중 업로드 제거 - 이미 업로드된 http:// URI만 필터링
      saveStage = 'normalize-upload-results';
      finalCoverUris = finalCoverUris.filter(isRemoteAssetUri);
      finalBackgrounds = finalBackgrounds.map(bg => ({ ...bg, uri: isRemoteAssetUri(bg.uri) ? bg.uri : '' }));
      finalCharacters = finalCharacters.map(character => ({
        ...character,
        imageUris: character.imageUris.filter(isRemoteAssetUri) }));
      
      const hasPendingCover = hasPendingCoverUpload(storeCoverUris, finalCoverUris);
      if (hasPendingCover) {
        throw new Error('cover_upload_failed');
      }
      if (hasPendingBackgroundUpload(backgrounds, finalBackgrounds)) {
        throw new Error('background_upload_failed');
      }
      if (hasPendingCharacterUpload(charactersToPersist, finalCharacters)) {
        throw new Error('character_upload_failed');
      }
      const characterFallbackCover = getFirstCharacterFallbackCover(finalCharacters);
      if (finalCoverUris.length === 0 && characterFallbackCover) {
        finalCoverUris = [characterFallbackCover];
      }

      if (storeCoverUris.length > 0 && finalCoverUris.length === 0) {
        throw new Error('cover_upload_failed');
      }

      setStoreCoverUris(finalCoverUris);
      setBackgrounds(finalBackgrounds);
      setCharacters(finalCharacters);

      saveStage = 'build-save-payload';
      const chaptersWithIntro = chapters.map((ch, i) => ({
        ...ch,
        intro: introMessages[i === 0 ? 'chapter_1' : ch.id] || [],
        isEnding: ch.isEnding ?? false
  }));
      const payloadCharacters = finalCharacters.map(stripCharacterEmotionFields);
      const payloadChapters = chaptersWithIntro.map((chapter) => sanitizeChapterForPersistence(chapter));
      const payloadBackgrounds = sanitizeBackgroundsForPersistence(finalBackgrounds);

      const payload = editorToSavePayload(workingStoryId, {
        storyTitle, storyDesc, storyHashtag,
        storyGenre: storyGenre || undefined,
        storyStylePreset: storyStylePreset || undefined,
        worldSetting,
        userSetting,
        characters: payloadCharacters as any,
        chapters: payloadChapters as any,
        backgrounds: payloadBackgrounds as any,
        introMessages: sanitizeIntroMessagesMapForPersistence(introMessages),
        multiLangTranslations: Object.keys(multiLangTranslations).length > 0 ? multiLangTranslations : undefined,
        charMultiLangData: Object.keys(charMultiLangData).length > 0 ? charMultiLangData : undefined,
        chapterMultiLangData: Object.keys(chapterMultiLangData).length > 0 ? chapterMultiLangData : undefined,
        introMultiLangData: Object.keys(introMultiLangData).length > 0 ? introMultiLangData : undefined,
        coverUrls: finalCoverUris.length > 0 ? finalCoverUris : undefined,
        authorName: authUser?.name || myProfile?.name || undefined,
        authorId: authUser?.id ?? undefined,
        authorAvatar: sanitizeNullableImageUrl(authUser?.photo ?? myProfile?.avatarUri ?? null) ?? undefined,
        authorEmail: authUser?.email ?? undefined
  });

      // [BUG FIX] 서버 라우터는 PUT /story-meta/:id 만 처리 (PATCH 아님)
      const method = 'PUT';
      const saveUrl = `/story-meta/${workingStoryId}`;
      saveStage = 'request-story-save';
      let saveRes = await authedFetch(saveUrl, {
        method,
        body: JSON.stringify(payload)
      });

      // ✅ [BUG FIX] DB 초기화/서버 에러로 기존 draft가 지워진 경우 (PUT 시 404 발생)
      // POST로 재시도하여 신규 스토리로 강제 등록
      if (!isNew && saveRes.status === 404) {
        console.warn(`[Editor] Story ${storyId} not found on server. Recreating draft and retrying.`);
        saveStage = 'retry-create-server-draft';
        workingStoryId = await createServerDraft();
        saveStage = 'retry-upload-assets';
        finalCoverUris = (await uploadCoverAssets(workingStoryId, storeCoverUris)).filter(isRemoteAssetUri);
        finalBackgrounds = (await uploadBackgroundAssets(workingStoryId, backgrounds)).map(bg => ({
          ...bg,
          uri: isRemoteAssetUri(bg.uri) ? bg.uri : '' }));
        finalCharacters = (await uploadCharacterAssets(workingStoryId, charactersToPersist)).map(character => ({
          ...character,
          imageUris: character.imageUris.filter(isRemoteAssetUri) }));
        const hasPendingRetryCover = hasPendingCoverUpload(storeCoverUris, finalCoverUris);
        if (hasPendingRetryCover) {
          throw new Error('cover_upload_failed');
        }
        if (hasPendingBackgroundUpload(backgrounds, finalBackgrounds)) {
          throw new Error('background_upload_failed');
        }
        if (hasPendingCharacterUpload(charactersToPersist, finalCharacters)) {
          throw new Error('character_upload_failed');
        }
        const retryCharacterFallbackCover = getFirstCharacterFallbackCover(finalCharacters);
        if (finalCoverUris.length === 0 && retryCharacterFallbackCover) {
          finalCoverUris = [retryCharacterFallbackCover];
        }
        if (storeCoverUris.length > 0 && finalCoverUris.length === 0) {
          throw new Error('cover_upload_failed');
        }
        setStoreCoverUris(finalCoverUris);
        setBackgrounds(finalBackgrounds);
        setCharacters(finalCharacters);
        const retryPayloadCharacters = finalCharacters.map(stripCharacterEmotionFields);
        const retryPayloadChapters = chaptersWithIntro.map((chapter) => sanitizeChapterForPersistence(chapter));
        const retryPayloadBackgrounds = sanitizeBackgroundsForPersistence(finalBackgrounds);
        const retryPayload = editorToSavePayload(workingStoryId, {
          storyTitle, storyDesc, storyHashtag,
          storyGenre: storyGenre || undefined,
          storyStylePreset: storyStylePreset || undefined,
          worldSetting,
          userSetting,
          characters: retryPayloadCharacters as any,
          chapters: retryPayloadChapters as any,
          backgrounds: retryPayloadBackgrounds as any,
          introMessages: sanitizeIntroMessagesMapForPersistence(introMessages),
          multiLangTranslations: Object.keys(multiLangTranslations).length > 0 ? multiLangTranslations : undefined,
          charMultiLangData: Object.keys(charMultiLangData).length > 0 ? charMultiLangData : undefined,
          chapterMultiLangData: Object.keys(chapterMultiLangData).length > 0 ? chapterMultiLangData : undefined,
          introMultiLangData: Object.keys(introMultiLangData).length > 0 ? introMultiLangData : undefined,
          coverUrls: finalCoverUris.length > 0 ? finalCoverUris : undefined,
          authorName: authUser?.name || myProfile?.name || undefined,
          authorId: authUser?.id ?? undefined,
          authorAvatar: sanitizeNullableImageUrl(authUser?.photo ?? myProfile?.avatarUri ?? null) ?? undefined,
          authorEmail: authUser?.email ?? undefined
        });
        saveStage = 'retry-request-story-save';
        saveRes = await authedFetch(`/story-meta/${workingStoryId}`, {
          method: 'PUT',
          body: JSON.stringify(retryPayload)
        });
      }

      if (!saveRes.ok) {
        const saveErrorBody = await readResponseDebugBody(saveRes);
        const saveErrorMessage = getServerErrorMessage(saveErrorBody);
        console.warn('[StoryEditor] Save request failed', {
          status: saveRes.status,
          url: saveUrl,
          storyId: workingStoryId,
          isNew,
          responseBody: saveErrorBody,
          chapters: summarizeChaptersForDebug(chaptersWithIntro),
          backgroundChapterLinks: finalBackgrounds.map((background) => ({
            label: background.label,
            chapterIds: (background.conditions ?? [])
              .filter((condition) => condition.type === 'chapter')
              .map((condition) => condition.chapterId ?? ''),
          })),
          characterIds: finalCharacters.map((character) => character.id),
        });
        if (saveRes.status === 400 && (saveErrorMessage.includes('under_review') || saveErrorMessage.includes('under review'))) {
          throw new Error('under_review');
        }
        Sentry.addBreadcrumb({
          category: 'editor.save',
          message: '저장 실패',
          level: 'error',
          data: {
            status: saveRes.status,
            error: saveErrorMessage || undefined,
            storyId: workingStoryId,
          },
        });
        throw new Error(saveErrorMessage || `Save failed ${saveRes.status}`);
      }
      
      const saveResponseData = await saveRes.json().catch(() => ({}));
      const finalServerStoryId = saveResponseData.id || workingStoryId;

      Sentry.addBreadcrumb({ category: 'editor.save', message: '저장 성공', level: 'info' });
      // [BUG FIX] 제출(submit) 단계에서 404 발생 시 스토리 등록 자체가 실패하지 않도록 예외 처리 보완
      try {
        saveStage = 'submit-story';
        const submitRes = await authedFetch(`/story-meta/${finalServerStoryId}/submit`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        if (!submitRes.ok) {
          const submitBody = await readResponseDebugBody(submitRes);
          console.warn('[StoryEditor] Submit endpoint failed', {
            status: submitRes.status,
            storyId: finalServerStoryId,
            responseBody: submitBody,
          });
        }
      } catch (err) {
        console.warn('[Editor] Submit call error (ignored):', err);
      }

      // [sanitized comment]
      clearLocalDraftArtifacts([draftStorageId, storyId, loadStoryId]);

      const rawStories = appStorage.getString(MY_STORIES_KEY) ?? null;
      const list = rawStories ? (() => { try { return JSON.parse(rawStories); } catch { return []; } })() : [];
      const idx = list.findIndex((s: { id: string }) => s.id === finalServerStoryId);
      const entry = {
        id: finalServerStoryId, title: storyTitle, status: 'review' as const,
        updatedAt: Date.now(),
        viewCount: idx >= 0 ? list[idx].viewCount : 0,
        likeCount: idx >= 0 ? list[idx].likeCount : 0,
        description: storyDesc,
        genre: storyGenre || undefined
  };
      if (idx >= 0) list[idx] = entry; else list.unshift(entry);
      appStorage.set(MY_STORIES_KEY, JSON.stringify(list));
      appStorage.remove('@active_draft_id');

      return finalServerStoryId;
      } catch (error) {
        const baseMessage = error instanceof Error ? error.message : String(error);
        console.warn('[StoryEditor] Save pipeline failed before completion', {
          stage: saveStage,
          storyTitle,
          storyId: draftStorageId,
          loadStoryId,
          existingStoryId: existingStory?.id ?? null,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
          coverCount: storeCoverUris.filter(hasAssetUri).length,
          backgroundCount: backgrounds.filter((background) => hasAssetUri(background.uri)).length,
          characterImageCounts: sanitizedCharacters.map((character) => ({
            id: character.id,
            imageCount: character.imageUris.filter(hasAssetUri).length,
          })),
        });
        if (baseMessage === 'under_review' || baseMessage.startsWith('save_stage:')) {
          throw error;
        }
        throw new Error(`save_stage:${saveStage} ${baseMessage}`);
      }
    },
    onMutate: () => {
      // [sanitized comment]
      const storyTranslated = Object.keys(multiLangTranslations).length >= LANGUAGE_LIST.length;
      const translationIncomplete = !storyTranslated || (Object.keys(charMultiLangData).length === 0 && regularCharacters.length > 0);
      if (translationIncomplete) {
        ToastService.info((t as Record<string, string | undefined>).translateInProgress ?? t?.multiLangBtn ?? screenT.translateInProgress);
      }
      ToastService.info((t as Record<string, string | undefined>).editorSubmit ?? screenT.editorSubmit);
      // ✅ [BUG FIX] 제출하기 누르면 바로 제작 페이지로 이동 (저장 완료 기다리지 않음)
      (navigation.navigate as any)('Main', { screen: 'Create' });
    },
    onSuccess: (_storyId: string) => {
      ToastService.success(t?.toastSaveOk ?? screenT.toastSaveOk);
      queryClient.invalidateQueries({ queryKey: ['my-stories'] });
      isSubmittingRef.current = false;
    },
    onError: (e: unknown) => {
      isSubmittingRef.current = false;
      if ((e as Error)?.message === 'under_review') {
        ToastService.error((t as Record<string, string | undefined>).storyUnderReview ?? t?.statusReview);
      } else if ((e as Error)?.message !== 'already_submitting') {
        ToastService.error((t?.toastSaveFail ?? screenT.saveFailed) + ((e as Error)?.message ?? ''));
        // 게시 실패 시 자동으로 임시저장
        try {
          saveDraftMutation.mutate();
        } catch (draftErr) {
          console.error('[saveToServer] Draft save on error failed:', draftErr);
        }
      }
      Sentry.captureException(e, { tags: { feature: 'story_editor_save' } });
    }
  });

  const isPublishable = React.useMemo(() => {
    // 필수 입력 필드 체크
    if (!deferredStoryTitle.trim()) return false;
    if (!deferredStoryDesc.trim()) return false;
    if (!deferredStoryGenre.trim()) return false;
    if (!deferredStoryStylePreset.trim()) return false;

    // 다국어 번역 완료 체크
    const sI18nDone = Object.keys(deferredMultiLangTranslations).length >= (LANGUAGE_LIST?.length || 15);
    if (!sI18nDone) return false;

    const tChars = deferredRegularCharacters;
    const cI18nDone = tChars.length === 0 || tChars.every(c =>
      Object.keys(deferredCharMultiLangData[c.id] ?? {}).length >= (LANGUAGE_LIST?.length || 15)
    );
    if (!cI18nDone) return false;

    const tChapters = deferredChapters.filter(ch => ch.choiceEvents && ch.choiceEvents.length > 0);
    const chI18nDone = tChapters.length === 0 || tChapters.every(ch =>
      Object.keys(deferredChapterMultiLangData[ch.id] ?? {}).length >= (LANGUAGE_LIST?.length || 15)
    );
    if (!chI18nDone) return false;

    return true;
  }, [
    deferredChapterMultiLangData,
    deferredChapters,
    deferredCharMultiLangData,
    deferredMultiLangTranslations,
    deferredRegularCharacters,
    deferredStoryDesc,
    deferredStoryGenre,
    deferredStoryStylePreset,
    deferredStoryTitle,
  ]);

  const checkIsPublishable = useCallback(() => isPublishable, [isPublishable]);

  // ✅ [PERFORMANCE FIX] buildPromptFn을 useCallback으로 감싸서 매 렌더마다 새 함수 생성 방지
  const storyBuildPrompt = useCallback(
    (langs: Language[]) => buildMultiLangPrompt(deferredStoryTitle, deferredStoryDesc, deferredStoryHashtag, langs),
    [deferredStoryDesc, deferredStoryHashtag, deferredStoryTitle]
  );

  const charBuildPrompt = useCallback(
    (langs: Language[]) => buildAllCharsPrompt(deferredSanitizedCharacters, langs, userSetting),
    [deferredSanitizedCharacters, userSetting]
  );

  const introBuildPrompt = useCallback(
    (langs: Language[]) => buildIntroPrompt(deferredIntroMessages.chapter_1 || [], langs),
    [deferredIntroMessages]
  );

  const chapterBuildPrompt = useCallback(
    (langs: Language[]) => buildAllChaptersPrompt(deferredChapters, langs),
    [deferredChapters]
  );

  const saveToServer = useCallback(() => {
    if (!storyTitle.trim()) { ToastService.info(t?.toastTitleRequired ?? ''); return; }
    if (!storyDesc.trim()) { ToastService.info((t as Record<string, string | undefined>).toastDescRequired ?? screenT.toastDescRequired); return; }
    if (!storyGenre.trim()) { ToastService.info(screenT.selectGenreRequired); return; }
    if (!storyStylePreset.trim()) { ToastService.info((t as Record<string, string | undefined>).selectStylePresetRequired ?? ''); return; }

    const chapterValidationMessage = getChapterValidationMessage(chapters, backgrounds, t);
    if (chapterValidationMessage) {
      ToastService.error(chapterValidationMessage);
      return;
    }

    const isStoryI18nDone = Object.keys(multiLangTranslations).length >= LANGUAGE_LIST.length;
    const _translatableChars = regularCharacters;
    const isCharI18nDone = _translatableChars.length === 0 || _translatableChars.every(c => (
      Object.keys(charMultiLangData[c.id] ?? {}).length >= LANGUAGE_LIST.length
    ));
    const translatableChapters = chapters.filter(ch => ch.choiceEvents && ch.choiceEvents.length > 0);
    const isChapterI18nDone = translatableChapters.length === 0 || translatableChapters.every(ch => (
      Object.keys(chapterMultiLangData[ch.id] ?? {}).length >= LANGUAGE_LIST.length
    ));

    if (!isStoryI18nDone || !isCharI18nDone || !isChapterI18nDone) {
      if (!isStoryI18nDone) {
        ToastService.info((t as Record<string, string | undefined>)?.translateBasicFirst ?? screenT.translateBasicFirst);
      } else if (!isCharI18nDone) {
        ToastService.info((t as Record<string, string | undefined>)?.translateCharFirst ?? screenT.translateCharFirst);
      } else {
        ToastService.info((t as Record<string, string | undefined>)?.translateChapterFirst ?? screenT.translateChapterFirst);
      }
      return;
    }
    saveToServerMutation.mutate();
    // [BUG FIX] 즉시 페이지 이탈 (사용자 강력 요청 반영: 임시 저장처럼 클릭 즉시 메인으로 이동)
  }, [
    saveToServerMutation,
    chapters,
    backgrounds,
    chapterMultiLangData,
    regularCharacters,
    charMultiLangData,
    multiLangTranslations,
    storyTitle,
    storyDesc,
    storyGenre,
    storyStylePreset,
    t,
  ]);

  // [sanitized comment]
  React.useEffect(() => {
    if (!loadStoryId) return;
    const raw = appStorage.getString(`${DRAFT_KEY_PREFIX}${loadStoryId}`) ?? null;
    let draft: Record<string, unknown> | null = null;
    if (raw) {
      try { draft = JSON.parse(raw); } catch { appStorage.remove(`${DRAFT_KEY_PREFIX}${loadStoryId}`); }
    }
    let cancelled = false;
    (async () => {
      try {
        if (draft && !isImageOnlyEditor) {
          if (cancelled) return;
          const resolvedDraftModelId = resolveStoryModelId(draft);
          if (resolvedDraftModelId) setStoryModelId(resolvedDraftModelId);
          if (draft.storyTitle) setStoryTitle(draft.storyTitle as string);
          if (draft.storyDesc) setStoryDesc(draft.storyDesc as string);
          if (draft.storyGenre) setStoryGenre(normalizeStoryGenre(draft.storyGenre as string));
          if ((draft as Record<string, unknown>).storyStylePreset) {
            setStoryStylePreset(normalizeStoryStylePreset((draft as Record<string, unknown>).storyStylePreset as string));
          }
          if (draft.storyHashtag) setStoryHashtag(draft.storyHashtag as string);
          if (draft.worldSetting) setWorldSetting(draft.worldSetting as string);
          const normalizedDraftUserSetting = normalizeUserSetting(draft.userSetting as Record<string, unknown>);
          setUserSetting(normalizedDraftUserSetting);
          if (draft.characters) {
            const draftChars = (draft.characters as unknown[]).map((char, index) => normalizeCharFromConfig(char as import('../../types/StoryContract').StoryCharacter, index + 2));
            // 캐릭1(유저) 정보가 누락되지 않도록 병합 보정
            if (draft.userSetting && !draftChars.find(c => c.id === 1)) {
              const userSetting = draft.userSetting as Record<string, unknown>;
              draftChars.push({
                id: 1, name: t?.speakerUser, imageUris: [],
                age: String(userSetting.age ?? ''),
                gender: String(userSetting.gender ?? ''),
                traits: String(userSetting.traits ?? ''),
                personality: String(userSetting.description ?? ''),
                personalityExample: '',
                description: String(userSetting.description ?? ''),
                appearance: String(userSetting.traits ?? ''),
                speech: ''
              });
            }
            setCharacters(buildFixedCharacters(draftChars.sort((a,b) => a.id - b.id), normalizedDraftUserSetting));
          }
          if (draft.chapters) setChapters(draft.chapters as ChapterDraft[]);
          if (Array.isArray(draft.backgrounds) && draft.backgrounds.length) {
            setBackgrounds(normalizeBackgroundItems(draft.backgrounds));
          }
          if (draft.introMessages) setIntroMessages(normalizeIntroMessagesMap(draft.introMessages as Record<string, unknown>));
          if ((draft as unknown as any).multiLangTranslations) setMultiLangTranslations((draft as unknown as any).multiLangTranslations);
          if ((draft as unknown as any).charMultiLangData) setCharMultiLangData((draft as unknown as any).charMultiLangData);
          if ((draft as unknown as any).chapterMultiLangData) setChapterMultiLangData((draft as unknown as any).chapterMultiLangData);
          if ((draft as unknown as any).introMultiLangData) setIntroMultiLangData((draft as unknown as any).introMultiLangData);
          if ((draft as unknown as any).storeCoverUris?.length) setStoreCoverUris((draft as unknown as any).storeCoverUris);
          // Toast removed as requested
        } else {
          const res = await authedFetch(`/story-meta/${loadStoryId}`);
          if (cancelled || !res.ok) return;
          const data = await res.json();
          if (data.status) setStatus(data.status);
          const resolvedServerModelId = resolveStoryModelId(data as Record<string, unknown>);
          if (resolvedServerModelId) setStoryModelId(resolvedServerModelId);
          const rawCfg = data.story_config ?? {};
          const cfg = typeof rawCfg === 'string'
            ? (() => { try { return JSON.parse(rawCfg); } catch { return {}; } })()
            : (rawCfg ?? {});
          if (cancelled) return;
          if (data.title) setStoryTitle(data.title);
          if (data.description) setStoryDesc(data.description);
          setStoryGenre(normalizeStoryGenre(
            ((data as Record<string, unknown>).genre as string) ||
            ((cfg as Record<string, unknown>).genre as string) ||
            ''
          ));
          setStoryStylePreset(normalizeStoryStylePreset(
            ((cfg as Record<string, unknown>).storyStylePreset as string) ||
            ((cfg as Record<string, unknown>).story_style_preset as string) ||
            ''
          ));
          if (cfg.storyHashtag) setStoryHashtag(cfg.storyHashtag);
          else if (cfg.tags?.length) setStoryHashtag(cfg.tags.map((tag: string) => `#${tag}`).join(' '));
          if (cfg.worldSetting) setWorldSetting(cfg.worldSetting);
          const normalizedServerUserSetting = normalizeUserSetting(cfg.userSetting);
          setUserSetting(normalizedServerUserSetting);
          if (cfg.characters?.length) {
            const rawChars = cfg.characters.map((char: any, index: number) => normalizeCharFromConfig(char, index + 2));
            // Ensure ID 1 (User) character exists, fallback to userSetting if missing
            if (cfg.userSetting && !rawChars.find((c: any) => c.id === 1)) {
              rawChars.push({
                id: 1, name: t?.speakerUser, imageUris: [],
                age: (cfg.userSetting as unknown as any).age,
                gender: (cfg.userSetting as unknown as any).gender,
                traits: (cfg.userSetting as unknown as any).traits,
                personality: (cfg.userSetting as unknown as any).description ?? '',
                personalityExample: '',
                description: (cfg.userSetting as unknown as any).description ?? '',
                appearance: (cfg.userSetting as unknown as any).traits ?? '',
                speech: ''
              });
            }
            setCharacters(buildFixedCharacters(rawChars.sort((a: any, b: any) => a.id - b.id), normalizedServerUserSetting));
          }
          if (cfg.chapters?.length) setChapters(cfg.chapters);
          if (cfg.backgrounds?.length) {
            setBackgrounds(normalizeBackgroundItems(cfg.backgrounds));
          }
          if (cfg.introMessages) {
            setIntroMessages(normalizeIntroMessagesMap(cfg.introMessages));
          } else if (cfg.chapters?.length) {
            // Extract intro messages from chapters if missing at root
            const extractedIntro: Record<string, IntroMessage[]> = {};
            cfg.chapters.forEach((ch: any, i: number) => {
              const chId = ch.id ?? (i === 0 ? 'chapter_1' : `chapter_ai_${i}`);
              if (Array.isArray(ch.intro)) {
                extractedIntro[chId] = ch.intro.map((msg: any) => normalizeIntroMessage(msg));
              }
            });
            setIntroMessages(extractedIntro);
          }
          if (cfg.multiLangTranslations) setMultiLangTranslations(cfg.multiLangTranslations);
          if (cfg.charMultiLangData) setCharMultiLangData(cfg.charMultiLangData);
          if (cfg.chapterMultiLangData) setChapterMultiLangData(cfg.chapterMultiLangData);
          if (cfg.introMultiLangData) setIntroMultiLangData(cfg.introMultiLangData);
          const coverUris: string[] = Array.isArray(data.cover_urls) ? data.cover_urls.slice(0, 3)
            : data.cover_url ? [data.cover_url]
            : Array.isArray(cfg.cover_urls) ? cfg.cover_urls.slice(0, 3) : [];
          if (coverUris.length > 0) setStoreCoverUris(coverUris);
          // Toast removed as requested
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [loadStoryId, jwtToken, t, isImageOnlyEditor, normalizeCharFromConfig, buildFixedCharacters, normalizeUserSetting]);

    const applyAIData = useCallback((data: import('../../types/StoryContract').StoryConfig) => {
    const safeData = { characters: data.characters ?? [], chapters: data.chapters ?? [] };
    if ((data as unknown as any).storyTitle) setStoryTitle((data as unknown as any).storyTitle);
    if ((data as unknown as any).storyDesc) setStoryDesc((data as unknown as any).storyDesc);
    if ((data as unknown as any).storyGenre) setStoryGenre(normalizeStoryGenre((data as unknown as any).storyGenre));
    if ((data as unknown as any).storyStylePreset || (data as unknown as any).story_style_preset) {
      setStoryStylePreset(normalizeStoryStylePreset(
        (data as unknown as any).storyStylePreset ?? (data as unknown as any).story_style_preset
      ));
    }
    if ((data as unknown as any).storyHashtag) setStoryHashtag((data as unknown as any).storyHashtag);
    if ((data as unknown as any).worldSetting) setWorldSetting((data as unknown as any).worldSetting);
    const normalizedAiUserSetting = normalizeUserSetting((data as unknown as any).userSetting);
    setUserSetting(normalizedAiUserSetting);

    // [sanitized comment]
    if (Array.isArray(safeData.characters) && safeData.characters.length > 0) {
      const aiChars: CharacterDraft[] = safeData.characters.map((c: import('../../types/StoryContract').StoryCharacter, i: number) => normalizeCharFromConfig(c, i + 2));

      setCharacters(buildFixedCharacters(aiChars, normalizedAiUserSetting));
      /*
        { id: 0, name: t?.speakerNarrator || screenT.speakerNarrator, imageUris: [], personality: '', personalityExample: '', age: '', gender: '', traits: '' },
        { id: 1, name: t?.speakerUser || screenT.speakerUser, imageUris: [], personality: '', personalityExample: '', age: userAge, gender: userGender, traits: userTraits },
      */
    }

    // [sanitized comment]
      if (Array.isArray(safeData.chapters) && safeData.chapters.length > 0) {
        // [sanitized comment]
        const nameToId: Record<string, number> = {};
        [
          t?.speakerNarrator,
          '내레이션',
          '나레이션',
          screenT.speakerNarrator,
          'narrator',
          'Narration',
          'narration',
        ].forEach((name) => {
          if (!name) return;
          nameToId[name.trim().toLowerCase()] = NARRATOR_CHAR_ID;
        });
        [
          t?.speakerUser,
          normalizedAiUserSetting?.name,
          '사용자',
          '유저',
          screenT.speakerUser,
          'user',
        ].forEach((name) => {
          if (!name) return;
          nameToId[name.trim().toLowerCase()] = USER_CHAR_ID;
        });
        if (Array.isArray(safeData.characters)) {
          safeData.characters.forEach((c: import('../../types/StoryContract').StoryCharacter, i: number) => {
            if (
              c.name &&
              !isNarratorLabel(c.name, t?.speakerNarrator) &&
              !isUserLabel(c.name, t?.speakerUser, normalizedAiUserSetting?.name)
            ) {
              nameToId[c.name.trim().toLowerCase()] = i + 2;
            }
        });
      }
      const resolveId = (name: string): number | undefined =>
        nameToId[name.trim().toLowerCase()];

      const newChs = safeData.chapters.map((ch: import('../../types/StoryContract').StoryChapter, i: number) => {
        const chId = ch.id ?? (i === 0 ? 'chapter_1' : `chapter_ai_${i}`);

        // [sanitized comment]
        const characterGoals: Record<number, string> = {};
        if (ch.characterGoals && typeof ch.characterGoals === 'object') {
          Object.entries(ch.characterGoals).forEach(([nameOrId, goal]: [string, any]) => {
            const numId = parseInt(nameOrId, 10);
            if (!isNaN(numId)) {
              characterGoals[numId] = goal;
            } else {
              const id = resolveId(nameOrId);
              if (id !== undefined) characterGoals[id] = goal;
            }
          });
        }

        const choiceEvents = Array.isArray(ch.choiceEvents)
          ? ch.choiceEvents.map((choiceEvent: any) => ({
              ...choiceEvent,
              triggerConditions: Array.isArray(choiceEvent?.triggerConditions)
                ? choiceEvent.triggerConditions.filter((trigger: any) => trigger?.type !== 'emotion')
                : [],
              options: Array.isArray(choiceEvent?.options)
                ? choiceEvent.options.map((option: any) => ({
                    id: option?.id ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    label: option?.label ?? '',
                    targetChapterId: option?.targetChapterId ?? '',
                  }))
                : [],
            }))
          : [];

        return {
          id: chId,
          title: ch.title ?? `${t?.editorChapterNum ?? screenT.editorChapterText} ${i + 1}`,
          aiGoal: ch.aiGoal ?? '',
          characterGoals,
          prevSummary: ch.prevSummary ?? '',
          chapterInfo: ch.chapterInfo ?? '',
          triggers: [{ type: 'cache' as const }],
          choiceEvents,
          isEnding: ch.isEnding ?? false
  };
      });

      setChapters(newChs as unknown as ChapterDraft[]);

      // [sanitized comment]
      const msgs: Record<string, IntroMessage[]> = {};
      const exp: Record<string, boolean> = {};
      newChs.forEach((ch, i) => {
        const srcCh = data.chapters[i];
        const introMsgsRaw = Array.isArray(srcCh?.introMessages) ? srcCh.introMessages : [];
        msgs[ch.id] = introMsgsRaw
          .filter((m: import('../../types/StoryContract').StoryIntroMessage) => m.speakerType !== 'emotion_delta')
          .map((m: import('../../types/StoryContract').StoryIntroMessage) => normalizeIntroMessage({
            ...m,
            speakerCharId: m.speakerName ? (resolveId(m.speakerName) ?? m.speakerCharId) : m.speakerCharId,
          }));
        exp[ch.id] = i === 0;
      });
      setIntroMessages(msgs);
      setIntroExpanded(exp);
    }

    // [sanitized comment]
    if ((data as unknown as any).multiLangData && typeof (data as unknown as any).multiLangData === 'object' && Object.keys((data as unknown as any).multiLangData).length > 0) {
      setMultiLangTranslations((data as unknown as any).multiLangData);
      setMultiLangExpanded(true);
    }

    // [sanitized comment]
    if ((data as unknown as any).charMultiLangData && typeof (data as unknown as any).charMultiLangData === 'object' && Object.keys((data as unknown as any).charMultiLangData).length > 0) {
      setCharMultiLangData((data as unknown as any).charMultiLangData);
    }
    if ((data as unknown as any).introMultiLangData && typeof (data as unknown as any).introMultiLangData === 'object' && Object.keys((data as unknown as any).introMultiLangData).length > 0) {
      setIntroMultiLangData((data as unknown as any).introMultiLangData);
    }

    setActiveTab('story');
    setExpandedChapters({});
  }, [t, normalizeCharFromConfig, buildFixedCharacters, normalizeUserSetting]);

  const addCharacter = () => {
    if (isLocked) return;
    // 0은 내레이션, 1은 사용자, 2~5는 AI 캐릭터다.
    if (characters.length >= 6) { ToastService.info(t?.toastMaxChars ?? screenT.maxCharactersNotice); return; }
  const id = characters.length;
  setCharacters(p => [...p, { id, name: `${t?.character ?? screenT.characterLabel} ${id}`, imageUris: [], personality: '', personalityExample: '', age: '', gender: '', traits: '' }]);
  setSelectedCharIdx(characters.length);
};
const updateChar = (idx: number, f: Partial<CharacterDraft>) => setCharacters(p => p.map((c, i) => i === idx ? { ...c, ...f } : c));
  const addChapter = () => {
    if (isLocked) return;
    const ch: ChapterDraft = { id: Date.now().toString(), title: `${t?.editorChapterNum ?? screenT.editorChapterText} ${chapters.length + 1}`, aiGoal: '', characterGoals: {}, prevSummary: '', chapterInfo: '', triggers: [{ type: 'cache' }], choiceEvents: [] };
    setChapters(p => [...p, ch]);
    setIntroMessages(p => ({ ...p, [ch.id]: [] }));
    setIntroExpanded(p => ({ ...p, [ch.id]: false }));
  };
  const handleChapterReorder = useCallback((nextChapters: ChapterDraft[]) => {
    const changed = nextChapters.some((chapter, index) => chapter.id !== chapters[index]?.id);
    if (!changed) return;
    setChapters(nextChapters);
    ToastService.success((t as Record<string, string | undefined>).chapterReordered ?? screenT.chapterReordered);
  }, [chapters, t]);
  const updateChapter = (id: string, f: Partial<ChapterDraft>) => setChapters(p => p.map(c => c.id === id ? { ...c, ...f } : c));
  const updateCharGoal = (chId: string, charId: number, goal: string) => setChapters(p => p.map(c => c.id === chId ? { ...c, characterGoals: { ...c.characterGoals, [charId]: goal } } : c));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _addTrigger = (chId: string) => setChapters(p => p.map(c => c.id === chId ? { ...c, triggers: [...c.triggers, { type: 'cache' }] } : c));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _updateTrigger = (chId: string, ti: number, f: Partial<TriggerDraft>) => setChapters(p => p.map(c => c.id === chId ? { ...c, triggers: c.triggers.map((tr, i) => i === ti ? { ...tr, ...f } : tr) } : c));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _removeTrigger = (chId: string, ti: number) => setChapters(p => p.map(c => c.id === chId ? { ...c, triggers: c.triggers.filter((_, i) => i !== ti) } : c));

  // [sanitized comment]
  const addChoiceEvent = (chId: string) => {
    if (isLocked) return;
    const newEvt: ChoiceEventDraft = {
      id: Date.now().toString(),
      prompt: '',
      triggerConditions: [{ type: 'conversation', convCount: 10 }],
      options: [
        { id: `opt_${Date.now()}_a`, label: '', targetChapterId: '' },
        { id: `opt_${Date.now()}_b`, label: '', targetChapterId: '' },
      ]
  };
    setChapters(p => p.map(c => c.id === chId ? { ...c, choiceEvents: [...c.choiceEvents, newEvt] } : c));
  };

  // [sanitized comment]

  const updateChoiceEvent = (chId: string, evtId: string, f: Partial<ChoiceEventDraft>) =>
    setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? { ...e, ...f } : e)
  } : c));
  const removeChoiceEvent = (chId: string, evtId: string) =>
    { if (isLocked) return; setChapters(p => p.map(c => c.id === chId ? { ...c, choiceEvents: c.choiceEvents.filter(e => e.id !== evtId) } : c)); };
  const addChoiceOption = (chId: string, evtId: string) =>
    { if (isLocked) return; setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? {
        ...e,
        options: [...e.options, { id: `opt_${Date.now()}`, label: '', targetChapterId: '' }]
  } : e)
  } : c)); };
  const updateChoiceOption = (chId: string, evtId: string, optId: string, f: Partial<ChoiceOptionDraft>) =>
    setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? {
        ...e,
        options: e.options.map(o => o.id === optId ? { ...o, ...f } : o)
  } : e)
  } : c));
  const removeChoiceOption = (chId: string, evtId: string, optId: string) =>
    setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? {
        ...e,
        options: e.options.filter(o => o.id !== optId)
  } : e)
  } : c));
  const addChoiceEventTrigger = (chId: string, evtId: string) =>
    { if (isLocked) return; setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? {
        ...e,
        triggerConditions: [...e.triggerConditions, { type: 'cache' as const }]
  } : e)
  } : c)); };
  const updateChoiceEventTrigger = (chId: string, evtId: string, ti: number, f: Partial<TriggerDraft>) =>
    setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? {
        ...e,
        triggerConditions: e.triggerConditions.map((tr, i) => i === ti ? { ...tr, ...f } : tr)
  } : e)
  } : c));
  const removeChoiceEventTrigger = (chId: string, evtId: string, ti: number) =>
    { if (isLocked) return; setChapters(p => p.map(c => c.id === chId ? {
      ...c,
      choiceEvents: c.choiceEvents.map(e => e.id === evtId ? {
        ...e,
        triggerConditions: e.triggerConditions.filter((_, i) => i !== ti)
  } : e)
  } : c)); };
  const addIntroMsg = () => {
    if (isLocked) return;
    if (!introInput.trim()) return;
    const msg = normalizeIntroMessage({
      id: Date.now().toString(),
      speakerType: introSpeaker,
      speakerCharId: introSpeaker === 'character' ? introSpeakerCharId : introSpeaker === 'user' ? USER_CHAR_ID : NARRATOR_CHAR_ID,
      content: introInput.trim(),
    });
    setIntroMessages(p => ({ ...p, [activeIntroKey]: [...(p[activeIntroKey] || []), msg] }));
    setIntroInput('');
  };
  const addIntroImage = async (key: string) => {
    if (isLocked) return;
    const uri = await pickImage(t);
    if (!uri) return;
    const msg: IntroMessage = { id: Date.now().toString(), speakerType: 'image', content: '', imageUri: uri };
    setIntroMessages(p => ({ ...p, [key]: [...(p[key] || []), msg] }));
  };
  const removeIntroMsg = (key: string, id: string) => { if (isLocked) return; setIntroMessages(p => ({ ...p, [key]: p[key].filter(m => m.id !== id) })); };

  // [sanitized comment]

    // [sanitized comment]
  const renderStory = () => (
    <View style={s.tabContent}>
      <SectionTitle title={t?.editorSectionBasic} />
      <FieldRow label={t?.title ?? ''} guideKey="storyTitle" t={t}>
        <TextInput style={[s.input, isLocked && { color: '#797990' }]} value={storyTitle} onChangeText={setStoryTitle} placeholder={t?.phStoryTitle} placeholderTextColor={'#757585'} editable={!isLocked} />
      </FieldRow>
      <FieldRow label={t?.description ?? ''} guideKey="storyDesc" t={t}>
        <TextInput style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]} value={storyDesc} onChangeText={setStoryDesc} multiline placeholder={t?.phStoryDesc} placeholderTextColor={'#757585'} editable={!isLocked} />
      </FieldRow>
      <FieldRow label={t?.genreLabel ?? screenT.genreLabel} guideKey="storyGenre" t={t}>
        <View style={s.genreWrap}>
          {storyGenreOptions.map((genre) => {
            const selected = storyGenre === genre.id;
            return (
              <TouchableOpacity
                key={genre.id}
                style={[s.genreChip, selected && s.genreChipOn, isLocked && s.genreChipDisabled]}
                onPress={() => { if (!isLocked) setStoryGenre(genre.id); }}
              >
                <Text style={[s.genreChipTxt, selected && s.genreChipTxtOn]}>
                  {genre.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FieldRow>
      <FieldRow label={(t as Record<string, string | undefined>).stylePresetLabel ?? ''} guideKey="storyStylePreset" t={t}>
        <View style={s.genreWrap}>
          {storyStylePresetOptions.map((preset) => {
            const selected = storyStylePreset === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[s.genreChip, selected && s.genreChipOn, isLocked && s.genreChipDisabled]}
                onPress={() => { if (!isLocked) setStoryStylePreset(preset.id); }}
              >
                <Text style={[s.genreChipTxt, selected && s.genreChipTxtOn]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FieldRow>
      <FieldRow label={t?.editorHashtag ?? ''} guideKey="storyHashtag" t={t}>
        <TextInput style={[s.input, isLocked && { color: '#797990' }]} value={storyHashtag} onChangeText={setStoryHashtag} placeholder={t?.phStoryHashtag} placeholderTextColor={'#757585'} editable={!isLocked} />
      </FieldRow>



      {/* Multi-language applied indicator removed per user request */}
      <FieldRow label={t?.editorCoverImage ?? ''} guideKey="storeCover" t={t}>
        {/* [sanitized comment] */}
        <View>
          {storeCoverUris.length > 0 ? (
            <View style={s.coverPickerWrap}>
              {/* [sanitized comment] */}
              <View style={s.coverPicker}>
                <Image
                  source={{ uri: storeCoverUris[coverPreviewIdx] }}
                  style={s.coverPreview}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              </View>
              {/* [sanitized comment] */}
              {storeCoverUris.length > 1 && (
                <>
                  {coverPreviewIdx > 0 && (
                    <TouchableOpacity style={[s.coverNavBtn, s.coverNavLeft]} onPress={() => setCoverPreviewIdx(i => i - 1)}>
                      <ChevronLeft size={20} color={'#F0F0F5'} />
                    </TouchableOpacity>
                  )}
                  {coverPreviewIdx < storeCoverUris.length - 1 && (
                    <TouchableOpacity style={[s.coverNavBtn, s.coverNavRight]} onPress={() => setCoverPreviewIdx(i => i + 1)}>
                      <ChevronRight size={20} color={'#F0F0F5'} />
                    </TouchableOpacity>
                  )}
                </>
              )}
              {/* [sanitized comment] */}
              <TouchableOpacity style={[s.imgDeleteBtn, !canEditImages && { opacity: 0.45 }]} disabled={!canEditImages} onPress={() => {
                setStoreCoverUris(prev => {
                  const next = prev.filter((_, i) => i !== coverPreviewIdx);
                  setCoverPreviewIdx(Math.min(coverPreviewIdx, next.length - 1));
                  return next;
                });
              }}>
                <XCircle size={18} color={'#F0F0F5'} />
              </TouchableOpacity>
              {/* [sanitized comment] */}
              {storeCoverUris.length > 1 && (
                <View style={s.coverDots}>
                  {storeCoverUris.map((_, i) => (
                    <View key={i} style={[s.coverDot, i === coverPreviewIdx && s.coverDotOn]} />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={s.coverPickerWrap}>
              <TouchableOpacity style={[s.coverPicker, !canEditImages && { opacity: 0.45 }]} activeOpacity={0.7} disabled={!canEditImages} onPress={async () => {
                console.log('[StoryEditor] Opening image picker for cover...');
                const uris = await pickImages(t, 3, { targetAspectRatio: 2 / 3, maxWidth: 1024, maxHeight: 1536 });
                console.log('[StoryEditor] Picked cover images:', uris);
                if (uris.length > 0) {
                  setStoreCoverUris(uris.slice(0, 3));
                  setCoverPreviewIdx(0);
                  console.log('[StoryEditor] Cover images set successfully');
                } else {
                  console.log('[StoryEditor] No images selected or cancelled');
                }
              }}>
                <Text style={s.coverPickerText}>{t?.editorBgSlot}{'\n'}2:3</Text>
                <Text style={{ color: '#797990', fontSize: 11, marginTop: 6 }}>{(t as Record<string, string | undefined>).selectAll ?? screenT.selectAllLabel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </FieldRow>
    </View>
  );

  const renderCharacters = () => {
    const char = characters[selectedCharIdx];
    const handlePersonalityChange = (value: string) => {
      if (value.length <= 500) {
        updateChar(selectedCharIdx, { personality: value });
      }
    };
    return (
      <View style={s.tabContent}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.charTabRow} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
          {characters.map((c, idx) => {
            if (c.id >= 2 && (isNarratorLabel(c.name, t?.speakerNarrator) || isUserLabel(c.name, t?.speakerUser, userSetting.name))) return null;
            if (c.id === 0) return null; // 나레이션 탭 숨김
            return (
            <TouchableOpacity key={`${c.id}_${idx}`} style={[s.charTab, selectedCharIdx === idx && s.charTabActive]} onPress={() => setSelectedCharIdx(idx)}>
              <Text style={[s.charTabText, selectedCharIdx === idx && s.charTabTextActive]}>
                {c.id === 1 ? t?.speakerUser : c.name || `${t?.character ?? screenT.characterLabel} ${c.id}`}
              </Text>
              {c.id >= 2 && <Text style={s.charIdBadge}>#{c.id}</Text>}
            </TouchableOpacity>
          );})}
          <TouchableOpacity style={[s.charAddBtn, isLocked && s.charAddBtnDisabled]} onPress={addCharacter} disabled={isLocked}><Text style={s.charAddBtnText}>{t?.editorCharAdd}</Text></TouchableOpacity>
        </ScrollView>
        {char && <>
          <View style={s.charIdInfo}>
            <Text style={s.charIdInfoText}>
              {char.id === 0 ? t?.editorCharFixed0 : char.id === 1 ? t?.editorCharFixed1 : `${((t?.editorCharLabel ?? screenT.characterIndexedLabel).replace('{id}', String(char.id)))}`}
            </Text>
          </View>
          {char.id >= 1 && <FieldRow label={t?.editorCharName ?? ''} guideKey="characterName" t={t}>
            <TextInput style={[s.input, isLocked && { color: '#797990' }]} value={char.name} onChangeText={v => updateChar(selectedCharIdx, { name: v })} placeholder={t?.phCharName} placeholderTextColor={'#757585'} editable={!isLocked && char.id !== 0} />
          </FieldRow>}

          {/* User setting: reserve id 1 for the player character */}
          {char.id === 1 && (
            <View style={{ marginTop: 4 }}>
              <View style={{ backgroundColor: '#0C0C14', borderRadius: 8, borderWidth: 1, borderColor: '#181820', padding: 12, marginBottom: 8, marginHorizontal: 0 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <TextInput
                    style={[s.input, isLocked && { color: '#797990' }, { flex: 1, marginBottom: 0 }]}
                    value={userSetting.age}
                    onChangeText={v => setUserSetting(p => ({ ...p, age: v }))}
                    placeholder={(t as Record<string, string | undefined>).agePh ?? t?.age ?? screenT.age} placeholderTextColor={'#757585'} keyboardType="numeric"
                    editable={!isLocked}
                  />
                  {(['male', 'female', 'other'] as const).map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[s.genderBtn, userSetting.gender === g && s.genderBtnActive, isLocked && { opacity: 0.6 }]}
                      onPress={() => !isLocked && setUserSetting(p => ({ ...p, gender: p.gender === g ? '' : g }))}
                      disabled={isLocked}
                    >
                      <Text style={[s.genderBtnText, userSetting.gender === g && s.genderBtnTextActive, isLocked && { color: '#797990' }]}>{g === 'male' ? ((t as Record<string, string | undefined>).genderMale ?? screenT.genderMale) : g === 'female' ? ((t as Record<string, string | undefined>).genderFemale ?? screenT.genderFemale) : ((t as Record<string, string | undefined>).genderOther ?? screenT.genderOther)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[s.input, isLocked && { color: '#797990' }, { marginBottom: 8 }]}
                  value={userSetting.traits}
                  onChangeText={v => setUserSetting(p => ({ ...p, traits: v }))}
                  placeholder={(t as Record<string, string | undefined>).appearancePh ?? t?.appearance ?? screenT.appearancePh}
                  placeholderTextColor={'#757585'}
                  editable={!isLocked}
                />
                <TextInput
                  style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]}
                  value={userSetting.description}
                  onChangeText={v => setUserSetting(p => ({ ...p, description: v }))}
                  multiline
                  placeholder={(t as Record<string, string | undefined>).userDescPh ?? screenT.userDescPh}
                  placeholderTextColor={'#757585'}
                  editable={!isLocked}
                />
              </View>
            </View>
          )}


          {/* [sanitized comment] */}
          {char.id >= 1 && <View style={s.fieldRow}>
            <View style={s.fieldHeader}>
              <Text style={s.fieldLabel}>{t?.editorCharImage}</Text>
              <GuideButton guideKey="characterImage" t={t} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(char.imageUris ?? []).map((uri, imgIdx) => (
                <View key={imgIdx} style={s.charImageSlot}>
                  <Image source={{ uri }} style={s.charImage} contentFit="cover" />
                  {imgIdx === 0 && <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, alignItems: 'center' }}><Text style={s.charImageDefaultText}>{t?.editorCharImageDefault}</Text></View>}
                  <TouchableOpacity style={[s.imgDeleteBtn, !canEditImages && { opacity: 0.45 }]} disabled={!canEditImages} onPress={() => updateChar(selectedCharIdx, { imageUris: char.imageUris.filter((_, i) => i !== imgIdx) })}>
                    <XCircle size={18} color={'#F0F0F5'} />
                  </TouchableOpacity>
                </View>
              ))}
              {char.imageUris.length < 5 && (
                <TouchableOpacity style={[s.charImageAdd, !canEditImages && { opacity: 0.45 }]} disabled={!canEditImages} onPress={async () => {
                  const remaining = 5 - char.imageUris.length;
                  const uris = await pickImages(t, remaining, { targetAspectRatio: 1, maxWidth: 1024, maxHeight: 1024 });
                  if (uris.length > 0) updateChar(selectedCharIdx, { imageUris: [...char.imageUris, ...uris].slice(0, 5) });
                }}>
                  <Text style={s.charImageAddText}>+</Text>
                  <Text style={{ fontSize: 9, color: '#8A8A9E', marginTop: 2, textAlign: 'center' }}>
                    {`${char.imageUris.length}/5`}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>}
          {char.id !== 1 && <>
            {/* [sanitized comment] */}
            <View style={s.fieldRow}>
              <Text style={[s.sectionTitle, { fontSize: 13, color: '#8A8A9E', marginTop: 4, marginBottom: 6 }]}>{(t as Record<string, string | undefined>).charInfoSection ?? t?.character ?? screenT.charInfo}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>{(t as Record<string, string | undefined>).age ?? screenT.age}</Text>
                  <TextInput
                    style={[s.input, isLocked && { color: '#797990' }, { marginTop: 4 }]}
                    value={char.age ?? ''}
                    onChangeText={v => updateChar(selectedCharIdx, { age: v })}
                    placeholder={(t as Record<string, string | undefined>).ageExamplePh ?? screenT.ageExamplePh}
                    placeholderTextColor={'#757585'}
                    editable={!isLocked}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>{(t as Record<string, string | undefined>).gender ?? screenT.gender}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flex: 1.5 }}>
                    {(['male', 'female', 'other'] as const).map(g => (
                      <TouchableOpacity
                        key={g}
                        style={[s.genderBtn, char.gender === g && s.genderBtnActive, isLocked && { opacity: 0.6 }]}
                        onPress={() => !isLocked && updateChar(selectedCharIdx, { gender: char.gender === g ? '' : g })}
                        disabled={isLocked}
                      >
                        <Text style={[s.genderBtnText, char.gender === g && s.genderBtnTextActive, isLocked && { color: '#797990' }]}>{g === 'male' ? ((t as Record<string, string | undefined>).genderMale ?? screenT.genderMale) : g === 'female' ? ((t as Record<string, string | undefined>).genderFemale ?? screenT.genderFemale) : ((t as Record<string, string | undefined>).genderOther ?? screenT.genderOther)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={[s.fieldLabel, { marginTop: 10, marginBottom: 4 }]}>{(t as Record<string, string | undefined>).appearance ?? screenT.appearancePh}</Text>
              <TextInput
                style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]}
                value={char.traits ?? ''}
                onChangeText={v => updateChar(selectedCharIdx, { traits: v })}
                multiline
                placeholder={(t as Record<string, string | undefined>).traitsSummaryPh ?? screenT.traitsSummaryPh}
                placeholderTextColor={'#757585'}
                editable={!isLocked}
              />
            </View>

            {/* [sanitized comment] */}
            <View style={s.fieldRow}>
              <Text style={[s.sectionTitle, { fontSize: 13, color: '#8A8A9E', marginTop: 0, marginBottom: 6 }]}>{(t as Record<string, string | undefined>).personalitySection ?? t?.editorCharPersonality ?? screenT.personalitySection}</Text>
            </View>
            <FieldRow label={t?.editorCharPersonality ?? ''} guideKey="characterPersonality" t={t}>
              <TextInput
                style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]}
                value={char.personality}
                onChangeText={handlePersonalityChange}
                multiline
                placeholder={t?.phPersonality}
                placeholderTextColor={'#757585'}
                editable={!isLocked}
              />
              <Text style={s.charCount}>{char.personality.length}/500</Text>
            </FieldRow>
          </>}
        </>}
      </View>
    );
  };

  const renderWorld = () => (
    <View style={s.tabContent}>
      <SectionTitle title={t?.worldSetting} />
      <Text style={s.sectionHint}>{t?.editorWorldHint}</Text>
      <FieldRow label={t?.editorWorldLabel ?? ''} guideKey="worldSetting" t={t}>
        <TextInput style={[s.input, isLocked && { color: '#797990' }, s.inputLarge]} value={worldSetting} onChangeText={setWorldSetting} multiline placeholder={t?.phWorldSetting} placeholderTextColor={'#757585'} editable={!isLocked} />
      </FieldRow>
    </View>
  );

  const renderChapters = () => {
    const extraChars = regularCharacters;
    const chapterReorderHint = (t as Record<string, string | undefined>).chapterReorderHint ?? screenT.chapterReorderHint;
    return (
      <View style={s.tabContent}>
        <SectionTitle title={t?.editorChapterSection} />
        <Text style={s.sectionHint}>{t?.editorChapterHint}</Text>

        {chapters.length > 1 && (
          <View style={s.chapterOrderCard}>
            <View style={s.chapterOrderHeader}>
              <Text style={s.chapterOrderTitleText}>
                {(t as Record<string, string | undefined>).chapterOrderTitle ?? screenT.chapterOrderTitle}
              </Text>
              <Text style={s.chapterOrderHintText}>{chapterReorderHint}</Text>
            </View>
            <DraggableFlatList
              data={chapters}
              keyExtractor={(item: ChapterDraft) => item.id}
              scrollEnabled={false}
              activationDistance={10}
              containerStyle={s.chapterOrderList}
              onDragEnd={({ data }: { data: ChapterDraft[] }) => handleChapterReorder(data)}
              renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<ChapterDraft>) => {
                const chapterIndex = getIndex() ?? chapters.findIndex(chapter => chapter.id === item.id);
                const label = item.title || `${t?.editorChapterNum ?? screenT.editorChapterText} ${chapterIndex + 1}`;

                return (
                  <ScaleDecorator>
                    <TouchableOpacity
                      style={[s.chapterOrderItem, isActive && s.chapterOrderItemActive]}
                      onLongPress={drag}
                      delayLongPress={140}
                      disabled={isLocked}
                      activeOpacity={0.9}
                    >
                      <GripVertical size={16} color={isLocked ? '#4A4A5E' : '#797990'} />
                      <Text style={s.chapterOrderBadge}>{`Ch ${chapterIndex + 1}`}</Text>
                      <Text style={s.chapterOrderItemTitle} numberOfLines={1}>{label}</Text>
                    </TouchableOpacity>
                  </ScaleDecorator>
                );
              }}
            />
          </View>
        )}

        {/* [sanitized comment] */}
        {/* [sanitized comment] */}
        {/* Removed automatic ending chapter hint box */}

        {chapters.map((ch, chIdx) => {

          const isExpanded = expandedChapters[ch.id] === true;
          return (
          <View key={ch.id} style={s.chapterCard}>
            <TouchableOpacity
              style={s.chapterCardHeader}
              onPress={() => setExpandedChapters(prev => ({ ...prev, [ch.id]: !prev[ch.id] }))}
              activeOpacity={0.7}
            >
              <Text style={[s.chapterNum, { flex: 1, fontSize: 14, color: '#F0F0F5' }]}>{t?.editorChapterNum ?? screenT.editorChapterText} {chIdx + 1}</Text>
              <Text style={{ color: '#757585', fontSize: 16, paddingHorizontal: 8 }}>{isExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <>
            {/* [sanitized comment] */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, alignSelf: 'flex-start', backgroundColor: ch.isEnding ? 'rgba(212,168,83,0.07)' : '#0E0E14', borderWidth: 1, borderColor: ch.isEnding ? '#8B6914' : '#2C2C38', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, gap: 8 }}
              onPress={() => updateChapter(ch.id, { isEnding: !ch.isEnding })}
            >
              <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: ch.isEnding ? '#8B6914' : '#797990', backgroundColor: ch.isEnding ? '#8B6914' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {ch.isEnding && <Check size={10} color="#fff" />}
              </View>
              <Text style={{ color: ch.isEnding ? '#D4A853' : '#797990', fontSize: 13, fontWeight: ch.isEnding ? '700' : '400' }}>
                {ch.isEnding ? (t as Record<string, string | undefined>).endingChapterLabel ?? screenT.endingChapterLabel : (t as Record<string, string | undefined>).notEndingChapter ?? screenT.notEndingChapter}
              </Text>
            </TouchableOpacity>
            {/* 엔딩 설명 박스 제거됨 (항목 8) */}

            <FieldRow label={t?.editorChapterAiGoal ?? ''} guideKey="aiGoal" t={t}>
              <TextInput style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]} value={ch.aiGoal} onChangeText={v => updateChapter(ch.id, { aiGoal: v })} multiline placeholder={t?.phAiGoal} placeholderTextColor={'#757585'} editable={!isLocked} />
            </FieldRow>

            {extraChars.length > 0 && <View style={s.fieldRow}>
              <View style={s.fieldHeader}>
                <Text style={s.fieldLabel}>{t?.editorCharGoal}</Text>
                <GuideButton guideKey="characterGoal" t={t} />
              </View>
              {extraChars.map(char => (
                <View key={char.id} style={s.charGoalRow}>
                  <Text style={s.charGoalLabel}>{char.name || `${t?.character ?? screenT.characterLabel} ${char.id}`}</Text>
                  <TextInput style={[s.input, isLocked && { color: '#797990' }, { flex: 1, marginBottom: 0 }]} value={ch.characterGoals[char.id] ?? ''} onChangeText={v => updateCharGoal(ch.id, char.id, v)} placeholder={t?.phCharGoal} placeholderTextColor={'#757585'} editable={!isLocked} />
                </View>
              ))}
            </View>}

            <FieldRow label={t?.editorChapterInfo ?? ''} guideKey="chapterInfo" t={t}>
              <TextInput style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]} value={ch.chapterInfo} onChangeText={v => updateChapter(ch.id, { chapterInfo: v })} multiline placeholder={t?.phChapterInfo} placeholderTextColor={'#757585'} editable={!isLocked} />
            </FieldRow>

            {/* [sanitized comment] */}
            {chIdx > 0 && (
              <FieldRow label={t?.editorPrevSummary ?? ''} guideKey="prevSummary" t={t}>
                <TextInput style={[s.input, isLocked && { color: '#797990' }, s.inputMulti]} value={ch.prevSummary} onChangeText={v => updateChapter(ch.id, { prevSummary: v })} multiline
                  placeholder={chIdx === 0 ? t?.phPrevSummary0 : t?.phPrevSummary}
                  placeholderTextColor={'#757585'}
                  editable={!isLocked} />
              </FieldRow>
            )}

            {/* 전환 조건 제거됨 — AI가 스토리 흐름을 스스로 판단해 전환
              KV 비율 + 감정 급변 + 서술 분기점을 확률로 결합해 자동 처리.
              뜬금없이 선택지가 뜨지 않도록 마무리 대사를 먼저 생성한 뒤 표시됨. */}

            {/* Choice events section */}
            <View style={s.fieldRow}>
              <View style={s.fieldHeader}>
                <Text style={s.fieldLabel}>{(t as Record<string, string | undefined>).choiceEventTab ?? screenT.choiceEventTab}</Text>
                <GuideButton guideKey="choiceEvent" t={t} />
              </View>
              <Text style={[s.sectionHint, { marginTop: 0, marginBottom: 8 }]}>
                {(t as Record<string, string | undefined>).triggerHint ?? screenT.triggerHint}
              </Text>

              {ch.choiceEvents.map((evt, evtIdx) => {
                const evtHasAnyTarget = evt.options.some(opt => opt.targetChapterId !== '');
                const evtAllHaveTarget = evt.options.every(opt => opt.targetChapterId !== '');
                return (
                <View key={evt.id} style={s.choiceEventCard}>
                  {/* [sanitized comment] */}
                  <View style={s.choiceEventHeader}>
                    <Text style={s.choiceEventTitle}>{(t as Record<string, string | undefined>).choiceEventLabel ?? `${screenT.choiceEventTab} `}{evtIdx + 1}</Text>
                    <TouchableOpacity onPress={() => !isLocked && removeChoiceEvent(ch.id, evt.id)} disabled={isLocked}>
                      <XCircle size={16} color={isLocked ? '#444' : "#E55"} />
                    </TouchableOpacity>
                  </View>

            {/* 전체 챕터 번역 */}
                  <Text style={s.choiceSubLabel}>{(t as Record<string, string | undefined>).triggerCondition ?? screenT.triggerConditionDetail}</Text>
                  {evt.triggerConditions.map((tr, ti) => (
                    <View key={ti} style={s.triggerRow}>
                      <View style={s.triggerTypeRow}>
                        {(['cache', 'conversation'] as const).map(type => (
                          <TouchableOpacity key={type}
                            style={[s.triggerTypeBtn, tr.type === type && s.triggerTypeBtnActive, isLocked && { opacity: 0.5 }]}
                            onPress={() => !isLocked && updateChoiceEventTrigger(ch.id, evt.id, ti, { type })}
                            disabled={isLocked}>
                            <Text style={[s.triggerTypeBtnText, tr.type === type && s.triggerTypeBtnTextActive, isLocked && { color: '#797990' }]}>
                              {type === 'cache' ? t?.editorTriggerCache : t?.editorTriggerConv}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {ti > 0 && <TouchableOpacity style={s.triggerDelBtn} onPress={() => !isLocked && removeChoiceEventTrigger(ch.id, evt.id, ti)} disabled={isLocked}>
                          <XCircle size={16} color={isLocked ? '#444' : "#E55"} />
                        </TouchableOpacity>}
                      </View>
                      {tr.type === 'conversation' && (
                        <View style={s.triggerDetailRow}>
                          <Text style={s.triggerDetailLabel}>{(t as Record<string, string | undefined>).triggerCount ?? screenT.triggerCount}</Text>
                          <TextInput style={[s.triggerSmallInput, isLocked && { color: '#797990' }]} keyboardType="numeric"
                            value={tr.convCount?.toString() ?? ''}
                            onChangeText={v => updateChoiceEventTrigger(ch.id, evt.id, ti, { convCount: parseInt(v, 10) || 10 })}
                            placeholder="10" placeholderTextColor={'#757585'}
                            editable={!isLocked} />
                          <Text style={s.triggerDetailLabel}>{(t as Record<string, string | undefined>).triggerTarget ?? screenT.triggerTarget}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={[s.addTriggerBtn, { marginTop: 4 }, isLocked && { opacity: 0.5 }]} onPress={() => !isLocked && addChoiceEventTrigger(ch.id, evt.id)} disabled={isLocked}>
                    <Text style={s.addTriggerBtnText}>{(t as Record<string, string | undefined>).addTrigger ?? t?.editorChoiceTargetPh ?? screenT.addTrigger}</Text>
                  </TouchableOpacity>

                  {/* [sanitized comment] */}
                  <Text style={[s.choiceSubLabel, { marginTop: 12 }]}>{(t as Record<string, string | undefined>).choicePromptLabel ?? t?.phChoicePrompt ?? screenT.choicePromptLabel}</Text>
                  <TextInput style={[s.input, isLocked && { color: '#797990' }]}
                    value={evt.prompt}
                    onChangeText={v => updateChoiceEvent(ch.id, evt.id, { prompt: v })}
                    placeholder={(t as Record<string, string | undefined>).storyFlowPh ?? screenT.storyFlowPh}
                    placeholderTextColor={'#757585'}
                    editable={!isLocked} />

                  {/* [sanitized comment] */}
                  {evtHasAnyTarget && !evtAllHaveTarget && (
                    <View style={{ backgroundColor: '#2A1A0A', borderRadius: 8, borderWidth: 1, borderColor: '#8B4513', padding: 10, marginBottom: 8 }}>
                      <Text style={{ color: '#FFA040', fontSize: 12, fontFamily: Typography.fontFamily.bold }}>
                      {(t as Record<string, string | undefined>).chapterNavMode ?? screenT.chapterTargetRequired}
                    </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
                    <Text style={[s.choiceSubLabel, { flex: 1, marginTop: 0 }]}>{(t as Record<string, string | undefined>).choiceOptions ?? (t as Record<string, string | undefined>).storyFlowSet ?? screenT.choiceOptions}</Text>
                  </View>
                  {evt.options.map((opt, optIdx) => {
                    const needsTarget = evtHasAnyTarget && opt.targetChapterId === '';
                    return (
                      <View key={opt.id} style={[s.choiceOptionCard, needsTarget && { borderColor: '#8B4513', borderWidth: 1.5 }]}>
                        <View style={s.choiceOptionHeader}>
                          <Text style={s.choiceOptionNum}>
                            {(t as Record<string, string | undefined>).choiceLabel ?? screenT.choiceLabel} {optIdx + 1}
                            {needsTarget
                              ? ' ' + ((t as Record<string, string | undefined>).chapterNotSet ?? screenT.notSet)
                              : ''}
                          </Text>
                          {evt.options.length > 2 && (
                            <TouchableOpacity onPress={() => removeChoiceOption(ch.id, evt.id, opt.id)}>
                              <XCircle size={16} color="#E55" />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* [sanitized comment] */}
                        <TextInput style={[s.input, isLocked && { color: '#797990' }, { marginBottom: 6 }]}
                          value={opt.label}
                          maxLength={60}
                          onChangeText={v => updateChoiceOption(ch.id, evt.id, opt.id, { label: v })}
                          placeholder={`${(t as Record<string, string | undefined>).choiceOptionPh ?? screenT.choiceOptionPh} ${optIdx + 1}`}
                          placeholderTextColor={'#757585'}
                          editable={!isLocked} />

                        {/* [sanitized comment] */}
                        <Text style={[s.choiceSubLabel, needsTarget && { color: '#FFA040' }]}>
                          {needsTarget ? (t as Record<string, string | undefined>).chapterTargetRequired ?? screenT.chapterTargetRequired : (t as Record<string, string | undefined>).selectTargetChapter ?? screenT.selectTargetChapter}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                          {chapters.filter((_, targetIdx) => targetIdx > chIdx).map(targetCh => {
                            const targetIdx = chapters.indexOf(targetCh);
                            const isSelected = opt.targetChapterId === targetCh.id;
                            return (
                              <TouchableOpacity key={targetCh.id}
                                style={[s.chapterSelectBtn, isSelected && s.chapterSelectBtnActive, isLocked && { opacity: 0.6 }]}
                                onPress={() => !isLocked && updateChoiceOption(ch.id, evt.id, opt.id, { targetChapterId: isSelected ? '' : targetCh.id })}
                                disabled={isLocked}>
                                <Text style={[s.chapterSelectBtnText, isSelected && s.chapterSelectBtnTextActive, isLocked && { color: '#797990' }]}>
                                  {`Ch${targetIdx + 1}`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                          {chapters.filter((_, i) => i > chIdx).length === 0 && (
                            <Text style={{ color: '#797990', fontSize: 12, paddingHorizontal: 8 }}>{(t as Record<string, string | undefined>).lastChapterNoAction ?? screenT.lastChapterNoAction}</Text>
                          )}
                        </ScrollView>

                      </View>
                    );
                  })}
                  {evt.options.length < 4 && (
                    <TouchableOpacity style={s.addChoiceOptionBtn} onPress={() => addChoiceOption(ch.id, evt.id)}>
                      <Text style={s.addChoiceOptionBtnText}>{(t as Record<string, string | undefined>).addChoiceOption ?? screenT.addChoiceOption}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                );
              })}

              <TouchableOpacity style={s.addChoiceEventBtn} onPress={() => addChoiceEvent(ch.id)}>
                <Text style={s.addChoiceEventBtnText}>{(t as Record<string, string | undefined>).addChoiceEvent ?? screenT.addChoiceEvent}</Text>
              </TouchableOpacity>
            </View>
            </>
          )}
          </View>
          );
        })}
        <TouchableOpacity style={s.addBtn} onPress={addChapter}><Text style={s.addBtnText}>{t?.editorChapterAdd}</Text></TouchableOpacity>
      </View>
    );
  };

  const renderIntro = () => {
    // 인트로는 첫 챕터(chapter_1) 하나만 — 챕터별 인트로 아님
    const keys = [{ key: 'chapter_1', label: chapters[0]?.title || `${t?.editorChapterNum ?? screenT.editorChapterText} 1` }];
    const nonNarrChars = regularCharacters;
    return (
      <View style={s.tabContent}>
        <View style={s.fieldRow}>
          <View style={s.fieldHeader}><Text style={s.fieldLabel}>{t?.editorIntroLabel}</Text><GuideButton guideKey="intro" t={t} /></View>
          <Text style={s.sectionHint}>{t?.editorIntroHint}</Text>
        </View>
        {keys.map((ik) => (
          <View key={ik.key} style={s.introSection}>
            <TouchableOpacity style={s.introHeader} onPress={() => setIntroExpanded(p => ({ ...p, [ik.key]: !p[ik.key] }))}>
              <Text style={s.introHeaderText}>{ik.label}</Text>
              {introExpanded[ik.key] ? <ChevronUp size={18} color="#757585" /> : <ChevronDown size={18} color="#757585" />}
            </TouchableOpacity>
            {introExpanded[ik.key] && <View style={s.introBubbleArea}>
              {(introMessages[ik.key] || []).map(msg => (
                <IntroBubble key={msg.id} msg={msg} chars={sanitizedCharacters}
                  onLongPress={() => removeIntroMsg(ik.key, msg.id)} />
              ))}
              <View style={s.introInputArea}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
                  <TouchableOpacity
                    style={[s.speakerBtn, introSpeaker === 'user' && activeIntroKey === ik.key && s.speakerBtnActive]}
                    onPress={() => {
                      const isSelected = introSpeaker === 'user' && activeIntroKey === ik.key;
                      setIntroSpeaker(isSelected ? 'narrator' : 'user');
                      setIntroSpeakerCharId(isSelected ? NARRATOR_CHAR_ID : USER_CHAR_ID);
                      setActiveIntroKey(ik.key);
                    }}
                  >
                    <Text style={[s.speakerBtnText, introSpeaker === 'user' && activeIntroKey === ik.key && s.speakerBtnTextActive]}>
                      {t?.speakerUser}
                    </Text>
                  </TouchableOpacity>
                  {nonNarrChars.map(ch => (
                    <TouchableOpacity
                      key={ch.id}
                      style={[s.speakerBtn, introSpeaker === 'character' && introSpeakerCharId === ch.id && activeIntroKey === ik.key && s.speakerBtnActive]}
                      onPress={() => {
                        const isSelected = introSpeaker === 'character' && introSpeakerCharId === ch.id && activeIntroKey === ik.key;
                        setIntroSpeaker(isSelected ? 'narrator' : 'character');
                        setIntroSpeakerCharId(isSelected ? NARRATOR_CHAR_ID : ch.id);
                        setActiveIntroKey(ik.key);
                      }}
                    >
                      <Text style={[s.speakerBtnText, introSpeaker === 'character' && introSpeakerCharId === ch.id && activeIntroKey === ik.key && s.speakerBtnTextActive]}>{ch.name || `${t?.character ?? screenT.characterLabel} ${ch.id}`}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={s.speakerBtn} onPress={() => addIntroImage(ik.key)}>
                    <Text style={s.speakerBtnText}>{t?.editorIntroImage}</Text>
                  </TouchableOpacity>
                </ScrollView>
                <View style={s.introInputRow}>
                  <TextInput style={s.introInput} value={activeIntroKey === ik.key ? introInput : ''} onChangeText={v => { setIntroInput(v); setActiveIntroKey(ik.key); }} multiline placeholder={t?.phIntroInput} placeholderTextColor={'#757585'} />
                  <TouchableOpacity style={s.introSendBtn} onPress={() => { setActiveIntroKey(ik.key); addIntroMsg(); }}>
                    <Text style={s.introSendBtnText}>{(t as Record<string, string | undefined>).addBtn ?? '+'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>}
          </View>
        ))}
      </View>
    );
  };

  const renderBackground = () => (
    <View style={s.tabContent}>
      <View style={s.fieldRow}>
        <View style={s.fieldHeader}><Text style={s.fieldLabel}>{t?.editorBgLabel}</Text><GuideButton guideKey="background" t={t} /></View>
        <Text style={s.sectionHint}>{t?.editorBgHint}</Text>
      </View>
        {backgrounds.map((bg, bgIdx) => (
        <View key={`${bg.id}_${bgIdx}`} style={s.bgCard}>
          <View style={s.bgCardHeader}>
            <View style={{ position: 'relative' }}>
              <TouchableOpacity style={[s.bgImageSlot, !canEditImages && { opacity: 0.45 }]} disabled={!canEditImages} onPress={async () => { const uri = await pickImage(t, { targetAspectRatio: 9 / 16, maxWidth: 1080, maxHeight: 1920 }); if (uri) setBackgrounds(p => p.map((b, i) => i === bgIdx ? { ...b, uri } : b)); }}>
                {bg.uri ? <Image source={{ uri: bg.uri }} style={s.bgPreview} contentFit="cover" /> : <Text style={s.bgImageSlotText}>{t?.editorBgSlot}{'\n'}9:16</Text>}
              </TouchableOpacity>
              {bg.uri && (
                <TouchableOpacity style={[s.imgDeleteBtn, { top: -6, right: -6 }, !canEditImages && { opacity: 0.45 }]} disabled={!canEditImages} onPress={() => setBackgrounds(p => p.map((b, i) => i === bgIdx ? { ...b, uri: '' } : b))}>
                  <XCircle size={18} color={'#F0F0F5'} />
                </TouchableOpacity>
              )}
            </View>
            <TextInput style={[s.input, isLocked && { color: '#797990' }, { flex: 1, marginBottom: 0, height: 44 }]} value={bg.label} onChangeText={v => setBackgrounds(p => p.map((b, i) => i === bgIdx ? { ...b, label: v } : b))} placeholder={t?.phBgName} placeholderTextColor={'#757585'} editable={!isLocked} />
            <TouchableOpacity disabled={isLocked || bgIdx === 0} onPress={() => !isLocked && bgIdx !== 0 && setBackgrounds(p => p.filter((_, i) => i !== bgIdx))}>
              <X size={18} color={bgIdx === 0 ? '#3A3A50' : '#797990'} />
            </TouchableOpacity>
          </View>
          {/* ✅ 첫 번째 배경은 기본 이미지로 조건 UI 없음 */}
          {bgIdx > 0 && (
            <>
              <Text style={s.bgCondLabel}>{t?.editorBgCondLabel}</Text>
              {bg.conditions.map((cond, cIdx) => (
            <View key={cIdx} style={s.bgCondRow}>
              <View style={s.bgCondTypeRow}>
                {(['chapter'] as const).map(ct => (
                  <TouchableOpacity key={ct} style={[s.triggerTypeBtn, cond.type === ct && s.triggerTypeBtnActive, isLocked && { opacity: 0.6 }]}
                    disabled={isLocked}
                    onPress={() => !isLocked && setBackgrounds(p => p.map((b, bi) => bi !== bgIdx ? b : { ...b, conditions: b.conditions.map((c, ci) => ci === cIdx ? { ...c, type: ct } : c) }))}>
                    <Text style={[s.triggerTypeBtnText, cond.type === ct && s.triggerTypeBtnTextActive]}>{t?.chapter}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity disabled={isLocked} onPress={() => !isLocked && setBackgrounds(p => p.map((b, bi) => bi !== bgIdx ? b : { ...b, conditions: b.conditions.filter((_, ci) => ci !== cIdx) }))}>
                  <X size={14} color={'#797990'} />
                </TouchableOpacity>
              </View>
              {cond.type === 'chapter' && <View style={s.triggerDetailRow}>
                <Text style={s.triggerDetailLabel}>{t?.editorBgChapterLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  {chapters.map((ch, chIdx) => (
                    <TouchableOpacity key={ch.id} style={[s.triggerDirBtn, cond.chapterId === ch.id && s.triggerDirBtnActive, isLocked && { opacity: 0.6 }]}
                      disabled={isLocked}
                      onPress={() => !isLocked && setBackgrounds(p => p.map((b, bi) => bi !== bgIdx ? b : { ...b, conditions: b.conditions.map((c, ci) => ci === cIdx ? { ...c, chapterId: ch.id } : c) }))}>
                      <Text style={[s.triggerDirBtnText, cond.chapterId === ch.id && s.triggerDirBtnTextActive]}>{`${t?.editorChapterNum ?? screenT.editorChapterText} ${chIdx + 1}`}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>}
            </View>
          ))}
          <TouchableOpacity style={[s.addTriggerBtn, isLocked && { opacity: 0.6 }]} disabled={isLocked} onPress={() => !isLocked && setBackgrounds(p => p.map((b, bi) => bi !== bgIdx ? b : { ...b, conditions: [...b.conditions, { type: 'chapter' }] }))}>
            <Text style={s.addTriggerBtnText}>{t?.editorTriggerAdd}</Text>
          </TouchableOpacity>
          </>
          )}
        </View>
      ))}
      <TouchableOpacity style={[s.addBtn, isLocked && { opacity: 0.6 }]} disabled={isLocked} onPress={() => !isLocked && setBackgrounds(p => {
        const isFirstBg = p.length === 0;
        const newBg = {
          id: Date.now().toString(),
          uri: '',
          label: isFirstBg ? (t?.editorBgDefault ?? screenT.editorBgDefault) : `${t?.editorBgLabel} ${p.length + 1}`,
          conditions: [] // 모든 배경 조건 없이 시작
        };
        return [...p, newBg];
      })}>
        <Text style={s.addBtnText}>{t?.editorBgAdd}</Text>
      </TouchableOpacity>
    </View>
  );


  // [sanitized comment]
  const renderGraph = () => {
    // Build adjacency: chapterId -> [{optionLabel, targetId}]
    const edges: Record<string, { label: string; target: string }[]> = {};
    chapters.forEach(ch => {
      const chEdges: { label: string; target: string }[] = [];
      ch.choiceEvents.forEach(evt => {
        evt.options.forEach(opt => {
          if (opt.targetChapterId) {
            chEdges.push({ label: opt.label || (t as Record<string, string | undefined>).choiceLabel || screenT.choiceLabel, target: opt.targetChapterId });
          }
        });
      });
      edges[ch.id] = chEdges;
    });

    const getChapterLabel = (id: string) => {
      const idx = chapters.findIndex(c => c.id === id);
      if (idx < 0) return `${screenT.editorChapterText} ?`;
      return `${screenT.editorChapterText} ${idx + 1}`;
    };

    return (
      <View style={s.tabContent}>
        <Text style={s.sectionTitle}>{(t as Record<string, string | undefined>).chapterFlow ?? screenT.chapterFlow}</Text>
        <Text style={s.sectionHint}>{(t as Record<string, string | undefined>).chapterFlowHint ?? screenT.chapterFlowHint}</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {chapters.map((ch, chIdx) => {
            const chEdges = edges[ch.id] || [];
            const incomingChapters = chapters.filter(other =>
              (edges[other.id] || []).some(e => e.target === ch.id)
            );
            return (
              <View key={ch.id} style={graphS.chapterNode}>
                <View style={graphS.nodeHeader}>
                  <View style={graphS.nodeNumBadge}>
                    <Text style={graphS.nodeNumText}>{`${screenT.editorChapterText} ${chIdx + 1}`}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {ch.title && !/^(chapter|챕터|ch)/i.test(ch.title.trim()) && (
                      <Text style={graphS.nodeTitle} numberOfLines={1}>{ch.title}</Text>
                    )}
                    {incomingChapters.length > 0 && (
                      <Text style={[graphS.incomingText, ch.title && !/^(chapter|챕터|ch)\s*\d+$/i.test(ch.title.trim()) ? {} : { marginTop: 0 }]} numberOfLines={1}>
                        ← {incomingChapters.map(c => `Ch${chapters.indexOf(c) + 1}`).join(', ')}
                      </Text>
                    )}
                    {chIdx === 0 && (
                      <Text style={[graphS.incomingText, { color: '#38BDF8', fontFamily: Typography.fontFamily.bold }]}>
                        {(t as Record<string, string | undefined>).start ?? screenT.start ?? ''}
                      </Text>
                    )}
                  </View>
                </View>

            {/* 챕터 전환 조건 */}
                {chEdges.length > 0 ? (
                  <View style={graphS.edgesContainer}>
                    {chEdges.map((edge, ei) => {
                      const targetIdx = chapters.findIndex(c => c.id === edge.target);
                      return (
                        <View key={ei} style={graphS.edgeRow}>
                          <View style={graphS.edgeLine} />
                          <View style={graphS.edgeBubble}>
                            <Text style={graphS.edgeLabel} numberOfLines={1}>{edge.label}</Text>
                            <ArrowRight size={14} color="#797990" />
                            <View style={[graphS.edgeTarget, targetIdx < 0 && graphS.edgeTargetMissing]}>
                              <Text style={[graphS.edgeTargetText, targetIdx < 0 && { color: '#FF5555' }]}>
                                {targetIdx >= 0 ? getChapterLabel(edge.target) : (t as Record<string, string | undefined>).notSet ?? screenT.notSet}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={graphS.noEdgeText}>
                    {ch.isEnding ? (t as Record<string, string | undefined>).endingChapterDesc ?? screenT.endingChapterDesc : ch.choiceEvents.length === 0 ? (t as Record<string, string | undefined>).noChoiceAutoNext ?? screenT.noChoiceAutoNext : ''}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'story': return renderStory();
      case 'characters': return renderCharacters();
      case 'world': return renderWorld();
      case 'chapters': return renderChapters();
      case 'intro': return renderIntro();
      case 'background': return renderBackground();
      case 'graph': return renderGraph();
      case 'translate': return renderTranslate();
      default: return null;
    }
  };

  // [sanitized comment]
  const renderTranslate = () => {
    return (
      <View style={s.tabContent}>
        <Text style={[s.sectionTitle, { marginBottom: 4 }]}>{(t as Record<string, string | undefined>).multiLangTitle ?? screenT.multiLangTitle}</Text>
        <Text style={{ fontSize: 12, color: '#797990', lineHeight: 18, marginBottom: 14 }}>
          {(t as Record<string, string | undefined>).translateWorkflowShort ?? screenT.translateWorkflowShort}
        </Text>

        {/* 1. 기본정보 번역 */}
        <TouchableOpacity
          style={[s.translateCard, isStoryDone && s.translateCardDone, isStoryDone && s.translateCardSolidDone]}
          onPress={() => setStoryTranslateModalVisible(true)}
          activeOpacity={0.82}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.translateCardTitle}>{(t as Record<string, string | undefined>).translateBasicInfo ?? screenT.translateBasicInfo}</Text>
          </View>
          {isStoryDone
            ? <Check size={20} color={'#10B981'} />
            : <ChevronRight size={20} color="#757585" />}
        </TouchableOpacity>

        {/* 2. 캐릭터 번역 */}
        <TouchableOpacity
          style={[s.translateCard, isCharDone && s.translateCardDone]}
          onPress={() => setCharTranslateModalVisible(true)}
          activeOpacity={0.82}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.translateCardTitle}>{(t as Record<string, string | undefined>).translateAllChars ?? screenT.translateAllChars}</Text>
          </View>
          {isCharDone
            ? <Check size={20} color={'#10B981'} />
            : <ChevronRight size={20} color="#757585" />}
        </TouchableOpacity>

        {/* 3. 인트로 번역 */}
        <TouchableOpacity
          style={[s.translateCard, isIntroDone && s.translateCardDone]}
          onPress={() => setIntroTranslateModalVisible(true)}
          activeOpacity={0.82}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.translateCardTitle}>{t?.intro ?? screenT.intro}</Text>
          </View>
          {isIntroDone
            ? <Check size={20} color={'#10B981'} />
            : <ChevronRight size={20} color="#757585" />}
        </TouchableOpacity>

        {/* 4. 챕터 번역 */}
        <ChapterRangeTranslate title={t?.editorChapterText ?? screenT.editorChapterText} chapters={chapters} chapterMultiLangData={chapterMultiLangData} onApply={(res) => setChapterMultiLangData(prev => ({...prev, ...res}))} />
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />
      <Animated.View entering={FadeInDown.springify()} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBack}>
          <ArrowLeft size={22} color={'#F0F0F5'} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{applyName(deferredStoryTitle) ?? t?.createTab}</Text>
          {/* 상태 배지는 스토리 에디터에서 제거 - 내 스토리 목록에만 표시 */}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {!isImageOnlyEditor && !isServerLocked && (
            <TouchableOpacity style={s.headerDraftBtn} onPress={saveDraft}>
              <Text style={s.headerDraftBtnText}>{(t as Record<string, string | undefined>).tempSave ?? screenT.saveDraft}</Text>
            </TouchableOpacity>
          )}
          {isImageOnlyEditor ? (
            <TouchableOpacity
              style={[s.headerSaveBtn, !canEditImages && { backgroundColor: '#1A1A24', borderColor: '#2C2C38' }]}
              onPress={saveImagesOnly}
              disabled={saveImagesOnlyMutation.isPending || !canEditImages}
            >
              <Text style={[s.headerSaveBtnText, !canEditImages && { color: '#64748B' }]}>
                {(t as Record<string, string | undefined>).saveImagesOnly ?? screenT.saveImagesOnly}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                s.headerSaveBtn,
                (isServerLocked || !isPublishable) && { backgroundColor: '#1A1A24', borderColor: '#2C2C38' },
              ]}
              onPress={saveToServer}
              disabled={isServerLocked || saveToServerMutation.isPending || !isPublishable}
            >
              <Text style={[s.headerSaveBtnText, (isServerLocked || !isPublishable) && { color: '#64748B' }]}>
                {isServerLocked
                  ? ((t as Record<string, string | undefined>).locked ?? screenT.locked)
                  : ((t as Record<string, string | undefined>).publish ?? screenT.publishAction)}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {visibleTabs.map(tab => (
          <TouchableOpacity 
            key={tab.id} 
            style={[s.tab, activeTab === tab.id && s.tabActive]} 
            onPress={() => {
              startTransition(() => {
                setActiveTab(tab.id); 
                setExpandedChapters({}); 
                setIntroExpanded({});
              });
            }}
          >
            <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
            {activeTab === tab.id && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
      {isServerLocked && storyModelBadge && !isImageOnlyEditor ? (
        <View style={s.kvModelBanner}>
          <View
            style={[
              s.kvModelBadge,
              storyModelBadge.tone === 'gold' && s.kvModelBadgeGold,
              storyModelBadge.tone === 'silver' && s.kvModelBadgeSilver,
              storyModelBadge.tone === 'red' && s.kvModelBadgeRed,
            ]}
          >
            <Text style={s.kvModelBadgeText}>{storyModelBadge.label}</Text>
          </View>
          <Text style={s.kvModelBannerText}>
            {appLanguage === 'ko'
              ? `이 스토리는 ${storyModelBadge.fullLabel}용 KV로 시작되어 현재 모델이 잠겨 있어요.`
              : `This story started with KV for ${storyModelBadge.fullLabel}, so the model is locked.`}
          </Text>
        </View>
      ) : null}
      <KeyboardAwareScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={60}>
        <View style={{ flex: 1 }}>
          {renderTab()}
        </View>
        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
      <TranslationPasteModal
        visible={storyTranslateModalVisible}
        onClose={() => setStoryTranslateModalVisible(false)}
        title={(t as Record<string, string | undefined>).multiLangStoryTitle ?? t?.multiLangTitle ?? screenT.storyTranslation}
        doneCount={Object.keys(multiLangTranslations).length}
        buildPromptFn={storyBuildPrompt}
        parseFn={parseMultiLangPaste}
        onConfirm={(text) => {
          const result = parseMultiLangPaste(text);
          if (Object.keys(result).length === 0) { ToastService.info((t as Record<string, string | undefined>).noRecognizedLanguage ?? screenT.noRecognizedLanguage); return; }
          startTransition(() => {
            setMultiLangTranslations(result);
            setMultiLangExpanded(true);
          });
        }}
      />
      <TranslationPasteModal
        visible={introTranslateModalVisible}
        onClose={() => setIntroTranslateModalVisible(false)}
        title={t?.intro ?? screenT.intro}
        doneCount={introLangsDone}
        buildPromptFn={introBuildPrompt}
        parseFn={(text) => parseIntroPaste(text, introMessages.chapter_1 || [])}
        onConfirm={(text) => {
          const result = parseIntroPaste(text, introMessages.chapter_1 || []);
          if (Object.keys(result).length === 0) { ToastService.info((t as Record<string, string | undefined>).noRecognizedLanguage ?? screenT.noRecognizedLanguage); return; }
          startTransition(() => {
            setIntroMultiLangData(prev => {
              const next = { ...prev };
              Object.entries(result).forEach(([lang, msgs]) => {
                next[lang] = { ...next[lang], ...msgs };
              });
              return next;
            });
          });
        }}
      />
      <TranslationPasteModal
        visible={charTranslateModalVisible}
        onClose={() => setCharTranslateModalVisible(false)}
        title={(t as Record<string, string | undefined>).multiLangCharsTitle ?? screenT.multiLangCharsTitle}
        doneCount={Object.keys(charMultiLangData).length}
        buildPromptFn={charBuildPrompt}
        parseFn={(text) => {
          const r = parseAllCharsPaste(text, sanitizedCharacters);
          const flat: Record<string, any> = {};
          Object.values(r).forEach(v => Object.assign(flat, v));
          return flat;
        }}
        onConfirm={(text) => {
          const result = parseAllCharsPaste(text, sanitizedCharacters);
          if (Object.keys(result).length === 0) { ToastService.info((t as Record<string, string | undefined>).noRecognizedLanguage ?? screenT.noRecognizedLanguage); return; }
          startTransition(() => {
            setCharMultiLangData(prev => ({ ...prev, ...result }));
          });
        }}
      />
      <TranslationPasteModal
        visible={chapterTranslateModalIdx === -1}
        onClose={() => setChapterTranslateModalIdx(null)}
        title={(t as Record<string, string | undefined>).multiLangChaptersTitle ?? screenT.chaptersTranslation}
        doneCount={Object.keys(chapterMultiLangData).length}
        buildPromptFn={chapterBuildPrompt}
        parseFn={(text) => {
          const r = parseAllChaptersPaste(text, chapters);
          // ✅ [BUG FIX] 챕터 개수 반환 (언어 개수가 아님)
          return r;
        }}
        onConfirm={(text) => {
          const result = parseAllChaptersPaste(text, chapters);
          // [sanitized comment]
          const autoResult = { ...result };
          chapters.forEach(ch => {
            if (ch.choiceEvents.length === 0 && !autoResult[ch.id]) {
              const autoEntry: Record<string, any> = {};
              for (const l of LANGUAGE_LIST) {
                autoEntry[l.code] = { title: ch.title, _auto: true };
              }
              autoResult[ch.id] = autoEntry;
            }
          });
          const translatedCount = Object.keys(autoResult).filter(id => !Object.values(autoResult[id] || {}).every((v: unknown) => (v as Record<string, unknown>)?._auto)).length;
          if (translatedCount === 0 && Object.keys(autoResult).filter(id => Object.values(autoResult[id] || {}).some((v: unknown) => !(v as Record<string, unknown>)?._auto)).length === 0) {
            // [sanitized comment]
            const hasTranslatableChapters = chapters.some(ch => ch.choiceEvents.length > 0);
            if (hasTranslatableChapters) { ToastService.info((t as Record<string, string | undefined>).noRecognizedLanguage ?? screenT.noRecognizedLanguage); return; }
          }
          startTransition(() => {
            setChapterMultiLangData(autoResult);
          });
          const chaptersWithEvt = chapters.filter(ch => ch.choiceEvents.length > 0);
          const chaptersWithoutEvt = chapters.filter(ch => ch.choiceEvents.length === 0);
          ToastService.success(`${(t as Record<string, string | undefined>).editorTabChapters ?? screenT.chaptersLabel}: ${chaptersWithEvt.length} + ${chaptersWithoutEvt.length}`);
        }}
      />
      <AIAssistantModal visible={aiModalVisible} onClose={() => setAiModalVisible(false)} onApply={applyAIData} />

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A24' },
  headerBack: { width: 36, height: 36, justifyContent: 'center' },
  headerBackText: { fontSize: 22, color: '#F0F0F5' },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', textAlign: 'center' },
  headerSaveBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#D4A853', borderRadius: 8 },
  headerSaveBtnText: { fontSize: 13, color: '#050507', fontFamily: Typography.fontFamily.semibold },
  headerDraftBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0E0E14', borderRadius: 8, borderWidth: 1, borderColor: '#2C2C38' },
  headerDraftBtnText: { fontSize: 12, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontFamily: Typography.fontFamily.semibold },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#0E0E14' },
  tabBarContent: { paddingHorizontal: 16 },
  kvModelBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0C0C14',
    borderWidth: 1,
    borderColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 },
  kvModelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)' },
  kvModelBadgeGold: {
    backgroundColor: 'rgba(212,168,83,0.15)',
    borderColor: 'rgba(212,168,83,0.28)' },
  kvModelBadgeSilver: {
    backgroundColor: 'rgba(203,213,225,0.12)',
    borderColor: 'rgba(203,213,225,0.24)' },
  kvModelBadgeRed: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderColor: 'rgba(239,68,68,0.24)' },
  kvModelBadgeText: { fontSize: 11, color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  kvModelBannerText: { flex: 1, fontSize: 12, color: '#A0AEC0', lineHeight: 18, fontFamily: Typography.fontFamily.medium },
  tab: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  tabActive: {},
  tabText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  tabTextActive: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  tabUnderline: { width: '80%', height: 2, backgroundColor: '#D4A853', borderRadius: 1, marginTop: 4 },
  tabContent: { padding: PAD, gap: 4 },
  // [sanitized comment]
  translateCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0C0C14', borderRadius: 12,
    borderWidth: 1, borderColor: '#181820',
    padding: 16, marginBottom: 10, gap: 12
  },
  translateCardDone: {
    borderColor: 'rgba(212,168,83,0.45)',
    backgroundColor: 'rgba(212,168,83,0.04)'
  },
  translateCardSolidDone: {
    borderStyle: 'solid' },
  translateCardTitle: { fontSize: 14, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', marginBottom: 3 },
  translateCardDesc:  { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.regular },
  translateDoneBadge: {
    backgroundColor: 'rgba(212,168,83,0.15)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.35)'
  },
  translateDoneText: { fontSize: 11, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  translateArrow:    { fontSize: 18, color: '#757585' },
  rangeInput: {
    width: 56, height: 36, borderRadius: 8,
    backgroundColor: '#111118', borderWidth: 1, borderColor: '#181820',
    color: '#F0F0F5', fontSize: 14, textAlign: 'center',
    fontFamily: Typography.fontFamily.regular, paddingVertical: 0
  },
  rangeTranslateBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, backgroundColor: 'rgba(212,168,83,0.14)',
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)',
    alignSelf: 'flex-end', marginLeft: 8
  },
  sectionTitle: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginTop: 8, marginBottom: 4 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: '#797990', marginBottom: 8, lineHeight: 18 },
  fieldRow: { marginBottom: 16 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { fontSize: 13, color: '#8A8A9E', fontFamily: Typography.fontFamily.medium },
  guideBtn: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#757585', alignItems: 'center', justifyContent: 'center' },
  guideBtnText: { fontSize: 11, color: '#8A8A9E', fontFamily: Typography.fontFamily.semibold },
  guideBalloon: { position: 'absolute', right: 0, top: 26, zIndex: 999, backgroundColor: '#111118', borderRadius: 10, padding: 12, maxWidth: width * 0.72, minWidth: 160, borderWidth: 1, borderColor: '#2C2C38', elevation: 10 },
  guideBalloonArrow: { position: 'absolute', right: 6, top: -5, width: 9, height: 9, backgroundColor: '#111118', transform: [{ rotate: '45deg' }], borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#2C2C38' },
  guideBalloonText: { fontSize: 12, color: '#C8C8D4', lineHeight: 18 },
  input: { backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#1A1A24', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: '#F0F0F5', fontSize: 14, marginBottom: 4, fontFamily: Typography.fontFamily.regular },
  genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#252532', backgroundColor: '#0C0C14' },
  genreChipOn: { borderColor: '#D4A853', backgroundColor: 'rgba(212,168,83,0.14)' },
  genreChipDisabled: { opacity: 0.65 },
  genreChipTxt: { color: '#9A9AB0', fontSize: 13, fontFamily: Typography.fontFamily.medium },
  genreChipTxtOn: { color: '#F4D37A' },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  inputLarge: { height: 160, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#757585', textAlign: 'right', marginTop: 2 },
  // [sanitized comment]
  imgDeleteBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#2C2C38', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  imgDeleteText: { color: '#F0F0F5', fontSize: 10, fontFamily: Typography.fontFamily.bold },
// 이미지
  coverPickerWrap: { position: 'relative' },
  // [sanitized comment]
  coverNavBtn:   { position: 'absolute', top: '40%', width: 32, height: 32, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  coverNavLeft:  { left: 8 },
  coverNavRight: { right: 8 },
  coverNavTxt:   { color: '#F0F0F5', fontSize: 22, fontFamily: Typography.fontFamily.bold, lineHeight: 26 },
  // [sanitized comment]
  coverDots:  { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  coverDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  coverDotOn: { backgroundColor: '#F0F0F5', width: 8, height: 8, borderRadius: 4, marginTop: -1 },
  // [sanitized comment]
  coverAddBtn: { marginTop: 10, backgroundColor: '#0E0E14', borderRadius: 10, borderWidth: 1, borderColor: '#181820', paddingVertical: 12, alignItems: 'center' },
  coverAddTxt: { color: '#8A8A9E', fontSize: 14, fontFamily: Typography.fontFamily.semibold },
  // [sanitized comment]
  coverPicker: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: '#0E0E14',
    borderWidth: 1, borderColor: '#181820',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden'
  },
  coverPickerText: { color: '#797990', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  // [sanitized comment]
  coverPreview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  saveBtn: { paddingVertical: 12, backgroundColor: 'rgba(212,168,83,0.14)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212,168,83,0.30)', alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#D4A853', fontSize: 14, fontFamily: Typography.fontFamily.bold },
  // [sanitized comment]
  multiLangRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 2 },
  multiLangBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, backgroundColor: '#08080C',
    borderRadius: 10, borderWidth: 1, borderColor: '#1A1A24'
  },
  multiLangBtnOff: { opacity: 0.4 },
  multiLangBtnIcon: { fontSize: 16 },
  multiLangBtnText: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#8A8A9E' },
  multiLangHelp: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0C0C14', borderWidth: 1, borderColor: '#181820',
    alignItems: 'center', justifyContent: 'center'
  },
  multiLangHelpText: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#797990' },
  novelBtn: { paddingVertical: 14, backgroundColor: '#050507', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', marginTop: 8 },
  novelBtnDisabled: { borderColor: '#0E0E14' },
  novelBtnText: { color: '#8A8A9E', fontSize: 13, fontFamily: Typography.fontFamily.semibold },
  novelBtnTextDisabled: { color: '#2C2C38' },
  addBtn: { marginTop: 8, paddingVertical: 14, backgroundColor: '#0C0C14', borderRadius: 12, borderWidth: 1, borderColor: '#181820', borderStyle: 'dashed', alignItems: 'center' },
  addBtnText: { color: '#797990', fontSize: 14, fontFamily: Typography.fontFamily.medium },
  charTabRow: { flexGrow: 0, marginBottom: 12 },
  charTab: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#0C0C14', borderRadius: 20, borderWidth: 1, borderColor: '#1A1A24', flexDirection: 'row', alignItems: 'center', gap: 4 },
  charTabActive: { borderColor: '#F0F0F5', backgroundColor: '#0C0C14' },
  charTabText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  charTabTextActive: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  charIdBadge: { fontSize: 11, color: '#797990', backgroundColor: '#181820', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 },
  charAddBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#0E0E14', borderRadius: 20, borderWidth: 1, borderColor: '#2C2C38', borderStyle: 'dashed' },
  charAddBtnDisabled: { opacity: 0.45 },
  charAddBtnText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  charIdInfo: { backgroundColor: '#08080C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  charIdInfoText: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  // [sanitized comment]
  charImageSlot: { width: 80, height: 80, borderRadius: 8, position: 'relative', overflow: 'hidden', backgroundColor: '#0E0E14' },
  charImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#050507' }, // resizeMode는 JSX에서 'cover' 설정
  charImageDefaultText: { fontSize: 9, color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },
  charImageAdd: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#0E0E14', borderWidth: 1, borderColor: '#181820', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  charImageAddText: { fontSize: 24, color: '#797990' },
  chapterCard: { backgroundColor: '#0E0E14', borderRadius: 12, borderWidth: 1, borderColor: '#181820', padding: 14, marginBottom: 12, gap: 4 },
  chapterCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chapterNum: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.semibold, width: 48 },
  chapterOrderCard: {
    backgroundColor: '#0C0C14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#181820',
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  chapterOrderHeader: { gap: 4 },
  chapterOrderTitleText: {
    color: '#F0F0F5',
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
  },
  chapterOrderHintText: {
    color: '#8A8A9E',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
  },
  chapterOrderList: { gap: 8 },
  chapterOrderItem: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#181820',
    backgroundColor: '#0E0E14',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chapterOrderItemActive: {
    borderColor: 'rgba(212,168,83,0.40)',
    backgroundColor: 'rgba(212,168,83,0.10)',
  },
  chapterOrderBadge: {
    color: '#D4A853',
    fontSize: 11,
    fontFamily: Typography.fontFamily.semibold,
    minWidth: 34,
  },
  chapterOrderItemTitle: {
    flex: 1,
    color: '#F0F0F5',
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },
  charGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  charGoalLabel: { fontSize: 12, color: '#8A8A9E', minWidth: 70 },
  triggerNote: { fontSize: 11, color: '#797990', marginBottom: 6, lineHeight: 16 },
  coreCard: { backgroundColor: '#0E0E14', borderRadius: 12, borderWidth: 1, borderColor: '#181820', padding: 14, marginBottom: 12, gap: 4 },
  coreCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  coreDeleteBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  coreDeleteBtnText: { color: '#F0F0F5', fontSize: 16 },
  triggerRow: { backgroundColor: '#050507', borderRadius: 8, padding: 10, marginBottom: 8 },
  triggerTypeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  triggerTypeBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0E0E14', borderRadius: 16, borderWidth: 1, borderColor: '#181820' },
  triggerTypeBtnActive: { borderColor: '#F0F0F5', backgroundColor: '#181820' },
  triggerTypeBtnText: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  triggerTypeBtnTextActive: { color: '#F0F0F5' },
  genderBtn: { flex: 1, height: 42, backgroundColor: '#0E0E14', borderRadius: 10, borderWidth: 1, borderColor: '#181820', alignItems: 'center', justifyContent: 'center' },
  genderBtnActive: { borderColor: 'rgba(212,168,83,0.50)', backgroundColor: 'rgba(212,168,83,0.14)' },
  genderBtnText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  genderBtnTextActive: { color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  triggerDelBtn: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 5 },
  triggerDelBtnText: { color: '#F0F0F5', fontSize: 13 },
  triggerDetailRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  triggerDetailLabel: { fontSize: 12, color: '#797990' },
  triggerSmallInput: { backgroundColor: '#0E0E14', borderWidth: 1, borderColor: '#181820', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: '#F0F0F5', fontSize: 13, width: 48, textAlign: 'center' },
  triggerEmotionPicker: { flexDirection: 'row', gap: 4 },
  triggerEmotionBtn: { paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#0E0E14', borderRadius: 6, borderWidth: 1, borderColor: '#181820' },
  triggerEmotionBtnActive: { borderColor: '#F0F0F5' },
  triggerEmotionBtnText: { fontSize: 11, color: '#797990' },
  triggerEmotionBtnTextActive: { color: '#F0F0F5' },
  triggerDirBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#0E0E14', borderRadius: 6, borderWidth: 1, borderColor: '#181820' },
  triggerDirBtnActive: { borderColor: '#F0F0F5', backgroundColor: '#181820' },
  triggerDirBtnText: { fontSize: 12, color: '#797990' },
  triggerDirBtnTextActive: { color: '#F0F0F5' },
  triggerOr: { fontSize: 11, color: '#757585', textAlign: 'center', marginVertical: 4 },
  addTriggerBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#0E0E14' },
  addTriggerBtnText: { fontSize: 12, color: '#F0F0F5' },
  introSection: { backgroundColor: '#0E0E14', borderRadius: 12, borderWidth: 1, borderColor: '#181820', marginBottom: 10, overflow: 'hidden' },
  introHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  introHeaderText: { fontSize: 14, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5' },
  introArrow: { fontSize: 12, color: '#797990' },
  introBubbleArea: { padding: 10, gap: 8 },
  narratorBubble: { backgroundColor: '#08080C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 8 },
  narratorText: { color: '#8A8A9E', fontSize: 13, textAlign: 'center', lineHeight: 20, fontStyle: 'italic' },
  userBubbleRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: { backgroundColor: '#181820', borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '75%' },
  userText: { color: '#F0F0F5', fontSize: 14, lineHeight: 20 },
  aiBubbleRow: { flexDirection: 'row', gap: 8 },
  aiAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#181820', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aiAvatarText: { color: '#8A8A9E', fontSize: 14, fontFamily: Typography.fontFamily.semibold },
  aiName: { fontSize: 11, color: '#797990', marginBottom: 3 },
  aiBubble: { backgroundColor: '#0E0E14', borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '75%' },
  aiText: { color: '#F0F0F5', fontSize: 14, lineHeight: 20 },
  introInputArea: { borderTopWidth: 1, borderTopColor: '#0E0E14', padding: 10, gap: 6 },
  speakerBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0E0E14', borderRadius: 14, borderWidth: 1, borderColor: '#181820' },
  speakerBtnActive: { borderColor: '#F0F0F5', backgroundColor: '#181820' },
  speakerBtnText: { fontSize: 12, color: '#797990' },
  speakerBtnTextActive: { color: '#F0F0F5' },
  introInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  introInput: { flex: 1, backgroundColor: '#050507', borderWidth: 1, borderColor: '#181820', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#F0F0F5', fontSize: 14, maxHeight: 80, textAlignVertical: 'top' },
  introSendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#181820', alignItems: 'center', justifyContent: 'center' },
  introSendBtnText: { color: '#F0F0F5', fontSize: 18, fontFamily: Typography.fontFamily.bold },
  introBubbleImageWrap: { alignItems: 'center', marginVertical: 4 },
  introBubbleImage: { width: '100%', borderRadius: 10, aspectRatio: 16 / 9, minHeight: 120 },
  introBubbleImageCaption: { fontSize: 12, color: '#8A8A9E', marginTop: 4, textAlign: 'center' },
  bgCard: { backgroundColor: '#0E0E14', borderRadius: 12, borderWidth: 1, borderColor: '#181820', padding: 14, marginBottom: 12, gap: 8 },
  bgCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bgImageSlot: {
    width: 60, height: 80, // 3:4 비율 (포트레이트)
    borderRadius: 8, backgroundColor: '#0E0E14',
    borderWidth: 1, borderColor: '#181820',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden'
  },
  bgImageSlotText: { color: '#757585', fontSize: 10, textAlign: 'center', lineHeight: 16 },
  bgPreview: { width: 60, height: 80, borderRadius: 8 }, // resizeMode cover in JSX
  bgCondLabel: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  bgCondRow: { backgroundColor: '#050507', borderRadius: 8, padding: 8, gap: 6 },
  bgCondTypeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
// AI 어시스턴트
  aiModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  aiModalBox: { backgroundColor: '#08080C', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: '#181820' },
  aiModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiModalTitle: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  aiModalClose: { fontSize: 18, color: '#F0F0F5', padding: 4 },
  aiModalHint: { fontSize: 13, color: '#8A8A9E', lineHeight: 20 },
  aiModalInput: { backgroundColor: '#0E0E14', borderWidth: 1, borderColor: '#181820', borderRadius: 12, padding: 14, color: '#F0F0F5', fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  aiModalBtn: { backgroundColor: '#F0F0F5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  aiModalBtnText: { color: '#050507', fontSize: 15, fontFamily: Typography.fontFamily.bold },
  // [sanitized comment]
  choiceEventCard: { backgroundColor: '#0E0E14', borderRadius: 12, borderWidth: 1, borderColor: '#2C2C38', padding: 12, marginBottom: 12, gap: 8 },
  choiceEventHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  choiceEventTitle: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#8A8A9E' },
  choiceSubLabel: { fontSize: 11, color: '#8A8A9E', fontFamily: Typography.fontFamily.semibold, marginBottom: 4 },
  choiceOptionCard: { backgroundColor: '#050507', borderRadius: 10, borderWidth: 1, borderColor: '#2C2C38', padding: 10, marginBottom: 8 },
  choiceOptionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  choiceOptionNum: { fontSize: 12, color: '#8A8A9E', fontFamily: Typography.fontFamily.semibold },
  choiceEmotionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  choiceEmotionCharLabel: { fontSize: 11, color: '#8A8A9E', width: 60, flexShrink: 0 },
  choiceEmotionItem: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 10 },
  choiceEmotionCode: { fontSize: 10, color: '#797990', width: 20 },
  choiceEmotionBtn: { width: 22, height: 22, backgroundColor: '#0C0C14', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  choiceEmotionBtnText: { color: '#60A5FA', fontSize: 14, fontFamily: Typography.fontFamily.bold },
  choiceEmotionVal: { fontSize: 12, fontFamily: Typography.fontFamily.bold, minWidth: 30, textAlign: 'center' },
  chapterSelectBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1A1A2A', borderRadius: 8, borderWidth: 1, borderColor: '#2A2A4A', marginRight: 6 },
  chapterSelectBtnActive: { borderColor: '#8A8A9E', backgroundColor: '#1A1A28' },
  chapterSelectBtnText: { fontSize: 11, color: '#797990' },
  chapterSelectBtnTextActive: { color: '#8A8A9E', fontFamily: Typography.fontFamily.semibold },
  addChoiceOptionBtn: { paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C38', borderRadius: 8, borderStyle: 'dashed', marginTop: 4 },
  addChoiceOptionBtnText: { fontSize: 12, color: '#60A5FA' },
  addChoiceEventBtn: { marginTop: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C38', borderRadius: 10, borderStyle: 'dashed' },
  addChoiceEventBtnText: { fontSize: 13, color: '#8A8A9E', fontFamily: Typography.fontFamily.semibold },
  aiChoiceBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1A0F2E', borderRadius: 8, borderWidth: 1, borderColor: '#4C1D95' },
  aiChoiceBtnLoading: { opacity: 0.6 },
  aiChoiceBtnText: { fontSize: 11, color: '#8B5CF6', fontFamily: Typography.fontFamily.bold },
  // [sanitized comment]
  aiPresetChipActive: { backgroundColor: '#1A0F2E', borderColor: '#8B5CF6' },
  aiPresetChipText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  aiPresetChipTextActive: { color: '#C4B5FD', fontFamily: Typography.fontFamily.bold },
  aiAutoBox: { backgroundColor: '#1A0F2E', borderRadius: 12, borderWidth: 1, borderColor: '#4C1D95', paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  aiAutoText: { fontSize: 14, color: '#8B5CF6', fontFamily: Typography.fontFamily.semibold, textAlign: 'center' },

  // [sanitized comment]
  aiCharSection: { marginBottom: 4 },
  aiCharGenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 14, backgroundColor: '#120B24', borderRadius: 10, borderWidth: 1, borderColor: '#5B21B6', marginBottom: 8 },
  aiCharGenBtnText: { fontSize: 13, color: '#C4B5FD', fontFamily: Typography.fontFamily.bold },
  aiCharSuggestWrap: { backgroundColor: '#0E0E1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A1F4E', padding: 12, gap: 12 },
  aiSuggestGroup: { gap: 6 },
  aiSuggestLabel: { fontSize: 11, color: '#7C6FAA', fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 },
  aiSuggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aiSuggestChip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1A1530', borderRadius: 16, borderWidth: 1, borderColor: '#3B2F6E' },
  aiSuggestChipActive: { backgroundColor: '#4C1D95', borderColor: '#8B5CF6' },
  aiSuggestChipText: { fontSize: 13, color: '#B0A0D8' },
  aiSuggestChipTextActive: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  aiSuggestBlock: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#1A1530', borderRadius: 10, borderWidth: 1, borderColor: '#3B2F6E' },
  aiSuggestBlockText: { fontSize: 12, color: '#B0A0D8', lineHeight: 18 },
  aiSuggestClose: { alignItems: 'center', paddingVertical: 6, marginTop: 4 },
  aiSuggestCloseText: { fontSize: 12, color: '#4A3A70' }
  });

const graphS = StyleSheet.create({
  chapterNode: {
    backgroundColor: '#08080C', borderRadius: 12, borderWidth: 1, borderColor: '#111118',
    padding: 12, marginBottom: 10
  },
  nodeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  nodeNumBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#181820',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0
  },
  nodeNumText: { fontSize: 11, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5' },
  nodeTitle: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  incomingText: { fontSize: 11, color: '#8A8A9E', marginTop: 2 },
  edgesContainer: { paddingLeft: 8, gap: 6 },
  edgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  edgeLine: { width: 16, height: 1.5, backgroundColor: '#757585' },
  edgeBubble: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0E0E14', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: '#2C2C38'
  },
  edgeLabel: { flex: 1, fontSize: 12, color: '#8A8A9E', fontStyle: 'italic' },
  edgeArrow: { fontSize: 14, color: '#8A8A9E' },
  edgeTarget: {
    paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#2C2C38',
    borderRadius: 6
  },
  edgeTargetMissing: { backgroundColor: '#3A1A1A' },
  edgeTargetText: { fontSize: 11, fontFamily: Typography.fontFamily.bold, color: '#8A8A9E' },
  noEdgeText: { fontSize: 12, color: '#757585', fontStyle: 'italic', paddingLeft: 46 }
  });
