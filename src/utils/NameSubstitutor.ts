// src/utils/NameSubstitutor.ts
// ════════════════════════════════════════════════════════════════════
// AI 출력 캐릭터 이름 현지화 치환기
//
// 문제:
//   작은 모델은 "Alice"를 언어에 따라 "Aliss", "アリス", "앨리스"로 다르게 쓰거나,
//   매 응답마다 스펠링이 달라진다. 더 큰 문제는 15개국어 지원 시 동일 캐릭터의
//   이름이 언어마다 번역돼있는데 AI가 원본 이름을 그냥 쓰면 현지화가 깨진다.
//
// 해결:
//   editorState에 저장된 charMultiLangData를 이용해 치환 맵을 빌드.
//   AI 출력 후처리 단계에서 "모든 언어에서 알려진 이름" -> "현재 언어 이름"으로 교체.
//
// 구조:
//   charMultiLangData: Record<charId, Record<langCode, { name, age, gender, traits }>>
//
//   치환 맵 예시 (charId=2, 원본명 "Alice", 타겟 언어 'ja'):
//     "Alice"    -> "アリス"   (원본 영문명)
//     "Aliss"    -> "アリス"   (흔한 오탈자)
//     "앨리스"   -> "アリス"   (한국어 번역명)
//     "アリス"   -> "アリス"   (자기 자신, 노옵)
//     "艾丽斯"   -> "アリス"   (중국어 번역명)
//
// 주의:
//   - 대화 내용(content) 안에서만 치환, speaker prefix(2:)는 건드리지 않음
//   - 짧은 이름(2글자 이하)은 오탐 위험으로 제외
//   - 치환은 단어 경계(\b) 기준 (라틴 계열) 또는 그냥 포함 (CJK/한글)
//   - 캐시 빌드는 스토리 로드 시 1회만 수행
// ════════════════════════════════════════════════════════════════════

import type { LanguageCode } from '../i18n/languages';

// charMultiLangData의 단일 언어 데이터 타입
export interface CharLangData {
  name: string;
  age?: string;
  gender?: string;
  traits?: string;
}

// charId -> (langCode -> CharLangData)
export type CharMultiLangData = Record<number, Record<string, CharLangData>>;

// 캐릭터 원본 이름 (story_config.characters[].name)
export interface CharBaseName {
  id: number;   // charId (2, 3, 4...)
  name: string; // 원본 이름
}

// ── 내부 치환 규칙 ───────────────────────────────────────────────

interface SubRule {
  charId: number;
  targetName: string; // 현재 언어의 표시 이름
  sources: string[];  // 이 이름들을 targetName으로 치환
}

// ── 빌더 ────────────────────────────────────────────────────────

/**
 * 치환 규칙 배열을 빌드한다.
 * 스토리 로드/언어 변경 시 1회 호출.
 *
 * @param baseNames       story_config.characters의 원본 이름 목록
 * @param multiLangData   charMultiLangData (EditorState or StoryConfig에서 추출)
 * @param targetLang      현재 사용자 언어 코드
 */
export function buildSubRules(
  baseNames: CharBaseName[],
  multiLangData: CharMultiLangData,
  targetLang: LanguageCode,
): SubRule[] {
  const rules: SubRule[] = [];

  for (const { id, name: baseName } of baseNames) {
    const langMap = multiLangData[id];

    // 타겟 언어 번역명 결정
    // 우선순위: 번역된 이름 -> 원본 이름
    const targetName = langMap?.[targetLang]?.name?.trim() || baseName.trim();
    if (!targetName) continue;

    // 소스 이름 수집: 원본 + 모든 언어 번역명
    const sourceSet = new Set<string>();
    sourceSet.add(baseName.trim()); // 원본

    if (langMap) {
      for (const data of Object.values(langMap)) {
        const n = data.name?.trim();
        if (n) sourceSet.add(n);
      }
    }

    // [BUG FIX] 2글자 이하 이름 제외 조건 개선
    // 기존: s.length > 2 → CJK/한글 2글자 이름(예: 花子, 나리)도 제외됨
    // 수정: ASCII 2글자 이하만 제외, CJK/한글/기타 유니코드는 1글자도 허용
    //   ASCII 이름이 문장 단어와 겹칠 오탐 위험이 있으나
    //   CJK 이름은 단어 경계가 명확해 오탐 위험 낮음
    const sources = Array.from(sourceSet).filter(s => {
      if (!s) return false;
      // 비ASCII 문자가 포함되면(CJK/한글/아랍어 등) 1글자도 허용
      const hasNonAscii = /[^\0-\x7F]/.test(s);
      if (hasNonAscii) return s.length >= 1;
      // 순수 ASCII이면 기존 2글자 이하 제외 유지
      return s.length > 2;
    });

    if (sources.length === 0) continue;

    rules.push({ charId: id, targetName, sources });
  }

  return rules;
}

// ── 치환 실행 ────────────────────────────────────────────────────

/**
 * AI 출력 텍스트에서 캐릭터 이름을 현지화된 이름으로 교체.
 *
 * @param text      AI 출력 원문 (파싱 전 raw 또는 content 부분)
 * @param rules     buildSubRules()로 생성한 규칙 배열
 * @returns         치환 완료된 텍스트
 */
export function substituteNames(text: string, rules: SubRule[]): string {
  if (!text || rules.length === 0) return text;

  let result = text;

  for (const rule of rules) {
    for (const source of rule.sources) {
      // 이미 타겟 이름과 동일하면 스킵
      if (source === rule.targetName) continue;

      // 라틴 문자 이름: 단어 경계(\b) 기준 치환 (대소문자 구분)
      // CJK/한글/아랍/태국 등 비-라틴: 단어 경계 없이 포함 치환
      try {
        const isLatin = /^[\u0020-\u024F]+$/.test(source);
        const pattern = isLatin
          ? new RegExp(`\\b${escapeRegex(source)}\\b`, 'g')
          : new RegExp(escapeRegex(source), 'g');
        result = result.replace(pattern, rule.targetName);
      } catch {
        // 정규식 오류 (극히 드묾) -> 해당 소스 스킵
      }
    }
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 싱글톤 캐시 ─────────────────────────────────────────────────
// 스토리 ID + 언어 조합으로 규칙을 캐시해 매 턴 재빌드 방지

interface CacheKey {
  storyId: string;
  lang: LanguageCode;
  namesSig?: string;
}

class NameSubstitutor {
  private _cachedKey: CacheKey | null = null;
  private _cachedRules: SubRule[] = [];

  /**
   * 캐시된 규칙 반환. 스토리 ID나 언어가 바뀌면 자동 재빌드.
   */
  getRules(
    storyId: string,
    baseNames: CharBaseName[],
    multiLangData: CharMultiLangData,
    targetLang: LanguageCode,
  ): SubRule[] {
    // BUG-18 fix: include ALL character names in namesSig so any name change is detected
    const namesSig = `${baseNames.length}:${baseNames.map(b => b.name).join(',')}`;
    const cacheValid =
      this._cachedKey?.storyId === storyId &&
      this._cachedKey?.lang === targetLang &&
      this._cachedKey?.namesSig === namesSig;

    if (cacheValid) {
      return this._cachedRules;
    }

    this._cachedRules = buildSubRules(baseNames, multiLangData, targetLang);
    this._cachedKey = { storyId, lang: targetLang, namesSig };
    return this._cachedRules;
  }

  /**
   * 한 번에: 규칙 가져오기 + 텍스트 치환.
   *
   * ChatScreen에서 AI 출력 직후 호출:
   *   const fixed = nameSubstitutor.apply(storyId, baseNames, multiLangData, lang, rawText);
   */
  apply(
    storyId: string,
    baseNames: CharBaseName[],
    multiLangData: CharMultiLangData,
    targetLang: LanguageCode,
    text: string,
  ): string {
    const rules = this.getRules(storyId, baseNames, multiLangData, targetLang);
    return substituteNames(text, rules);
  }

  /** 스토리 변경 시 캐시 초기화 */
  invalidate(): void {
    this._cachedKey = null;
    this._cachedRules = [];
  }
}

export const nameSubstitutor = new NameSubstitutor();
export default nameSubstitutor;
