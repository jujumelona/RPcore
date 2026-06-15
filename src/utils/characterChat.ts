import type { Story, Character } from '../types/navigation';
import { extractCharactersFull } from './characterUtils';

type CharacterSeed = Omit<Partial<Character>,
  'id' |
  'storyId' |
  'storyTitle' |
  'name' |
  'description' |
  'imageUrls' |
  'imageUrl' |
  'age' |
  'gender' |
  'personality' |
  'traits'
> & {
  id?: string | number;
  name?: string;
  description?: string;
  imageUrls?: string[];
  imageUrl?: string;
  personality?: string;
  traits?: string;
  age?: string | number;
  gender?: string;
  storyId?: string | number;
  storyTitle?: string;
  likeCount?: number;
  playerCount?: number;
  tags?: string[];
  genre?: string;
  initialEmotions?: Character['initialEmotions'];
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function toStringArray(...values: unknown[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (trimmed.length > 0) next.push(trimmed);
    }
  }
  return Array.from(new Set(next));
}

function sanitizeId(value: unknown): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function normalizeCharacterId(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractStoryConfig(story: unknown): Record<string, any> {
  const record = story && typeof story === 'object'
    ? story as Record<string, unknown>
    : {};
  const config = record.story_config && typeof record.story_config === 'object'
    ? record.story_config as Record<string, unknown>
    : record.storyConfig && typeof record.storyConfig === 'object'
      ? record.storyConfig as Record<string, unknown>
      : record;
  return config as Record<string, any>;
}

function extractStoryTitle(story: unknown, fallback = ''): string {
  const record = story && typeof story === 'object'
    ? story as Record<string, unknown>
    : {};
  const config = extractStoryConfig(story);
  return pickText(
    record.title,
    config.title,
    config.storyTitle,
    fallback,
  );
}

function extractStoryCoverUrls(story: unknown): string[] {
  const record = story && typeof story === 'object'
    ? story as Record<string, unknown>
    : {};
  const config = extractStoryConfig(story);
  return toStringArray(
    record.cover_urls,
    record.coverUrls,
    config.cover_urls,
    config.coverUrls,
    config.storeCoverUris,
    [pickText(record.coverUrl, config.coverUrl)],
  );
}

function extractStoryTags(story: unknown): string[] {
  const record = story && typeof story === 'object'
    ? story as Record<string, unknown>
    : {};
  const config = extractStoryConfig(story);
  return toStringArray(record.tags, config.tags);
}

function normalizeRouteCharacter(seed: CharacterSeed): Character {
  const imageUrls = toStringArray(seed.imageUrls, [seed.imageUrl]);
  return {
    id: sanitizeId(seed.id),
    name: pickText(seed.name, 'Character'),
    description: pickText(seed.description, seed.personality),
    imageUrls,
    imageUrl: imageUrls[0] ?? '',
    role: seed.role ?? 'character',
    age: seed.age,
    gender: seed.gender,
    personality: pickText(seed.personality, seed.description),
    traits: seed.traits,
    genre: seed.genre,
    tags: seed.tags ?? [],
    initialEmotions: seed.initialEmotions,
    storyId: seed.storyId !== undefined ? sanitizeId(seed.storyId) : undefined,
    storyTitle: pickText(seed.storyTitle),
  };
}

function findCharacterInSourceStory(sourceStory: unknown, targetCharacter: Character): ReturnType<typeof extractCharactersFull>[number] | null {
  const numericTargetId = normalizeCharacterId(targetCharacter.id);
  const normalizedName = targetCharacter.name.trim().toLowerCase();
  const characters = extractCharactersFull(sourceStory)
    .filter(character => Number(character.id) >= 2);

  if (numericTargetId !== null) {
    const byId = characters.find(character => Number(character.id) === numericTargetId);
    if (byId) return byId;
  }

  if (normalizedName.length > 0) {
    const byName = characters.find(character => character.name.trim().toLowerCase() === normalizedName);
    if (byName) return byName;
  }

  return characters[0] ?? null;
}

function buildCharacterChatBackgrounds(sourceStory: unknown, primaryFallbackUrl: string) {
  const config = extractStoryConfig(sourceStory);
  const rawBackgrounds = Array.isArray(config.backgrounds) ? config.backgrounds : [];
  const normalizedBackgrounds = rawBackgrounds
    .map((background, index) => {
      const record = background && typeof background === 'object'
        ? background as Record<string, unknown>
        : {};
      const uri = pickText(record.uri, record.imageUrl, record.image_url);
      if (!uri) return null;
      return {
        ...record,
        id: pickText(record.id, `bg_${index + 1}`),
        uri,
      };
    })
    .filter(Boolean);

  if (normalizedBackgrounds.length > 0) {
    return normalizedBackgrounds;
  }

  if (!primaryFallbackUrl) return [];
  return [{
    id: 'bg_default',
    uri: primaryFallbackUrl,
    imageUrl: primaryFallbackUrl,
  }];
}

function buildCharacterChatTags(sourceStory: unknown, targetCharacter: Character): string[] {
  const storyTitle = pickText(targetCharacter.storyTitle, extractStoryTitle(sourceStory));
  const normalizedAge = targetCharacter.age !== undefined && String(targetCharacter.age).trim().length > 0
    ? String(targetCharacter.age).trim()
    : '';

  return Array.from(new Set([
    storyTitle,
    normalizedAge,
    ...(targetCharacter.tags ?? []),
    ...extractStoryTags(sourceStory),
  ].map(value => String(value ?? '').trim()).filter(Boolean)));

  return Array.from(new Set([
    storyTitle,
    ...(targetCharacter.age !== undefined && String(targetCharacter.age).trim().length > 0
      ? [String(targetCharacter.age).trim()]
      : []),
    ...(targetCharacter.tags ?? []),
    ...extractStoryTags(sourceStory),
  ].map(value => String(value ?? '').trim()).filter(Boolean)));
}

export function buildCharacterChatSessionId(sourceStoryId: string | number, characterId: string | number): string {
  return `character_chat:${sanitizeId(sourceStoryId)}:${sanitizeId(characterId)}`;
}

export function buildCharacterChatNavigationParams(seed: CharacterSeed): {
  story: Story;
  character: Character;
} {
  const character = normalizeRouteCharacter(seed);
  const sourceStoryId = sanitizeId(seed.storyId ?? character.storyId ?? character.id);
  const storyTitle = pickText(seed.storyTitle, character.storyTitle, character.name);
  const story: Story = {
    id: sourceStoryId,
    title: storyTitle,
    description: pickText(seed.description, seed.personality, character.description),
    coverUrl: character.imageUrl ?? '',
    cover_urls: character.imageUrls,
    author: '',
    authorId: '',
    likeCount: Number(seed.likeCount ?? 0) || 0,
    viewCount: Number(seed.playerCount ?? 0) || 0,
    tags: seed.tags ?? [],
    genre: seed.genre ?? '',
    story_config: {} as any,
  };

  return { story, character };
}

export function buildCharacterSearchCardStory(seed: CharacterSeed): Story {
  const character = normalizeRouteCharacter(seed);
  const storyTitle = pickText(seed.storyTitle, character.storyTitle);
  const description = pickText(
    character.personality,
    character.description,
    storyTitle,
  );
  const tags = Array.from(new Set([
    storyTitle,
    character.age !== undefined && String(character.age).trim().length > 0 ? String(character.age).trim() : '',
    ...(character.tags ?? []),
  ].filter(Boolean))) as string[];

  return {
    id: `character-card:${sanitizeId(seed.storyId ?? character.storyId ?? character.id)}:${sanitizeId(character.id)}`,
    title: character.name,
    description,
    coverUrl: character.imageUrl ?? '',
    cover_urls: character.imageUrls,
    author: '',
    authorId: '',
    likeCount: Number(seed.likeCount ?? 0) || 0,
    viewCount: Number(seed.playerCount ?? 0) || 0,
    tags,
    genre: seed.genre ?? character.genre ?? '',
    story_config: {} as any,
  };
}

export function buildCharacterChatStoryFromSource(
  sourceStory: Story | Record<string, unknown>,
  routeCharacter: Character,
): Story {
  const sourceRecord = sourceStory as Record<string, any>;
  const sourceConfig = extractStoryConfig(sourceStory);
  const sourceStoryId = sanitizeId(sourceRecord.id ?? routeCharacter.storyId ?? routeCharacter.id);
  const sourceStoryTitle = extractStoryTitle(sourceStory, routeCharacter.storyTitle ?? routeCharacter.name);
  const sourceCoverUrls = extractStoryCoverUrls(sourceStory);
  const matchedCharacter = findCharacterInSourceStory(sourceStory, routeCharacter);

  const characterImageUrls = matchedCharacter
    ? toStringArray(matchedCharacter.imageUris, [matchedCharacter.profileUrl])
    : toStringArray(routeCharacter.imageUrls, [routeCharacter.imageUrl]);
  const primaryImage = characterImageUrls[0] ?? sourceCoverUrls[0] ?? '';
  const targetCharacterId = sanitizeId(matchedCharacter?.id ?? routeCharacter.id);
  const sessionId = buildCharacterChatSessionId(sourceStoryId, targetCharacterId);
  const characterName = pickText(matchedCharacter?.name, routeCharacter.name, 'Character');
  const characterPersonality = pickText(
    matchedCharacter?.personality,
    routeCharacter.personality,
    routeCharacter.description,
    sourceRecord.description,
  );
  const characterDescription = pickText(
    routeCharacter.description,
    matchedCharacter?.personality,
    sourceRecord.description,
  );
  const worldSetting = pickText(
    sourceConfig.worldSetting,
    sourceConfig.storyDesc,
    sourceRecord.description,
    sourceStoryTitle ? `${sourceStoryTitle}의 세계관에서 ${characterName}와 이야기한다.` : '',
  );
  const storyStylePreset = pickText(
    sourceConfig.storyStylePreset,
    sourceConfig.story_style_preset,
    sourceRecord.storyStylePreset,
    sourceRecord.story_style_preset,
  );
  const backgrounds = buildCharacterChatBackgrounds(sourceStory, sourceCoverUrls[0] ?? primaryImage);
  const chapterInfo = [
    sourceStoryTitle ? `Source story: ${sourceStoryTitle}` : '',
    characterDescription,
    matchedCharacter?.personalityExample ? `Speech example: ${matchedCharacter.personalityExample}` : '',
  ].filter(Boolean).join('\n\n');

  const syntheticStoryConfig = {
    ...sourceConfig,
    title: characterName,
    storyTitle: characterName,
    characters: [{
      id: 2,
      char_index: 2,
      name: characterName,
      personality: characterPersonality,
      personalityExample: pickText(matchedCharacter?.personalityExample, matchedCharacter?.personality, routeCharacter.personality),
      imageUris: characterImageUrls,
      profileUrl: primaryImage,
      age: pickText(matchedCharacter?.age, routeCharacter.age),
      gender: pickText(matchedCharacter?.gender, routeCharacter.gender),
      traits: pickText(matchedCharacter?.traits, routeCharacter.traits),
      appearance: pickText(matchedCharacter?.traits),
      description: characterDescription,
      speech: pickText(matchedCharacter?.personalityExample),
      initialEmotions: matchedCharacter?.initialEmotions ?? routeCharacter.initialEmotions ?? {},
    }],
    chapters: [{
      id: 'chapter_1',
      title: characterName,
      aiGoal: `Stay fully in character as ${characterName}. Continue a direct 1:1 conversation with the user naturally without chapter transitions.`,
      chapterInfo,
      prevSummary: '',
      characterGoals: {},
      triggers: [],
      choiceEvents: [],
      intro: [],
      introMessages: [],
    }],
    backgrounds,
    narratorFrequency: 'minimal' as const,
    worldSetting,
    userSetting: sourceConfig.userSetting ?? sourceConfig.user_setting ?? { name: '{u}' },
    imageLookupStoryId: sourceStoryId,
    sourceStoryId,
    sourceStoryTitle,
    characterChatMode: true,
    storyStylePreset,
    story_style_preset: storyStylePreset,
  };

  return {
    ...(sourceRecord as Story),
    id: sessionId,
    title: characterName,
    description: characterPersonality || characterDescription || worldSetting,
    coverUrl: primaryImage,
    cover_urls: Array.from(new Set([...characterImageUrls, ...sourceCoverUrls])).filter(Boolean),
    author: String(sourceRecord.author ?? ''),
    authorId: String(sourceRecord.authorId ?? sourceRecord.author_id ?? ''),
    likeCount: Number(sourceRecord.likeCount ?? sourceRecord.like_count ?? 0) || 0,
    viewCount: Number(sourceRecord.viewCount ?? sourceRecord.view_count ?? 0) || 0,
    tags: buildCharacterChatTags(sourceStory, routeCharacter),
    genre: pickText(routeCharacter.genre, sourceRecord.genre),
    story_config: syntheticStoryConfig as any,
    sourceStoryId,
    sourceStoryTitle,
  } as Story;
}
