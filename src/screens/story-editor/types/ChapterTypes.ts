// src/screens/story-editor/types/ChapterTypes.ts
// 챕터 관련 타입 정의
// 원본 주석 그대로 보존

// 트리거 초안 타입
export interface TriggerDraft {
  type: 'cache' | 'conversation';
  convCount?: number;
}

// 선택지 옵션 초안 타입
export interface ChoiceOptionDraft {
  id: string;
  label: string;
  targetChapterId: string;
}

// 선택지 이벤트 초안 타입
export interface ChoiceEventDraft {
  id: string;
  prompt: string;
  triggerConditions: TriggerDraft[];
  options: ChoiceOptionDraft[];
}

// 챕터 초안 타입
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
}

// 인트로 메시지 타입
export interface IntroMessage {
  id: string; 
  speakerType: 'narrator' | 'user' | 'character' | 'image';
  speakerCharId?: number; 
  content: string; 
  imageUri?: string;
}

// 챕터 편집 상태 타입
export interface ChapterEditState {
  chapter: ChapterDraft;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  activeTab: 'basic' | 'triggers' | 'choices' | 'intro';
}

// 챕터 관리 액션 타입
export interface ChapterActions {
  updateChapter: (_updates: Partial<ChapterDraft>) => void;
  resetChapter: () => void;
  saveChapter: () => Promise<void>;
  deleteChapter: () => Promise<void>;
  addTrigger: (_trigger: TriggerDraft) => void;
  removeTrigger: (_index: number) => void;
  addChoiceEvent: (_event: ChoiceEventDraft) => void;
  removeChoiceEvent: (_index: number) => void;
  addIntroMessage: (_message: IntroMessage) => void;
  removeIntroMessage: (_index: number) => void;
}
