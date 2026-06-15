export type StoryStylePresetId = 'classic' | 'modern';

type TranslationLike = Record<string, string | undefined> | null | undefined;

const STYLE_PRESET_LABEL_KEYS: Record<StoryStylePresetId, string> = {
  classic: 'stylePresetClassic',
  modern: 'stylePresetModern',
};

const STYLE_PRESET_LABEL_FALLBACKS: Record<StoryStylePresetId, string> = {
  classic: 'Classic / Wuxia / Archaic',
  modern: 'Modern / Daily / Colloquial',
};

const STYLE_PRESET_ALIASES: Record<string, StoryStylePresetId> = {
  classic: 'classic',
  wuxia: 'classic',
  period: 'classic',
  historical: 'classic',
  gore: 'classic',
  archaic: 'classic',
  period_gore: 'classic',
  modern: 'modern',
  daily: 'modern',
  colloquial: 'modern',
  casual: 'modern',
  contemporary: 'modern',
  slice_of_life: 'modern',
  everyday: 'modern',
  modern_daily: 'modern',
};

function isStoryStylePresetId(value: string): value is StoryStylePresetId {
  return value === 'classic' || value === 'modern';
}

function slugifyStylePresetValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/\/+/g, '_')
    .replace(/__+/g, '_');
}

export function normalizeStoryStylePreset(value?: string | null): StoryStylePresetId | '' {
  if (typeof value !== 'string') return '';
  const normalized = slugifyStylePresetValue(value);
  if (!normalized) return '';
  if (isStoryStylePresetId(normalized)) return normalized;
  return STYLE_PRESET_ALIASES[normalized] ?? '';
}

export function getStoryStylePresetLabel(
  preset: string | null | undefined,
  t?: TranslationLike,
): string {
  const normalized = normalizeStoryStylePreset(preset);
  if (!normalized) return typeof preset === 'string' ? preset.trim() : '';

  const localizedLabel = t?.[STYLE_PRESET_LABEL_KEYS[normalized]]?.trim();
  return localizedLabel || STYLE_PRESET_LABEL_FALLBACKS[normalized];
}

export function getStoryStylePresetOptions(
  t?: TranslationLike,
): Array<{ id: StoryStylePresetId; label: string }> {
  return (['classic', 'modern'] as const).map((id) => ({
    id,
    label: getStoryStylePresetLabel(id, t),
  }));
}

export function buildStoryStylePresetPrompt(preset?: string | null): string {
  const normalized = normalizeStoryStylePreset(preset);
  if (!normalized) return '';

  if (normalized === 'classic') {
    return [
      '[STYLE PRESET]',
      'Keep the selected genre unchanged, but write in a stylized wuxia / period-drama / archaic register.',
      'Favor formal phrasing, heavier dramatic cadence, and vivid old-world flavor.',
    ].join('\n');
  }

  return [
    '[STYLE PRESET]',
    'Keep the selected genre unchanged, but write in a modern everyday colloquial register.',
    'Favor natural contemporary speech, light daily-life phrasing, and straightforward readability.',
  ].join('\n');
}
