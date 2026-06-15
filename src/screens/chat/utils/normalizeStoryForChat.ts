import type { StoryConfig, EditorEmotions } from '../../../types/StoryContract';
import { sanitizeImageUrl } from '../../../utils/imageUrlPolicy';
import {
  pickLocalizedBlock,
  buildStoryDisplayModel,
  type StoryDisplayCharacter,
} from '../../home/utils/storyHelpers';

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function uniqueStringList(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  );
}

function pickLongerText(...values: unknown[]): string {
  const candidates = values
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (candidates.length === 0) return '';
  return candidates.sort((a, b) => b.length - a.length)[0];
}

function normalizeIdentityLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/\{u\}/g, 'user')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyUserLabel(value: unknown, userSettingName?: unknown): boolean {
  const label = normalizeIdentityLabel(value);
  if (!label) return false;

  const customUserName = normalizeIdentityLabel(userSettingName);
  const userLikeLabels = new Set([
    customUserName,
    'user',
    'me',
    'player',
    'protagonist',
    'owner',
    'self',
    'myself',
    '사용자',
    '유저',
    '플레이어',
    '주인공',
    '나',
    '본인',
  ].filter(Boolean));

  return userLikeLabels.has(label);
}

function isLikelyUserCharacterRecord(
  record: Record<string, unknown> | null | undefined,
  userSettingName?: unknown,
): boolean {
  if (!record) return false;
  if (record.isUser === true || record.isOwner === true || record.isPlayer === true) return true;

  const role = normalizeIdentityLabel(
    pickFirstText(
      record.role,
      record.characterRole,
      record.character_role,
      record.type,
      record.kind,
    ),
  );
  if (['user', 'owner', 'player', 'protagonist', 'me', 'self'].includes(role)) {
    return true;
  }

  return isLikelyUserLabel(
    pickFirstText(record.name, record.label, record.title),
    userSettingName,
  );
}

function hasUserLikeTranslationLabel(
  translationBlock: unknown,
  userSettingName?: unknown,
): boolean {
  const block = translationBlock && typeof translationBlock === 'object'
    ? translationBlock as Record<string, unknown>
    : {};
  if (Object.keys(block).length === 0) return false;

  const directValues = [block.name, block.label, block.title];
  if (directValues.some(value => isLikelyUserLabel(value, userSettingName))) {
    return true;
  }

  return Object.values(block).some(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const localized = candidate as Record<string, unknown>;
    return [localized.name, localized.label, localized.title]
      .some(value => isLikelyUserLabel(value, userSettingName));
  });
}

function pickPreferredNpcName(userSettingName: unknown, ...values: unknown[]): string {
  for (const value of values) {
    const text = pickFirstText(value);
    if (!text) continue;
    if (isLikelyUserLabel(text, userSettingName)) continue;
    if (isGenericCharacterName(text)) continue;
    return text;
  }
  return '';
}

function coerceStringId(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  const trimmed = String(value).trim();
  return trimmed || fallback;
}

function coerceNumberId(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeEmotionSet(raw: unknown): EditorEmotions {
  const value = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const nested = [
    value.initialEmotions,
    value.initial_emotions,
    value.emotions,
    value.emotion_state,
    value.emotionState,
  ].find(candidate => candidate && typeof candidate === 'object') as Record<string, unknown> | undefined;
  const source = nested ?? value;
  const values = Array.isArray(source.values) ? source.values : [];
  const e1 = asFiniteNumber(source.e1) ?? asFiniteNumber(source.valence) ?? asFiniteNumber(source.emotionE1) ?? asFiniteNumber(values[0]) ?? 0;
  const e2 = asFiniteNumber(source.e2) ?? asFiniteNumber(source.trust) ?? asFiniteNumber(source.emotionE2) ?? asFiniteNumber(values[1]) ?? 0;
  const e3 = asFiniteNumber(source.e3) ?? asFiniteNumber(source.dominance) ?? asFiniteNumber(source.emotionE3) ?? asFiniteNumber(values[2]) ?? 0;
  const e4 = asFiniteNumber(source.e4) ?? asFiniteNumber(source.arousal) ?? asFiniteNumber(source.emotionE4) ?? asFiniteNumber(values[3]) ?? 0;
  const e5 = asFiniteNumber(source.e5) ?? asFiniteNumber(source.attachment) ?? asFiniteNumber(source.emotionE5) ?? asFiniteNumber(values[4]) ?? 0;
  return {
    e1,
    e2,
    e3,
    e4,
    e5 };
}

function parseLooseObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseUserSettingRecord(raw: unknown): Record<string, unknown> {
  const parsed = parseLooseObject(raw);
  if (Object.keys(parsed).length > 0) return parsed;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    return {
      setting: trimmed,
      description: trimmed,
    };
  }
  return {};
}

function mergeEmotionSource(baseValue: unknown, nextValue: unknown): unknown {
  const base = normalizeEmotionSet(baseValue);
  const next = normalizeEmotionSet(nextValue);
  const baseHas = Object.values(base).some(value => Math.abs(value) > 0);
  const nextHas = Object.values(next).some(value => Math.abs(value) > 0);
  if (nextHas && !baseHas) return nextValue;
  if (baseHas) return baseValue;
  return nextValue ?? baseValue;
}

function mergeCharacterRecord(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    ...next,
    name: pickLongerText(next.name, base.name),
    age: pickLongerText(next.age, base.age),
    gender: pickLongerText(next.gender, base.gender),
    traits: pickLongerText(next.traits, next.appearance, base.traits, base.appearance),
    appearance: pickLongerText(next.appearance, next.traits, base.appearance, base.traits),
    setting: pickLongerText(next.setting, next.description, next.personality, base.setting, base.description, base.personality),
    description: pickLongerText(next.description, next.setting, next.personality, base.description, base.setting, base.personality),
    personality: pickLongerText(next.personality, next.description, base.personality, base.description),
    personalityExample: pickLongerText(
      next.personalityExample,
      next.speech,
      next.speechPattern,
      next.speech_pattern,
      base.personalityExample,
      base.speech,
      base.speechPattern,
      base.speech_pattern,
    ),
    speechPattern: pickLongerText(
      next.speechPattern,
      next.speech_pattern,
      next.speech,
      next.personalityExample,
      base.speechPattern,
      base.speech_pattern,
      base.speech,
      base.personalityExample,
    ),
    speech_pattern: pickLongerText(
      next.speech_pattern,
      next.speechPattern,
      next.speech,
      next.personalityExample,
      base.speech_pattern,
      base.speechPattern,
      base.speech,
      base.personalityExample,
    ),
    speech: pickLongerText(
      next.speech,
      next.speechPattern,
      next.speech_pattern,
      next.personalityExample,
      base.speech,
      base.speechPattern,
      base.speech_pattern,
      base.personalityExample,
    ),
    imageUris: uniqueStringList([
      ...(Array.isArray(base.imageUris) ? base.imageUris : []),
      ...(Array.isArray(next.imageUris) ? next.imageUris : []),
      ...(Array.isArray(base.imageUrls) ? base.imageUrls : []),
      ...(Array.isArray(next.imageUrls) ? next.imageUrls : []),
      base.profileUrl,
      base.profile_url,
      next.profileUrl,
      next.profile_url,
      base.imageUrl,
      next.imageUrl,
    ]).map(uri => sanitizeImageUrl(uri)).filter(Boolean),
    initialEmotions: mergeEmotionSource(base.initialEmotions, next.initialEmotions),
    initial_emotions: mergeEmotionSource(base.initial_emotions, next.initial_emotions),
    emotions: mergeEmotionSource(base.emotions, next.emotions),
  };
}

function normalizeCharacter(rawCharacter: unknown, index: number) {
  const character = (rawCharacter && typeof rawCharacter === 'object')
    ? rawCharacter as Record<string, unknown>
    : {};
  const id = coerceNumberId(character.id ?? character.char_index, index + 2);
  const rawImageUris = Array.isArray(character.imageUris)
    ? character.imageUris.filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0)
    : [];
  const rawImageUrls = Array.isArray(character.imageUrls)
    ? character.imageUrls.filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0)
    : [];
  // ✅ [BUG FIX] sanitizeImageUrl 적용으로 beta/profile/ 경로 해결
  const profileUrl = sanitizeImageUrl(pickFirstText(
    rawImageUris[0],
    character.profileUrl,
    character.profile_url,
    rawImageUrls[0],
    character.imageUrl,
  ));
  const imageUris = rawImageUris.length > 0
    ? rawImageUris.map(uri => sanitizeImageUrl(uri)).filter(Boolean)
    : profileUrl
      ? [profileUrl]
      : rawImageUrls.map(uri => sanitizeImageUrl(uri)).filter(Boolean);

  return {
    ...character,
    id,
    char_index: id,
    name: pickFirstText(character.name, `캐릭터 ${id}`),
    profileUrl,
    profile_url: pickFirstText(character.profile_url, profileUrl) ? sanitizeImageUrl(pickFirstText(character.profile_url, profileUrl)) : profileUrl,
    imageUris,
    personality: pickFirstText(character.personality, character.setting, character.description),
    personalityExample: pickFirstText(
      character.personalityExample,
      character.speechPattern,
      character.speech_pattern,
      character.speech,
    ),
    speechPattern: pickFirstText(
      character.speechPattern,
      character.speech_pattern,
      character.speech,
      character.personalityExample,
    ),
    speech_pattern: pickFirstText(
      character.speech_pattern,
      character.speechPattern,
      character.speech,
      character.personalityExample,
    ),
    speech: pickFirstText(
      character.speech,
      character.speechPattern,
      character.speech_pattern,
      character.personalityExample,
    ),
    age: pickFirstText(character.age),
    gender: pickFirstText(character.gender),
    traits: pickFirstText(character.traits, character.appearance),
    appearance: pickFirstText(character.appearance, character.traits),
    setting: pickFirstText(character.setting, character.description, character.personality),
    description: pickFirstText(character.description, character.setting, character.personality),
    initialEmotions: normalizeEmotionSet(character.initialEmotions ?? character.initial_emotions ?? character.emotions ?? character),
    initial_emotions: normalizeEmotionSet(character.initialEmotions ?? character.initial_emotions ?? character.emotions ?? character),
    emotions: normalizeEmotionSet(character.initialEmotions ?? character.initial_emotions ?? character.emotions ?? character) };
}

function normalizeIntroMessage(rawMessage: unknown, chapterId: string, index: number) {
  const message = (rawMessage && typeof rawMessage === 'object')
    ? rawMessage as Record<string, unknown>
    : {};
  const speakerType = pickFirstText(message.speakerType, message.speaker_type, 'narrator');
  const messageId = coerceStringId(message.id, `${chapterId}_intro_${index + 1}`);
  const speakerCharId = message.speakerCharId ?? message.speaker_char_id;

  return {
    ...message,
    id: messageId,
    speakerType,
    speaker_type: speakerType,
    speakerCharId: speakerCharId != null ? coerceNumberId(speakerCharId, 0) : undefined,
    speaker_char_id: speakerCharId != null ? coerceNumberId(speakerCharId, 0) : undefined,
    content: pickFirstText(message.content),
    speakerName: pickFirstText(message.speakerName) };
}

function normalizeChoiceEvent(rawEvent: unknown) {
  const choiceEvent = (rawEvent && typeof rawEvent === 'object')
    ? rawEvent as Record<string, unknown>
    : {};
  const options = Array.isArray(choiceEvent.options) ? choiceEvent.options : [];

  return {
    ...choiceEvent,
    id: coerceStringId(choiceEvent.id),
    options: options.map((rawOption, optionIndex) => {
      const option = (rawOption && typeof rawOption === 'object')
        ? rawOption as Record<string, unknown>
        : {};
      return {
        id: coerceStringId(option.id, `choice_${optionIndex + 1}`),
        label: pickFirstText(option.label, `Choice ${optionIndex + 1}`),
        targetChapterId: option.targetChapterId != null
          ? coerceStringId(option.targetChapterId)
          : undefined,
      };
    }) };
}

function normalizeBackground(
  rawBackground: unknown,
  index: number,
): Record<string, unknown> | null {
  if (typeof rawBackground === 'string') {
    const imageUrl = sanitizeImageUrl(pickFirstText(rawBackground));
    if (!imageUrl) return null;
    return {
      id: `background_${index + 1}`,
      label: `Background ${index + 1}`,
      imageUrl,
      uri: imageUrl,
      conditions: [],
    };
  }

  if (!rawBackground || typeof rawBackground !== 'object') return null;

  const background = rawBackground as Record<string, unknown>;
  const imageUrl = sanitizeImageUrl(pickFirstText(
    background.imageUrl,
    background.image_url,
    background.uri,
  ));
  if (!imageUrl) return null;

  return {
    ...background,
    id: coerceStringId(background.id, `background_${index + 1}`),
    label: pickFirstText(background.label, `Background ${index + 1}`),
    imageUrl,
    image_url: sanitizeImageUrl(pickFirstText(background.image_url, imageUrl)),
    uri: sanitizeImageUrl(pickFirstText(background.uri, imageUrl)),
    conditions: Array.isArray(background.conditions) ? background.conditions : [],
  };
}

function normalizeBackgrounds(values: unknown[]): Record<string, unknown>[] {
  const normalized: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  values.forEach((value, index) => {
    const background = normalizeBackground(value, normalized.length + index);
    if (!background) return;
    const key = pickFirstText(background.id, background.imageUrl, background.uri);
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(background);
  });

  return normalized;
}

function normalizeChapter(rawChapter: unknown, index: number) {
  const chapter = (rawChapter && typeof rawChapter === 'object')
    ? rawChapter as Record<string, unknown>
    : {};
  const chapterId = coerceStringId(chapter.id, `chapter_${index + 1}`);
  const introSource = Array.isArray(chapter.introMessages)
    ? chapter.introMessages
    : Array.isArray(chapter.intro)
      ? chapter.intro
      : [];

  return {
    ...chapter,
    id: chapterId,
    title: pickFirstText(chapter.title, `Chapter ${index + 1}`),
    aiGoal: pickFirstText(chapter.aiGoal),
    chapterInfo: pickFirstText(chapter.chapterInfo),
    prevSummary: pickFirstText(chapter.prevSummary),
    intro: introSource.map((message, messageIndex) => normalizeIntroMessage(message, chapterId, messageIndex)),
    introMessages: introSource.map((message, messageIndex) => normalizeIntroMessage(message, chapterId, messageIndex)),
    choiceEvents: Array.isArray(chapter.choiceEvents)
      ? chapter.choiceEvents.map(normalizeChoiceEvent)
      : [] };
}

function normalizeCharacters(values: unknown[]): Record<string, unknown>[] {
  const normalized: Record<string, unknown>[] = [];
  const usedIds = new Set<number>();

  values.forEach((character, index) => {
    const normalizedCharacter = normalizeCharacter(character, index) as Record<string, unknown>;
    let nextId = coerceNumberId(normalizedCharacter.id ?? normalizedCharacter.char_index, index + 2);

    if (usedIds.has(nextId)) {
      if (nextId === 1) {
        nextId = index + 2;
      }
      while (usedIds.has(nextId)) {
        nextId += 1;
      }
    }

    usedIds.add(nextId);
    normalized.push({
      ...normalizedCharacter,
      id: nextId,
      char_index: nextId,
    });
  });

  return normalized;
}

export function normalizeChatStoryConfig(rawConfig: unknown): StoryConfig {
  let configRecord: Record<string, unknown> = {};

  if (typeof rawConfig === 'string') {
    try {
      const parsed = JSON.parse(rawConfig);
      configRecord = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
    } catch {
      configRecord = {};
    }
  } else if (rawConfig && typeof rawConfig === 'object') {
    configRecord = rawConfig as Record<string, unknown>;
  }

  const normalizedUserSetting = parseUserSettingRecord(
    configRecord.userSetting ?? configRecord.user_setting,
  );

  return {
    ...configRecord,
    worldSetting: pickFirstText(configRecord.worldSetting, configRecord.world_setting),
    world_setting: pickFirstText(configRecord.world_setting, configRecord.worldSetting),
    title: pickFirstText(configRecord.title),
    description: pickFirstText(configRecord.description),
    userSetting: normalizedUserSetting,
    user_setting: normalizedUserSetting,
    characters: Array.isArray(configRecord.characters)
      ? normalizeCharacters(configRecord.characters)
      : [],
    chapters: Array.isArray(configRecord.chapters)
      ? configRecord.chapters.map((chapter, index) => normalizeChapter(chapter, index))
      : [],
    backgrounds: normalizeBackgrounds(Array.isArray(configRecord.backgrounds) ? configRecord.backgrounds : []),
  } as unknown as StoryConfig;
}

export function normalizeChatStoryPayload<T>(rawStory: T): T {
  if (!rawStory || typeof rawStory !== 'object') {
    return rawStory;
  }

  const story = rawStory as Record<string, unknown>;
  const hasStoryEnvelope =
    'story_config' in story ||
    'id' in story ||
    'title' in story ||
    'author' in story ||
    'authorId' in story ||
    'coverUrl' in story ||
    'cover_url' in story;

  const normalizedConfig = normalizeChatStoryConfig(story.story_config ?? story);
  const normalizedBackgrounds = normalizeBackgrounds([
    ...(Array.isArray(normalizedConfig.backgrounds) ? normalizedConfig.backgrounds : []),
    ...(Array.isArray(story.backgrounds) ? story.backgrounds : []),
    ...(Array.isArray(story.bg_urls) ? story.bg_urls : []),
  ]);
  const rawUserSetting = parseUserSettingRecord(
    normalizedConfig.userSetting ??
    normalizedConfig.user_setting ??
    story.userSetting ??
    story.user_setting,
  );
  const userSettingName = pickFirstText(rawUserSetting.name);
  const charTranslationMapSource = normalizedConfig.charMultiLangData ?? normalizedConfig.char_multi_lang_data;
  const charTranslationMap = charTranslationMapSource && typeof charTranslationMapSource === 'object'
    ? charTranslationMapSource as Record<string, unknown>
    : {};
  const rootCharacters = Array.isArray(story.characters) ? story.characters : [];
  const mergedCharacters = new Map<number, Record<string, unknown>>();

  rootCharacters
    .map(character => (character && typeof character === 'object' ? character as unknown as Record<string, unknown> : {}))
    .filter(character => Object.keys(character).length > 0)
    .forEach(character => {
      const id = coerceNumberId(character.id ?? character.char_index, -1);
      mergedCharacters.set(id, character);
    });

  (normalizedConfig.characters ?? [])
    .map(character => (character && typeof character === 'object' ? character as unknown as Record<string, unknown> : {}))
    .filter(character => Object.keys(character).length > 0)
    .forEach(character => {
      const id = coerceNumberId(character.id ?? character.char_index, -1);
      mergedCharacters.set(id, mergeCharacterRecord(mergedCharacters.get(id) ?? {}, character));
    });

  const recordLooksLikeUser = (
    id: number,
    record: Record<string, unknown> | null | undefined,
  ) => (
    isLikelyUserCharacterRecord(record, userSettingName)
    || hasUserLikeTranslationLabel(charTranslationMap[String(id)] ?? charTranslationMap[id], userSettingName)
  );
  const currentProtagonist = mergedCharacters.get(1);
  const currentProtagonistNameLooksLikeUser = isLikelyUserCharacterRecord(currentProtagonist, userSettingName);
  const currentProtagonistTranslationLooksLikeUser = hasUserLikeTranslationLabel(
    charTranslationMap['1'] ?? charTranslationMap[1],
    userSettingName,
  );
  const currentProtagonistLooksLikeUser = recordLooksLikeUser(1, currentProtagonist);
  const alternateUserEntry = Array.from(mergedCharacters.entries())
    .find(([id, record]) => id !== 1 && recordLooksLikeUser(id, record));
  const shouldPreferAlternateUser = Boolean(
    alternateUserEntry
    && currentProtagonistNameLooksLikeUser
    && !currentProtagonistTranslationLooksLikeUser,
  );
  const promotedUserEntry = shouldPreferAlternateUser
    ? alternateUserEntry
    : currentProtagonistLooksLikeUser
      ? [1, currentProtagonist] as const
      : alternateUserEntry;
  const promotedUserId = promotedUserEntry?.[0];
  const promotedUserBase = promotedUserEntry?.[1] ?? {};

  if (typeof promotedUserId === 'number' && promotedUserId !== 1) {
    mergedCharacters.delete(promotedUserId);
  }

  if (currentProtagonist && (!currentProtagonistLooksLikeUser || promotedUserId !== 1)) {
    let reassignedId = 2;
    while (mergedCharacters.has(reassignedId)) reassignedId += 1;
    mergedCharacters.set(reassignedId, {
      ...currentProtagonist,
      id: reassignedId,
      char_index: reassignedId,
    });
  }

  const explicitUserImageUris = uniqueStringList([
    ...(Array.isArray(rawUserSetting.imageUris) ? rawUserSetting.imageUris : []),
    rawUserSetting.imageUri,
    rawUserSetting.imageUrl,
    rawUserSetting.avatarUri,
    rawUserSetting.avatarUrl,
    rawUserSetting.profileUrl,
    rawUserSetting.profile_url,
  ]).map(uri => sanitizeImageUrl(uri)).filter(Boolean);

  mergedCharacters.set(1, mergeCharacterRecord(promotedUserEntry ? promotedUserBase : {}, {
    id: 1,
    char_index: 1,
    name: pickFirstText(rawUserSetting.name, promotedUserBase.name, '{u}'),
    imageUris: explicitUserImageUris,
    profileUrl: explicitUserImageUris[0] ?? '',
    profile_url: explicitUserImageUris[0] ?? '',
    imageUrl: explicitUserImageUris[0] ?? '',
    image_url: explicitUserImageUris[0] ?? '',
    appearance: pickFirstText(rawUserSetting.appearance, rawUserSetting.traits),
    traits: pickFirstText(rawUserSetting.traits, rawUserSetting.appearance),
    setting: pickFirstText(rawUserSetting.setting, rawUserSetting.description),
    description: pickFirstText(rawUserSetting.description, rawUserSetting.setting),
    speech: pickFirstText(rawUserSetting.speech, rawUserSetting.speechPattern, rawUserSetting.speech_pattern),
    speechPattern: pickFirstText(rawUserSetting.speechPattern, rawUserSetting.speech, rawUserSetting.speech_pattern),
    speech_pattern: pickFirstText(rawUserSetting.speech_pattern, rawUserSetting.speechPattern, rawUserSetting.speech),
    initialEmotions: rawUserSetting.initialEmotions,
    initial_emotions: rawUserSetting.initial_emotions,
    emotions: rawUserSetting.emotions,
  }));

  const normalizedMergedCharacters = Array.from(mergedCharacters.values()).map((character, index) =>
    normalizeCharacter(character, index),
  );
  if (!hasStoryEnvelope) {
    return normalizedConfig as T;
  }

  return {
    ...story,
    id: coerceStringId(story.id),
    title: pickFirstText(story.title, normalizedConfig.title, 'Story'),
    userName: pickFirstText(story.userName, rawUserSetting.name),
    userSetting: rawUserSetting,
    user_setting: rawUserSetting,
    story_config: {
      ...normalizedConfig,
      userSetting: rawUserSetting,
      user_setting: rawUserSetting,
      characters: normalizedMergedCharacters,
      backgrounds: normalizedBackgrounds,
    } } as T;
}

export function getNormalizedChatStoryConfig(rawStory: unknown): StoryConfig {
  const normalized = normalizeChatStoryPayload(rawStory);
  if (normalized && typeof normalized === 'object' && 'story_config' in (normalized as Record<string, unknown>)) {
    return normalizeChatStoryConfig((normalized as Record<string, unknown>).story_config);
  }
  return normalizeChatStoryConfig(normalized);
}

function isGenericCharacterName(value: unknown): boolean {
  const normalized = pickFirstText(value);
  return !normalized || /^character(?:\s+\d+)?$/i.test(normalized);
}

function resolveRenderableCharacterName(
  character: StoryDisplayCharacter,
  configRecord: Record<string, unknown>,
  appLanguage: string | undefined,
  stableId: number,
) {
  const userSetting = parseUserSettingRecord(configRecord.userSetting ?? configRecord.user_setting);
  const userSettingName = pickFirstText(userSetting.name);
  const translationMapSource = configRecord.charMultiLangData ?? configRecord.char_multi_lang_data;
  const translationMap = translationMapSource && typeof translationMapSource === 'object'
    ? translationMapSource as Record<string, unknown>
    : {};
  const translationBlock = translationMap[String(stableId)] ?? translationMap[stableId];
  const localized = pickLocalizedBlock(translationBlock, appLanguage, false) ?? {};
  const rawSource = (character.rawSource ?? {}) as Record<string, unknown>;
  const rawName = pickFirstText(rawSource.name);
  const displayName = pickFirstText(character.name);
  const translatedName = pickFirstText((localized as Record<string, unknown>).name);

  return pickPreferredNpcName(
    userSettingName,
    translatedName,
    rawName,
    displayName,
  ) || `캐릭터 ${stableId}`;
}

function toRenderableChatCharacter(character: StoryDisplayCharacter, stableId: number, resolvedName?: string) {
  const profileUrl = pickFirstText(character.imageUris?.[0], (character.rawSource as Record<string, unknown> | undefined)?.profileUrl);
  return {
    ...(character.rawSource ?? {}),
    id: stableId,
    char_index: stableId,
    name: resolvedName ?? character.name,
    profileUrl,
    profile_url: profileUrl,
    imageUris: Array.isArray(character.imageUris) ? character.imageUris : [],
    personality: character.personality,
    personalityExample: character.personalityExample,
    speechPattern: character.speechPattern,
    speech_pattern: character.speechPattern,
    speech: character.speech,
    age: character.age,
    gender: character.gender,
    traits: character.traits,
    appearance: character.appearance,
    setting: character.setting,
    description: character.description,
    initialEmotions: character.initialEmotions,
    initial_emotions: character.initialEmotions,
    emotions: character.initialEmotions,
  };
}

function toStoryDisplayCharacterFromConfig(
  rawCharacter: Record<string, unknown>,
  isUser: boolean,
): StoryDisplayCharacter {
  const id = coerceNumberId(rawCharacter.id ?? rawCharacter.char_index, isUser ? 1 : 0);
  const personalityExample = pickFirstText(
    rawCharacter.personalityExample,
    rawCharacter.speechPattern,
    rawCharacter.speech_pattern,
    rawCharacter.speech,
  );
  const speech = pickFirstText(
    rawCharacter.speech,
    rawCharacter.speechPattern,
    rawCharacter.speech_pattern,
    personalityExample,
  );
  const imageUris = uniqueStringList([
    ...(Array.isArray(rawCharacter.imageUris) ? rawCharacter.imageUris : []),
    rawCharacter.profileUrl,
    rawCharacter.profile_url,
    rawCharacter.imageUrl,
    rawCharacter.image_url,
  ]).map(uri => sanitizeImageUrl(uri)).filter(Boolean);

  return {
    id,
    key: `${isUser ? 'user' : 'character'}-${id || 'x'}`,
    isUser,
    name: pickFirstText(rawCharacter.name, isUser ? '{u}' : `캐릭터 ${Math.max(id, 2)}`),
    age: pickFirstText(rawCharacter.age),
    gender: pickFirstText(rawCharacter.gender),
    traits: pickFirstText(rawCharacter.traits, rawCharacter.appearance),
    appearance: pickFirstText(rawCharacter.appearance, rawCharacter.traits),
    setting: pickFirstText(rawCharacter.setting, rawCharacter.description, rawCharacter.personality),
    description: pickFirstText(rawCharacter.description, rawCharacter.setting, rawCharacter.personality),
    personality: pickFirstText(rawCharacter.personality, rawCharacter.description, rawCharacter.setting),
    personalityExample,
    speechPattern: pickFirstText(
      rawCharacter.speechPattern,
      rawCharacter.speech_pattern,
      speech,
      personalityExample,
    ),
    speech,
    imageUris,
    initialEmotions: normalizeEmotionSet(
      rawCharacter.initialEmotions ??
      rawCharacter.initial_emotions ??
      rawCharacter.emotions ??
      rawCharacter,
    ),
    rawSource: { ...rawCharacter },
  };
}

export function buildRenderableChatStory<T>(rawStory: T, appLanguage?: string): T {
  const normalizedStory = normalizeChatStoryPayload(rawStory);
  if (!normalizedStory || typeof normalizedStory !== 'object') {
    return normalizedStory;
  }

  const storyRecord = normalizedStory as Record<string, unknown>;
  const normalizedConfig = getNormalizedChatStoryConfig(storyRecord);
  const storyDisplay = buildStoryDisplayModel(storyRecord, appLanguage);
  const configRecord = normalizedConfig as unknown as Record<string, unknown>;
  const normalizedUserSetting = parseUserSettingRecord(configRecord.userSetting ?? configRecord.user_setting);
  const normalizedUserName = pickFirstText(normalizedUserSetting.name);
  const normalizedCharacters = Array.isArray(normalizedConfig.characters) ? normalizedConfig.characters : [];
  const protagonist = storyDisplay.characters.find(character => character.isUser)
    ?? (() => {
      const fallback = normalizedCharacters.find(character => Number(character.id) === 1);
      return fallback
        ? toStoryDisplayCharacterFromConfig(fallback as unknown as Record<string, unknown>, true)
        : undefined;
    })();
  const sideCharacters = storyDisplay.characters.filter(character => {
    if (character.isUser) return false;
    const rawSource = (character.rawSource ?? {}) as Record<string, unknown>;
    return !isLikelyUserLabel(character.name, normalizedUserName)
      && !isLikelyUserLabel(rawSource.name, normalizedUserName);
  });
  const hydratedNpcCharacters = getHydratedNpcCharacters(normalizedConfig);
  const renderableSideCharacters = sideCharacters.length > 0
    ? sideCharacters
    : hydratedNpcCharacters.map(character =>
        toStoryDisplayCharacterFromConfig(character as unknown as Record<string, unknown>, false),
      );
  const usedCharacterIds = new Set<number>(protagonist ? [1] : []);
  const renderableCharacters = [
    ...(protagonist ? [toRenderableChatCharacter(protagonist, 1, protagonist.name)] : []),
    ...renderableSideCharacters.map((character, index) => {
      const preferredId = Number(character.id);
      let stableId = Number.isFinite(preferredId) && preferredId >= 2 && !usedCharacterIds.has(preferredId)
        ? preferredId
        : index + 2;
      while (stableId < 2 || usedCharacterIds.has(stableId)) stableId += 1;
      usedCharacterIds.add(stableId);
      return toRenderableChatCharacter(
        character,
        stableId,
        resolveRenderableCharacterName(character, configRecord, appLanguage, stableId),
      );
    }),
  ];
  const renderableBackgrounds = normalizeBackgrounds([
    ...(Array.isArray(normalizedConfig.backgrounds) ? normalizedConfig.backgrounds : []),
    ...(Array.isArray(storyRecord.backgrounds) ? storyRecord.backgrounds : []),
    ...(Array.isArray(storyRecord.bg_urls) ? storyRecord.bg_urls : []),
  ]);

  return {
    ...storyRecord,
    userName: pickFirstText(storyRecord.userName, normalizedUserName),
    userSetting: normalizedUserSetting,
    user_setting: normalizedUserSetting,
    characters: renderableCharacters,
    story_config: {
      ...normalizedConfig,
      userSetting: normalizedUserSetting,
      user_setting: normalizedUserSetting,
      characters: renderableCharacters,
      backgrounds: renderableBackgrounds,
    },
  } as T;
}

function getHydratedNpcCharacters(config: StoryConfig) {
  const configRecord = config as unknown as Record<string, unknown>;
  const userSetting = parseUserSettingRecord(configRecord.userSetting ?? configRecord.user_setting);
  const userSettingName = pickFirstText(userSetting.name);
  const characters = Array.isArray(config.characters) ? config.characters : [];
  const explicitNpcCharacters = characters.filter(character =>
    Number(character.id) >= 2 && !isLikelyUserLabel(character.name, userSettingName),
  );
  if (explicitNpcCharacters.length > 0) {
    return explicitNpcCharacters;
  }

  const protagonistIndex = characters.findIndex(character => Number(character.id) === 1);
  if (protagonistIndex >= 0) {
    return characters.filter((character, index) =>
      index !== protagonistIndex && !isLikelyUserLabel(character.name, userSettingName),
    );
  }

  return characters.filter(character => !isLikelyUserLabel(character.name, userSettingName)).slice(1);
}

export function hasHydratedChatStory(rawStory: unknown): boolean {
  const config = getNormalizedChatStoryConfig(rawStory);
  const hasChapters = Array.isArray(config.chapters) && config.chapters.length > 0;
  const npcCharacters = getHydratedNpcCharacters(config);
  return hasChapters && npcCharacters.length > 0;
}

export function needsHydratedChatStory(rawStory: unknown): boolean {
  const config = getNormalizedChatStoryConfig(rawStory);
  const hasChapters = Array.isArray(config.chapters) && config.chapters.length > 0;
  const npcCharacters = getHydratedNpcCharacters(config);
  const hasCharacters = npcCharacters.length > 0;
  const hasCharacterImage = hasCharacters && npcCharacters.some(character =>
    pickFirstText(character.profileUrl, character.profile_url, character.imageUris?.[0]).length > 0,
  );
  // [BUG FIX] backgrounds가 없으면 항상 서버에서 가져옴 (채팅 배경 이미지 필요)
  const hasBackgrounds = Array.isArray(config.backgrounds) && config.backgrounds.length > 0;
  return !hasChapters || !hasCharacters || !hasCharacterImage || !hasBackgrounds;
}

export function resolveChatHydrationResult<T>(
  routeStory: T,
  fetchedStory: unknown,
): { story: T; failed: boolean } {
  const normalizedFetchedStory = normalizeChatStoryPayload(fetchedStory) as T;
  if (hasHydratedChatStory(normalizedFetchedStory)) {
    return { story: normalizedFetchedStory, failed: false };
  }

  const normalizedRouteStory = normalizeChatStoryPayload(routeStory) as T;
  if (hasHydratedChatStory(normalizedRouteStory)) {
    return { story: normalizedRouteStory, failed: false };
  }

  return { story: normalizedRouteStory, failed: true };
}
