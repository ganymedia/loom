import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerLogCommand } from "@loom/cli/commands/log";
import { Command } from "commander";

function logProgram(storePath: string, output: string[]): Command {
  const program = new Command();
  program.exitOverride();
  registerLogCommand(program, {
    storePath,
    writeOut: (message) => output.push(message),
    now: () => 1234,
    idGenerator: () => "event-generated",
  });
  return program;
}

async function tempStorePath(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-log-command-"));
  return join(projectRoot, "prompt-store.sqlite");
}

describe("log command", () => {
  test("creates a session, records an event, and shows ordered history", async () => {
    const storePath = await tempStorePath();
    const output: string[] = [];
    const program = logProgram(storePath, output);

    await program.parseAsync([
      "node",
      "loom",
      "log",
      "session",
      "--id",
      "session-1",
      "--agent",
      "developer",
      "--project-root",
      "/tmp/project",
      "--git-branch",
      "main",
    ]);
    await program.parseAsync([
      "node",
      "loom",
      "log",
      "add",
      "--session",
      "session-1",
      "--turn",
      "0",
      "--role",
      "user",
      "--agent",
      "developer",
      "--content",
      "Build the log command",
      "--backend",
      "local",
      "--model",
      "runtime-discovered-model",
      "--prompt-tokens",
      "5",
      "--completion-tokens",
      "0",
    ]);
    await program.parseAsync([
      "node",
      "loom",
      "log",
      "show",
      "--session",
      "session-1",
    ]);

    const documents = output.map((message) => JSON.parse(message) as unknown);
    const shown = documents[2] as {
      sessionId: string;
      events: Array<{
        id: string;
        sessionId: string;
        turnIndex: number;
        role: string;
        agent: string;
        content: string;
        createdAt: number;
        backend: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
      }>;
    };

    expect(shown.sessionId).toBe("session-1");
    expect(shown.events).toEqual([
      {
        id: "event-generated",
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        agent: "developer",
        content: "Build the log command",
        createdAt: 1234,
        backend: "local",
        model: "runtime-discovered-model",
        promptTokens: 5,
        completionTokens: 0,
      },
    ]);
  });

  test("rejects invalid roles and numeric fields", async () => {
    const storePath = await tempStorePath();
    const program = logProgram(storePath, []);

    await expect(
      program.parseAsync([
        "node",
        "loom",
        "log",
        "add",
        "--session",
        "session-1",
        "--turn",
        "0",
        "--role",
        "admin",
        "--agent",
        "developer",
        "--content",
        "hello",
      ]),
    ).rejects.toThrow("--role must be one of");

    await expect(
      program.parseAsync([
        "node",
        "loom",
        "log",
        "add",
        "--session",
        "session-1",
        "--turn",
        "-1",
        "--role",
        "user",
        "--agent",
        "developer",
        "--content",
        "hello",
      ]),
    ).rejects.toThrow("--turn must be a non-negative integer");
  });
});
