import { describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const releaseScript = join(process.cwd(), "scripts", "release.sh");

async function run(
  command: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
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

async function writeFakeBun(root: string) {
  const binDir = join(root, "bin");
  await mkdir(binDir, { recursive: true });
  const fakeBun = join(binDir, "bun");
  await writeFile(
    fakeBun,
    `#!/bin/sh
set -eu

if [ "$1" = "-e" ]; then
  awk -F'"' '/"version"/ { print $4; exit }' package.json
  exit 0
fi

if [ "$1" = "run" ]; then
  mkdir -p dist
  case "$2" in
    build:linux:x64) printf '%s\n' 'linux x64 binary' > dist/loom-linux-x64 ;;
    build:linux:arm64) printf '%s\n' 'linux arm64 binary' > dist/loom-linux-arm64 ;;
    build:mac:x64) printf '%s\n' 'darwin x64 binary' > dist/loom-darwin-x64 ;;
    build:mac:arm64) printf '%s\n' 'darwin arm64 binary' > dist/loom-darwin-arm64 ;;
    *) printf '%s\n' "unexpected bun script: $2" >&2; exit 64 ;;
  esac
  exit 0
fi

printf '%s\n' "unexpected bun command: $*" >&2
exit 64
`,
  );
  await chmod(fakeBun, 0o755);
  return binDir;
}

describe("release build script", () => {
  test("builds installer-compatible binaries, per-platform tarballs, and checksums", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-release-"));
    try {
      const binDir = await writeFakeBun(root);
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ version: "0.0.0-test" }),
      );

      const result = await run(["sh", releaseScript], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          LOOM_RELEASE_VERSION: "0.0.0-test",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(
        "Release artifacts ready in dist/releases/",
      );

      const releaseDir = join(root, "dist", "releases");
      const files = await readdir(releaseDir);
      const artifacts = [
        "loom-linux-x64",
        "loom-linux-arm64",
        "loom-darwin-x64",
        "loom-darwin-arm64",
      ];

      for (const artifact of artifacts) {
        expect(files).toContain(artifact);
        expect(files).toContain(`${artifact}.tar.gz`);
      }
      expect(files).toContain("SHA256SUMS");

      const checksums = await readFile(join(releaseDir, "SHA256SUMS"), "utf8");
      for (const artifact of artifacts) {
        expect(checksums).toContain(artifact);
        expect(checksums).toContain(`${artifact}.tar.gz`);
      }

      const checksumResult = await run(["sha256sum", "-c", "SHA256SUMS"], {
        cwd: releaseDir,
      });
      expect(checksumResult.exitCode).toBe(0);

      const tarList = await run(["tar", "-tzf", "loom-linux-x64.tar.gz"], {
        cwd: releaseDir,
      });
      expect(tarList.exitCode).toBe(0);
      expect(tarList.stdout.trim()).toBe("loom");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reads package.json version when LOOM_RELEASE_VERSION is unset", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-release-version-"));
    try {
      const binDir = await writeFakeBun(root);
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ version: "1.2.3" }),
      );
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      };
      env.LOOM_RELEASE_VERSION = undefined;

      const result = await run(["sh", releaseScript], { cwd: root, env });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Version: 1.2.3");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails when no release version can be resolved", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-release-no-version-"));
    try {
      const binDir = await writeFakeBun(root);
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "loom" }),
      );
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      };
      env.LOOM_RELEASE_VERSION = undefined;

      const result = await run(["sh", releaseScript], { cwd: root, env });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("LOOM_RELEASE_VERSION is not set");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
