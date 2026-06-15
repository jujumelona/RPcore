/* eslint-disable @typescript-eslint/no-unused-vars */
// src/types/StoryContract.ts
// ══════════════════════════════════════════════════════════════
// 에디터 -> 서버 -> 앱 채팅 사이의 단일 데이터 계약
//
// 네이밍 규칙:
//   - 에디터 / 앱 내부 타입: camelCase  (EditorEmotions, StoryChapter 등)
//   - 서버 API 응답 타입:    snake_case  (StoryResponse, ServerCharacter)
//     -> API 레이어에서 toCamelCase 변환 필요. 앱 내부로 snake_case 노출 금지.
// ══════════════════════════════════════════════════════════════

// ─── 감정 수치 ────────────────────────────────────────────────

export interface EditorEmotions {
  e1: number; // Valence:    감정가   −100(부정) ~ 0(중립) ~ +100(긍정)
  e2: number; // Trust:      신뢰도   −100(불신) ~ 0(중립) ~ +100(신뢰)
  e3: number; // Dominance:  지배성   −100(복종) ~ 0(중립) ~ +100(지배)
  e4: number; // Arousal:    각성도   −100(차분) ~ 0(중립) ~ +100(흥분)
  e5: number; // Attachment: 친밀감   −100(냉담) ~ 0(중립) ~ +100(친밀)
}

// ─── 에디터 내부 draft 타입 ──────────────────────────────────

export interface EditorCharacter {
  id: number;
  name: string;
  imageUris: string[];
  emotions: EditorEmotions;
  personality: string;
  personalityExample: string;
  speechPattern?: string;
  speech?: string;
  age?: string;
  gender?: string;
  traits?: string;
  appearance?: string;
  description?: string;
}

export interface EditorTrigger {
  type: 'cache' | 'emotion' | 'conversation';
  emotionChar?: number;
  emotionCode?: string;
  emotionDir?: 'above' | 'below' | 'reach';
  emotionValue?: number;
  convCount?: number;
}

// ✅ imageUri -> imageUrl 통일 (이전: 에디터는 imageUri, 서버는 imageUrl -> 변환 버그 유발)
// 에디터 draft는 로컬 파일 경로(uri)를 쓰지만 타입명은 imageUrl로 통일하고
// 서버 업로드 후 실제 URL로 교체. 의미 혼동 없애기 위해 필드명 일치시킴.
export interface EditorIntroMessage {
  id?: string;
  speakerType: 'narrator' | 'user' | 'character' | 'image';
  speakerCharId?: number;
  speakerName?: string;
  content: string;
  /** 에디터에서는 로컬 파일 경로, 서버 전송 시 실제 URL로 교체 */
  imageUrl?: string;
  /** @deprecated imageUrl로 통일됨 — 레거시 데이터 호환용 */
  imageUri?: string;
}

// ─── 선택지 이벤트 ────────────────────────────────────────────

export interface ChoiceOption {
  id: string;
  label: string;
  targetChapterId: string;
  isEnding?: boolean;
}

export interface ChoiceEvent {
  id: string;
  prompt?: string;
  triggerConditions: EditorTrigger[];
  options: ChoiceOption[];
}

export interface EditorChapter {
  id: string;
  title: string;
  aiGoal: string;
  characterGoals: Record<number, string>;
  prevSummary: string;
  chapterInfo: string;
  triggers: EditorTrigger[];
  choiceEvents: ChoiceEvent[];
  intro: EditorIntroMessage[];
  isEnding?: boolean;
}

export interface EditorBGCondition {
  type: 'emotion' | 'chapter';
  charId?: number;
  emotionCode?: string;
  dir?: 'above' | 'below';
  value?: number;
  chapterId?: string;
}

export interface EditorBackground {
  id: string;
  uri: string;
  label: string;
  conditions: EditorBGCondition[];
}

// ─── 서버 저장 / 전송 형식 ────────────────────────────────────

export interface StoryConfig {
  // snake_case aliases for server payload compatibility
  narrator_frequency?: 'none' | 'minimal' | 'normal' | 'rich';
  world_setting?: string;
  story_style_preset?: string;
  user_setting?: Record<string, string> | string;
  multi_lang_translations?: Record<string, { title?: string; description?: string; hashtags?: string }>;
  char_multi_lang_data?: Record<number, Record<string, { name?: string; age?: string; gender?: string; traits?: string; personality?: string; personalityExample?: string }>>;
  chapter_multi_lang_data?: Record<string, Record<string, { title?: string; [key: string]: string | undefined }>>;
  intro_multi_lang_data?: Record<string, Record<string, string>>;

  worldSetting: string;
  characters: StoryCharacter[];
  chapters: StoryChapter[];
  backgrounds?: StoryBackground[];
  narratorFrequency?: 'none' | 'minimal' | 'normal' | 'rich';
  storyStylePreset?: string;
  // ✅ [BUG FIX] 서버가 story_config에서 직접 읽는 필드들
  storyHashtag?: string;
  hashtags?: string;
  userSetting?: Record<string, string> | string;
  cover_urls?: string[];
  coverUrl?: string;
  authorName?: string;
  title?: string;
  description?: string;
  multiLangTranslations?: Record<string, { title?: string; description?: string; hashtags?: string }>;
  charMultiLangData?: Record<number, Record<string, { name?: string; age?: string; gender?: string; traits?: string; personality?: string; personalityExample?: string }>>;
  chapterMultiLangData?: Record<string, Record<string, { title?: string; [key: string]: string | undefined }>>;
  introMultiLangData?: Record<string, Record<string, string>>;
}

export interface StoryCharacter {
  id: number;
  name: string;
  profileUrl: string;
  personality: string;
  personalityExample: string;
  initialEmotions?: EditorEmotions;
  age?: string;
  gender?: string;
  traits?: string;
  // snake_case / legacy aliases
  char_index?: number;
  profile_url?: string;
  speech_pattern?: string;
  speechPattern?: string;
  initial_emotions?: EditorEmotions;
  emotions?: EditorEmotions;
  imageUris?: string[];
  appearance?: string;
  setting?: string;
  description?: string;
  speech?: string;
}

export interface StoryProp {
  story_config: StoryConfig;
  title?: string;
  author?: string;
  id?: string;
  lastChapterIdx?: number;
  last_chapter_idx?: number;
  authorName?: string;
  description?: string;
  coverUrl?: string;
}

export interface StoryChapter {
  id: string;
  title: string;
  aiGoal: string;
  characterGoals: Record<number, string>;
  prevSummary: string;
  chapterInfo: string;
  triggers: EditorTrigger[];
  choiceEvents: ChoiceEvent[];
  intro: StoryIntroMessage[];
  isEnding?: boolean;
  introMessages?: StoryIntroMessage[];
  background?: string | StoryBackground;
  branches?: Array<{
    conditions?: EditorTrigger[];
    prompt?: string;
    options?: ChoiceOption[];
  }>;
}

// ✅ imageUrl 필드명 통일 (이전: EditorIntroMessage는 imageUri, StoryIntroMessage는 imageUrl -> 불일치)
export interface StoryIntroMessage {
  id?: string;
  // ✅ [FIX A] emotion_delta 추가: CH2+ 인트로 감정 변화를 metadata로 저장하기 위한 타입
  speakerType: 'narrator' | 'user' | 'character' | 'image' | 'emotion_delta';
  speakerCharId?: number;
  speakerName?: string;
  content: string;
  imageUrl?: string;
}

export interface StoryBackground {
  label: string;
  imageUrl: string;
  uri?: string;
  conditions: EditorBGCondition[];
}

// ─── 서버 API 응답 (snake_case) ───────────────────────────────
// 이 타입은 API 레이어에서만 사용. 앱 내부 로직에 직접 전달하지 말 것.
// API 훅에서 camelCase 타입으로 변환 후 사용.

export interface StoryResponse {
  id?: string;
  title: string;
  description: string;
  genre: string;
  cover_url: string;
  thumb_url: string;
  bg_urls: string[];
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
  author_nickname: string;
  view_count: number;
  created_at: string;
  story_config: StoryConfig;
  characters: ServerCharacter[];
  // optional client-side fields
  lastChapterIndex?: number;
  authorId?: string;
  isLiked?: boolean;
  likeCount?: number;
  viewCount?: number;
  author?: string;
  cover_urls?: string[];
  coverUrl?: string;
}

export interface ServerCharacter {
  char_index: number;
  name: string;
  personality: string;
  speech_pattern: string;
  profile_url: string;
  initial_emotions?: EditorEmotions;
  age?: string;
  gender?: string;
  traits?: string;
}

// ─── 감정 sync 타입 ───────────────────────────────────────────

export interface EmotionSyncState {
  char_index: number;
  e1: number; e2: number; e3: number; e4: number; e5: number;
  chapter_index: number;
  is_initial: boolean;
}

export interface EmotionSyncResponse {
  states: EmotionSyncState[];
}

// ✅ EmotionSyncPayload 내부 인라인 타입을 EmotionSyncState 재사용으로 통일
//   이전: Array<{ char_index: number; e1: number; ... }> -> EmotionSyncState와 거의 동일한 구조 중복
//   is_initial / chapter_index 제외한 슬라이스를 Omit으로 추출

export type EmotionSyncEntry = Omit<EmotionSyncState, 'is_initial' | 'chapter_index'>;

export interface EmotionSyncPayload {
  chapter_index: number;
  states: EmotionSyncEntry[];
}

// ─── 런타임 채팅 상태 ─────────────────────────────────────────

export interface ActiveChoiceEvent {
  choiceEventId?: string;
  prompt?: string;
  options: ChoiceOption[];
}
