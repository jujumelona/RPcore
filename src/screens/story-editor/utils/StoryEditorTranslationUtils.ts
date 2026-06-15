/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/utils/StoryEditorTranslationUtils.ts
 * StoryEditorScreen.tsx의 번역 관련 유틸리티 함수들
 */

import { LANGUAGE_LIST } from '../../../i18n/languages';
import type { Language } from '../../../i18n/languages';
import type { 
  CharacterDraft, 
  ChapterDraft, 
  TranslationFunction } from '../types/StoryEditorLegacyTypes';

export interface UserSetting {
  name?: string;
  age?: string;
  gender?: string;
  traits?: string;
  description?: string;
}

/**
 * 가이드 텍스트 가져오기
 */
export function getGuides(t: TranslationFunction): Record<string, string> {
  return {
    storyTitle: t.phStoryTitle,
    storyDesc: t.phStoryDesc,
    storyHashtag: t.phStoryHashtag,
    worldSetting: t.phWorldSetting,
    characterName: t.phCharName,
    characterPersonality: t.phPersonality,
    chapterTitle: t.phChapterName,
    chapterGoal: t.phCharGoal,
    chapterInfo: t.phChapterInfo };
}

/**
 * 첫 번째 챕터 생성
 */
export function makeChapter1(): ChapterDraft {
  return {
    id: 'chapter-1',
    title: '1화: 시작',
    aiGoal: '사용자가 이야기에 자연스럽게 참여하도록 유도',
    characterGoals: {},
    prevSummary: '',
    chapterInfo: '이야기의 시작. 사용자를 세계관에 소개하고 첫 번째 선택지를 제공',
    triggers: [],
    choiceEvents: [],
    isEnding: false };
}

/**
 * 다국어 프롬프트 빌드
 */
export function buildMultiLangPrompt(
  title: string, 
  desc: string, 
  hashtags: string, 
  langs?: Language[]
): string {
  const targetLangs = langs || LANGUAGE_LIST.slice(0, 5);
  const langList = targetLangs.map(l => l.code).join(', ');
  
  return `
다음 내용을 ${langList} 언어로 번역해주세요:

제목: ${title}
설명: ${desc}
해시태그: ${hashtags}

각 언어별로 다음 형식으로 출력해주세요:
[\${언어코드}]
title: 번역된 제목
description: 번역된 설명
hashtags: 번역된 해시태그

---
`;
}

/**
 * KV 데이터 빌드 (최적화)
 */
export function buildKV(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentLang = '';
  let idx = 0;
  const len = raw.length;
  
  while (idx < len) {
    // 줄 시작 찾기
    while (idx < len && (raw[idx] === '\n' || raw[idx] === '\r')) idx++;
    if (idx >= len) break;
    
    const lineStart = idx;
    // 줄 끝 찾기
    while (idx < len && raw[idx] !== '\n' && raw[idx] !== '\r') idx++;
    const line = raw.slice(lineStart, idx).trim();
    
    if (!line) continue;
    
    // [언어코드] 체크
    if (line[0] === '[' && line[line.length - 1] === ']') {
      currentLang = line.slice(1, -1);
      continue;
    }
    
    // key: value 파싱
    if (currentLang) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        result[`${currentLang}_${key}`] = value;
      }
    }
  }
  
  return result;
}

/**
 * 소문자 키 변환
 */
export function lcKey(code: string): string {
  return code.toLowerCase();
}

/**
 * 다국어 붙여넣기 파싱
 */
export function parseMultiLangPaste(
  raw: string
): Record<string, { title: string; description: string; hashtags: string }> {
  const kv = buildKV(raw);
  const result: Record<string, { title: string; description: string; hashtags: string }> = {};
  
  // 모든 언어 코드 추출
  const langCodes = Array.from(new Set(Object.keys(kv).map(key => key.split('_')[0])));
  
  for (const lang of langCodes) {
    result[lang] = {
      title: kv[`${lang}_title`] || '',
      description: kv[`${lang}_description`] || '',
      hashtags: kv[`${lang}_hashtags`] || '' };
  }
  
  return result;
}

/**
 * 모든 캐릭터 다국어 프롬프트 빌드
 */
export function buildAllCharsPrompt(
  characters: CharacterDraft[], 
  langs: Language[], 
  userSetting?: UserSetting
): string {
  const langList = langs.map(l => l.code).join(', ');
  let prompt = `다음 캐릭터 정보를 ${langList} 언어로 번역해주세요:\n\n`;
  
  for (const char of characters) {
    prompt += `캐릭터 ID: ${char.id}\n`;
    prompt += `이름: ${char.name}\n`;
    prompt += `성격: ${char.personality}\n`;
    prompt += `성격 예시: ${char.personalityExample}\n`;
    if (char.age) prompt += `나이: ${char.age}\n`;
    if (char.gender) prompt += `성별: ${char.gender}\n`;
    if (char.traits) prompt += `특징: ${char.traits}\n`;
    prompt += '\n';
  }
  
  if (userSetting) {
    prompt += `사용자 설정:\n`;
    prompt += `이름: ${userSetting.name}\n`;
    prompt += `나이: ${userSetting.age}\n`;
    prompt += `성별: ${userSetting.gender}\n`;
    prompt += `특징: ${userSetting.traits}\n`;
    prompt += `설명: ${userSetting.description}\n`;
  }
  
  prompt += `
각 언어별로 다음 형식으로 출력해주세요:
[\${언어코드}]
${characters.map(char => `char_${char.id}_name: 번역된 이름`).join('\n')}
${characters.map(char => `char_${char.id}_personality: 번역된 성격`).join('\n')}
${characters.map(char => `char_${char.id}_personalityExample: 번역된 성격 예시`).join('\n')}
${characters.map(char => `char_${char.id}_age: 번역된 나이`).join('\n')}
${characters.map(char => `char_${char.id}_gender: 번역된 성별`).join('\n')}
${characters.map(char => `char_${char.id}_traits: 번역된 특징`).join('\n')}
${userSetting ? 'user_name: 번역된 이름\nuser_age: 번역된 나이\nuser_gender: 번역된 성별\nuser_traits: 번역된 특징\nuser_description: 번역된 설명' : ''}

---
`;
  
  return prompt;
}

/**
 * 모든 캐릭터 붙여넣기 파싱
 */
export function parseAllCharsPaste(
  raw: string, 
  characters: CharacterDraft[]
): Record<number, Record<string, any>> {
  const kv = buildKV(raw);
  const result: Record<number, Record<string, any>> = {};
  
  const langCodes = Array.from(new Set(Object.keys(kv).map(key => key.split('_')[0])));
  
  for (const char of characters) {
    const charLangData: Record<string, any> = {};
    
    for (const lang of langCodes) {
      const charData = {
        name: kv[`${lang}_char_${char.id}_name`] || '',
        personality: kv[`${lang}_char_${char.id}_personality`] || '',
        personalityExample: kv[`${lang}_char_${char.id}_personalityExample`] || '',
        age: kv[`${lang}_char_${char.id}_age`] || '',
        gender: kv[`${lang}_char_${char.id}_gender`] || '',
        traits: kv[`${lang}_char_${char.id}_traits`] || '' };
      
      if (Object.values(charData).some(v => v !== '')) {
        charLangData[lang] = charData;
      }
    }
    
    if (Object.keys(charLangData).length > 0) {
      result[char.id] = charLangData;
    }
  }
  
  return result;
}

/**
 * 모든 챕터 다국어 프롬프트 빌드
 */
export function buildAllChaptersPrompt(
  allChapters: ChapterDraft[], 
  langs: Language[], 
  fromIdx: number = 0, 
  toIdx?: number
): string {
  const targetChapters = toIdx !== undefined 
    ? allChapters.slice(fromIdx, toIdx + 1)
    : allChapters.slice(fromIdx);
  
  const langList = langs.map(l => l.code).join(', ');
  let prompt = `다음 챕터의 선택지 정보를 ${langList} 언어로 번역해주세요:\n\n`;
  
  let totalOptionsToTranslate = 0;
  for (const chapter of targetChapters) {
    if (!chapter.choiceEvents || chapter.choiceEvents.length === 0) continue;
    
    prompt += `챕터 ID: ${chapter.id}\n`;
    chapter.choiceEvents.forEach((evt, evtIdx) => {
      if (evt.prompt) {
        prompt += `선택지 ${evtIdx + 1} 질문: ${evt.prompt}\n`;
      }
      evt.options.forEach((opt, optIdx) => {
        prompt += `선택지 ${evtIdx + 1} 옵션 ${optIdx + 1}: ${opt.label}\n`;
        totalOptionsToTranslate++;
      });
    });
    prompt += '\n';
  }
  
  if (totalOptionsToTranslate === 0) {
    return `번역할 선택지가 없습니다.`; // No choices to translate
  }

  prompt += `
각 언어별로 다음 형식으로 출력해주세요:
[언어코드]
`;
  targetChapters.forEach(ch => {
    (ch.choiceEvents || []).forEach((evt, evtIdx) => {
      if (evt.prompt) prompt += `chapter_${ch.id}_choice_${evtIdx}_prompt: 번역된 선택지 질문\n`;
      evt.options.forEach((opt, optIdx) => {
        prompt += `chapter_${ch.id}_choice_${evtIdx}_opt_${optIdx}: 번역된 옵션\n`;
      });
    });
  });
  
  prompt += `\n---`;
  
  return prompt;
}

/**
 * 모든 챕터 붙여넣기 파싱
 */
export function parseAllChaptersPaste(
  raw: string, 
  chapters: ChapterDraft[], 
  fromIdx: number = 0
): Record<string, Record<string, any>> {
  const kv = buildKV(raw); // { "en_chapter_1_choice_0_prompt": "...", ... }
  const result: Record<string, Record<string, any>> = {};
  
  const targetChapters = chapters.slice(fromIdx);
  const langCodes = Array.from(new Set(Object.keys(kv).map(key => key.split('_')[0])));
  
  for (const chapter of targetChapters) {
    if (!chapter.choiceEvents || chapter.choiceEvents.length === 0) continue;
    
    const chapterLangData: Record<string, any> = {};
    
    for (const lang of langCodes) {
      const langData: Record<string, string> = {};
      
      chapter.choiceEvents.forEach((evt, evtIdx) => {
        if (evt.prompt) {
          const trPrompt = kv[`${lang}_chapter_${chapter.id}_choice_${evtIdx}_prompt`];
          if (trPrompt) {
            langData[`choice_${evtIdx}_prompt`] = trPrompt;
          }
        }
        evt.options.forEach((opt, optIdx) => {
          const trOpt = kv[`${lang}_chapter_${chapter.id}_choice_${evtIdx}_opt_${optIdx}`];
          if (trOpt) {
            langData[`choice_${evtIdx}_opt_${optIdx}`] = trOpt;
          }
        });
      });
      
      if (Object.keys(langData).length > 0) {
        chapterLangData[lang] = langData;
      }
    }
    
    if (Object.keys(chapterLangData).length > 0) {
      result[chapter.id] = chapterLangData;
    }
  }
  
  return result;
}
