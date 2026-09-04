import { loadConfig } from "@loom/config/loader";
import { startSession } from "@loom/tui/session";

const config = await loadConfig();
await startSession(config, { developerRequestTimeoutMs: 250 });
