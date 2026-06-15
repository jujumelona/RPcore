// src/screens/story-editor/types/CharacterTypes.ts
// 캐릭터 관련 타입 정의
// 원본 주석 그대로 보존

// 감정 값 타입
export interface EmotionValues { 
  e1: number; 
  e2: number; 
  e3: number; 
  e4: number; 
  e5: number; 
}

// 캐릭터 초안 타입
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

// 캐릭터 편집 상태 타입
export interface CharacterEditState {
  character: CharacterDraft;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
}

// 캐릭터 관리 액션 타입
export interface CharacterActions {
  updateCharacter: (_updates: Partial<CharacterDraft>) => void;
  resetCharacter: () => void;
  saveCharacter: () => Promise<void>;
  deleteCharacter: () => Promise<void>;
  uploadImages: (_images: any[]) => Promise<void>;
}
