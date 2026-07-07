#!/usr/bin/env bun
import { registerConfigCommand } from "@loom/cli/commands/config";
import { loadConfig } from "@loom/config/loader";
import { Command } from "commander";

const program = new Command();

program
  .name("loom")
  .description("AI workflow pipeline manager and intelligent terminal agent")
  .version("0.1.0")
  .option("-p, --profile <name>", "override the active config profile")
  .option(
    "--backend <key>",
    "override the default backend for this invocation",
  );

async function main(): Promise<void> {
  program.exitOverride();
  program.configureOutput({
    writeErr: (message) => process.stderr.write(message),
    writeOut: (message) => process.stdout.write(message),
  });

  const args = process.argv.slice(2);
  const globalOptions = program.parseOptions(args).unknown;
  const profileIndex = globalOptions.findIndex(
    (arg) => arg === "--profile" || arg === "-p",
  );
  const profileOverride =
    profileIndex >= 0 ? globalOptions[profileIndex + 1] : undefined;
  const backendIndex = globalOptions.findIndex((arg) => arg === "--backend");
  const backendOverride =
    backendIndex >= 0 ? globalOptions[backendIndex + 1] : undefined;

  const config = await loadConfig(
    profileOverride === undefined ? {} : { profileOverride },
  );
  registerConfigCommand(program, config);

  const hasSubcommand = program.commands.some((command) =>
    args.includes(command.name()),
  );

  if (!hasSubcommand && !args.includes("--help") && !args.includes("-h")) {
    const { startSession } = await import("@loom/tui/session");
    await startSession(
      config,
      backendOverride === undefined ? {} : { backendOverride },
    );
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  process.stderr.write("loom: fatal error\n");
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
