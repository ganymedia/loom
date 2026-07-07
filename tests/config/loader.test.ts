import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@loom/config/loader";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-config-"));
}

describe("loadConfig", () => {
  test("creates a usable default profile when no config files exist", async () => {
    const projectRoot = await tempProject();

    const config = await loadConfig({
      projectRoot,
      env: {},
    });

    expect(config.activeProfile).toBe("default");
    expect(config.profiles.default).toEqual({});
  });

  test("ensures a profile override exists even when not configured", async () => {
    const projectRoot = await tempProject();

    const config = await loadConfig({
      projectRoot,
      profileOverride: "developer",
      env: {},
    });

    expect(config.activeProfile).toBe("developer");
    expect(config.profiles.developer).toEqual({});
  });

  test("loads project config from .loom/config.yaml", async () => {
    const projectRoot = await tempProject();
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(
      join(projectRoot, ".loom", "config.yaml"),
      [
        "activeProfile: default",
        "profiles:",
        "  default:",
        "    defaultBackend: local",
        "backends:",
        "  local:",
        "    type: openai-compatible",
        "    baseUrl: http://127.0.0.1:8000",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig({ projectRoot, env: {} });

    expect(config.profiles.default?.defaultBackend).toBe("local");
    expect(config.backends.local?.baseUrl).toBe("http://127.0.0.1:8000");
  });
});
