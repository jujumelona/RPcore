/**
 * src/screens/story-editor/core/StoryEditorCore.ts
 * 스토리 에디터 핵심 로직
 */

// ✅ [BUG FIX] useRef 누락 추가
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguageStore } from '../../../store/languageStore';
import { useAuthStore } from '../../../store/authStore';
import { useUserProfileStore } from '../../../store/userProfileStore';
import { LANGUAGE_LIST } from '../../../i18n/languages';
import { editorToSavePayload } from '../../../utils/PromptEngine';
import { sanitizeNullableImageUrl } from '../../../utils/imageUrlPolicy';
import type {
  EditorState,
  EditorTab,
  SaveResult,
  // ✅ [BUG FIX] 누락된 타입들 추가
  ValidationResult,
  TranslationState,
  EditorEventHandler,
  EditorEvent,
  CharacterDraft,
  ChapterDraft } from '../types/StoryEditorTypes';
import { migrateLegacyDrafts,
  saveDraft,
  loadDraft,
  validateEditorState,
  // ✅ [BUG FIX] 누락된 유틸 함수들 추가
  createSaveResult,
  createLoadResult,
  generateCharacterId,
  generateChapterId } from '../utils/StoryEditorUtils';

const REQUIRED_LANG_COUNT = LANGUAGE_LIST.length; // 15개 언어 모두 필요

export function useStoryEditorCore(initialStoryId?: string) {
  const { t } = useLanguageStore();
  const { user } = useAuthStore();
  // ✅ [BUG FIX] useUserProfileStore — 이제 import됨
  const { profile } = useUserProfileStore();
  
  // 기본 상태
  const [state, setState] = useState<EditorState>(() => createInitialState(initialStoryId));
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, errors: [], warnings: [] });

  const [_translation, _setTranslation] = useState<TranslationState>({
    isTranslating: false,
    currentLanguage: '',
    translatedContent: {},
    progress: 0,
    totalLanguages: REQUIRED_LANG_COUNT });
  
  // ✅ [BUG FIX] useRef — 이제 import됨
  const eventHandlersRef = useRef<EditorEventHandler[]>([]);
  
  // 초기 상태 생성
  function createInitialState(storyId?: string): EditorState {
    return {
      // ✅ [BUG FIX] generateNewStoryId -> 인라인 구현 (Utils에 없음)
      storyId: storyId || (Date.now().toString(36) + Math.random().toString(36).substr(2)),
      storyTitle: '',
      storyDesc: '',
      storyHashtag: '',
      storyGenre: '',
      worldSetting: '',
      // ✅ [BUG FIX] makeBaseCharacters -> 인라인 구현 (Utils에 없음)
      characters: [
        {
          id: 0,
          name: t?.speakerNarrator ?? '',
          imageUris: [],
          personality: '',
          personalityExample: '',
          age: '',
          gender: '',
          traits: '' },
        {
          id: 1,
          name: t?.speakerUser ?? '',
          imageUris: [],
          personality: '',
          personalityExample: '',
          age: '',
          gender: '',
          traits: '' },
      ],
      chapters: [],
      backgrounds: [],
      introMessages: {},
      narratorFrequency: 'normal',
      coverUrls: [],
      userSetting: '',
      multiLangTranslations: {},
      charMultiLangData: {},
      chapterMultiLangData: {},
      introMultiLangData: {},
      // ✅ [BUG FIX] profile?.nickname (not .avatar), user?.id (not .uid)
      authorName: profile?.name,
      authorId: user?.id,
      authorAvatar: sanitizeNullableImageUrl(profile?.avatarUri ?? null) ?? undefined,
      authorEmail: user?.email,
      activeTab: 'basic',
      isDirty: false,
      isLoading: false,
      isSaving: false,
      lastSavedAt: undefined };
  }
  
  // 이벤트 발생
  const emitEvent = useCallback((type: EditorEvent['type'], payload?: any) => {
    const event: EditorEvent = {
      type,
      payload,
      timestamp: Date.now() };
    eventHandlersRef.current.forEach(handler => {
      try { handler(event); } catch (error) { console.error('Event handler error:', error); }
    });
  }, []);
  
  const addEventHandler = useCallback((handler: EditorEventHandler) => {
    eventHandlersRef.current.push(handler);
  }, []);
  
  const removeEventHandler = useCallback((handler: EditorEventHandler) => {
    const index = eventHandlersRef.current.indexOf(handler);
    if (index > -1) eventHandlersRef.current.splice(index, 1);
  }, []);
  
  const updateState = useCallback((updates: Partial<EditorState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      const validationResult = validateEditorState(newState);
      setValidation(validationResult);
      if (updates.storyTitle || updates.storyDesc || updates.characters || updates.chapters) {
        emitEvent('stateChange', newState);
      }
      return newState;
    });
  }, [emitEvent]);
  
  const setActiveTab = useCallback((tab: EditorTab) => {
    updateState({ activeTab: tab });
  }, [updateState]);
  
  const addCharacter = useCallback(() => {
    const newId = generateCharacterId(state.characters);
    const newCharacter: CharacterDraft = {
      id: newId,
      name: '',
      imageUris: [],
      personality: '',
      personalityExample: '',
      age: '',
      gender: '',
      traits: '' };
    updateState({ characters: [...state.characters, newCharacter], isDirty: true });
    emitEvent('characterAdd', { character: newCharacter });
  }, [state.characters, updateState, emitEvent]);
  
  const updateCharacter = useCallback((index: number, character: CharacterDraft) => {
    const newCharacters = [...state.characters];
    newCharacters[index] = character;
    updateState({ characters: newCharacters, isDirty: true });
    emitEvent('characterUpdate', { index, character });
  }, [state.characters, updateState, emitEvent]);
  
  const deleteCharacter = useCallback((index: number) => {
    if (state.characters[index].id <= 1) return; // 내레이터(0)와 사용자(1)는 삭제 불가
    const newCharacters = state.characters.filter((_, i) => i !== index);
    updateState({ characters: newCharacters, isDirty: true });
    emitEvent('characterDelete', { index });
  }, [state.characters, updateState, emitEvent]);
  
  const addChapter = useCallback(() => {
    const newId = generateChapterId(state.chapters);
    const newChapter: ChapterDraft = {
      id: newId,
      title: '',
      aiGoal: '',
      characterGoals: {},
      prevSummary: '',
      chapterInfo: '',
      triggers: [],
      choiceEvents: [],
      intro: [] };
    updateState({ chapters: [...state.chapters, newChapter], isDirty: true });
    emitEvent('chapterAdd', { chapter: newChapter });
  }, [state.chapters, updateState, emitEvent]);
  
  const updateChapter = useCallback((index: number, chapter: ChapterDraft) => {
    const newChapters = [...state.chapters];
    newChapters[index] = chapter;
    updateState({ chapters: newChapters, isDirty: true });
    emitEvent('chapterUpdate', { index, chapter });
  }, [state.chapters, updateState, emitEvent]);
  
  const deleteChapter = useCallback((index: number) => {
    const newChapters = state.chapters.filter((_, i) => i !== index);
    updateState({ chapters: newChapters, isDirty: true });
    emitEvent('chapterDelete', { index });
  }, [state.chapters, updateState, emitEvent]);
  
  const moveChapter = useCallback((fromIndex: number, toIndex: number) => {
    const newChapters = [...state.chapters];
    const [movedChapter] = newChapters.splice(fromIndex, 1);
    newChapters.splice(toIndex, 0, movedChapter);
    updateState({ chapters: newChapters, isDirty: true });
    emitEvent('chapterMove', { fromIndex, toIndex });
  }, [state.chapters, updateState, emitEvent]);
  
  const saveDraftToStorage = useCallback(async () => {
    try {
      await saveDraft(state.storyId, state);
      updateState({ isDirty: false, lastSavedAt: Date.now() });
      emitEvent('save', { storyId: state.storyId });
      return createSaveResult(true, state.storyId);
    } catch (error) {
      console.error('Failed to save draft:', error);
      return createSaveResult(false, undefined, '드래프트 저장에 실패했습니다.');
    }
  }, [state, updateState, emitEvent]);
  
  const loadDraftFromStorage = useCallback(async (storyId: string) => {
    try {
      const draftState = await loadDraft(storyId);
      if (draftState) {
        setState(prev => ({ ...prev, ...draftState }));
        emitEvent('load', { storyId });
        return createLoadResult(true, draftState as EditorState, undefined);
      }
      return createLoadResult(false, undefined, '드래프트를 찾을 수 없습니다.');
    } catch (error) {
      console.error('Failed to load draft:', error);
      return createLoadResult(false, undefined, '드래프트 로드에 실패했습니다.');
    }
  }, [emitEvent]);
  
  const saveToServer = useCallback(async (): Promise<SaveResult> => {
    try {
      updateState({ isSaving: true });
      const { StoryAPI } = await import('../../../api/StoryAPI');
      const token = useAuthStore.getState().user?.jwtToken;

      // [BUG FIX] 인라인 payload 직접 구성 → editorToSavePayload() 사용
      // 기존 저장 payload 누락 항목(intro imageUri, characters.char_index 등)을 한 번에 정리
      // 수정: PromptEngine.editorToSavePayload()로 일관된 변환 보장
      const payload = editorToSavePayload(state.storyId, {
        storyTitle:           state.storyTitle,
        storyDesc:            state.storyDesc,
        storyHashtag:         state.storyHashtag,
        storyGenre:           state.storyGenre,
        worldSetting:         state.worldSetting,
        characters:           state.characters,
        chapters:             state.chapters,
        backgrounds:          state.backgrounds,
        introMessages:        state.introMessages,
        narratorFrequency:    state.narratorFrequency,
        coverUrls:            state.coverUrls,
        userSetting:          state.userSetting,
        multiLangTranslations: state.multiLangTranslations,
        charMultiLangData:    state.charMultiLangData,
        chapterMultiLangData: state.chapterMultiLangData,
        introMultiLangData:   state.introMultiLangData,
        authorName:           state.authorName,
        authorId:             state.authorId,
        authorAvatar:         state.authorAvatar,
        authorEmail:          state.authorEmail });

      let savedId: string | undefined;
      if (state.storyId && state.storyId !== 'new') {
        // [BUG FIX] StoryAPI.updateStory는 PUT을 사용해 approved 스토리를 draft로 되돌림
        // 기존: StoryAPI.updateStory() → PUT /api/stories/:id → approved → draft로 초기화
        // 수정: PATCH /story-meta/:id 사용 (StoryEditorScreen.src.tsx와 동일 패턴)
        const { authedFetch: _fetch } = await import('../../../utils/authedFetch');
        const res = await _fetch(`/story-meta/${state.storyId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload) });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Server error ${res.status}`);
        }
        savedId = state.storyId;
      } else {
        const created = await StoryAPI.createStory(
          payload as any,
          token ?? undefined,
        );
        // [BUG FIX] createStory가 null 반환 시 실패로 처리
        if (!created) {
          updateState({ isSaving: false });
          return createSaveResult(false, undefined, '서버에서 ID를 반환하지 않았습니다.');
        }
        savedId = created;
      }

      updateState({
        isDirty: false,
        lastSavedAt: Date.now(),
        isSaving: false,
        ...(savedId ? { storyId: savedId } : {}) });
      emitEvent('save', { storyId: savedId ?? state.storyId, isServerSave: true });
      return createSaveResult(true, savedId ?? state.storyId);
    } catch (error) {
      console.error('Failed to save to server:', error);
      updateState({ isSaving: false });
      return createSaveResult(false, undefined, '서버 저장에 실패했습니다.');
    }
  }, [state, updateState, emitEvent]);
  

  

  

  
  useEffect(() => {
    migrateLegacyDrafts();
    if (initialStoryId) {
      loadDraftFromStorage(initialStoryId);
    } else {
      // ✅ [BUG FIX] 새 스토리 생성 시 즉시 임시저장으로 데이터 정리
      // AI 채팅에서 넘어온 복잡한 객체 구조를 직렬화/역직렬화로 정리
      setTimeout(() => {
        saveDraftToStorage();
      }, 100);
    }
  }, [initialStoryId, loadDraftFromStorage, saveDraftToStorage]);
  
  // [BUG FIX] 자동저장 effect
  // 기존: deps에 saveDraftToStorage 포함 → saveDraftToStorage는 state 전체가 deps이므로
  //       state 변경마다 재생성 → isDirty=true인 상태에서 아무 변경이 일어나면
  //       5초 타이머가 계속 리셋되어 자동저장이 영원히 발생하지 않음.
  // 수정: isDirty 변경에만 반응. saveDraftToStorage는 ref로 최신값 참조.
  // [BUG FIX] isDirty true→false→true 전환 시 타이머 중복 방지
  //   isDirty=false가 되면 cleanup에서 clearTimeout 실행 → 기존 타이머 취소
  //   isDirty=true가 되면 새 타이머 시작 → 단 하나의 타이머만 활성
  const saveDraftRef = useRef(saveDraftToStorage);
  useEffect(() => { saveDraftRef.current = saveDraftToStorage; }, [saveDraftToStorage]);

  useEffect(() => {
    if (!state.isDirty) return;
    const timer = setTimeout(() => {
      // 저장 시점에 아직 dirty인 경우에만 저장 (완료 후 즉시 편집 시 중복 방지)
      if (saveDraftRef.current) saveDraftRef.current();
    }, 5000);
    return () => clearTimeout(timer);
  }, [state.isDirty]);
  
  return {
    state,
    validation,
    translation: _translation,
    updateState,
    setActiveTab,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addChapter,
    updateChapter,
    deleteChapter,
    moveChapter,
    saveDraftToStorage,
    loadDraftFromStorage,
    saveToServer,
    addEventHandler,
    removeEventHandler,
    emitEvent };
}
