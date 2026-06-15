import { LanguageCode, LANGUAGES } from '../i18n/languages';
import type { FormData } from './AIStoryChatScreen.types';

const FIELD_CAPS = {
  title: 120,
  genre: 60,
  stylePreset: 80,
  worldSetting: 700,
  tone: 120,
  extra: 500,
  charName: 60,
  charAge: 20,
  charGender: 30,
  charTraits: 180,
  charPersonality: 260,
  charExample: 220,
  userName: 60,
  userAge: 20,
  userGender: 30,
  userTraits: 180,
  userDescription: 260,
} as const;

const INTRO_LINE_COUNT = 12;

function cap(value: string | undefined | null, maxLen: number): string {
  if (!value) return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
}

function parsePositiveInt(raw: string | undefined, fallback: number, minimum = 1): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

function getLanguageLabel(lang: LanguageCode): string {
  const info = LANGUAGES[lang];
  return info ? `${info.nativeName} (${info.name})` : 'the user language';
}

function buildUserHint(form: FormData): string {
  const parts = [
    '{u}',
    cap(form.user.age, FIELD_CAPS.userAge),
    cap(form.user.gender, FIELD_CAPS.userGender),
    cap(form.user.traits, FIELD_CAPS.userTraits),
    cap(form.user.description, FIELD_CAPS.userDescription),
  ];
  return parts.join(' | ');
}

function buildCharacterTemplate(charCount: number, form: FormData): string[] {
  const lines: string[] = [];

  for (let index = 0; index < charCount; index += 1) {
    const char = form.chars[index];
    const n = index + 1;
    const hintParts = [
      cap(char?.name, FIELD_CAPS.charName),
      cap(char?.age, FIELD_CAPS.charAge),
      cap(char?.gender, FIELD_CAPS.charGender),
      cap(char?.traits, FIELD_CAPS.charTraits),
      cap(char?.personality, FIELD_CAPS.charPersonality),
      cap(char?.personalityExample, FIELD_CAPS.charExample),
    ].filter(Boolean);

    if (hintParts.length > 0) {
      lines.push(`# CHAR_${n}_HINT: ${hintParts.join(' | ')}`);
    }

    lines.push(`CHAR_${n}_NAME: `);
    lines.push(`CHAR_${n}_AGE: `);
    lines.push(`CHAR_${n}_GENDER: `);
    lines.push(`CHAR_${n}_APP: `);
    lines.push(`CHAR_${n}_PER: `);
    lines.push(`CHAR_${n}_EX: `);
  }

  return lines;
}

function buildChapterTemplate(chapterCount: number, charCount: number): string[] {
  const lines: string[] = [];

  for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
    lines.push(`CH_${chapter}_TITLE: `);
    lines.push(`CH_${chapter}_AIM: `);
    lines.push(`CH_${chapter}_INFO: `);

    for (let index = 0; index < charCount; index += 1) {
      const charId = index + 2;
      lines.push(`CH_${chapter}_GOAL_${charId}: `);
    }

    for (let line = 1; line <= INTRO_LINE_COUNT; line += 1) {
      lines.push(`CH_${chapter}_INTRO_LINE_${line}: `);
    }

    lines.push(`CH_${chapter}_EVT_P: `);
    lines.push(`CH_${chapter}_EVT_A: `);
    lines.push(`CH_${chapter}_EVT_B: `);
    lines.push(`CH_${chapter}_IS_ENDING: `);
  }

  return lines;
}

export function buildPrompt(form: FormData, lang: LanguageCode): string {
  const charCount = parsePositiveInt(form.charCount, 2);
  const chapterCount = parsePositiveInt(form.chapterCount, 5, 2);
  const languageLabel = getLanguageLabel(lang);

  const instructions = [
    'You are generating a branching interactive roleplay story package for a story editor.',
    'Follow every rule exactly.',
    '- Output only plain KEY: VALUE lines.',
    '- Do not output markdown fences, bullet lists, commentary, or explanations.',
    `- Write every VALUE in ${languageLabel}. Keep KEY names in English.`,
    '- Do not output emotion values, emotion delta lines, emotion effects, CHAR_*_EMO, EVT_*_EMO, or any line starting with @.',
    '- Intro lines must be scene/dialogue lines only.',
    '- Allowed intro line format: 0: narrator, 1: player only if truly necessary, 2+ : AI character dialogue.',
    '- You may use #action# and *thought* inside intro lines.',
    `- Generate intro lines for every chapter. Each chapter needs at least ${INTRO_LINE_COUNT} intro lines.`,
    '- The last intro line of each chapter must hand off naturally into the player\'s next response.',
    '- Every non-ending chapter must have exactly two choices: CH_N_EVT_A and CH_N_EVT_B.',
    '- Choice format must be: choice label | CH_targetNumber',
    '- Ending chapters must set CH_N_IS_ENDING: YES and leave CH_N_EVT_A / CH_N_EVT_B empty.',
    '- USER must follow this format exactly: {u} | age | gender | traits | description.',
    '',
    '[INPUT HINTS]',
    `TITLE_HINT: ${cap(form.title, FIELD_CAPS.title)}`,
    `GENRE_HINT: ${cap(form.genre.replace(/_/g, ' '), FIELD_CAPS.genre)}`,
    `STYLE_PRESET_HINT: ${cap(form.stylePreset, FIELD_CAPS.stylePreset)}`,
    `WORLD_HINT: ${cap(form.worldSetting, FIELD_CAPS.worldSetting)}`,
    `TONE_HINT: ${cap(form.tone, FIELD_CAPS.tone)}`,
    `EXTRA_HINT: ${cap(form.extra, FIELD_CAPS.extra)}`,
    `USER_HINT: ${buildUserHint(form)}`,
    `CHARACTER_COUNT: ${charCount}`,
    `CHAPTER_COUNT: ${chapterCount}`,
    '',
    '[OUTPUT TEMPLATE]',
    'TITLE: ',
    'DESC: ',
    'TAGS: ',
    'WORLD: ',
    'USER: ',
    ...buildCharacterTemplate(charCount, form),
    ...buildChapterTemplate(chapterCount, charCount),
  ];

  return instructions.join('\n');
}
