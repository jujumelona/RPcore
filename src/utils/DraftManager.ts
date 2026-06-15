// src/utils/DraftManager.ts
// ═══════════════════════════════════════════════════════════════════
//  Mattermost 드래프트 자동저장 패턴 이식
//  — 게시글/댓글 작성 중 앱 종료 시 MMKV에 자동 저장
//  — 화면 재진입 시 드래프트 자동 복원
//
//  ✅ MMKV 영속화
//  ✅ 화면/컨텍스트별 드래프트 분리
//  ✅ 만료 자동 삭제 (7일)
//  ✅ React 훅 제공
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from 'react';
import { createMMKVStorage } from './mmkvZustandStorage';

// ── Types ──────────────────────────────────────────────────────────

export interface Draft {
  key: string;
  title: string;
  content: string;
  /** 추가 메타 (boardType 등) */
  meta?: Record<string, unknown>;
  updatedAt: number;
}

// ── Storage ───────────────────────────────────────────────────────

const storage = createMMKVStorage({ id: 'drafts' });
const DRAFTS_INDEX = 'drafts-index';
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function loadIndex(): string[] {
  try {
    const raw = storage.getItem(DRAFTS_INDEX) as string | null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveIndex(keys: string[]): void {
  storage.setItem(DRAFTS_INDEX, JSON.stringify(keys));
}

// ── DraftManager ──────────────────────────────────────────────────

export const DraftManager = {
  /**
   * 드래프트 저장 (upsert)
   * @param key 화면별 고유 키 (예: 'write-post', 'comment-{postId}')
   */
  save(key: string, title: string, content: string, meta?: Record<string, unknown>): void {
    const draft: Draft = { key, title, content, meta, updatedAt: Date.now() };
    storage.setItem(`draft:${key}`, JSON.stringify(draft));

    // [BUG-17 FIX] Set을 사용해 인덱스 중복 방지 및 기존 중복 항목 정리
    const idx = loadIndex();
    const newIdx = Array.from(new Set([...idx, key]));
    if (newIdx.length !== idx.length) {
      saveIndex(newIdx);
    }
  },

  /** 드래프트 로드 */
  load(key: string): Draft | null {
    try {
      const raw = storage.getItem(`draft:${key}`) as string | null;
      if (!raw) return null;
      const draft: Draft = JSON.parse(raw);
      // 만료 체크
      if (Date.now() - draft.updatedAt > EXPIRY_MS) {
        this.delete(key);
        return null;
      }
      return draft;
    } catch { return null; }
  },

  /** 드래프트 삭제 */
  delete(key: string): void {
    storage.removeItem(`draft:${key}`);
    const idx = loadIndex().filter(k => k !== key);
    saveIndex(idx);
  },

  /** 모든 드래프트 목록 */
  listAll(): Draft[] {
    const idx = loadIndex();
    const drafts: Draft[] = [];
    const now = Date.now();
    const validKeys: string[] = [];

    for (const key of idx) {
      try {
        const raw = storage.getItem(`draft:${key}`) as string | null;
        if (!raw) continue;
        const draft: Draft = JSON.parse(raw);
        if (now - draft.updatedAt > EXPIRY_MS) {
          storage.removeItem(`draft:${key}`);
          continue;
        }
        drafts.push(draft);
        validKeys.push(key);
      } catch {}
    }

    // 만료된 것들 인덱스에서 정리
    if (validKeys.length !== idx.length) saveIndex(validKeys);

    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** 전체 삭제 */
  clearAll(): void {
    const idx = loadIndex();
    for (const key of idx) storage.removeItem(`draft:${key}`);
    saveIndex([]);
  } };

// ── React Hook ────────────────────────────────────────────────────

/**
 * 드래프트 자동저장/복원 훅
 *
 * @param draftKey 화면별 고유 키
 * @param debounceMs 자동저장 디바운스 (기본 3초)
 */
export function useDraft(
  draftKey: string,
  debounceMs = 3000,
) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마운트 시 복원
  useEffect(() => {
    const saved = DraftManager.load(draftKey);
    if (saved) setDraft(saved);
    setIsRestored(true);
  }, [draftKey]);

  // 자동저장 (디바운스)
  const autoSave = useCallback(
    (title: string, content: string, meta?: Record<string, unknown>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (title.trim() || content.trim()) {
          DraftManager.save(draftKey, title, content, meta);
        }
      }, debounceMs);
    },
    [draftKey, debounceMs],
  );

  // 게시 성공 시 드래프트 삭제
  const discard = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    DraftManager.delete(draftKey);
    setDraft(null);
  }, [draftKey]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    /** 복원된 드래프트 (없으면 null) */
    draft,
    /** 복원 완료 여부 */
    isRestored,
    /** 내용 변경 시 호출 — 디바운스 자동저장 */
    autoSave,
    /** 게시 성공 시 호출 — 드래프트 삭제 */
    discard };
}
