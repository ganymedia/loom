import type {
  AgentContext,
  AgentTurnOptions,
  AgentTurnResult,
  HandoffSummary,
} from "@loom/agents/base";
import {
  BaseAgent,
  createAgentTextDeltaProjector,
  withAgentToolExecution,
} from "@loom/agents/base";
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
import { gitOpsTool } from "@loom/tools/git-ops";

interface SecurityToolCallRequest {
  tool: string;
  args: Record<string, unknown>;
}

interface SecurityResponseEnvelope {
  content: string;
  toolCalls: SecurityToolCallRequest[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSecurityResponse(content: string): SecurityResponseEnvelope {
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
      (toolCall): SecurityToolCallRequest[] => {
        if (!isRecord(toolCall)) return [];
        if (typeof toolCall.tool !== "string" || !isRecord(toolCall.args)) {
          return [];
        }
        return [{ tool: toolCall.tool, args: toolCall.args }];
      },
    );

    return { content: parsedContent, toolCalls };
  } catch {
    return { content, toolCalls: [] };
  }
}

export interface SecurityAgentOptions {
  config: LoomConfig;
  backendOverride?: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export class SecurityAgent extends BaseAgent {
  readonly name = "security";
  readonly displayName = "Security";
  readonly systemPrompt = [
    "You are LOOM's Security agent. Review code for vulnerabilities, assume inputs are malicious, trace data flow, verify authn/authz, prevent information leakage, and report severity with relevant standards.",
    'Return exactly one JSON object shaped as {"content":"operator-facing response","toolCalls":[{"tool":"file-reader","args":{"path":"relative/path"}}]} when using a tool.',
    'Use an empty "toolCalls" array when no tool is needed.',
    'Tool names are exactly "file-reader" and "git-ops"; never emit call syntax, underscores, or invented aliases.',
  ].join(" ");
  readonly tools: ToolDefinition[] = [fileReaderTool, gitOpsTool];
  readonly subAgentRules = [];
  readonly modelPreferences: Array<{
    backend: string;
    model?: string;
    priority: number;
  }> = [];

  constructor(private readonly options: SecurityAgentOptions) {
    super();
  }

  private toolByName(toolName: string): ToolDefinition | undefined {
    return this.tools.find((tool) => tool.name === toolName);
  }

  private async executeToolCall(
    toolCall: SecurityToolCallRequest,
    context: AgentContext,
  ): Promise<{
    tool: string;
    args: Record<string, unknown>;
    result: ToolResult;
  }> {
    const policy: ToolAccessPolicy = {
      capabilities: ["file-read", "git-ops"],
      allowed: this.tools.map((tool) => tool.name),
      denied: ["file-writer", "shell", "web-search", "network-write"],
    };

    if (!isToolPermitted(toolCall.tool, policy)) {
      return {
        tool: toolCall.tool,
        args: toolCall.args,
        result: {
          success: false,
          output: "",
          error: `Tool "${toolCall.tool}" is not permitted for Security agent`,
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
    options: AgentTurnOptions = {},
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
      ...(options.onTextDelta === undefined
        ? {}
        : {
            onTextDelta: createAgentTextDeltaProjector(options.onTextDelta),
          }),
      ...(this.options.fetchImpl === undefined
        ? {}
        : { fetchImpl: this.options.fetchImpl }),
      ...(this.options.env === undefined ? {} : { env: this.options.env }),
    });

    const parsedResponse = parseSecurityResponse(response.content);
    const toolCalls = await withAgentToolExecution(
      parsedResponse.toolCalls.map((toolCall) => toolCall.tool),
      options,
      () =>
        Promise.all(
          parsedResponse.toolCalls.map((toolCall) =>
            this.executeToolCall(toolCall, context),
          ),
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
      goal: "Security agent session active",
      completedWork: "No handoff summary automation is implemented yet.",
      failedAttempts: "None recorded by the minimal Security agent.",
      branchName: context.gitBranch ?? "unknown",
      nextAction:
        "Resume security review from the latest conversation context.",
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
