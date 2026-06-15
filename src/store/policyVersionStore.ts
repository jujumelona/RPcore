﻿// src/store/policyVersionStore.ts
// ══════════════════════════════════════════════════════════════════
//  정책 버전 관리 & 알림 시스템
//
//  동작:
//    1. 앱 시작 시 저장된 버전 vs POLICY_VERSION 비교
//    2. 저장된 버전이 없으면(첫 설치) 현재 버전 저장 후 알림 없음
//    3. 이전 버전이 있고 달라진 경우에만 hasNewPolicy = true
//       → NotificationsScreen 상단에 로컬 알림으로 표시
//    4. 사용자가 알림 탭하면 PolicyScreen으로 이동, 버전 저장
//
//  개정 시 할 일:
//    policyContent.ts 의 POLICY_VERSION 값만 바꾸면 끝!
//    예) '2026.03.01' → '2026.06.01'
// ══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { appStorage } from '../utils/storage';
import { POLICY_VERSION } from '../i18n/policyContent';

const VERSION_KEY = 'accepted_policy_version';

interface PolicyVersionState {
  hasNewPolicy: boolean;
  isChecked: boolean;
  checkVersion: () => void;
  acceptCurrentVersion: () => void;
  dismissTemporarily: () => void;
}

export const usePolicyVersionStore = create<PolicyVersionState>((set) => ({
  hasNewPolicy: false,
  isChecked: false,

  checkVersion: () => {
    try {
      const saved = appStorage.getString(VERSION_KEY) ?? null;
      if (saved === null) {
        // 첫 설치: 알림 없이 현재 버전 바로 저장
        appStorage.set(VERSION_KEY, POLICY_VERSION);
        set({ hasNewPolicy: false, isChecked: true });
      } else {
        // 기존 사용자: 버전이 바뀐 경우에만 알림
        set({ hasNewPolicy: saved !== POLICY_VERSION, isChecked: true });
      }
    } catch {
      set({ isChecked: true });
    }
  },

  acceptCurrentVersion: () => {
    appStorage.set(VERSION_KEY, POLICY_VERSION);
    set({ hasNewPolicy: false });
  },

  // 알림만 숨김 — 저장 안 함 → 다음 앱 실행 시 재표시
  dismissTemporarily: () => {
    set({ hasNewPolicy: false });
  } }));
