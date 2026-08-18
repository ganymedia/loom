import { describe, expect, test } from "bun:test";
import {
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
      2,
      {
        onToolExecution: (event) =>
          events.push(`${event.status}:${event.toolCount}`),
      },
      async () => "complete",
    );

    expect(result).toBe("complete");
    expect(events).toEqual(["started:2", "finished:2"]);
  });

  test("does not report activity when no tools execute", async () => {
    const events: string[] = [];
    const result = await withAgentToolExecution(
      0,
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
        1,
        { onToolExecution: (event) => events.push(event.status) },
        async () => {
          throw new Error("tool failed");
        },
      ),
    ).rejects.toThrow("tool failed");
    expect(events).toEqual(["started", "finished"]);
  });

  test("rejects invalid tool counts", async () => {
    await expect(
      withAgentToolExecution(-1, {}, async () => undefined),
    ).rejects.toThrow("toolCount must be a non-negative integer");
  });
});
