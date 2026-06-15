/* eslint-disable @typescript-eslint/no-unused-vars */
// src/store/agentPresetStore.ts
// ═══════════════════════════════════════════════════════════════════
// Lobe Chat Agent Store 패턴 이식
// — 에이전트(캐릭터) 프리셋 관리 시스템
//
// ✅ 프리셋 CRUD (빌트인 + 커스텀)
// ✅ 샘플링 설정 (temperature, topP 등)
// ✅ 프리셋 가져오기/내보내기 (JSON)
// ✅ Zustand + MMKV persist
// ✅ 태그 기반 검색/필터링
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from '../utils/mmkvZustandStorage';

// ── Types ──────────────────────────────────────────────────────────

export interface AgentSamplingConfig {
  temperature: number;
  topP: number;
  topK?: number;
  minP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
  maxTokens?: number;
}

export interface AgentPreset {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  samplingConfig: AgentSamplingConfig;
  greetingMessage: string;
  tags: string[];
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
  /** 사용 횟수 (인기 순 정렬용) */
  usageCount: number;
}

export interface AgentPresetDraft {
  name: string;
  avatar?: string;
  description?: string;
  systemPrompt: string;
  samplingConfig?: Partial<AgentSamplingConfig>;
  greetingMessage?: string;
  tags?: string[];
}

// ── Store Interface ───────────────────────────────────────────────

interface AgentPresetState {
  presets: Record<string, AgentPreset>;
  activePresetId: string | null;

  // CRUD
  addPreset: (_draft: AgentPresetDraft) => AgentPreset;
  updatePreset: (_id: string, _patch: Partial<AgentPresetDraft>) => void;
  deletePreset: (_id: string) => void;
  duplicatePreset: (_id: string) => AgentPreset | null;

  // 활성 프리셋
  setActivePreset: (_id: string | null) => void;
  getActivePreset: () => AgentPreset | null;

  // 조회
  getPreset: (_id: string) => AgentPreset | null;
  getAllPresets: () => AgentPreset[];
  getPresetsByTag: (_tag: string) => AgentPreset[];
  searchPresets: (_query: string) => AgentPreset[];

  // 사용 통계
  incrementUsage: (_id: string) => void;
  getPopularPresets: (_limit?: number) => AgentPreset[];

  // 가져오기/내보내기
  exportPreset: (_id: string) => string | null;
  exportAll: () => string;
  importPresets: (_jsonStr: string) => { imported: number; errors: number };
}

// ── Constants ─────────────────────────────────────────────────────

const DEFAULT_SAMPLING: AgentSamplingConfig = {
  temperature: 0.8,
  topP: 0.95,
  topK: 40,
  minP: 0.05,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repeatPenalty: 1.1,
  maxTokens: 400 };

const mmkvStorage = createMMKVStorage({ id: 'agent-presets' });

// ── Built-in Presets ──────────────────────────────────────────────

function createBuiltInPresets(): Record<string, AgentPreset> {
  const now = Date.now();
  const presets: AgentPreset[] = [
    {
      id: 'builtin-creative',
      name: '창의적 스토리텔러',
      avatar: '🎭',
      description: '풍부한 묘사와 감정 표현에 특화된 프리셋',
      systemPrompt:
        'You are a creative storytelling assistant. Write vivid, emotionally rich narratives with detailed descriptions of settings, character emotions, and actions. Use literary techniques like metaphors and foreshadowing.',
      samplingConfig: { ...DEFAULT_SAMPLING, temperature: 0.9, topP: 0.97 },
      greetingMessage: '어떤 이야기를 함께 만들어볼까요? 🎭',
      tags: ['creative', 'storytelling', 'descriptive'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 0 },
    {
      id: 'builtin-romance',
      name: '로맨스 전문가',
      avatar: '💕',
      description: '로맨스 장르에 최적화된 대화 생성',
      systemPrompt:
        'You specialize in romantic storytelling. Create tender moments, meaningful dialogue between characters, and emotional tension. Focus on character chemistry and relationship development.',
      samplingConfig: { ...DEFAULT_SAMPLING, temperature: 0.85, repeatPenalty: 1.15 },
      greetingMessage: '어떤 로맨스를 꿈꾸고 계신가요? 💕',
      tags: ['romance', 'emotional', 'dialogue'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 0 },
    {
      id: 'builtin-action',
      name: '액션 마스터',
      avatar: '⚔️',
      description: '긴장감 넘치는 액션과 전투 묘사',
      systemPrompt:
        'You are an action-oriented narrator. Create intense fight scenes, chase sequences, and dramatic confrontations. Use short, punchy sentences during action and build suspense between scenes.',
      samplingConfig: { ...DEFAULT_SAMPLING, temperature: 0.75, topK: 50 },
      greetingMessage: '모험이 기다리고 있습니다! ⚔️',
      tags: ['action', 'adventure', 'combat'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 0 },
    {
      id: 'builtin-precise',
      name: '정밀 서술',
      avatar: '🎯',
      description: '간결하고 정확한 서술 스타일',
      systemPrompt:
        'Write with precision and clarity. Avoid purple prose. Every word should serve a purpose. Focus on concrete details and clear narrative structure.',
      samplingConfig: { ...DEFAULT_SAMPLING, temperature: 0.6, topP: 0.9, maxTokens: 300 },
      greetingMessage: '이야기를 시작합니다.',
      tags: ['precise', 'minimal', 'clean'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 0 },
  ];

  const map: Record<string, AgentPreset> = {};
  for (const p of presets) map[p.id] = p;
  return map;
}

// ── Store ─────────────────────────────────────────────────────────

export const useAgentPresetStore = create<AgentPresetState>()(
  persist(
    (set, get) => ({
      presets: createBuiltInPresets(),
      activePresetId: null,

      addPreset: (draft) => {
        const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const preset: AgentPreset = {
          id,
          name: draft.name,
          avatar: draft.avatar ?? '🤖',
          description: draft.description ?? '',
          systemPrompt: draft.systemPrompt,
          samplingConfig: { ...DEFAULT_SAMPLING, ...draft.samplingConfig },
          greetingMessage: draft.greetingMessage ?? '',
          tags: draft.tags ?? [],
          isBuiltIn: false,
          createdAt: now,
          updatedAt: now,
          usageCount: 0 };
        set(s => ({ presets: { ...s.presets, [id]: preset } }));
        return preset;
      },

      updatePreset: (id, patch) => {
        set(s => {
          const existing = s.presets[id];
          if (!existing || existing.isBuiltIn) return s;
          return {
            presets: {
              ...s.presets,
              [id]: {
                ...existing,
                ...patch,
                samplingConfig: patch.samplingConfig
                  ? { ...existing.samplingConfig, ...patch.samplingConfig }
                  : existing.samplingConfig,
                tags: patch.tags ?? existing.tags,
                updatedAt: Date.now() } } };
        });
      },

      deletePreset: (id) => {
        set(s => {
          if (s.presets[id]?.isBuiltIn) return s;
          const newPresets = { ...s.presets };
          delete newPresets[id];
          return {
            presets: newPresets,
            activePresetId: s.activePresetId === id ? null : s.activePresetId };
        });
      },

      duplicatePreset: (id) => {
        const source = get().presets[id];
        if (!source) return null;
        return get().addPreset({
          name: `${source.name} (복사)`,
          avatar: source.avatar,
          description: source.description,
          systemPrompt: source.systemPrompt,
          samplingConfig: { ...source.samplingConfig },
          greetingMessage: source.greetingMessage,
          tags: [...source.tags] });
      },

      setActivePreset: (id) => set({ activePresetId: id }),

      getActivePreset: () => {
        const { presets, activePresetId } = get();
        return activePresetId ? presets[activePresetId] ?? null : null;
      },

      getPreset: (id) => get().presets[id] ?? null,

      getAllPresets: () =>
        Object.values(get().presets)
          .sort((a, b) => (b as AgentPreset).updatedAt - (a as AgentPreset).updatedAt),

      getPresetsByTag: (tag) =>
        Object.values(get().presets).filter(p =>
          (p as AgentPreset).tags.some(t => t.toLowerCase() === tag.toLowerCase()),
        ),

      searchPresets: (query) => {
        const q = query.toLowerCase().trim();
        if (!q) return get().getAllPresets();
        return Object.values(get().presets).filter(p => {
          const preset = p as AgentPreset;
          return preset.name.toLowerCase().includes(q) ||
                 preset.description.toLowerCase().includes(q) ||
                 preset.tags.some(t => t.toLowerCase().includes(q));
        });
      },

      incrementUsage: (id) => {
        set(s => {
          const p = s.presets[id];
          if (!p) return s;
          const preset = p as AgentPreset;
          return {
            presets: {
              ...s.presets,
              [id]: { ...preset, usageCount: preset.usageCount + 1 } } };
        });
      },

      getPopularPresets: (limit = 10) =>
        Object.values(get().presets)
          .sort((a, b) => (b as AgentPreset).usageCount - (a as AgentPreset).usageCount)
          .slice(0, limit),

      exportPreset: (id) => {
        const p = get().presets[id];
        if (!p) return null;
        const preset = p as AgentPreset;
        return JSON.stringify(
          { ...preset, isBuiltIn: false, id: undefined, usageCount: 0 },
          null,
          2,
        );
      },

      exportAll: () => {
        const all = Object.values(get().presets).map(p => {
          const preset = p as AgentPreset;
          return {
            ...preset,
            isBuiltIn: false,
            usageCount: 0 };
        });
        return JSON.stringify(all, null, 2);
      },

      importPresets: (jsonStr) => {
        let imported = 0;
        let errors = 0;
        try {
          const parsed = JSON.parse(jsonStr);
          const list: any[] = Array.isArray(parsed) ? parsed : [parsed];

          for (const item of list) {
            try {
              if (!item.name || !item.systemPrompt) {
                errors++;
                continue;
              }
              get().addPreset({
                name: item.name,
                avatar: item.avatar,
                description: item.description,
                systemPrompt: item.systemPrompt,
                samplingConfig: item.samplingConfig,
                greetingMessage: item.greetingMessage,
                tags: item.tags });
              imported++;
            } catch {
              errors++;
            }
          }
        } catch {
          errors++;
        }
        return { imported, errors };
      } }),
    {
      name: 'agent-presets-v1',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({
        presets: s.presets,
        activePresetId: s.activePresetId }),
      merge: (persisted: any, current: AgentPresetState) => {
        // 빌트인 프리셋은 항상 최신 유지
        const builtIns = createBuiltInPresets();
        const merged = { ...builtIns, ...(persisted?.presets ?? {}) };
        // 빌트인은 최신 버전으로 덮어쓰기
        for (const id of Object.keys(builtIns)) {
          merged[id] = builtIns[id];
        }
        return {
          ...current,
          ...(persisted ?? {}),
          presets: merged };
      } },
  ),
);
