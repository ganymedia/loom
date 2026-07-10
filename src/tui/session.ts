import { createInterface } from "node:readline/promises";
import { ArchitectAgent } from "@loom/agents/architect";
import type {
  AgentMessage,
  AgentTurnResult,
  BaseAgent,
} from "@loom/agents/base";
import { DeveloperAgent } from "@loom/agents/developer";
import { SecurityAgent } from "@loom/agents/security";
import { TesterAgent } from "@loom/agents/tester";
import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import { resolveBackendForRequest } from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";
import { writeHandoff } from "@loom/session/handoff";
import { SessionManager } from "@loom/session/manager";
import { fileReaderTool } from "@loom/tools/file-reader";
import { fileWriterTool } from "@loom/tools/file-writer";
import { gitOpsTool } from "@loom/tools/git-ops";
import { AgentTabStrip, StatusBar, ThemeProvider } from "@loom/tui/components";
import {
  type BuiltInAgentName,
  builtInAgentTabs,
  isBuiltInAgentName,
  nextAgentName,
} from "@loom/tui/tab-strip";
import { renderToString } from "ink";
import { createElement } from "react";

export interface StartSessionOptions {
  initialAgent?: BuiltInAgentName;
  backendOverride?: string;
  contextLimit?: number;
  fetchImpl?: FetchLike;
  initialPrompt?: string;
  input?: AsyncIterable<string> | Iterable<string>;
  interactive?: boolean;
  projectRoot?: string;
  smokeFilePath?: string;
  writeOutput?: (message: string) => void;
}

const DEFAULT_SESSION_CONTEXT_LIMIT = 128_000;

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

function renderAgentTabs(
  activeAgentName: BuiltInAgentName,
  themeId: string | undefined,
): string {
  const activeIndex = builtInAgentTabs.findIndex(
    (tab) => tab.name === activeAgentName,
  );

  if (activeIndex === -1) {
    throw new Error(
      `Unable to render unknown active agent "${activeAgentName}"`,
    );
  }

  return renderToString(
    createElement(
      ThemeProvider,
      { themeId },
      createElement(AgentTabStrip, {
        tabs: builtInAgentTabs,
        activeIndex,
      }),
    ),
  );
}

function renderSessionStatus({
  sessionId,
  tokenPercent,
  activeAgentName,
  themeId,
}: {
  sessionId: string;
  tokenPercent: number;
  activeAgentName: BuiltInAgentName;
  themeId: string | undefined;
}): string {
  return renderToString(
    createElement(
      ThemeProvider,
      { themeId },
      createElement(StatusBar, {
        sessionId,
        tokenPercent,
        activeAgentName,
      }),
    ),
  );
}

async function resolveBranchName(projectRoot: string): Promise<string> {
  const result = await gitOpsTool.execute({
    projectRoot,
    command: "rev-parse",
    args: ["--abbrev-ref", "HEAD"],
  });
  const branchName = result.output.trim();
  return result.success && branchName.length > 0
    ? branchName
    : "unknown (git rev-parse unavailable)";
}

async function writeAutomaticHandoff({
  projectRoot,
  sessionManager,
}: {
  projectRoot: string;
  sessionManager: SessionManager;
}): Promise<boolean> {
  const decision = sessionManager.currentDecision();
  if (!decision.required) return false;

  await writeHandoff(projectRoot, {
    goalStatus: `Automatic session handoff is active; session ${decision.sessionId} reached ${Math.round(decision.usageRatio * 100)}% of the context limit.`,
    completedWork:
      "The live session loop recorded token usage and crossed the configured handoff threshold.",
    failedAttempts:
      "No failed attempts were captured by the automatic handoff writer.",
    branchName: await resolveBranchName(projectRoot),
    nextAction:
      "Resume the LOOM session from this handoff and continue with the next pending plan task.",
  });
  return true;
}

function createBuiltInAgent(
  agentName: BuiltInAgentName,
  config: LoomConfig,
  options: Pick<StartSessionOptions, "backendOverride" | "fetchImpl">,
): BaseAgent {
  const agentOptions = {
    config,
    ...(options.backendOverride === undefined
      ? {}
      : { backendOverride: options.backendOverride }),
    ...(options.fetchImpl === undefined
      ? {}
      : { fetchImpl: options.fetchImpl }),
  };

  switch (agentName) {
    case "developer":
      return new DeveloperAgent(agentOptions);
    case "architect":
      return new ArchitectAgent(agentOptions);
    case "tester":
      return new TesterAgent(agentOptions);
    case "security":
      return new SecurityAgent(agentOptions);
  }
}

async function runAgentPrompt(
  agent: BaseAgent,
  prompt: string,
  context: {
    sessionId: string;
    projectRoot: string;
    conversationHistory: AgentMessage[];
  },
  writeOutput: (message: string) => void,
): Promise<AgentTurnResult> {
  const turn = await agent.runTurn(prompt, context);
  writeOutput(`${agent.displayName}: ${turn.content}\n`);
  for (const toolResultLine of formatToolCallResults(turn)) {
    writeOutput(`${toolResultLine}\n`);
  }

  const timestamp = Date.now();
  context.conversationHistory.push(
    { role: "user", content: prompt, timestamp },
    { role: "assistant", content: turn.content, timestamp },
  );

  return turn;
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
    let activeAgentName = options.initialAgent ?? "developer";
    let agent = createBuiltInAgent(activeAgentName, config, options);
    const context = {
      sessionId: crypto.randomUUID(),
      projectRoot: options.projectRoot ?? process.cwd(),
      conversationHistory: [] as AgentMessage[],
    };
    const sessionManager = new SessionManager({
      sessionId: context.sessionId,
      contextLimit: options.contextLimit ?? DEFAULT_SESSION_CONTEXT_LIMIT,
    });
    let automaticHandoffWritten = false;
    const writeSessionStatus = (): void => {
      writeOutput(
        `Status:\n${renderSessionStatus({
          sessionId: context.sessionId,
          tokenPercent: sessionManager.currentDecision().usageRatio,
          activeAgentName,
          themeId: config.defaults.theme,
        })}\n`,
      );
    };

    try {
      writeOutput(
        `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
      );
      writeSessionStatus();
      if (
        options.initialPrompt !== undefined &&
        options.initialPrompt.length > 0
      ) {
        const turn = await runAgentPrompt(
          agent,
          options.initialPrompt,
          context,
          writeOutput,
        );
        sessionManager.recordTurn({
          promptTokens: turn.promptTokens,
          completionTokens: turn.completionTokens,
        });
        if (!automaticHandoffWritten) {
          automaticHandoffWritten = await writeAutomaticHandoff({
            projectRoot: context.projectRoot,
            sessionManager,
          });
          if (automaticHandoffWritten) {
            writeOutput("Automatic handoff written to .loom/handoff.md\n");
          }
        }
        writeSessionStatus();
      }

      const interactive =
        options.interactive ??
        (options.initialPrompt === undefined && process.stdin.isTTY === true);
      const input =
        options.input ?? (interactive ? readStdinLines() : undefined);
      if (input !== undefined) {
        writeOutput(
          "Enter follow-up prompts. Type /agent <name>, /tab, /agents, /exit, or /quit.\n",
        );
        for await (const line of input) {
          const prompt = line.trim();
          if (prompt.length === 0) continue;
          if (prompt === "/exit" || prompt === "/quit") break;
          if (prompt === "/agents") {
            writeOutput(
              `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
            );
            writeSessionStatus();
            continue;
          }
          if (prompt === "/tab") {
            activeAgentName = nextAgentName(activeAgentName);
            agent = createBuiltInAgent(activeAgentName, config, options);
            writeOutput(
              `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
            );
            writeSessionStatus();
            continue;
          }
          if (prompt.startsWith("/agent ")) {
            const requestedAgent = prompt.slice("/agent ".length).trim();
            if (!isBuiltInAgentName(requestedAgent)) {
              writeOutput(`Unknown agent: ${requestedAgent}\n`);
              continue;
            }
            activeAgentName = requestedAgent;
            agent = createBuiltInAgent(activeAgentName, config, options);
            writeOutput(
              `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
            );
            writeSessionStatus();
            continue;
          }
          const turn = await runAgentPrompt(
            agent,
            prompt,
            context,
            writeOutput,
          );
          sessionManager.recordTurn({
            promptTokens: turn.promptTokens,
            completionTokens: turn.completionTokens,
          });
          if (!automaticHandoffWritten) {
            automaticHandoffWritten = await writeAutomaticHandoff({
              projectRoot: context.projectRoot,
              sessionManager,
            });
            if (automaticHandoffWritten) {
              writeOutput("Automatic handoff written to .loom/handoff.md\n");
            }
          }
          writeSessionStatus();
        }
      }
    } catch (error) {
      writeOutput(
        `${agent.displayName} agent error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}
