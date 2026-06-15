﻿/* eslint-disable @typescript-eslint/no-unused-vars */
// src/store/emotionStore.ts
// ══════════════════════════════════════════════════════════════
// 온디바이스 감정 누적 스토어
//
// 기존 서버 /emotion-sync 를 완전 대체:
//   - 초기값: story_config.characters[].initialEmotions 에서 추출
//   - 누적:   AI 응답 @N:e1+val 파싱 후 applyDeltas() 호출
//   - 영속화: MMKV (앱 재시작 후 자동 복원)
//   - 리셋:   스토리 삭제 / 새 플레이 시 resetStory()
//
// 구조:
//   emotions[storyId][charId] = { e1, e2, e3, e4, e5 }
// ══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { mmkvZustandStorage } from '../utils/mmkvZustandStorage';
import type { EditorEmotions, StoryConfig } from '../types/StoryContract';
import { emotionDecayStep } from '../core/worklets/PhysicsWorklets';

// ── 타입 ──────────────────────────────────────────────────────

type CharEmotions  = Record<number, EditorEmotions>;
type StoryEmotions = Record<string, CharEmotions>;   // storyId → charId → emotions
/** [NEW ④] Momentum velocity: storyId -> charId -> e1~e5 변화율 */
type StoryVelocity = Record<string, Record<number, EditorEmotions>>;

const EMPTY_CHAR_EMOTIONS = {} as CharEmotions;

interface EmotionStore {
  /** 전체 감정 상태 (storyId -> charId -> e1~e5) */
  emotions: StoryEmotions;
  /** [NEW ④] Momentum velocity (storyId -> charId -> e1~e5 직전 변화율) */
  velocities: StoryVelocity;

  /**
   * 스토리 파일에서 초기값 추출 + 세팅
   * - 이미 저장된 감정이 있으면 덮어쓰지 않음 (진행 중 플레이 보존)
   * - force=true 이면 무조건 초기화 (새 플레이 시작)
   */
  initFromStory: (_storyId: string, _storyConfig: StoryConfig, _force?: boolean) => void;

  /**
   * AI 응답에서 파싱된 delta 배열 적용
   * delta: { charId, e1, e2, e3, e4, e5 } — 변화량, 없는 키는 0 취급
   */
  applyDeltas: (
    _storyId: string,
    _deltas: Array<{ charId: number } & Partial<EditorEmotions>>,
  ) => void;

  /** 특정 스토리 현재 감정 반환 */
  getEmotions: (_storyId: string) => CharEmotions;

  /**
   * 세션 복원 시 저장된 감정값을 덮어쓰기
   * JSON.stringify 비교 없이 바로 적용 — 스토어 setState 직접 패치 불필요
   */
  restoreEmotions: (_storyId: string, _emotions: CharEmotions) => void;

  /** 스토리 감정 초기화 (삭제 / 재시작) */
  resetStory: (_storyId: string) => void;
  /** 시간 경과에 따른 자연 감소 — 대화 없는 구간에서 중립(0)으로 서서히 수렴 */
  decayEmotionsToNeutral: (_storyId: string, _dtSeconds: number) => void;
}

// ── 유틸 ──────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(-100, Math.min(100, v));

/** NaN 전파 방지 헬퍼: delta 값이 NaN이면 0으로 대체 */
const safeNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : 0;
  return Number.isNaN(n) ? 0 : n;
};

/**
 * [NEW ④] Momentum Decay — 감정 관성 (Momentum SGD 방식)
 *
 * 기존 단순 clamp(base + delta)는 같은 delta=-20이라도
 * 직전에 감정이 쭉 오르던 중이었다면 갑자기 꺾이는 게 부자연스러움.
 *
 * Momentum SGD 방식으로 이전 변화율의 관성(γ=0.3)을 반영:
 *   velocity_t = γ × velocity_{t-1} + delta
 *   next       = clamp(base + velocity_t)
 *
 * γ=0.3: 이전 턴 변화의 30%가 다음 턴에 잔류 → 자연스러운 성장/하강
 */
const MOMENTUM_GAMMA = 0.3;

type EmotionKey = 'e1' | 'e2' | 'e3' | 'e4' | 'e5';
const EMOTION_KEYS: EmotionKey[] = ['e1', 'e2', 'e3', 'e4', 'e5'];

function asFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeEmotionSet(raw: unknown): EditorEmotions {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const values = Array.isArray(source.values) ? source.values : [];
  return {
    e1: asFiniteNumber(source.e1) ?? asFiniteNumber(source.valence) ?? asFiniteNumber(source.emotionE1) ?? asFiniteNumber(values[0]) ?? 0,
    e2: asFiniteNumber(source.e2) ?? asFiniteNumber(source.trust) ?? asFiniteNumber(source.emotionE2) ?? asFiniteNumber(values[1]) ?? 0,
    e3: asFiniteNumber(source.e3) ?? asFiniteNumber(source.dominance) ?? asFiniteNumber(source.emotionE3) ?? asFiniteNumber(values[2]) ?? 0,
    e4: asFiniteNumber(source.e4) ?? asFiniteNumber(source.arousal) ?? asFiniteNumber(source.emotionE4) ?? asFiniteNumber(values[3]) ?? 0,
    e5: asFiniteNumber(source.e5) ?? asFiniteNumber(source.attachment) ?? asFiniteNumber(source.emotionE5) ?? asFiniteNumber(values[4]) ?? 0,
  };
}

function mergeDeltas(
  current: EditorEmotions,
  delta: Partial<EditorEmotions>,
  velocity: Partial<EditorEmotions> = {},
): { next: EditorEmotions; nextVelocity: EditorEmotions } {
  const next: EditorEmotions         = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
  const nextVelocity: EditorEmotions = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };

  for (const k of EMOTION_KEYS) {
    // [BUG FIX] delta[k] -> 0 는 NaN을 통과시킴 (NaN은 null/undefined가 아님).
    // safeNum()으로 NaN을 0으로 대체해 감정값 NaN 영구 오염을 방지.
    const d  = safeNum(delta[k]);
    const v  = safeNum(velocity[k]);
    const vt = MOMENTUM_GAMMA * v + d;          // 관성 반영 속도
    next[k]         = clamp(safeNum((current[k] ?? 0)) + vt);
    nextVelocity[k] = vt;
  }

  return { next, nextVelocity };
}

/** story_config.characters 에서 초기 감정 맵 추출 */
function extractInitialEmotions(storyConfig: StoryConfig): CharEmotions {
  const chars = storyConfig.characters ?? [];
  const result: CharEmotions = {};
  for (const c of chars) {
    // 나레이터(id 0), 유저(id 1) 제외
    const id = c.id ?? c.char_index;
    if (typeof id !== 'number' || id < 2) continue;
    const normalized = normalizeEmotionSet(
      c.initialEmotions ??
      c.initial_emotions ??
      (c as StoryConfig['characters'][number] & { emotions?: unknown }).emotions ??
      c,
    );
    result[id] = normalized;
  }
  return result;
}

// ── 스토어 ────────────────────────────────────────────────────

export const useEmotionStore = create<EmotionStore>()(
  persist(
    immer(
      (set, get) => ({
      emotions: {},
      velocities: {},

      // ── 초기화 ───────────────────────────────────────────────
      initFromStory: (storyId, storyConfig, force = false) => {
        const existing = get().emotions[storyId];
        if (existing && Object.keys(existing).length > 0 && !force) {
          return;
        }
        const initial = extractInitialEmotions(storyConfig);
        const MAX_EMOTION_STORIES = 100;
        set(draft => {
          draft.emotions[storyId] = initial;
          // [BUG FIX] force=true이고 storyId가 이미 존재할 때 ids.length가 증가하지 않아
          // overflow <= 0이 되는 문제 수정.
          // 기존: Object.keys(draft.emotions) 에는 storyId가 이미 포함되어 있어서
          //   force=true 재초기화 시 ids.length가 그대로라 overflow=0 → 퇴거 안 됨.
          // 수정: storyId를 제외한 다른 키들의 수가 MAX_EMOTION_STORIES-1을 초과할 때만 퇴거
          const ids = Object.keys(draft.emotions);
          const otherIds = ids.filter(id => id !== storyId);
          const overflow = otherIds.length - (MAX_EMOTION_STORIES - 1);
          if (overflow > 0) {
            const toRemove = otherIds.slice(0, overflow);
            for (const id of toRemove) {
              delete draft.emotions[id];
              delete draft.velocities[id];
            }
          }
        });
      },

      // ── AI 응답 delta 적용 (Momentum Decay 적용) ────────────
      applyDeltas: (storyId, deltas) => {
        if (!deltas.length) return;
        set(draft => {
          if (!draft.emotions[storyId])   draft.emotions[storyId]   = {};
          if (!draft.velocities[storyId]) draft.velocities[storyId] = {};

          for (const d of deltas) {
            const { charId, ...delta } = d;
            const base = draft.emotions[storyId]![charId]   ?? { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
            const vel  = draft.velocities[storyId]![charId] ?? {};
            const { next: merged, nextVelocity } = mergeDeltas(base, delta, vel);
            draft.emotions[storyId]![charId]   = merged;
            draft.velocities[storyId]![charId] = nextVelocity;
          }
        });
      },

      // ── 자연 감소 (대화 없는 시간 경과 후 중립 복귀) ───────────
      // emotionDecayStep(current, baseline=0, rate=0.1, dt=초)
      // 선택지 이후 또는 일정 시간 경과 후 호출하면 감정이 서서히 0으로 수렴
      decayEmotionsToNeutral: (storyId: string, dtSeconds: number) => {
        set(draft => {
          const storyEmotions = draft.emotions[storyId];
          if (!storyEmotions) return;
          for (const charIdStr of Object.keys(storyEmotions)) {
            const charId = Number(charIdStr);
            const em = storyEmotions[charId];
            if (!em) continue;
            const keys = ['e1', 'e2', 'e3', 'e4', 'e5'] as const;
            for (const k of keys) {
              const v = em[k] ?? 0;
              if (Math.abs(v) < 1) { em[k] = 0; continue; }
              // rate=0.05: 매우 느린 자연 감소 (대략 20초에 63% 감소)
              em[k] = Math.round(emotionDecayStep(v, 0, 0.05, dtSeconds));
            }
          }
        });
      },

      // ── 조회 ─────────────────────────────────────────────────
      getEmotions: (storyId) => get().emotions[storyId] ?? EMPTY_CHAR_EMOTIONS,

      // ── 세션 복원 ─────────────────────────────────────────────
      restoreEmotions: (storyId, emotions) => {
        set(draft => { draft.emotions[storyId] = emotions; });
      },

      // ── 리셋 ─────────────────────────────────────────────────
      resetStory: (storyId) => {
        set(draft => {
          delete draft.emotions[storyId];
          delete draft.velocities[storyId];
        });
      } }),
    ),
    {
      name: 'emotion-store-v1',
      storage: createJSONStorage(() => mmkvZustandStorage),
      partialize: (s: EmotionStore) => ({ emotions: s.emotions, velocities: s.velocities }),
      skipHydration: true },
  ),
);

// ── 편의 셀렉터 ───────────────────────────────────────────────

/**
 * 특정 스토리 감정 구독 (컴포넌트용)
 * 감정이 바뀔 때만 리렌더 트리거
 */
export const useStoryEmotions = (storyId: string): CharEmotions =>
  useEmotionStore(s => s.emotions[storyId] ?? EMPTY_CHAR_EMOTIONS);

/**
 * [수정] skipHydration:true → App.tsx 등 진입점에서 이 함수를 1회 호출해야
 * MMKV에 저장된 감정값이 복원됨. 미호출 시 앱 재시작마다 감정이 초기화됨.
 */
export function rehydrateEmotionStore(): void {
  useEmotionStore.persist.rehydrate();
}

/**
 * [수정] emotionStore ↔ emotionSharedStore 동기화
 * 앱 재시작 후 MMKV에서 emotionStore가 복원되어도
 * Reanimated SharedValues(emotionSharedStore)는 초기값(0.5)으로 남음.
 * rehydrate 완료 후 이 함수를 호출해 SharedValues를 현재 emotions 값으로 업데이트.
 */
export function syncEmotionStoresToSharedValues(): void {
  const { emotions } = useEmotionStore.getState();
  for (const [storyId, charEmotions] of Object.entries(emotions)) {
    for (const [charIdStr, e] of Object.entries(charEmotions)) {
      const charId = Number(charIdStr);
      if (!Number.isFinite(charId)) continue;
      const normalized = [
        (Math.max(-100, Math.min(100, e.e1 ?? 0)) + 100) / 200,
        (Math.max(-100, Math.min(100, e.e2 ?? 0)) + 100) / 200,
        (Math.max(-100, Math.min(100, e.e3 ?? 0)) + 100) / 200,
        (Math.max(-100, Math.min(100, e.e4 ?? 0)) + 100) / 200,
        (Math.max(-100, Math.min(100, e.e5 ?? 0)) + 100) / 200,
      ];
      try {
        const { updateEmotionWithSpring } = require('./emotionSharedStore');
        updateEmotionWithSpring(storyId, charId, normalized);
      } catch {}
    }
  }
}

export default useEmotionStore;
