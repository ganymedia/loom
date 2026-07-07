import type { LoomConfig } from "@loom/config/schema";

export interface StartSessionOptions {
  backendOverride?: string;
}

export async function startSession(
  _config: LoomConfig,
  options: StartSessionOptions = {},
): Promise<void> {
  const backendMessage =
    options.backendOverride === undefined
      ? "default backend"
      : `backend ${options.backendOverride}`;
  process.stdout.write(
    `LOOM TUI placeholder started with ${backendMessage}.\n`,
  );
}
