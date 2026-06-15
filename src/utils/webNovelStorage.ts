/* eslint-disable @typescript-eslint/no-unused-vars */
import { mmkv } from './storage';
import { db } from '../core/sqlite/Database';

// ─────────────────────────────────────────────────────────────────────────────
//  webNovelStorage  v2
//
//  추가된 것:
//  • StoredWebNovel.desc, StoredWebNovel.tags — 시놉시스/태그 저장
//  • getSeriesFinalEmotions() — 직전 화의 finalEmotions 반환 (시리즈 연속성)
//  • getWebNovelsByStory() 정렬 보장 (episodeNumber asc)
// ─────────────────────────────────────────────────────────────────────────────

export interface WNEmotions {
  e1: number; // 호감/애정
  e2: number; // 기쁨/행복
  e3: number; // 분노/적대
  e4: number; // 슬픔/비통
  e5: number; // 공포/불안
}

export interface WNParagraph {
  id:   number;
  text: string;
}

export type WNEmotionData = Record<number, Record<number, Partial<WNEmotions>>>;

export interface WNCharacter {
  id:          number;
  name:        string;
  imageUri?:   string;
  role?:       string;
  description?: string;
  age?:        string;
  gender?:     string;
  appearance?: string;
  personality?: string;
  traits?:     string;
}

export interface StoredWebNovel {
  id:              string;
  storyId:         string;        // 시리즈 그룹 ID
  episodeNumber?:  number;        // 화수 (내부 정렬용)
  title:           string;        // 에피소드 제목
  desc?:           string;        // [v2] 시놉시스
  tags?:           string[];      // [v2] 장르 태그
  createdAt:       number;
  paragraphs:      WNParagraph[];
  emotionData:     WNEmotionData;
  initialEmotions: Record<number, WNEmotions>;
  characters:      WNCharacter[];
  prefixEmotions:  Record<number, Record<number, WNEmotions>>;
  finalEmotions?:  Record<number, WNEmotions>;
}

const LIST_KEY = 'webnovel:list';
const ITEM_KEY = (id: string) => `webnovel:item:${id}`;
const MAX_NOVELS = 50;

function clamp(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

// ─ 초기 감정 슬롯: -1 대신 initialEmotions 필드 직접 사용
export const WN_INITIAL_EMOTIONS_KEY = -1 as const; // @deprecated

export function buildPrefixEmotions(
  paragraphs:      WNParagraph[],
  emotionData:     WNEmotionData,
  initialEmotions: Record<number, WNEmotions>,
  characters:      WNCharacter[],
): Record<number, Record<number, WNEmotions>> {
  const result: Record<number, Record<number, WNEmotions>> = {};

  // 초기 슬롯
  result[WN_INITIAL_EMOTIONS_KEY] = {};
  for (const c of characters) {
    result[WN_INITIAL_EMOTIONS_KEY][c.id] = {
      ...(initialEmotions[c.id] ?? { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 }),
    };
  }

  // 현재 감정 상태 복사
  const current: Record<number, WNEmotions> = {};
  for (const c of characters) {
    current[c.id] = { ...result[WN_INITIAL_EMOTIONS_KEY][c.id] };
  }

  for (const para of paragraphs) {
    const deltas = emotionData[para.id];
    if (deltas) {
      for (const c of characters) {
        const d = deltas[c.id];
        if (!d) continue;
        current[c.id] = {
          e1: clamp((current[c.id]?.e1 ?? 0) + (d.e1 ?? 0)),
          e2: clamp((current[c.id]?.e2 ?? 0) + (d.e2 ?? 0)),
          e3: clamp((current[c.id]?.e3 ?? 0) + (d.e3 ?? 0)),
          e4: clamp((current[c.id]?.e4 ?? 0) + (d.e4 ?? 0)),
          e5: clamp((current[c.id]?.e5 ?? 0) + (d.e5 ?? 0)),
        };
      }
    }
    result[para.id] = {};
    for (const c of characters) {
      result[para.id][c.id] = { ...current[c.id] };
    }
  }

  return result;
}

export function saveWebNovel(
  novel: Omit<StoredWebNovel, 'prefixEmotions' | 'finalEmotions'>,
): StoredWebNovel {
  const prefixEmotions = buildPrefixEmotions(
    novel.paragraphs,
    novel.emotionData,
    novel.initialEmotions,
    novel.characters,
  );

  const maxParaId    = (novel.paragraphs ?? []).reduce((mx, p) => Math.max(mx, p.id), -1);
  const finalEmotions = prefixEmotions[maxParaId] ?? prefixEmotions[-1] ?? {};

  const full: StoredWebNovel = { ...novel, prefixEmotions, finalEmotions };

  const list = getWebNovelList();
  const existingIdx = list.findIndex(item => item.id === novel.id);
  const metadata = {
    id:        novel.id,
    storyId:   novel.storyId,
    title:     novel.title,
    createdAt: novel.createdAt,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = metadata;
  } else {
    list.unshift(metadata);
    if (list.length > MAX_NOVELS) {
      const evicted = list.pop();
      if (evicted) mmkv.remove(ITEM_KEY(evicted.id));
    }
  }

  mmkv.set(LIST_KEY, JSON.stringify(list));
  mmkv.set(ITEM_KEY(novel.id), JSON.stringify(full));

  indexWebNovel(full);

  return full;
}

// ─────────────────────────────────────────────────────────────────────────────
//  getSeriesFinalEmotions
//  시리즈에서 직전 화(episodeNumber - 1)의 finalEmotions를 반환
//  → 다음 화 생성 프롬프트에 "이전 화 감정 상태 이어받기" 가능
// ─────────────────────────────────────────────────────────────────────────────
export function getSeriesFinalEmotions(
  storyId:         string,
  prevEpisodeNum:  number,
): Record<number, WNEmotions> | null {
  const novels = getWebNovelsByStory(storyId);
  const prev   = novels.find(n => n.episodeNumber === prevEpisodeNum);
  return prev?.finalEmotions ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function indexWebNovel(novel: StoredWebNovel) {
  try {
    const chapterId = `webnovel:${novel.id}`;
    await db.runRaw('DELETE FROM conversations WHERE chapter_id = ?', [chapterId]);

    for (const para of novel.paragraphs) {
      if (!para.text.trim()) continue;
      await db.runRaw(
        `INSERT INTO conversations (story_id, chapter_id, speaker_id, speaker_type, content, importance_score, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [novel.storyId, chapterId, 'narrator', 'system', para.text, 7, novel.createdAt + para.id],
      );
    }
  } catch (err) {
    if (__DEV__) console.warn('[indexWebNovel] Failed:', err);
  }
}

export function getWebNovelList(): Array<{
  id: string; storyId: string; title: string; createdAt: number;
}> {
  try {
    const raw = mmkv.getString(LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getWebNovel(id: string): StoredWebNovel | null {
  try {
    const raw = mmkv.getString(ITEM_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** storyId 기준으로 에피소드 오름차순 반환 */
export function getWebNovelsByStory(storyId: string): StoredWebNovel[] {
  const list    = getWebNovelList();
  const results: StoredWebNovel[] = [];

  for (const meta of list) {
    if (meta.storyId !== storyId) continue;
    const novel = getWebNovel(meta.id);
    if (novel) results.push(novel);
  }

  return results.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
}

export function deleteWebNovel(id: string) {
  const list = getWebNovelList().filter(item => item.id !== id);
  mmkv.set(LIST_KEY, JSON.stringify(list));
  mmkv.remove(ITEM_KEY(id));
}

export function deleteWebNovels(ids: string[]) {
  const set  = new Set(ids);
  const list = getWebNovelList().filter(item => !set.has(item.id));
  mmkv.set(LIST_KEY, JSON.stringify(list));
  ids.forEach(id => mmkv.remove(ITEM_KEY(id)));
}
