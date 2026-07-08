import type { Database } from "bun:sqlite";

export const PROMPT_STORE_SCHEMA_VERSION = 1;

export function initializePromptStoreSchema(db: Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS loom_schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_root TEXT NOT NULL,
      git_branch TEXT,
      active_agent TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      summary TEXT,
      CHECK (ended_at IS NULL OR ended_at >= started_at)
    );

    CREATE TABLE IF NOT EXISTS prompt_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      turn_index INTEGER NOT NULL CHECK (turn_index >= 0),
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
      agent TEXT NOT NULL,
      backend TEXT,
      model TEXT,
      content TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
      completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE REFERENCES prompt_events(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL CHECK (dimensions > 0),
      vector BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_events_session_turn
      ON prompt_events (session_id, turn_index, created_at);

    CREATE INDEX IF NOT EXISTS idx_prompt_events_created_at
      ON prompt_events (created_at);

    CREATE INDEX IF NOT EXISTS idx_embeddings_event_id
      ON embeddings (event_id);
  `);

  db.query(
    "INSERT OR REPLACE INTO loom_schema_metadata (key, value) VALUES (?, ?)",
  ).run("schema_version", String(PROMPT_STORE_SCHEMA_VERSION));
}
