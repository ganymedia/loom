import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runCli(
  args: string[],
  options: { cwd?: string; entrypoint?: string } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(
    ["bun", options.entrypoint ?? "src/index.ts", ...args],
    {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

describe("CLI entrypoint", () => {
  test("prints version and exits without starting a session", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("prints help and exits without fatal wrapper output", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: loom [options] [command]");
    expect(result.stdout).toContain("pipeline");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("runs a pipeline through the public entrypoint", async () => {
    const repoRoot = process.cwd();
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-entrypoint-"));
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(
      join(projectRoot, ".loom", "entry.loom"),
      `name: entrypoint-pipeline
version: "1"
stages:
  - id: result
    type: transform
    expression: runtime.message
`,
      "utf8",
    );

    const result = await runCli(
      [
        "pipeline",
        "run",
        ".loom/entry.loom",
        "--var",
        "runtime.message=hello from cli",
      ],
      { cwd: projectRoot, entrypoint: join(repoRoot, "src", "index.ts") },
    );

    const payload = JSON.parse(result.stdout) as {
      success: boolean;
      finalOutput: string;
    };
    expect(result.exitCode).toBe(0);
    expect(payload.success).toBe(true);
    expect(payload.finalOutput).toBe("hello from cli");
    expect(result.stderr).not.toContain("loom: fatal error");
  });
});
