import { nanoid } from 'nanoid/non-secure';
import {
  StoredWebNovel,
  WNCharacter,
  WNEmotionData,
  WNEmotions,
  WNParagraph,
  saveWebNovel,
} from '../utils/webNovelStorage';
import { WNFormData } from './AIWebNovelChatScreen.types';

// ─────────────────────────────────────────────────────────────────────────────
//  parseWebNovelResponse  v2
//
//  변경 내역:
//  • CHAR_N_EMO 파이프(|) 포맷 파싱: e1:50|e2:40|e3:10|...
//  • CHAR_N_AGE, CHAR_N_GENDER 이미 지원 — 그대로 유지
//  • DESC / TAGS 저장 → StoredWebNovel 에 추가 (웹노벨 리스트/공유에 활용)
//  • 시리즈 storyId: formData.seriesId 우선, 없으면 최초 1화에서 생성 후 유지
//  • 멀티라인 WN_PARA 이어붙이기 버그 수정 (@ 또는 다음 키 만나기 전까지 누적)
//  • 에피소드 번호는 formData.currentEpisode 사용 (AI 응답에서 감지하지 않음)
//  • 제목은 AI가 생성한 것 또는 사용자 입력 그대로 사용 (화수 prefix 없음)
// ─────────────────────────────────────────────────────────────────────────────

const ZERO_EMOTIONS: WNEmotions = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };

const RE_CHAR_NAME   = /^CHAR_(\d+)_NAME:\s*(.*)$/;
const RE_CHAR_APP    = /^CHAR_(\d+)_APP:\s*(.*)$/;
const RE_CHAR_PER    = /^CHAR_(\d+)_PER:\s*(.*)$/;
const RE_CHAR_ROLE   = /^CHAR_(\d+)_ROLE:\s*(.*)$/;
const RE_CHAR_AGE    = /^CHAR_(\d+)_AGE:\s*(.*)$/;
const RE_CHAR_GENDER = /^CHAR_(\d+)_GENDER:\s*(.*)$/;
const RE_CHAR_EMO    = /^CHAR_(\d+)_EMO:\s*(.*)$/;
const RE_PARA        = /^WN_PARA_(\d+):\s*(.*)$/;
const RE_EMO_LINE    = /^@(\d+):\s*(.*)$/;

function cleanText(value?: string): string | undefined {
  const s = value?.trim();
  return s || undefined;
}

function buildDescription(c: Partial<WNCharacter>): string | undefined {
  const parts = [
    cleanText(c.description),
    cleanText(c.personality),
    cleanText(c.appearance),
    cleanText(c.traits),
  ].filter((p): p is string => Boolean(p));
  if (!parts.length) return undefined;
  return Array.from(new Set(parts)).join('\n\n');
}

function buildSeedCharacters(formData: WNFormData): WNCharacter[] {
  const seeded: WNCharacter[] = [];
  const u = formData.user;

  seeded.push({
    id: 1,
    name: cleanText(u.name) ?? 'Protagonist',
    role: 'Protagonist',
    age: cleanText(u.age),
    gender: cleanText(u.gender),
    appearance: cleanText(u.traits),
    traits: cleanText(u.traits),
    personality: cleanText(u.description),
    description: buildDescription({ traits: u.traits, personality: u.description }),
  });

  formData.chars.forEach((c, idx) => {
    const hasInput = [c.name, c.age, c.gender, c.traits, c.personality].some(v => Boolean(cleanText(v)));
    if (!hasInput) return;
    seeded.push({
      id: idx + 2,
      name: cleanText(c.name) ?? `캐릭터 ${idx + 2}`,
      role: '조연',
      age: cleanText(c.age),
      gender: cleanText(c.gender),
      appearance: cleanText(c.traits),
      traits: cleanText(c.traits),
      personality: cleanText(c.personality),
      description: buildDescription({ traits: c.traits, personality: c.personality }),
    });
  });

  return seeded;
}

function ensureCharacter(characters: WNCharacter[], id: number): WNCharacter {
  let c = characters.find(x => x.id === id);
  if (!c) {
    c = { id, name: `캐릭터 ${id}` };
    characters.push(c);
  }
  return c;
}

/** CHAR_N_EMO 파싱 — 파이프(|) 구분 포맷: e1:50|e2:40|e3:10|e4:10|e5:10 */
function parseEmoValue(raw: string): WNEmotions {
  // 파이프 구분 우선 시도
  const emo = { ...ZERO_EMOTIONS };
  // e1:50|e2:40 OR e1:50,e2:40 — 둘 다 지원
  const tokens = raw.replace(/\|/g, ',').split(',');
  for (const tok of tokens) {
    const m = tok.trim().match(/^(e[1-5])\s*:\s*(-?\d+)$/);
    if (m) {
      const key = m[1] as 'e1' | 'e2' | 'e3' | 'e4' | 'e5';
      emo[key] = parseInt(m[2], 10);
    }
  }
  return emo;
}

/** @N 감정 델타 라인 파싱 */
function parseEmoDelta(payload: string): Record<number, Partial<WNEmotions>> | null {
  if (!payload || payload.toUpperCase() === 'NONE') return null;

  const result: Record<number, Partial<WNEmotions>> = {};
  const charBlocks = payload.split('|').map(s => s.trim()).filter(Boolean);

  for (const block of charBlocks) {
    // 형식: "1:e1+5,e2-3" 또는 "2:e3+8"
    const colonIdx = block.indexOf(':');
    if (colonIdx < 0) continue;
    const charId = parseInt(block.substring(0, colonIdx).trim(), 10);
    if (Number.isNaN(charId)) continue;

    const deltaStr = block.substring(colonIdx + 1).trim();
    const delta: Partial<WNEmotions> = {};

    // e1+5, e2-3 등
    const matches = [...deltaStr.matchAll(/e([1-5])([+-]\d+)/g)];
    for (const m of matches) {
      const key = `e${m[1]}` as keyof WNEmotions;
      const val = parseInt(m[2], 10);
      if (val !== 0) delta[key] = val;
    }
    if (Object.keys(delta).length > 0) {
      result[charId] = delta;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// ─────────────────────────────────────────────────────────────────────────────

export function parseWebNovelResponse(
  rawText: string,
  formData: WNFormData,
): { novel: StoredWebNovel; detectedEpisode: number } {
  try {
    const lines = rawText.split('\n').map(l => l.trim());
    const characters: WNCharacter[] = buildSeedCharacters(formData);
    const initialEmotions: Record<number, WNEmotions> = {};
    const paragraphs: WNParagraph[] = [];
    const emotionData: WNEmotionData = {};

    let title           = formData.title || 'Untitled Web Novel';
    let desc            = '';
    let tags: string[]  = [];
    let currentParaId   = -1;
    // 시리즈인 경우 formData.currentEpisode 사용, 아니면 undefined
    const detectedEpisode = formData.isSeries ? (formData.currentEpisode || 1) : undefined;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      if (!line) { currentParaId = -1; continue; }

      // ── 메타 ─────────────────────────────────────────────────────────────
      if (line.startsWith('TITLE:')) {
        const v = line.substring(6).trim();
        if (v) title = v;
        currentParaId = -1;
        continue;
      }
      if (line.startsWith('DESC:')) {
        desc = line.substring(5).trim();
        currentParaId = -1;
        continue;
      }
      if (line.startsWith('TAGS:')) {
        tags = line.substring(5).split(',').map(t => t.trim()).filter(Boolean);
        currentParaId = -1;
        continue;
      }

      // ── CHAR 프로필 ───────────────────────────────────────────────────────
      let m: RegExpMatchArray | null;

      if ((m = line.match(RE_CHAR_NAME))) {
        const c = ensureCharacter(characters, parseInt(m[1], 10));
        const v = cleanText(m[2]);
        if (v) c.name = v;
        currentParaId = -1;
        continue;
      }
      if ((m = line.match(RE_CHAR_APP))) {
        const c = ensureCharacter(characters, parseInt(m[1], 10));
        const v = cleanText(m[2]);
        if (v) { c.appearance = v; c.traits = c.traits ?? v; }
        currentParaId = -1;
        continue;
      }
      if ((m = line.match(RE_CHAR_PER))) {
        const c = ensureCharacter(characters, parseInt(m[1], 10));
        const v = cleanText(m[2]);
        if (v) c.personality = v;
        currentParaId = -1;
        continue;
      }
      if ((m = line.match(RE_CHAR_ROLE))) {
        const c = ensureCharacter(characters, parseInt(m[1], 10));
        const v = cleanText(m[2]);
        if (v) c.role = v;
        currentParaId = -1;
        continue;
      }
      if ((m = line.match(RE_CHAR_AGE))) {
        const c = ensureCharacter(characters, parseInt(m[1], 10));
        const v = cleanText(m[2]);
        if (v) c.age = v;
        currentParaId = -1;
        continue;
      }
      if ((m = line.match(RE_CHAR_GENDER))) {
        const c = ensureCharacter(characters, parseInt(m[1], 10));
        const v = cleanText(m[2]);
        if (v) c.gender = v;
        currentParaId = -1;
        continue;
      }
      if ((m = line.match(RE_CHAR_EMO))) {
        const id = parseInt(m[1], 10);
        const v  = m[2].trim();
        if (v) {
          initialEmotions[id] = parseEmoValue(v);
        }
        currentParaId = -1;
        continue;
      }

      // ── 단락 ─────────────────────────────────────────────────────────────
      if ((m = line.match(RE_PARA))) {
        const id   = parseInt(m[1], 10);
        const text = m[2].trim();
        // [FIX] 단락 ID를 고유하게 만들기 위해 기존 최대 ID + 1 사용
        const uniqueId = paragraphs.length > 0 
          ? Math.max(...paragraphs.map(p => p.id)) + 1 
          : id;
        paragraphs.push({ id: uniqueId, text });
        currentParaId = uniqueId;
        continue;
      }

      // ── 감정 델타 ─────────────────────────────────────────────────────────
      if ((m = line.match(RE_EMO_LINE))) {
        const paraId  = parseInt(m[1], 10);
        const deltas  = parseEmoDelta(m[2]);
        if (deltas) emotionData[paraId] = deltas;
        currentParaId = -1;
        continue;
      }

      // ── 멀티라인 단락 이어붙이기 ────────────────────────────────────────
      if (currentParaId !== -1) {
        // 다음 키워드 만나면 중단
        const isKey =
          line.startsWith('CHAR_')  ||
          line.startsWith('TITLE:') ||
          line.startsWith('DESC:')  ||
          line.startsWith('TAGS:')  ||
          line.startsWith('WN_PARA_') ||
          line.startsWith('@');
        if (isKey) {
          currentParaId = -1;
          lineIdx--; // 현재 라인 재처리
        } else {
          const para = paragraphs.find(p => p.id === currentParaId);
          if (para) para.text += `\n${line}`;
        }
      }
    }

    // ── 검증 ─────────────────────────────────────────────────────────────────
    if (paragraphs.length === 0) {
      throw new Error('NO_CONTENT');
    }

    if (characters.length === 0) {
      characters.push({ id: 1, name: 'Main Character', role: 'Protagonist' });
    }

    // ── 마무리 처리 ───────────────────────────────────────────────────────────
    characters.sort((a, b) => a.id - b.id);
    characters.forEach(c => {
      c.name        = cleanText(c.name) ?? `캐릭터 ${c.id}`;
      c.description = buildDescription(c);
      // 초기 감정 없으면 제로 세팅
      initialEmotions[c.id] = initialEmotions[c.id] ?? { ...ZERO_EMOTIONS };
    });

    // 제목은 AI가 생성한 것 또는 사용자가 입력한 것 그대로 사용
    const finalTitle = title;

    const novel: Omit<StoredWebNovel, 'prefixEmotions' | 'finalEmotions'> = {
      id:            nanoid(),
      storyId:       formData.seriesId || nanoid(),
      episodeNumber: detectedEpisode,
      title:         finalTitle,
      desc:          desc || undefined,
      tags:          tags.length ? tags : undefined,
      createdAt:     Date.now(),
      paragraphs,
      emotionData,
      initialEmotions,
      characters,
    };

    const savedNovel = saveWebNovel(novel);
    return { novel: savedNovel, detectedEpisode: detectedEpisode || 1 };

  } catch (error) {
    if (error instanceof Error && error.message === 'NO_CONTENT') {
      throw new Error(
        'AI 응답에서 단락을 파싱하지 못했습니다.\n' +
        'WN_PARA_1: 형식이 포함된 응답을 붙여넣었는지 확인하세요.',
      );
    }
    throw error;
  }
}
