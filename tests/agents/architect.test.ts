import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArchitectAgent } from "@loom/agents/architect";
import type { AgentContext } from "@loom/agents/base";
import type { LoomConfig } from "@loom/config/schema";

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  store: { topK: 3 },
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
  return mkdtemp(join(tmpdir(), "loom-architect-agent-"));
}

describe("ArchitectAgent", () => {
  test("runs one prompt turn through discovered backend", async () => {
    const requestedUrls: string[] = [];
    const agent = new ArchitectAgent({
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
            { role: "user", content: "Design this" },
          ],
        });
        return jsonResponse({
          choices: [{ message: { content: "Plan ready" } }],
          usage: { prompt_tokens: 9, completion_tokens: 5 },
        });
      },
    });

    const result = await agent.runTurn("Design this", context);

    expect(requestedUrls).toEqual([
      "http://127.0.0.1:8000/v1/models",
      "http://127.0.0.1:8000/v1/chat/completions",
    ]);
    expect(result.content).toBe("Plan ready");
    expect(result.toolCalls).toEqual([]);
    expect(result.promptTokens).toBe(9);
    expect(result.completionTokens).toBe(5);
  });

  test("executes permitted file-reader tool calls from a response envelope", async () => {
    const projectRoot = await tempProject();
    await writeFile(
      join(projectRoot, "design.md"),
      "architecture note",
      "utf8",
    );
    const agent = new ArchitectAgent({
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
                  content: "Reviewed design input",
                  toolCalls: [
                    { tool: "file-reader", args: { path: "design.md" } },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Review design.md", {
      ...context,
      projectRoot,
    });

    expect(result.content).toBe("Reviewed design input");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.tool).toBe("file-reader");
    expect(result.toolCalls[0]?.args.projectRoot).toBe(projectRoot);
    expect(result.toolCalls[0]?.result.success).toBe(true);
    expect(result.toolCalls[0]?.result.output).toBe("architecture note");
  });

  test("denies shell tool calls from a response envelope", async () => {
    const agent = new ArchitectAgent({
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
                  content: "Shell is outside Architect scope",
                  toolCalls: [{ tool: "shell", args: { command: "ls" } }],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Inspect with shell", context);

    expect(result.content).toBe("Shell is outside Architect scope");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.result.success).toBe(false);
    expect(result.toolCalls[0]?.result.error).toContain(
      "not permitted for Architect agent",
    );
  });

  test("treats plain text responses as content without tool calls", async () => {
    const agent = new ArchitectAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [{ message: { content: "Plain design answer" } }],
        });
      },
    });

    const result = await agent.runTurn("Answer plainly", context);

    expect(result.content).toBe("Plain design answer");
    expect(result.toolCalls).toEqual([]);
  });

  test("generates a minimal handoff summary", async () => {
    const agent = new ArchitectAgent({ config });
    const summary = await agent.generateHandoffSummary({
      ...context,
      gitBranch: "main",
    });

    expect(summary.branchName).toBe("main");
    expect(summary.nextAction).toContain("architecture planning");
  });
});
