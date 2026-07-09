import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentContext } from "@loom/agents/base";
import { TesterAgent } from "@loom/agents/tester";
import type { LoomConfig } from "@loom/config/schema";

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  profiles: { default: { defaultBackend: "local" } },
  backends: {
    local: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000",
    },
  },
};

const context: AgentContext = {
  sessionId: "test-session",
  projectRoot: "/tmp/loom-test",
  conversationHistory: [{ role: "assistant", content: "Prior", timestamp: 1 }],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function tempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-tester-agent-"));
}

describe("TesterAgent", () => {
  test("runs one prompt turn through discovered backend", async () => {
    const requestedUrls: string[] = [];
    const agent = new TesterAgent({
      config,
      fetchImpl: async (input, init) => {
        requestedUrls.push(input);
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        expect(JSON.parse(String(init?.body))).toEqual({
          model: "runtime-model",
          messages: [
            { role: "system", content: agent.systemPrompt },
            { role: "assistant", content: "Prior" },
            { role: "user", content: "Test this" },
          ],
        });
        return jsonResponse({
          choices: [{ message: { content: "Test plan ready" } }],
          usage: { prompt_tokens: 11, completion_tokens: 6 },
        });
      },
    });

    const result = await agent.runTurn("Test this", context);

    expect(requestedUrls).toEqual([
      "http://127.0.0.1:8000/v1/models",
      "http://127.0.0.1:8000/v1/chat/completions",
    ]);
    expect(result.content).toBe("Test plan ready");
    expect(result.toolCalls).toEqual([]);
    expect(result.promptTokens).toBe(11);
    expect(result.completionTokens).toBe(6);
  });

  test("executes permitted file-reader tool calls from a response envelope", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "subject.test.ts"), "test note", "utf8");
    const agent = new TesterAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "Reviewed test file",
                  toolCalls: [
                    { tool: "file-reader", args: { path: "subject.test.ts" } },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Review subject.test.ts", {
      ...context,
      projectRoot,
    });

    expect(result.content).toBe("Reviewed test file");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.tool).toBe("file-reader");
    expect(result.toolCalls[0]?.args.projectRoot).toBe(projectRoot);
    expect(result.toolCalls[0]?.result.success).toBe(true);
    expect(result.toolCalls[0]?.result.output).toBe("test note");
  });

  test("executes permitted shell tool calls from a response envelope", async () => {
    const projectRoot = await tempProject();
    const agent = new TesterAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "Ran deterministic inspection",
                  toolCalls: [{ tool: "shell", args: { command: "pwd" } }],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Run a safe inspection", {
      ...context,
      projectRoot,
    });

    expect(result.content).toBe("Ran deterministic inspection");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.tool).toBe("shell");
    expect(result.toolCalls[0]?.args.projectRoot).toBe(projectRoot);
    expect(result.toolCalls[0]?.result.success).toBe(true);
    expect(result.toolCalls[0]?.result.output.trim()).toBe(projectRoot);
  });

  test("denies network-write tool calls from a response envelope", async () => {
    const agent = new TesterAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "Network write is outside Tester scope",
                  toolCalls: [{ tool: "network-write", args: {} }],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Call network", context);

    expect(result.content).toBe("Network write is outside Tester scope");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.result.success).toBe(false);
    expect(result.toolCalls[0]?.result.error).toContain(
      "not permitted for Tester agent",
    );
  });

  test("treats plain text responses as content without tool calls", async () => {
    const agent = new TesterAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [{ message: { content: "Plain test answer" } }],
        });
      },
    });

    const result = await agent.runTurn("Answer plainly", context);

    expect(result.content).toBe("Plain test answer");
    expect(result.toolCalls).toEqual([]);
  });

  test("generates a minimal handoff summary", async () => {
    const agent = new TesterAgent({ config });
    const summary = await agent.generateHandoffSummary({
      ...context,
      gitBranch: "main",
    });

    expect(summary.branchName).toBe("main");
    expect(summary.nextAction).toContain("test planning");
  });
});
