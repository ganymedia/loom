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
