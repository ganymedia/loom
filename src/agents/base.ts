import type { ResolvedBackend } from "@loom/backends/discovery";
import type { ToolDefinition, ToolResult } from "@loom/tools/base";

export type SpawnTriggerType = "session-start" | "file-write" | "milestone";

export interface SubAgentSpawnRule {
  ref: string;
  trigger: {
    type: SpawnTriggerType;
    fileMatch?: string;
    condition?: string;
  };
  passContext: string[];
}

export interface AgentContext {
  sessionId: string;
  projectRoot: string;
  gitBranch?: string;
  planState?: {
    phase: string;
    milestone: string;
    task: string;
  };
  recallInjection?: string;
  conversationHistory: AgentMessage[];
}

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface AgentTurnResult {
  content: string;
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: ToolResult;
  }>;
  subAgentsSpawned: string[];
  promptTokens: number;
  completionTokens: number;
}

export type AgentToolAction =
  | "reading-file"
  | "writing-file"
  | "running-command"
  | "checking-repository"
  | "running-tools";

export interface AgentToolExecutionEvent {
  action: AgentToolAction;
  status: "started" | "finished";
  toolCount: number;
}

export interface SubAgentLifecycleEvent {
  id: string;
  displayName: string;
  status: "started" | "succeeded" | "failed";
}

export interface AgentTurnOptions {
  onTextDelta?: (delta: string) => void;
  onToolExecution?: (event: AgentToolExecutionEvent) => void;
}

export async function withAgentToolExecution<T>(
  toolNames: readonly string[],
  options: AgentTurnOptions,
  execute: () => Promise<T>,
): Promise<T> {
  const toolCount = toolNames.length;
  if (toolCount === 0) return execute();
  const action = classifyAgentToolAction(toolNames);

  options.onToolExecution?.({ action, status: "started", toolCount });
  if (options.onToolExecution !== undefined) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  try {
    return await execute();
  } finally {
    options.onToolExecution?.({ action, status: "finished", toolCount });
  }
}

export function classifyAgentToolAction(
  toolNames: readonly string[],
): AgentToolAction {
  if (toolNames.length === 0 || new Set(toolNames).size !== 1) {
    return "running-tools";
  }
  switch (toolNames[0]) {
    case "file-reader":
      return "reading-file";
    case "file-writer":
      return "writing-file";
    case "shell":
      return "running-command";
    case "git-ops":
      return "checking-repository";
    default:
      return "running-tools";
  }
}

export function createAgentTextDeltaProjector(
  onTextDelta: (delta: string) => void,
): (delta: string) => void {
  let raw = "";
  let emittedLength = 0;
  let mode: "unknown" | "plain" | "envelope" = "unknown";

  return (delta: string): void => {
    raw += delta;
    if (mode === "unknown") {
      const firstContent = raw.trimStart()[0];
      if (firstContent === undefined) return;
      mode = firstContent === "{" ? "envelope" : "plain";
    }

    const visible = mode === "plain" ? raw : envelopeContentPrefix(raw);
    if (visible.length > emittedLength) {
      onTextDelta(visible.slice(emittedLength));
      emittedLength = visible.length;
    }
  };
}

function envelopeContentPrefix(raw: string): string {
  const match = /"content"\s*:\s*"/.exec(raw);
  if (match === null) return "";

  const start = match.index + match[0].length;
  let encoded = "";
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '"') break;
    if (character !== "\\") {
      encoded += character;
      continue;
    }

    const escaped = raw[index + 1];
    if (escaped === undefined) break;
    if (escaped === "u") {
      const unicodeEscape = raw.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(unicodeEscape)) break;
      encoded += `\\u${unicodeEscape}`;
      index += 5;
      continue;
    }
    if (!/["\\/bfnrt]/.test(escaped)) break;
    encoded += `\\${escaped}`;
    index += 1;
  }

  try {
    return JSON.parse(`"${encoded}"`) as string;
  } catch {
    return "";
  }
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly systemPrompt: string;
  abstract readonly tools: ToolDefinition[];
  abstract readonly subAgentRules: SubAgentSpawnRule[];
  abstract readonly modelPreferences: Array<{
    backend: string;
    model?: string;
    priority: number;
  }>;

  abstract runTurn(
    userInput: string,
    context: AgentContext,
    options?: AgentTurnOptions,
  ): Promise<AgentTurnResult>;

  abstract generateHandoffSummary(
    context: AgentContext,
  ): Promise<HandoffSummary>;

  protected async resolveBackend(): Promise<ResolvedBackend> {
    throw new Error(
      "resolveBackend must be implemented by concrete agent or injected service",
    );
  }
}

export interface HandoffSummary {
  goal: string;
  completedWork: string;
  failedAttempts: string;
  branchName: string;
  nextAction: string;
  agentSpecificFields?: Record<string, string>;
}
