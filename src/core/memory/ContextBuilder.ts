// src/core/memory/ContextBuilder.ts
import { db } from '../sqlite/Database';
import { logger } from '../../utils/logger';
import { memoryManager } from './MemoryManager';
import llamaEngine from '../llama/LlamaEngine';

// ── [NEW ⑤] Token Budget Knapsack ────────────────────────────────
//
// 기존 shortTerm=5개, midTerm=3개, longTerm=전부 하드코딩 대신
// nCtx 압력에 따라 섹션별 토큰 예산을 동적으로 배분.
//
// 우선순위 (높을수록 압력이 높아도 보존):
//   longTerm(요약) > midTerm(이벤트) > shortTerm(대화 내역)
//
// 가중 배분:
//   압력 = usedTokens / nCtx
//   각 섹션 예산 = baseBudget × weight × (1 - pressure × penaltyFactor)
//
// penaltyFactor: 낮을수록 압력에 둔감 (longTerm=0.2, midTerm=0.5, shortTerm=0.8)

// ✅ [FIX] 3.5 하드코딩 -> 명명 상수로 분리
//
// nCtx 1토큰당 평균 문자 수 추정치 (한국어 기준).
// 한국어는 자모 분리 없이 완성형 글자 1자 ≈ 1.5~2 토큰이나,
// 시스템 프롬프트에 영문/코드 혼용이 많아 평균 ~3.5자/토큰으로 추정.
//
// 모델별 조정 가이드:
//   영문 전용 모델   -> 4.0 (영어는 토큰당 평균 4자)
//   한국어 특화 모델 -> 2.5 (한국어 토큰 밀도 높음)
//   기본값 (혼용)    -> 3.5
const CHARS_PER_TOKEN = 3.5;

// 모델 미로드 시 보수적 fallback nCtx
const SAFE_FALLBACK_NCTX = 4096;

interface SectionBudget {
  longTermChars:  number;
  midTermCount:   number;
  shortTermCount: number;
}

/**
 * 컨텍스트 압력 기반 섹션 예산 계산
 * @param totalBudgetChars  전체 허용 문자 수 (≈ nCtx × 3.5)
 * @param usedChars         이미 사용된 문자 수 (시스템 프롬프트 등)
 */
function computeSectionBudget(
  totalBudgetChars: number,
  usedChars: number,
): SectionBudget {
  // [BUG FIX] totalBudgetChars=0 방어 + pressure 클램핑
  if (totalBudgetChars <= 0) {
    return { longTermChars: 0, midTermCount: 1, shortTermCount: 3 };
  }
  const pressure = Math.max(usedChars / totalBudgetChars, 0);

  // [BUG FIX #13] usedChars 가 totalBudgetChars 를 초과하면 예산 없음 (최소치 반환)
  if (pressure >= 1.0) {
    return { longTermChars: 0, midTermCount: 1, shortTermCount: 3 };
  }

  // [BUG-ITEM45 FIX] Double penalty with remainingBudget fixed.
  // We use totalBudgetChars as the base for distribution proportionally,
  // then apply pressure penalties to prioritize longTerm over others.
  const longTermChars  = Math.floor(totalBudgetChars * 0.15 * (1 - pressure * 0.2));
  const midTermBudget  = Math.floor(totalBudgetChars * 0.10 * (1 - pressure * 0.5));
  const shortTermBudget = Math.floor(totalBudgetChars * 0.25 * (1 - pressure * 0.8));

  // 문자 예산 -> 항목 수 (midTerm 평균 80자, shortTerm 평균 60자)
  const midTermCount   = Math.max(1, Math.floor(midTermBudget  / 80));
  const shortTermCount = Math.max(3, Math.floor(shortTermBudget / 60));

  return { longTermChars, midTermCount, shortTermCount };
}

// ─────────────────────────────────────────────────────────────────

export class ContextBuilder {
  async buildPrompt(characterId: string, userInput: string): Promise<string> {
    try {
      // Database methods are synchronous in this implementation
      const character = db.getCharacter(characterId);
      const scene = db.getCurrentScene();
      const metrics = db.getCharacterMetrics(characterId);

      if (!character) {
        logger.error(`[ContextBuilder] Character not found: ${characterId}`);
        return userInput;
      }

      const capturedSceneId = scene?.id ?? 'default';

      // Memory retrieval is async and should be protected
      let memory;
      try {
        memory = await memoryManager.getMemoryContext(capturedSceneId, userInput);
      } catch (err) {
        logger.error('[ContextBuilder] memoryManager.getMemoryContext failed:', err);
        memory = { shortTerm: [], midTerm: [], longTerm: '' };
      }

      // ── 고정 섹션 (항상 포함) ─────────────────────────────────
      let fixedPrompt = `[Character Info]\nName: ${character.name}\nPersonality: ${character.personality}\n\n`;

      if (character.base_prompt) {
        fixedPrompt += `${character.base_prompt}\n\n`;
      }

      if (metrics) {
        fixedPrompt += `[Metrics]\nLove: ${metrics.love_score}, Trust: ${metrics.trust_score}\n\n`;
      }

      if (scene?.location_name) {
        fixedPrompt += `[Location]\n${scene.location_name}\n\n`;
      }

      // ── [NEW ⑤] 동적 배분 ────────────────────────────────────
      const loadedNCtx = llamaEngine.getNCtx();
      if (loadedNCtx === 0 && __DEV__) {
        logger.warn(
          `[ContextBuilder] 모델 미로드 상태에서 프롬프트 빌드 — nCtx=${SAFE_FALLBACK_NCTX} 보수 폴백 사용`,
        );
      }
      const TOTAL_BUDGET_CHARS = Math.floor((loadedNCtx || SAFE_FALLBACK_NCTX) * CHARS_PER_TOKEN);
      const userInputChars     = userInput.length + 50; 
      const usedChars          = fixedPrompt.length + userInputChars;

      const budget = computeSectionBudget(TOTAL_BUDGET_CHARS, usedChars);

      // ── 가변 섹션 (예산 기반 슬라이싱) ───────────────────────
      let prompt = fixedPrompt;

      if (memory.longTerm) {
        const trimmed = (memory.longTerm ?? '').slice(0, budget.longTermChars);
        prompt += `[Long-term Memory]\n${trimmed}\n\n`;
      }

      if ((memory.midTerm ?? []).length > 0) {
        const items = (memory.midTerm ?? []).slice(0, budget.midTermCount);
        prompt += `[Recent Events]\n${items.join('\n')}\n\n`;
      }

      if ((memory.shortTerm ?? []).length > 0) {
        prompt += `[Recent Conversation]\n`;
        (memory.shortTerm ?? [])
          .slice(-budget.shortTermCount)
          .forEach(conv => {
            prompt += `${conv.speaker_type}: ${conv.content}\n`;
          });
        prompt += '\n';
      }

      prompt += `[User Input]\n${userInput}\n\n`;
      prompt += `[Response]\nGenerate character's response:`;

      return prompt;
    } catch (error) {
      logger.error('[ContextBuilder] buildPrompt failed unexpectedly:', error);
      return `[User Input]\n${userInput}\n\n[Response]\nGenerate character's response:`;
    }
  }
}

export const contextBuilder = new ContextBuilder();
