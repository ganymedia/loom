import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("install.sh", () => {
  test("installs the detected platform binary from a configurable release host", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-install-"));
    const releaseRoot = join(root, "releases");
    const installDir = join(root, "bin");
    await mkdir(join(releaseRoot, "latest", "download"), { recursive: true });
    await writeFile(
      join(releaseRoot, "latest", "download", "loom-linux-x64"),
      "#!/bin/sh\nprintf 'loom test binary\\n'\n",
      "utf8",
    );

    const proc = Bun.spawn(["sh", "install.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOOM_INSTALL_BASE_URL: `file://${releaseRoot}`,
        LOOM_INSTALL_DIR: installDir,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain(`LOOM installed to ${join(installDir, "loom")}`);
    expect(await readFile(join(installDir, "loom"), "utf8")).toContain(
      "loom test binary",
    );
  });

  test("installed binary is executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-install-exec-"));
    const releaseRoot = join(root, "releases");
    const installDir = join(root, "bin");
    await mkdir(join(releaseRoot, "latest", "download"), { recursive: true });
    const source = join(releaseRoot, "latest", "download", "loom-linux-x64");
    await writeFile(source, "#!/bin/sh\nprintf 'ok\\n'\n", "utf8");
    await chmod(source, 0o644);

    await Bun.spawn(["sh", "install.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOOM_INSTALL_BASE_URL: `file://${releaseRoot}`,
        LOOM_INSTALL_DIR: installDir,
      },
    }).exited;

    const proc = Bun.spawn([join(installDir, "loom")], { stdout: "pipe" });
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("ok\n");
  });
});
