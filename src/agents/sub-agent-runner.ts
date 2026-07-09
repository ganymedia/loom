import type {
  AgentContext,
  AgentTurnResult,
  BaseAgent,
  SubAgentSpawnRule,
} from "@loom/agents/base";
import { matchesGlob } from "@loom/tools/base";

export type SubAgentTriggerEvent =
  | { type: "session-start" }
  | { type: "file-write"; path: string }
  | { type: "milestone"; milestone: string };

export interface RunSubAgentsOptions {
  parentAgent: BaseAgent;
  agents: Record<string, BaseAgent>;
  trigger: SubAgentTriggerEvent;
  userInput: string;
  context: AgentContext;
}

export interface SubAgentRunResult {
  spawned: string[];
  turns: Array<{
    ref: string;
    result: AgentTurnResult;
  }>;
  promptTokens: number;
  completionTokens: number;
}

export class SubAgentRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubAgentRunnerError";
  }
}

export async function runSubAgents(
  options: RunSubAgentsOptions,
): Promise<SubAgentRunResult> {
  const matchingRules = options.parentAgent.subAgentRules.filter((rule) =>
    ruleMatchesTrigger(rule, options.trigger),
  );
  const turns: SubAgentRunResult["turns"] = [];

  for (const rule of matchingRules) {
    const agent = options.agents[rule.ref];
    if (agent === undefined) {
      throw new SubAgentRunnerError(
        `Sub-agent "${rule.ref}" is not registered`,
      );
    }

    const result = await agent.runTurn(
      options.userInput,
      buildSubAgentContext(options.context, rule.passContext),
    );
    turns.push({ ref: rule.ref, result });
  }

  return {
    spawned: turns.map((turn) => turn.ref),
    turns,
    promptTokens: turns.reduce(
      (total, turn) => total + turn.result.promptTokens,
      0,
    ),
    completionTokens: turns.reduce(
      (total, turn) => total + turn.result.completionTokens,
      0,
    ),
  };
}

function ruleMatchesTrigger(
  rule: SubAgentSpawnRule,
  event: SubAgentTriggerEvent,
): boolean {
  if (rule.trigger.type !== event.type) return false;

  if (event.type === "file-write") {
    const pattern = rule.trigger.fileMatch;
    if (pattern === undefined || pattern.length === 0) return false;
    return matchesGlob(pattern, event.path);
  }

  if (event.type === "milestone") {
    const condition = rule.trigger.condition;
    return condition === undefined || condition === event.milestone;
  }

  return true;
}

function buildSubAgentContext(
  context: AgentContext,
  passContext: readonly string[],
): AgentContext {
  const forwarded: AgentContext = {
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
    conversationHistory: [],
  };

  for (const key of passContext) {
    if (key === "sessionId" || key === "projectRoot") continue;
    if (key === "gitBranch") {
      if (context.gitBranch !== undefined)
        forwarded.gitBranch = context.gitBranch;
      continue;
    }
    if (key === "planState") {
      if (context.planState !== undefined)
        forwarded.planState = context.planState;
      continue;
    }
    if (key === "recallInjection") {
      if (context.recallInjection !== undefined) {
        forwarded.recallInjection = context.recallInjection;
      }
      continue;
    }
    if (key === "conversationHistory") {
      forwarded.conversationHistory = context.conversationHistory.map(
        (message) => ({
          ...message,
        }),
      );
      continue;
    }

    throw new SubAgentRunnerError(`Unsupported sub-agent context key "${key}"`);
  }

  return forwarded;
}
