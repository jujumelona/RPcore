// src/core/memory/ContextCompressor.ts
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// Ollama / Chatbot UI 而⑦뀓?ㅽ듃 ?덈룄???뺤텞 ?⑦꽩 ?댁떇
//
// ??nCtx 80% ?꾨떖 ???먮룞 ?몃━嫄?// ??理쒓렐 N?댁? ?먮Ц ?좎?, ?댁쟾 ??붾뒗 ?먮룞 ?붿빟?쇰줈 援먯껜
// ??Sliding Window ?먮룞??// ???쒖뒪???꾨＼?꾪듃 ?ш린 寃쎄퀬
// ???뺤텞 ?덉뒪?좊━ 濡쒓렇
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
import llamaEngine from '../llama/LlamaEngine';
import { onDeviceSummarizer } from './OnDeviceSummarizer';

import { logger } from '../../utils/logger';

// ?? Types ??????????????????????????????????????????????????????????

export interface CompressorConfig {
  /** ?뺤텞 ?쒖옉 ?꾧퀎媛?(0.0 ~ 1.0, 湲곕낯 0.80) */
  pressureThreshold: number;
  /** ??긽 ?먮Ц ?좎???理쒓렐 ????(湲곕낯 keepTurns 媛??ъ슜) */
  preserveRecentTurns?: number;
  /** ?쒖뒪???꾨＼?꾪듃 寃쎄퀬 ?꾧퀎媛?(nCtx ?鍮?%, 湲곕낯 30) */
  systemPromptWarnPercent: number;
  /** ?뺤텞 ??紐⑺몴 ?ъ슜瑜?(湲곕낯 0.55) */
  targetPressure: number;
}

export interface CompressionResult {
  /** ?뺤텞 ???덉긽 ?좏겙 ??*/
  beforeTokens: number;
  /** ?뺤텞 ???덉긽 ?좏겙 ??*/
  afterTokens: number;
  /** ?붿빟??????*/
  summarizedTurns: number;
  /** ?쒖뒪???꾨＼?꾪듃 寃쎄퀬 */
  systemPromptWarning: string | null;
  /** ?뺤텞 ?뚯슂 ?쒓컙 (ms) */
  durationMs: number;
}

interface CompressorStats {
  totalCompressions: number;
  totalTokensSaved: number;
  lastCompressionAt: number;
  compressionHistory: Array<{
    timestamp: number;
    beforeTokens: number;
    afterTokens: number;
    summarizedTurns: number;
  }>;
}

// ?? Constants ?????????????????????????????????????????????????????

const CHARS_PER_TOKEN = 3.5; // ?쒓뎅???곸뼱 ?쇱슜 湲곗?
const MAX_HISTORY_LOG = 20;
const MIN_COMPRESSION_INTERVAL_MS = 30_000; // 理쒖냼 30珥?媛꾧꺽

// ?? ContextCompressor ?????????????????????????????????????????????

export class ContextCompressor {
  private static instance: ContextCompressor;
  private _config: CompressorConfig;
  private _stats: CompressorStats;
  private _compressing = false;

  private constructor(config?: Partial<CompressorConfig>) {
    this._config = {
      pressureThreshold: 0.80,
      systemPromptWarnPercent: 30,
      targetPressure: 0.55,
      ...config };
    this._stats = {
      totalCompressions: 0,
      totalTokensSaved: 0,
      lastCompressionAt: 0,
      compressionHistory: [] };
  }

  static getInstance(): ContextCompressor {
    if (!ContextCompressor.instance) {
      ContextCompressor.instance = new ContextCompressor();
    }
    return ContextCompressor.instance;
  }

  // ?? ?뺤텞 ?꾩슂 ?щ? ?뺤씤 ?????????????????????????????????????????

  shouldCompress(): { needed: boolean; pressure: number; nCtx: number } {
    const nCtx = llamaEngine.getNCtx() || 4096;
    const usedTokens = llamaEngine.getUsedTokens() || 0;
    const pressure = usedTokens / nCtx;

    return {
      needed: pressure >= this._config.pressureThreshold,
      pressure,
      nCtx };
  }

  // ?? ?쒖뒪???꾨＼?꾪듃 ?ш린 寃????????????????????????????????????

  checkSystemPromptSize(systemPrompt: string): string | null {
    const nCtx = llamaEngine.getNCtx() || 4096;
    const estimatedTokens = Math.ceil(systemPrompt.length / CHARS_PER_TOKEN);
    const percent = (estimatedTokens / nCtx) * 100;

    if (percent > this._config.systemPromptWarnPercent) {
      return `?쒖뒪???꾨＼?꾪듃媛 而⑦뀓?ㅽ듃 ?덈룄?곗쓽 ${Math.round(percent)}%瑜?李⑥??⑸땲?? ` +
        `${this._config.systemPromptWarnPercent}% ?댄븯濡?以꾩씠??寃껋쓣 沅뚯옣?⑸땲?? ` +
        `(${estimatedTokens}/${nCtx} ?좏겙)`;
    }
    return null;
  }


  async maybeCompress(sceneId: string): Promise<CompressionResult | null> {
    if (this._compressing) return null;

    // 理쒖냼 媛꾧꺽 諛⑹뼱
    if (Date.now() - this._stats.lastCompressionAt < MIN_COMPRESSION_INTERVAL_MS) {
      return null;
    }

    const { needed, pressure, nCtx } = this.shouldCompress();
    if (!needed) return null;

    return this.compress(sceneId, nCtx, pressure);
  }

  // ?? ?섎룞/?먮룞 ?뺤텞 ?ㅽ뻾 ????????????????????????????????????????

  async compress(
    sceneId: string,
    nCtx?: number,
    _currentPressure?: number,
  ): Promise<CompressionResult> {
    const startTime = Date.now();
    let usedBefore = 0;
    try {
      usedBefore = llamaEngine.getUsedTokens() ?? 0;
    } catch { /* ignored */ }

    this._compressing = true;
    const ctx = nCtx ?? llamaEngine.getNCtx() ?? 4096;
    let summarizedTurns = 0;
    let systemPromptWarning: string | null = null;

    try {
      // 1. ?쒖뒪???꾨＼?꾪듃 泥댄겕
      const warmupPrompt = llamaEngine.getWarmupSystemPrompt();
      if (warmupPrompt) {
        systemPromptWarning = this.checkSystemPromptSize(warmupPrompt);
      }

      // 2. keepTurns (?ъ슜 ?덊븿)

      // 3. 紐⑺몴 ?좏겙 怨꾩궛
      const targetTokens = Math.floor(ctx * this._config.targetPressure);
      const tokensToFree = Math.max(0, usedBefore - targetTokens);

      if (tokensToFree > 0 && sceneId) {
        // 4. OnDeviceSummarizer濡??붿빟 ?몃━嫄?        // ?щ윭 ?쇱슫??媛??(??踰덉뿉 15?댁뵫 ?붿빟)
        const maxRounds = Math.ceil(tokensToFree / (100 * CHARS_PER_TOKEN));
        for (let round = 0; round < Math.min(maxRounds, 3); round++) {
          try {
            const count = await onDeviceSummarizer.forceSummaryOnBackground(sceneId);
            summarizedTurns += (count || 0);
          } catch (e) {
            logger.warn('[ContextCompressor] round failed:', e);
            break;
          }

          // 紐⑺몴 ?ъ꽦 ?뺤씤
          const currentUsed = llamaEngine.getUsedTokens() ?? usedBefore;
          if (currentUsed <= targetTokens) break;
        }
      }

      // 5. 寃곌낵
      const usedAfter = llamaEngine.getUsedTokens() ?? usedBefore;
      const result: CompressionResult = {
        beforeTokens: usedBefore,
        afterTokens: usedAfter,
        summarizedTurns,
        systemPromptWarning,
        durationMs: Date.now() - startTime };

      // 6. ?듦퀎 ?낅뜲?댄듃
      this._stats.totalCompressions++;
      this._stats.totalTokensSaved += Math.max(0, usedBefore - usedAfter);
      this._stats.lastCompressionAt = Date.now();
      this._stats.compressionHistory.push({
        timestamp: Date.now(),
        beforeTokens: usedBefore,
        afterTokens: usedAfter,
        summarizedTurns });
      if (this._stats.compressionHistory.length > MAX_HISTORY_LOG) {
        this._stats.compressionHistory = this._stats.compressionHistory.slice(-MAX_HISTORY_LOG);
      }

      logger.log(
        `[ContextCompressor] ?뺤텞 ?꾨즺: ${usedBefore}??{usedAfter}?좏겙 ` +
        `(${summarizedTurns}???붿빟, ${result.durationMs}ms)`,
      );

      return result;
    } catch (e) {
      logger.error('[ContextCompressor] ?뺤텞 ?ㅽ뙣:', e);
      return {
        beforeTokens: usedBefore,
        afterTokens: usedBefore,
        summarizedTurns: 0,
        systemPromptWarning: null,
        durationMs: Date.now() - startTime };
    } finally {
      this._compressing = false;
    }
  }

  // ?? ?곹깭 議고쉶 ??????????????????????????????????????????????????

  getStats(): CompressorStats {
    return { ...this._stats };
  }

  isCompressing(): boolean {
    return this._compressing;
  }

  updateConfig(patch: Partial<CompressorConfig>): void {
    this._config = { ...this._config, ...patch };
  }
}

// ?? Singleton ?????????????????????????????????????????????????????

export const contextCompressor = ContextCompressor.getInstance();

