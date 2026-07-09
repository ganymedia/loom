import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { type PromptEventRole, PromptStore } from "@loom/store/prompt-store";
import type { Command } from "commander";

export interface RegisterLogCommandOptions {
  projectRoot?: string;
  writeOut?: (message: string) => void;
  storePath?: string;
  now?: () => number;
  idGenerator?: () => string;
}

interface SessionCommandOptions {
  id?: string;
  projectRoot?: string;
  agent?: string;
  gitBranch?: string;
  startedAt?: string;
}

interface AddCommandOptions {
  id?: string;
  session?: string;
  turn?: string;
  role?: string;
  agent?: string;
  content?: string;
  createdAt?: string;
  backend?: string;
  model?: string;
  promptTokens?: string;
  completionTokens?: string;
}

interface ShowCommandOptions {
  session?: string;
}

export function registerLogCommand(
  program: Command,
  options: RegisterLogCommandOptions = {},
): void {
  const writeOut =
    options.writeOut ?? ((message: string) => process.stdout.write(message));
  const now = options.now ?? Date.now;
  const idGenerator = options.idGenerator ?? randomUUID;

  const log = program
    .command("log")
    .description("Record and inspect Prompt Store history");

  log
    .command("session")
    .description("Create a Prompt Store session")
    .requiredOption("--id <id>", "session id")
    .requiredOption("--agent <agent>", "active agent name")
    .option("--project-root <path>", "session project root")
    .option("--git-branch <branch>", "git branch for the session")
    .option("--started-at <ms>", "session start timestamp in epoch ms")
    .action((commandOptions: SessionCommandOptions) => {
      const store = PromptStore.open(storePath(options));
      try {
        const session = {
          id: requiredString(commandOptions.id, "--id"),
          projectRoot:
            commandOptions.projectRoot ?? options.projectRoot ?? process.cwd(),
          activeAgent: requiredString(commandOptions.agent, "--agent"),
          ...(commandOptions.gitBranch === undefined
            ? {}
            : { gitBranch: commandOptions.gitBranch }),
          startedAt:
            commandOptions.startedAt === undefined
              ? now()
              : parseNonNegativeInteger(
                  commandOptions.startedAt,
                  "--started-at",
                ),
        };

        store.createSession(session);
        writeOut(`${JSON.stringify({ session }, null, 2)}\n`);
      } finally {
        store.close();
      }
    });

  log
    .command("add")
    .description("Record a prompt event")
    .requiredOption("--session <id>", "session id")
    .requiredOption("--turn <index>", "zero-based turn index")
    .requiredOption("--role <role>", "system, user, assistant, or tool")
    .requiredOption("--agent <agent>", "agent name")
    .requiredOption("--content <text>", "event content")
    .option("--id <id>", "event id")
    .option("--created-at <ms>", "event timestamp in epoch ms")
    .option("--backend <name>", "backend name used for the event")
    .option("--model <name>", "discovered model used for the event")
    .option("--prompt-tokens <count>", "prompt token count")
    .option("--completion-tokens <count>", "completion token count")
    .action((commandOptions: AddCommandOptions) => {
      const store = PromptStore.open(storePath(options));
      try {
        const event = {
          id: commandOptions.id ?? idGenerator(),
          sessionId: requiredString(commandOptions.session, "--session"),
          turnIndex: parseNonNegativeInteger(
            requiredString(commandOptions.turn, "--turn"),
            "--turn",
          ),
          role: parseRole(requiredString(commandOptions.role, "--role")),
          agent: requiredString(commandOptions.agent, "--agent"),
          content: requiredString(commandOptions.content, "--content"),
          createdAt:
            commandOptions.createdAt === undefined
              ? now()
              : parseNonNegativeInteger(
                  commandOptions.createdAt,
                  "--created-at",
                ),
          ...(commandOptions.backend === undefined
            ? {}
            : { backend: commandOptions.backend }),
          ...(commandOptions.model === undefined
            ? {}
            : { model: commandOptions.model }),
          ...(commandOptions.promptTokens === undefined
            ? {}
            : {
                promptTokens: parseNonNegativeInteger(
                  commandOptions.promptTokens,
                  "--prompt-tokens",
                ),
              }),
          ...(commandOptions.completionTokens === undefined
            ? {}
            : {
                completionTokens: parseNonNegativeInteger(
                  commandOptions.completionTokens,
                  "--completion-tokens",
                ),
              }),
        };

        store.recordEvent(event);
        writeOut(`${JSON.stringify({ event }, null, 2)}\n`);
      } finally {
        store.close();
      }
    });

  log
    .command("show")
    .description("Print prompt events for a session")
    .requiredOption("--session <id>", "session id")
    .action((commandOptions: ShowCommandOptions) => {
      const store = PromptStore.open(storePath(options));
      try {
        const sessionId = requiredString(commandOptions.session, "--session");
        const events = store.listSessionEvents(sessionId);
        writeOut(`${JSON.stringify({ sessionId, events }, null, 2)}\n`);
      } finally {
        store.close();
      }
    });
}

function storePath(options: RegisterLogCommandOptions): string {
  if (options.storePath !== undefined) return options.storePath;
  return join(
    options.projectRoot ?? process.cwd(),
    ".loom",
    "prompt-store.sqlite",
  );
}

function requiredString(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${flag} is required`);
  }
  return value;
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function parseRole(value: string): PromptEventRole {
  if (
    value === "system" ||
    value === "user" ||
    value === "assistant" ||
    value === "tool"
  ) {
    return value;
  }
  throw new Error("--role must be one of: system, user, assistant, tool");
}
