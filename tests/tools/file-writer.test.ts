import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileWriterTool } from "@loom/tools/file-writer";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-writer-"));
}

describe("fileWriterTool", () => {
  test("writes UTF-8 content inside the project root", async () => {
    const projectRoot = await tempProject();

    const result = await fileWriterTool.execute({
      projectRoot,
      path: "generated.txt",
      content: "hello loom",
    });

    expect(result.success).toBe(true);
    expect(await readFile(join(projectRoot, "generated.txt"), "utf8")).toBe(
      "hello loom",
    );
  });

  test("denies traversal outside the project root", async () => {
    const projectRoot = await tempProject();

    const result = await fileWriterTool.execute({
      projectRoot,
      path: "../outside.txt",
      content: "secret",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("escapes project root");
  });

  test("requires the parent directory to already exist", async () => {
    const projectRoot = await tempProject();

    const result = await fileWriterTool.execute({
      projectRoot,
      path: "missing/generated.txt",
      content: "hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  test("overwrites an existing project file", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "existing.txt"), "old", "utf8");

    const result = await fileWriterTool.execute({
      projectRoot,
      path: "existing.txt",
      content: "new",
    });

    expect(result.success).toBe(true);
    expect(await readFile(join(projectRoot, "existing.txt"), "utf8")).toBe(
      "new",
    );
  });
});
