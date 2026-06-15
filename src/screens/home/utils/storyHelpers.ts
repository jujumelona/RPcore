/* eslint-disable @typescript-eslint/no-unused-vars */
import type { RankableStory } from '../../../utils/recommendationRanker';


import { sanitizeImageUrl } from '../../../utils/imageUrlPolicy';
import { normalizeStoryGenre } from '../../../utils/storyGenres';

export type HomeCharacterProfile = {
  id: string;
  role: 'protagonist' | 'character';
  name: string;
  age: string;
  setting: string;
  description: string;
  imageUrl: string;
};


export function splitHashtags(value: string): string[] {
  return (value || '')
    .split(/[,#\s]+/)
    .map((v: string) => v.trim())
    .filter(Boolean);
}

// story_config can arrive either as JSON text or as an object.
export function parseStoryConfig(raw: Record<string, unknown>): Record<string, unknown> {
  try {
    if (typeof raw.story_config === 'string') {
      return JSON.parse(raw.story_config) as Record<string, unknown>;
    }
    if (typeof raw.storyConfig === 'string') {
      return JSON.parse(raw.storyConfig) as Record<string, unknown>;
    }
    if (raw.story_config && typeof raw.story_config === 'object') {
      return raw.story_config as Record<string, unknown>;
    }
    if (raw.storyConfig && typeof raw.storyConfig === 'object') {
      return raw.storyConfig as Record<string, unknown>;
    }
  } catch {}
  return {};
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

// Returns the first non-empty string candidate.
export function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return '';
}

function normalizeImageCandidate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const uri = value.trim();
  if (!uri) return '';
  return sanitizeImageUrl(uri);
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

function isLikelyUserIdentityLabel(
  value: unknown,
  userSetting?: Record<string, unknown> | null,
): boolean {
  const label = normalizeIdentityLabel(value);
  if (!label) return false;

  const customUserName = normalizeIdentityLabel(pickString(userSetting?.name));
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

function hasUserLikeTranslationLabel(
  translationBlock: unknown,
  userSetting?: Record<string, unknown> | null,
): boolean {
  const block = asRecord(translationBlock);
  if (Object.keys(block).length === 0) return false;

  const directCandidates = [
    block.name,
    block.label,
    block.title,
  ];
  if (directCandidates.some(candidate => isLikelyUserIdentityLabel(candidate, userSetting))) {
    return true;
  }

  return Object.values(block).some(candidate => {
    if (!candidate || typeof candidate !== 'object') return false;
    const localized = candidate as Record<string, unknown>;
    return [localized.name, localized.label, localized.title]
      .some(value => isLikelyUserIdentityLabel(value, userSetting));
  });
}

function isLikelyUserCharacterRecord(
  record: Record<string, unknown> | null | undefined,
  userSetting?: Record<string, unknown> | null,
): boolean {
  if (!record) return false;
  if (record.isUser === true || record.isOwner === true || record.isPlayer === true) return true;

  const role = normalizeIdentityLabel(
    pickString(
      record.role,
      record.characterRole,
      record.character_role,
      record.type,
      record.kind,
    ),
  );
  if (['user', 'owner', 'player', 'protagonist', 'me'].includes(role)) {
    return true;
  }
  return isLikelyUserIdentityLabel(
    pickString(
      record.name,
      record.label,
      record.title,
    ),
    userSetting,
  );
}

function isUsableImageUrl(value: unknown): value is string {
  return normalizeImageCandidate(value).length > 0;
}

export function getFieldString(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return '';
}

function getLanguageCandidates(language: string | undefined): string[] {
  if (!language) return [];
  const raw = language.trim();
  if (!raw) return [];
  const normalized = raw.replace(/_/g, '-');
  const lower = normalized.toLowerCase();
  const short = lower.split('-')[0];
  return Array.from(new Set([raw, normalized, lower, short].filter(Boolean)));
}

export function pickLocalizedBlock(
  source: unknown,
  language: string | undefined,
  allowFallback = true,
): Record<string, unknown> | null {
  if (!source || typeof source !== 'object') return null;
  const map = source as Record<string, unknown>;
  const entries = Object.entries(map);
  if (entries.length === 0) return null;

  for (const candidate of getLanguageCandidates(language)) {
    const exact = map[candidate];
    if (exact && typeof exact === 'object') return exact as Record<string, unknown>;

    const lower = candidate.toLowerCase();
    const matched = entries.find(([key]) => key.toLowerCase() === lower)?.[1];
    if (matched && typeof matched === 'object') return matched as Record<string, unknown>;

    const short = lower.split('-')[0];
    const prefixMatched = entries.find(([key]) => {
      const normalizedKey = key.toLowerCase().replace(/_/g, '-');
      return normalizedKey === short || normalizedKey.startsWith(`${short}-`);
    })?.[1];
    if (prefixMatched && typeof prefixMatched === 'object') {
      return prefixMatched as Record<string, unknown>;
    }
  }

  if (!allowFallback) {
    return null;
  }

  const fallback = entries.find(([, value]) => value && typeof value === 'object')?.[1];
  return fallback ? (fallback as Record<string, unknown>) : null;
}

export function parseUserSetting(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return {
        setting: trimmed,
        description: trimmed,
      };
    }
  }
  return {};
}

export function joinNonEmpty(parts: unknown[], separator = ' · '): string {
  return parts
    .map(part => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(separator);
}


// Cover images must always prefer editor cover values over character images.
export function extractCoverUrl(raw: Record<string, unknown>): string {
  const cfg = parseStoryConfig(raw);
  if (Array.isArray(cfg.storeCoverUris) && cfg.storeCoverUris[0] && typeof cfg.storeCoverUris[0] === 'string')
    return cfg.storeCoverUris[0];
  if (Array.isArray(cfg.cover_urls) && cfg.cover_urls[0] && typeof cfg.cover_urls[0] === 'string')
    return cfg.cover_urls[0];
  if (Array.isArray(cfg.coverUris) && cfg.coverUris[0] && typeof cfg.coverUris[0] === 'string')
    return cfg.coverUris[0];
  if (typeof cfg.cover_url === 'string') return cfg.cover_url;
  if (typeof cfg.coverUrl === 'string') return cfg.coverUrl;

  if (Array.isArray(raw.storeCoverUris) && raw.storeCoverUris[0] && typeof raw.storeCoverUris[0] === 'string')
    return raw.storeCoverUris[0];
  if (Array.isArray(raw.cover_urls) && raw.cover_urls[0] && typeof raw.cover_urls[0] === 'string')
    return raw.cover_urls[0];
  if (Array.isArray(raw.coverUris) && raw.coverUris[0] && typeof raw.coverUris[0] === 'string')
    return raw.coverUris[0];
  if (typeof raw.coverUrl === 'string') return raw.coverUrl;
  if (typeof raw.cover_url === 'string') return raw.cover_url;
  if (typeof raw.thumb_url === 'string') return raw.thumb_url;

  return '';
}

export function extractAuthorAvatar(raw: Record<string, unknown>): string {
  const cfg = parseStoryConfig(raw);
  const candidates = [
    raw.authorImageUrl,
    raw.author_image_url,
    raw.author_avatar,
    raw.authorAvatar,
    cfg.authorAvatar,
    cfg.author_avatar,
  ];
  const first = candidates.find(v => typeof v === 'string' && (v as string).trim().length > 0);
  return sanitizeImageUrl(first);
}

export function extractAuthorId(raw: Record<string, unknown>): string {
  const cfg = parseStoryConfig(raw);
  const author = asRecord(raw.author);
  const user = asRecord(raw.user);
  return pickString(
    raw.authorId,
    raw.author_id,
    raw.userId,
    raw.user_id,
    raw.ownerId,
    raw.owner_id,
    raw.createdBy,
    raw.created_by,
    author.id,
    author.authorId,
    author.author_id,
    user.id,
    user.userId,
    user.user_id,
    cfg.authorId,
    cfg.author_id,
  );
}

export function extractStoryTags(raw: Record<string, unknown>): string[] {
  const cfg = parseStoryConfig(raw);
  const tagsFromConfig = splitHashtags(
    pickString(
      cfg.storyHashtag as string,
      cfg.story_hashtag as string,
      cfg.hashtags as string,
      raw.storyHashtag as string,
      raw.story_hashtag as string,
    ),
  );

  const rawTags =
    Array.isArray(raw.tags) ? raw.tags
    : Array.isArray(raw.hashtag) ? raw.hashtag
    : typeof raw.hashtag === 'string' && raw.hashtag
      ? splitHashtags(raw.hashtag as string)
      : Array.isArray(raw.story_hashtag) ? raw.story_hashtag
      : typeof raw.story_hashtag === 'string' && raw.story_hashtag
        ? splitHashtags(raw.story_hashtag as string)
        : [];

  const merged = [...rawTags, ...tagsFromConfig].filter(Boolean).map(v => String(v).trim());
  return Array.from(new Set(merged));
}

export function extractLocalizedStoryFields(
  raw: Record<string, unknown>,
  appLanguage: string | undefined,
): { title: string; description: string; worldSetting: string; tags: string[] } {
  const cfg = parseStoryConfig(raw);
  const baseTags = extractStoryTags(raw);
  const translations =
    raw.multiLangTranslations ??
    raw.multi_lang_translations ??
    cfg.multiLangTranslations ??
    cfg.multi_lang_translations;

  const localized = pickLocalizedBlock(translations, appLanguage, false);
  const translatedTitle       = getFieldString(localized, ['title', 'storyTitle']);
  const translatedDescription = getFieldString(localized, ['description', 'storyDescription']);
  const translatedWorldSetting = getFieldString(
    localized,
    ['worldSetting', 'world_setting', 'storyWorldSetting', 'story_world_setting', 'storySetting', 'setting', 'world'],
  );
  const translatedTagsRaw     = getFieldString(localized, ['hashtags', 'storyHashtag', 'tags']);

  return {
    title: translatedTitle || pickString(
      raw.title,
      cfg.title,
      cfg.storyTitle,
      cfg.story_title,
    ),
    description: translatedDescription || pickString(
      raw.description,
      cfg.description,
      cfg.storyDesc,
      cfg.storyDescription,
      cfg.story_description,
      raw.storyDesc,
      raw.story_description,
      '',
    ),
    worldSetting: translatedWorldSetting || pickString(
      cfg.worldSetting,
      cfg.world_setting,
      cfg.storyWorldSetting,
      cfg.story_world_setting,
      cfg.storySetting,
      cfg.setting,
      raw.worldSetting,
      raw.world_setting,
      raw.storyWorldSetting,
      raw.story_world_setting,
      raw.storySetting,
      raw.setting,
      '',
    ),
    tags:        localized
      ? (translatedTagsRaw ? splitHashtags(translatedTagsRaw) : baseTags)
      : baseTags };
}

function resolveCharacterTranslation(
  cfg: Record<string, unknown>,
  charId: number,
  appLanguage: string | undefined,
): Record<string, unknown> {
  const map = asRecord(cfg.charMultiLangData ?? cfg.char_multi_lang_data);
  const block = map[String(charId)] ?? map[charId];
  return pickLocalizedBlock(block, appLanguage, false) ?? {};
}


export function extractCharacterProfiles(
  story: RankableStory | null,
  appLanguage: string | undefined,
): HomeCharacterProfile[] {
  if (!story) return [];

  const cfg = parseStoryConfig(story as unknown as Record<string, unknown>);
  const storyConfigChars = Array.isArray(cfg.characters) ? cfg.characters : [];
  const chars: Record<string, unknown>[] = storyConfigChars
    .map((item, index) => {
      const record = asRecord(item);
      const id = getCharacterSequenceId(record, index, 0);
      return {
        ...record,
        id,
        char_index: normalizeCharacterId(record.char_index, id),
      };
    })
    .filter(item => Object.keys(item).length > 0);

  const userSetting        = parseUserSetting(cfg.userSetting ?? cfg.user_setting);
  const protagonistBase: Record<string, unknown> = chars.find(c => Number(c.id ?? c.char_index ?? -1) === 1) ?? {};
  const protagonistTranslation = resolveCharacterTranslation(cfg, 1, appLanguage);

  const protagonistName = pickString(
    protagonistTranslation.name,
    userSetting.name,
    protagonistBase.name,
    '{u}',
  );
  const protagonistAge = pickString(
    protagonistTranslation.age,
    userSetting.age,
    protagonistBase.age,
  );
  const protagonistSetting = joinNonEmpty([
    pickString(protagonistTranslation.gender, userSetting.gender, protagonistBase.gender),
    pickString(protagonistTranslation.traits, userSetting.traits, protagonistBase.traits),
  ]);
  const protagonistDescription = pickString(
    protagonistTranslation.personality,
    protagonistTranslation.description,
    userSetting.description,
    protagonistBase.personality,
    protagonistBase.personalityExample,
    (protagonistBase as Record<string, unknown>).speech as string | undefined,
    (protagonistBase as Record<string, unknown>).speechPattern as string | undefined,
    (protagonistBase as Record<string, unknown>).speechExample as string | undefined,
  );

  const protagonistImageUris = Array.isArray(protagonistBase.imageUris)
    ? protagonistBase.imageUris
    : [];
  const protagonistImage = sanitizeImageUrl(pickString(
    protagonistImageUris[0],
    protagonistBase.profileUrl,
    protagonistBase.profile_url,
    userSetting.imageUrl,
    userSetting.imageUri,
    story.coverUrl,
  ));

  const profiles: HomeCharacterProfile[] = [];
  if (protagonistName || protagonistAge || protagonistSetting || protagonistDescription || protagonistImage) {
    profiles.push({
      id: 'protagonist-1',
      role: 'protagonist',
      name: protagonistName,
      age: protagonistAge,
      setting: protagonistSetting,
      description: protagonistDescription,
      imageUrl: protagonistImage });
  }

  chars
    .filter(c => Number(c.id ?? c.char_index ?? 0) >= 2)
    .forEach((c, index) => {
      const charId    = Number(c.id ?? c.char_index ?? 0);
      const translated = resolveCharacterTranslation(cfg, charId, appLanguage);
      const imageUris  = Array.isArray(c.imageUris) ? c.imageUris : [];
      const imageUrl   = sanitizeImageUrl(pickString(imageUris[0], c.profileUrl, c.profile_url));
      const setting    = joinNonEmpty([
        pickString(translated.gender, c.gender),
        pickString(translated.traits, c.traits),
      ]);
      const description = pickString(
        translated.personality,
        translated.description,
        translated.personalityExample,
        c.personality,
        c.personalityExample,
      );
      const stableId = Number.isFinite(charId) && charId > 0 ? String(charId) : `character-${index + 2}`;
      profiles.push({
        id: stableId,
        role: 'character',
        name: pickString(translated.name, c.name, '등장인물'),
        age: pickString(translated.age, c.age),
        setting,
        description,
        imageUrl });
    });

  return profiles;
}


export function formatStoryDate(value: string | number | undefined): string {
  if (value == null) return '';
  const date =
    typeof value === 'number'
      ? new Date(value < 1_000_000_000_000 ? value * 1000 : value)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

export function formatCompactCount(value: number, locale = 'ko'): string {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
  }
}

export function formatAgeLabel(ageRaw: string): string {
  if (!ageRaw) return '';
  const age = ageRaw.trim();
  if (!age) return '';
  if (/^\d+$/.test(age)) return age;
  return age;
}

export { formatCount, formatCountIntl } from '../../../utils/formatCount';


/**
 * 서버 원본 응답을 RankableStory 형태로 정규화한다.
 */
export function normalizeStory(
  raw: Record<string, unknown>,
  appLanguage?: string,
): RankableStory | null {
  if (raw.id == null || String(raw.id).trim() === '') return null;

  const cover    = extractCoverUrl(raw);
  const localized = extractLocalizedStoryFields(raw, appLanguage);
  const cfg = parseStoryConfig(raw);

  return {
    id:           String(raw.id),
    title:        localized.title,
    description:  localized.description,
    coverUrl:     cover,
    cover_urls:   Array.isArray(raw.cover_urls) ? raw.cover_urls : cover ? [cover] : [],
    author:       String(raw.author ?? raw.author_name ?? raw.author_nickname ?? ''),
    authorId:     extractAuthorId(raw),
    authorImageUrl: extractAuthorAvatar(raw),
    likeCount:    Number(raw.likeCount ?? raw.like_count ?? 0),
    viewCount:    Number(raw.viewCount ?? raw.view_count ?? 0),
    tags:         localized.tags,
    genre:        normalizeStoryGenre(String(raw.genre ?? '')) || String(raw.genre ?? ''),
    isAdult:      Boolean(raw.is_adult ?? raw.isAdult ?? false),
    isLiked:      Boolean(raw.is_liked ?? raw.isLiked ?? false),
    createdAt:    (raw.createdAt ?? raw.created_at) as string | number | undefined,
    publishedAt:  (raw.publishedAt ?? raw.published_at) as string | number | undefined,
    updatedAt:    (raw.updatedAt ?? raw.updated_at) as string | number | undefined,
    story_config: cfg as any,
    playerCount:  Number(raw.playerCount ?? raw.player_count ?? 0) };
}

export type EmotionVector = {
  e1: number;
  e2: number;
  e3: number;
  e4: number;
  e5: number;
};

export type StoryDisplayCharacter = {
  id: number;
  key: string;
  isUser: boolean;
  name: string;
  age: string;
  gender: string;
  traits: string;
  appearance: string;
  setting: string;
  description: string;
  personality: string;
  personalityExample: string;
  speechPattern: string;
  speech: string;
  imageUris: string[];
  initialEmotions: EmotionVector;
  rawSource?: Record<string, unknown>;
};

export type StoryDisplayModel = {
  id: string;
  title: string;
  description: string;
  worldSetting: string;
  tags: string[];
  coverUrls: string[];
  coverUrl: string;
  likeCount: number;
  playCount: number;
  isLiked: boolean;
  authorName: string;
  authorAvatar: string;
  createdAt: string | number | undefined;
  updatedAt: string | number | undefined;
  modelId: string;
  characters: StoryDisplayCharacter[];
};

function parseLooseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }
  return {};
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

function pickLongerString(...values: unknown[]): string {
  const candidates = values
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (candidates.length === 0) return '';
  return candidates.sort((a, b) => b.length - a.length)[0];
}

function mergeEmotionSource(
  baseValue: unknown,
  nextValue: unknown,
): unknown {
  const baseNormalized = normalizeEmotionVector(baseValue);
  const nextNormalized = normalizeEmotionVector(nextValue);
  const baseHas = Object.values(baseNormalized).some(v => Math.abs(v) > 0);
  const nextHas = Object.values(nextNormalized).some(v => Math.abs(v) > 0);
  if (nextHas && !baseHas) return nextValue;
  if (baseHas) return baseValue;
  return nextValue ?? baseValue;
}

function mergeCharacterRecords(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base, ...next };
  merged.name = pickLongerString(next.name, base.name);
  merged.age = pickLongerString(next.age, base.age);
  merged.gender = pickLongerString(next.gender, base.gender);
  merged.traits = pickLongerString(next.traits, next.appearance, base.traits, base.appearance);
  merged.appearance = pickLongerString(next.appearance, next.traits, base.appearance, base.traits);
  merged.setting = pickLongerString(
    next.setting,
    next.description,
    next.personality,
    base.setting,
    base.description,
    base.personality,
  );
  merged.description = pickLongerString(
    next.description,
    next.setting,
    next.personality,
    base.description,
    base.setting,
    base.personality,
  );
  merged.personality = pickLongerString(next.personality, next.description, base.personality, base.description);
  merged.personalityExample = pickLongerString(
    next.personalityExample,
    next.speech,
    next.speechPattern,
    next.speech_pattern,
    base.personalityExample,
    base.speech,
    base.speechPattern,
    base.speech_pattern,
  );
  merged.speechPattern = pickLongerString(
    next.speechPattern,
    next.speech_pattern,
    next.speech,
    next.personalityExample,
    base.speechPattern,
    base.speech_pattern,
    base.speech,
    base.personalityExample,
  );
  merged.speech_pattern = pickLongerString(
    next.speech_pattern,
    next.speechPattern,
    next.speech,
    next.personalityExample,
    base.speech_pattern,
    base.speechPattern,
    base.speech,
    base.personalityExample,
  );
  merged.speech = pickLongerString(
    next.speech,
    next.speechPattern,
    next.speech_pattern,
    next.personalityExample,
    base.speech,
    base.speechPattern,
    base.speech_pattern,
    base.personalityExample,
  );
  merged.imageUris = uniqueStringList([
    ...(Array.isArray(base.imageUris) ? base.imageUris : []),
    ...(Array.isArray(next.imageUris) ? next.imageUris : []),
  ]);
  merged.initialEmotions = mergeEmotionSource(base.initialEmotions, next.initialEmotions);
  merged.initial_emotions = mergeEmotionSource(base.initial_emotions, next.initial_emotions);
  merged.emotions = mergeEmotionSource(base.emotions, next.emotions);
  return merged;
}

function getCharacterSequenceId(
  character: Record<string, unknown>,
  index: number,
  fallback = 0,
): number {
  const explicitId = normalizeCharacterId(character.id ?? character.char_index, Number.NaN);
  if (Number.isFinite(explicitId) && explicitId > 0) {
    return explicitId;
  }
  const positional = index + 1;
  return positional > 0 ? positional : fallback;
}

export function buildRawCharacterSourceMap(raw: Record<string, unknown>): Map<number, Record<string, unknown>> {
  const cfg = parseStoryConfig(raw);
  const userSetting = parseUserSetting(
    cfg.userSetting ??
    cfg.user_setting ??
    raw.userSetting ??
    raw.user_setting,
  );
  const charTranslationMap = asRecord(cfg.charMultiLangData ?? cfg.char_multi_lang_data);
  const cfgCharacters = Array.isArray(cfg.characters) ? cfg.characters : [];
  const rootCharacters = Array.isArray(raw.characters) ? raw.characters : [];
  const mergedCharacters = new Map<number, Record<string, unknown>>();

  rootCharacters
    .map(item => asRecord(item))
    .filter(item => Object.keys(item).length > 0)
    .forEach((item, index) => {
      const id = getCharacterSequenceId(item, index, -1);
      mergedCharacters.set(id, {
        ...item,
        id,
        char_index: normalizeCharacterId(item.char_index, id),
      });
    });

  cfgCharacters
    .map(item => asRecord(item))
    .filter(item => Object.keys(item).length > 0)
    .forEach((item, index) => {
      const id = getCharacterSequenceId(item, index, -1);
      mergedCharacters.set(id, mergeCharacterRecords(mergedCharacters.get(id) ?? {}, {
        ...item,
        id,
        char_index: normalizeCharacterId(item.char_index, id),
      }));
    });

  const currentProtagonist = mergedCharacters.get(1);
  const recordLooksLikeUser = (
    id: number,
    record: Record<string, unknown> | null | undefined,
  ) => (
    isLikelyUserCharacterRecord(record, userSetting)
    || hasUserLikeTranslationLabel(charTranslationMap[String(id)] ?? charTranslationMap[id], userSetting)
  );
  const currentProtagonistNameLooksLikeUser = isLikelyUserCharacterRecord(currentProtagonist, userSetting);
  const currentProtagonistTranslationLooksLikeUser = hasUserLikeTranslationLabel(
    charTranslationMap['1'] ?? charTranslationMap[1],
    userSetting,
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
  const protagonistBase = promotedUserEntry?.[1] ?? {};

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

  mergedCharacters.set(1, {
    id: 1,
    name: pickString(userSetting.name, protagonistBase.name, '{u}'),
    ...protagonistBase,
    ...userSetting,
    appearance: pickLongerString(
      userSetting.appearance,
      userSetting.traits,
      protagonistBase.appearance,
      protagonistBase.traits,
    ),
    setting: pickLongerString(
      userSetting.setting,
      userSetting.description,
      protagonistBase.setting,
      protagonistBase.description,
      protagonistBase.personality,
    ),
    description: pickLongerString(
      userSetting.description,
      userSetting.setting,
      protagonistBase.description,
      protagonistBase.setting,
      protagonistBase.personality,
    ),
    speech: pickLongerString(
      userSetting.speech,
      userSetting.speechPattern,
      userSetting.speech_pattern,
      protagonistBase.speech,
      protagonistBase.speechPattern,
      protagonistBase.speech_pattern,
    ),
    initialEmotions: mergeEmotionSource(protagonistBase.initialEmotions, userSetting.initialEmotions),
    initial_emotions: mergeEmotionSource(protagonistBase.initial_emotions, userSetting.initial_emotions),
    emotions: mergeEmotionSource(protagonistBase.emotions, userSetting.emotions),
  });

  return mergedCharacters;
}

function toCharacterImageUris(...candidates: unknown[]): string[] {
  const bucket: string[] = [];
  candidates.forEach(candidate => {
    if (Array.isArray(candidate)) {
      candidate.forEach(item => {
        const normalized = normalizeImageCandidate(item);
        if (normalized) {
          bucket.push(normalized);
        }
      });
      return;
    }
    const normalized = normalizeImageCandidate(candidate);
    if (normalized) {
      bucket.push(normalized);
    }
  });
  return uniqueStringList(bucket);
}

function clampEmotionValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-100, Math.min(100, Math.round(parsed)));
}

export function normalizeEmotionVector(raw: unknown): EmotionVector {
  const source = parseLooseObject(raw);
  const nestedCandidates = [
    parseLooseObject(source.initialEmotions),
    parseLooseObject(source.initial_emotions),
    parseLooseObject(source.emotions),
    parseLooseObject(source.emotion_state),
    parseLooseObject(source.emotionState),
  ];
  const nested = nestedCandidates.find(candidate => Object.keys(candidate).length > 0) ?? {};
  const base = Object.keys(nested).length > 0 ? nested : source;
  const list = Array.isArray((base as Record<string, unknown>).values)
    ? ((base as Record<string, unknown>).values as unknown[])
    : [];

  return {
    e1: clampEmotionValue(base.e1 ?? base.valence ?? base.emotionE1 ?? list[0]),
    e2: clampEmotionValue(base.e2 ?? base.trust ?? base.emotionE2 ?? list[1]),
    e3: clampEmotionValue(base.e3 ?? base.dominance ?? base.emotionE3 ?? list[2]),
    e4: clampEmotionValue(base.e4 ?? base.arousal ?? base.emotionE4 ?? list[3]),
    e5: clampEmotionValue(base.e5 ?? base.attachment ?? base.emotionE5 ?? list[4]) };
}

export function extractCoverUrls(raw: Record<string, unknown>): string[] {
  const cfg = parseStoryConfig(raw);
  const list = [
    ...(Array.isArray(cfg.storeCoverUris) ? cfg.storeCoverUris : []),
    ...(Array.isArray(cfg.cover_urls) ? cfg.cover_urls : []),
    ...(Array.isArray(cfg.coverUris) ? cfg.coverUris : []),
    ...(Array.isArray(raw.storeCoverUris) ? raw.storeCoverUris : []),
    ...(Array.isArray(raw.cover_urls) ? raw.cover_urls : []),
    ...(Array.isArray(raw.coverUris) ? raw.coverUris : []),
  ];
  const normalized = uniqueStringList(list.map(item => normalizeImageCandidate(item)).filter(Boolean));
  if (normalized.length > 0) {
    return normalized.slice(0, 10);
  }

  const backgroundObjects = [
    ...(Array.isArray(cfg.backgrounds) ? cfg.backgrounds : []),
    ...(Array.isArray(raw.backgrounds) ? raw.backgrounds : []),
  ].filter((background): background is Record<string, unknown> => (
    Boolean(background) && typeof background === 'object'
  ));
  const backgroundFallbacks = uniqueStringList([
    ...(Array.isArray(raw.bg_urls) ? raw.bg_urls : []),
    ...backgroundObjects.flatMap(background => [
      background.uri,
      background.imageUrl,
      background.image_url,
    ]),
  ].map(item => normalizeImageCandidate(item)).filter(Boolean));

  if (backgroundFallbacks.length > 0) {
    return backgroundFallbacks.slice(0, 10);
  }

  const single = pickString(
    ...(Array.isArray(cfg.storeCoverUris) ? [cfg.storeCoverUris[0]] : []),
    cfg.cover_url,
    cfg.coverUrl,
    ...(Array.isArray(raw.storeCoverUris) ? [raw.storeCoverUris[0]] : []),
    raw.cover_url,
    raw.coverUrl,
    raw.thumb_url,
  );
  const normalizedSingle = normalizeImageCandidate(single);
  return normalizedSingle ? [normalizedSingle] : [];
}



function normalizeCharacterId(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function localizeGenderLabel(value: string, appLanguage?: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';

  const map: Record<string, Record<string, string>> = {
    male: {
      en: 'Male', es: 'Masculino', pt: 'Masculino', fr: 'Masculin', de: 'Männlich',
      it: 'Maschio', ru: 'Мужской', ko: '남성', ja: '男性', 'zh-CN': '男',
      'zh-TW': '男', th: 'ชาย', tr: 'Erkek', hi: 'पुरुष', ar: 'ذكر' },
    female: {
      en: 'Female', es: 'Femenino', pt: 'Feminino', fr: 'Féminin', de: 'Weiblich',
      it: 'Femmina', ru: 'Женский', ko: '여성', ja: '女性', 'zh-CN': '女',
      'zh-TW': '女', th: 'หญิง', tr: 'Kadın', hi: 'महिला', ar: 'أنثى' },
    other: {
      en: 'Other', es: 'Otro', pt: 'Outro', fr: 'Autre', de: 'Andere',
      it: 'Altro', ru: 'Другой', ko: '기타', ja: 'その他', 'zh-CN': '其他',
      'zh-TW': '其他', th: 'อื่นๆ', tr: 'Diğer', hi: 'अन्य', ar: 'أخرى' } };

  const canonical = normalized === 'm' ? 'male'
    : normalized === 'f' ? 'female'
    : normalized;

  return map[canonical]?.[appLanguage ?? 'en'] ?? map[canonical]?.en ?? value;
}

function buildDisplayCharacter(
  rawCharacter: Record<string, unknown>,
  cfg: Record<string, unknown>,
  appLanguage: string | undefined,
  userSetting: Record<string, unknown>,
): StoryDisplayCharacter {
  const id = normalizeCharacterId(rawCharacter.id ?? rawCharacter.char_index, 0);
  const isUser = id === 1;
  const translated = resolveCharacterTranslation(cfg, id, appLanguage);
  const source = isUser ? { ...rawCharacter, ...userSetting } : rawCharacter;

  const name = pickString(
    translated.name,
    source.name,
    isUser ? '{u}' : '',
    isUser ? '{u}' : '등장인물',
  );
  const age = pickString(translated.age, source.age);
  const gender = pickString(
    translated.gender,
    localizeGenderLabel(String(source.gender ?? ''), appLanguage),
    source.gender,
  );
  const traits = pickString(
    translated.traits,
    source.traits,
    source.appearance,
  );
  const appearance = pickString(
    translated.appearance,
    translated.traits,
    source.appearance,
    source.traits,
  );
  const setting = isUser
    ? pickString(
        translated.setting,
        translated.description,
        source.setting,
        source.description,
        userSetting.description,
        source.personality,
      )
    : pickString(
        translated.setting,
        translated.description,
        source.setting,
        source.description,
        source.personality,
      );
  const description = pickString(
    translated.description,
    translated.setting,
    translated.personality,
    source.description,
    source.setting,
    source.personality,
  );
  const personality = pickString(
    translated.personality,
    source.personality,
    source.description,
    source.setting,
  );
  const personalityExample = pickString(
    translated.personalityExample,
    translated.speech,
    translated.speechPattern,
    translated.speechExample,
    source.speechPattern,
    source.speech_pattern,
    source.speechExample,
    source.speech_style,
    source.personalityExample,
    source.speech,
  );
  const speech = pickString(
    translated.speech,
    translated.speechPattern,
    translated.personalityExample,
    translated.speechExample,
    source.speech,
    source.speechPattern,
    source.speech_pattern,
    source.speech_style,
    source.personalityExample,
  );
  const imageUris = toCharacterImageUris(
    source.imageUris,
    source.profileUrl,
    source.profile_url,
    isUser ? (userSetting as Record<string, unknown>).imageUris : undefined,
    isUser ? (userSetting as Record<string, unknown>).imageUri : undefined,
    isUser ? (userSetting as Record<string, unknown>).imageUrl : undefined,
  );

  return {
    id,
    key: `${isUser ? 'user' : 'character'}-${id || 'x'}`,
    isUser,
    name,
    age,
    gender,
    traits,
    appearance,
    setting,
    description,
    personality,
    personalityExample,
    speechPattern: pickString(
      source.speechPattern,
      source.speech_pattern,
      speech,
      personalityExample,
    ),
    speech,
    imageUris,
    initialEmotions: normalizeEmotionVector(
      source.initialEmotions ??
      source.initial_emotions ??
      source.emotions ??
      source,
    ),
    rawSource: { ...source },
  };
}

export function buildStoryDisplayModel(
  raw: Record<string, unknown>,
  appLanguage?: string,
): StoryDisplayModel {
  const cfg = parseStoryConfig(raw);
  const localized = extractLocalizedStoryFields(raw, appLanguage);
  const coverUrls = extractCoverUrls(raw);
  const userSetting = parseUserSetting(
    cfg.userSetting ??
    cfg.user_setting ??
    raw.userSetting ??
    raw.user_setting,
  );
  const rawCharacterMap = buildRawCharacterSourceMap(raw);
  const normalizedCharacters = Array.from(rawCharacterMap.values());
  const userCharacter = rawCharacterMap.get(1) ?? { id: 1, name: userSetting.name ?? '{u}', ...userSetting };
  const otherCharacters = normalizedCharacters.filter(item => normalizeCharacterId(item.id ?? item.char_index, -1) >= 2);

  const characters = [
    buildDisplayCharacter(userCharacter, cfg, appLanguage, userSetting),
    ...otherCharacters.map(item => buildDisplayCharacter(item, cfg, appLanguage, userSetting)),
  ].filter((character, index, array) => {
    return array.findIndex(entry => entry.id === character.id) === index;
  });

  const characterFallbackCover = characters
    .filter(character => !character.isUser)
    .flatMap(character => character.imageUris ?? [])
    .find(uri => typeof uri === 'string' && uri.trim().length > 0) ?? '';

  const resolvedCoverUrls = coverUrls.length > 0
    ? coverUrls
    : (characterFallbackCover ? [characterFallbackCover] : []);

  return {
    id: String(raw.id ?? ''),
    title: pickString(localized.title, raw.title, cfg.title, '미제목'),
    description: pickString(
      localized.description,
      raw.description,
      cfg.description,
      cfg.storyDesc,
      cfg.storyDescription,
      '',
    ),
    worldSetting: pickString(
      localized.worldSetting,
      cfg.worldSetting,
      cfg.world_setting,
      cfg.storyWorldSetting,
      cfg.story_world_setting,
      cfg.storySetting,
      cfg.setting,
      raw.worldSetting,
      raw.world_setting,
      raw.storyWorldSetting,
      raw.story_world_setting,
      raw.storySetting,
      raw.setting,
      '',
    ),
    tags: localized.tags,
    coverUrls: resolvedCoverUrls,
    coverUrl: resolvedCoverUrls[0] ?? '',
    likeCount: Number(raw.likeCount ?? raw.like_count ?? 0) || 0,
    playCount: Number(
      raw.playerCount ??
      raw.player_count ??
      raw.viewCount ??
      raw.view_count ??
      0,
    ) || 0,
    isLiked: Boolean(raw.isLiked ?? raw.is_liked ?? false),
    authorName: pickString(
      raw.author,
      raw.author_name,
      raw.author_nickname,
      cfg.authorName,
      cfg.author_name,
      '',
    ),
    authorAvatar: extractAuthorAvatar(raw),
    createdAt: (raw.createdAt ?? raw.created_at) as string | number | undefined,
    updatedAt: (raw.updatedAt ?? raw.updated_at) as string | number | undefined,
    modelId: pickString(
      raw.startedModelId,
      raw.started_model_id,
      raw.model_id,
      cfg.startedModelId,
      cfg.modelId,
      cfg.model_id,
      '',
    ),
    characters };
}

export function isReadyForHomeExposure(raw: Record<string, unknown>): boolean {
  const status = pickString(raw.status, raw.story_status).toLowerCase();
  return status === 'published' || status === 'approved';
}
