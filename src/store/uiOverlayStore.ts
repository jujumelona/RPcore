// src/store/uiOverlayStore.ts
// ═══════════════════════════════════════════════════════════════════
// 전역 UI 오버레이 상호배제 중앙 관리
//
// 사용법:
//   const { openPanel, closePanel, closeAll } = useUiOverlayStore();
//   openPanel('community_lang');   // 다른 열린 패널은 자동으로 닫힘
//   closePanel('community_lang');
//   closeAll();
//
// 패널 ID 컨벤션: '{screen}_{panel}'
//   예) 'community_lang', 'home_sort', 'search_storySort', 'search_charSort'
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';

interface UiOverlayStore {
  /** 현재 열려있는 패널 ID (null = 모두 닫힘) */
  activePanel: string | null;
  /** 패널 열기 — 다른 패널은 자동 닫힘 */
  openPanel: (_id: string) => void;
  /** 패널 닫기 */
  closePanel: (_id: string) => void;
  /** 토글 — 이미 열려있으면 닫고, 닫혀있으면 열기 */
  togglePanel: (_id: string) => void;
  /** 모두 닫기 */
  closeAll: () => void;
  /** 특정 패널이 열려있는지 확인 */
  isOpen: (_id: string) => boolean;
}

export const useUiOverlayStore = create<UiOverlayStore>((set, get) => ({
  activePanel: null,

  openPanel: (id) => set({ activePanel: id }),

  closePanel: (id) => set((s) => ({
    activePanel: s.activePanel === id ? null : s.activePanel })),

  togglePanel: (id) => set((s) => ({
    activePanel: s.activePanel === id ? null : id })),

  closeAll: () => set({ activePanel: null }),

  isOpen: (id) => get().activePanel === id }));
