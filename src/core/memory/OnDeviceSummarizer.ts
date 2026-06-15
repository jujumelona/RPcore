import llamaEngine from '../llama/LlamaEngine';
import { db } from '../sqlite/Database';
import { dbPool } from '../sqlite/DatabasePool';
import { Conversation } from '../sqlite/Schemas';
import { logger } from '../../utils/logger';
import { adaptiveSummaryTrigger } from '../../utils/MathUtils';

export const SUMMARY_TRIGGER_COUNT = 20;

const CONV_TO_SUMMARIZE = 15;
const SUMMARY_MAX_TOKENS = 150;
const SUMMARY_MIN_TOKENS = 96;
const SUMMARY_MIN_MESSAGES = 5;
const SUMMARY_CHAR_BUDGET_RATIO = 0.22;
const SUMMARY_MIN_CHAR_BUDGET = 1200;
const SUMMARY_MAX_CHAR_BUDGET = 3600;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateConversationChars(conv: Conversation): number {
  return (conv.content?.length ?? 0) + 24;
}

export class OnDeviceSummarizer {
  private static instance: OnDeviceSummarizer;
  private summarizing = false;
  getSummarizing() { return this.summarizing; }

  static getInstance() {
    if (!OnDeviceSummarizer.instance) {
      OnDeviceSummarizer.instance = new OnDeviceSummarizer();
    }
    return OnDeviceSummarizer.instance;
  }

  async maybeRunSummary(sceneId: string, baseTrigger: number = SUMMARY_TRIGGER_COUNT): Promise<number> {
    if (this.summarizing) return 0;
    if (llamaEngine.getState() !== 'ready') return 0;

    const nCtx = llamaEngine.getNCtx() ?? 8192;
    const usedTok = llamaEngine.getUsedTokens() ?? 0;
    const trigger = adaptiveSummaryTrigger(baseTrigger, usedTok, nCtx);

    // [BUG FIX #67] 백그라운드 요약 전 5초 지연 -> 유저 후속 메시지 큐 선점 기회 부여
    await new Promise<void>(r => { setTimeout(() => r(), 5000); });
    if (llamaEngine.getState() !== 'ready') return 0;

    const recentConvs = await db.getRecentConversationsByScene(sceneId, trigger);
    if (recentConvs.length < trigger) return 0;

    this.summarizing = true;
    try {
      return await this._runSummary(sceneId, recentConvs, nCtx);
    } catch (e) {
      logger.warn('[OnDeviceSummarizer] summary failed:', e);
      return 0;
    } finally {
      this.summarizing = false;
    }
  }


  async forceSummaryOnBackground(sceneId: string): Promise<number> {
    if (this.summarizing) return 0;
    if (llamaEngine.getState() !== 'ready') return 0;

    // [BUG FIX #67] 5초 지연
    await new Promise<void>(r => { setTimeout(() => r(), 5000); });
    if (llamaEngine.getState() !== 'ready') return 0;

    const convs = await db.getRecentConversationsByScene(sceneId, CONV_TO_SUMMARIZE);
    if (convs.length < SUMMARY_MIN_MESSAGES) return 0;

    this.summarizing = true;
    try {
      const nCtx = llamaEngine.getNCtx() ?? 8192;
      return await this._runSummary(sceneId, convs, nCtx);
    } catch (e) {
      logger.warn('[OnDeviceSummarizer] background summary failed:', e);
      return 0;
    } finally {
      this.summarizing = false;
    }
  }

  async summarize(
    sceneId: string,
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<number> {
    if (this.summarizing) return 0;
    if (!sceneId || llamaEngine.getState() !== 'ready') return 0;

    const convs: Conversation[] = recentMessages
      .map((message, index) => ({
        scene_id: sceneId,
        speaker_id: message.role === 'user' ? 'user' : 'assistant',
        speaker_type: message.role === 'user' ? 'user' : 'ai',
        content: message.content,
        timestamp: Date.now() - ((recentMessages.length - index) * 1000) }))
      .filter(message => message.content.trim().length > 0);

    if (convs.length < SUMMARY_MIN_MESSAGES) return 0;

    this.summarizing = true;
    try {
      const nCtx = llamaEngine.getNCtx() ?? 8192;
      return await this._runSummary(sceneId, convs, nCtx);
    } catch (e) {
      logger.warn('[OnDeviceSummarizer] pressure summary failed:', e);
      return 0;
    } finally {
      this.summarizing = false;
    }
  }

  private async _runSummary(
    sceneId: string,
    convs: Conversation[],
    nCtx: number,
  ): Promise<number> {
    const sceneConvs = convs.filter(conv => conv.scene_id === sceneId);
    const toSummarize = this._selectSummaryWindow(sceneConvs, nCtx);
    if (toSummarize.length < SUMMARY_MIN_MESSAGES) return 0;

    const prompt = this._buildSummaryPrompt(toSummarize);
    const rawSummary = await llamaEngine.generateRaw(prompt, this._getSummaryTokenBudget(nCtx));
    const structured = this._parseStructuredSummary(rawSummary);

    // ✅ [NEW] 구조화된 파싱 실패 시 폴백 — 기존 방식 (간단한 클린만)
    const cleaned = structured?.summary ?? this._cleanSummary(rawSummary);

    if (!cleaned || cleaned.length < 10) {
      logger.warn('[OnDeviceSummarizer] summary output too short, skipping');
      return 0;
    }

    await dbPool.transaction(async txDb => {
      // ✅ [NEW] 구조화된 요약 데이터 저장 (감정 변화 + 키 이벤트)
      await txDb.insertMemorySummary({
        scene_id: sceneId,
        summary_type: 'long',
        content: cleaned,
        importance_score: 0.5,
        // 메타데이터를 JSON으로 저장 (emotion_change, key_events)
        ...(structured && {
          // emotion_change와 key_events는 필요시 별도 컬럼으로 확장 가능
          // 현재는 content에 태그로 포함
          tags: structured.keyEvents.length > 0
            ? JSON.stringify({ keyEvents: structured.keyEvents, emotionDelta: structured.emotionChange })
            : undefined }) });

      const idsToDelete = toSummarize
        .map(conv => conv.id)
        .filter((id): id is number => id != null);
      if (idsToDelete.length > 0) {
        await txDb.deleteConversations(idsToDelete);
      }
    });

    logger.log(`[OnDeviceSummarizer] complete: ${cleaned.slice(0, 60)}...`);
    return toSummarize.length;
  }

  private _selectSummaryWindow(convs: Conversation[], nCtx: number): Conversation[] {
    const limited = convs.slice(0, CONV_TO_SUMMARIZE);
    // [BUG-015 FIX] picked.reverse() 제거 — 역순으로 LLM에 전달하면 요약 품질 저하.
    // getRecentConversationsByScene은 ASC(오래된 순) 반환.
    // 이전: [...limited].reverse() / picked.reverse() → DESC(최신 먼저) 역순 전달
    // 수정: 오름차순(시간 순) 그대로 전달하여 LLM이 자연스러운 대화 흐름을 인식하도록
    if (limited.length <= SUMMARY_MIN_MESSAGES) {
      return [...limited];
    }

    const charBudget = clamp(
      Math.floor(Math.max(2048, nCtx) * 3.2 * SUMMARY_CHAR_BUDGET_RATIO),
      SUMMARY_MIN_CHAR_BUDGET,
      SUMMARY_MAX_CHAR_BUDGET,
    );

    const picked: Conversation[] = [];
    let usedChars = 0;

    for (const conv of limited) {
      const nextChars = estimateConversationChars(conv);
      const wouldOverflow = usedChars + nextChars > charBudget;
      if (picked.length >= SUMMARY_MIN_MESSAGES && wouldOverflow) break;
      picked.push(conv);
      usedChars += nextChars;
    }

    return picked;
  }

  private _getSummaryTokenBudget(nCtx: number): number {
    return clamp(Math.floor(Math.max(2048, nCtx) * 0.03), SUMMARY_MIN_TOKENS, SUMMARY_MAX_TOKENS);
  }

  private _buildSummaryPrompt(convs: Conversation[]): string {
    const dialogue = convs
      .map(conv => `${conv.speaker_type === 'user' ? 'User' : 'AI'}: ${conv.content}`)
      .join('\n');

    // ✅ [NEW] 구조화된 요약 출력 포맷 — 작은 모델이 출력 구조를 벗어나지 않도록 강제
    // JSON 포맷으로 출력하면 파싱 실패 시 정확한 오류 탐지 가능
    return (
      `Summarize the conversation in 2-3 sentences. ` +
      `Output in JSON format with keys: summary, emotion_change, key_events.\n` +
      `- summary: 2-3 sentence summary\n` +
      `- emotion_change: character_id:delta format (e.g., "2:+15,-10" means char2 e1+15,e2-10)\n` +
      `- key_events: comma-separated key events\n\n` +
      `Conversation:\n${dialogue}\n\n` +
      `Output (JSON only, no extra text):`
    );
  }

  // ✅ [NEW] 구조화된 요약 파서 — 요약 출력의 구조 오류 탐지 및 수정
  private _parseStructuredSummary(raw: string): { summary: string; emotionChange: Record<string, Record<string, number>>; keyEvents: string[] } | null {
    try {
      // JSON 추출 (```json ... ``` 제거)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('[OnDeviceSummarizer] JSON not found in summary');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 필드 검증 — 필수 필드 누락 시 null 반환
      if (!parsed.summary || typeof parsed.summary !== 'string') {
        logger.warn('[OnDeviceSummarizer] summary field missing/invalid');
        return null;
      }

      // emotion_change 파싱: "2:+15,-10" → { "2": { "e1": 15, "e2": -10 } }
      const emotionChange: Record<string, Record<string, number>> = {};
      if (parsed.emotion_change && typeof parsed.emotion_change === 'string') {
        const parts = parsed.emotion_change.split(',').filter(Boolean);
        for (const part of parts) {
          const [charId, deltas] = part.split(':');
          if (!charId || !deltas) continue;
          const deltaObj: Record<string, number> = {};
          const deltaParts = deltas.match(/[+-]\d+/g);
          if (deltaParts) {
            for (let i = 0; i < deltaParts.length && i < 5; i++) {
              deltaObj[`e${i + 1}`] = parseInt(deltaParts[i], 10);
            }
          }
          emotionChange[charId.trim()] = deltaObj;
        }
      }

      const keyEvents = parsed.key_events
        ? (Array.isArray(parsed.key_events) ? parsed.key_events : String(parsed.key_events).split(','))
        : [];

      return {
        summary: parsed.summary.slice(0, 500), // 최대 500자로 제한
        emotionChange,
        keyEvents: keyEvents.map((e: unknown) => String(e).trim()).filter(Boolean) };
    } catch (e) {
      logger.warn('[OnDeviceSummarizer] summary parse failed:', e);
      return null;
    }
  }

  private _cleanSummary(raw: string): string {
    return raw
      .replace(/^(Summary:|요약:)\s*/i, '')
      .replace(/^\n+/, '')
      .trim();
  }

  /**
   * [BUG FIX] isSummarizing 영구 잠금 방지용 강제 리셋
   * 엔진 상태 변경(error/idle) 시 또는 앱 재시작 후 호출해 잠금 해제.
   * 정상 흐름에서는 try/finally가 항상 해제하므로 사용 불필요.
   */
  reset(): void {
    this.summarizing = false;
  }
}

export const onDeviceSummarizer = OnDeviceSummarizer.getInstance();

