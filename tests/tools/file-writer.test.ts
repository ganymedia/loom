import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
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
    expect(result.data).toEqual({
      kind: "file-write",
      path: "generated.txt",
      bytes: 10,
      beforeContent: "",
      afterContent: "hello loom",
    });
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

  test("denies model-controlled narrative and handoff writes", async () => {
    const projectRoot = await tempProject();
    await mkdir(join(projectRoot, ".loom"));

    for (const path of [".loom/narrative.md", ".loom/handoff.md"]) {
      const result = await fileWriterTool.execute({
        projectRoot,
        path,
        content: "synthetic-secret-marker",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Model tools cannot access sensitive files");
    }
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
    expect(result.data).toEqual({
      kind: "file-write",
      path: "existing.txt",
      bytes: 3,
      beforeContent: "old",
      afterContent: "new",
    });
  });

  test("omits oversized content from diff metadata without blocking the write", async () => {
    const projectRoot = await tempProject();
    const content = "x".repeat(200_001);

    const result = await fileWriterTool.execute({
      projectRoot,
      path: "large.txt",
      content,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      kind: "file-write",
      path: "large.txt",
      bytes: 200_001,
      beforeContent: null,
      afterContent: null,
    });
    expect(await readFile(join(projectRoot, "large.txt"), "utf8")).toBe(
      content,
    );
  });

  test("rejects an existing symlink target outside the project root", async () => {
    const projectRoot = await tempProject();
    const outsideRoot = await tempProject();
    const outsidePath = join(outsideRoot, "outside.txt");
    await writeFile(outsidePath, "unchanged", "utf8");
    await symlink(outsidePath, join(projectRoot, "outside-link.txt"));

    const result = await fileWriterTool.execute({
      projectRoot,
      path: "outside-link.txt",
      content: "overwritten",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("must not be a symbolic link");
    expect(await readFile(outsidePath, "utf8")).toBe("unchanged");
  });
});
