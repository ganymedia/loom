import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerThemeCommand } from "@loom/cli/commands/theme";
import { loadConfig } from "@loom/config/loader";
import { Command } from "commander";

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-theme-command-"));
}

function themeProgram(projectRoot: string, output: string[]): Command {
  const program = new Command();
  program.exitOverride();
  registerThemeCommand(
    program,
    {
      activeProfile: "default",
      defaults: { theme: "loom-dark" },
      store: { topK: 3 },
      profiles: { default: {} },
      backends: {},
    },
    {
      projectRoot,
      writeOut: (message) => output.push(message),
    },
  );
  return program;
}

describe("theme command", () => {
  test("lists and previews built-in themes", async () => {
    const projectRoot = await tempProject();
    const output: string[] = [];
    const program = themeProgram(projectRoot, output);

    await program.parseAsync(["node", "loom", "theme", "list"]);
    await program.parseAsync([
      "node",
      "loom",
      "theme",
      "preview",
      "high-contrast",
    ]);

    expect(output.join("\n")).toContain("loom-dark");
    expect(output.join("\n")).toContain("High Contrast");
  });

  test("writes defaults.theme to project config", async () => {
    const projectRoot = await tempProject();
    const output: string[] = [];
    const program = themeProgram(projectRoot, output);

    await program.parseAsync(["node", "loom", "theme", "use", "high-contrast"]);

    const config = await loadConfig({ projectRoot, env: {} });
    const content = await readFile(
      join(projectRoot, ".loom", "config.yaml"),
      "utf8",
    );
    expect(config.defaults.theme).toBe("high-contrast");
    expect(content).toContain("theme: high-contrast");
    expect(output.join("")).toContain("Theme set");
  });

  test("preserves existing project config while setting theme", async () => {
    const projectRoot = await tempProject();
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(
      join(projectRoot, ".loom", "config.yaml"),
      [
        "activeProfile: default",
        "profiles:",
        "  default:",
        "    defaultBackend: local",
      ].join("\n"),
      "utf8",
    );
    const program = themeProgram(projectRoot, []);

    await program.parseAsync(["node", "loom", "theme", "use", "loom-light"]);

    const config = await loadConfig({ projectRoot, env: {} });
    expect(config.defaults.theme).toBe("loom-light");
    expect(config.profiles.default?.defaultBackend).toBe("local");
  });
});
