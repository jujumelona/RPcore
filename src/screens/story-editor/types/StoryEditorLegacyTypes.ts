/**
 * src/screens/story-editor/types/StoryEditorLegacyTypes.ts
 * StoryEditorScreen.tsx의 로컬 타입 정의 (레거시 호환용)
 */

// ── Local type definitions ─────────────────────────────────────────────────
export interface EmotionValues { 
  e1: number; 
  e2: number; 
  e3: number; 
  e4: number; 
  e5: number; 
}

export interface CharacterDraft {
  id: number; 
  name: string; 
  imageUris: string[];
  emotions: EmotionValues; 
  personality: string; 
  personalityExample: string;
  age?: string; 
  gender?: string; 
  traits?: string;
  description?: string;
}

export interface UserSetting { 
  name: string; 
  age: string; 
  gender: string; 
  traits: string; 
  description: string; 
}

export interface ChapterDraft {
  id: string; 
  title: string; 
  aiGoal: string;
  characterGoals: Record<number, string>;
  prevSummary: string; 
  chapterInfo: string; 
  triggers: TriggerDraft[];
  choiceEvents: ChoiceEventDraft[];
  isEnding?: boolean; // 선택지 없는 챕터 = 엔딩 챕터 (스택 무한)
  intro?: IntroMessage[];
}

export interface TriggerDraft {
  type: 'cache' | 'emotion' | 'conversation';
  emotionChar?: number;
  emotionCode?: string;
  emotionDir?: 'above' | 'below' | 'reach';
  emotionValue?: number;
  convCount?: number;
}

export interface ChoiceOptionDraft {
  id: string;
  label: string;
  targetChapterId: string;
}

export interface ChoiceEventDraft {
  id: string;
  type: 'choice';
  prompt?: string;
  options: ChoiceOptionDraft[];
}

export interface IntroMessage {
  speakerType: string;
  speakerCharId: number;
  content: string;
  imageUri?: string;
  imageUrl?: string;
}

export interface BackgroundItem { 
  id: string; 
  uri: string; 
  label: string; 
  conditions: BGCondition[]; 
}

export interface BGCondition {
  type: 'chapter' | 'emotion' | 'custom';
  chapterId?: string;
  emotionChar?: number;
  emotionCode?: string;
  emotionDir?: 'above' | 'below' | 'reach';
  emotionValue?: number;
  customKey?: string;
  customValue?: any;
}

// 유틸리티 함수 타입들
export type TranslationFunction = Record<string, string | undefined>;

export interface ChapterRangeTranslateProps {
  fromIdx: number;
  toIdx: number;
  chapters: ChapterDraft[];
  onTranslate: (translated: Record<string, { title: string; description: string; hashtags: string }>) => void;
  onClose: () => void;
  t: TranslationFunction;
}

export interface TranslationPastePageProps {
  initialRaw?: string;
  onPaste: (parsed: Record<string, { title: string; description: string; hashtags: string }>) => void;
  onClose: () => void;
  t: TranslationFunction;
}

export interface TranslationPasteModalProps {
  visible: boolean;
  onClose: () => void;
  onPaste: (parsed: Record<string, { title: string; description: string; hashtags: string }>) => void;
  t: TranslationFunction;
}

export interface AIAssistantModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (data: { 
    characters: import('../../../types/StoryContract').StoryCharacter[]; 
    chapters: import('../../../types/StoryContract').StoryChapter[] 
  }) => void;
}
