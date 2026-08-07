import type { LoomConfig } from "@loom/config/schema";
import type { Command } from "commander";

export function registerConfigCommand(
  program: Command,
  config: LoomConfig,
  writeOut: (message: string) => void = (message) =>
    process.stdout.write(message),
): void {
  program
    .command("config")
    .description("Inspect non-secret LOOM configuration")
    .action(() => {
      const safeConfig = {
        activeProfile: config.activeProfile,
        profiles: config.profiles,
        backends: Object.fromEntries(
          Object.entries(config.backends).map(([key, backend]) => [
            key,
            {
              type: backend.type,
              endpoint: "[configured]",
              apiKeyEnv: backend.apiKeyEnv,
            },
          ]),
        ),
      };
      writeOut(`${JSON.stringify(safeConfig, null, 2)}\n`);
    });
}
