/**
 * src/screens/story-editor/types/StoryEditorTypes.ts
 * 스토리 에디터 타입 정의
 */


// ─── 기본 타입 ──────────────────────────────────────────────────────────────
export interface EmotionValues {
  e1: number; // 기쁨
  e2: number; // 슬픔
  e3: number; // 분노
  e4: number; // 공포
  e5: number; // 사랑
}

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
  description?: string;
}

export interface ChapterDraft {
  id: string;
  title: string;
  aiGoal: string;
  characterGoals: Record<number, string>;
  prevSummary: string;
  chapterInfo: string;
  triggers: any[];
  choiceEvents: any[];
  isEnding?: boolean;
  intro?: any[];
}

export interface BackgroundDraft {
  label: string;
  uri: string;
  conditions: any;
}

export interface IntroMessageDraft {
  speakerType: string;
  speakerCharId: number;
  content: string;
  imageUri?: string;
  imageUrl?: string;
}

// ─── 에디터 상태 타입 ────────────────────────────────────────────────────────
export type EditorTab = 'basic' | 'characters' | 'chapters' | 'translate';

export interface EditorState {
  storyId: string;
  storyTitle: string;
  storyDesc: string;
  storyHashtag: string;
  storyGenre?: string;
  worldSetting: string;
  characters: CharacterDraft[];
  chapters: ChapterDraft[];
  backgrounds: BackgroundDraft[];
  introMessages: Record<string, IntroMessageDraft[]>;
  narratorFrequency?: 'none' | 'minimal' | 'normal' | 'rich';
  coverUrls?: string[];
  userSetting?: {
    name?: string;
    age?: string;
    gender?: string;
    traits?: string;
    description?: string;
  } | string;
  multiLangTranslations?: Record<string, any>;
  charMultiLangData?: Record<number, Record<string, any>>;
  chapterMultiLangData?: Record<string, Record<string, any>>;
  introMultiLangData?: Record<string, Record<string, any>>;
  authorName?: string;
  authorId?: string;
  authorAvatar?: string;
  authorEmail?: string;
  activeTab: EditorTab;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt?: number;
}

// ─── AI 모달 타입 ───────────────────────────────────────────────────────────
export interface AIAssistantModalState {
  isVisible: boolean;
  targetField?: string;
  targetIndex?: number;
  currentPrompt: string;
  isGenerating: boolean;
  generatedContent: string;
}

export interface AIGenerationRequest {
  type: 'character' | 'chapter' | 'story' | 'world' | 'dialogue';
  targetId?: string | number;
  context?: any;
  prompt?: string;
}

// ─── 번역 타입 ─────────────────────────────────────────────────────────────
export interface TranslationState {
  isTranslating: boolean;
  currentLanguage: string;
  translatedContent: Record<string, any>;
  progress: number;
  totalLanguages: number;
}

export interface TranslationRequest {
  content: any;
  targetLanguages: string[];
  sourceLanguage?: string;
}

// ─── 드래프트 타입 ───────────────────────────────────────────────────────────
export interface DraftData {
  version: string;
  timestamp: number;
  state: Partial<EditorState>;
}

export interface DraftMetadata {
  id: string;
  title: string;
  timestamp: number;
  size: number;
  version: string;
}

// ─── 유효성 검사 타입 ───────────────────────────────────────────────────────
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ─── 저장/로드 타입 ─────────────────────────────────────────────────────────
export interface SaveRequest {
  storyId: string;
  state: EditorState;
  isAutoSave?: boolean;
}

export interface SaveResult {
  success: boolean;
  storyId?: string;
  error?: string;
  timestamp?: number;
}

export interface LoadRequest {
  storyId: string;
  version?: string;
}

export interface LoadResult {
  success: boolean;
  state?: EditorState;
  error?: string;
  metadata?: DraftMetadata;
}

// ─── 이벤트 타입 ─────────────────────────────────────────────────────────────
export interface EditorEvent {
  type: 'save' | 'load' | 'delete' | 'export' | 'import' | 'translate' | 'generate';
  payload?: any;
  timestamp: number;
}

export interface EditorEventHandler {
  (_event: EditorEvent): void;
}

// ─── 컴포넌트 Props 타입 ─────────────────────────────────────────────────────
export interface CharacterEditorProps {
  character: CharacterDraft;
  index: number;
  onUpdate: (_character: CharacterDraft, _index: number) => void;
  onDelete: (_index: number) => void;
  onImagePick: (_images: string[], _index: number) => void;
  readonly?: boolean;
}

export interface ChapterEditorProps {
  chapter: ChapterDraft;
  index: number;
  characters: CharacterDraft[];
  onUpdate: (_chapter: ChapterDraft, _index: number) => void;
  onDelete: (_index: number) => void;
  onMoveUp: (_index: number) => void;
  onMoveDown: (_index: number) => void;
  readonly?: boolean;
}

export interface StoryBasicInfoProps {
  state: EditorState;
  onUpdate: (_updates: Partial<EditorState>) => void;
  onValidationChange: (_result: ValidationResult) => void;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
export const DEFAULT_CHARACTER: CharacterDraft = {
  id: 0,
  name: '',
  imageUris: [],
  personality: '',
  personalityExample: '',
  age: '',
  gender: '',
  traits: '' };

export const DEFAULT_CHAPTER: ChapterDraft = {
  id: '',
  title: '',
  aiGoal: '',
  characterGoals: {},
  prevSummary: '',
  chapterInfo: '',
  triggers: [],
  choiceEvents: [],
  intro: [] };

export const DRAFT_KEY_PREFIX = '@story_editor_draft_v3:';
export const LEGACY_DRAFT_PREFIXES = ['@story_editor_draft_v1:', '@story_editor_draft_v2:'];
