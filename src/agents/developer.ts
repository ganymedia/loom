import type {
  AgentContext,
  AgentTurnResult,
  HandoffSummary,
} from "@loom/agents/base";
import { BaseAgent } from "@loom/agents/base";
import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import { resolveBackendForRequest } from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";
import { type PromptMessage, runPrompt } from "@loom/prompt/run-prompt";
import type {
  ToolAccessPolicy,
  ToolDefinition,
  ToolResult,
} from "@loom/tools/base";
import { isToolPermitted } from "@loom/tools/base";
import { fileReaderTool } from "@loom/tools/file-reader";
import { fileWriterTool } from "@loom/tools/file-writer";

interface DeveloperToolCallRequest {
  tool: string;
  args: Record<string, unknown>;
}

interface DeveloperResponseEnvelope {
  content: string;
  toolCalls: DeveloperToolCallRequest[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDeveloperResponse(content: string): DeveloperResponseEnvelope {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return { content, toolCalls: [] };
    }

    const parsedContent = parsed.content;
    const parsedToolCalls = parsed.toolCalls;
    if (typeof parsedContent !== "string" || !Array.isArray(parsedToolCalls)) {
      return { content, toolCalls: [] };
    }

    const toolCalls = parsedToolCalls.flatMap(
      (toolCall): DeveloperToolCallRequest[] => {
        if (!isRecord(toolCall)) return [];
        if (typeof toolCall.tool !== "string" || !isRecord(toolCall.args))
          return [];
        return [{ tool: toolCall.tool, args: toolCall.args }];
      },
    );

    return { content: parsedContent, toolCalls };
  } catch {
    return { content, toolCalls: [] };
  }
}

export interface DeveloperAgentOptions {
  config: LoomConfig;
  backendOverride?: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export class DeveloperAgent extends BaseAgent {
  readonly name = "developer";
  readonly displayName = "Developer";
  readonly systemPrompt =
    "You are LOOM's Developer agent. Help implement scoped code changes, prefer clear failures over silent behavior, and never expose secrets.";
  readonly tools: ToolDefinition[] = [fileReaderTool, fileWriterTool];
  readonly subAgentRules = [];
  readonly modelPreferences: Array<{
    backend: string;
    model?: string;
    priority: number;
  }> = [];

  constructor(private readonly options: DeveloperAgentOptions) {
    super();
  }

  private toolByName(toolName: string): ToolDefinition | undefined {
    return this.tools.find((tool) => tool.name === toolName);
  }

  private async executeToolCall(
    toolCall: DeveloperToolCallRequest,
    context: AgentContext,
  ): Promise<{
    tool: string;
    args: Record<string, unknown>;
    result: ToolResult;
  }> {
    const policy: ToolAccessPolicy = {
      capabilities: ["file-read", "file-write"],
      allowed: this.tools.map((tool) => tool.name),
      denied: [],
    };

    if (!isToolPermitted(toolCall.tool, policy)) {
      return {
        tool: toolCall.tool,
        args: toolCall.args,
        result: {
          success: false,
          output: "",
          error: `Tool "${toolCall.tool}" is not permitted for Developer agent`,
        },
      };
    }

    const tool = this.toolByName(toolCall.tool);
    if (tool === undefined) {
      return {
        tool: toolCall.tool,
        args: toolCall.args,
        result: {
          success: false,
          output: "",
          error: `Tool "${toolCall.tool}" is not registered`,
        },
      };
    }

    const args = {
      ...toolCall.args,
      projectRoot: context.projectRoot,
    };

    return {
      tool: toolCall.tool,
      args,
      result: await tool.execute(args),
    };
  }

  override async runTurn(
    userInput: string,
    context: AgentContext,
  ): Promise<AgentTurnResult> {
    const backend = await this.resolveBackend();
    const backendConfig = this.options.config.backends[backend.key];

    if (backendConfig === undefined) {
      throw new Error(`Resolved backend "${backend.key}" is not configured`);
    }

    const messages: PromptMessage[] = [
      { role: "system", content: this.systemPrompt },
      ...context.conversationHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: userInput },
    ];

    const response = await runPrompt({
      backend,
      backendConfig,
      messages,
      ...(this.options.fetchImpl === undefined
        ? {}
        : { fetchImpl: this.options.fetchImpl }),
      ...(this.options.env === undefined ? {} : { env: this.options.env }),
    });

    const parsedResponse = parseDeveloperResponse(response.content);
    const toolCalls = await Promise.all(
      parsedResponse.toolCalls.map((toolCall) =>
        this.executeToolCall(toolCall, context),
      ),
    );

    return {
      content: parsedResponse.content,
      toolCalls,
      subAgentsSpawned: [],
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
    };
  }

  override async generateHandoffSummary(
    context: AgentContext,
  ): Promise<HandoffSummary> {
    return {
      goal: "Developer agent session active",
      completedWork: "No handoff summary automation is implemented yet.",
      failedAttempts: "None recorded by the minimal Developer agent.",
      branchName: context.gitBranch ?? "unknown",
      nextAction:
        "Resume the Developer agent turn loop from the latest conversation context.",
    };
  }

  protected override async resolveBackend(): Promise<ResolvedBackend> {
    return resolveBackendForRequest(this.options.config, {
      ...(this.options.backendOverride === undefined
        ? {}
        : { backendOverride: this.options.backendOverride }),
      ...(this.options.fetchImpl === undefined
        ? {}
        : { fetchImpl: this.options.fetchImpl }),
    });
  }
}
