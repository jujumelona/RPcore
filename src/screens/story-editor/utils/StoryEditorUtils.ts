/**
 * src/screens/story-editor/utils/StoryEditorUtils.ts
 * 스토리 에디터 유틸리티 함수들
 */

import { storage as AsyncStorage } from '../../../utils/storage';
import type {
  DraftData,
  DraftMetadata,
  EditorState,
  ValidationResult,
  ValidationError,
  SaveRequest,
  SaveResult,
  LoadRequest,
  LoadResult } from '../types/StoryEditorTypes';

// Constants
const LEGACY_DRAFT_PREFIXES = ['draft_v1_', 'draft_v2_'];
const DRAFT_KEY_PREFIX = 'draft_v3_';

// ─── 드래프트 관리 ───────────────────────────────────────────────────────────
/**
 * 드래프트 버전 마이그레이션
 * 구버전(v1/v2) 드래프트가 있으면 조용히 삭제한다.
 * 구조가 바뀌어 구버전 드래프트를 그대로 로드하면 이상한 상태가 될 수 있다.
 * 마이그레이션 없이 삭제하는 것이 가장 안전하다.
 */
export async function migrateLegacyDrafts(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const legacyKeys = (allKeys as string[]).filter((k: string) =>
      LEGACY_DRAFT_PREFIXES.some((prefix: string) => k.startsWith(prefix)),
    );
    if (legacyKeys.length > 0) {
      await AsyncStorage.multiRemove(legacyKeys);
    }
  } catch {
    // 마이그레이션 실패 시 무시 — 앱 구동에 영향 없음
  }
}

/**
 * 드래프트 저장
 */
export async function saveDraft(
  storyId: string,
  state: Partial<EditorState>
): Promise<void> {
  try {
    const draftData: DraftData = {
      version: '3.0',
      timestamp: Date.now(),
      state };
    
    const key = `${DRAFT_KEY_PREFIX}${storyId}`;
    await AsyncStorage.setItem(key, JSON.stringify(draftData));
  } catch (error) {
    console.error('Failed to save draft:', error);
    throw new Error('드래프트 저장에 실패했습니다.');
  }
}

/**
 * 드래프트 로드
 */
export async function loadDraft(storyId: string): Promise<Partial<EditorState> | null> {
  try {
    const key = `${DRAFT_KEY_PREFIX}${storyId}`;
    const draftData = await AsyncStorage.getItem(key);
    
    if (!draftData) {
      return null;
    }
    
    const parsed: DraftData = JSON.parse(draftData);
    return parsed.state;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}

/**
 * 드래프트 삭제
 */
export async function deleteDraft(storyId: string): Promise<void> {
  try {
    const key = `${DRAFT_KEY_PREFIX}${storyId}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to delete draft:', error);
  }
}

/**
 * 모든 드래프트 목록 가져오기
 */
export async function getAllDrafts(): Promise<DraftMetadata[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const draftKeys = (allKeys as string[]).filter(k =>
      k.startsWith(DRAFT_KEY_PREFIX)
    );
    
    const drafts: DraftMetadata[] = [];
    
    for (const key of draftKeys) {
      try {
        const draftData = await AsyncStorage.getItem(key);
        if (draftData) {
          const parsed: DraftData = JSON.parse(draftData);
          const storyId = key.replace(DRAFT_KEY_PREFIX, '');
          
          drafts.push({
            id: storyId,
            title: parsed.state.storyTitle || '제목 없음',
            timestamp: parsed.timestamp,
            size: draftData.length,
            version: parsed.version });
        }
      } catch {
        // 개별 드래프트 로드 실패 시 무시
      }
    }
    
    return drafts.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get all drafts:', error);
    return [];
  }
}

// ─── 유효성 검사 ─────────────────────────────────────────────────────────────
/**
 * 스토리 기본 정보 유효성 검사
 */
export function validateStoryBasicInfo(state: EditorState): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  if (!state.storyTitle?.trim()) {
    errors.push({
      field: 'storyTitle',
      message: '스토리 제목을 입력해주세요.',
      severity: 'error' });
  } else if (state.storyTitle.length < 2) {
    errors.push({
      field: 'storyTitle',
      message: '스토리 제목은 2자 이상이어야 합니다.',
      severity: 'error' });
  } else if (state.storyTitle.length > 100) {
    warnings.push({
      field: 'storyTitle',
      message: '스토리 제목이 너무 깁니다. 100자 이하로 권장합니다.',
      severity: 'warning' });
  }
  
  if (!state.storyDesc?.trim()) {
    errors.push({
      field: 'storyDesc',
      message: '스토리 설명을 입력해주세요.',
      severity: 'error' });
  } else if (state.storyDesc.length < 10) {
    warnings.push({
      field: 'storyDesc',
      message: '스토리 설명이 너무 짧습니다. 더 자세히 설명해주세요.',
      severity: 'warning' });
  } else if (state.storyDesc.length > 500) {
    warnings.push({
      field: 'storyDesc',
      message: '스토리 설명이 너무 깁니다. 500자 이하로 권장합니다.',
      severity: 'warning' });
  }
  
  if (!state.worldSetting?.trim()) {
    errors.push({
      field: 'worldSetting',
      message: '세계관 설정을 입력해주세요.',
      severity: 'error' });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings };
}

/**
 * 캐릭터 유효성 검사
 */
export function validateCharacters(characters: any[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  if (characters.length < 2) {
    errors.push({
      field: 'characters',
      message: '최소 1명의 캐릭터가 필요합니다.',
      severity: 'error' });
  }
  
  characters.forEach((char, index) => {
    if (!char.name?.trim()) {
      errors.push({
        field: `characters[${index}].name`,
        message: `${index + 1}번 캐릭터의 이름을 입력해주세요.`,
        severity: 'error' });
    }
    
    if (!char.personality?.trim()) {
      warnings.push({
        field: `characters[${index}].personality`,
        message: `${index + 1}번 캐릭터의 성격을 설정해주세요.`,
        severity: 'warning' });
    }
    
    if (!char.imageUris || char.imageUris.length === 0) {
      warnings.push({
        field: `characters[${index}].imageUris`,
        message: `${index + 1}번 캐릭터의 이미지를 설정해주세요.`,
        severity: 'warning' });
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings };
}

/**
 * 챕터 유효성 검사
 */
export function validateChapters(chapters: any[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  if (chapters.length === 0) {
    errors.push({
      field: 'chapters',
      message: '최소 1개의 챕터가 필요합니다.',
      severity: 'error' });
  }
  
  chapters.forEach((chapter, index) => {
    if (!chapter.title?.trim()) {
      errors.push({
        field: `chapters[${index}].title`,
        message: `${index + 1}번 챕터의 제목을 입력해주세요.`,
        severity: 'error' });
    }
    
    if (!chapter.aiGoal?.trim()) {
      warnings.push({
        field: `chapters[${index}].aiGoal`,
        message: `${index + 1}번 챕터의 AI 목표를 설정해주세요.`,
        severity: 'warning' });
    }
    
    if (!chapter.chapterInfo?.trim()) {
      warnings.push({
        field: `chapters[${index}].chapterInfo`,
        message: `${index + 1}번 챕터의 정보를 입력해주세요.`,
        severity: 'warning' });
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings };
}

/**
 * 전체 에디터 상태 유효성 검사
 */
export function validateEditorState(state: EditorState): ValidationResult {
  const basicResult = validateStoryBasicInfo(state);
  const characterResult = validateCharacters(state.characters);
  const chapterResult = validateChapters(state.chapters);
  
  return {
    isValid: basicResult.isValid && characterResult.isValid && chapterResult.isValid,
    errors: [...basicResult.errors, ...characterResult.errors, ...chapterResult.errors],
    warnings: [...basicResult.warnings, ...characterResult.warnings, ...chapterResult.warnings] };
}

// ─── 저장/로드 헬퍼 ───────────────────────────────────────────────────────────
/**
 * 스토리 저장 요청 생성
 */
export function createSaveRequest(
  storyId: string,
  state: EditorState,
  isAutoSave: boolean = false
): SaveRequest {
  return {
    storyId,
    state,
    isAutoSave };
}

/**
 * 저장 결과 생성
 */
export function createSaveResult(
  success: boolean,
  storyId?: string,
  error?: string
): SaveResult {
  return {
    success,
    storyId,
    error,
    timestamp: success ? Date.now() : undefined };
}

/**
 * 로드 요청 생성
 */
export function createLoadRequest(
  storyId: string,
  version?: string
): LoadRequest {
  return {
    storyId,
    version };
}

/**
 * 로드 결과 생성
 */
export function createLoadResult(
  success: boolean,
  state?: EditorState,
  error?: string,
  metadata?: DraftMetadata
): LoadResult {
  return {
    success,
    state,
    error,
    metadata };
}

// ─── 기타 유틸리티 ───────────────────────────────────────────────────────────
/**
 * 고유 ID 생성
 */
export function generateUniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 캐릭터 ID 생성
 */
export function generateCharacterId(existingCharacters: any[]): number {
  if (existingCharacters.length === 0) return 2; // 0, 1은 예약됨
  
  const maxId = Math.max(...existingCharacters.map(c => c.id || 0));
  return maxId + 1;
}

/**
 * 챕터 ID 생성
 */
export function generateChapterId(existingChapters: any[]): string {
  if (existingChapters.length === 0) return 'chapter_1';
  
  const maxNum = Math.max(
    ...existingChapters.map(c => {
      const match = c.id?.match(/chapter_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
  );
  
  return `chapter_${maxNum + 1}`;
}

/**
 * 객체 깊은 복사
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;
  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}

/**
 * 파일 크기 포맷
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 시간 포맷
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  
  return date.toLocaleDateString();
}
