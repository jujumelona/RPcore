import type { FormData } from './AIStoryChatScreen.types';
import { normalizeStoryGenre } from '../utils/storyGenres';
import { normalizeStoryStylePreset } from '../utils/storyStylePresets';

type KvMap = Record<string, string>;

type IntroMessage = {
  speakerType: 'narrator' | 'user' | 'character';
  speakerCharId?: number;
  speakerName?: string;
  content: string;
};

const KEY_LINE_RE = /^([A-Z][A-Z0-9_]{1,80})\s*:\s*(.*)$/;

function normalizeKey(rawKey: string): string {
  return rawKey
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '')
    .replace(/^CH(\d+)/, 'CH_$1')
    .replace(/^CHAR(\d+)/, 'CHAR_$1')
    .replace(/_+/g, '_');
}

function normalizeText(raw: string): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\uFEFF/g, '');
}

function looksLikeNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return /^(?:```|---+|===+|#+\s|\/\*|\*\/|\*\s)/.test(trimmed);
}

function parseKv(raw: string): KvMap {
  const kv: KvMap = {};
  let currentKey = '';

  for (const sourceLine of normalizeText(raw).split('\n')) {
    const line = sourceLine.trim();
    if (looksLikeNoise(line)) continue;

    const cleaned = line
      .replace(/^[-*>\s]+/, '')
      .replace(/^\*\*([A-Z0-9_]+)\*\*\s*:/, '$1:');

    const match = cleaned.match(KEY_LINE_RE);
    if (match) {
      currentKey = normalizeKey(match[1]);
      kv[currentKey] = match[2].trim();
      continue;
    }

    if (currentKey) {
      kv[currentKey] = `${kv[currentKey]} ${cleaned}`.trim();
    }
  }

  return kv;
}

function parsePositiveInt(raw: string | undefined, fallback: number, minimum = 1): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

function parseGender(raw: string): string {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return '';
  if (/(female|woman|girl|여|여성)/.test(value)) return 'female';
  if (/(male|man|boy|남|남성)/.test(value)) return 'male';
  if (/(other|nonbinary|기타)/.test(value)) return 'other';
  return raw.trim();
}

function splitPipe(raw: string): string[] {
  return String(raw ?? '')
    .split('|')
    .map((part) => part.trim());
}

function normalizeTargetChapter(raw: string, fallbackChapter: number): string {
  const trimmed = String(raw ?? '').trim();
  const explicit = trimmed.match(/(?:CH|chapter)[_\s-]?(\d+)/i);
  if (explicit) return `chapter_${explicit[1]}`;

  const numeric = trimmed.match(/^(\d+)$/);
  if (numeric) return `chapter_${numeric[1]}`;

  return `chapter_${fallbackChapter}`;
}

function parseEventValue(raw: string, fallbackChapter: number): { label: string; targetChapterId: string } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { label: '', targetChapterId: `chapter_${fallbackChapter}` };
  }

  const lastPipe = trimmed.lastIndexOf('|');
  if (lastPipe > -1) {
    const label = trimmed.slice(0, lastPipe).trim();
    const target = trimmed.slice(lastPipe + 1).trim();
    return {
      label,
      targetChapterId: normalizeTargetChapter(target, fallbackChapter),
    };
  }

  return {
    label: trimmed,
    targetChapterId: `chapter_${fallbackChapter}`,
  };
}

function parseIntroMessage(raw: string): IntroMessage | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.startsWith('@')) return null;

  const match = trimmed.match(/^(\d+)\s*:\s*(.*)$/);
  if (!match) {
    return { speakerType: 'narrator', content: trimmed };
  }

  const speakerId = Number.parseInt(match[1], 10);
  const content = match[2].trim();
  if (!content) return null;

  if (speakerId === 1) {
    return { speakerType: 'user', speakerCharId: 1, content };
  }

  if (speakerId >= 2) {
    return {
      speakerType: 'character',
      speakerCharId: speakerId,
      content,
    };
  }

  return { speakerType: 'narrator', speakerCharId: 0, content };
}

export function parseResponse(raw: string, form: FormData): Record<string, unknown> {
  const kv = parseKv(raw);
  const kvKeys = Object.keys(kv);

  const aiCharCount = kvKeys.reduce((max, key) => {
    const match = key.match(/^CHAR_(\d+)(?:_|$)/);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  const charCount = aiCharCount || parsePositiveInt(form.charCount, 2);

  const aiChapterCount = kvKeys.reduce((max, key) => {
    const match = key.match(/^CH_(\d+)(?:_|$)/);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  const chapterCount = aiChapterCount || parsePositiveInt(form.chapterCount, 5, 2);

  const userParts = splitPipe(kv.USER);
  const userSetting = {
    name: '',
    age: userParts[1]?.replace(/[^0-9]/g, '') || form.user.age || '',
    gender: parseGender(userParts[2] || form.user.gender || ''),
    traits: userParts[3] || form.user.traits || '',
    description: userParts.slice(4).join(' | ') || form.user.description || '',
  };

  const characters = Array.from({ length: charCount }, (_, index) => {
    const n = index + 1;
    const fallbackCombined = splitPipe(kv[`CHAR_${n}`]);
    const name = kv[`CHAR_${n}_NAME`] || fallbackCombined[0] || form.chars[index]?.name || `캐릭터 ${n}`;
    const age = (kv[`CHAR_${n}_AGE`] || fallbackCombined[1] || form.chars[index]?.age || '').replace(/[^0-9]/g, '');
    const gender = parseGender(kv[`CHAR_${n}_GENDER`] || fallbackCombined[2] || form.chars[index]?.gender || '');
    const appearance = kv[`CHAR_${n}_APP`] || form.chars[index]?.traits || '';
    const personality = kv[`CHAR_${n}_PER`] || fallbackCombined.slice(3).join(' | ') || form.chars[index]?.personality || '';
    const example = kv[`CHAR_${n}_EX`] || form.chars[index]?.personalityExample || '';

    return {
      id: index + 2,
      name,
      profileUrl: '',
      profile_url: '',
      personality,
      personalityExample: example,
      speech: example,
      speech_pattern: example,
      speechPattern: example,
      age,
      gender,
      traits: appearance,
      appearance,
      description: personality,
      setting: personality,
      imageUris: [],
    };
  });

  const introMessagesMap: Record<string, IntroMessage[]> = {};

  const chapters = Array.from({ length: chapterCount }, (_, index) => {
    const n = index + 1;
    const chapterId = `chapter_${n}`;
    const introMessages = kvKeys
      .filter((key) => key.startsWith(`CH_${n}_INTRO_LINE_`))
      .sort((a, b) => {
        const aNum = Number.parseInt(a.split('_').pop() || '0', 10);
        const bNum = Number.parseInt(b.split('_').pop() || '0', 10);
        return aNum - bNum;
      })
      .map((key) => parseIntroMessage(kv[key]))
      .filter((message): message is IntroMessage => Boolean(message));

    introMessagesMap[chapterId] = introMessages;

    const isEndingRaw = String(kv[`CH_${n}_IS_ENDING`] || '').trim().toUpperCase();
    const isEnding = isEndingRaw === 'YES' || isEndingRaw === 'TRUE' || isEndingRaw === '1';

    const eventPrompt = kv[`CH_${n}_EVT_P`] || '';
    const eventA = parseEventValue(kv[`CH_${n}_EVT_A`], Math.min(n + 1, chapterCount));
    const eventB = parseEventValue(kv[`CH_${n}_EVT_B`], Math.min(n + 2, chapterCount));

    const choiceEvents = !isEnding && (eventA.label || eventB.label)
      ? [{
          id: `choice_ch${n}_1`,
          prompt: eventPrompt,
          triggerConditions: [{ type: 'cache' as const }],
          options: [
            {
              id: `opt_ch${n}_a`,
              label: eventA.label || 'Choice A',
              targetChapterId: eventA.targetChapterId,
            },
            {
              id: `opt_ch${n}_b`,
              label: eventB.label || 'Choice B',
              targetChapterId: eventB.targetChapterId,
            },
          ],
        }]
      : [];

    const characterGoals = Array.from({ length: charCount }, (_, charIndex) => charIndex + 2)
      .reduce<Record<number, string>>((acc, charId) => {
        const value = kv[`CH_${n}_GOAL_${charId}`];
        if (value) acc[charId] = value;
        return acc;
      }, {});

    return {
      id: chapterId,
      title: kv[`CH_${n}_TITLE`] || `Chapter ${n}`,
      aiGoal: kv[`CH_${n}_AIM`] || '',
      chapterInfo: kv[`CH_${n}_INFO`] || '',
      prevSummary: kv[`CH_${n}_PREV`] || kv[`CH_${n}_SUMMARY`] || '',
      characterGoals,
      triggers: [{ type: 'cache' as const }],
      choiceEvents,
      isEnding,
      introMessages,
    };
  });

  return {
    storyTitle: kv.TITLE || form.title || '',
    storyDesc: kv.DESC || '',
    storyHashtag: kv.TAGS || '',
    storyGenre: normalizeStoryGenre(form.genre) || form.genre || '',
    storyStylePreset: normalizeStoryStylePreset(form.stylePreset) || form.stylePreset || '',
    worldSetting: kv.WORLD || form.worldSetting || '',
    userSetting,
    characters,
    chapters,
    introMessages: introMessagesMap,
  };
}
