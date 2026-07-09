import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerRecallCommand } from "@loom/cli/commands/recall";
import { PromptStore } from "@loom/store/prompt-store";
import { Command } from "commander";

function recallProgram(storePath: string, output: string[]): Command {
  const program = new Command();
  program.exitOverride();
  registerRecallCommand(program, {
    storePath,
    writeOut: (message) => output.push(message),
  });
  return program;
}

function seedStore(path: string): void {
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
  } finally {
    store.close();
  }
}

describe("recall command", () => {
  test("prints top cosine-similarity recall results", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-recall-command-"));
    const storePath = join(projectRoot, "prompt-store.sqlite");
    seedStore(storePath);
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

  test("fails loudly until text embedding generation is implemented", async () => {
    const program = recallProgram(":memory:", []);

    await expect(
      program.parseAsync(["node", "loom", "recall"]),
    ).rejects.toThrow("requires --vector");
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
  });
});
