import { describe, expect, test } from "bun:test";

async function runCli(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["bun", "src/index.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

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
    expect(result.stderr).not.toContain("loom: fatal error");
  });
});
