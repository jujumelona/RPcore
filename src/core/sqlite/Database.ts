// src/core/sqlite/Database.ts
// SQLite 데이터베이스 관리

import { open } from '@op-engineering/op-sqlite';
import {
  INIT_TABLES, DB_NAME, DB_VERSION,
  MIGRATION_V1_TO_V2, MIGRATION_V2_TO_V3, MIGRATION_V3_TO_V4, MIGRATION_V4_TO_V5,
  MIGRATION_V5_TO_V6,
  Character, Conversation, MemorySummary, CharacterMetrics, Scene, StoryAsset,
} from './Schemas';

export class Database {
  private static instance: Database;
  private db: any = null;

  private constructor() {
    try {
      this.db = open({ name: DB_NAME });
      this.initialize();
    } catch (e) {
      console.error('[DB] Failed to open database:', e);
      // db remains null; all methods guard with this.db check
    }
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || '';
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      const direct =
        record.message ??
        record.errorMessage ??
        record.nativeMessage ??
        record.description;
      if (typeof direct === 'string') return direct;
      if (record.cause) return this.getErrorMessage(record.cause);
    }
    return String(error ?? '');
  }

  private shouldIgnoreSqlError(sql: string, error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    const isFtsUnavailable =
      message.includes('no such module: fts5') ||
      message.includes('no such table: conversations_fts') ||
      message.includes('no such table: main.conversations_fts');
    if (!isFtsUnavailable) return false;
    return /fts5|conversations_fts/i.test(sql);
  }

  private initialize() {
    if (!this.db) return;
    try {
      if (__DEV__) console.log('[DB] Initializing database...');

      // FTS5 가상 테이블이 실제로 생성됐는지 추적
      // 생성 실패 시 FTS 트리거도 건너뛰어 "no such table" 트리거 오폭 방지
      let ftsCreated = false;

      INIT_TABLES.forEach(sql => {
        // FTS 트리거는 가상 테이블 없으면 생성해도 INSERT 때마다 폭발 → 스킵
        const isFtsTrigger = /CREATE\s+TRIGGER\s+\S*fts/i.test(sql);
        if (isFtsTrigger && !ftsCreated) {
          console.warn('[DB] Skipping FTS trigger — FTS table not available.');
          return;
        }
        try {
          this.runRawSync(sql);
          if (/CREATE\s+VIRTUAL\s+TABLE.*conversations_fts/i.test(sql)) {
            ftsCreated = true;
            if (__DEV__) console.log('[DB] FTS5 virtual table created successfully.');
          }
        } catch (error) {
          if (this.shouldIgnoreSqlError(sql, error)) {
            console.warn('[DB] FTS5 not supported on this build. Skipping FTS init.');
            return;
          }
          console.error('[DB] Init statement failed:', error);
        }
      });

      // 버전 마이그레이션 실행 (기존 DB 유저 대응)
      this.runMigrations(ftsCreated);

      if (__DEV__) console.log('[DB] Database initialized');
    } catch (e) {
      console.error('[DB] Initialization failed:', e);
    }
  }

  private runMigrations(ftsAvailable: boolean): void {
    if (!this.db) return;
    try {
      const currentVersion: number = (() => {
        try {
          const r = this.db.execute('PRAGMA user_version');
          return (r.rows?._array[0]?.user_version as number) ?? 0;
        } catch { return 0; }
      })();

      if (currentVersion >= DB_VERSION) return;

      if (__DEV__) console.log(`[DB] Migration 시작: v${currentVersion} → v${DB_VERSION}`);

      const migrations: Record<number, string[]> = {
        1: MIGRATION_V1_TO_V2,
        2: MIGRATION_V2_TO_V3,
        3: MIGRATION_V3_TO_V4,
        // FTS5 미지원 기기는 v4→v5 마이그레이션 스킵 (트리거 오폭 방지)
        4: ftsAvailable ? MIGRATION_V4_TO_V5 : [],
        5: MIGRATION_V5_TO_V6,
      };

      for (let v = currentVersion; v < DB_VERSION; v++) {
        const steps = migrations[v] ?? [];
        steps.forEach(sql => {
          try {
            this.runRawSync(sql);
          } catch (error) {
            if (this.shouldIgnoreSqlError(sql, error)) return;
            // ALTER TABLE은 IF NOT EXISTS 미지원 → 이미 존재하는 컬럼/인덱스면 무시
            const msg = this.getErrorMessage(error).toLowerCase();
            if (
              msg.includes('duplicate column name') ||
              msg.includes('already exists')
            ) {
              if (__DEV__) console.log(`[DB] Migration v${v}→v${v + 1}: 이미 적용됨, 건너뜀 — ${sql.slice(0, 60)}`);
              return;
            }
            console.error(`[DB] Migration v${v}→v${v + 1} 실패:`, sql, error);
          }
        });
        this.db.execute(`PRAGMA user_version = ${v + 1}`);
        if (__DEV__) console.log(`[DB] Migrated v${v} → v${v + 1}`);
      }
    } catch (e) {
      console.error('[DB] runMigrations 실패:', e);
    }
  }
  private _extractRows(result: any): any[] {
    if (!result) return [];
    if (Array.isArray(result.rows)) return result.rows;
    if (result.rows?._array) return result.rows._array;
    if (Array.isArray(result.res)) return result.res;
    return [];
  }

  // ============================================
  // Character Methods
  // ============================================

  insertCharacter(char: Omit<Character, 'created_at' | 'updated_at'>): void {
    if (!this.db) return;
    this.db.execute(
      'INSERT OR REPLACE INTO characters (id, name, current_location_id, image_path, personality, base_prompt) VALUES (?, ?, ?, ?, ?, ?)',
      [char.id, char.name, char.current_location_id, char.image_path, char.personality, char.base_prompt]
    );
  }

  getCharacter(id: string): Character | null {
    if (!this.db) return null;
    const result = this.db.execute('SELECT * FROM characters WHERE id = ?', [id]);
    return result.rows?._array[0] || null;
  }

  getAllCharacters(): Character[] {
    if (!this.db) return [];
    const result = this.db.execute('SELECT * FROM characters');
    return result.rows?._array || [];
  }

  // ============================================
  // Conversation Methods
  // ============================================

  insertConversation(conv: Omit<Conversation, 'id' | 'timestamp'>): number {
    if (!this.db) return 0;
    // [BUG FIX] 4개 컬럼 누락 수정: owner_ids, importance_score, vector_id, client_id 추가
    this.db.execute(
      'INSERT INTO conversations (story_id, chapter_id, speaker_id, speaker_type, content, scene_id, is_important, emotion, tags, owner_ids, importance_score, vector_id, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [conv.story_id ?? null, conv.chapter_id ?? null, conv.speaker_id, conv.speaker_type, conv.content, conv.scene_id ?? null, conv.is_important ?? 0, conv.emotion ?? null, conv.tags ?? null, conv.owner_ids ?? '[]', conv.importance_score ?? 5, conv.vector_id ?? null, conv.client_id ?? null]
    );
    const result = this.db.execute('SELECT last_insert_rowid() as id');
    return result.rows?._array[0]?.id || 0;
  }

  getConversationById(id: number): Conversation | null {
    if (!this.db) return null;
    const result = this.db.execute('SELECT * FROM conversations WHERE id = ?', [id]);
    return result.rows?._array[0] || null;
  }

  getRecentConversations(limit: number = 10): Conversation[] {
    if (!this.db) return [];
    // [BUG FIX] DESC로 최신 N개 가져온 뒤 ASC로 재정렬 — AI 컨텍스트는 시간순 필요
    const result = this.db.execute(
      'SELECT * FROM (SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC',
      [limit]
    );
    return result.rows?._array || [];
  }

  getRecentConversationsByStory(storyId: string, limit: number = 10): Conversation[] {
    if (!this.db) return [];
    // [BUG FIX] DESC로 최신 N개 가져온 뒤 ASC로 재정렬
    const result = this.db.execute(
      'SELECT * FROM (SELECT * FROM conversations WHERE story_id = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC',
      [storyId, limit]
    );
    return result.rows?._array || [];
  }

  /**
   * 특정 scene에 대한 최근 대화만 가져오기
   * OnDeviceSummarizer 등이 씬별 요약을 할 때 사용한다.
   */
  getRecentConversationsByScene(sceneId: string, limit: number = 10): Conversation[] {
    if (!this.db) return [];
    // [BUG FIX] DESC로 최신 N개 가져온 뒤 ASC로 재정렬
    const result = this.db.execute(
      'SELECT * FROM (SELECT * FROM conversations WHERE scene_id = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC',
      [sceneId, limit]
    );
    return result.rows?._array || [];
  }

  // 스토리 전체 챕터 목록 가져오기
  getChaptersByStory(storyId: string): string[] {
    if (!this.db) return [];
    // [BUG FIX] DISTINCT + ORDER BY MIN(timestamp)는 GROUP BY 없이 사용 불가
    // GROUP BY로 묶어줘야 MIN() 집계의 기준이 명확해짐
    const result = this.db.execute(
      'SELECT chapter_id FROM conversations WHERE story_id = ? AND chapter_id IS NOT NULL GROUP BY chapter_id ORDER BY MIN(timestamp)',
      [storyId]
    );
    return (result.rows?._array || []).map((r: any) => r.chapter_id);
  }

  // 챕터별 대화 기록 가져오기 (웹소설 변환용)
  getConversationsByChapter(storyId: string, chapterId: string): Conversation[] {
    if (!this.db) return [];
    const result = this.db.execute(
      'SELECT * FROM conversations WHERE story_id = ? AND chapter_id = ? ORDER BY timestamp ASC',
      [storyId, chapterId]
    );
    return result.rows?._array || [];
  }

  // 스토리 전체 대화 수
  getConversationCount(storyId: string): number {
    if (!this.db) return 0;
    const result = this.db.execute(
      'SELECT COUNT(*) as cnt FROM conversations WHERE story_id = ?',
      [storyId]
    );
    return result.rows?._array[0]?.cnt || 0;
  }

  /**
   * 여러 대화 레코드를 id 기준으로 일괄 삭제
   * OnDeviceSummarizer에서 요약 이후 단기 대화를 정리할 때 사용.
   */
  deleteConversations(ids: number[]): void {
    if (!this.db || !ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.execute(
      `DELETE FROM conversations WHERE id IN (${placeholders})`,
      ids
    );
  }

  getImportantConversations(sceneId?: string, limit?: number): Conversation[] {
    if (!this.db) return [];
    let sql = 'SELECT * FROM conversations WHERE is_important = 1';
    const params: any[] = [];
    
    if (sceneId) {
      sql += ' AND scene_id = ?';
      params.push(sceneId);
    }
    
    // [BUG FIX] ORDER BY DESC → ASC로 변경
    // 기존: DESC 정렬로 반환 → 호출부에서 시간순(ASC) 컨텍스트로 사용할 때 역순 메모리를 AI에 전달
    // 수정: ASC(오래된 것 먼저) 정렬 → 시간 흐름에 맞는 대화 맥락 제공
    sql += ' ORDER BY timestamp ASC';

    if (typeof limit === 'number') {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    
    const result = this.db.execute(sql, params);
    return result.rows?._array || [];
  }

  getImportantConversationsByStory(storyId: string, limit: number = 20): Conversation[] {
    if (!this.db) return [];
    // [BUG FIX] ORDER BY DESC → ASC로 변경 (getImportantConversations와 일관성 유지)
    const result = this.db.execute(
      'SELECT * FROM conversations WHERE is_important = 1 AND story_id = ? ORDER BY timestamp ASC LIMIT ?',
      [storyId, limit]
    );
    return result.rows?._array || [];
  }

  // ============================================
  // Global State Methods
  // ============================================

  setGlobalState(key: string, value: string): void {
    if (!this.db) return;
    this.db.execute(
      'INSERT OR REPLACE INTO global_state (key, value) VALUES (?, ?)',
      [key, value]
    );
  }

  getGlobalState(key: string): string | null {
    if (!this.db) return null;
    const result = this.db.execute('SELECT value FROM global_state WHERE key = ?', [key]);
    return result.rows?._array[0]?.value || null;
  }

  // ============================================
  // Memory Summary Methods
  // ============================================

  insertMemorySummary(summary: Omit<MemorySummary, 'id' | 'created_at'>): void {
    if (!this.db) return;
    this.db.execute(
      'INSERT INTO memory_summaries (scene_id, summary_type, content, importance_score) VALUES (?, ?, ?, ?)',
      [summary.scene_id, summary.summary_type, summary.content, summary.importance_score]
    );
  }

  getMemorySummaries(sceneId: string, type?: 'short' | 'medium' | 'long'): MemorySummary[] {
    if (!this.db) return [];
    let sql = 'SELECT * FROM memory_summaries WHERE scene_id = ?';
    const params: any[] = [sceneId];
    
    if (type) {
      sql += ' AND summary_type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY importance_score DESC';
    
    const result = this.db.execute(sql, params);
    return result.rows?._array || [];
  }

  // ============================================
  // Character Metrics Methods
  // ============================================

  upsertCharacterMetrics(metrics: CharacterMetrics): void {
    if (!this.db) return;
    this.db.execute(
      'INSERT OR REPLACE INTO character_metrics (character_id, love_score, trust_score, tension_score, custom_metrics) VALUES (?, ?, ?, ?, ?)',
      [metrics.character_id, metrics.love_score, metrics.trust_score, metrics.tension_score, metrics.custom_metrics]
    );
  }

  getCharacterMetrics(characterId: string): CharacterMetrics | null {
    if (!this.db) return null;
    const result = this.db.execute('SELECT * FROM character_metrics WHERE character_id = ?', [characterId]);
    return result.rows?._array[0] || null;
  }

  // ============================================
  // Scene Methods
  // ============================================

  insertScene(scene: Omit<Scene, 'created_at'>): void {
    if (!this.db) return;
    this.db.execute(
      'INSERT OR REPLACE INTO scenes (id, story_id, location_name, active_character_ids, scene_state) VALUES (?, ?, ?, ?, ?)',
      [scene.id, scene.story_id, scene.location_name, scene.active_character_ids, scene.scene_state]
    );
  }

  getScene(id: string): Scene | null {
    if (!this.db) return null;
    const result = this.db.execute('SELECT * FROM scenes WHERE id = ?', [id]);
    return result.rows?._array[0] || null;
  }

  getCurrentScene(): Scene | null {
    if (!this.db) return null;
    const currentSceneId = this.getGlobalState('current_scene_id');
    if (!currentSceneId) return null;
    return this.getScene(currentSceneId);
  }

  // ============================================
  // Utility Methods
  // ============================================

  clearAllData(): void {
    if (!this.db) return;
    this.db.execute('DELETE FROM conversations');
    this.db.execute('DELETE FROM memory_summaries');
    this.db.execute('DELETE FROM global_state');
    this.db.execute('DELETE FROM character_metrics');
    this.db.execute('DELETE FROM scenes');
    this.db.execute('DELETE FROM characters');
    if (__DEV__) console.log('[DB] All data cleared');
  }

  // [BUG FIX #29] storyId 파라미터 추가 — 다른 스토리의 동일 client_id 메시지 삭제 방지
  deleteConversationsByClientIds(clientIds: string[], storyId?: string): void {
    if (!this.db || !clientIds.length) return;
    const placeholders = clientIds.map(() => '?').join(',');
    if (storyId) {
      this.db.execute(
        `DELETE FROM conversations WHERE client_id IN (${placeholders}) AND story_id = ?`,
        [...clientIds, storyId]
      );
    } else {
      this.db.execute(
        `DELETE FROM conversations WHERE client_id IN (${placeholders})`,
        clientIds
      );
    }
  }

  deleteConversationsByStory(storyId: string): void {
    if (!storyId) return;
    // [BUG FIX] db null 체크 누락 수정 — DB 초기화 실패 시 this.db.execute()에서 crash
    if (!this.db) return;
    this.db.execute(
      'DELETE FROM conversations WHERE story_id = ?',
      [storyId]
    );
  }

  // ============================================
  // Story Assets Methods (이미지 URL↔로컬경로 영구 저장)
  // ============================================

  /**
   * 다운로드된 이미지의 URL→로컬경로 매핑을 DB에 저장
   * INSERT OR REPLACE로 중복 URL은 경로만 갱신
   */
  saveStoryAssets(storyId: string, assets: Array<{ assetType: string; remoteUrl: string; localPath: string }>): void {
    if (!this.db || !storyId || !assets.length) return;
    try {
      for (const asset of assets) {
        if (!asset.remoteUrl || !asset.localPath) continue;
        this.db.execute(
          'INSERT OR REPLACE INTO story_assets (story_id, asset_type, remote_url, local_path) VALUES (?, ?, ?, ?)',
          [storyId, asset.assetType, asset.remoteUrl, asset.localPath]
        );
      }
      if (__DEV__) console.log(`[DB] story_assets 저장: storyId=${storyId}, count=${assets.length}`);
    } catch (e) {
      console.error('[DB] saveStoryAssets 실패:', e);
    }
  }

  /**
   * 특정 스토리의 모든 에셋 레코드 조회
   */
  getStoryAssets(storyId: string): StoryAsset[] {
    if (!this.db || !storyId) return [];
    try {
      const result = this.db.execute(
        'SELECT * FROM story_assets WHERE story_id = ?',
        [storyId]
      );
      return this._extractRows(result) as StoryAsset[];
    } catch (e) {
      console.error('[DB] getStoryAssets 실패:', e);
      return [];
    }
  }

  /**
   * 특정 URL의 로컬 경로를 DB에서 조회
   */
  getStoryAssetLocalPath(storyId: string, remoteUrl: string): string | null {
    if (!this.db || !storyId || !remoteUrl) return null;
    try {
      const result = this.db.execute(
        'SELECT local_path FROM story_assets WHERE story_id = ? AND remote_url = ?',
        [storyId, remoteUrl]
      );
      const rows = this._extractRows(result);
      return rows[0]?.local_path ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 스토리 삭제 시 해당 에셋 레코드 일괄 삭제
   */
  deleteStoryAssets(storyId: string): void {
    if (!this.db || !storyId) return;
    try {
      this.db.execute(
        'DELETE FROM story_assets WHERE story_id = ?',
        [storyId]
      );
      if (__DEV__) console.log(`[DB] story_assets 삭제: storyId=${storyId}`);
    } catch (e) {
      console.error('[DB] deleteStoryAssets 실패:', e);
    }
  }

  /**
   * SQL 실행 (결과값 없음) — awaitable
   */
  async runRaw(sql: string, params: any[] = []): Promise<void> {
    if (!this.db) return;
    try {
      // 1. executeSync 가 있으면 동기 실행 (최고 속도)
      if (typeof this.db.executeSync === 'function') {
        this.db.executeSync(sql, params);
        return;
      }
      if (typeof this.db.executeRawSync === 'function') {
        this.db.executeRawSync(sql, params);
        return;
      }

      // 2. 비동기 실행
      let pending: any = null;
      if (typeof this.db.execute === 'function') {
        pending = this.db.execute(sql, params);
      } else if (typeof this.db.executeRaw === 'function') {
        pending = this.db.executeRaw(sql, params);
      }

      if (pending && typeof pending.then === 'function') {
        await Promise.resolve(pending);
      }
    } catch (error) {
      if (this.shouldIgnoreSqlError(sql, error)) return;
      throw error;
    }
  }

  /**
   * SQL 실행 (동기 전용) — 초기화 등에서 사용
   */
  runRawSync(sql: string, params: any[] = []): void {
    if (!this.db) return;
    try {
      if (typeof this.db.executeSync === 'function') {
        this.db.executeSync(sql, params);
        return;
      }
      if (typeof this.db.executeRawSync === 'function') {
        this.db.executeRawSync(sql, params);
        return;
      }
      // [BUG FIX] fallback 비동기 실행 제거 — 초기화 시 실행 순서 보장 불가
      console.warn('[DB] executeSync/executeRawSync not available. Skipping sync execution for:', sql);
    } catch (error) {
      if (this.shouldIgnoreSqlError(sql, error)) return;
      throw error;
    }
  }

  queryRaw<T = any>(sql: string, params: any[] = []): T[] {
    if (!this.db) return [];
    try {
      if (typeof this.db.executeSync === 'function') {
        return this._extractRows(this.db.executeSync(sql, params)) as T[];
      }
      if (typeof this.db.execute === 'function') {
        return this._extractRows(this.db.execute(sql, params)) as T[];
      }
    } catch (error) {
      if (this.shouldIgnoreSqlError(sql, error)) return [];
      throw error;
    }
    return [];
  }

  async queryAsync<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) return [];
    try {
      if (typeof this.db.execute === 'function') {
        const result = await Promise.resolve(this.db.execute(sql, params));
        return this._extractRows(result) as T[];
      }
      if (typeof this.db.executeSync === 'function') {
        return this._extractRows(this.db.executeSync(sql, params)) as T[];
      }
      if (typeof this.db.executeRaw === 'function') {
        return (await this.db.executeRaw(sql, params)) as T[];
      }
    } catch (error) {
      if (this.shouldIgnoreSqlError(sql, error)) return [];
      throw error;
    }
    return [];
  }

  async searchConversations(
    query: string,
    limit = 30,
  ): Promise<Array<{ id: number; content: string; story_id: string; speaker_id: string; timestamp: number }>> {
    if (!this.db || !query.trim()) return [];
    try {
      const q = `%${query.trim()}%`;
      return await this.queryAsync<{ id: number; content: string; story_id: string; speaker_id: string; timestamp: number }>(
        `SELECT id, content, story_id, speaker_id, timestamp FROM conversations WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?`,
        [q, limit],
      );
    } catch {
      return [];
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      if (__DEV__) console.log('[DB] Database closed');
    }
  }
}

// Singleton export
let _dbInstance: Database | null = null;
export const db = new Proxy({} as Database, {
  get(_t, p) {
    if (!_dbInstance) _dbInstance = Database.getInstance();
    return (_dbInstance as unknown as Record<string|symbol, unknown>)[p as string];
  },
  set(_t, p, v) {
    if (!_dbInstance) _dbInstance = Database.getInstance();
    (_dbInstance as unknown as Record<string|symbol, unknown>)[p as string] = v;
    return true;
  } });
