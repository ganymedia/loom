import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerRecallCommand } from "@loom/cli/commands/recall";
import type { LoomConfig } from "@loom/config/schema";
import { PromptStore } from "@loom/store/prompt-store";
import { Command } from "commander";

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  store: {
    embeddingBackend: "embeddings",
    embeddingModel: "preferred-embedding-model",
    topK: 3,
  },
  profiles: { default: { defaultBackend: "chat" } },
  backends: {
    chat: { type: "openai-compatible", baseUrl: "http://127.0.0.1:8000" },
    embeddings: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8001",
    },
  },
};

function recallProgram(
  storePath: string,
  output: string[],
  options: Partial<Parameters<typeof registerRecallCommand>[1]> = {},
): Command {
  const program = new Command();
  program.exitOverride();
  registerRecallCommand(program, {
    storePath,
    writeOut: (message) => output.push(message),
    ...options,
  });
  return program;
}

async function seedStore(path: string): Promise<void> {
  const store = new PromptStore(new Database(path));
  try {
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
      await store.recordEvent({
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
  } finally {
    store.close();
  }
}

describe("recall command", () => {
  test("prints top cosine-similarity recall results", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-recall-command-"));
    const storePath = join(projectRoot, "prompt-store.sqlite");
    await seedStore(storePath);
    const output: string[] = [];
    const program = recallProgram(storePath, output);

    await program.parseAsync([
      "node",
      "loom",
      "recall",
      "--vector",
      "1,0",
      "--top-k",
      "2",
    ]);

    const parsed = JSON.parse(output.join("")) as {
      results: Array<{ event: { content: string }; score: number }>;
    };
    expect(parsed.results.map((result) => result.event.content)).toEqual([
      "alpha",
      "gamma",
    ]);
    expect(parsed.results[0]?.score).toBeCloseTo(1);
  });

  test("embeds a natural-language query for recall", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-recall-query-"));
    const storePath = join(projectRoot, "prompt-store.sqlite");
    await seedStore(storePath);
    const output: string[] = [];
    const program = recallProgram(storePath, output, {
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return new Response(
            JSON.stringify({ data: [{ id: "preferred-embedding-model" }] }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ data: [{ embedding: [1, 0] }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await program.parseAsync([
      "node",
      "loom",
      "recall",
      "--query",
      "find alpha",
      "--top-k",
      "1",
    ]);

    const parsed = JSON.parse(output.join("")) as {
      results: Array<{ event: { content: string }; score: number }>;
    };
    expect(parsed.results.map((result) => result.event.content)).toEqual([
      "alpha",
    ]);
    expect(parsed.results[0]?.score).toBeCloseTo(1);
  });

  test("fails loudly without query or vector", async () => {
    const program = recallProgram(":memory:", []);

    await expect(
      program.parseAsync(["node", "loom", "recall"]),
    ).rejects.toThrow("requires either --query or --vector");
  });

  test("rejects invalid vectors and top-k values", async () => {
    const program = recallProgram(":memory:", []);

    await expect(
      program.parseAsync(["node", "loom", "recall", "--vector", "1,nope"]),
    ).rejects.toThrow("finite numbers");

    await expect(
      program.parseAsync([
        "node",
        "loom",
        "recall",
        "--vector",
        "1,0",
        "--top-k",
        "0",
      ]),
    ).rejects.toThrow("positive integer");

    await expect(
      program.parseAsync([
        "node",
        "loom",
        "recall",
        "--query",
        "alpha",
        "--vector",
        "1,0",
      ]),
    ).rejects.toThrow("either --query or --vector, not both");
  });
});
