import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentContext } from "@loom/agents/base";
import { DeveloperAgent } from "@loom/agents/developer";
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
  return mkdtemp(join(tmpdir(), "loom-developer-agent-"));
}

describe("DeveloperAgent", () => {
  test("exposes the embedded Developer file-write SAST rule", () => {
    const agent = new DeveloperAgent({ config });
    expect(agent.subAgentRules).toEqual([
      {
        ref: "loom-sast-scanner",
        trigger: {
          type: "file-write",
          fileMatch: "*.{c,cc,cpp,cs,go,java,js,jsx,php,py,rb,rs,swift,ts,tsx}",
        },
        passContext: [],
      },
    ]);
  });

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

    expect(agent.systemPrompt).toContain('"tool":"file-writer"');
    expect(agent.systemPrompt).toContain("never emit call syntax");
    expect(requestedUrls).toEqual([
      "http://127.0.0.1:8000/v1/models",
      "http://127.0.0.1:8000/v1/chat/completions",
    ]);
    expect(result.content).toBe("Done");
    expect(result.toolCalls).toEqual([]);
    expect(result.promptTokens).toBe(7);
    expect(result.completionTokens).toBe(4);
  });

  test("executes permitted file-reader tool calls from a response envelope", async () => {
    const projectRoot = await tempProject();
    const toolEvents: string[] = [];
    await writeFile(join(projectRoot, "note.txt"), "hello loom", "utf8");
    const agent = new DeveloperAgent({
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
                  content: "Read requested file",
                  toolCalls: [
                    { tool: "file-reader", args: { path: "note.txt" } },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn(
      "Read note.txt",
      {
        ...context,
        projectRoot,
      },
      {
        onToolExecution: (event) =>
          toolEvents.push(`${event.status}:${event.toolCount}:${event.action}`),
      },
    );

    expect(result.content).toBe("Read requested file");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.tool).toBe("file-reader");
    expect(result.toolCalls[0]?.args.projectRoot).toBe(projectRoot);
    expect(result.toolCalls[0]?.result.success).toBe(true);
    expect(result.toolCalls[0]?.result.output).toBe("hello loom");
    expect(toolEvents).toEqual([
      "started:1:reading-file",
      "finished:1:reading-file",
    ]);
  });

  test("streams projected envelope content while preserving the completed result", async () => {
    const deltas: string[] = [];
    const agent = new DeveloperAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: '{"content":"Hel' } }] })}`,
            "",
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo","toolCalls":[]}' } }] })}`,
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
        );
      },
    });

    const result = await agent.runTurn("Stream this", context, {
      onTextDelta: (delta) => deltas.push(delta),
    });

    expect(deltas.join("")).toBe("Hello");
    expect(result.content).toBe("Hello");
    expect(result.toolCalls).toEqual([]);
  });

  test("rejects unknown tool calls without executing them", async () => {
    const agent = new DeveloperAgent({
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
                  content: "Trying unknown tool",
                  toolCalls: [{ tool: "network-write", args: {} }],
                }),
              },
            },
          ],
        });
      },
    });

    const result = await agent.runTurn("Run unknown tool", context);

    expect(result.content).toBe("Trying unknown tool");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.result.success).toBe(false);
    expect(result.toolCalls[0]?.result.error).toContain("not permitted");
  });

  test("treats plain text responses as content without tool calls", async () => {
    const agent = new DeveloperAgent({
      config,
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "runtime-model" }] });
        }
        return jsonResponse({
          choices: [{ message: { content: "Plain answer" } }],
        });
      },
    });

    const result = await agent.runTurn("Answer plainly", context);

    expect(result.content).toBe("Plain answer");
    expect(result.toolCalls).toEqual([]);
  });

  test("rejects malformed JSON-looking envelopes without reproducing them", async () => {
    const malformed =
      '{"content":"synthetic-envelope-marker","toolCalls":[]} trailing';
    const agent = new DeveloperAgent({
      config,
      fetchImpl: async (input) =>
        input.endsWith("/v1/models")
          ? jsonResponse({ data: [{ id: "runtime-model" }] })
          : jsonResponse({ choices: [{ message: { content: malformed } }] }),
    });

    let message = "";
    try {
      await agent.runTurn("Reject malformed envelope", context);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("Developer response envelope was invalid");
    expect(message).not.toContain("synthetic-envelope-marker");
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
