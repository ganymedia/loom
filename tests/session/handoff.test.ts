import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendNarrativeEntry,
  formatHandoff,
  formatNarrativeEntry,
  handoffPath,
  parseHandoff,
  readHandoff,
  writeHandoff,
} from "@loom/session/handoff";

const document = {
  goalStatus: "Session Continuity active",
  completedWork: "Token tracking is complete",
  failedAttempts: "None",
  branchName: "main",
  nextAction: "Implement handoff document management",
};

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-handoff-"));
}

describe("handoff document management", () => {
  test("formats and parses the five-field handoff document", () => {
    const formatted = formatHandoff(document);

    expect(formatted).toBe(
      [
        "# LOOM Session Handoff",
        "",
        "- **Goal & status** — Session Continuity active",
        "- **Completed work** — Token tracking is complete",
        "- **Failed attempts** — None",
        "- **Branch name** — main",
        "- **Next action** — Implement handoff document management",
        "",
      ].join("\n"),
    );
    expect(parseHandoff(formatted)).toEqual(document);
  });

  test("writes and reads handoff.md under the project .loom directory", async () => {
    const projectRoot = await tempProject();

    await writeHandoff(projectRoot, document);

    expect(await readHandoff(projectRoot)).toEqual(document);
    expect(await readFile(handoffPath(projectRoot), "utf8")).toBe(
      formatHandoff(document),
    );
  });

  test("returns undefined when no handoff exists", async () => {
    expect(await readHandoff(await tempProject())).toBeUndefined();
  });

  test("fails loudly for malformed handoff content", async () => {
    const projectRoot = await tempProject();
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(handoffPath(projectRoot), "# Bad\n", "utf8");

    await expect(readHandoff(projectRoot)).rejects.toThrow(
      "Handoff document is missing the LOOM handoff title",
    );
    expect(() => parseHandoff("# LOOM Session Handoff\n")).toThrow(
      'Handoff document is missing required field "Goal & status"',
    );
  });

  test("formats and appends narrative entries", async () => {
    const projectRoot = await tempProject();

    await appendNarrativeEntry(projectRoot, {
      date: "2026-07-08",
      title: "Session continuity",
      body: "Implemented handoff file helpers.",
    });
    await appendNarrativeEntry(projectRoot, {
      date: "2026-07-08",
      title: "Second entry",
      body: "Appended without replacing prior history.",
    });

    expect(
      await readFile(join(projectRoot, ".loom", "narrative.md"), "utf8"),
    ).toBe(
      [
        "",
        "## 2026-07-08 — Session continuity",
        "",
        "Implemented handoff file helpers.",
        "",
        "## 2026-07-08 — Second entry",
        "",
        "Appended without replacing prior history.",
        "",
      ].join("\n"),
    );
  });

  test("rejects empty narrative entries", () => {
    expect(() => formatNarrativeEntry({ title: "", body: "content" })).toThrow(
      "Narrative entry title must not be empty",
    );
    expect(() => formatNarrativeEntry({ title: "Title", body: "   " })).toThrow(
      "Narrative entry body must not be empty",
    );
  });
});
