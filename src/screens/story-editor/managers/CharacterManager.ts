// src/screens/story-editor/managers/CharacterManager.ts
// 캐릭터 관리 로직
// 원본 주석 그대로 보존

import { useState, useCallback } from 'react';
import { ToastService } from '../../../components/Toast';
import { useLanguageStore } from '../../../store/languageStore';
import type { CharacterDraft, CharacterEditState, CharacterActions } from '../types/CharacterTypes';

const MAX_CHARACTERS = 20;

export function useCharacterManager(
  characters: CharacterDraft[],
  onUpdateCharacters: (characters: CharacterDraft[]) => void
): CharacterEditState & CharacterActions {
  const [editState, setEditState] = useState<CharacterEditState>({
    character: {
      id: 0,
      name: '',
      imageUris: [],
      personality: '',
      personalityExample: '' },
    isEditing: false,
    hasUnsavedChanges: false });

  // 캐릭터 업데이트
  const updateCharacter = useCallback((updates: Partial<CharacterDraft>) => {
    setEditState(prev => ({
      ...prev,
      character: { ...prev.character, ...updates },
      hasUnsavedChanges: true }));
  }, []);

  // 캐릭터 리셋
  const resetCharacter = useCallback(() => {
    setEditState({
      character: {
        id: 0,
        name: '',
        imageUris: [],
        personality: '',
        personalityExample: '' },
      isEditing: false,
      hasUnsavedChanges: false });
  }, []);

  // 캐릭터 저장
  const saveCharacter = useCallback(async () => {
    try {
      if (!editState.character.name.trim()) {
        ToastService.error(useLanguageStore.getState().t?.phCharName ?? '');
        return;
      }

      if (characters.length >= MAX_CHARACTERS && !editState.isEditing) {
        ToastService.error(`최대 ${MAX_CHARACTERS}명의 캐릭터를 추가할 수 있습니다`);
        return;
      }

      if (editState.isEditing) {
        // 기존 캐릭터 업데이트
        onUpdateCharacters(
          characters.map(char => 
            char.id === editState.character.id ? editState.character : char
          )
        );
        ToastService.success(useLanguageStore.getState().t?.saved ?? '');
      } else {
        // 새 캐릭터 추가 — id는 반드시 number (CharacterDraft.id: number)
        // 기존 캐릭터 중 최대 id + 1로 유일한 숫자 id 생성 (최소 2 보장)
        const maxId = characters.reduce(
          (max, c) => (typeof c.id === 'number' && c.id > max ? c.id : max),
          1,
        );
        const newCharacter = {
          ...editState.character,
          id: maxId + 1 };
        onUpdateCharacters([...characters, newCharacter]);
        ToastService.success(useLanguageStore.getState().t?.saved ?? '');
      }

      resetCharacter();
    } catch (error) {
      console.error('Failed to save character:', error);
      ToastService.error(useLanguageStore.getState().t?.saveFailed ?? useLanguageStore.getState().t?.error ?? '');
    }
  }, [editState, characters, onUpdateCharacters, resetCharacter]);

  // 캐릭터 삭제
  const deleteCharacter = useCallback(async () => {
    try {
      if (!editState.isEditing) return;

      onUpdateCharacters(characters.filter(char => char.id !== editState.character.id));
      ToastService.success(useLanguageStore.getState().t?.deleteSuccessToast ?? useLanguageStore.getState().t?.delete ?? '');
      resetCharacter();
    } catch (error) {
      console.error('Failed to delete character:', error);
      ToastService.error(useLanguageStore.getState().t?.error ?? '');
    }
  }, [editState.isEditing, editState.character.id, characters, onUpdateCharacters, resetCharacter]);

  // 이미지 업로드
  const uploadImages = useCallback(async (images: any[]) => {
    try {
      const imageUris = images.map(img => img.uri).filter(Boolean);
      updateCharacter({ imageUris });
      ToastService.success(useLanguageStore.getState().t?.imageAdded ?? '');
    } catch (error) {
      console.error('Failed to upload images:', error);
      ToastService.error(useLanguageStore.getState().t?.imageFailed ?? useLanguageStore.getState().t?.error ?? '');
    }
  }, [updateCharacter]);

  // 캐릭터 편집 시작
  const startEditing = useCallback((character: CharacterDraft) => {
    setEditState({
      character: { ...character },
      isEditing: true,
      hasUnsavedChanges: false });
  }, []);

  return {
    ...editState,
    updateCharacter,
    resetCharacter,
    saveCharacter,
    deleteCharacter,
    uploadImages,
    startEditing };
}
