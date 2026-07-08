import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { PromptStore } from "@loom/store/prompt-store";

function memoryStore(): PromptStore {
  return new PromptStore(new Database(":memory:"));
}

describe("PromptStore", () => {
  test("records a session and ordered prompt events", () => {
    const store = memoryStore();

    store.createSession({
      id: "session-1",
      projectRoot: "/tmp/project",
      activeAgent: "developer",
      gitBranch: "main",
      startedAt: 1,
    });
    store.recordEvent({
      id: "event-2",
      sessionId: "session-1",
      turnIndex: 1,
      role: "assistant",
      agent: "developer",
      content: "Answer",
      createdAt: 3,
      backend: "local",
      model: "runtime-model",
      promptTokens: 5,
      completionTokens: 7,
    });
    store.recordEvent({
      id: "event-1",
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      agent: "developer",
      content: "Question",
      createdAt: 2,
    });

    expect(store.listSessionEvents("session-1")).toEqual([
      {
        id: "event-1",
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        agent: "developer",
        content: "Question",
        createdAt: 2,
        promptTokens: 0,
        completionTokens: 0,
      },
      {
        id: "event-2",
        sessionId: "session-1",
        turnIndex: 1,
        role: "assistant",
        agent: "developer",
        content: "Answer",
        createdAt: 3,
        backend: "local",
        model: "runtime-model",
        promptTokens: 5,
        completionTokens: 7,
      },
    ]);
  });

  test("ends an existing session and fails loudly for an unknown session", () => {
    const store = memoryStore();

    store.createSession({
      id: "session-1",
      projectRoot: "/tmp/project",
      activeAgent: "developer",
      startedAt: 1,
    });

    expect(() => store.endSession("session-1", 2, "done")).not.toThrow();
    expect(() => store.endSession("missing", 2)).toThrow(
      'PromptStore session "missing" does not exist',
    );
  });

  test("stores embeddings and recalls nearest events by cosine similarity", () => {
    const store = memoryStore();

    store.createSession({
      id: "session-1",
      projectRoot: "/tmp/project",
      activeAgent: "developer",
      startedAt: 1,
    });
    for (const event of [
      { id: "event-a", content: "alpha", vector: [1, 0] },
      { id: "event-b", content: "beta", vector: [0, 1] },
      { id: "event-c", content: "gamma", vector: [0.8, 0.2] },
    ]) {
      store.recordEvent({
        id: event.id,
        sessionId: "session-1",
        turnIndex: 0,
        role: "assistant",
        agent: "developer",
        content: event.content,
        createdAt: 2,
      });
      store.storeEmbedding({
        id: `embedding-${event.id}`,
        eventId: event.id,
        provider: "local",
        model: "embedder",
        vector: event.vector,
        createdAt: 3,
      });
    }

    const results = store.recallSimilar([1, 0], { topK: 2 });

    expect(results).toHaveLength(2);
    expect(results[0]?.event.content).toBe("alpha");
    expect(results[0]?.score).toBeCloseTo(1);
    expect(results[1]?.event.content).toBe("gamma");
    expect(results[1]?.score).toBeGreaterThan(0.9);
  });

  test("rejects empty embeddings and empty recall queries", () => {
    const store = memoryStore();

    store.createSession({
      id: "session-1",
      projectRoot: "/tmp/project",
      activeAgent: "developer",
      startedAt: 1,
    });
    store.recordEvent({
      id: "event-1",
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      agent: "developer",
      content: "hello",
      createdAt: 2,
    });

    expect(() =>
      store.storeEmbedding({
        id: "embedding-1",
        eventId: "event-1",
        provider: "local",
        model: "embedder",
        vector: [],
        createdAt: 3,
      }),
    ).toThrow("PromptStore embeddings must contain at least one dimension");
    expect(() => store.recallSimilar([])).toThrow(
      "PromptStore recall query vector must not be empty",
    );
  });
});
