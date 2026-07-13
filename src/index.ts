#!/usr/bin/env bun
import { registerConfigCommand } from "@loom/cli/commands/config";
import { registerLogCommand } from "@loom/cli/commands/log";
import { registerPipelineCommand } from "@loom/cli/commands/pipeline";
import { registerPlanCommand } from "@loom/cli/commands/plan";
import { registerRecallCommand } from "@loom/cli/commands/recall";
import { registerThemeCommand } from "@loom/cli/commands/theme";
import { ensureFirstRunConfig } from "@loom/config/first-run";
import { loadConfig } from "@loom/config/loader";
import { Command } from "commander";

const program = new Command();

function optionValue(
  args: string[],
  names: readonly string[],
): string | undefined {
  const index = args.findIndex((arg) => names.includes(arg));
  return index >= 0 ? args[index + 1] : undefined;
}

program
  .name("loom")
  .description("AI workflow pipeline manager and intelligent terminal agent")
  .version("0.1.0")
  .option("-p, --profile <name>", "override the active config profile")
  .option("--backend <key>", "override the default backend for this invocation")
  .option("--prompt <text>", "run one Developer-agent prompt and exit");

async function main(): Promise<void> {
  program.configureOutput({
    writeErr: (message) => process.stderr.write(message),
    writeOut: (message) => process.stdout.write(message),
  });

  const args = process.argv.slice(2);
  const profileOverride = optionValue(args, ["--profile", "-p"]);
  const backendOverride = optionValue(args, ["--backend"]);
  const initialPrompt = optionValue(args, ["--prompt"]);
  const hasTerminalFlag =
    args.includes("--help") ||
    args.includes("-h") ||
    args.includes("--version") ||
    args.includes("-V");
  const startsWithSubcommand =
    args[0] !== undefined && !args[0].startsWith("-");

  if (!hasTerminalFlag && !startsWithSubcommand) {
    await ensureFirstRunConfig();
  }

  const config = await loadConfig(
    profileOverride === undefined ? {} : { profileOverride },
  );
  registerConfigCommand(program, config);
  registerLogCommand(program, { config });
  registerPipelineCommand(program, { config });
  registerPlanCommand(program);
  registerRecallCommand(program, { config });
  registerThemeCommand(program, config);

  const hasSubcommand = program.commands.some((command) =>
    args.includes(command.name()),
  );

  if (!hasSubcommand && !hasTerminalFlag) {
    const { startSession } = await import("@loom/tui/session");
    await startSession(config, {
      ...(backendOverride === undefined ? {} : { backendOverride }),
      ...(initialPrompt === undefined ? {} : { initialPrompt }),
    });
    return;
  }

  await program.parseAsync(process.argv);
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write("loom: fatal error\n");
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
