import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureFirstRunConfig } from "@loom/config/first-run";
import { loadConfig } from "@loom/config/loader";

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-first-run-"));
}

describe("ensureFirstRunConfig", () => {
  test("writes ~/.loom/config.yaml from an interactive backend endpoint prompt", async () => {
    const home = await tempHome();
    const messages: string[] = [];

    const result = await ensureFirstRunConfig({
      env: { HOME: home },
      isInteractive: true,
      ask: async () => "http://127.0.0.1:8000/v1/",
      stdout: {
        write: (message: string) => {
          messages.push(message);
          return true;
        },
      },
    });

    expect(result.created).toBe(true);
    expect(result.path).toBe(join(home, ".loom", "config.yaml"));
    expect(messages.join("")).toContain("Created LOOM config");

    const written = await readFile(join(home, ".loom", "config.yaml"), "utf8");
    expect(written).toContain("activeProfile: default");
    expect(written).toContain("defaultBackend: local");
    expect(written).toContain("baseUrl: http://127.0.0.1:8000/v1");

    const config = await loadConfig({ env: { HOME: home }, projectRoot: home });
    expect(config.profiles.default?.defaultBackend).toBe("local");
    expect(config.backends.local?.baseUrl).toBe("http://127.0.0.1:8000/v1");
  });

  test("does not overwrite an existing first-run config", async () => {
    const home = await tempHome();
    const path = join(home, ".loom", "config.yaml");
    await mkdir(join(home, ".loom"), { recursive: true });
    await writeFile(path, "activeProfile: existing\n", "utf8");

    const result = await ensureFirstRunConfig({
      env: { HOME: home },
      isInteractive: true,
      ask: async () => "http://127.0.0.1:8000",
    });

    expect(result).toEqual({
      created: false,
      path,
      skippedReason: "existing-config",
    });
    expect(await readFile(path, "utf8")).toBe("activeProfile: existing\n");
  });

  test("skips prompting when a compatibility global config exists", async () => {
    const home = await tempHome();
    const xdgHome = join(home, "xdg");
    const path = join(xdgHome, "loom", "config.yaml");
    await mkdir(join(xdgHome, "loom"), { recursive: true });
    await writeFile(path, "activeProfile: xdg\n", "utf8");

    const result = await ensureFirstRunConfig({
      env: { HOME: home, XDG_CONFIG_HOME: xdgHome },
      isInteractive: true,
      ask: async () => {
        throw new Error("should not prompt");
      },
    });

    expect(result).toEqual({
      created: false,
      path,
      skippedReason: "existing-config",
    });
  });

  test("skips prompting in non-interactive mode", async () => {
    const home = await tempHome();

    const result = await ensureFirstRunConfig({
      env: { HOME: home },
      isInteractive: false,
      ask: async () => {
        throw new Error("should not prompt");
      },
    });

    expect(result).toEqual({
      created: false,
      path: join(home, ".loom", "config.yaml"),
      skippedReason: "non-interactive",
    });
  });

  test("fails loudly for invalid backend endpoints", async () => {
    const home = await tempHome();

    await expect(
      ensureFirstRunConfig({
        env: { HOME: home },
        isInteractive: true,
        ask: async () => "file:///tmp/model.sock",
      }),
    ).rejects.toThrow("backend endpoint must use http:// or https://");
  });
});
