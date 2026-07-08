import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitOpsTool } from "@loom/tools/git-ops";
import { shellTool } from "@loom/tools/shell";

async function tempGitProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-git-ops-"));
  const init = await shellTool.execute({ projectRoot, command: "pwd" });
  expect(init.success).toBe(true);
  await Bun.spawn(["git", "init"], { cwd: projectRoot }).exited;
  await writeFile(join(projectRoot, "note.txt"), "hello loom", "utf8");
  return projectRoot;
}

describe("gitOpsTool", () => {
  test("executes an allowed read-only git command", async () => {
    const projectRoot = await tempGitProject();

    const result = await gitOpsTool.execute({
      projectRoot,
      command: "status",
      args: ["--short"],
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("note.txt");
  });

  test("rejects mutating git commands", async () => {
    const projectRoot = await tempGitProject();

    const result = await gitOpsTool.execute({
      projectRoot,
      command: "add",
      args: ["note.txt"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  test("rejects git arguments that escape the project root", async () => {
    const projectRoot = await tempGitProject();

    const result = await gitOpsTool.execute({
      projectRoot,
      command: "show",
      args: ["../outside.txt"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not permitted");
  });
});
