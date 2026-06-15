// src/core/sqlite/Schemas.ts
// [OPT v2] FTS5 Full-Text Search 추가
//
// ─ 신규: conversations_fts 가상 테이블 ─────────────────────
//   FTS5(Full-Text Search 5): SQLite 내장 역색인 엔진
//   수만 개의 대화 기록 중 키워드를 밀리초 단위로 검색
//
//   사용:
//     SELECT * FROM conversations_fts WHERE conversations_fts MATCH '그 카페';
//     -> 전체 텍스트 BM25 랭킹으로 정렬된 결과 즉시 반환
//
//   동기화:
//     conversations 테이블에 TRIGGER를 걸어 INSERT/DELETE 시 자동 동기화
//     -> 별도 업데이트 코드 없음, 항상 최신 상태 유지
//
// ─ 신규: PRAGMA mmap_size ──────────────────────────────────
//   메모리 맵 I/O: OS가 DB 파일을 메모리처럼 직접 접근
//   -> read() syscall 없이 포인터 역참조로 데이터 읽기
//   -> 대형 SELECT에서 I/O 레이턴시 대폭 감소
// ─────────────────────────────────────────────────────────────

export const DB_NAME    = 'myaiworld.db';
export const DB_VERSION = 6; // v4 -> v5: FTS5 추가

// ── 마이그레이션 (이전 것 그대로 유지) ──────────────────────
export const MIGRATION_V1_TO_V2: string[] = [
  'ALTER TABLE conversations ADD COLUMN importance_score INTEGER DEFAULT 5;',
  'ALTER TABLE conversations ADD COLUMN vector_id TEXT;',
  "ALTER TABLE conversations ADD COLUMN owner_ids TEXT NOT NULL DEFAULT '[]';",
  'CREATE INDEX IF NOT EXISTS idx_conv_importance ON conversations(importance_score DESC);',
  `CREATE TABLE IF NOT EXISTS character_metrics (
    character_id TEXT PRIMARY KEY, love_score REAL DEFAULT 0, trust_score REAL DEFAULT 0,
    tension_score REAL DEFAULT 0, custom_metrics TEXT,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );`,
];
export const MIGRATION_V2_TO_V3: string[] = [
  `CREATE TABLE IF NOT EXISTS vector_memories (
    id TEXT PRIMARY KEY, conversation_id INTEGER NOT NULL, text TEXT NOT NULL,
    vector TEXT NOT NULL, timestamp INTEGER NOT NULL, importance REAL NOT NULL DEFAULT 5
  );`,
  'CREATE INDEX IF NOT EXISTS idx_vec_timestamp ON vector_memories(timestamp DESC);',
  'CREATE INDEX IF NOT EXISTS idx_vec_importance ON vector_memories(importance DESC);',
];
export const MIGRATION_V3_TO_V4: string[] = [
  'ALTER TABLE conversations ADD COLUMN client_id TEXT;',
  'CREATE INDEX IF NOT EXISTS idx_conv_client_id ON conversations(client_id);',
];

// ✅ [OPT v2 NEW] v4->v5: FTS5 가상 테이블 + 트리거
export const MIGRATION_V4_TO_V5: string[] = [
  // FTS5 가상 테이블 생성
  // content=conversations: conversations 테이블을 content source로 사용 (중복 저장 없음)
  // content_rowid=id: conversations.id를 rowid로 매핑
  `CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts
   USING fts5(content, speaker_id, story_id, content='conversations', content_rowid='id');`,

  // 기존 데이터 FTS 인덱스 빌드 (마이그레이션 시 1회)
  // content= 외부 콘텐츠 테이블은 INSERT SELECT가 아닌 rebuild 명령을 사용해야 함
  `INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild');`,

  // INSERT 트리거: 새 대화가 생기면 FTS 자동 업데이트
  `CREATE TRIGGER IF NOT EXISTS conv_ai_fts
   AFTER INSERT ON conversations BEGIN
     INSERT INTO conversations_fts(rowid, content, speaker_id, story_id)
     VALUES (new.id, new.content, new.speaker_id, new.story_id);
   END;`,

  // DELETE 트리거: 대화 삭제 시 FTS에서도 제거
  `CREATE TRIGGER IF NOT EXISTS conv_ad_fts
   AFTER DELETE ON conversations BEGIN
     INSERT INTO conversations_fts(conversations_fts, rowid, content, speaker_id, story_id)
     VALUES ('delete', old.id, old.content, old.speaker_id, old.story_id);
   END;`,

  // UPDATE 트리거: 내용 변경 시 FTS 동기화
  `CREATE TRIGGER IF NOT EXISTS conv_au_fts
   AFTER UPDATE ON conversations BEGIN
     INSERT INTO conversations_fts(conversations_fts, rowid, content, speaker_id, story_id)
     VALUES ('delete', old.id, old.content, old.speaker_id, old.story_id);
     INSERT INTO conversations_fts(rowid, content, speaker_id, story_id)
     VALUES (new.id, new.content, new.speaker_id, new.story_id);
   END;`,
];

// ✅ [NEW] v5→v6: story_assets 테이블 — 이미지 URL↔로컬경로 매핑 영구 저장
export const MIGRATION_V5_TO_V6: string[] = [
  `CREATE TABLE IF NOT EXISTS story_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'image',
    remote_url TEXT NOT NULL,
    local_path TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );`,
  'CREATE INDEX IF NOT EXISTS idx_story_assets_story ON story_assets(story_id);',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_story_assets_url ON story_assets(story_id, remote_url);',
];

// ── 테이블 정의 (기존과 동일) ─────────────────────────────
export const CREATE_CHARACTER_TABLE = `
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  current_location_id TEXT, image_path TEXT, personality TEXT, base_prompt TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);`;

export const CREATE_CONVERSATION_TABLE = `
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, story_id TEXT, chapter_id TEXT,
  speaker_id TEXT NOT NULL, speaker_type TEXT NOT NULL, content TEXT NOT NULL,
  scene_id TEXT, is_important INTEGER DEFAULT 0, emotion TEXT, tags TEXT,
  owner_ids TEXT NOT NULL DEFAULT '[]', importance_score INTEGER DEFAULT 5,
  vector_id TEXT, client_id TEXT,
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (speaker_id) REFERENCES characters(id)
);`;

export const CREATE_CONVERSATION_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_conv_speaker ON conversations(speaker_id);',
  'CREATE INDEX IF NOT EXISTS idx_conv_scene ON conversations(scene_id);',
  'CREATE INDEX IF NOT EXISTS idx_conv_important ON conversations(is_important);',
  'CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON conversations(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_conv_story ON conversations(story_id, chapter_id);',
  'CREATE INDEX IF NOT EXISTS idx_conv_scene_timestamp ON conversations(scene_id, timestamp DESC);',
  'CREATE INDEX IF NOT EXISTS idx_conv_story_timestamp ON conversations(story_id, timestamp DESC);',
];

export const CREATE_GLOBAL_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS global_state (
  key TEXT PRIMARY KEY, value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);`;

export const CREATE_MEMORY_SUMMARY_TABLE = `
CREATE TABLE IF NOT EXISTS memory_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, scene_id TEXT NOT NULL,
  summary_type TEXT NOT NULL, content TEXT NOT NULL, importance_score REAL DEFAULT 0.5,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);`;

export const CREATE_MEMORY_SUMMARY_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_memory_summary_scene ON memory_summaries(scene_id, created_at DESC);',
];

export const CREATE_CHARACTER_METRICS_TABLE = `
CREATE TABLE IF NOT EXISTS character_metrics (
  character_id TEXT PRIMARY KEY, love_score INTEGER DEFAULT 0, trust_score INTEGER DEFAULT 0,
  tension_score INTEGER DEFAULT 0, custom_metrics TEXT,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (character_id) REFERENCES characters(id)
);`;

export const CREATE_SCENE_TABLE = `
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL, location_name TEXT NOT NULL,
  active_character_ids TEXT, scene_state TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);`;

export const CREATE_STORY_ASSETS_TABLE = `
CREATE TABLE IF NOT EXISTS story_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'image',
  remote_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);`;

export const CREATE_STORY_ASSETS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_story_assets_story ON story_assets(story_id);',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_story_assets_url ON story_assets(story_id, remote_url);',
];

export const CREATE_SCENE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_scenes_story ON scenes(story_id, created_at DESC);',
];

export const CREATE_VECTOR_MEMORIES_TABLE = `
CREATE TABLE IF NOT EXISTS vector_memories (
  id TEXT PRIMARY KEY, conversation_id INTEGER NOT NULL, text TEXT NOT NULL,
  vector TEXT NOT NULL, timestamp INTEGER NOT NULL, importance REAL NOT NULL DEFAULT 5
);`;

export const CREATE_VECTOR_MEMORIES_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_vec_timestamp ON vector_memories(timestamp DESC);',
  'CREATE INDEX IF NOT EXISTS idx_vec_importance ON vector_memories(importance DESC);',
];

// ── INIT_TABLES ────────────────────────────────────────────────
export const INIT_TABLES = [
  // ✅ WAL + 성능 PRAGMA (기존 유지)
  "PRAGMA journal_mode = WAL;",
  "PRAGMA synchronous = NORMAL;",
  "PRAGMA cache_size = -8000;",
  "PRAGMA temp_store = memory;",
  "PRAGMA encoding = 'UTF-8';",
  // ✅ [OPT v2 NEW] mmap_size: 메모리 맵 I/O 활성화 (128MB)
  //   OS 페이지 캐시를 통해 DB 파일을 포인터로 직접 읽기
  //   -> read() syscall 없이 I/O -> 대형 SELECT 레이턴시 감소
  "PRAGMA mmap_size = 134217728;",  // 128MB
  // 테이블
  CREATE_CHARACTER_TABLE,
  CREATE_CONVERSATION_TABLE,
  ...CREATE_CONVERSATION_INDEXES,
  CREATE_GLOBAL_STATE_TABLE,
  CREATE_MEMORY_SUMMARY_TABLE,
  ...CREATE_MEMORY_SUMMARY_INDEXES,
  CREATE_CHARACTER_METRICS_TABLE,
  CREATE_SCENE_TABLE,
  ...CREATE_SCENE_INDEXES,
  CREATE_VECTOR_MEMORIES_TABLE,
  ...CREATE_VECTOR_MEMORIES_INDEXES,
  CREATE_STORY_ASSETS_TABLE,
  ...CREATE_STORY_ASSETS_INDEXES,
  // ✅ [OPT v2 NEW] FTS5 가상 테이블 (신규 DB)
  `CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts
   USING fts5(content, speaker_id, story_id, content='conversations', content_rowid='id');`,
  // FTS 트리거 (신규 DB용 — 마이그레이션은 MIGRATION_V4_TO_V5에서)
  `CREATE TRIGGER IF NOT EXISTS conv_ai_fts
   AFTER INSERT ON conversations BEGIN
     INSERT INTO conversations_fts(rowid, content, speaker_id, story_id)
     VALUES (new.id, new.content, new.speaker_id, new.story_id);
   END;`,
  `CREATE TRIGGER IF NOT EXISTS conv_ad_fts
   AFTER DELETE ON conversations BEGIN
     INSERT INTO conversations_fts(conversations_fts, rowid, content, speaker_id, story_id)
     VALUES ('delete', old.id, old.content, old.speaker_id, old.story_id);
   END;`,
  `CREATE TRIGGER IF NOT EXISTS conv_au_fts
   AFTER UPDATE ON conversations BEGIN
     INSERT INTO conversations_fts(conversations_fts, rowid, content, speaker_id, story_id)
     VALUES ('delete', old.id, old.content, old.speaker_id, old.story_id);
     INSERT INTO conversations_fts(rowid, content, speaker_id, story_id)
     VALUES (new.id, new.content, new.speaker_id, new.story_id);
   END;`,
];

// ── FTS5 검색 헬퍼 ────────────────────────────────────────────
// Database.ts에서 사용:
//   const results = await db.queryAsync(FTS_SEARCH_SQL, [`"${keyword}"`]);
export const FTS_SEARCH_SQL = `
  SELECT c.id, c.client_id, c.content, c.speaker_id, c.story_id, c.chapter_id, c.timestamp, c.is_important,
         bm25(conversations_fts) AS rank
  FROM conversations_fts
  JOIN conversations c ON c.id = conversations_fts.rowid
  WHERE conversations_fts MATCH ?
  ORDER BY rank
  LIMIT 50
`;

// 특정 스토리 내 검색
export const FTS_SEARCH_IN_STORY_SQL = `
  SELECT c.id, c.client_id, c.content, c.speaker_id, c.story_id, c.chapter_id, c.timestamp, c.is_important,
         bm25(conversations_fts) AS rank
  FROM conversations_fts
  JOIN conversations c ON c.id = conversations_fts.rowid
  WHERE conversations_fts MATCH ?
    AND c.story_id = ?
  ORDER BY rank
  LIMIT 30
`;

// ── 타입 ──────────────────────────────────────────────────────
export interface Character {
  id: string; name: string;
  current_location_id?: string; image_path?: string;
  personality?: string; base_prompt?: string;
}
export interface Conversation {
  id?: number; story_id?: string; chapter_id?: string;
  speaker_id: string; speaker_type: string; content: string;
  scene_id?: string; is_important?: number; emotion?: string;
  tags?: string; owner_ids?: string; importance_score?: number;
  vector_id?: string; client_id?: string; timestamp?: number;
}
export interface MemorySummary {
  id?: number; scene_id: string; summary_type: string;
  content: string; importance_score?: number; created_at?: number;
}
export interface CharacterMetrics {
  character_id: string; love_score?: number; trust_score?: number;
  tension_score?: number; custom_metrics?: string; updated_at?: number;
}
export interface Scene {
  id: string; story_id: string; location_name: string;
  active_character_ids?: string; scene_state?: string; created_at?: number;
}
export interface VectorMemoryRow {
  id: string; conversation_id: number; text: string;
  vector: string; timestamp: number; importance: number;
}
export interface StoryAsset {
  id?: number;
  story_id: string;
  asset_type: string;      // 'character' | 'background'
  remote_url: string;      // 원본 서버 URL
  local_path: string;      // 로컬 file:// 경로
  created_at?: number;
}
