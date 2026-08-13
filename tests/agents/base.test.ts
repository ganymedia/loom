import { describe, expect, test } from "bun:test";
import { createAgentTextDeltaProjector } from "@loom/agents/base";

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
