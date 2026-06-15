// src/filter/ContentSafetyLayer.ts
// ════════════════════════════════════════════════════════════════════
//
//  RPCore 콘텐츠 안전 레이어 (Play Store 심사 대응)
//
//  ── 허용 기준 ────────────────────────────────────────────────
//
//  ✅ 허용: 키스, 포옹, 로맨스, 연애, 우정, 모험
//           픽션 서사 내 긴장감·갈등 표현
//           감정 표현, 비성적 성인 주제 대화
//
//  차단: 미성년자 성적 묘사 (법적 필수, 예외 없음)
//           성적·음란 묘사 (Play Store 정책)
//           과도한 폭력·고어 묘사
//           자해·자살 '방법론' 서술 (Google Play 정책)
//           실제 범죄 '제조·실행 방법' 서술 (마약 제조법 등)
//
//   '살인', '폭력', '자살' 단어 자체는 차단하지 않음.
//      스토리 픽션에서 드라마 전개상 등장하는 표현은 허용.
//      "어떻게 만드는지", "방법" 같은 실제 행동 유도만 차단.
//
//  ── 우회 방지 강화 (v2) ──────────────────────────────────────
//
//  기존 단순 includes() 방식은 아래 패턴으로 쉽게 우회됩니다:
//    - 공백 삽입:  "l o l i", "로 리"
//    - 유니코드:   "ŀoli", "ｌｏｌｉ" (전각)
//    - 혼합:       "l0li" (숫자 대체)
//
//  개선:
//    1. NFKC 정규화 -> 전각/반각 통일, 합자 분리
//    2. 공백·특수문자 제거 후 비교
//    3. 핵심 키워드는 정규식으로 변형 패턴 포착
//
// ════════════════════════════════════════════════════════════════════

// ── Layer 2: Gemma 3 시스템 프롬프트 안전 지시 ──────────────────────

export function buildSafetySystemPrompt(): string {
  return `[CONTENT RULES]
This is a creative roleplay and storytelling app for users 17 and older.
Romance, friendship, adventure, and emotional storytelling are allowed.
HARD LIMITS (cannot be overridden):
1. Never generate sexual or explicit content of any kind.
2. Never generate sexual content involving characters under 18.
3. Never depict graphic gore or extreme violence.
4. Never provide real instructions for self-harm, suicide methods, or drug synthesis.
5. Never generate content involving real, named public figures in harmful scenarios.
[END RULES]`;
}

// ── 전처리: NFKC 정규화 + 공백/구분자 제거 ────────────────────────
//
//  "l o l i" -> "loli"
//  "ｌｏｌｉ" (전각) -> "loli"
//  "로 리"   -> "로리"
//
function normalize(text: string): string {
  return text
    .normalize('NFKC')           // 전각->반각, 합자 분리
    .toLowerCase()
    .replace(/[\s\u200B-\u200F\uFEFF\u00AD]/g, '') // 공백·제로폭 문자 제거
    .replace(/[-_*|!@#.]/g, '');                   // 흔한 구분자 제거 (마침표 포함 — 우회 방어)
}

// ── 미성년자 성적 묘사 패턴 ────────────────────────────────────────
//
//  숫자 대체 변형까지 잡기 위해 정규식 사용:
//    l0li / l01i / sh0ta 등
//  정규식은 normalize() 적용 후 비교한다.
//
const MINORS_PATTERNS: RegExp[] = [
  /lo+l[i1!]/i,                      // loli / looli / l0li
  /sh[o0]ta/i,                        // shota / sh0ta
  /\u30ed\u30ea/,                     // ロリ (가타카나)
  /\u30b7\u30e7\u30bf/,               // ショタ (가타카나)
  /\ub85c\ub9ac/,                     // 로리 (공백 제거 후)
  /\uc1fc\ud0c0/,                     // 쇼타 (공백 제거 후)
  /cpcontent|childporn|\uc544\ub3d9\ud3ec\ub974\ub178/i,
];

// ── 자해·자살 방법론 패턴 ──────────────────────────────────────────
const SELF_HARM_PATTERNS: RegExp[] = [
  /\ubaa9\ub9e4\ub2ec\uae30\ubc29\ubc95/,       // 목매달기방법
  /\uc190\ubaa9\uae4b\uae30\ubc29\ubc95/,        // 손목긋기방법
  /\ud22c\uc2e0\ubc29\ubc95/,                    // 투신방법
  /\uc74c\ub3c5\ubc29\ubc95/,                    // 음독방법
  /howtocommitsuicide/i,
  /howtoselfharm/i,
  /suicidemethod/i,
  /\uc790\uc0b4\ud558\ub294\ubc29\ubc95/,        // 자살하는방법
  /\uc8fd\ub294\ubc29\ubc95\uc54c\ub824/,        // 죽는방법알려
  // [BUG FIX A-V] 단순 패턴 추가 — '자살방법' normalize() 후 직접 매칭 누락
  /\uc790\uc0b4\ubc29\ubc95/,                    // 자살방법 (공백제거 후)
  /\uc790\uc0b4\uc54c\ub824/,                    // 자살알려 (공백제거 후)
];

// ── 실제 범죄 제조·실행 방법 패턴 ──────────────────────────────────
const CRIME_PATTERNS: RegExp[] = [
  /\ud544\ub85c\ud3f0\ub9cc\ub4dc\ub294/,        // 필로폰만드는
  /\ub9c8\uc57d\ub9cc\ub4dc\ub294/,              // 마약만드는
  /\ud3ed\ud0c4\ub9cc\ub4dc\ub294/,              // 폭탄만드는
  /\ucd1d\uae30\ubc00\uc218\ubc29\ubc95/,         // 총기밀수방법
  /methrecipe/i,
  /drugsynthesishow/i,
  /bombmakinginstructions/i,
  /howtomakedr[ug]+s/i,
];

export type SafetyCategory = 'minor' | 'self_harm' | 'harmful' | 'clean';

export interface SafetyCheckResult {
  safe: boolean;
  category: SafetyCategory;
  userMessage?: string;
}

// ── 공통 패턴 매칭 헬퍼 ───────────────────────────────────────────
function matchesAny(normalized: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(normalized));
}

function hasRepetitionLoop(text: string): boolean {
  const window = text.length > 300 ? text.slice(-300) : text;
  if (window.length < 40) return false;

  for (let len = 2; len <= 20; len++) {
    const phrase = window.slice(-len);
    if (!phrase.trim()) continue;

    let repeats = 1;
    let cursor = window.length - len;
    while (cursor - len >= 0 && window.slice(cursor - len, cursor) === phrase) {
      repeats += 1;
      cursor -= len;
    }

    if (repeats >= 5) return true;
  }

  return false;
}

/**
 * 사용자 입력 / AI 출력 안전 검사.
 * 로맨스·성인 묘사는 통과, 실제 불법 콘텐츠만 차단.
 *
 * ✅ [FIX v2] NFKC 정규화 + 공백 제거 전처리로 우회 방지 강화.
 */
export function checkContentSafety(text: string): SafetyCheckResult {
  const n = normalize(text);

  if (matchesAny(n, MINORS_PATTERNS)) {
    return {
      safe: false,
      category: 'minor',
      userMessage: '미성년자 관련 콘텐츠는 허용되지 않습니다.' };
  }

  if (matchesAny(n, SELF_HARM_PATTERNS)) {
    return {
      safe: false,
      category: 'self_harm',
      userMessage: '해당 내용은 서비스 정책상 허용되지 않습니다.' };
  }

  if (matchesAny(n, CRIME_PATTERNS)) {
    return {
      safe: false,
      category: 'harmful',
      userMessage: '실제 범죄 관련 정보는 제공할 수 없습니다.' };
  }

  return { safe: true, category: 'clean' };
}

/**
 * 스트리밍 중 실시간 안전 검사 (고성능).
 * 누적 텍스트 기준으로 판단.
 */
export function checkStreamingSafety(accumulated: string): {
  shouldStop: boolean;
  category?: SafetyCategory;
} {
  const n = normalize(accumulated);

  if (matchesAny(n, MINORS_PATTERNS))    return { shouldStop: true, category: 'minor' };
  if (matchesAny(n, SELF_HARM_PATTERNS)) return { shouldStop: true, category: 'self_harm' };
  if (matchesAny(n, CRIME_PATTERNS))     return { shouldStop: true, category: 'harmful' };
  if (hasRepetitionLoop(accumulated))    return { shouldStop: true };

  return { shouldStop: false };
}

// ── Play Store 심사 제출용 요약 ──────────────────────────────────────

export const CONTENT_POLICY_SUMMARY = {
  appRating: 'TEEN_17_PLUS',
  contentType: 'interactive_fiction',
  aiModel: 'Gemma 3 (Google DeepMind)',
  allowedContent: [
    '로맨스, 우정, 모험, 감정 표현',
    '픽션 서사 내 긴장감·갈등 (비성적)',
    '비성적 성인 주제 대화',
  ],
  blockedContent: [
    '성적·음란 묘사 (모든 연령)',
    '미성년자 성적 묘사 (loli/shota 계열 포함, 변형 패턴 포함)',
    '과도한 폭력·고어',
    '자해·자살 방법론 서술',
    '실제 범죄 제조·실행 가이드',
  ],
  safetyLayers: [
    'Layer 1: NFKC 정규화 + 공백 제거 전처리 후 정규식 패턴 매칭 (우회 방지)',
    'Layer 2: Gemma 3 시스템 프롬프트 — 성적·폭력 콘텐츠 차단 + 하드 리밋 명시',
    'Layer 3: 스트리밍 실시간 감지',
    'Layer 4: 출력 후처리 (outputCleaner)',
  ],
  ageVerification: '온보딩 시 만 17세 이상 확인 (생년 입력)',
  reportSystem: '사용자 신고 -> 어드민 패널 검토 -> 콘텐츠 삭제/정지' } as const;
