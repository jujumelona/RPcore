/* eslint-disable @typescript-eslint/no-unused-vars */
export type StoryGenreId =
  | 'romance'
  | 'fantasy'
  | 'modern'
  | 'martial_arts'
  | 'mystery'
  | 'thriller'
  | 'action'
  | 'adventure'
  | 'drama'
  | 'history'
  | 'daily'
  | 'etc'
  | 'school'
  | 'horror'
  | 'sf'
  | 'comedy'
  | 'period'
  | 'obsession'
  | 'multiple'
  | 'tsundere';

type TranslationLike = Record<string, string | undefined> | null | undefined;

export const ALL_STORY_GENRE_IDS = [
  'romance',
  'fantasy',
  'modern',
  'martial_arts',
  'mystery',
  'thriller',
  'action',
  'adventure',
  'drama',
  'history',
  'daily',
  'etc',
  'school',
  'horror',
  'sf',
  'comedy',
  'period',
  'obsession',
  'multiple',
  'tsundere',
] as const satisfies readonly StoryGenreId[];

export const STORY_EDITOR_GENRE_IDS = [
  'romance',
  'fantasy',
  'modern',
  'martial_arts',
  'mystery',
  'thriller',
  'action',
  'adventure',
  'drama',
  'history',
  'daily',
  'etc',
] as const satisfies readonly StoryGenreId[];

export const AI_STORY_BUILDER_GENRE_IDS = [
  'fantasy',
  'romance',
  'action',
  'school',
  'mystery',
  'horror',
  'sf',
  'comedy',
  'period',
  'modern',
] as const satisfies readonly StoryGenreId[];

const GENRE_LABEL_KEYS: Record<StoryGenreId, string> = {
  romance: 'genreRomance',
  fantasy: 'genreFantasy',
  modern: 'genreModern',
  martial_arts: 'genreMartial',
  mystery: 'genreMystery',
  thriller: 'genreThriller',
  action: 'genreAction',
  adventure: 'genreAdventure',
  drama: 'genreDrama',
  history: 'genreHistory',
  daily: 'genreDaily',
  etc: 'genreEtc',
  school: 'genreSchool',
  horror: 'genreHorror',
  sf: 'genreSF',
  comedy: 'genreComedy',
  period: 'genrePeriod',
  obsession: 'genreObsession',
  multiple: 'genreMultiple',
  tsundere: 'genreTsundere',
};

const GENRE_FALLBACK_LABELS: Record<StoryGenreId, string> = {
  romance: 'Romance',
  fantasy: 'Fantasy',
  modern: 'Modern',
  martial_arts: 'Martial Arts',
  mystery: 'Mystery',
  thriller: 'Thriller',
  action: 'Action',
  adventure: 'Adventure',
  drama: 'Drama',
  history: 'History',
  daily: 'Daily',
  etc: 'Etc',
  school: 'School',
  horror: 'Horror',
  sf: 'Sci-Fi',
  comedy: 'Comedy',
  period: 'Period',
  obsession: 'Obsession',
  multiple: 'Multiple',
  tsundere: 'Tsundere',
};

const GENRE_ALIASES: Record<string, StoryGenreId> = {
  romance: 'romance',
  romantic: 'romance',
  'romance_fantasy': 'romance',
  '로맨스': 'romance',
  fantasy: 'fantasy',
  fantastical: 'fantasy',
  '판타지': 'fantasy',
  modern: 'modern',
  '현대': 'modern',
  '현대물': 'modern',
  martial: 'martial_arts',
  martial_arts: 'martial_arts',
  martialarts: 'martial_arts',
  wuxia: 'martial_arts',
  '무협': 'martial_arts',
  mystery: 'mystery',
  mistery: 'mystery',
  '미스터리': 'mystery',
  '미스테리': 'mystery',
  thriller: 'thriller',
  '스릴러': 'thriller',
  action: 'action',
  '액션': 'action',
  '무협/액션': 'action',
  '액션/무협': 'action',
  '무협_액션': 'action',
  '액션_무협': 'action',
  'action/martial': 'action',
  'martial/action': 'action',
  'action_martial': 'action',
  'martial_action': 'action',
  adventure: 'adventure',
  '모험': 'adventure',
  drama: 'drama',
  '드라마': 'drama',
  history: 'history',
  historical: 'history',
  '역사': 'history',
  daily: 'daily',
  slice_of_life: 'daily',
  '일상': 'daily',
  etc: 'etc',
  other: 'etc',
  others: 'etc',
  '기타': 'etc',
  school: 'school',
  academy: 'school',
  campus: 'school',
  '학원': 'school',
  '학원물': 'school',
  horror: 'horror',
  scary: 'horror',
  '호러': 'horror',
  '공포': 'horror',
  sf: 'sf',
  sci_fi: 'sf',
  'sci-fi': 'sf',
  'science_fiction': 'sf',
  'sciencefiction': 'sf',
  '과학소설': 'sf',
  comedy: 'comedy',
  comic: 'comedy',
  gag: 'comedy',
  '코미디': 'comedy',
  '개그': 'comedy',
  period: 'period',
  period_drama: 'period',
  '시대극': 'period',
  obsession: 'obsession',
  obsessive: 'obsession',
  '집착': 'obsession',
  multiple: 'multiple',
  poly: 'multiple',
  harem: 'multiple',
  '하렘': 'multiple',
  tsundere: 'tsundere',
  '츤데레': 'tsundere',
};

function isStoryGenreId(value: string): value is StoryGenreId {
  return (ALL_STORY_GENRE_IDS as readonly string[]).includes(value);
}

function slugifyGenreValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[()]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/\/+/g, '/')
    .replace(/__+/g, '_');
}

export function normalizeStoryGenre(value?: string | null): StoryGenreId | '' {
  if (typeof value !== 'string') return '';
  const normalized = slugifyGenreValue(value);
  if (!normalized) return '';
  if (isStoryGenreId(normalized)) return normalized;
  return GENRE_ALIASES[normalized] ?? '';
}

export function getStoryGenreLabel(
  genre: string | null | undefined,
  t?: TranslationLike,
): string {
  const normalized = normalizeStoryGenre(genre);
  if (!normalized) return typeof genre === 'string' ? genre.trim() : '';
  const labelKey = GENRE_LABEL_KEYS[normalized];
  return t?.[labelKey] ?? GENRE_FALLBACK_LABELS[normalized];
}

export function getStoryGenreOptions(
  ids: readonly StoryGenreId[],
  t?: TranslationLike,
): Array<{ id: StoryGenreId; label: string }> {
  return ids.map((id) => ({
    id,
    label: getStoryGenreLabel(id, t),
  }));
}
