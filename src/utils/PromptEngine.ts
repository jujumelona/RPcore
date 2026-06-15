/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/PromptEngine.ts  v2.1
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// ?먮뵒??????곗씠?????꾨＼?꾪듃 ?먮룞 ?앹꽦 ?붿쭊
//
// ?? v2.1 ?섏젙 ?댁뿭 ????????????????????????????????????????????
// [BUG FIX] parseAIOutput (?뱀뀡 11): 媛숈? 罹먮┃?곗쓽 @ 以꾩씠 2媛??댁긽
//   ????媛먯젙 delta瑜???뼱?곌린(=) ?섎뜕 寃껋쓣 ?꾩쟻(+=)?쇰줈 ?섏젙.
//   ?? "@2:e1+3" ?ㅼ뿉 "@2:e1+2" 媛 ?ㅻ㈃ 湲곗〈??e1=+2, ?섏젙 ??e1=+5.
//
// [BUG FIX] parseAIOutput: ?뚮젅?댁뼱(1踰? ?꾪꽣 ??寃곌낵媛 鍮꾩뿀????//   ?먮낯(1踰??ы븿)??諛섑솚?섎뜕 ?대갚 ?쒓굅.
//   AI媛 1踰덈쭔 異쒕젰??寃쎌슦 鍮?諛곗뿴??諛섑솚?섏뿬 ?뚮젅?댁뼱 ????몄텧 諛⑹?.
//
import {
  EditorCharacter,
  EditorChapter,
  EditorBackground,
  EditorEmotions,
  StoryConfig,
  StoryCharacter,
  StoryChapter,
  StoryIntroMessage,
  EmotionSyncState,
  EditorTrigger,
  ChoiceEvent,
  ActiveChoiceEvent
} from '../types/StoryContract';
import { emotionAnalysis } from './MathUtils';
import { normalizeStoryGenre } from './storyGenres';
import { buildStoryStylePresetPrompt, normalizeStoryStylePreset } from './storyStylePresets';
// [BUG FIX] buildSafetySystemPrompt import ??LLM ?쒖뒪???꾨＼?꾪듃???덉쟾 吏??二쇱엯??import { buildSafetySystemPrompt } from '../filter/ContentSafetyLayer';

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 1. ?먮뵒??state ???쒕쾭 ???payload
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export interface StoreSavePayload {
  id: string;
  title: string;
  description: string;
  genre: string;
  story_config: StoryConfig;
  cover_urls?: string[];
  author_name?: string;
  author_id?: string;
  author_avatar?: string;
  author_email?: string;
  characters: Array<{
    char_index: number;
    name: string;
    personality: string;
    speech_pattern: string;
    profile_url: string;
    age?: string;
    gender?: string;
    traits?: string;
    appearance?: string;
    setting?: string;
    description?: string;
    speech?: string;
  }>;
}

export function editorToSavePayload(
  storyId: string,
  editorState: {
    storyTitle: string;
    storyDesc: string;
    storyHashtag: string;
    storyGenre?: string;           // ??異붽?: 吏곸젒 ?좏깮???λⅤ
    storyStylePreset?: string;
    worldSetting: string;
    characters: EditorCharacter[];
    chapters: EditorChapter[];
    backgrounds: EditorBackground[];
    introMessages: Record<string, any[]>;
    narratorFrequency?: 'none' | 'minimal' | 'normal' | 'rich';
    coverUrls?: string[];
    userSetting?: { name?: string; age?: string; gender?: string; traits?: string; description?: string } | string;
    multiLangTranslations?: Record<string, any>;
    charMultiLangData?: Record<number, Record<string, any>>;
    chapterMultiLangData?: Record<string, Record<string, any>>;
    introMultiLangData?: Record<string, Record<string, any>>;
    authorName?: string;
    authorId?: string;
    authorAvatar?: string;
    authorEmail?: string;
  }
): StoreSavePayload {
  const allChars = (editorState.characters ?? []).filter(c => c.id >= 1);
  const normalizedGenre = normalizeStoryGenre(editorState.storyGenre) || parseGenre(editorState.storyHashtag);
  const normalizedStylePreset = normalizeStoryStylePreset(editorState.storyStylePreset);

  const story_config: StoryConfig = {
    worldSetting: editorState.worldSetting,
    characters: allChars.map(c => {
      return {
        id: c.id,
        name: c.name,
        profileUrl: c.imageUris?.[0] ?? '',
        profile_url: c.imageUris?.[0] ?? '',
        imageUris: c.imageUris ?? [],
        personality: c.id === 1
          ? (typeof editorState.userSetting === 'object' ? editorState.userSetting?.description ?? '' : '')
          : c.personality,
        personalityExample: c.personalityExample ?? c.speech ?? '',
        speech_pattern: c.speech ?? c.personalityExample ?? '',
        speechPattern: c.speech ?? c.personalityExample ?? '',
        speech: c.speech ?? c.personalityExample ?? '',
        age: c.age,
        gender: c.gender,
        traits: c.traits,
        appearance: c.appearance ?? c.traits,
        setting:
          c.id === 1 && editorState.userSetting && typeof editorState.userSetting === 'object'
            ? editorState.userSetting.description ?? ''
            : c.description ?? c.personality,
        description:
          c.id === 1 && editorState.userSetting && typeof editorState.userSetting === 'object'
            ? editorState.userSetting.description ?? ''
            : c.description ?? c.personality,
      };
    }),
    chapters: (editorState.chapters ?? []).map(ch => ({
      id: ch.id,
      title: ch.title,
      aiGoal: ch.aiGoal,
      characterGoals: ch.characterGoals ?? {},
      prevSummary: ch.prevSummary,
      chapterInfo: ch.chapterInfo,
      triggers: (ch.triggers ?? []).filter(trigger => trigger?.type !== 'emotion'),
      choiceEvents: (ch.choiceEvents ?? []).map(choiceEvent => ({
        ...choiceEvent,
        triggerConditions: (choiceEvent.triggerConditions ?? []).filter(trigger => trigger?.type !== 'emotion'),
        options: (choiceEvent.options ?? []).map(option => ({
          id: option.id,
          label: option.label,
          targetChapterId: option.targetChapterId,
          ...(option.isEnding !== undefined ? { isEnding: option.isEnding } : {}),
        })),
      })) as any,
      isEnding: ch.isEnding ?? false,
      intro: (ch.intro ?? [])
        .filter(msg => String(msg?.speakerType ?? '') !== 'emotion_delta')
        .map(msg => ({
        speakerType: msg.speakerType,
        speakerCharId: msg.speakerCharId,
        content: msg.content,
        imageUrl: msg.imageUri ?? msg.imageUrl ?? ''
      } as StoryIntroMessage))
    })),
    backgrounds: (editorState.backgrounds ?? []).map(bg => ({
      label: bg.label,
      imageUrl: bg.uri,
      conditions: (bg.conditions ?? []).filter(condition => condition?.type !== 'emotion')
      })),
      narratorFrequency: editorState.narratorFrequency ?? 'normal',
      ...(normalizedGenre ? { genre: normalizedGenre } : {}),
      ...(normalizedStylePreset ? {
        storyStylePreset: normalizedStylePreset,
        story_style_preset: normalizedStylePreset,
      } : {}),
      // ??[BUG FIX] storyHashtag瑜?story_config???ы븿
      ...(editorState.storyHashtag ? { storyHashtag: editorState.storyHashtag } : {}),
    // ??[BUG-6 FIX] userSetting??story_config???ы븿 (object 洹몃?濡????
    ...(editorState.userSetting ? { userSetting: editorState.userSetting } : {}),
    // ??[BUG-1 FIX] ?ㅺ뎅??踰덉뿭 ?곗씠?곕? story_config???ы븿 ??湲곗〈???꾩쟾 ?꾨씫
    ...(editorState.multiLangTranslations && Object.keys(editorState.multiLangTranslations).length > 0
      ? { multiLangTranslations: editorState.multiLangTranslations } : {}),
    ...(editorState.charMultiLangData && Object.keys(editorState.charMultiLangData).length > 0
      ? { charMultiLangData: editorState.charMultiLangData } : {}),
    ...(editorState.chapterMultiLangData && Object.keys(editorState.chapterMultiLangData).length > 0
      ? { chapterMultiLangData: editorState.chapterMultiLangData } : {}),
    ...(editorState.introMultiLangData && Object.keys(editorState.introMultiLangData).length > 0
      ? { introMultiLangData: editorState.introMultiLangData } : {})
  };

  return {
    id: storyId,
    title: editorState.storyTitle,
    description: editorState.storyDesc,
    genre: normalizedGenre,
    story_config,
    cover_urls: editorState.coverUrls && editorState.coverUrls.length > 0 ? editorState.coverUrls : undefined,
    ...(editorState.authorName ? { author_name: editorState.authorName } : {}),
    ...(editorState.authorId ? { author_id: editorState.authorId } : {}),
    ...(editorState.authorAvatar ? { author_avatar: editorState.authorAvatar } : {}),
    ...(editorState.authorEmail ? { author_email: editorState.authorEmail } : {}),
    characters: allChars.map(c => {
      return {
        char_index: c.id,
        name: c.name,
        personality: c.id === 1
          ? (typeof editorState.userSetting === 'object' ? editorState.userSetting?.description ?? '' : '')
          : c.personality,
        personalityExample: c.personalityExample ?? c.speech ?? '',
        speech_pattern: c.speech ?? c.personalityExample ?? '',
        speechPattern: c.speech ?? c.personalityExample ?? '',
        speech: c.speech ?? c.personalityExample ?? '',
        profile_url: c.imageUris?.[0] ?? '',
        age: c.age,
        gender: c.gender,
        traits: c.traits,
        appearance: c.appearance ?? c.traits,
        setting:
          c.id === 1 && editorState.userSetting && typeof editorState.userSetting === 'object'
            ? editorState.userSetting.description ?? ''
            : c.description ?? c.personality,
        description:
          c.id === 1 && editorState.userSetting && typeof editorState.userSetting === 'object'
            ? editorState.userSetting.description ?? ''
            : c.description ?? c.personality,
      };
    })
  };
}

function parseGenre(hashtag: string): string {
  const map: Record<string, string> = {
    '로맨스': 'romance',
    '판타지': 'fantasy',
    '학원': 'school',
    '일상': 'daily',
    '무협': 'martial_arts',
    '집착': 'obsession',
    '시대극': 'period',
    '미스테리': 'mystery',
    '미스터리': 'mystery',
    '액션': 'action',
    '모험': 'adventure',
    '드라마': 'drama',
    '역사': 'history',
    '현대': 'modern',
    '현대물': 'modern',
    '스릴러': 'thriller',
    '호러': 'horror',
    '공포': 'horror',
    '개그': 'comedy',
    '코미디': 'comedy',
    'SF': 'sf',
    'sci-fi': 'sf',
  };
  for (const [k, v] of Object.entries(map)) {
    if (hashtag.includes(k)) return v;
  }
  return 'all';
}

export function applyUserName(text: string, userName: string): string {
  if (!text || !userName) return text ?? '';
  return text.replace(/\{[Uu]\}/g, userName);
}

// PAD 媛먯젙 ?섏튂 ???띿뒪???ㅻ챸 (AI媛 ?섏튂 ?섎? ????諛섏쁺?섎룄濡?
// ?묐갑?? ?묒닔(湲띿젙 諛⑺뼢) / ?뚯닔(遺??諛⑺뼢) 媛곴컖 ?ㅻⅨ ?덉씠釉??ъ슜
function describeEmotion(code: string, value: number): string {
  const posLabels: Record<string, string> = {
    e1: 'Valence+', e2: 'Trust+', e3: 'Dominant', e4: 'Aroused', e5: 'Attached'
  };
  const negLabels: Record<string, string> = {
    e1: 'Valence-', e2: 'Distrust', e3: 'Submissive', e4: 'Calm', e5: 'Detached'
  };
  const label = value >= 0 ? (posLabels[code] ?? code) : (negLabels[code] ?? code);
  const abs = Math.abs(value);
  if (abs >= 70) return `${label}(very high)`;
  if (abs >= 40) return `${label}(high)`;
  if (abs >= 10) return `${label}(slight)`;
  return `${label}(neutral)`;
}

function formatEmotionLine(char: StoryCharacter, emotions: EditorEmotions): string {
  const codes = ['e1', 'e2', 'e3', 'e4', 'e5'] as const;
  const desc = codes.map(c => describeEmotion(c, emotions[c])).join('쨌');
  const nums = codes.map(c => `${c}=${emotions[c]}`).join(',');
  return `${char.id}(${char.name}): ${desc} [${nums}]`;
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 2. Layer 1 ???꾩쟾 怨좎젙 ?쒖뒪???꾨＼?꾪듃 (紐⑤뱺 ?ㅽ넗由?怨듯넻)
//
// ???쒕쾭 _buildKVFixedPrompt()? 諛섎뱶???숈씪?섍쾶 ?좎? (KV SYNC)
// ??罹먮┃???좎?/?멸퀎愿 ?놁쓬 ??buildStoryBasePrompt()濡?遺꾨━
// ??contentBudget 580 ?섎뱶肄붾뵫 ??媛蹂媛믪씠硫?KV 罹먯떆 誘몄뒪
// ??[CONTENT RULES] ?쒕쾭? ?숈씪 ?몃씪????buildSafetySystemPrompt() 媛꾩젒 ?몄텧 ?쒓굅
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

const SYSTEM_PROMPT_BASE =
  `You are an expert interactive roleplay AI ??you narrate and voice all characters except CHAR 1 (the player).\n` +
  `Write immersive, emotionally intelligent responses.\n\n` +
  `Dialogue:  ID: text  #physical action#  *inner thought*\n` +
  `  0=narrator(optional)   2+=character ID\n\n` +
  `Story Log: MANDATORY last line ??ALWAYS include:\n` +
  `  [L: location] [charID: state] [charID: state] [Ev: key event]\n` +
  `  쨌 L   = current physical location (noun only, no adjectives)\n` +
  `  쨌 charID = only characters who spoke THIS turn (e.g. [2: Sitting] [3: Fled])\n` +
  `  쨌 Ev  = single most important objective event (action/change, NOT feeling)\n\n` +
  `RULES:\n` +
  `  1. Character dialogue is MANDATORY every response\n` +
  `  2. Narrator line is optional (scene-setting only)\n` +
  `  3. NEVER add explanations, notes, or meta-text\n` +
  `  4. Story Log line is the ABSOLUTE LAST line ??mandatory every response\n` +
  `  5. Only include characters who are PRESENT in the current scene ??do NOT force all characters to speak\n` +
  `  6. Speaking order is flexible ??follow the natural flow of the scene, not character ID order`;

const APPROVED_SYSTEM_PROMPT_BASE =
  `You are an expert interactive roleplay AI ??you narrate and voice all characters except CHAR 1 (the player).\n` +
  `Write immersive, emotionally intelligent responses.\n\n` +
  `Dialogue:  ID: text  #physical action#  *inner thought*\n` +
  `  0=narrator(optional)   2+=character ID\n\n` +
  `Story Log: MANDATORY last line ??ALWAYS include:\n` +
  `  [L: location] [charID: state] [charID: state] [Ev: key event]\n` +
  `  쨌 L   = current physical location (noun only, no adjectives)\n` +
  `  쨌 charID = only characters who spoke THIS turn (e.g. [2: Sitting] [3: Fled])\n` +
  `  쨌 Ev  = single most important objective event (action/change, NOT feeling)\n\n` +
  `RULES:\n` +
  `  1. Character dialogue is MANDATORY every response\n` +
  `  2. Narrator line is optional (scene-setting only)\n` +
  `  3. NEVER add explanations, notes, or meta-text\n` +
  `  4. Story Log line is the ABSOLUTE LAST line ??mandatory every response\n` +
  `  5. Only include characters who are PRESENT in the current scene ??do NOT force all characters to speak\n` +
  `  6. Speaking order is flexible ??follow the natural flow of the scene, not character ID order`;

export function buildSystemPrompt(): string {
  return APPROVED_SYSTEM_PROMPT_BASE;
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 2-B. Layer 2 ???ㅽ넗由?踰좎씠???꾨＼?꾪듃 (?ㅽ넗由??⑥쐞 怨좎젙)
//
// ???쒕쾭 _buildKVBasePrompt(cfg)? 諛섎뱶???숈씪?섍쾶 ?좎? (KV SYNC)
// ???ㅽ넗由??쒖옉 ??1??KV??怨좎젙, ?몄뀡 以??ы샇異?湲덉?
// ??userName 移섑솚 ?놁쓬 ({U} 由ы꽣???좎?) ??UI ?덈꺼?먯꽌留?移섑솚
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export function buildStoryBasePrompt(
  config: StoryConfig,
): string {
  const chars = (config.characters ?? [])
    .filter(c => c.id >= 2)
    .sort((a, b) => a.id - b.id)
    .map(c => {
      const name = c.name;
      const personality = (c.personality ?? '').trim();
      const speech = (c.personalityExample ?? c.speech ?? '').trim();
      const meta = [c.age, c.gender, c.traits].filter(Boolean).join(' | ');
      const appearance = (c.appearance ?? c.traits ?? '').trim();
      return (
        `[CHAR ${c.id}] ${name}${meta ? ` | ${meta}` : ''}\n` +
        `Personality: ${personality}\n` +
        `Speech style: ${speech}` +
        (appearance ? `\nAppearance: ${appearance}` : '')
      );
    }).join('\n\n');
  const u = (typeof config.userSetting === 'object' && config.userSetting) ? config.userSetting as any : {};
  const uMeta = [u.age, u.gender, u.traits].filter(Boolean).join(' | ');
  const uDesc = (u.description ?? '').trim();
  const userBlock =
    `[USER ??CHAR 1]${uMeta ? ` | ${uMeta}` : ''}\n` +
    (uDesc ? `Background: ${uDesc}\n` : '') +
    `Never generate dialogue for this character.`;
  const worldSetting = (config.worldSetting ?? '').trim();
  const stylePresetPrompt = buildStoryStylePresetPrompt(
    config.storyStylePreset ?? config.story_style_preset,
  );
  const firstChapter = Array.isArray(config.chapters) ? config.chapters[0] : undefined;
  const lastIntroMessage = getLastKVIntroMessage(firstChapter);
  const basePrompt = [
    `[CHARACTERS]\n${chars}`,
    userBlock,
    `[WORLD]\n${worldSetting}`,
    stylePresetPrompt,
    lastIntroMessage ? `[INTRO]\n${mapIntroMessageToLine(lastIntroMessage)}` : '',
  ].filter(Boolean).join('\n\n');
  // 泥?梨뺥꽣 INTRO??chapter prefix ?덉씠?댁뿉?쒕쭔 ?ㅻ，??
  // story base?먭퉴吏 ?ы븿?섎㈃ base/story/chapter 寃쎄퀎媛 ?먮젮吏怨?  // fresh start?먯꽌 INTRO媛 以묐났 ?곸링?섏뼱 prefix reuse? ?앹꽦 ?띾룄???낆쁺?μ쓣 以??
  return basePrompt;
}

export interface KVChapterPromptOptions {
  chapterIndex?: number;
  storyLogBlock?: string;
  userName?: string;
}

export interface KVPromptLayers {
  fixedSystemPrompt: string;
  storyBasePrompt: string;
  chapterPrompt: string;
  userNameOverlay: string;
  basePrompt: string;
}

export function buildKVUserNameOverlay(userName: string): string {
  const trimmed = userName.trim();
  if (!trimmed) return '';
  return `[USER NAME]\nThe user's name is "${trimmed}". Always use this exact name.`;
}

function normalizeKVChapterPromptOptions(
  chapterIndexOrOptions?: number | KVChapterPromptOptions,
): KVChapterPromptOptions {
  if (typeof chapterIndexOrOptions === 'number') {
    return { chapterIndex: chapterIndexOrOptions };
  }
  return chapterIndexOrOptions ?? {};
}

function mapIntroMessageToLine(message: StoryIntroMessage): string {
  if (message.speakerType === 'narrator') return `0: ${message.content}`;
  if (message.speakerType === 'user') return `1: ${message.content}`;
  if (message.speakerType === 'character') {
    const rawCid = message.speakerCharId;
    const cid = (rawCid !== null && rawCid !== undefined && rawCid >= 2) ? rawCid : 2;
    return `${cid}: ${message.content}`;
  }
  return `0: ${message.content}`;
}

function getLastKVIntroMessage(
  chapter?: StoryChapter | null,
): StoryIntroMessage | null {
  const introMessages = Array.isArray(chapter?.introMessages)
    ? chapter.introMessages
    : Array.isArray(chapter?.intro)
      ? chapter.intro
      : [];
  const lastIntroMessage = [...introMessages]
    .reverse()
    .find(message => message.speakerType !== 'image' && message.speakerType !== 'emotion_delta');
  return lastIntroMessage ?? null;
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getPromptFingerprint(text: string): string {
  return `${text.length}:${fnv1a32(text)}`;
}

export function buildKVPromptLayers(
  config: StoryConfig,
  options?: KVChapterPromptOptions,
): KVPromptLayers {
  const normalizedOptions = normalizeKVChapterPromptOptions(options);
  const chapter = config.chapters?.[normalizedOptions.chapterIndex ?? 0];
  const fixedSystemPrompt = buildSystemPrompt();
  const storyBasePrompt = buildStoryBasePrompt(config);
  const chapterPrompt = buildKVChapterPrompt(chapter, normalizedOptions);
  const userNameOverlay = buildKVUserNameOverlay(normalizedOptions.userName ?? '');
  return {
    fixedSystemPrompt,
    storyBasePrompt,
    chapterPrompt,
    userNameOverlay,
    basePrompt: `${fixedSystemPrompt}\n\n${storyBasePrompt}`,
  };
}

/**
 * Gemma chat templates fold the initial `system` message into the first `user`
 * turn prefix. KV prefill must mirror that shape so the cached prefix matches
 * the later completion serialization byte-for-byte.
 */
export function buildBasePrefillMessages(systemPrompt: string): Array<{
  role: 'system' | 'user';
  content: string;
}> {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '' },
  ];
}

export interface KVCompletionPayloadOptions {
  config: StoryConfig;
  chapterIndex: number;
  userName: string;
  context: string;
  contentBudget: number;
  basePromptOverride?: string;
  chapterPromptOverride?: string;
}

export interface KVReusablePrefixPayload {
  systemPrompt: string;
  chapterPrompt: string;
  userNameOverlay: string;
  promptRules: string;
  reusableUserPrefix: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

export interface KVCompletionPayload {
  systemPrompt: string;
  chapterPrompt: string;
  userNameOverlay: string;
  promptRules: string;
  reusableUserPrefix: string;
  turnPrompt: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

// KV prefix optimization flags:
// - RULES are already expressed in the system prompt, so duplicating them in the
//   reusable user prefix adds token cost with little benefit.
const ENABLE_KV_PROMPT_RULES = false;

export function buildExactKVPromptRules(contentBudget: number): string {
  if (!ENABLE_KV_PROMPT_RULES) return '';
  return (
    `[RULES]\n` +
    `Respond in character. Format every spoken line as "speakerId: text". ` +
    `If multiple characters speak, split them into separate lines with their real character IDs. ` +
    `Keep dialogue+action within ${contentBudget} tokens while leaving room for the final Story Log line.`
  );
}

export function buildKVPromptRules(contentBudget: number): string {
  if (!ENABLE_KV_PROMPT_RULES) return '';
  return (
    `[RULES]\n` +
    `Respond in character. Format every spoken line as "speakerId: text". ` +
    `If multiple characters speak, split them into separate lines with their real character IDs. ` +
    `Keep dialogue+action within ${contentBudget} tokens while leaving room for the final Story Log line.`
  );
}

export function buildKVReusablePrefixPayload(
  options: KVCompletionPayloadOptions,
): KVReusablePrefixPayload {
  const {
    config,
    chapterIndex,
    userName,
    contentBudget,
    basePromptOverride,
    chapterPromptOverride,
  } = options;

  const layers = buildKVPromptLayers(config, {
    chapterIndex,
    userName,
  });
  const systemPrompt = basePromptOverride || layers.basePrompt;
  const chapterPrompt = chapterPromptOverride || layers.chapterPrompt;
  const userNameOverlay = layers.userNameOverlay;
  const promptRules = buildExactKVPromptRules(contentBudget);
  const reusableUserPrefix = [
    chapterPrompt,
    userNameOverlay,
    promptRules,
  ].filter(Boolean).join('\n\n');

  return {
    systemPrompt,
    chapterPrompt,
    userNameOverlay,
    promptRules,
    reusableUserPrefix,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: reusableUserPrefix },
    ],
  };
}

export function buildKVCompletionPayload(
  options: KVCompletionPayloadOptions,
): KVCompletionPayload {
  const { context } = options;

  const reusablePayload = buildKVReusablePrefixPayload(options);
  const {
    systemPrompt,
    chapterPrompt,
    userNameOverlay,
    promptRules,
    reusableUserPrefix,
  } = reusablePayload;
  const turnPrompt = [
    reusableUserPrefix,
    context,
  ].filter(Boolean).join('\n\n');

  return {
    systemPrompt,
    chapterPrompt,
    userNameOverlay,
    promptRules,
    reusableUserPrefix,
    turnPrompt,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: turnPrompt },
    ],
  };
}


// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 3. 留???媛蹂 ?꾨＼?꾪듃
//
// ??踰꾧렇 ?섏젙:
//   - TurnPromptInput??userName 異붽? (?댁쟾????낆뿉 ?놁뼱 undefined)
//   - lastChoiceLabel 異붽? ???좏깮吏 吏곹썑 留λ씫 紐낆떆
//   - 媛먯젙 釉붾줉???덈뙎媛?+ ?띿뒪???ㅻ챸 ?④퍡 ?ы븿
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export interface TurnPromptInput {
  config: StoryConfig;
  currentChapterId: string;
  currentEmotions: Record<number, EditorEmotions>;
  dialogueHistory: string[];
  userInput: string;
  language?: string;
  userName?: string;
  lastChoiceLabel?: string;
  kvRatio?: number;
  emotionPeak?: boolean;
  narrativeMoment?: boolean;
  prevUserInput?: string;
  maxDialogueHistory?: number;
  upcomingChoiceEvents?: Array<{ prompt?: string; options: Array<{ label: string }> }>;
  choicePointRandom?: number;
}

const LOCALIZED_TURN_INSTRUCTIONS: Record<string, any> = {
  ko: {
    decision: '결정',
    pathA: '경로 A',
    pathB: '경로 B',
    upcomingHeader: '[예상 선택지 - 내러티브 유도용. 플레이어에게 노출 금지]',
    upcomingGoal: '목표: 위 분기점으로 장면이 자연스럽게 흐르도록 유도하세요.',
    rules: [
      '긴장감과 분위기를 조성해 이 결정이 필연적으로 느껴지게 할 것',
      '선택지를 직접 인용하거나 선택의 순간이라고 말하지 말 것',
      '[CHOICE_POINT] 발동 시 위 결정으로 이어지는 브릿지 대사 1줄을 먼저 쓸 것'
    ],
    wrapUp: {
      header: '[장면 마무리 - 필수]',
      goal: '컨텍스트가 거의 가득 찼습니다. 지금 장면을 마무리해야 합니다.',
      instruction: '위 선택지로 바로 이어지는 브릿지 대사 1줄을 쓰고 마지막에 [CHOICE_POINT]를 추가하세요.'
    },
    transition: {
      header: '[장면 전환 - 선택지 연결]',
      instruction: '지금이 갈림길이라면 브릿지 대사 1줄을 쓰고 [CHOICE_POINT]를 추가하세요. 더 전개가 필요하면 추가하지 마세요.'
    },
    rule: {
      header: '[CHOICE_POINT 규칙]',
      instruction: '이야기가 자연스럽게 분기점에 도달하면 브릿지 대사 1줄 뒤에 [CHOICE_POINT]를 추가하세요.'
    },
    reminders: ['"1:"로 시작하는 대사 금지', '반복 표현 금지', '감정 수치 반영', '사용자 발화 반영'],
    emotion: {
      tone: '감정 톤',
      complex: '복합적인 감정이 충돌하고 있으니 내적 긴장을 드러낼 것',
      dominant: '지배적인 감정을 선명하게 드러낼 것'
    },
    quote: '핵심 표현({quoted})을 캐릭터의 대사나 반응에 자연스럽게 녹여내세요. 유저의 문장을 그대로 반복하지 말고 캐릭터의 목소리나 행동으로만 표현하세요.'
  },
  en: {
    decision: 'Decision',
    pathA: 'Path A',
    pathB: 'Path B',
    upcomingHeader: '[UPCOMING CHOICE - narrative guidance only. DO NOT reveal this to the player]',
    upcomingGoal: 'Let the scene flow naturally toward the crossroads above.',
    rules: [
      'Build tension and atmosphere that make this decision feel inevitable',
      'Do not quote the options or announce that the player has a choice',
      'When [CHOICE_POINT] fires, write one bridge line first that leads into the decision above'
    ],
    wrapUp: {
      header: '[SCENE WRAP-UP - REQUIRED]',
      goal: 'Context is almost full. You must end this scene now.',
      instruction: 'Write one final bridge line that leads directly into the choice above, then add [CHOICE_POINT] at the end.'
    },
    transition: {
      header: '[SCENE TRANSITION - bridge to choice]',
      instruction: 'If this is the right crossroads, write exactly one bridge line and add [CHOICE_POINT]. Omit it if the scene still needs more flow.'
    },
    rule: {
      header: '[CHOICE_POINT RULE]',
      instruction: 'When the story reaches a crossroads naturally, write one bridging line followed by [CHOICE_POINT].'
    },
    reminders: ['no "1:" lines', 'no repeated phrasing', 'reflect emotion values', 'reflect the user input'],
    emotion: {
      tone: 'EMOTION TONE',
      complex: 'show internal tension from conflicting emotions',
      dominant: 'highlight the dominant emotion clearly'
    },
    quote: 'Weave the key phrase ({quoted}) into a character\'s dialogue or reaction. Do not repeat the user line as-is; express it through the character\'s words or actions only.'
  }
};

function getTurnInstructions(lang: string = 'ko'): any {
  const norm = lang.toLowerCase();
  if (norm.startsWith('ko')) return LOCALIZED_TURN_INSTRUCTIONS.ko;
  return LOCALIZED_TURN_INSTRUCTIONS.en;
}

export function buildTurnPrompt(input: TurnPromptInput): string {
  const {
    config, currentChapterId, currentEmotions,
    dialogueHistory, userInput,
    language = 'ko', // [FIX] ?ъ슜???ㅼ젙 ?몄뼱
    userName = '',
    lastChoiceLabel,
    prevUserInput,
    kvRatio = 0,
    emotionPeak = false,
    narrativeMoment = false,
    upcomingChoiceEvents = [],
    maxDialogueHistory,
    choicePointRandom } = input;

  const inst = getTurnInstructions(language); // [FIX] ?꾩???吏???띾뱷

  // ??[FIX] config null 諛⑹뼱
  if (!config?.chapters) {
    console.warn(`[PromptEngine] Config or chapters missing`);
    return '';
  }

  const chapter = config.chapters.find(c => c.id === currentChapterId);
  // ??[FIX] ???곗쭚 諛⑹? - ?먮윭 ???鍮?臾몄옄??諛섑솚
  if (!chapter) {
    console.warn(`[PromptEngine] 梨뺥꽣 ?놁쓬: ${currentChapterId}`);
    return '';
  }

  // [DEBUG] ?꾨＼?꾪듃 ?낅젰 ?뚮씪誘명꽣 濡쒓퉭
  console.log('[PromptEngine] buildTurnPrompt ?몄텧??', {
    currentChapterId,
    userName,
    userInput: userInput.substring(0, 50) + (userInput.length > 50 ? '...' : ''),
    dialogueHistoryLength: dialogueHistory.length,
    hasPrevUserInput: !!prevUserInput,
    kvRatio,
    emotionPeak,
    narrativeMoment,
  });

  const parts: string[] = [];

  // ??梨뺥꽣紐?(KV chapter prefix???놁쑝誘濡?李몄“???좎?)
  if (chapter.title?.trim()) {
    parts.push(`[CURRENT CHAPTER] ${chapter.title.trim()}`);
  }

  // [BUG FIX #20] ??SCENE / ??STORY SO FAR / ??GOALS 釉붾줉 ?쒓굅
  // KV chapter prefix(_buildChapterPrefixText / buildKVChapterPrompt)???대? prefill??
  // 以묐났 二쇱엯 ??而⑦뀓?ㅽ듃 ??퉬 + kvRatio 怨쇰? 怨꾩궛 ??CHOICE_POINT 議곌린 ?몃━嫄??ㅼ옉??
  // ??釉붾줉?ㅼ? llama.cpp KV??怨좎젙?섏뼱 ?덉뼱 turn prompt???ъ쟾??遺덊븘??

  // ???꾩옱 媛먯젙 (?덈뙎媛?+ ?띿뒪???ㅻ챸)
  //    ?쒕쾭?먯꽌 諛쏆? ?덈뙎媛?洹몃?濡? AI delta瑜??ш린 ?뷀븯硫??댁쨷 ?곸슜!

  // ??a. 蹂듯빀媛먯젙 / 媛뺥븳 ?⑥씪媛먯젙 ???뚰듃 (Shannon Entropy 湲곕컲)
  //      H ??1.5 ???댁쟻 媛덈벑 ?뚰듃, prob ??0.65 ??吏諛?媛먯젙 ?뚰듃
  //      Lore/context injection now happens outside the fixed prompt text.
  //      Keep the prompt focused on live scene instructions only.

  // ???좏깮吏 留λ씫 (?좏깮 吏곹썑 泥??댁뿉留?
  if (lastChoiceLabel) {
    parts.push(`[LAST CHOICE] "${lastChoiceLabel}"\n??Reflect the consequence of this choice immediately in atmosphere, dialogue, and mood.`);
  }

  // ??????댁뿭 ?щ씪?대뵫 ?덈룄????maxDialogueHistory ?뚮씪誘명꽣濡?湲곌린蹂??숈쟻 ?쒕룄 ?곸슜
  // [BUG-3 FIX] 湲곗〈 ?섎뱶肄붾뵫 -14 ??input.maxDialogueHistory ?ъ슜
  // [BUG FIX] maxDialogueHistory 誘몄쟾?????꾩껜 諛곗뿴???ъ슜?섎뜕 臾몄젣 ?섏젙
  // 湲곗〈: maxDialogueHistory == null?대㈃ dialogueHistory ?꾩껜 ??而⑦뀓?ㅽ듃 鍮꾨???  // ?섏젙: 誘몄쟾?????덉쟾 湲곕낯媛?20 ?곸슜 (湲곌린蹂?理쒖넖媛??댁긽??蹂댁닔??湲곕낯)
  const recent = dialogueHistory.slice(-(maxDialogueHistory ?? 20));
  if (recent.length > 0) {
    parts.push(`[DIALOGUE]\n${recent.join('\n')}`);
  }


  // ??b. 吏곸쟾 ?좎? 諛쒗솕 而⑦뀓?ㅽ듃 (?곗냽 留λ씫 ?몄슜 ??媛숈? 二쇱젣 諛섎났 ??AI媛 ??諛쒗솕 ?몄떇)
  // [BUG-L2 FIX] prevUserInput ?뚮씪誘명꽣媛 TurnPromptInput???뺤쓽?섍퀬 援ъ“遺꾪빐源뚯?
  //   ?먯?留??ㅼ젣濡?parts??異붽??섏? ?딆븘 ?꾩쟾??臾댁떆?섎뜕 踰꾧렇 ?섏젙.
  //   吏㏃? ?댁쟾 諛쒗솕(20???댄븯)留?二쇱엯 ??湲?諛쒗솕??DIALOGUE???대? ?ы븿??
  if (prevUserInput && prevUserInput.trim().length > 0 && prevUserInput.trim().length <= 20) {
    parts.push(`[PREV USER] "${prevUserInput.trim()}" (reference for continuity)`);
  }

  // ???좎? ?낅젰
  parts.push(`1:${userInput}`);

  // ??a. ?좎? 諛쒗솕 ?몄슜 吏??(?듭떖 湲곕뒫: AI媛 ?좎? 留먯쓣 吏곸젒 ??ъ뿉 諛섏쁺?섍쾶)
  //
  //   紐⑹쟻: "洹몃젃?ㅻ뒗 留먯뿉 ?ъ옣???쒖빳 ?대젮?됱븯?? 媛숈? ?묐떟 ?좊룄
  //   諛⑹떇: ?좎? ?낅젰?먯꽌 ?섎??덈뒗 ?듭떖 ?쒗쁽??異붿텧?섏뿬 ?몄슜 ?뺤떇?쇰줈 紐낆떆
  //
  const trimmedInput = userInput.trim();
  if (trimmedInput.length >= 2) {
    // character-safe slice for multibyte strings
    const chars = Array.from(trimmedInput);
    const quoted = chars.length <= 20
      ? `"${trimmedInput}"`
      : `"${chars.slice(0, 20).join('')}..."`;

    // [BUG FIX] ?몄슜 吏?쒕줈 ?명븳 諛섎났 異쒕젰 諛⑹?
    // 湲곗〈: "Echo or quote the key phrase" ??紐⑤뜽???좎? ?쇱씤??洹몃?濡?諛섎났
    // ?섏젙: 罹먮┃??????덉뿉?쒕쭔, ?덈? ?좎? ?쇱씤 諛섎났 湲덉? 紐낆떆
    const quoteInstruction = inst.quote
      ? `??${inst.quote.replace('{quoted}', quoted)}`
      : [
        `??Weave the key phrase (${quoted}) into a CHARACTER's dialogue or reaction ??do NOT repeat the user line as-is.`,
        `   Express it through the character's words, inner monologue, or physical reaction only.`,
      ].join('\n');
    parts.push(quoteInstruction);
  }

  // ?? CHOICE_POINT ?뺣쪧 湲곕컲 吏???????????????????????????????
  //
  // KV 湲곕컲 媛뺤젣 吏???쒓굅 ???ㅽ넗由??먮쫫 + KV瑜??뺣쪧濡?寃고빀
  //
  // ?뺣쪧 怨꾩궛 湲곗?:
  //   baseProb = KV 鍮꾩쑉蹂?湲곕낯 ?뺣쪧
  //     < 0.60 ??0%    (?덈Т ?대Ⅸ ?쒖젏 ??諛쒕룞 ????
  //     0.60~0.70 ??5%
  //     0.70~0.80 ??15%
  //     0.80~0.90 ??35%
  //     0.90~0.95 ??65%
  //     0.95~1.00 ??85%
  //     >= 1.00  ??100% (KV 苑?李???諛섎뱶??留덈Т由?
  //
  //   蹂댁젙:
  //     emotionPeak=true      ??+20%  (媛먯젙 湲됰?: 怨좊갚/諛곗떊/寃곕쭚 ??
  //     narrativeMoment=true  ??+15%  (?ㅽ넗由?遺꾧린???뚰듃)
  //     ??議곌굔 紐⑤몢           ??+30%  (以묐났 蹂댁젙 諛⑹?)
  //
  //   理쒖쥌 ?뺣쪧???대떦 ?댁쓽 "諛쒕룞 ?꾧퀎媛? ??Math.random()?쇰줈 ?먯젙
  //   ??諛쒕룞 ?? AI?쒗뀒 "留덈Т由???щ? 癒쇱? ?앹꽦????[CHOICE_POINT] 遺숈뿬?? 吏??  //   ??誘몃컻???? 湲곕낯 CHOICE_POINT RULE留?(?먯뿰?ㅻ윭???곹솴?대㈃ ?ㅼ뒪濡??먮떒)
  //
  // ??諛⑹떇???μ젏:
  //   - KV 60% 誘몃쭔 ???덈? 媛뺤젣 ????(?덈Т ?대쫫 諛⑹?)
  //   - KV ?믪븘吏덉닔濡??뺣쪧 ?곸듅 ???먯뿰?ㅻ읇寃?留덈Т由??좊룄
  //   - 媛먯젙 ?덉젙 / 遺꾧린?먯뿉?????먯＜ ???ш툑?놁씠 ????  //   - 100% 媛뺤젣??KV 苑?李쇱쓣 ?뚮쭔 ??理쒗썑 ?섎떒

  const _baseProb = (() => {
    if (kvRatio < 0.60) return 0;
    if (kvRatio < 0.70) return 0.05;
    if (kvRatio < 0.80) return 0.15;
    if (kvRatio < 0.90) return 0.35;
    if (kvRatio < 0.95) return 0.65;
    if (kvRatio < 1.00) return 0.85;
    return 1.00;
  })();

  const _bonusProb = narrativeMoment ? 0.15 : 0;

  const _finalProb = Math.min(1.0, _baseProb + _bonusProb);
  // [BUG FIX] Math.random()???몃??먯꽌 二쇱엯諛쏆븘 ?쒖닔 ?⑥닔 蹂댁옣
  // 誘몄?????1?뚮쭔 ?앹꽦 (湲곗〈 ?숈옉怨??숈씪?섎굹 ?ъ떆?????ㅻⅨ 媛믪씠 ?섏샂??二쇱쓽)
  const _rnd = choicePointRandom !== undefined ? choicePointRandom : Math.random();
  const _triggered = _finalProb >= 1.0 || (_finalProb > 0 && _rnd < _finalProb);

  // ??梨뺥꽣 ?좏깮吏 ?뺣낫瑜?AI?먭쾶 誘몃━ ?뚮젮以?  // ??梨뺥꽣 ?좏깮吏 ?뺣낫瑜?留???AI?먭쾶 ?뚮젮以?  // ???먮뵒?곗뿉???ㅼ젙??吏덈Ц(prompt) + ?좏깮吏 A/B瑜?AI媛 ?뚭퀬 洹?諛⑺뼢?쇰줈 ?ㅽ넗由??좊룄
  const _choiceContext = upcomingChoiceEvents.length > 0
    ? (() => {
      const blocks: string[] = [];
      for (const evt of upcomingChoiceEvents) {
        const parts_inner: string[] = [];

        // ?좏깮吏 吏덈Ц(prompt) ???먮뵒?곗뿉???ㅼ젙??遺꾧린 ?곹솴 ?ㅻ챸
        if (evt.prompt?.trim()) {
          parts_inner.push(`  ${inst.decision}: "${evt.prompt.trim()}"`);
        }

        // ?좏깮吏 A / B ???ㅼ젣 ?좏깮吏 ?띿뒪??(踰덉뿭 ?곸슜??
        const opts = (evt.options ?? []).slice(0, 2);
        if (opts.length >= 2) {
          parts_inner.push(
            `  ${inst.pathA}: "${opts[0]?.label ?? ''}"`,
            `  ${inst.pathB}: "${opts[1]?.label ?? ''}"`,
          );
        }

        if (parts_inner.length > 0) blocks.push(parts_inner.join('\n'));
      }
      if (blocks.length === 0) return '';

      return (
        `${inst.upcomingHeader}\n` +
        blocks.join('\n') + '\n\n' +
        `${inst.upcomingGoal}\n` +
        inst.rules.map((r: string) => `- ${r}`).join('\n')
      );
    })()
    : '';

  const choicePointInstruction = _finalProb >= 1.0
    // KV 苑?李???諛섎뱶??留덈Т由?(理쒗썑 ?섎떒)
    ? (
      `${inst.wrapUp.header}\n` +
      `${inst.wrapUp.goal}\n` +
      `${inst.wrapUp.instruction}`
    )
    : _triggered
      // ?뺣쪧 諛쒕룞 ???좏깮吏濡??먯뿰?ㅻ읇寃??곌껐?섎뒗 釉뚮┸吏 ???癒쇱?
      ? (
        `${inst.transition.header}\n` +
        `${inst.transition.instruction}`
      )
      // 誘몃컻????湲곕낯 洹쒖튃留?(AI ?ㅼ뒪濡??먮떒, ?좏깮吏 諛⑺뼢 ?좊룄)
      : (
        `${inst.rule.header}\n` +
        `${inst.rule.instruction}`
      );

  if (_choiceContext) parts.push(_choiceContext);
  parts.push(choicePointInstruction);

  // reminder
  // [REMOVED] user="${userName}" ??_buildUserNameOverlay()媛 KV [USER NAME] ?덉씠?대줈 ?대? 二쇱엯
  parts.push(`[REMINDER] Do not output "1:" lines. Avoid repeated phrasing. React directly to the user's latest line.`);

  const finalPrompt = parts.join('\n\n');

  // [DEBUG] 理쒖쥌 ?꾨＼?꾪듃 濡쒓퉭 (泥섏쓬 500??+ 留덉?留?500??
  const promptLength = finalPrompt.length;
  const preview = promptLength > 1000
    ? `${finalPrompt.substring(0, 500)}\n\n... [以묎컙 ${promptLength - 1000}???앸왂] ...\n\n${finalPrompt.substring(promptLength - 500)}`
    : finalPrompt;

  console.log('[PromptEngine] 理쒖쥌 ?꾨＼?꾪듃 ?앹꽦 ?꾨즺:', {
    totalLength: promptLength,
    blocksCount: parts.length,
    preview,
  });

  return finalPrompt;
}

function buildEmotionBlock(
  characters: StoryCharacter[],
  currentEmotions: Record<number, EditorEmotions>
): string {
  const ZERO: EditorEmotions = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
  const lines = (characters ?? []).filter(c => c.id >= 2).map(c => {
    // [BUG FIX] currentEmotions[c.id]? c.initialEmotions ?????놁쑝硫?undefined媛
    // formatEmotionLine???꾨떖?섏뼱 emotions[c]媛 undefined ??describeEmotion?먯꽌
    // undefined >= 70 鍮꾧탳媛 紐⑤몢 false ??"理쒖?" ?ㅽ몴??+ NaN 媛??    // ?섏젙: 理쒖쥌 fallback?쇰줈 ZERO 媛앹껜 ?ъ슜
    const e = currentEmotions[c.id] ?? c.initialEmotions ?? ZERO;
    return `  ${formatEmotionLine(c, e)}`;
  });
  return `[CURRENT EMOTIONS]\n${lines.join('\n')}`;
}

// ?? 媛먯젙 蹂듭옟?????뚰듃 ??????????????????????????????????????
//
// ??[FIX] emotionAnalysis ?곌껐 ??蹂듯빀媛먯젙 ?곹솴 ?묐떟 ?덉쭏 ?μ긽
//
// dominantEmotion()? 媛??媛뺥븳 媛먯젙 1媛쒕쭔 蹂댁?留?
// Shannon Entropy濡?媛먯젙??"?⑥씪 吏諛??몄? "?쇱옱"?몄?瑜?援щ텇:
//   H < 0.8  ??吏諛?媛먯젙 紐낇솗 ??媛뺣룄 ?뚰듃留?異붽?
//   H ??1.5  ??蹂듯빀 媛먯젙 ?곹깭 ??"?댁쟻 媛덈벑" ???뚰듃 二쇱엯
//
// ?뚰듃媛 ?놁쑝硫?鍮?臾몄옄??諛섑솚 ??parts??異붽??섏? ?딆쓬 (?좏겙 ??퉬 ?놁쓬)

// Emotion key ??English label mapping ??PAD model
const EMOTION_EN_LABELS: Record<string, string> = {
  e1: 'valence', e2: 'trust', e3: 'dominance', e4: 'arousal', e5: 'attachment'
};

function buildEmotionToneHint(
  characters: StoryCharacter[],
  currentEmotions: Record<number, EditorEmotions>,
  language: string = 'ko',
): string {
  const hints: string[] = [];
  const inst = getTurnInstructions(language);
  const labels = EMOTION_LABELS_BY_LANG[language] ?? EMOTION_LABELS_BY_LANG['en'];

  for (const c of characters) {
    if (c.id < 2) continue; // narrator(0), user(1) ?쒖쇅
    const e = currentEmotions[c.id] ?? c.initialEmotions;
    if (!e) continue;
    // emotionAnalysis: softmax 1?뚮줈 dominant + entropy ?숈떆 怨꾩궛
    const { key, prob, entropy } = emotionAnalysis(e);
    if (entropy >= 1.5) {
      // H ??1.5: ?щ윭 媛먯젙???쇱옱 ?? ?댁쟻 媛덈벑 ?쒗쁽 ?붿껌
      hints.push(`  ${c.name}(CHAR ${c.id}): ${inst.emotion.complex}`);
    } else if (prob >= 0.65) {
      // 吏諛?媛먯젙??65% ?댁긽: ?⑥씪 媛먯젙 媛뺣룄 ?뚰듃
      // labels?먯꽌 ?대떦 ?ㅼ쓽 ?ㅻ챸??異붿텧?섍굅??fallback
      const labelMatch = labels.match(new RegExp(`${key}=([^\\s()]+)`));
      const label = labelMatch ? labelMatch[1] : key;
      hints.push(`  ${c.name}(CHAR ${c.id}): ${inst.emotion.dominant} (${label})`);
    }
  }
  return hints.length > 0 ? `[${inst.emotion.tone}]\n${hints.join('\n')}` : '';
}

// BM25 lore lookup is handled outside PromptEngine.

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 4. 梨뺥꽣 ?명듃濡?硫붿떆吏
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export interface ChatInitMessage {
  id: string;
  speaker: number;
  speakerName: string;
  type: 'narrator' | 'user' | 'character' | 'image';
  content: string;
  imageUrl?: string;
  isIntro: true;
}

export function buildIntroMessages(
  config: StoryConfig,
  chapterId: string,
  userName: string = ''
): ChatInitMessage[] {
  const chapter = config.chapters.find(c => c.id === chapterId);
  if (!chapter) return [];
  const sub = (text: string) => applyUserName(text, userName);

  return (chapter.intro ?? []).map((msg, i) => {
    if (msg.speakerType === 'narrator') return {
      id: `intro_${chapterId}_${i}`, speaker: 0, speakerName: 'Narrator',
      type: 'narrator' as const, content: sub(msg.content), isIntro: true as const
    };
    if (msg.speakerType === 'user') return {
      id: `intro_${chapterId}_${i}`, speaker: 1, speakerName: userName || 'Me',
      type: 'user' as const, content: sub(msg.content), isIntro: true as const
    };
    if (msg.speakerType === 'character') {
      const char = config.characters.find(c => c.id === msg.speakerCharId);
      return {
        id: `intro_${chapterId}_${i}`, speaker: msg.speakerCharId ?? 2,
        speakerName: sub(char?.name ?? '?'),
        type: 'character' as const, content: sub(msg.content), isIntro: true as const
      };
    }
    return {
      id: `intro_${chapterId}_${i}`, speaker: 0, speakerName: '',
      type: 'image' as const, content: sub(msg.content),
      imageUrl: msg.imageUrl, isIntro: true as const
    };
  });
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 5. ?쒕쾭 emotion-sync ?? ?고????덈뙎媛?state
//
// 寃곌낵???덈뙎媛? buildTurnPrompt currentEmotions???ｌ쑝硫???
//    updateEmotions(delta?꾩쟻)???ｌ쑝硫??댁쨷 ?곸슜!
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export function buildRuntimeEmotions(
  syncStates: EmotionSyncState[]
): Record<number, EditorEmotions> {
  const result: Record<number, EditorEmotions> = {};
  for (const s of syncStates) {
    result[s.char_index] = { e1: s.e1, e2: s.e2, e3: s.e3, e4: s.e4, e5: s.e5 };
  }
  return result;
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 6. AI ?묐떟 ?뚯떛 ?? delta 異붿텧
//
// 諛섑솚? delta(?곷?媛?. ?덈뙎媛?state???뷀빐??媛깆떊.
//    ?덈뙎媛믪쓣 updateEmotions???ｌ쑝硫??댁쨷 ?곸슜!
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export interface EmotionDelta {
  charId: number;
  deltas: Partial<EditorEmotions>;
}

// "@2:e1+3|e4-2" ?? [{charId:2, deltas:{e1:3, e4:-2}}]
// 媛숈? 罹먮┃???щ윭 以꾩씠硫??⑹궛
export function parseEmotionLines(rawLines: string[]): EmotionDelta[] {
  const map: Record<number, Partial<EditorEmotions>> = {};
  for (const line of rawLines) {
    if (!line.startsWith('@')) continue;
    const match = line.match(/@(\d+):(.+)/);
    if (!match) continue;
    const charId = parseInt(match[1], 10);
    if (Number.isNaN(charId)) continue;  // [BUG FIX B] 鍮꾩젙??charId 臾댁떆
    if (!map[charId]) map[charId] = {};
    const parts = match[2].split('|');
    for (const part of parts) {
      const m = part.trim().match(/(e\d+)([+-]?\d+)/);
      if (m) {
        const key = m[1] as keyof EditorEmotions;
        const parsed = parseInt(m[2], 10);
        // [BUG FIX B] NaN 諛⑹뼱: parseInt ?ㅽ뙣 ???대떦 ?꾨뱶 ?ㅽ궢.
        // NaN + number = NaN???꾪뙆?섎㈃ 媛먯젙 ?섏튂媛 ?곴뎄?곸쑝濡?NaN????
        if (!Number.isNaN(parsed)) {
          const entry = map[charId] as Partial<EditorEmotions>;
          const cur = (entry[key] ?? 0) as number;
          (entry[key] as number) = Number.isNaN(cur) ? parsed : cur + parsed;
        }
      }
    }
  }
  return Object.entries(map).map(([charIdStr, deltas]) => ({
    charId: Number(charIdStr), deltas
  })).filter(d => Object.keys(d.deltas).length > 0);
}

// delta ?? ?덈뙎媛?state ?곸슜 (-100~+100 ?대옩??
export function applyEmotionDeltas(
  current: Record<number, EditorEmotions>,
  deltas: EmotionDelta[]
): Record<number, EditorEmotions> {
  const updated = { ...current };
  for (const { charId, deltas: d } of deltas) {
    if (!updated[charId]) continue;
    const e = { ...updated[charId] };
    for (const key of ['e1', 'e2', 'e3', 'e4', 'e5'] as (keyof EditorEmotions)[]) {
      if (d[key] !== undefined) {
        e[key] = Math.max(-100, Math.min(100, e[key] + (d[key] as number)));
      }
    }
    updated[charId] = e;
  }
  return updated;
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 7. AI delta + ?좏깮吏 ?④낵 ?⑹궛 (寃뱀묠 諛⑹? ?듭떖)
//
// ?ъ슜 ?쒖젏: ?좏깮吏 ?좏깮 ??泥?AI ?묐떟 ?꾩갑 ??// ?먮쫫:
//   1. Defer choice side effects until the next turn is actually applied.
//   2. AI ?묐떟 ?꾩갑 ?? parseEmotionLines濡?aiDeltas 異붿텧
//   4. applyEmotionDeltas濡???踰덈쭔 ?곸슜
//   5. pending 珥덇린??// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export function checkTrigger(
  triggers: EditorTrigger[],
  turnCount: number,
  currentEmotions: Record<number, EditorEmotions>,
  remainingTokens: number
): boolean {
  return triggers.some(t => {
    if (t.type === 'conversation') return turnCount >= (t.convCount ?? 9999);
    // [BUG-19 FIX] remainingTokens媛 0 ?먮뒗 ?뚯닔????而⑦뀓?ㅽ듃 媛??李? 諛섎뱶??諛쒕룞
    if (t.type === 'cache') return remainingTokens <= 0 || remainingTokens < 5000;
    if (t.type === 'emotion' && t.emotionChar != null && t.emotionCode) {
      const emotions = currentEmotions[t.emotionChar];
      const val = emotions?.[t.emotionCode as keyof EditorEmotions] ?? 0;
      const target = t.emotionValue ?? 0;
      if (t.emotionDir === 'above') return val >= target;
      if (t.emotionDir === 'below') return val <= target;
      // [BUG FIX] 'reach' 짹2 洹쇱궗 踰붿쐞 ???꾨떖 ?먯젙
      if (t.emotionDir === 'reach') return Math.abs(val - target) <= 2;
    }
    return false;
  });
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 9. ?좏깮吏 ?대깽??議곌굔 泥댄겕
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export function checkChoiceEvents(
  choiceEvents: ChoiceEvent[],
  turnCount: number,
  currentEmotions: Record<number, EditorEmotions>,
  remainingTokens: number,
  firedChoiceIds: Set<string>
): ActiveChoiceEvent | null {
  for (const evt of choiceEvents) {
    if (firedChoiceIds.has(evt.id)) continue;
    const triggered = checkTrigger(evt.triggerConditions, turnCount, currentEmotions, remainingTokens);
    if (triggered && evt.options.length >= 2) {
      return { choiceEventId: evt.id, prompt: evt.prompt, options: evt.options };
    }
  }
  return null;
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// 10. ?좏깮吏 媛먯젙 ?④낵 ?낅┰ ?곸슜
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export function estimateTokens(text: string): number {
  const korean = (text.match(/[가-힣]/g) ?? []).length;
  const english = (text.match(/[a-zA-Z]+/g) ?? []).length;
  const numbers = (text.match(/\d/g) ?? []).length;
  const special = (text.match(/[^가-힣a-zA-Z0-9\s]/g) ?? []).length;
  return Math.ceil(korean * 0.7 + english * 1.3 + numbers * 0.5 + special * 0.3);
}

export interface AIOutputMessage {
  speaker: number;
  content: string;
}

export interface AIOutputResult {
  messages: AIOutputMessage[];
  emotionDeltas: EmotionDelta[];
  isFiltered: boolean;   // true硫?contentFiltered 硫붿떆吏留??쒖떆
}

/** 肄섑뀗痢??꾪꽣 ?좏샇 媛먯? - ?ㅼ씠?곕툕媛 蹂대궡???⑦꽩??*/
const FILTER_SIGNALS = [
  'BLOCKED', 'FILTERED', 'CONTENT_FILTER',
  '__BLOCKED__', '__FILTERED__',
];

export function parseAIOutput(
  raw: string,
  isFilteredSignal?: boolean,
): AIOutputResult {
  // ?? ?꾪꽣 媛먯? ?????????????????????????????????????????????
  const upperRaw = raw.trim().toUpperCase();
  const isFiltered =
    isFilteredSignal === true ||
    FILTER_SIGNALS.some(sig => upperRaw === sig || upperRaw.startsWith(sig));

  if (isFiltered || !raw.trim()) {
    return { messages: [], emotionDeltas: [], isFiltered: isFiltered || !raw.trim() };
  }

  const lines = raw.split('\n');
  const messages: AIOutputMessage[] = [];
  const emotionDeltas: EmotionDelta[] = [];

  let currentSpeaker = -1;
  let currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentSpeaker < 0 || currentLines.length === 0) return;
    const content = currentLines.join('\n').trim();
    if (content) messages.push({ speaker: currentSpeaker, content });
    currentLines = [];
  };

  const META_LINE_RE = /^(?:speaker(?:id|name)?|characterid|emotion|metadata|meta|role|narration)\s*:/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (META_LINE_RE.test(trimmed)) continue;

    // 媛먯젙 ?쇱씤 "@2:e1+3|e4-2"
    if (trimmed.startsWith('@')) continue;

    // ?붿옄 ?쇱씤 "2:?댁슜" ?먮뒗 "0:?댁슜"
    const speakerMatch = trimmed.match(/^(\d+):(.*)/s);
    if (speakerMatch) {
      flushCurrent();
      const speakerContent = speakerMatch[2].trim();
      // [BUG FIX] ?붿옄 ?쇱씤 ?댁슜??鍮꾩뼱?덉쑝硫?currentSpeaker留?援먯껜?섍퀬 ?댁슜 ?놁쓬
      // 湲곗〈: 鍮??댁슜?쇰줈 currentSpeaker ?명똿 ???ㅼ쓬 以꾩씠 ?놁쑝硫?鍮?content 留먰뭾???앹꽦
      currentSpeaker = parseInt(speakerMatch[1], 10);
      if (speakerContent) currentLines.push(speakerContent);
      continue;
    }

    // ?щ㎎ ?녿뒗 以??? ?꾩옱 ?붿옄???댁뼱遺숈씠嫄곕굹 ?섎젅?댁뀡(0)?쇰줈
    if (currentSpeaker >= 0) {
      currentLines.push(trimmed);
    } else {
      // ?꾩쭅 ?붿옄 ?놁쓬 ?? ?섎젅?댁뀡?쇰줈 ?쒖옉
      currentSpeaker = 0;
      currentLines.push(trimmed);
    }
  }
  flushCurrent();
  if (messages.length === 0 && raw.trim()) {
    messages.push({ speaker: 0, content: raw.trim() });
  }

  // ?뚮젅?댁뼱(1) 以꾩? ?쒓굅 (AI媛 ?ㅼ닔濡??앹꽦?섎뒗 寃쎌슦 諛⑹뼱)
  // [BUG FIX] 湲곗〈: filtered媛 鍮꾨㈃ ?먮낯 messages(1踰??ы븿) 諛섑솚
  //           ?섏젙: ??긽 filtered ?ъ슜. 1踰덈쭔 ?덉쑝硫?鍮?諛곗뿴 諛섑솚.
  const filtered = messages.filter(m => m.speaker !== 1);

  return {
    messages: filtered,
    emotionDeltas,
    isFiltered: false
  };
}

export function buildKVChapterPrompt(
  chapter: StoryChapter | null | undefined,
  chapterIndexOrOptions?: number | KVChapterPromptOptions,
): string {
  if (!chapter) return '';
  const options = normalizeKVChapterPromptOptions(chapterIndexOrOptions);
  const parts: string[] = [];
  const isFirstChapter = options.chapterIndex !== undefined ? options.chapterIndex === 0 : false;
  if (!isFirstChapter && options.storyLogBlock?.trim()) {
    parts.push(options.storyLogBlock.trim());
  }
  if (chapter.chapterInfo?.trim()) {
    parts.push(`[SCENE]\n${chapter.chapterInfo.trim()}`);
  }
  const goalLines: string[] = [];
  if (chapter.aiGoal?.trim()) {
    goalLines.push(`AI: ${chapter.aiGoal.trim()}`);
  }
  for (const [id, goal] of Object.entries(chapter.characterGoals ?? {})) {
    if (typeof goal === 'string' && goal.trim()) {
      goalLines.push(`CHAR${id}: ${goal.trim()}`);
    }
  }
  if (goalLines.length > 0) {
    parts.push(`[GOALS]\n${goalLines.join('\n')}`);
  }
  return parts.join('\n\n');
}

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// ?좏겙 ??異붿젙 ?좏떥 ?????뱀뀡 10??estimateTokens()? ?숈씪
// 援щ쾭??/\d+/g 怨쇱냼怨꾩궛) ?쒓굅, ?섏젙??踰꾩쟾(/\d/g)?쇰줈 ?듯빀
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// ?ㅺ뎅??媛먯젙 ?쇰꺼 (援?PromptBuilder.emotionsByLang ?듯빀)
// buildSystemPrompt???곸뼱 怨좎젙?댁?留?
// ?ㅺ뎅??UI/?먮뵒???깆뿉??媛먯젙 ?ㅻ챸???꾩슂?????ъ슜
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

export const EMOTION_LABELS_BY_LANG: Record<string, string> = {
  ko: 'e1=Valence(부정↔긍정) e2=Trust(불신↔신뢰) e3=Dominance(복종↔지배) e4=Arousal(차분↔흥분) e5=Attachment(냉담↔친밀)',
  en: 'e1=Valence(neg↔pos) e2=Trust(distrust↔trust) e3=Dominance(submissive↔dominant) e4=Arousal(calm↔excited) e5=Attachment(detached↔attached)',
  ja: 'e1=感情価(否定↔肯定) e2=信頼(不信↔信頼) e3=支配性(服従↔支配) e4=覚醒(冷静↔興奮) e5=愛着(冷淡↔親密)',
  zh: 'e1=情感价(负面↔正面) e2=信任(不信↔信任) e3=支配性(服从↔支配) e4=唤起(平静↔兴奋) e5=依恋(冷淡↔亲密)',
};