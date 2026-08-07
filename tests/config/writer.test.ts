import { describe, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readPrivateConfigFile,
  writePrivateConfigFile,
} from "@loom/config/writer";

async function tempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-config-writer-"));
}

describe("private config writer", () => {
  test("creates config with mode 0600 under a permissive umask", async () => {
    const directory = await tempDirectory();
    const path = join(directory, "config.yaml");
    const previousUmask = process.umask(0);
    try {
      await writePrivateConfigFile(path, "secret: synthetic\n", {
        exclusive: true,
      });
    } finally {
      process.umask(previousUmask);
    }

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("restricts an existing file before replacing its content", async () => {
    const directory = await tempDirectory();
    const path = join(directory, "config.yaml");
    await writeFile(path, "old\n", "utf8");
    await chmod(path, 0o644);

    await writePrivateConfigFile(path, "new\n");

    expect(await readFile(path, "utf8")).toBe("new\n");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("rejects a final-component symlink without changing its target", async () => {
    const directory = await tempDirectory();
    const outsidePath = join(directory, "outside.yaml");
    const configPath = join(directory, "config.yaml");
    await writeFile(outsidePath, "unchanged\n", "utf8");
    await chmod(outsidePath, 0o644);
    await symlink(outsidePath, configPath);

    await expect(readPrivateConfigFile(configPath)).rejects.toThrow();
    await expect(
      writePrivateConfigFile(configPath, "overwritten\n"),
    ).rejects.toThrow();
    expect(await readFile(outsidePath, "utf8")).toBe("unchanged\n");
    expect((await stat(outsidePath)).mode & 0o777).toBe(0o644);
  });
});
