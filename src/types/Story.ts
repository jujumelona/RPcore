﻿// src/types/Story.ts
// 스토리 전체 타입 정의

export interface Story {
  id: string;
  title: string;
  coverImage: string;
  worldSetting: string; // 세계관 (압축)
  characters: Character[];
  outputFormat: OutputFormat;
  emotions: EmotionDefinition[];
  chapters: Chapter[];
  settings: StorySettings;
}

export interface Character {
  id: number; // 2, 3, 4... (0=나레이션, 1=유저)
  name: string;
  age?: number;
  personality: string; // 압축된 성격
  speechPattern: string; // 말투 예시
  appearance?: string;
  initialEmotions: EmotionState; // 초기 감정
}

export interface OutputFormat {
  narrator: number; // 0 (고정)
  user: number; // 1 (고정)
  characters: Record<number, string>; // {2: "김유미", 3: "박서준"}
}

export interface EmotionDefinition {
  code: string; // "e1", "e2", "e3"...
  name: string; // "신뢰", "경계"...
  ranges: {
    light: [number, number]; // [1, 5]
    medium: [number, number]; // [6, 12]
    extreme: [number, number]; // [13, 20]
  };
}

export interface EmotionState {
  [key: string]: number; // {e1: 5, e2: 3, e3: 0}
}

export interface Chapter {
  id: number;
  title: string;
  startText: string; // 챕터 시작 대사 (미리 작성)
  backgroundImage?: string; // 배경 이미지
  maxTokens: number; // 30000
  summary?: string; // 요약 (챕터 종료 후 생성)
}

export interface StorySettings {
  maxOutputTokens: number; // 500~700
  temperature: number; // 0.7
  topP: number; // 0.9
}

// ===== 메시지 관련 =====

export interface Message {
  id: string;
  speaker: number; // 0, 1, 2, 3...
  content: string; // 원본 텍스트
  parts: MessagePart[]; // 파싱된 부분
  emotions?: EmotionChange[]; // 감정 변화
  timestamp: number;
}

export interface MessagePart {
  type: 'text' | 'action' | 'thought';
  content: string;
  color: string; // #FFF, #999, #666
}

export interface EmotionChange {
  characterId: number;
  changes: EmotionState; // {e1: +3, e4: -2}
}

// ===== 프롬프트 관련 =====

export interface PromptData {
  fixed: string; // 고정 프롬프트 (세계관, 약속, 캐릭터)
  summaries: string[]; // 챕터 요약들
  currentDialogue: string[]; // 현재 대화
  emotions: string; // 현재 감정 상태
  userInput: string; // 사용자 입력
}

export interface TokenCount {
  fixed: number;
  summaries: number;
  dialogue: number;
  total: number;
}
