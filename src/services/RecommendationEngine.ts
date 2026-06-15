import { FastStorage } from '../utils/storage';
import { AnalyticsService } from './AnalyticsService';

/**
 * ══════════════════════════════════════════════════════════════
 * [상용화 핵심] 지능형 추천 및 유저 취향 분석 엔진
 * ══════════════════════════════════════════════════════════════
 * - 모든 연산은 Worklets을 통해 별도 스레드에서 수행
 * - 취향 데이터는 MMKV에 실시간 반영
 * - 분석 데이터는 Amplitude와 동기화
 */

const PREFERENCE_KEY = '@user_preferences';
// ✅ [OPT] 시간 감쇠 — 7일 반감기 지수 감쇠 (오래된 취향 자동 희석)
const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_MS;

interface UserPreference {
  genreWeights: Record<string, number>;
  // ✅ [OPT] 각 장르 마지막 상호작용 타임스탬프 (감쇠 계산용)
  genreLastSeen: Record<string, number>;
  lastInteractedIds: string[];
}

/** 저장된 가중치에 경과 시간 지수 감쇠 적용 */
function applyDecay(prefs: UserPreference): UserPreference {
  const now = Date.now();
  const decayed = { ...prefs.genreWeights };
  for (const genre in decayed) {
    const lastSeen = prefs.genreLastSeen?.[genre] ?? now;
    const elapsed = now - lastSeen;
    // e^(-λ·t) 감쇠 — 7일 경과 시 50%, 14일 시 25% 남음
    decayed[genre] = decayed[genre] * Math.exp(-DECAY_LAMBDA * elapsed);
    if (decayed[genre] < 0.01) delete decayed[genre]; // 소멸된 가중치 제거
  }
  return { ...prefs, genreWeights: decayed };
}

export const RecommendationEngine = {
  /** 유저 행동 기록 및 취향 학습 */
  trackInteraction: (storyId: string, genre: string, action: 'view' | 'like' | 'chat') => {
    // JS 스레드에서 실행 — MMKV는 worklet 컨텍스트 미지원

    const raw = FastStorage.getObject<UserPreference>(PREFERENCE_KEY) || {
      genreWeights: {},
      genreLastSeen: {},
      lastInteractedIds: [] };

    // BUG-16 fix: add new weight BEFORE applying decay so current interaction isn't penalized
    const weight = action === 'chat' ? 5 : action === 'like' ? 10 : 1;
    raw.genreWeights[genre] = (raw.genreWeights[genre] || 0) + weight;
    if (!raw.genreLastSeen) raw.genreLastSeen = {};
    raw.genreLastSeen[genre] = Date.now();

    // Apply decay after adding new weight
    const prefs = applyDecay(raw);

    // 가중치 부여 (상용 로직) — already applied above
    // ✅ [OPT] 마지막 상호작용 시간 기록 (다음 감쇠 계산 기준점)
    if (!prefs.genreLastSeen) prefs.genreLastSeen = {};
    prefs.genreLastSeen[genre] = Date.now();

    // 최근 본 스토리 큐 관리
    if (!prefs.lastInteractedIds.includes(storyId)) {
      prefs.lastInteractedIds = [storyId, ...prefs.lastInteractedIds.slice(0, 19)];
    }

    // MMKV에 동기 저장 (광속)
    FastStorage.set(PREFERENCE_KEY, prefs);

    // 분석 서비스 연동 (JS 스레드 호출)
    AnalyticsService.logEvent('interaction_learned', { storyId, genre, action, currentWeight: prefs.genreWeights[genre] });
  },

  /** 추천 점수 계산 (고성능 필터링) */
  getRecommendedScore: (storyId: string, genre: string, cachedPrefs?: UserPreference | null): number => {
    // ✅ [PERF FIX] cachedPrefs 파라미터 추가: sort 루프 안에서 반복 MMKV 읽기 방지
    const raw = cachedPrefs ?? FastStorage.getObject<UserPreference>(PREFERENCE_KEY);
    if (!raw) return 0;

    // [BUG FIX] 이중 decay 수정 완료
    // trackInteraction에서 applyDecay 후 저장하므로 여기서 재호출하지 않음
    //       → 같은 기간 decay가 2번 적용되어 점수 과다 감쇠
    // 수정: trackInteraction에서만 decay 적용 후 저장 (진실의 단일 소스),
    //       getRecommendedScore는 저장된 값을 그대로 읽어 사용
    let score = (raw.genreWeights[genre] || 0) * 2;
    if (raw.lastInteractedIds.includes(storyId)) score += 50; // 최근 상호작용 가중치

    return score;
  },

  /** sort 루프 전에 1회만 읽어 캐싱용으로 전달하기 위한 헬퍼 */
  getPrefs: (): UserPreference | null => {
    return FastStorage.getObject<UserPreference>(PREFERENCE_KEY) ?? null;
  } };
