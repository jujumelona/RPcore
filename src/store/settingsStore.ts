// src/store/settingsStore.ts
// ══════════════════════════════════════════════════════════════
//  앱 설정 전역 스토어
//
//  - hapticEnabled        : 진동 피드백 전역 on/off
//  - streamingTyping      : 타이핑 연출 on/off (low 기기 배터리 절약)
//  - chatFontSize         : 채팅 폰트 크기 (sm/md/lg)
//  - autoScrollEnabled    : 답변 생성 시 자동 스크롤 고정
//  - showNarratorBubble   : 나레이터 버블 표시 여부
//
// ✅ [OPT] 수동 MMKV 저장/로드 -> Zustand persist + mmkvZustandStorage
//    기존: loadSettings()/saveSettings() 수동 호출,
//          initSettingsStore()를 App.tsx에서 별도 호출 필요
//    수정: persist 미들웨어가 자동으로 직렬화/역직렬화 처리
//          mmkvZustandStorage는 Lazy 초기화이므로 모듈 로드 시점 크래시 없음
//          -> App.tsx의 initSettingsStore() 호출 불필요 (하위호환 함수로 유지)
//
// ✅ [OPT] v1 키 마이그레이션 -> migrate 옵션으로 처리
// ══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvZustandStorage } from '../utils/mmkvZustandStorage';

export type ChatFontSize = 'sm' | 'md' | 'lg';

interface AppSettings {
  hapticEnabled:      boolean;
  streamingTyping:    boolean;
  chatFontSize:       ChatFontSize;
  autoScrollEnabled:  boolean;
  showNarratorBubble: boolean;
  allowCellularDownload: boolean; // 셀룰러 모델 다운로드 허용 (기본 false = Wi-Fi 권장)
}

const DEFAULT_SETTINGS: AppSettings = {
  hapticEnabled:      false,
  streamingTyping:    true,
  chatFontSize:       'md',
  autoScrollEnabled:  true,
  showNarratorBubble: true,
  allowCellularDownload: false };

interface SettingsStore extends AppSettings {
  setHapticEnabled:      (_v: boolean) => void;
  setStreamingTyping:    (_v: boolean) => void;
  /** chatFontSize를 직접 설정 (sm / md / lg) */
  setChatFontSize:       (_v: ChatFontSize) => void;
  /** chatFontSize를 sm → md → lg → sm 순서로 순환 */
  cycleChatFontSize:     () => void;
  setAutoScrollEnabled:       (_v: boolean) => void;
  setShowNarratorBubble:      (_v: boolean) => void;
  setAllowCellularDownload:   (_v: boolean) => void;
}

const FONT_SIZE_CYCLE: ChatFontSize[] = ['sm', 'md', 'lg'];

// ✅ [OPT] persist 미들웨어 + mmkvZustandStorage
//    - 상태 변경 시 자동으로 MMKV에 직렬화 저장
//    - 앱 재시작 시 자동 rehydrate (initSettingsStore() 불필요)
//    - partialize로 함수 제외, 값만 저장
//    - mmkvZustandStorage는 Lazy 초기화 -> 모듈 로드 시점 크래시 없음
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setHapticEnabled:      (v) => set({ hapticEnabled: v }),
      setStreamingTyping:    (v) => set({ streamingTyping: v }),
      setChatFontSize:       (v) => set({ chatFontSize: v }),
      cycleChatFontSize: () => {
        const cur  = get().chatFontSize;
        const next = FONT_SIZE_CYCLE[(FONT_SIZE_CYCLE.indexOf(cur) + 1) % FONT_SIZE_CYCLE.length];
        set({ chatFontSize: next });
      },
      setAutoScrollEnabled:  (v) => set({ autoScrollEnabled: v }),
      setShowNarratorBubble:    (v) => set({ showNarratorBubble: v }),
      setAllowCellularDownload: (v) => set({ allowCellularDownload: v }) }),
    {
      name:    'app_settings_v2',
      storage: createJSONStorage(() => mmkvZustandStorage),
      // ✅ [FIX] Nitro/MMKV v4 대응: 자동 Hydration 비활성화
      //    모듈 로드 시점에 동기적으로 MMKV에 접근하지 않도록 함.
      //    App.tsx의 useEffect에서 수동으로 rehydrate() 호출 필요.
      skipHydration: true,
      // 함수 제외, 설정 값만 영속화
      partialize: (s): AppSettings => ({
        hapticEnabled:      s.hapticEnabled,
        streamingTyping:    s.streamingTyping,
        chatFontSize:       s.chatFontSize,
        autoScrollEnabled:  s.autoScrollEnabled,
        showNarratorBubble:    s.showNarratorBubble,
        allowCellularDownload: s.allowCellularDownload }),
      // ✅ v1 키 마이그레이션 — 이전 버전 데이터와 병합
      migrate: (persisted, version) => {
        if (version === 0) {
          // v1 키에서 마이그레이션 (old key: 'app_settings_v1')
          return { ...DEFAULT_SETTINGS, ...(persisted as Partial<AppSettings>) };
        }
        return persisted as AppSettings;
      },
      version: 1 },
  ),
);

/**
 * @deprecated persist 미들웨어가 자동으로 rehydrate하므로 호출 불필요.
 *             App.tsx 호환성을 위해 no-op으로 유지.
 */
export function initSettingsStore(): void {
  // no-op: persist 미들웨어가 앱 시작 시 자동으로 MMKV에서 로드함
}
