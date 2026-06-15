// src/utils/ChapterLogTracker.ts
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// Chapter Log Tracker ??AI ?묐떟留덈떎 援ъ“??濡쒓렇 ?쇱씤???꾩쟻 ???
//
// AI??留??묐떟 留??앹뿉 ?꾨옒 ?뺤떇???앹꽦(?꾨＼?꾪듃 媛뺤젣):
//   [L: Classroom] [1: Running] [2: Grabbed weapon] [Ev: Confrontation begins]
//
// ????꾨왂:
//   - 硫붾え由? Map<chapterKey, entries[]>
//   - ?뚯씪: RNFS DocumentDirectory/story_logs/{storyId}_{chapterId}.txt
//   - 梨뺥꽣 ?꾪솚 ??RAM ?ъ쑀?됱뿉 ?곕씪 ?숈쟻?쇰줈 ?좎? 媛쒖닔 寃곗젙
//     쨌 ?ъ쑀 RAM ??300MB ???꾩껜 ?좎? (??젣 ????
//     쨌 ?ъ쑀 RAM 150~300MB ??理쒓렐 20梨뺥꽣
//     쨌 ?ъ쑀 RAM  80~150MB ??理쒓렐 10梨뺥꽣
//     쨌 ?ъ쑀 RAM  < 80MB   ??理쒓렐  5梨뺥꽣 (理쒖냼 蹂댁옣)
//   - ??以?~70bytes?대?濡?50梨뺥꽣횞100??= 341KB ?섏? ??嫄곗쓽 臾댁떆 媛??//
// KV 蹂??
//   - handleChoiceSelect ??chapterLogTracker.toKVBlock() 利됱떆 諛섑솚
//   - [STORY LOG] 釉붾줉?쇰줈 system prompt prefix??二쇱엯
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

import { logger } from './logger';
import RNFS from './fileSystemCompat';
import { RAMChecker } from './RAMChecker';

// ?? RAM 湲곕컲 梨뺥꽣 ?좎? 媛쒖닔 湲곗? ?????????????????????????????????????
// ??以?~70bytes, 100??梨뺥꽣 = ~6KB ??留롮씠 ?좎??대룄 RAM 遺???놁쓬
const KEEP_LARGE  = 20;   // 150~300MB ?ъ쑀
const KEEP_MEDIUM = 10;   //  80~150MB ?ъ쑀
const KEEP_SMALL  =  5;   //  < 80MB  ?ъ쑀 (理쒖냼 蹂댁옣)

const RAM_MB_UNLIMITED = 300;  // ?댁긽?대㈃ ?꾨? ?좎?
const RAM_MB_LARGE     = 150;
const RAM_MB_MEDIUM    =  80;

const LOG_LINE_REGEX = /\[L:\s*[^\]]+\](\s*\[\d+:[^\]]+\])*(\s*\[Ev:[^\]]+\])?\s*$/;
const LOG_DIR = 'story_logs';

export interface ChapterLogEntry {
  line: string;   // ex: "[L: Classroom] [1: Running] [Ev: Conflict]"
  turn: number;
  ts:   number;
}

class ChapterLogTracker {
  private static _instance: ChapterLogTracker;
  private _current: Map<string, ChapterLogEntry[]> = new Map();
  private _turnCounters: Map<string, number> = new Map();
  // 媛??ㅽ넗由ъ쓽 梨뺥꽣 諛⑸Ц ?쒖꽌 (?꾨? ?좎?, ?닿굅 ???욎뿉???쒓굅)
  private _chapterHistory: Map<string, string[]> = new Map();
  // Track outstanding file writes so shutdown can wait for completion.
  private _pendingWrites: Set<Promise<void>> = new Set();

  static getInstance() {
    if (!ChapterLogTracker._instance) {
      ChapterLogTracker._instance = new ChapterLogTracker();
    }
    return ChapterLogTracker._instance;
  }

  private _key(storyId: string, chapterId: string) {
    return `${storyId}:${chapterId}`;
  }

  private _logPath(storyId: string, chapterId: string): string {
    // [BUG FIX] storyId??chapterId? ?숈씪?섍쾶 ?뱀닔臾몄옄 sanitize
    // storyId媛 '/'??'..'瑜??ы븿?섎㈃ ?덉긽 ??寃쎈줈???뚯씪 ?앹꽦 ?꾪뿕
    const safeStory = storyId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeId = chapterId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${RNFS.DocumentDirectoryPath}/${LOG_DIR}/${safeStory}_${safeId}.txt`;
  }

  // ?? RAM ?ъ쑀?????좎???梨뺥꽣 ??寃곗젙 ??????????????????????????????
  private async _keepCount(): Promise<number> {
    try {
      const ram = await RAMChecker.getInstance().check();
      // [BUG-009 FIX] ?⑥쐞 ?댁쨷 蹂???섏젙.
      // RAMChecker.buildInfo()???대? MB ?⑥쐞濡?諛섑솚?섎?濡?/(1024*1024) 遺덊븘??
      // ?댁쟾: ram.availableRAM / (1024 * 1024) ??2000MB ??freeMB ??0.0019 ????긽 KEEP_SMALL=5
      // ?섏젙: ram.availableRAM 洹몃?濡??ъ슜 (?대? MB)
      const freeMB = ram.availableRAM;
      if (freeMB >= RAM_MB_UNLIMITED) return Infinity;
      if (freeMB >= RAM_MB_LARGE)     return KEEP_LARGE;
      if (freeMB >= RAM_MB_MEDIUM)    return KEEP_MEDIUM;
      return KEEP_SMALL;
    } catch {
      // RAM 泥댄겕 ?ㅽ뙣 ???덉쟾?섍쾶 20媛??좎?
      return KEEP_LARGE;
    }
  }

  /**
   * AI ?묐떟?먯꽌 [L:...][N:...][Ev:...] ?쇱씤??異붿텧??硫붾え由??뚯씪???꾩쟻.
   */
  appendFromAIResponse(storyId: string, chapterId: string, aiRawText: string): boolean {
    // [BUG FIX #21] filter(Boolean) ?쒓굅 ??鍮?以??쒓굅 ???먮낯 ?쒖꽌濡???갑???ㅼ틪.
    // filter(Boolean) ?ъ슜 ??鍮?以꾩씠 ?뺤텞?섏뼱 ?몃뜳?ㅺ? 諛붾뚯? ?딆쑝??
    // AI ?묐떟 ?앹뿉 ?꾩쿂由?怨듬갚??遺숈쑝硫?non-empty 留덉?留?以꾩씠 濡쒓렇 ?쇱씤???꾨땺 ???덉쓬.
    // ??갑???ㅼ틪? ?좎??섎릺 trim ??鍮?臾몄옄?대룄 嫄대꼫?곕룄濡??섏젙.
    const lines = aiRawText.split('\n');
    let logLine = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;  // 鍮?以?嫄대꼫?
      // [BUG FIX #15] @emotion 以??? @2:e1+5|e4+3)? 濡쒓렇 ?쇱씤???꾨땲吏留?      // 濡쒓렇 ?쇱씤 諛붾줈 ?꾩뿉 ?ㅻ뒗 ?뺤긽 ?⑦꽩 ??嫄대꼫?곌퀬 怨꾩냽 ?ㅼ틪
      if (trimmed.startsWith('@')) continue;
      if (LOG_LINE_REGEX.test(trimmed)) {
        logLine = trimmed;
        break;
      }
      // 鍮꾩뼱?덉? ?딆? 以꾩씠 濡쒓렇 ?뺤떇???꾨땲硫????꾨? 怨꾩냽 ?ㅼ틪
      // (濡쒓렇 ?쇱씤 諛붾줈 ?꾩뿉 怨듬갚 ?꾨땶 以꾩씠 ?덉뼱??怨꾩냽 李얠쓬)
    }
    if (!logLine) return false;

    const key = this._key(storyId, chapterId);
    const entries = this._current.get(key) ?? [];
    const turn = (this._turnCounters.get(key) ?? 0) + 1;
    this._turnCounters.set(key, turn);
    entries.push({ line: logLine, turn, ts: Date.now() });
    this._current.set(key, entries);

    // ?뚯씪?먮룄 鍮꾨룞湲??????吏꾪뻾 以묒씤 ?곌린瑜?_pendingWrites濡?異붿쟻
    // [BUG-ITEM24 FIX] writePromise瑜?癒쇱? add????finally 泥섎━
    const writeOp = this._appendToFile(storyId, chapterId, logLine);
    this._pendingWrites.add(writeOp);
    writeOp.finally(() => this._pendingWrites.delete(writeOp)).catch(() => {});

    if (__DEV__) logger.log(`[ChapterLogTracker] ${chapterId} t${turn}: ${logLine}`);
    return true;
  }

  private async _appendToFile(storyId: string, chapterId: string, logLine: string): Promise<void> {
    try {
      const dir = `${RNFS.DocumentDirectoryPath}/${LOG_DIR}`;
      const exists = await RNFS.exists(dir);
      if (!exists) await RNFS.mkdir(dir);
      const path = this._logPath(storyId, chapterId);
      await RNFS.appendFile(path, logLine + '\n', 'utf8');
    } catch {
      // ?뚯씪 I/O ?ㅽ뙣 ??硫붾え由щ쭔 ?ъ슜
    }
  }

  /**
   * ?꾩옱 梨뺥꽣 濡쒓렇瑜?[STORY LOG] KV 釉붾줉 臾몄옄?대줈 蹂??
   */
  toKVBlock(storyId: string, chapterId: string): string {
    const key = this._key(storyId, chapterId);
    const entries = this._current.get(key) ?? [];
    if (entries.length === 0) return '';
    const lines = entries.map(e => e.line).join('\n');
    return `[STORY LOG]\n${lines}`;
  }

  /**
   * 梨뺥꽣 ?꾪솚 ???몄텧.
   * RAM ?ъ쑀?됱뿉 ?곕씪 ?좎? 媛쒖닔瑜??숈쟻?쇰줈 寃곗젙 ??理쒕???蹂댁〈.
   * ??以?~70bytes?대?濡?50梨뺥꽣횞100??= 341KB ?섏??쇰줈 遺???놁쓬.
   */
  async onChapterAdvance(storyId: string, fromChapterId: string, toChapterId: string): Promise<void> {
    // Rolling KV within the same chapter should reset that chapter log instead of accumulating forever.
    if (fromChapterId === toChapterId) {
      const key = this._key(storyId, fromChapterId);
      this._current.delete(key);
      this._turnCounters.delete(key);
      // ?뚯씪??珥덇린??(鍮꾨룞湲? ?ㅽ뙣 臾댁떆)
      RNFS.unlink(this._logPath(storyId, fromChapterId)).catch(() => {});
      if (__DEV__) logger.log(`[ChapterLogTracker] rolling KV ??梨뺥꽣 濡쒓렇 珥덇린?? ${fromChapterId}`);
      return;
    }

    // 梨뺥꽣 ?덉뒪?좊━ 媛깆떊
    const history = this._chapterHistory.get(storyId) ?? [];
    if (!history.includes(fromChapterId)) history.push(fromChapterId);
    // [BUG FIX #14] toChapterId瑜??덉뒪?좊━??異붽?
    if (!history.includes(toChapterId)) history.push(toChapterId);

    // RAM ?ъ쑀?됱뿉 ?곕씪 ?좎? 媛쒖닔 寃곗젙
    const keepCount = await this._keepCount();
    const freeMB_approx = keepCount === Infinity ? '??00'
      : keepCount === KEEP_LARGE  ? '150~300'
      : keepCount === KEEP_MEDIUM ? '80~150'
      : '<80';

    if (keepCount === Infinity || history.length <= keepCount) {
      // ?꾨? ?좎? ????젣 ?놁쓬
      this._chapterHistory.set(storyId, history);
      if (__DEV__) logger.log(
        `[ChapterLogTracker] ?꾪솚 ${fromChapterId} ??${toChapterId} | ` +
        `RAM ${freeMB_approx}MB ?ъ쑀 ???꾩껜 ${history.length}梨뺥꽣 ?좎?`
      );
      return;
    }

    // keepCount 珥덇낵遺꾨쭔 ?욎뿉???쒓굅
    const toDelete = history.slice(0, history.length - keepCount);
    for (const oldId of toDelete) {
      const key = this._key(storyId, oldId);
      this._current.delete(key);
      this._turnCounters.delete(key);
      const delOp = RNFS.unlink(this._logPath(storyId, oldId)).catch(() => {});
      this._pendingWrites.add(delOp);
      delOp.finally(() => this._pendingWrites.delete(delOp));
    }
    const kept = history.slice(-keepCount);
    this._chapterHistory.set(storyId, kept);

    if (__DEV__) logger.log(
      `[ChapterLogTracker] ?꾪솚 ${fromChapterId} ??${toChapterId} | ` +
      `RAM ${freeMB_approx}MB ?ъ쑀 ??理쒓렐 ${keepCount}梨뺥꽣 ?좎?, ${toDelete.length}媛??닿굅`
    );
  }

  /** ?ㅽ넗由???젣/珥덇린?????꾩껜 ?뺣━ */
  clearStory(storyId: string): void {
    for (const key of [...this._current.keys()]) {
      if (key.startsWith(storyId + ':')) {
        this._current.delete(key);
        this._turnCounters.delete(key);
      }
    }
    this._chapterHistory.delete(storyId);
  }

  /** ???꾩껜 醫낅즺/?ъ떆????紐⑤뱺 ?곹깭 珥덇린??*/
  reset(): void {
    this._current.clear();
    this._turnCounters.clear();
    this._chapterHistory.clear();
    this._pendingWrites.clear();
    if (__DEV__) logger.log('[ChapterLogTracker] Global reset');
  }

  getEntryCount(storyId: string, chapterId: string): number {
    return (this._current.get(this._key(storyId, chapterId)) ?? []).length;
  }

  getEntries(storyId: string, chapterId: string): ChapterLogEntry[] {
    return this._current.get(this._key(storyId, chapterId)) ?? [];
  }

  /**
   * [BUG FIX] ???ъ떆?????뚯씪?먯꽌 濡쒓렇 蹂듭썝.
   * ?댁쟾: ?뚯씪????ν뻽吏留??ъ떆????_current Map??蹂듭썝?섏? ?딆븘
   *       toKVBlock()????긽 鍮?臾몄옄??諛섑솚 ??storyLog ?뚯떎.
   * ?섏젙: initStory 吏꾩엯 ???뚯씪?먯꽌 ?쎌뼱 _current瑜?蹂듭썝.
   */
  async loadFromFile(storyId: string, chapterId: string): Promise<void> {
    const key = this._key(storyId, chapterId);
    if (this._current.has(key)) return; // ?대? 硫붾え由ъ뿉 ?덉쑝硫??ㅽ궢
    try {
      const path = this._logPath(storyId, chapterId);
      const exists = await RNFS.exists(path).catch(() => false);
      if (!exists) return;
      const raw = await RNFS.readFile(path, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim());
      const entries: ChapterLogEntry[] = lines.map((line, idx) => ({
        line: line.trim(),
        turn: idx + 1,
        ts:   0 }));
      if (entries.length > 0) {
        this._current.set(key, entries);
        this._turnCounters.set(key, entries.length);
        const history = this._chapterHistory.get(storyId) ?? [];
        if (!history.includes(chapterId)) history.push(chapterId);
        this._chapterHistory.set(storyId, history);
        if (__DEV__) logger.log(`[ChapterLogTracker] restored from file: ${chapterId} ${entries.length} lines`);
      }
    } catch {
      // ?뚯씪 ?쎄린 ?ㅽ뙣 ??臾댁떆 (??濡쒓렇濡??쒖옉)
    }
  }

  /**
   * ?꾩옱 ?ㅽ넗由ъ뿉??蹂댁〈 以묒씤 梨뺥꽣 ??諛섑솚 (?붾쾭洹??뚯뒪?몄슜)
   */
  getKeptChapterCount(storyId: string): number {
    return (this._chapterHistory.get(storyId) ?? []).length;
  }

  /**
   * [BUG FIX #24] 吏꾪뻾 以묒씤 紐⑤뱺 ?뚯씪 ?곌린 ?꾨즺 ?湲?
   * AppState background/inactive ?꾪솚 ???몄텧????醫낅즺 ??濡쒓렇 ?먯떎 諛⑹?.
   * KVStateManager._stopAndSave()? ?④퍡 ?몄텧?섎㈃ KV + 濡쒓렇 ?뚯씪???숆린?붾맖.
   */
  async flushAll(timeoutMs = 2000): Promise<void> {
    if (this._pendingWrites.size === 0) return;
    
    // Wait for all in-flight writes, but cap the wait so shutdown cannot hang forever.
    const allDone = Promise.allSettled(Array.from(this._pendingWrites));
    const timeout = new Promise(resolve => setTimeout(() => resolve(undefined), timeoutMs));

    await Promise.race([allDone, timeout]);
  }
}

export const chapterLogTracker = ChapterLogTracker.getInstance();
export default chapterLogTracker;

