import { describe, expect, test } from "bun:test";
import type {
  AgentContext,
  AgentTurnResult,
  HandoffSummary,
  SubAgentSpawnRule,
} from "@loom/agents/base";
import { BaseAgent } from "@loom/agents/base";
import {
  SubAgentRunnerError,
  runSubAgents,
} from "@loom/agents/sub-agent-runner";
import type { ToolDefinition } from "@loom/tools/base";

class StubAgent extends BaseAgent {
  readonly displayName: string;
  readonly systemPrompt = "stub";
  readonly tools: ToolDefinition[] = [];
  readonly modelPreferences = [];
  readonly contexts: AgentContext[] = [];

  constructor(
    readonly name: string,
    readonly subAgentRules: SubAgentSpawnRule[] = [],
  ) {
    super();
    this.displayName = name;
  }

  override async runTurn(
    _userInput: string,
    context: AgentContext,
  ): Promise<AgentTurnResult> {
    this.contexts.push(context);
    return {
      content: `${this.name} complete`,
      toolCalls: [],
      subAgentsSpawned: [],
      promptTokens: 2,
      completionTokens: 3,
    };
  }

  override async generateHandoffSummary(
    context: AgentContext,
  ): Promise<HandoffSummary> {
    return {
      goal: `${this.name} active`,
      completedWork: "none",
      failedAttempts: "none",
      branchName: context.gitBranch ?? "unknown",
      nextAction: "continue",
    };
  }
}

const baseContext: AgentContext = {
  sessionId: "session-1",
  projectRoot: "/project",
  gitBranch: "main",
  planState: { phase: "phase-4", milestone: "milestone-4-2", task: "task" },
  recallInjection: "remember this",
  conversationHistory: [
    { role: "user", content: "hello", timestamp: 1 },
    { role: "assistant", content: "hi", timestamp: 2 },
  ],
};

describe("runSubAgents", () => {
  test("spawns matching session-start sub-agents with requested context", async () => {
    const parent = new StubAgent("parent", [
      {
        ref: "tester",
        trigger: { type: "session-start" },
        passContext: ["gitBranch", "planState"],
      },
    ]);
    const tester = new StubAgent("tester");

    const result = await runSubAgents({
      parentAgent: parent,
      agents: { tester },
      trigger: { type: "session-start" },
      userInput: "start",
      context: baseContext,
    });

    expect(result.spawned).toEqual(["tester"]);
    expect(result.promptTokens).toBe(2);
    expect(result.completionTokens).toBe(3);
    expect(tester.contexts[0]).toEqual({
      sessionId: "session-1",
      projectRoot: "/project",
      gitBranch: "main",
      planState: { phase: "phase-4", milestone: "milestone-4-2", task: "task" },
      conversationHistory: [],
    });
  });

  test("matches file-write triggers with glob rules", async () => {
    const parent = new StubAgent("parent", [
      {
        ref: "security",
        trigger: { type: "file-write", fileMatch: "src/**/*.ts" },
        passContext: ["conversationHistory"],
      },
    ]);
    const security = new StubAgent("security");

    const result = await runSubAgents({
      parentAgent: parent,
      agents: { security },
      trigger: { type: "file-write", path: "src/agents/base.ts" },
      userInput: "file changed",
      context: baseContext,
    });

    expect(result.spawned).toEqual(["security"]);
    expect(security.contexts[0]?.conversationHistory).toEqual(
      baseContext.conversationHistory,
    );
  });

  test("does not spawn when trigger conditions do not match", async () => {
    const parent = new StubAgent("parent", [
      {
        ref: "tester",
        trigger: { type: "milestone", condition: "milestone-4-1" },
        passContext: [],
      },
    ]);
    const tester = new StubAgent("tester");

    const result = await runSubAgents({
      parentAgent: parent,
      agents: { tester },
      trigger: { type: "milestone", milestone: "milestone-4-2" },
      userInput: "advance",
      context: baseContext,
    });

    expect(result.spawned).toEqual([]);
    expect(tester.contexts).toEqual([]);
  });

  test("fails loudly for unregistered sub-agents", async () => {
    const parent = new StubAgent("parent", [
      {
        ref: "missing",
        trigger: { type: "session-start" },
        passContext: [],
      },
    ]);

    await expect(
      runSubAgents({
        parentAgent: parent,
        agents: {},
        trigger: { type: "session-start" },
        userInput: "start",
        context: baseContext,
      }),
    ).rejects.toThrow(SubAgentRunnerError);
  });

  test("fails loudly for unsupported context keys", async () => {
    const parent = new StubAgent("parent", [
      {
        ref: "tester",
        trigger: { type: "session-start" },
        passContext: ["secrets"],
      },
    ]);

    await expect(
      runSubAgents({
        parentAgent: parent,
        agents: { tester: new StubAgent("tester") },
        trigger: { type: "session-start" },
        userInput: "start",
        context: baseContext,
      }),
    ).rejects.toThrow("Unsupported sub-agent context key");
  });
});
