import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
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

  test("rejects shell reads of project config secrets", async () => {
    const projectRoot = await tempProject();
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(
      join(projectRoot, ".loom", "config.yaml"),
      "Authorization: synthetic-secret-marker\n",
      "utf8",
    );

    const result = await shellTool.execute({
      projectRoot,
      command: "cat",
      args: [".loom/config.yaml"],
    });

    expect(result.success).toBe(false);
    expect(result.output).not.toContain("synthetic-secret-marker");
    expect(result.error).toContain("not permitted");
  });

  test("rejects symlinks that escape the project root", async () => {
    const projectRoot = await tempProject();
    const outsideRoot = await tempProject();
    const outsidePath = join(outsideRoot, "outside.txt");
    await writeFile(outsidePath, "outside", "utf8");
    await symlink(outsidePath, join(projectRoot, "outside-link.txt"));

    const result = await shellTool.execute({
      projectRoot,
      command: "cat",
      args: ["outside-link.txt"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });

  test("rejects find instead of exposing its execution and mutation actions", async () => {
    const projectRoot = await tempProject();

    const result = await shellTool.execute({
      projectRoot,
      command: "find",
      args: [".", "-delete"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  test("rejects native options for allowed commands", async () => {
    const projectRoot = await tempProject();

    const result = await shellTool.execute({
      projectRoot,
      command: "ls",
      args: ["-L"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });

  test("rejects absolute paths even when they point inside the project root", async () => {
    const projectRoot = await tempProject();
    const filePath = join(projectRoot, "note.txt");
    await writeFile(filePath, "hello", "utf8");

    const result = await shellTool.execute({
      projectRoot,
      command: "cat",
      args: [filePath],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });
});
