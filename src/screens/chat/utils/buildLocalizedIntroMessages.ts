import type { Message } from '../types/ChatTypes';
import type { StoryCharacter } from '../../../types/StoryContract';

const DEFAULT_SPEAKER_TYPE = 'narrator';

function getLanguageCandidates(language?: string): string[] {
  if (!language) return [];
  const raw = String(language).trim();
  if (!raw) return [];
  const normalized = raw.replace(/_/g, '-');
  const lower = normalized.toLowerCase();
  const short = lower.split('-')[0];
  return Array.from(new Set([raw, normalized, lower, short].filter(Boolean)));
}

function pickLocalizedObject(source: unknown, language?: string): Record<string, unknown> | null {
  if (!source || typeof source !== 'object') return null;

  const map = source as Record<string, unknown>;
  const entries = Object.entries(map);
  if (entries.length === 0) return null;

  for (const candidate of getLanguageCandidates(language)) {
    const exact = map[candidate];
    if (exact && typeof exact === 'object') {
      return exact as Record<string, unknown>;
    }

    const matched = entries.find(([key]) => key.toLowerCase() === candidate.toLowerCase())?.[1];
    if (matched && typeof matched === 'object') {
      return matched as Record<string, unknown>;
    }
  }

  return null;
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return '';
}

function parseStoryLikeConfig(story: any): Record<string, unknown> {
  const rawConfig = story?.story_config ?? story ?? {};
  if (typeof rawConfig === 'string') {
    try {
      return JSON.parse(rawConfig) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return rawConfig && typeof rawConfig === 'object'
    ? (rawConfig as Record<string, unknown>)
    : {};
}

function getIntroTranslation(
  introTranslations: Record<string, unknown>,
  rawMessage: Record<string, unknown>,
  index: number,
): unknown {
  const keyCandidates = [
    rawMessage.id,
    `intro_${index + 1}`,
    `INTRO_${index + 1}`,
    String(index),
    String(index + 1),
  ].filter((value): value is string | number => value != null);

  for (const key of keyCandidates) {
    const translation = introTranslations[String(key)];
    if (translation != null) {
      return translation;
    }
  }
  return undefined;
}

function dedupeIntroMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter(message => {
    // image_card는 content가 URL이므로 공백 체크 로직 그대로 사용
    const normalizedContent = (message.content ?? '').trim().replace(/\s+/g, ' ');
    if (!normalizedContent && message.role !== 'image_card') {
      return false;
    }

    const dedupeKey = `${message.role}:${message.characterId ?? ''}:${normalizedContent}`;
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
}

export function buildLocalizedIntroMessages(
  story: any,
  chapterIdx: number,
  characters: StoryCharacter[],
  language?: string,
): Message[] {
  const config = parseStoryLikeConfig(story);
  const chapters = Array.isArray(config?.chapters) ? config.chapters : [];
  const chapter = chapters[chapterIdx];
  if (!chapter) {
    return [];
  }

  const setId = `intro_${chapterIdx}`;
  const now = Date.now();
  const intro = Array.isArray(chapter?.introMessages)
    ? chapter.introMessages
    : Array.isArray(chapter?.intro)
      ? chapter.intro
      : [];

  const introMultiLangData = config?.introMultiLangData ?? config?.intro_multi_lang_data;
  const introTranslations = (() => {
    for (const candidate of getLanguageCandidates(language)) {
      const direct = pickLocalizedObject(introMultiLangData, candidate);
      if (direct) {
        if (direct.introMessages && typeof direct.introMessages === 'object') {
          return direct.introMessages as Record<string, unknown>;
        }
        if (direct.intro && typeof direct.intro === 'object') {
          return direct.intro as Record<string, unknown>;
        }
        return direct;
      }

      const chapterMap = chapter?.id != null
        ? (introMultiLangData as Record<string, unknown> | undefined)?.[String(chapter.id)]
        : null;
      const byChapter = pickLocalizedObject(chapterMap, candidate);
      if (byChapter) {
        if (byChapter.introMessages && typeof byChapter.introMessages === 'object') {
          return byChapter.introMessages as Record<string, unknown>;
        }
        if (byChapter.intro && typeof byChapter.intro === 'object') {
          return byChapter.intro as Record<string, unknown>;
        }
        return byChapter;
      }
    }
    return {} as Record<string, unknown>;
  })();

  if (intro.length === 0) {
    const chapterTitle = pickFirstText(chapter?.title, `Chapter ${chapterIdx + 1}`);
    const chapterInfo = pickFirstText(chapter?.chapterInfo);
    const aiGoal = pickFirstText(chapter?.aiGoal);

    if (chapterIdx === 0) {
      const opening = pickFirstText(story?.description, config?.description, 'The story begins.');
      return opening ? [{
        id: `chapter_${chapterIdx}_start`,
        role: 'narrator',
        content: opening,
        timestamp: now,
        setId,
        isIntro: true }] : [];
    }

    const fallbackMessages: Message[] = [];
    if (chapterTitle) {
      fallbackMessages.push({
        id: `chapter_${chapterIdx}_title`,
        role: 'narrator',
        content: `- ${chapterTitle} -`,
        timestamp: now,
        setId,
        isIntro: true });
    }
    if (chapterInfo) {
      fallbackMessages.push({
        id: `chapter_${chapterIdx}_info`,
        role: 'narrator',
        content: chapterInfo,
        timestamp: now + fallbackMessages.length,
        setId,
        isIntro: true });
    }
    if (aiGoal && aiGoal !== chapterInfo) {
      fallbackMessages.push({
        id: `chapter_${chapterIdx}_goal`,
        role: 'narrator',
        content: aiGoal,
        timestamp: now + fallbackMessages.length,
        setId,
        isIntro: true });
    }

    return fallbackMessages;
  }

  const builtMessages = intro.flatMap((rawMessage: any, index: number): Message[] => {
    const speakerType = rawMessage?.speakerType ?? rawMessage?.speaker_type ?? DEFAULT_SPEAKER_TYPE;

    // image 타입: 이미지 카드 메시지로 변환 (기존에 무시하던 것을 렌더링)
    if (speakerType === 'image') {
      const imageUrl = pickFirstText(
        rawMessage?.imageUrl,
        rawMessage?.imageUri,
        rawMessage?.image_url,
        rawMessage?.content,
      );
      if (!imageUrl) return [];
      return [{
        id: `intro_${chapterIdx}_${index}`,
        role: 'image_card',
        content: imageUrl,
        imageCardUrl: imageUrl,
        timestamp: now + index,
        setId,
        isIntro: true }];
    }

    if (speakerType === 'emotion_delta') {
      return [];
    }

    const rawCharacterId = rawMessage?.speakerCharId ?? rawMessage?.speaker_char_id;
    const speakerName = pickFirstText(rawMessage?.speakerName, rawMessage?.speaker_name);
    const character = (() => {
      if (rawCharacterId != null) {
        // 1) Exact id match
        const exactMatch = characters.find(item => String(item.id) === String(rawCharacterId));
        if (exactMatch) return exactMatch;

        // 2) Index-based offset: introMessages uses 0-based index but character IDs start at 2
        const numericId = Number(rawCharacterId);
        if (Number.isFinite(numericId)) {
          const offsetMatch = characters.find(item => item.id === numericId + 2);
          if (offsetMatch) return offsetMatch;

          // 3) Array position fallback (treat rawCharacterId as array index)
          if (numericId >= 0 && numericId < characters.length) {
            return characters[numericId];
          }
        }
      }
      // 4) Name-based match
      if (speakerName) {
        return characters.find(item => item.name?.toLowerCase() === speakerName.toLowerCase());
      }
      return undefined;
    })();
    const translated = getIntroTranslation(introTranslations, rawMessage ?? {}, index);
    const translatedRecord = translated && typeof translated === 'object'
      ? (translated as Record<string, unknown>)
      : null;
    const content = pickFirstText(
      translatedRecord?.content,
      translatedRecord?.text,
      translated,
      rawMessage?.content,
    );

    if (speakerType === 'user') {
      return [{
        id: `intro_${chapterIdx}_${index}`,
        role: 'user',
        content,
        timestamp: now + index,
        setId,
        isIntro: true }];
    }

    if (speakerType === 'character') {
      return [{
        id: `intro_${chapterIdx}_${index}`,
        role: 'ai',
        content,
        characterId: character != null ? String(character.id) : (rawCharacterId != null ? String(rawCharacterId) : undefined),
        characterName: character?.name ?? pickFirstText(rawMessage?.speakerName, 'Character'),
        characterProfileUrl: pickFirstText(
          character?.imageUris?.[0],
          character?.profileUrl,
          (character as any)?.profile_url,
        ),
        timestamp: now + index,
        setId,
        isIntro: true }];
    }

    return [{
      id: `intro_${chapterIdx}_${index}`,
      role: 'narrator',
      content,
      timestamp: now + index,
      setId,
      isIntro: true }];
  });

  return dedupeIntroMessages(builtMessages);
}
