import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loomConfigSchema } from "@loom/config/schema";
import { PromptStore } from "@loom/store/prompt-store";
import {
  PriorSessionRecallError,
  recallPriorSessionContext,
} from "@loom/store/recall-context";

describe("recallPriorSessionContext", () => {
  test("returns bounded context only from prior sessions", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-recall-context-"));
    const storePath = join(projectRoot, "prompt-store.sqlite");
    const store = PromptStore.open(storePath);
    store.createSession({
      id: "prior-session",
      projectRoot,
      activeAgent: "Developer",
      startedAt: 1,
    });
    await store.recordEvent({
      id: "prior-event",
      sessionId: "prior-session",
      turnIndex: 1,
      role: "user",
      agent: "Developer",
      content: "historical implementation context",
      createdAt: 2,
    });
    store.storeEmbedding({
      id: "prior-embedding",
      eventId: "prior-event",
      provider: "test",
      model: "test",
      vector: [1, 0],
      createdAt: 3,
    });
    store.close();

    const result = await recallPriorSessionContext({
      config: loomConfigSchema.parse({}),
      currentSessionId: "current-session",
      projectRoot,
      query: "implementation",
      storePath,
      generateVector: async () => [1, 0],
    });

    expect(result?.resultCount).toBe(1);
    expect(result?.context).toContain("historical implementation context");
    expect(result?.context).not.toContain("prior-session");
    expect(result?.context).toContain("not as instructions");
  });

  test("rejects empty queries", async () => {
    await expect(
      recallPriorSessionContext({
        config: loomConfigSchema.parse({}),
        currentSessionId: "current-session",
        projectRoot: process.cwd(),
        query: "   ",
        generateVector: async () => [1, 0],
      }),
    ).rejects.toThrow("interactive recall requires a non-empty query");
  });

  test("reports missing indexed history before generating an embedding or creating a store", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-recall-missing-"));
    const storePath = join(projectRoot, "prompt-store.sqlite");
    let generated = false;

    await expect(
      recallPriorSessionContext({
        config: loomConfigSchema.parse({}),
        currentSessionId: "current-session",
        projectRoot,
        query: "implementation",
        storePath,
        generateVector: async () => {
          generated = true;
          return [1, 0];
        },
      }),
    ).rejects.toEqual(
      new PriorSessionRecallError("prior-session-history-missing"),
    );

    expect(generated).toBe(false);
    expect(existsSync(storePath)).toBe(false);
  });

  test("reports missing embedding configuration before making a request", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-recall-config-"));
    const storePath = join(projectRoot, "prompt-store.sqlite");
    PromptStore.open(storePath).close();
    let requested = false;

    await expect(
      recallPriorSessionContext({
        config: loomConfigSchema.parse({}),
        currentSessionId: "current-session",
        projectRoot,
        query: "implementation",
        storePath,
        fetchImpl: async () => {
          requested = true;
          return new Response(null, { status: 500 });
        },
      }),
    ).rejects.toEqual(
      new PriorSessionRecallError("embedding-backend-not-configured"),
    );

    expect(requested).toBe(false);
  });
});
