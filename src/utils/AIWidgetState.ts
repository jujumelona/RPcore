﻿// src/utils/AIWidgetState.ts
// ═══════════════════════════════════════════════════════════
// Android 홈 화면 위젯에 AI 추론 상태를 브로드캐스트하는 유틸리티
// AIWidgetModule(Kotlin)이 SharedPreferences에 상태를 기록하고
// 위젯을 강제 갱신한다.
//
// 사용법:
//   import { AIWidgetState } from '../utils/AIWidgetState';
//   AIWidgetState.setLoading();
//   AIWidgetState.setGenerating('캐릭터 이름');
//   AIWidgetState.setIdle('캐릭터 이름');
// ═══════════════════════════════════════════════════════════

import { NativeModules } from 'react-native';

const AIWidgetNative = NativeModules.AIWidget as { setState: (state: string, charName?: string) => void } | undefined;

export const AIWidgetState = {
  /** 모델 로딩 중 */
  setLoading(charName?: string) {
    AIWidgetNative?.setState('loading', charName);
  },

  /** LLM 토큰 생성 중 */
  setGenerating(charName?: string) {
    AIWidgetNative?.setState('generating', charName);
  },

  /** 생성 완료 / 대기 상태 */
  setIdle(charName?: string) {
    AIWidgetNative?.setState('idle', charName);
  } };
