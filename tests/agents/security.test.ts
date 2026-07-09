import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentContext } from "@loom/agents/base";
import { SecurityAgent } from "@loom/agents/security";
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
  return mkdtemp(join(tmpdir(), "loom-security-agent-"));
}

describe("SecurityAgent", () => {
  test("runs one prompt turn through discovered backend", async () => {
    const requestedUrls: string[] = [];
    const agent = new SecurityAgent({
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
            { role: "user", content: "Review this" },
          ],
        });
        return jsonResponse({
          choices: [{ message: { content: "Security review ready" } }],
          usage: { prompt_tokens: 13, completion_tokens: 7 },
        });
      },
    });

    const result = await agent.runTurn("Review this", context);

    expect(requestedUrls).toEqual([
      "http://127.0.0.1:8000/v1/models",
      "http://127.0.0.1:8000/v1/chat/completions",
    ]);
    expect(result.content).toBe("Security review ready");
    expect(result.toolCalls).toEqual([]);
    expect(result.promptTokens).toBe(13);
    expect(result.completionTokens).toBe(7);
  });

  test("executes permitted file-reader tool calls from a response envelope", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "auth.ts"), "validate(input)", "utf8");
    const agent = new SecurityAgent({
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
                  content: "Reviewed auth source",
                  toolCalls: [
                    { tool: "file-reader", args: { path: "auth.ts" } },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Review auth.ts", {
      ...context,
      projectRoot,
    });

    expect(result.content).toBe("Reviewed auth source");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.tool).toBe("file-reader");
    expect(result.toolCalls[0]?.args.projectRoot).toBe(projectRoot);
    expect(result.toolCalls[0]?.result.success).toBe(true);
    expect(result.toolCalls[0]?.result.output).toBe("validate(input)");
  });

  test("denies file-writer tool calls from a response envelope", async () => {
    const agent = new SecurityAgent({
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
                  content: "Security is read-only",
                  toolCalls: [
                    {
                      tool: "file-writer",
                      args: { path: "fix.ts", content: "patch" },
                    },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Patch vulnerability", context);

    expect(result.content).toBe("Security is read-only");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.result.success).toBe(false);
    expect(result.toolCalls[0]?.result.error).toContain(
      "not permitted for Security agent",
    );
  });

  test("denies shell tool calls from a response envelope", async () => {
    const agent = new SecurityAgent({
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
                  content: "Shell is outside Security scope",
                  toolCalls: [{ tool: "shell", args: { command: "pwd" } }],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Run shell", context);

    expect(result.content).toBe("Shell is outside Security scope");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.result.success).toBe(false);
    expect(result.toolCalls[0]?.result.error).toContain(
      "not permitted for Security agent",
    );
  });

  test("treats plain text responses as content without tool calls", async () => {
    const agent = new SecurityAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [{ message: { content: "Plain security answer" } }],
        });
      },
    });

    const result = await agent.runTurn("Answer plainly", context);

    expect(result.content).toBe("Plain security answer");
    expect(result.toolCalls).toEqual([]);
  });

  test("generates a minimal handoff summary", async () => {
    const agent = new SecurityAgent({ config });
    const summary = await agent.generateHandoffSummary({
      ...context,
      gitBranch: "main",
    });

    expect(summary.branchName).toBe("main");
    expect(summary.nextAction).toContain("security review");
  });
});
