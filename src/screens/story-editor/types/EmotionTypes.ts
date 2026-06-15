// src/screens/story-editor/types/EmotionTypes.ts
// 감정 관련 타입 정의
// 원본 주석 그대로 보존

// 감정 코드 타입
export type EmotionCode = 'e1' | 'e2' | 'e3' | 'e4' | 'e5';

// 감정 아이템 타입
export interface EmotionItem {
  code: EmotionCode;
  label: string;
  negLabel: string;
  posLabel: string;
}

// 감정 슬라이더 Props 타입
export interface EmotionSliderProps {
  emotion: EmotionItem;
  value: number;
  onChange: (_v: number) => void;
  disabled?: boolean;
}

// 감정 편집 상태 타입
export interface EmotionEditState {
  emotions: Record<EmotionCode, number>;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
}

// 감정 관리 액션 타입
export interface EmotionActions {
  updateEmotion: (_code: EmotionCode, _value: number) => void;
  resetEmotions: () => void;
  saveEmotions: () => Promise<void>;
  loadEmotions: () => Promise<void>;
}

// 감정 변경 델타 타입
export interface EmotionDelta {
  e1: number;
  e2: number;
  e3: number;
  e4: number;
  e5: number;
}

// 감정 효과 타입
export interface EmotionEffect {
  characterId: number;
  delta: EmotionDelta;
}

// 감정 트리거 타입
export interface EmotionTrigger {
  type: 'above' | 'below' | 'reach';
  characterId: number;
  emotionCode: EmotionCode;
  value: number;
  targetChapterId: string;
}
