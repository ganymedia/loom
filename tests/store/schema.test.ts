import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  PROMPT_STORE_SCHEMA_VERSION,
  initializePromptStoreSchema,
} from "@loom/store/schema";

function memoryDb(): Database {
  return new Database(":memory:");
}

function tableNames(db: Database): string[] {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
}

describe("initializePromptStoreSchema", () => {
  test("creates prompt store tables and records schema version", () => {
    const db = memoryDb();

    initializePromptStoreSchema(db);

    expect(tableNames(db)).toEqual([
      "embeddings",
      "loom_schema_metadata",
      "prompt_events",
      "sessions",
    ]);
    expect(
      db
        .query<{ value: string }, [string]>(
          "SELECT value FROM loom_schema_metadata WHERE key = ?",
        )
        .get("schema_version")?.value,
    ).toBe(String(PROMPT_STORE_SCHEMA_VERSION));
  });

  test("enforces token, role, embedding dimension, and session time checks", () => {
    const db = memoryDb();
    initializePromptStoreSchema(db);

    expect(() =>
      db
        .query(
          "INSERT INTO sessions (id, project_root, active_agent, started_at, ended_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("bad-session", "/tmp/project", "developer", 20, 10),
    ).toThrow();

    db.query(
      "INSERT INTO sessions (id, project_root, active_agent, started_at) VALUES (?, ?, ?, ?)",
    ).run("session-1", "/tmp/project", "developer", 1);

    expect(() =>
      db
        .query(
          "INSERT INTO prompt_events (id, session_id, turn_index, role, agent, content, prompt_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("event-bad-role", "session-1", 0, "admin", "developer", "x", 0, 1),
    ).toThrow();

    expect(() =>
      db
        .query(
          "INSERT INTO prompt_events (id, session_id, turn_index, role, agent, content, prompt_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "event-bad-tokens",
          "session-1",
          0,
          "user",
          "developer",
          "x",
          -1,
          1,
        ),
    ).toThrow();

    db.query(
      "INSERT INTO prompt_events (id, session_id, turn_index, role, agent, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("event-1", "session-1", 0, "user", "developer", "hello", 2);

    expect(() =>
      db
        .query(
          "INSERT INTO embeddings (id, event_id, provider, model, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "embedding-bad",
          "event-1",
          "local",
          "embedder",
          0,
          new Uint8Array([1]),
          3,
        ),
    ).toThrow();
  });

  test("cascades prompt events and embeddings when a session is deleted", () => {
    const db = memoryDb();
    initializePromptStoreSchema(db);

    db.query(
      "INSERT INTO sessions (id, project_root, active_agent, started_at) VALUES (?, ?, ?, ?)",
    ).run("session-1", "/tmp/project", "developer", 1);
    db.query(
      "INSERT INTO prompt_events (id, session_id, turn_index, role, agent, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("event-1", "session-1", 0, "user", "developer", "hello", 2);
    db.query(
      "INSERT INTO embeddings (id, event_id, provider, model, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "embedding-1",
      "event-1",
      "local",
      "embedder",
      1,
      new Uint8Array([1]),
      3,
    );

    db.query("DELETE FROM sessions WHERE id = ?").run("session-1");

    expect(
      db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM prompt_events",
        )
        .get()?.count,
    ).toBe(0);
    expect(
      db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM embeddings",
        )
        .get()?.count,
    ).toBe(0);
  });
});
