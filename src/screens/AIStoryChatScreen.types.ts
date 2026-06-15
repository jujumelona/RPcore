﻿// src/screens/AIStoryChatScreen.types.ts
// ═══════════════════════════════════════════════════════════════════════
// AIStoryChatScreen 공유 타입 정의
// ═══════════════════════════════════════════════════════════════════════

export interface CharInput {
  name: string;
  age: string;
  gender: string;
  traits: string;
  personality: string;
  personalityExample: string;
}

export interface UserInput {
  name: string;
  age: string;
  gender: string;
  traits: string;
  description: string;
}

export type Step = 'form' | 'paste';

export interface CoreInput {
  title: string;
  keywords: string;
  content: string;
}

export interface FormData {
  title: string;
  genre: string;
  stylePreset: string;
  worldSetting: string;
  user: UserInput;
  charCount: string;
  chars: CharInput[];
  chapterCount: string;
  tone: string;
  extra: string;
}
