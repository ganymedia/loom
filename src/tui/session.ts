import { createInterface } from "node:readline/promises";
import type { AgentMessage, AgentTurnResult } from "@loom/agents/base";
import { DeveloperAgent } from "@loom/agents/developer";
import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import { resolveBackendForRequest } from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";
import { fileReaderTool } from "@loom/tools/file-reader";
import { fileWriterTool } from "@loom/tools/file-writer";

export interface StartSessionOptions {
  backendOverride?: string;
  fetchImpl?: FetchLike;
  initialPrompt?: string;
  input?: AsyncIterable<string> | Iterable<string>;
  interactive?: boolean;
  projectRoot?: string;
  smokeFilePath?: string;
  writeOutput?: (message: string) => void;
}

export interface SessionSmokeResult {
  backend?: ResolvedBackend;
  backendError?: string;
  fileWriteOk: boolean;
  fileReadOk: boolean;
  fileError?: string;
}

export async function runSessionSmoke(
  config: LoomConfig,
  options: StartSessionOptions = {},
): Promise<SessionSmokeResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const smokeFilePath = options.smokeFilePath ?? ".loom/session-smoke.txt";
  const result: SessionSmokeResult = {
    fileWriteOk: false,
    fileReadOk: false,
  };

  try {
    result.backend = await resolveBackendForRequest(config, {
      ...(options.backendOverride === undefined
        ? {}
        : { backendOverride: options.backendOverride }),
      ...(options.fetchImpl === undefined
        ? {}
        : { fetchImpl: options.fetchImpl }),
    });
  } catch (error) {
    result.backendError =
      error instanceof Error ? error.message : String(error);
  }

  const content = `LOOM session smoke file\nbackend=${result.backend?.key ?? "unresolved"}\n`;
  const writeResult = await fileWriterTool.execute({
    projectRoot,
    path: smokeFilePath,
    content,
  });

  result.fileWriteOk = writeResult.success;
  if (!writeResult.success) {
    result.fileError = writeResult.error ?? "file write failed";
    return result;
  }

  const readResult = await fileReaderTool.execute({
    projectRoot,
    path: smokeFilePath,
  });

  result.fileReadOk = readResult.success && readResult.output === content;
  if (!result.fileReadOk) {
    result.fileError = readResult.error ?? "file read verification failed";
  }

  return result;
}

async function* readStdinLines(): AsyncIterable<string> {
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    for await (const line of reader) {
      yield line;
    }
  } finally {
    reader.close();
  }
}

function formatToolCallResults(turn: AgentTurnResult): string[] {
  return turn.toolCalls.map((toolCall, index) => {
    const status = toolCall.result.success ? "ok" : "failed";
    const detail = toolCall.result.success
      ? toolCall.result.output
      : (toolCall.result.error ?? "unknown tool error");
    return `Tool ${index + 1} (${toolCall.tool}): ${status}${detail.length > 0 ? ` — ${detail}` : ""}`;
  });
}

async function runDeveloperPrompt(
  agent: DeveloperAgent,
  prompt: string,
  context: {
    sessionId: string;
    projectRoot: string;
    conversationHistory: AgentMessage[];
  },
  writeOutput: (message: string) => void,
): Promise<void> {
  const turn = await agent.runTurn(prompt, context);
  writeOutput(`Developer: ${turn.content}\n`);
  for (const toolResultLine of formatToolCallResults(turn)) {
    writeOutput(`${toolResultLine}\n`);
  }

  const timestamp = Date.now();
  context.conversationHistory.push(
    { role: "user", content: prompt, timestamp },
    { role: "assistant", content: turn.content, timestamp },
  );
}

export async function startSession(
  config: LoomConfig,
  options: StartSessionOptions = {},
): Promise<void> {
  const writeOutput =
    options.writeOutput ?? ((message: string) => process.stdout.write(message));
  const smoke = await runSessionSmoke(config, options);

  writeOutput("LOOM TUI placeholder started.\n");
  if (smoke.backend === undefined) {
    writeOutput(
      `Backend: unavailable (${smoke.backendError ?? "unknown error"})\n`,
    );
  } else {
    writeOutput(
      `Backend: ${smoke.backend.key} using discovered model ${smoke.backend.model}\n`,
    );
  }
  writeOutput(`File write: ${smoke.fileWriteOk ? "ok" : "failed"}\n`);
  writeOutput(`File read: ${smoke.fileReadOk ? "ok" : "failed"}\n`);
  if (smoke.fileError !== undefined) {
    writeOutput(`File error: ${smoke.fileError}\n`);
  }

  const shouldRunAgent =
    (options.initialPrompt !== undefined && options.initialPrompt.length > 0) ||
    options.input !== undefined ||
    (options.interactive ??
      (options.initialPrompt === undefined && process.stdin.isTTY === true));

  if (shouldRunAgent) {
    const agent = new DeveloperAgent({
      config,
      ...(options.backendOverride === undefined
        ? {}
        : { backendOverride: options.backendOverride }),
      ...(options.fetchImpl === undefined
        ? {}
        : { fetchImpl: options.fetchImpl }),
    });
    const context = {
      sessionId: crypto.randomUUID(),
      projectRoot: options.projectRoot ?? process.cwd(),
      conversationHistory: [] as AgentMessage[],
    };

    try {
      if (
        options.initialPrompt !== undefined &&
        options.initialPrompt.length > 0
      ) {
        await runDeveloperPrompt(
          agent,
          options.initialPrompt,
          context,
          writeOutput,
        );
      }

      const interactive =
        options.interactive ??
        (options.initialPrompt === undefined && process.stdin.isTTY === true);
      const input =
        options.input ?? (interactive ? readStdinLines() : undefined);
      if (input !== undefined) {
        writeOutput("Enter follow-up prompts. Type /exit or /quit to stop.\n");
        for await (const line of input) {
          const prompt = line.trim();
          if (prompt.length === 0) continue;
          if (prompt === "/exit" || prompt === "/quit") break;
          await runDeveloperPrompt(agent, prompt, context, writeOutput);
        }
      }
    } catch (error) {
      writeOutput(
        `Developer agent error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}
