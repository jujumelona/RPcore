/* eslint-disable no-bitwise */
globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;

// ─────────────────────────────────────────────────────────────────────────────
// [NOTE] document.cookie 폴리필 불필요
// Amplitude 쿠키 에러는 AnalyticsService.ts 의 cookieOptions: { disable: true } 로 해결.
// document 객체를 주입하면 Sentry가 document.addEventListener를 호출해
// "is not a function" 크래시 발생 → 폴리필 없이 그냥 둠.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// [FIX] global.crypto 폴리필
// Hermes JS 엔진에는 global.crypto가 없어서 Amplitude 등 라이브러리 초기화 실패.
// expo-crypto로 getRandomValues / randomUUID를 주입해 해결합니다.
// ⚠️ 반드시 모든 import보다 먼저 실행되어야 합니다.
// ─────────────────────────────────────────────────────────────────────────────
import * as ExpoCrypto from 'expo-crypto';
if (typeof globalThis.crypto === 'undefined') {
  // @ts-ignore
  globalThis.crypto = {
    getRandomValues: ExpoCrypto.getRandomValues,
    randomUUID: ExpoCrypto.randomUUID,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [FIX] atob / btoa 폴리필
// React Native(Hermes)에는 atob/btoa가 없어서 런타임 크래시 발생.
// shims.d.ts에 타입 선언만 있고 실제 구현이 없었음 → 여기서 주입.
// JWT 디코딩(authStore.ts), base64 벡터 인코딩(EmbeddingEngine.ts)에서 사용.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (b64) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    let i = 0;
    const input = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    while (i < input.length) {
      const enc1 = chars.indexOf(input[i++]);
      const enc2 = chars.indexOf(input[i++]);
      const enc3 = chars.indexOf(input[i++]);
      const enc4 = chars.indexOf(input[i++]);
      str += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
      if (enc3 !== 64) str += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
      if (enc4 !== 64) str += String.fromCharCode(((enc3 & 3) << 6) | enc4);
    }
    return str;
  };
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (bin) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    while (i < bin.length) {
      const a = bin.charCodeAt(i++);
      const b = bin.charCodeAt(i++);
      const c = bin.charCodeAt(i++);
      result +=
        chars[a >> 2] +
        chars[((a & 3) << 4) | (b >> 4)] +
        (isNaN(b) ? '=' : chars[((b & 15) << 2) | (c >> 6)]) +
        (isNaN(c) ? '=' : chars[c & 63]);
    }
    return result;
  };
}

// ── 전역 에러 캐처 — React 렌더 전 에러도 화면에 표시 ──────────
// [NOTE] 전역 핸들러 등록은 아래 installCrashIntelligence()가 담당합니다.
// CrashIntelligence는 기존 핸들러를 체이닝하므로 중복 등록하지 않습니다.
// DEV 빌드에서 Alert 팝업도 원하면 아래 주석 해제:
// if (__DEV__) {
//   const _orig = globalThis.ErrorUtils?.getGlobalHandler?.();
//   globalThis.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
//     require('react-native').Alert.alert(
//       isFatal ? '치명적 오류' : '오류',
//       `${error?.message ?? error}\n\n${error?.stack?.slice(0, 500) ?? ''}`,
//       [{ text: '확인' }]);
//     _orig?.(error, isFatal);
//   });
// }


// ─────────────────────────────────────────────────────────────────────────────
// [FIX] screen 폴리필 — Amplitude의 window.screen.width 크래시 방지
// window 객체 자체는 건드리지 않고 globalThis.screen만 패치
// ─────────────────────────────────────────────────────────────────────────────
try {
  var _rndim = require('react-native').Dimensions.get('window');
  var _sw = (_rndim && _rndim.width)  ? _rndim.width  : 375;
  var _sh = (_rndim && _rndim.height) ? _rndim.height : 812;
  if (!globalThis.screen) {
    globalThis.screen = { width: _sw, height: _sh, availWidth: _sw, availHeight: _sh, colorDepth: 24, pixelDepth: 24 };
  }
  if (!globalThis.screen.width)  { globalThis.screen.width  = _sw; }
  if (!globalThis.screen.height) { globalThis.screen.height = _sh; }
} catch (_polyfillErr) {
  // Ignore polyfill errors
}


// ─────────────────────────────────────────────────────────────────────────────
// [CrashIntelligence] 전역 설치
// 크래시 발생 시 crashes/<타임스탬프>/ 폴더에 자동으로 수집:
//   crash.log    — 에러 메시지 + 스택 + 마지막 UI 액션
//   context.log  — 크래시 직전 최근 200개 로그
//   state.json   — 그 시점 Zustand 스토어 스냅샷
//   memory.json  — RAM 샘플 (MemoryLeakGuard 연동)
// ⚠️ 폴리필 이후, registerRootComponent 이전에 위치해야 합니다.
// ─────────────────────────────────────────────────────────────────────────────
import { installCrashIntelligence } from './src/utils/CrashIntelligence';
installCrashIntelligence();

import 'react-native-gesture-handler';
import {registerRootComponent} from 'expo';
import App from './App';

// FCM 백그라운드 핸들러 — index.js 등록 (RN Firebase 공식 권장 위치)
try {
  const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
  setBackgroundMessageHandler(getMessaging(), async () => {
    // Background message handler
  });
} catch {
  // Ignore Firebase messaging errors
}

registerRootComponent(App);
