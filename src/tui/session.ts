import { fstatSync } from "node:fs";
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
import {
  createConfigRedactor,
  createStreamingConfigRedactor,
} from "@loom/config/redaction";
import type { LoomConfig } from "@loom/config/schema";
import {
  type HandoffDocument,
  readHandoff,
  writeHandoff,
} from "@loom/session/handoff";
import { SessionManager } from "@loom/session/manager";
import {
  type PriorSessionRecallContext,
  recallPriorSessionContext,
} from "@loom/store/recall-context";
import { fileReaderTool } from "@loom/tools/file-reader";
import {
  fileWriterTool,
  isFileWriterResultData,
} from "@loom/tools/file-writer";
import { gitOpsTool } from "@loom/tools/git-ops";
import { AgentTabStrip, StatusBar, ThemeProvider } from "@loom/tui/components";
import { SessionApp, SessionViewStore } from "@loom/tui/session-app";
import { sessionSlashCommands } from "@loom/tui/slash-commands";
import {
  type BuiltInAgentName,
  builtInAgentTabs,
  isBuiltInAgentName,
  nextAgentName,
  resolveBuiltInAgentName,
} from "@loom/tui/tab-strip";
import { render, renderToString } from "ink";
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
  recallPriorContext?: (
    query: string,
    currentSessionId: string,
  ) => Promise<PriorSessionRecallContext | undefined>;
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

function hasPipedStdin(): boolean {
  if (process.stdin.isTTY === true) return false;
  const stdinStats = fstatSync(process.stdin.fd);
  return stdinStats.isFIFO() || stdinStats.isFile() || stdinStats.isSocket();
}

async function* readStdinLines(terminal: boolean): AsyncIterable<string> {
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
  });

  try {
    for await (const line of reader) {
      yield line;
    }
  } finally {
    reader.close();
  }
}

class SessionInputQueue implements AsyncIterable<string> {
  #closed = false;
  readonly #lines: string[] = [];
  readonly #waiters: Array<(result: IteratorResult<string>) => void> = [];

  push(line: string): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter === undefined) {
      this.#lines.push(line);
    } else {
      waiter({ value: line, done: false });
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#lines.length = 0;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async (): Promise<IteratorResult<string>> => {
        const line = this.#lines.shift();
        if (line !== undefined) return { value: line, done: false };
        if (this.#closed) return { value: undefined, done: true };
        return await new Promise<IteratorResult<string>>((resolve) => {
          this.#waiters.push(resolve);
        });
      },
    };
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
  writeAssistantOutput: (displayName: string, content: string) => void,
  viewStore: SessionViewStore | undefined,
  config: LoomConfig,
): Promise<AgentTurnResult> {
  const stream =
    viewStore === undefined
      ? undefined
      : {
          redactor: createStreamingConfigRedactor(config),
          store: viewStore,
        };
  if (stream !== undefined) {
    stream.store.beginThinking(agent.displayName);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  let turn: AgentTurnResult;
  try {
    turn = await agent.runTurn(prompt, context, {
      ...(stream === undefined
        ? {}
        : {
            onToolExecution: (event) => {
              if (event.status === "started") {
                stream.store.beginToolRunning(
                  agent.displayName,
                  event.toolCount,
                );
              } else {
                stream.store.clearToolRunning();
              }
            },
            onTextDelta: (delta: string) => {
              stream.store.clearThinking();
              const safeDelta = stream.redactor.push(delta);
              if (safeDelta.length > 0) {
                stream.store.appendAssistantDelta(agent.displayName, safeDelta);
              }
            },
          }),
    });
  } catch (error) {
    stream?.store.clearAssistantDelta();
    throw error;
  }
  if (stream === undefined) {
    writeAssistantOutput(agent.displayName, turn.content);
  } else {
    const finalDelta = stream.redactor.flush();
    if (finalDelta.length > 0) {
      stream.store.appendAssistantDelta(agent.displayName, finalDelta);
    }
    stream.store.clearAssistantDelta();
    writeAssistantOutput(agent.displayName, turn.content);
  }
  const redactToolContent = createConfigRedactor(config);
  const toolResultLines = formatToolCallResults(turn);
  for (const [index, toolCall] of turn.toolCalls.entries()) {
    if (
      viewStore !== undefined &&
      toolCall.result.success &&
      isFileWriterResultData(toolCall.result.data)
    ) {
      viewStore.appendFileDiff(
        toolCall.result.data.path,
        toolCall.result.data.beforeContent === null
          ? null
          : redactToolContent(toolCall.result.data.beforeContent),
        toolCall.result.data.afterContent === null
          ? null
          : redactToolContent(toolCall.result.data.afterContent),
      );
      continue;
    }
    const toolResultLine = toolResultLines[index];
    if (toolResultLine !== undefined) {
      writeOutput(`${toolResultLine}\n`);
    }
  }

  const timestamp = Date.now();
  context.conversationHistory.push(
    { role: "user", content: prompt, timestamp },
    { role: "assistant", content: turn.content, timestamp },
  );

  return turn;
}

function formatHandoffContext(document: HandoffDocument): string {
  return [
    "Prior LOOM session handoff:",
    `Goal & status: ${document.goalStatus}`,
    `Completed work: ${document.completedWork}`,
    `Failed attempts: ${document.failedAttempts}`,
    `Branch name: ${document.branchName}`,
    `Next action: ${document.nextAction}`,
  ].join("\n");
}

async function loadHandoffContext(
  projectRoot: string,
): Promise<AgentMessage[]> {
  const handoff = await readHandoff(projectRoot);
  if (handoff === undefined) return [];

  return [
    {
      role: "system",
      content: formatHandoffContext(handoff),
      timestamp: Date.now(),
    },
  ];
}

export async function startSession(
  config: LoomConfig,
  options: StartSessionOptions = {},
): Promise<void> {
  const interactive =
    options.interactive ??
    (options.initialPrompt === undefined && process.stdin.isTTY === true);
  const usePersistentInk =
    interactive &&
    options.input === undefined &&
    options.writeOutput === undefined &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true;
  const pipedInput =
    options.initialPrompt === undefined &&
    options.input === undefined &&
    options.writeOutput === undefined &&
    hasPipedStdin()
      ? readStdinLines(false)
      : undefined;
  const sessionId = crypto.randomUUID();
  const initialAgentName = options.initialAgent ?? "developer";
  const viewStore = usePersistentInk
    ? new SessionViewStore({
        activeAgentName: initialAgentName,
        output: [],
        sessionId,
        tokenPercent: 0,
      })
    : undefined;
  const inkInput = usePersistentInk ? new SessionInputQueue() : undefined;
  const ink =
    viewStore === undefined
      ? undefined
      : render(
          createElement(SessionApp, {
            onCycleAgent: () => inkInput?.push("/tab"),
            onExit: () => inkInput?.close(),
            onSubmit: (line: string) => inkInput?.push(line),
            store: viewStore,
            themeId: config.defaults.theme,
          }),
          { alternateScreen: true, exitOnCtrlC: false, interactive: true },
        );
  const outputSink =
    options.writeOutput ?? ((message: string) => process.stdout.write(message));
  const redact = createConfigRedactor(config);
  const writeOutput = (message: string): void => {
    const safeMessage = redact(message);
    if (viewStore === undefined) {
      outputSink(safeMessage);
    } else {
      viewStore.appendOutput(safeMessage);
    }
  };
  const writeAssistantOutput = (displayName: string, content: string): void => {
    const safeContent = redact(content);
    if (viewStore === undefined) {
      outputSink(`${displayName}: ${safeContent}\n`);
    } else {
      viewStore.appendAssistantOutput(displayName, safeContent);
    }
  };
  const smoke = await runSessionSmoke(config, options);

  writeOutput("LOOM session started.\n");
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
    pipedInput !== undefined ||
    (options.interactive ??
      (options.initialPrompt === undefined && process.stdin.isTTY === true));

  if (shouldRunAgent) {
    let activeAgentName = initialAgentName;
    let agent = createBuiltInAgent(activeAgentName, config, options);
    const context = {
      sessionId,
      projectRoot: options.projectRoot ?? process.cwd(),
      conversationHistory: await loadHandoffContext(
        options.projectRoot ?? process.cwd(),
      ),
    };
    const recallPriorContext =
      options.recallPriorContext ??
      ((query: string, currentSessionId: string) =>
        recallPriorSessionContext({
          config,
          currentSessionId,
          projectRoot: context.projectRoot,
          query,
          ...(options.fetchImpl === undefined
            ? {}
            : { fetchImpl: options.fetchImpl }),
        }));
    const sessionManager = new SessionManager({
      sessionId: context.sessionId,
      contextLimit: options.contextLimit ?? DEFAULT_SESSION_CONTEXT_LIMIT,
    });
    let automaticHandoffWritten = false;
    const writeSessionStatus = (): void => {
      const tokenPercent = sessionManager.currentDecision().usageRatio;
      if (viewStore !== undefined) {
        viewStore.updateStatus(activeAgentName, tokenPercent);
        return;
      }
      writeOutput(
        `Status:\n${renderSessionStatus({
          sessionId: context.sessionId,
          tokenPercent,
          activeAgentName,
          themeId: config.defaults.theme,
        })}\n`,
      );
    };

    try {
      if (viewStore === undefined) {
        writeOutput(
          `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
        );
      }
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
          writeAssistantOutput,
          viewStore,
          config,
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

      const input =
        options.input ??
        inkInput ??
        pipedInput ??
        (interactive
          ? readStdinLines(process.stdout.isTTY === true)
          : undefined);
      if (input !== undefined) {
        writeOutput("Enter follow-up prompts. Type / for commands.\n");
        for await (const line of input) {
          const prompt = line.trim();
          if (prompt.length === 0) continue;
          if (
            prompt === sessionSlashCommands.exit ||
            prompt === sessionSlashCommands.quit
          )
            break;
          if (prompt === sessionSlashCommands.agents) {
            if (viewStore === undefined) {
              writeOutput(
                `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
              );
            }
            writeSessionStatus();
            continue;
          }
          if (prompt === sessionSlashCommands.tab) {
            activeAgentName = nextAgentName(activeAgentName);
            agent = createBuiltInAgent(activeAgentName, config, options);
            if (viewStore === undefined) {
              writeOutput(
                `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
              );
            }
            writeSessionStatus();
            continue;
          }
          const agentCommandPrefix = `${sessionSlashCommands.agent} `;
          if (prompt.startsWith(agentCommandPrefix)) {
            const requestedAgent = prompt
              .slice(agentCommandPrefix.length)
              .trim();
            const resolvedAgent = resolveBuiltInAgentName(requestedAgent);
            if (resolvedAgent === undefined) {
              writeOutput(`Unknown agent: ${requestedAgent}\n`);
              continue;
            }
            activeAgentName = resolvedAgent;
            agent = createBuiltInAgent(activeAgentName, config, options);
            if (viewStore === undefined) {
              writeOutput(
                `Agents:\n${renderAgentTabs(activeAgentName, config.defaults.theme)}\n`,
              );
            }
            writeSessionStatus();
            continue;
          }
          const recallCommandPrefix = `${sessionSlashCommands.recall} `;
          if (
            prompt === sessionSlashCommands.recall ||
            prompt.startsWith(recallCommandPrefix)
          ) {
            const query = prompt
              .slice(sessionSlashCommands.recall.length)
              .trim();
            if (query.length === 0) {
              writeOutput("Usage: /recall <query>\n");
              continue;
            }
            try {
              const recalled = await recallPriorContext(
                query,
                context.sessionId,
              );
              if (recalled === undefined) {
                writeOutput("Recall: no prior-session context found.\n");
                continue;
              }
              context.conversationHistory.push({
                role: "user",
                content: recalled.context,
                timestamp: Date.now(),
              });
              viewStore?.markPriorContextUsed();
              writeOutput(
                `Recall: using ${recalled.resultCount} prior-session result(s).\n`,
              );
            } catch {
              writeOutput(
                "Recall failed: unable to retrieve prior-session context.\n",
              );
            }
            continue;
          }
          viewStore?.appendUserPrompt(redact(prompt), activeAgentName);
          const turn = await runAgentPrompt(
            agent,
            prompt,
            context,
            writeOutput,
            writeAssistantOutput,
            viewStore,
            config,
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
              viewStore?.markHandoffWritten();
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

  if (ink !== undefined) {
    inkInput?.close();
    await ink.waitUntilRenderFlush();
    ink.unmount();
    await ink.waitUntilExit();
  }
}
