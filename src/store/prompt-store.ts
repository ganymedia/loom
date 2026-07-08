import { Database } from "bun:sqlite";
import { initializePromptStoreSchema } from "@loom/store/schema";

export type PromptEventRole = "system" | "user" | "assistant" | "tool";

export interface PromptStoreSessionInput {
  id: string;
  projectRoot: string;
  activeAgent: string;
  gitBranch?: string;
  startedAt: number;
}

export interface PromptStoreEventInput {
  id: string;
  sessionId: string;
  turnIndex: number;
  role: PromptEventRole;
  agent: string;
  content: string;
  createdAt: number;
  backend?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface PromptStoreEvent {
  id: string;
  sessionId: string;
  turnIndex: number;
  role: PromptEventRole;
  agent: string;
  content: string;
  createdAt: number;
  backend?: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
}

export interface PromptStoreEmbeddingInput {
  id: string;
  eventId: string;
  provider: string;
  model: string;
  vector: readonly number[];
  createdAt: number;
}

export interface PromptStoreRecallResult {
  event: PromptStoreEvent;
  score: number;
}

interface PromptEventRow {
  id: string;
  session_id: string;
  turn_index: number;
  role: PromptEventRole;
  agent: string;
  backend: string | null;
  model: string | null;
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: number;
}

interface EmbeddingRecallRow extends PromptEventRow {
  dimensions: number;
  vector: Uint8Array;
}

export class PromptStore {
  constructor(private readonly db: Database) {
    initializePromptStoreSchema(db);
  }

  static open(path = ".loom/prompt-store.sqlite"): PromptStore {
    return new PromptStore(new Database(path));
  }

  close(): void {
    this.db.close();
  }

  createSession(input: PromptStoreSessionInput): void {
    this.db
      .query(
        "INSERT INTO sessions (id, project_root, git_branch, active_agent, started_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.projectRoot,
        input.gitBranch ?? null,
        input.activeAgent,
        input.startedAt,
      );
  }

  endSession(id: string, endedAt: number, summary?: string): void {
    const result = this.db
      .query("UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?")
      .run(endedAt, summary ?? null, id);

    if (result.changes === 0) {
      throw new Error(`PromptStore session "${id}" does not exist`);
    }
  }

  recordEvent(input: PromptStoreEventInput): void {
    this.db
      .query(
        "INSERT INTO prompt_events (id, session_id, turn_index, role, agent, backend, model, content, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.sessionId,
        input.turnIndex,
        input.role,
        input.agent,
        input.backend ?? null,
        input.model ?? null,
        input.content,
        input.promptTokens ?? 0,
        input.completionTokens ?? 0,
        input.createdAt,
      );
  }

  storeEmbedding(input: PromptStoreEmbeddingInput): void {
    if (input.vector.length === 0) {
      throw new Error(
        "PromptStore embeddings must contain at least one dimension",
      );
    }

    this.db
      .query(
        "INSERT INTO embeddings (id, event_id, provider, model, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.eventId,
        input.provider,
        input.model,
        input.vector.length,
        encodeVector(input.vector),
        input.createdAt,
      );
  }

  listSessionEvents(sessionId: string): PromptStoreEvent[] {
    return this.db
      .query<PromptEventRow, [string]>(
        "SELECT id, session_id, turn_index, role, agent, backend, model, content, prompt_tokens, completion_tokens, created_at FROM prompt_events WHERE session_id = ? ORDER BY turn_index ASC, created_at ASC",
      )
      .all(sessionId)
      .map(eventFromRow);
  }

  recallSimilar(
    queryVector: readonly number[],
    options: { topK?: number } = {},
  ): PromptStoreRecallResult[] {
    if (queryVector.length === 0) {
      throw new Error("PromptStore recall query vector must not be empty");
    }

    const topK = options.topK ?? 5;
    if (topK <= 0) return [];

    return this.db
      .query<EmbeddingRecallRow, []>(
        `SELECT
          prompt_events.id,
          prompt_events.session_id,
          prompt_events.turn_index,
          prompt_events.role,
          prompt_events.agent,
          prompt_events.backend,
          prompt_events.model,
          prompt_events.content,
          prompt_events.prompt_tokens,
          prompt_events.completion_tokens,
          prompt_events.created_at,
          embeddings.dimensions,
          embeddings.vector
        FROM embeddings
        JOIN prompt_events ON prompt_events.id = embeddings.event_id`,
      )
      .all()
      .flatMap((row): PromptStoreRecallResult[] => {
        if (row.dimensions !== queryVector.length) return [];
        const score = cosineSimilarity(queryVector, decodeVector(row.vector));
        return [{ event: eventFromRow(row), score }];
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

function eventFromRow(row: PromptEventRow): PromptStoreEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnIndex: row.turn_index,
    role: row.role,
    agent: row.agent,
    content: row.content,
    createdAt: row.created_at,
    ...(row.backend === null ? {} : { backend: row.backend }),
    ...(row.model === null ? {} : { model: row.model }),
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
  };
}

function encodeVector(vector: readonly number[]): Uint8Array {
  const buffer = new ArrayBuffer(
    vector.length * Float32Array.BYTES_PER_ELEMENT,
  );
  const view = new DataView(buffer);
  vector.forEach((value, index) => {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
  });
  return new Uint8Array(buffer);
}

function decodeVector(vector: Uint8Array): number[] {
  if (vector.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Stored embedding vector has an invalid byte length");
  }

  const view = new DataView(
    vector.buffer,
    vector.byteOffset,
    vector.byteLength,
  );
  const values: number[] = [];
  for (
    let offset = 0;
    offset < vector.byteLength;
    offset += Float32Array.BYTES_PER_ELEMENT
  ) {
    values.push(view.getFloat32(offset, true));
  }
  return values;
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length) {
    throw new Error(
      "Cannot compare embedding vectors with different dimensions",
    );
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
