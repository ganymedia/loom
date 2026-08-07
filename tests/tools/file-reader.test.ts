import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileReaderTool } from "@loom/tools/file-reader";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-reader-"));
}

describe("fileReaderTool", () => {
  test("reads a UTF-8 file inside the project root", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "note.txt"), "hello loom", "utf8");

    const result = await fileReaderTool.execute({
      projectRoot,
      path: "note.txt",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello loom");
  });

  test("denies traversal outside the project root", async () => {
    const projectRoot = await tempProject();
    const outsidePath = join(projectRoot, "..", "outside.txt");
    await writeFile(outsidePath, "secret", "utf8");

    const result = await fileReaderTool.execute({
      projectRoot,
      path: "../outside.txt",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("escapes project root");
  });

  test("denies project config containing secret values", async () => {
    const projectRoot = await tempProject();
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(
      join(projectRoot, ".loom", "config.yaml"),
      "headers:\n  Authorization: synthetic-secret-marker\n",
      "utf8",
    );

    const result = await fileReaderTool.execute({
      projectRoot,
      path: ".loom/config.yaml",
    });

    expect(result.success).toBe(false);
    expect(result.output).not.toContain("synthetic-secret-marker");
    expect(result.error).toBe("Model tools cannot access sensitive files");
  });

  test("refuses files larger than maxBytes", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "large.txt"), "abcdef", "utf8");

    const result = await fileReaderTool.execute({
      projectRoot,
      path: "large.txt",
      maxBytes: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("exceeds maxBytes");
  });
});
