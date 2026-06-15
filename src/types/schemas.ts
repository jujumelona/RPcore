import { z } from 'zod';

/**
 * [Zod Core Master Code]
 * - Purpose: Runtime validation for "Data Entrances" (API, Storage, MMKV)
 * - Goal: Crash-proof & Performance (early failure, clear errors)
 */

// ─── Emotions (EditorEmotions) ────────────────────────────────────────────────
export const EditorEmotionsSchema = z.object({
  e1: z.number().min(-100).max(100).default(0),
  e2: z.number().min(-100).max(100).default(0),
  e3: z.number().min(-100).max(100).default(0),
  e4: z.number().min(-100).max(100).default(0),
  e5: z.number().min(-100).max(100).default(0) });

// ─── Trigger (EditorTrigger) ───────────────────────────────────────────────────
export const EditorTriggerSchema = z.object({
  type: z.enum(['cache', 'emotion', 'conversation']),
  emotionChar: z.number().optional(),
  emotionCode: z.string().optional(),
  emotionDir: z.enum(['above', 'below', 'reach']).optional(),
  emotionValue: z.number().optional(),
  convCount: z.number().optional() });

// ─── Choice Option (ChoiceOption) ───────────────────────────────────────────────
export const ChoiceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  targetChapterId: z.string().optional(),
  isEnding: z.boolean().optional() });

// ─── Choice Event (ChoiceEvent) ──────────────────────────────────────────────
export const ChoiceEventSchema = z.object({
  id: z.string(),
  prompt: z.string().optional(),
  triggerConditions: z.array(EditorTriggerSchema).default([]),
  options: z.array(ChoiceOptionSchema).default([]) });

// ─── Intro Message (StoryIntroMessage) ─────────────────────────────────────────
export const StoryIntroMessageSchema = z.object({
  id: z.string().optional(),
  speakerType: z.enum(['narrator', 'user', 'character', 'image', 'emotion_delta']),
  speakerCharId: z.coerce.number().optional(),
  speakerName: z.string().optional(),
  content: z.string().default(''),
  imageUrl: z.string().optional() });

const OptionalFiniteNumberSchema = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().optional());

// ─── Character (StoryCharacter) ──────────────────────────────────────────────────
export const StoryCharacterSchema = z.object({
  id: OptionalFiniteNumberSchema,
  name: z.string().default('Unknown'),
  profileUrl: z.string().optional(),
  profile_url: z.string().optional(),
  imageUris: z.array(z.string()).optional(),
  personality: z.string().optional(),
  personalityExample: z.string().optional(),
  speech: z.string().optional(),
  speechPattern: z.string().optional(),
  speech_pattern: z.string().optional(),
  appearance: z.string().optional(),
  setting: z.string().optional(),
  description: z.string().optional(),
  traits: z.string().optional(),
  initialEmotions: EditorEmotionsSchema.optional(),
  initial_emotions: EditorEmotionsSchema.optional(),
  emotions: EditorEmotionsSchema.optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
  // legacy/alias support
  char_index: OptionalFiniteNumberSchema }).passthrough().transform(character => {
  const resolvedId = character.id ?? character.char_index ?? 0;
  return {
    ...character,
    id: resolvedId,
    char_index: character.char_index ?? resolvedId,
  };
});

// ─── Chapter (StoryChapter) ──────────────────────────────────────────────────────
export const StoryChapterSchema = z.object({
  id: z.coerce.string(),
  title: z.string().default('New Chapter'),
  aiGoal: z.string().optional(),
  characterGoals: z.record(z.coerce.number(), z.string()).optional(),
  prevSummary: z.string().optional(),
  chapterInfo: z.string().optional(),
  triggers: z.array(EditorTriggerSchema).default([]),
  choiceEvents: z.array(ChoiceEventSchema).default([]),
  intro: z.array(StoryIntroMessageSchema).default([]),
  isEnding: z.boolean().optional() }).passthrough();

// ─── Background (StoryBackground) ───────────────────────────────────────────────────
export const StoryBackgroundSchema = z.object({
  label: z.string().optional(),
  imageUrl: z.string().optional(),
  uri: z.string().optional(),
  conditions: z.array(z.any()).optional() }).passthrough();

// ── [Shared] 공동 컴포넌트 ────────────────────────────────
export const ImageAssetSchema = z.object({
  uri: z.string(),
  isLocal: z.boolean().optional() }).passthrough();

// ── [StoryConfig] 전체 설정 검증 ─────────────────────────────────
export const StoryConfigSchema = z.object({
  worldSetting: z.string().optional(),
  characters: z.array(StoryCharacterSchema).default([]),
  chapters: z.array(StoryChapterSchema).default([]),
  storyStylePreset: z.string().optional(),
  story_style_preset: z.string().optional(),
  backgrounds: z.array(StoryBackgroundSchema).optional(),
  narratorFrequency: z.enum(['none', 'minimal', 'normal', 'rich']).optional(),
  storyHashtag: z.string().optional(),
  userSetting: z.any().optional(),
  // legacy
  world_setting: z.string().optional() }).passthrough();

// ─── Story Response (Story API) ─────────────────────────────────────────────
export const StoryResponseSchema = z.object({
  id: z.coerce.string(),
  title: z.string().default('Untitled'),
  description: z.string().optional(),
  genre: z.string().optional(),
  cover_url: z.string().optional(),
  coverUrl: z.string().optional(),
  author_nickname: z.string().optional(),
  story_config: StoryConfigSchema.optional(),
  authorId: z.string().optional(),
  created_at: z.string().optional(),
  view_count: z.number().optional(),
  like_count: z.number().optional() }).passthrough(); // Allow extra fields without failing

// ── [ChatMessage] 채팅 메시지 검증 ────────────────────────────────
export const ChatMessageSchema = z.object({
  id:          z.string(),
  speaker:     z.number(),
  speakerName: z.string(),
  content:     z.string(),
  timestamp:   z.number(),
  characterProfileUrl: z.string().optional(),
  isImportant: z.boolean().optional(),
  isIntro:     z.boolean().optional(),
  chapter_id:  z.string().optional(),
  emotionDeltas: z.record(z.string(), z.any()).optional(),
  bookmarked:  z.boolean().optional(),
  setId:       z.string().optional(),
  reactions:   z.array(z.string()).optional(),
  replyTo:     z.object({ id: z.string(), text: z.string(), senderName: z.string() }).nullable().optional(),
  isChoiceResult: z.boolean().optional(),
  choices:     z.array(z.any()).optional(),
  genre:       z.string().optional() }).passthrough();

// ── [ChatSession] 채팅 세션 영속화 검증 ────────────────────────────
export const ChatSessionSchema = z.object({
  storyId:             z.string(),
  messages:            z.array(ChatMessageSchema),
  currentChapterIndex: z.number().default(0),
  emotions:            z.record(z.string(), z.any()).default({}),
  dialogueHistory:     z.array(z.string()).default([]),
  turnCount:           z.number().default(0),
  lastUpdated:         z.number().default(0),
  modelId:             z.string().optional(),
  storyMeta:           z.object({
    title:      z.string(),
    coverUrl:   z.string(),
    authorName: z.string(),
    charNames:  z.array(z.string()),
    genre:      z.string().optional(),
    modelId:    z.string().optional() }).optional() }).passthrough();

export type SafeStoryResponse = z.infer<typeof StoryResponseSchema>;
export type SafeChatSession = z.infer<typeof ChatSessionSchema>;

// ── [UserProfile] 사용자 프로필 검증 ──────────────────────────────
export const UserProfileSchema = z.object({
  name: z.string().default('User'),
  handle: z.string().default('@user'),
  avatarUri: z.string().nullable().default(null),
  gender: z.enum(['male', 'female', 'other', '']).default(''),
  preferredGenres: z.array(z.string()).default([]),
  likedStoryIds: z.array(z.string()).default([]),
  followedAuthorIds: z.array(z.string()).default([]),
  blockedStoryIds: z.array(z.string()).default([]),
  blockedAuthorIds: z.array(z.string()).default([]),
  blockedHashtags: z.array(z.string()).default([]),
  reportedStoryIds: z.array(z.string()).default([]),
  playedGenreCounts: z.record(z.string(), z.number()).default({}) }).passthrough();

// ── [AuthUser] 로그인 정보 검증 ───────────────────────────────────
export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  photo: z.string().nullable().default(null),
  consentVersion: z.string(),
  consentDate: z.string(),
  jwtToken: z.string(),
  refreshToken: z.string().optional(),
  role: z.enum(['admin', 'user']).default('user'),
  avatarUri: z.string().optional(),
  token: z.string().optional() }).passthrough();

export type SafeUserProfile = z.infer<typeof UserProfileSchema>;
export type SafeAuthUser = z.infer<typeof AuthUserSchema>;
export type SafeStoryConfig = z.infer<typeof StoryConfigSchema>;
export type SafeStoryChapter = z.infer<typeof StoryChapterSchema>;
export type SafeStoryCharacter = z.infer<typeof StoryCharacterSchema>;
export type SafeEditorEmotions = z.infer<typeof EditorEmotionsSchema>;
