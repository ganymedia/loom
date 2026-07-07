import { describe, expect, test } from "bun:test";
import type { AgentContext } from "@loom/agents/base";
import { DeveloperAgent } from "@loom/agents/developer";
import type { LoomConfig } from "@loom/config/schema";

const config: LoomConfig = {
  activeProfile: "default",
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

describe("DeveloperAgent", () => {
  test("runs one prompt turn through discovered backend", async () => {
    const requestedUrls: string[] = [];
    const agent = new DeveloperAgent({
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
            { role: "user", content: "Implement this" },
          ],
        });
        return jsonResponse({
          choices: [{ message: { content: "Done" } }],
          usage: { prompt_tokens: 7, completion_tokens: 4 },
        });
      },
    });

    const result = await agent.runTurn("Implement this", context);

    expect(requestedUrls).toEqual([
      "http://127.0.0.1:8000/v1/models",
      "http://127.0.0.1:8000/v1/chat/completions",
    ]);
    expect(result.content).toBe("Done");
    expect(result.toolCalls).toEqual([]);
    expect(result.promptTokens).toBe(7);
    expect(result.completionTokens).toBe(4);
  });

  test("generates a minimal handoff summary", async () => {
    const agent = new DeveloperAgent({ config });
    const summary = await agent.generateHandoffSummary({
      ...context,
      gitBranch: "main",
    });

    expect(summary.branchName).toBe("main");
    expect(summary.nextAction).toContain("Developer agent");
  });
});
