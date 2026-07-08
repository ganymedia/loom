import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellTool } from "@loom/tools/shell";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-shell-"));
}

describe("shellTool", () => {
  test("executes an allowed read-only command in the project root", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "note.txt"), "hello loom", "utf8");

    const result = await shellTool.execute({
      projectRoot,
      command: "cat",
      args: ["note.txt"],
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello loom");
  });

  test("rejects commands outside the read-only allowlist", async () => {
    const projectRoot = await tempProject();

    const result = await shellTool.execute({
      projectRoot,
      command: "curl",
      args: ["http://127.0.0.1"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  test("rejects arguments that escape the project root", async () => {
    const projectRoot = await tempProject();

    const result = await shellTool.execute({
      projectRoot,
      command: "cat",
      args: ["../outside.txt"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });
});
