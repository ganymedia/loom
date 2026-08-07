import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function stageLatestRelease(
  releaseRoot: string,
  content: string,
  checksum?: string,
): Promise<string> {
  const downloadDir = join(releaseRoot, "latest", "download");
  const artifact = "loom-linux-x64";
  await mkdir(downloadDir, { recursive: true });
  await writeFile(join(downloadDir, artifact), content, "utf8");
  const digest = checksum ?? createHash("sha256").update(content).digest("hex");
  await writeFile(
    join(downloadDir, "SHA256SUMS"),
    `${digest}  ${artifact}\n`,
    "utf8",
  );
  return join(downloadDir, artifact);
}

describe("install.sh", () => {
  test("installs the detected platform binary from a configurable release host", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-install-"));
    const releaseRoot = join(root, "releases");
    const installDir = join(root, "bin");
    await stageLatestRelease(
      releaseRoot,
      "#!/bin/sh\nprintf 'loom test binary\\n'\n",
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
    const source = await stageLatestRelease(
      releaseRoot,
      "#!/bin/sh\nprintf 'ok\\n'\n",
    );
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

  test("rejects a binary that does not match SHA256SUMS", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-install-mismatch-"));
    const releaseRoot = join(root, "releases");
    const installDir = join(root, "bin");
    await mkdir(installDir);
    await writeFile(join(installDir, "loom"), "existing install\n", "utf8");
    await stageLatestRelease(
      releaseRoot,
      "#!/bin/sh\nprintf 'tampered\\n'\n",
      "0".repeat(64),
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
    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("checksum verification failed");
    expect(await readFile(join(installDir, "loom"), "utf8")).toBe(
      "existing install\n",
    );
  });

  test("rejects a manifest without the detected artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-install-manifest-"));
    const releaseRoot = join(root, "releases");
    const installDir = join(root, "bin");
    await stageLatestRelease(releaseRoot, "binary\n");
    await writeFile(
      join(releaseRoot, "latest", "download", "SHA256SUMS"),
      `${"0".repeat(64)}  loom-darwin-arm64\n`,
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
    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("must contain exactly one entry");
  });

  test("rejects duplicate checksum entries for the detected artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-install-duplicate-"));
    const releaseRoot = join(root, "releases");
    const installDir = join(root, "bin");
    const content = "binary\n";
    await stageLatestRelease(releaseRoot, content);
    const digest = createHash("sha256").update(content).digest("hex");
    await writeFile(
      join(releaseRoot, "latest", "download", "SHA256SUMS"),
      `${digest}  loom-linux-x64\n${digest}  loom-linux-x64\n`,
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
    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("must contain exactly one entry");
  });
});
