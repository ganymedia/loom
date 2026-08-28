import { describe, expect, test } from "bun:test";
import {
  classifyAgentToolAction,
  createAgentTextDeltaProjector,
  withAgentToolExecution,
} from "@loom/agents/base";

describe("createAgentTextDeltaProjector", () => {
  test("forwards plain text deltas", () => {
    const deltas: string[] = [];
    const project = createAgentTextDeltaProjector((delta) =>
      deltas.push(delta),
    );

    project("Hel");
    project("lo");

    expect(deltas.join("")).toBe("Hello");
  });

  test("streams envelope content without exposing tool arguments", () => {
    const deltas: string[] = [];
    const project = createAgentTextDeltaProjector((delta) =>
      deltas.push(delta),
    );

    project('{"content":"Line 1\\n');
    project('Line 2","toolCalls":[{"tool":"file-reader",');
    project('"args":{"path":"sensitive-name.txt"}}]}');

    expect(deltas.join("")).toBe("Line 1\nLine 2");
    expect(deltas.join("")).not.toContain("file-reader");
    expect(deltas.join("")).not.toContain("sensitive-name");
  });
});

describe("withAgentToolExecution", () => {
  test("reports existing tool execution without exposing tool data", async () => {
    const events: string[] = [];
    const result = await withAgentToolExecution(
      ["file-reader", "file-writer"],
      {
        onToolExecution: (event) =>
          events.push(`${event.status}:${event.toolCount}:${event.action}`),
      },
      async () => "complete",
    );

    expect(result).toBe("complete");
    expect(events).toEqual([
      "started:2:running-tools",
      "finished:2:running-tools",
    ]);
  });

  test("does not report activity when no tools execute", async () => {
    const events: string[] = [];
    const result = await withAgentToolExecution(
      [],
      { onToolExecution: (event) => events.push(event.status) },
      async () => "complete",
    );

    expect(result).toBe("complete");
    expect(events).toEqual([]);
  });

  test("reports finish when tool execution fails", async () => {
    const events: string[] = [];
    await expect(
      withAgentToolExecution(
        ["file-writer"],
        { onToolExecution: (event) => events.push(event.status) },
        async () => {
          throw new Error("tool failed");
        },
      ),
    ).rejects.toThrow("tool failed");
    expect(events).toEqual(["started", "finished"]);
  });

  test("classifies only registered tool names into closed actions", () => {
    expect(classifyAgentToolAction(["file-reader"])).toBe("reading-file");
    expect(classifyAgentToolAction(["file-writer", "file-writer"])).toBe(
      "writing-file",
    );
    expect(classifyAgentToolAction(["shell"])).toBe("running-command");
    expect(classifyAgentToolAction(["git-ops"])).toBe("checking-repository");
    expect(classifyAgentToolAction(["unknown"])).toBe("running-tools");
    expect(classifyAgentToolAction(["file-reader", "shell"])).toBe(
      "running-tools",
    );
  });
});
