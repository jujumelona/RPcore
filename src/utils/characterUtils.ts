// src/utils/characterUtils.ts
// Shared extraction helpers for story character/background data.

import type { FullCharacter } from '../screens/chat/types/ChatTypes';

const DEFAULT_CHAR_LABEL = 'Character';

function asFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeEmotionSet(raw: unknown): FullCharacter['initialEmotions'] {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const values = Array.isArray(source.values) ? source.values : [];
  return {
    e1: asFiniteNumber(source.e1) ?? asFiniteNumber(source.valence) ?? asFiniteNumber(source.emotionE1) ?? asFiniteNumber(values[0]) ?? 0,
    e2: asFiniteNumber(source.e2) ?? asFiniteNumber(source.trust) ?? asFiniteNumber(source.emotionE2) ?? asFiniteNumber(values[1]) ?? 0,
    e3: asFiniteNumber(source.e3) ?? asFiniteNumber(source.dominance) ?? asFiniteNumber(source.emotionE3) ?? asFiniteNumber(values[2]) ?? 0,
    e4: asFiniteNumber(source.e4) ?? asFiniteNumber(source.arousal) ?? asFiniteNumber(source.emotionE4) ?? asFiniteNumber(values[3]) ?? 0,
    e5: asFiniteNumber(source.e5) ?? asFiniteNumber(source.attachment) ?? asFiniteNumber(source.emotionE5) ?? asFiniteNumber(values[4]) ?? 0,
  };
}

// Extract normalized character list from story payload.
// Supports both:
// 1) story.story_config.characters (new format)
// 2) story.characters (legacy format)
export function extractCharactersFull(story: unknown): FullCharacter[] {
  const s = story as { story_config?: { characters?: unknown[] }; characters?: unknown[] } | null;
  const cfg = s?.story_config;
  const cfgChars = Array.isArray(cfg?.characters)
    ? (cfg.characters as Record<string, unknown>[])
    : [];
  const rootChars = Array.isArray(s?.characters)
    ? (s.characters as Record<string, unknown>[])
    : [];

  const reservedIds = new Set<number>();

  const build = (
    c: Record<string, any>,
    fallbackId: number,
    options?: { preserveId?: boolean; usedIds?: Set<number> },
  ): FullCharacter => {
    const imageUris = Array.isArray(c?.imageUris)
      ? (c.imageUris as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const fallbackProfileUrl = typeof c?.profileUrl === 'string' && c.profileUrl.trim().length > 0
      ? c.profileUrl
      : (typeof c?.profile_url === 'string' && c.profile_url.trim().length > 0 ? c.profile_url : '');
    const uris: string[] = imageUris.length > 0
      ? imageUris
      : (fallbackProfileUrl ? [fallbackProfileUrl] : []);

    const rawId = typeof c?.id === 'number'
      ? c.id
      : (typeof c?.char_index === 'number' ? c.char_index : undefined);

    let id: number = rawId ?? fallbackId;
    const usedIds = options?.usedIds;
    if (!options?.preserveId && usedIds) {
      if (usedIds.has(id)) {
        id = fallbackId;
        while (usedIds.has(id)) id++;
      }
      usedIds.add(id);
    }

    return {
      id,
      name: c?.name ?? DEFAULT_CHAR_LABEL,
      imageUris: uris,
      profileUrl: uris[0] ?? '',
      personality: c?.personality ?? c?.description ?? c?.setting ?? '',
      personalityExample: c?.personalityExample ?? c?.speech_pattern ?? c?.speech ?? '',
      age: c?.age ?? '',
      gender: c?.gender ?? '',
      traits: c?.traits ?? c?.appearance ?? '',
      initialEmotions: normalizeEmotionSet(c?.initialEmotions ?? c?.initial_emotions ?? c?.emotions ?? c) };
  };

  const mergedById = new Map<number, Record<string, unknown>>();
  const reserveId = (candidate: number | undefined, fallbackId: number) => {
    let id = candidate ?? fallbackId;
    if (!mergedById.has(id) && !reservedIds.has(id)) {
      reservedIds.add(id);
      return id;
    }
    if (mergedById.has(id)) return id;
    id = fallbackId;
    while (reservedIds.has(id) && !mergedById.has(id)) id++;
    reservedIds.add(id);
    return id;
  };
  const mergeCharacter = (rawCharacter: Record<string, unknown>, fallbackId: number) => {
    const candidateId = typeof rawCharacter?.id === 'number'
      ? rawCharacter.id
      : (typeof rawCharacter?.char_index === 'number' ? rawCharacter.char_index : undefined);
    const id = reserveId(candidateId, fallbackId);
    const prev = mergedById.get(id) ?? {};
    const prevUris = Array.isArray(prev.imageUris)
      ? (prev.imageUris as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const nextImageUris = Array.isArray(rawCharacter.imageUris)
      ? (rawCharacter.imageUris as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const fallbackProfileUrl = typeof rawCharacter.profileUrl === 'string' && rawCharacter.profileUrl.trim().length > 0
      ? rawCharacter.profileUrl
      : (typeof rawCharacter.profile_url === 'string' && rawCharacter.profile_url.trim().length > 0 ? rawCharacter.profile_url : '');
    const incomingUris = nextImageUris.length > 0
      ? nextImageUris
      : (fallbackProfileUrl ? [fallbackProfileUrl] : []);
    const mergedUris = Array.from(new Set([...prevUris, ...incomingUris]));
    mergedById.set(id, {
      ...prev,
      ...rawCharacter,
      id,
      char_index: id,
      name: typeof rawCharacter.name === 'string' && rawCharacter.name.trim()
        ? rawCharacter.name
        : (typeof prev.name === 'string' && prev.name.trim() ? prev.name : DEFAULT_CHAR_LABEL),
      imageUris: mergedUris,
      profileUrl: mergedUris[0]
        || (typeof prev.profileUrl === 'string' ? prev.profileUrl : '')
        || fallbackProfileUrl,
      profile_url: mergedUris[0]
        || (typeof prev.profile_url === 'string' ? prev.profile_url : '')
        || fallbackProfileUrl,
    });
  };

  rootChars.forEach((character, index) => mergeCharacter(character, index + 2));
  cfgChars.forEach((character, index) => mergeCharacter(character, index + 2));

  if (mergedById.size > 0) {
    return Array.from(mergedById.values())
      .sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0))
      .map((character, index) =>
        build(character as Record<string, any>, index + 2, { preserveId: true }),
      );
  }

  return [];
}

// Extract default background URL from story configuration.
export function extractBackgroundUrl(story: unknown): string {
  type Bg = { uri?: string; imageUrl?: string; conditions?: unknown[] };
  const storyObj = story as { story_config?: { backgrounds?: Bg[] } } | null;
  const bgs: Bg[] = storyObj?.story_config?.backgrounds ?? [];

  const base = bgs.find(bg => (bg?.uri ?? bg?.imageUrl) && (!bg.conditions || bg.conditions.length === 0));
  if (base) return base.uri ?? base.imageUrl ?? '';

  const first = bgs.find(bg => bg?.uri ?? bg?.imageUrl);
  return first?.uri ?? first?.imageUrl ?? '';
}

// Get character image URL with fallback for owner/player character
export function getCharacterImageUrl(char: FullCharacter | Record<string, any>): string {
  // 주인공(owner/player) 케이스 추가
  const isOwner = ('isOwner' in char && char.isOwner === true) 
    || ('role' in char && char.role === 'owner') 
    || char.id === 1;
  
  if (isOwner) {
    // 주인공은 여러 fallback 시도
    return char.profileUrl 
      || ('profile_url' in char ? char.profile_url : '')
      || ('avatarUrl' in char ? char.avatarUrl : '')
      || ('imageUrl' in char ? char.imageUrl : '')
      || (Array.isArray(char.imageUris) && char.imageUris[0]) 
      || '';
  }
  
  // 일반 캐릭터
  return char.profileUrl 
    || ('profile_url' in char ? char.profile_url : '')
    || (Array.isArray(char.imageUris) && char.imageUris[0]) 
    || ('imageUrl' in char ? char.imageUrl : '')
    || '';
}
