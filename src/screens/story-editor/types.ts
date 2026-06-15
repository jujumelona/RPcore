export interface EmotionValues { e1: number; e2: number; e3: number; e4: number; e5: number; }

export interface CharacterDraft {
  id: number;
  name: string;
  imageUris: string[];
  emotions?: EmotionValues;
  personality: string;
  personalityExample: string;
  age?: string;
  gender?: string;
  traits?: string;
}

export interface UserSetting {
  name: string;
  age: string;
  gender: string;
  traits: string;
  description: string;
}

export interface TriggerDraft {
  type: 'cache' | 'conversation';
  convCount?: number;
}

export interface ChoiceOptionDraft {
  id: string;
  label: string;
  targetChapterId: string;
}

export interface ChoiceEventDraft {
  id: string;
  prompt: string;
  triggerConditions: TriggerDraft[];
  options: ChoiceOptionDraft[];
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
  isEnding?: boolean;
}

export interface IntroMessage {
  id: string;
  speakerType: 'narrator' | 'user' | 'character' | 'image';
  speakerCharId?: number;
  content: string;
  imageUri?: string;
}

export interface BGCondition {
  type: 'chapter';
  chapterId?: string;
}

export interface BackgroundItem {
  id: string;
  uri: string;
  label: string;
  conditions: BGCondition[];
}
