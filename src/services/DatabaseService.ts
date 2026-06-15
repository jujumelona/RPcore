// src/services/DatabaseService.ts
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// [理쒖쟻??v4] Batch Insert + ?몃옖??뀡 理쒖쟻??//
// ??[OPT v4] saveMessagesBatch ??蹂듭닔 硫붿떆吏 ?⑥씪 ?몃옖??뀡 INSERT
//    湲곗〈 v3: saveMessageAsync 1嫄댁뵫 ??硫붿떆吏留덈떎 ?붿뒪??I/O 1??//    ?섏젙 v4: ?щ윭 硫붿떆吏瑜?紐⑥븘 BEGIN/COMMIT 1?뚮줈 ?쇨큵 泥섎━
//
//    AI 梨꾪똿 ?뱀꽦:
//    - ??AI ?묐떟???щ윭 硫붿떆吏(?섎젅?댄꽣 + AI 횞 n媛? ?앹꽦
//    - 媛곴컖 saveMessageAsync ?몄텧 ???붿뒪??I/O n??//    - saveMessagesBatch濡?n媛쒕? 1媛??몃옖??뀡?쇰줈 ??I/O 1??//    - op-sqlite媛 ?꾨Т由?鍮좊Ⅴ?붾씪???붿뒪???곌린 ?잛닔 ?먯껜媛 諛섏쓳??寃곗젙
//    ??chatStore.addMessages() 蹂듭닔 硫붿꽌?쒕줈 ?몄텧 痢≪씠 諛곗튂 寃곗젙
//
// ??[OPT v3 ?좎?] dbPool.write/transaction ?쇱슦??// ??[OPT v3 ?좎?] deleteMessages ??dbPool.transaction()
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

import { dbPool } from '../core/sqlite/DatabasePool';
import { logger } from '../utils/logger';

export interface SaveMessageParams {
  id:          string;
  storyId:     string;
  speakerId:   string;
  content:     string;
  timestamp:   number;
  isImportant: boolean;
  genre?:      string;
  chapterId?:  string;
}

export const DatabaseService = {
  /**
   * 硫붿떆吏 ?④굔 ?????fire-and-forget (UI 釉붾줉 ?놁쓬)
   * ??[OPT v3 ?좎?] dbPool.write() 吏곷젹????寃쎌쑀
   */
  saveMessage(params: SaveMessageParams): void {
    dbPool.write(db => {
      db.insertConversation({
        story_id:       params.storyId,
        chapter_id:     params.chapterId,
        speaker_id:     params.speakerId,
        speaker_type:   params.speakerId === 'user' ? 'user' : (params.speakerId === 'narrator' || params.speakerId === '0') ? 'narrator' : 'ai',
        content:        params.content,
        scene_id:       undefined,
        is_important:   params.isImportant ? 1 : 0,
        emotion:        undefined,
        tags:           undefined,
        owner_ids:      '[]',
        importance_score: 5,
        vector_id:      undefined,
        client_id:      params.id });
    }).catch(e => logger.error('[DatabaseService] saveMessage ?ㅽ뙣:', e));
  },

  /**
   * 硫붿떆吏 ?④굔 ?????awaitable
   */
  async saveMessageAsync(params: SaveMessageParams): Promise<void> {
    await dbPool.write(db => {
      db.insertConversation({
        story_id:       params.storyId,
        chapter_id:     params.chapterId,
        speaker_id:     params.speakerId,
        speaker_type:   params.speakerId === 'user' ? 'user' : (params.speakerId === 'narrator' || params.speakerId === '0') ? 'narrator' : 'ai',
        content:        params.content,
        scene_id:       undefined,
        is_important:   params.isImportant ? 1 : 0,
        emotion:        undefined,
        tags:           undefined,
        owner_ids:      '[]',
        importance_score: 5,
        vector_id:      undefined,
        client_id:      params.id });
    });
  },

  /**
   * ??[OPT v4 NEW] 蹂듭닔 硫붿떆吏 Batch INSERT ???⑥씪 ?몃옖??뀡
   *
   * AI 梨꾪똿 ?듭떖 理쒖쟻??
   *   ??AI ?묐떟 = ?섎젅?댄꽣 1媛?+ AI 罹먮┃??1~3媛???理쒕? 4媛?硫붿떆吏
   *   湲곗〈: 4踰?saveMessageAsync() ???붿뒪??I/O 4??   *   ?섏젙: 1踰?saveMessagesBatch() ??BEGIN/COMMIT 1?? ?붿뒪??I/O 1??   *
   *   ?④낵:
   *   - ?붿뒪??write I/O: n????1??(n = 硫붿떆吏 ??
   *   - SQLite ?몃옖??뀡 ?ㅻ쾭?ㅻ뱶: n????1??   *   - ??諛섏쓳?? I/O ?꾨즺瑜?湲곕떎由ъ? ?딆쑝誘濡?UI ?꾨━吏??놁쓬
   *   - ?먯옄?? 以묎컙 ?ㅽ뙣 ??ROLLBACK ??遺遺?????놁쓬
   *
   * ?ъ슜泥? chatStore.addMessages() ???ㅽ듃由щ컢 ?꾨즺 ??AI ?묐떟 ?꾩껜 ???   */
  async saveMessagesBatch(messages: SaveMessageParams[]): Promise<void> {
    if (!messages.length) return;

    // 1媛쒕㈃ ?④굔?쇰줈 泥섎━ (?몃옖??뀡 ?ㅻ쾭?ㅻ뱶 遺덊븘??
    if (messages.length === 1) {
      return this.saveMessageAsync(messages[0]!);
    }

    await dbPool.transaction(db => {
      for (const params of messages) {
        db.insertConversation({
          story_id:       params.storyId,
          chapter_id:     params.chapterId,
          speaker_id:     params.speakerId,
          speaker_type:   params.speakerId === 'user' ? 'user' : (params.speakerId === 'narrator' || params.speakerId === '0') ? 'narrator' : 'ai',
          content:        params.content,
          scene_id:       undefined,
          is_important:   params.isImportant ? 1 : 0,
          emotion:        undefined,
          tags:           undefined,
          owner_ids:      '[]',
          importance_score: 5,
          vector_id:      undefined,
          client_id:      params.id });
      }
    });

    // [BUG FIX #10] saveMessagesBatch?먯꽌 trackInteraction ?쒓굅
    // 湲곗〈: saveMessagesBatch ?몄텧留덈떎 trackInteraction ?ㅽ뻾
    //       saveMessagesBatch???쒖닔 ????꾩슜 ???듦퀎 異붿쟻 梨낆엫 ?놁쓬.
  },

  /**
   * fire-and-forget 諛곗튂 ??????꾨즺瑜?湲곕떎由ъ? ?딆쓬
   * ?ㅽ듃由щ컢 ?꾨즺 ??諛깃렇?쇱슫?쒖뿉????ν븷 ???ъ슜
   */
  saveMessagesBatchFire(messages: SaveMessageParams[]): void {
    this.saveMessagesBatch(messages).catch(e =>
      logger.error('[DatabaseService] saveMessagesBatch ?ㅽ뙣:', e),
    );
  },

  /**
   * ???湲곕줉 濡쒕뱶 ???섏씠吏?吏??   */
  async getMessages(
    storyId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<any[]> {
    try {
      // ??[BUG FIX] 湲곕낯 limit -1 (臾댁젣?? ???곗씠???좎떎 諛⑹?
      // 湲곗〈: 500媛쒕줈 ?쒗븳 ??500媛??댁긽??湲?梨꾪똿 湲곕줉???몄뀡 蹂듭썝 ???좎떎?섎뒗 移섎챸??踰꾧렇
      // ?섏젙: limit=-1 (SQLite?먯꽌 臾댁젣???섎?). ?몄텧?먭? ?꾩슂 ??紐낆떆?곸쑝濡?limit 吏??媛??
      const { limit = -1, offset = 0 } = options;
      const rows = await dbPool.readQueryAsync<any>(
        `SELECT * FROM conversations
          WHERE story_id = ?
          ORDER BY timestamp ASC, id ASC
          LIMIT ? OFFSET ?`,
        [storyId, limit, offset],
      );
      // DB snake_case -> interface camelCase 留ㅽ븨
      return (rows || []).map((row: any) => ({
        id: String(row.client_id ?? row.id ?? ''),
        storyId: row.story_id,
        chapterId: row.chapter_id,
        speaker: row.speaker_id === 'user' ? 1 : row.speaker_id === 'narrator' ? 0 : Number(row.speaker_id) || 2,
        content: row.content,
        timestamp: row.timestamp,
        isImportant: row.is_important === 1 || row.is_important === true }));
    } catch (e) {
      logger.error('[DatabaseService] getMessages ?ㅽ뙣:', e);
      return [];
    }
  },

  /**
   * 硫붿떆吏 ?쇨큵 ??젣 ???먯옄???몃옖??뀡
   * [?섏젙] storyId瑜?議곌굔???ы븿???ㅻⅨ ?ㅽ넗由ъ쓽 ?숈씪 client_id 硫붿떆吏 ??젣 諛⑹?
   */
  async deleteMessages(storyId: string, messageIds: string[]): Promise<void> {
    if (!messageIds.length) return;
    await dbPool.transaction(db => {
      db.deleteConversationsByClientIds(messageIds, storyId);
    });
  },

  /**
   * ??[NEW] ??꾩뒪?ы봽 湲곗? ?댁쟾 硫붿떆吏 濡쒕뱶 ??ChatPaginationManager??   * ?꾨줈 ?ㅽ겕濡????댁쟾 硫붿떆吏 30媛쒖뵫 ?섏씠吏?   */
  async getMessagesBefore(
    storyId: string,
    beforeTimestamp: number,
    limit: number = 30,
  ): Promise<any[]> {
    try {
      const rows = await dbPool.readQueryAsync<any>(
        `SELECT * FROM (
          SELECT * FROM conversations
          WHERE story_id = ? AND timestamp < ?
          ORDER BY timestamp DESC, id DESC
          LIMIT ?
        ) ORDER BY timestamp ASC, id ASC`,
        [storyId, beforeTimestamp, limit],
      );
      // DB snake_case -> interface camelCase 留ㅽ븨
      return (rows || []).map((row: any) => ({
        id: String(row.client_id ?? row.id ?? ''),
        storyId: row.story_id,
        chapterId: row.chapter_id,
        speaker: row.speaker_id === 'user' ? 1 : row.speaker_id === 'narrator' ? 0 : Number(row.speaker_id) || 2,
        content: row.content,
        timestamp: row.timestamp,
        isImportant: row.is_important === 1 || row.is_important === true }));
    } catch (e) {
      logger.error('[DatabaseService] getMessagesBefore ?ㅽ뙣:', e);
      return [];
    }
  },

  /**
   * storyId濡??대떦 ?ㅽ넗由ъ쓽 紐⑤뱺 硫붿떆吏 ??젣
   */
  async deleteMessagesByStory(storyId: string): Promise<void> {
    if (!storyId) return;
    try {
      await dbPool.transaction(db => {
        db.deleteConversationsByStory(storyId);
      });
    } catch (e) {
      logger.error('[DatabaseService] deleteMessagesByStory ?ㅽ뙣:', e);
    }
  } };




