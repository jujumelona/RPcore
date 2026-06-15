// src/screens/AdManager.tsx
// ══════════════════════════════════════════════════════════════════
// ⚠️  이 파일은 더 이상 직접 사용하지 마세요.
//
// [FIX #4] AdManager 중복 파일 통합
//   기존: src/components/ads/AdManager.tsx (구버전 — 리로드 타이머 버그 있음)
//         src/screens/AdManager.tsx         (신버전 — _reloadTimer 수정 완료)
//   문제: 두 파일이 모두 import되면 BannerAdManager/InterstitialAdManager
//         싱글톤이 2개 생성 → 광고 리스너·리로드 타이머 이중 등록.
//   수정: 신버전 내용을 src/components/ads/AdManager.tsx 로 완전 이관.
//         이 파일은 하위 호환 re-export 셸로만 남김.
//         향후 이 파일을 import하는 곳이 없어지면 파일 자체를 삭제하세요.
//
// 정식 경로: src/components/ads/AdManager.tsx
// ══════════════════════════════════════════════════════════════════

export * from '../components/ads/AdManager';
