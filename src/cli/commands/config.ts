import type { LoomConfig } from "@loom/config/schema";
import type { Command } from "commander";

export function registerConfigCommand(
  program: Command,
  config: LoomConfig,
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
              baseUrl: backend.baseUrl,
              apiKeyEnv: backend.apiKeyEnv,
            },
          ]),
        ),
      };
      process.stdout.write(`${JSON.stringify(safeConfig, null, 2)}\n`);
    });
}
