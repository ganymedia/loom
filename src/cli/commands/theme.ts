import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoomConfig } from "@loom/config/schema";
import { builtinThemes, resolveTheme } from "@loom/tui/theme";
import type { Command } from "commander";
import YAML from "yaml";

export interface RegisterThemeCommandOptions {
  projectRoot?: string;
  writeOut?: (message: string) => void;
}

export function registerThemeCommand(
  program: Command,
  config: LoomConfig,
  options: RegisterThemeCommandOptions = {},
): void {
  const writeOut =
    options.writeOut ?? ((message: string) => process.stdout.write(message));

  const theme = program.command("theme").description("Manage LOOM TUI themes");

  theme
    .command("list")
    .description("List available themes")
    .action(() => {
      const activeId = config.defaults.theme;
      const lines = Object.values(builtinThemes).map((availableTheme) => {
        const marker = availableTheme.id === activeId ? "●" : " ";
        return `${marker} ${availableTheme.id.padEnd(16)} ${availableTheme.description}`;
      });
      writeOut(`${lines.join("\n")}\n\nSwitch with: loom theme use <id>\n`);
    });

  theme
    .command("use")
    .description("Set the active project theme")
    .argument("<id>", "theme id")
    .action(async (id: string) => {
      const resolved = resolveTheme(id);
      await writeProjectTheme(
        options.projectRoot ?? process.cwd(),
        resolved.id,
      );
      writeOut(
        `Theme set to "${resolved.id}". Takes effect on next loom launch.\n`,
      );
    });

  theme
    .command("preview")
    .description("Preview a theme without switching to it")
    .argument("[id]", "theme id")
    .action((id: string | undefined) => {
      const previewTheme = resolveTheme(id ?? config.defaults.theme);
      writeOut(
        `${[
          `${previewTheme.name} — ${previewTheme.description}`,
          `text: ${previewTheme.textPrimary} / ${previewTheme.textSecondary} / ${previewTheme.textTertiary}`,
          `status: success ${previewTheme.success}, warning ${previewTheme.warning}, danger ${previewTheme.danger}`,
          `accent: ${previewTheme.accent}`,
        ].join("\n")}\n`,
      );
    });
}

async function writeProjectTheme(
  projectRoot: string,
  themeId: string,
): Promise<void> {
  const loomDir = join(projectRoot, ".loom");
  const configPath = join(loomDir, "config.yaml");
  await mkdir(loomDir, { recursive: true });

  const existing = await readExistingYaml(configPath);
  const defaults =
    existing.defaults === undefined
      ? {}
      : recordValue(existing.defaults, "defaults");
  defaults.theme = themeId;
  existing.defaults = defaults;

  await writeFile(configPath, YAML.stringify(existing), "utf8");
}

async function readExistingYaml(
  configPath: string,
): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(content) ?? {};
  } catch (error) {
    throw new Error("Unable to parse project config YAML", { cause: error });
  }
  return recordValue(parsed, "config root");
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Project config ${label} must be a mapping`);
  }
  return value as Record<string, unknown>;
}
