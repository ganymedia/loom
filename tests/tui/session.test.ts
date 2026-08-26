import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoomConfig } from "@loom/config/schema";
import { writeHandoff } from "@loom/session/handoff";
import { PriorSessionRecallError } from "@loom/store/recall-context";
import { runSessionSmoke, startSession } from "@loom/tui/session";

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  store: { topK: 3 },
  profiles: {
    default: { defaultBackend: "local" },
  },
  backends: {
    local: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000",
    },
  },
};

async function tempProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-session-"));
  await mkdir(join(projectRoot, ".loom"));
  return projectRoot;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("runSessionSmoke", () => {
  test("resolves backend and verifies file write/read", async () => {
    const projectRoot = await tempProject();

    const result = await runSessionSmoke(config, {
      projectRoot,
      fetchImpl: async () => jsonResponse({ data: [{ id: "local-model" }] }),
    });

    expect(result.backend?.key).toBe("local");
    expect(result.backend?.model).toBe("local-model");
    expect(result.fileWriteOk).toBe(true);
    expect(result.fileReadOk).toBe(true);
    expect(
      await readFile(join(projectRoot, ".loom/session-smoke.txt"), "utf8"),
    ).toContain("backend=local");
  });

  test("degrades when backend is unavailable but file tools work", async () => {
    const projectRoot = await tempProject();

    const result = await runSessionSmoke(config, {
      projectRoot,
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    });

    expect(result.backend).toBeUndefined();
    expect(result.backendError).toContain("Unable to reach backend");
    expect(result.fileWriteOk).toBe(true);
    expect(result.fileReadOk).toBe(true);
  });

  test("reports file errors without throwing", async () => {
    const projectRoot = await mkdtemp(
      join(tmpdir(), "loom-session-no-dotloom-"),
    );

    const result = await runSessionSmoke(config, {
      projectRoot,
      fetchImpl: async () => jsonResponse({ data: [{ id: "local-model" }] }),
    });

    expect(result.backend?.model).toBe("local-model");
    expect(result.fileWriteOk).toBe(false);
    expect(result.fileReadOk).toBe(false);
    expect(result.fileError).toContain("ENOENT");
  });
});

describe("startSession", () => {
  test("prints startup status", async () => {
    const projectRoot = await tempProject();
    let output = "";

    await startSession(config, {
      projectRoot,
      fetchImpl: async () => jsonResponse({ data: [{ id: "local-model" }] }),
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).toContain("LOOM session started");
    expect(output).toContain(
      "Backend: local using discovered model local-model",
    );
    expect(output).toContain("File write: ok");
    expect(output).toContain("File read: ok");
  });

  test("runs one Developer-agent prompt when initialPrompt is provided", async () => {
    const projectRoot = await tempProject();
    let output = "";

    await startSession(config, {
      projectRoot,
      contextLimit: 100,
      initialPrompt: "Say hello",
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }
        return jsonResponse({
          choices: [{ message: { content: "Hello from Developer" } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).toContain("Agents:\n┌");
    expect(output).toContain("Developer  Architect  Tester  Security");
    expect(output.match(/Status:/g)?.length).toBe(2);
    expect(output).toContain("tokens");
    expect(output).toContain("8%");
    expect(output).toContain("developer ▸");
    expect(output).toContain("Developer: Hello from Developer");
  });

  test("redacts config secrets echoed by a backend", async () => {
    const projectRoot = await tempProject();
    const secretConfig: LoomConfig = {
      ...config,
      backends: {
        local: {
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:8000",
          headers: { Authorization: "synthetic-header-secret" },
        },
      },
    };
    let output = "";

    await startSession(secretConfig, {
      projectRoot,
      initialPrompt: "Do not echo credentials",
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }
        return jsonResponse({
          choices: [
            {
              message: {
                content: "http://127.0.0.1:8000 synthetic-header-secret",
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).not.toContain("127.0.0.1:8000");
    expect(output).not.toContain("synthetic-header-secret");
    expect(output).toContain("[REDACTED]");
  });

  test("writes automatic handoff when token usage crosses threshold", async () => {
    const projectRoot = await tempProject();
    let output = "";

    await startSession(config, {
      projectRoot,
      contextLimit: 10,
      initialPrompt: "Trigger handoff",
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }
        return jsonResponse({
          choices: [{ message: { content: "Large turn" } }],
          usage: { prompt_tokens: 6, completion_tokens: 2 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    const handoff = await readFile(
      join(projectRoot, ".loom/handoff.md"),
      "utf8",
    );
    expect(output).toContain("Automatic handoff written");
    expect(handoff).toContain("# LOOM Session Handoff");
    expect(handoff).toContain("reached 80% of the context limit");
    expect(handoff).toContain("- **Next action** — Resume the LOOM session");
  });

  test("injects an existing handoff into the first agent turn context", async () => {
    const projectRoot = await tempProject();
    await writeHandoff(projectRoot, {
      goalStatus: "Resume Phase 5 Session Continuity verification.",
      completedWork: "Automatic handoff writing is verified.",
      failedAttempts: "No unresolved failed attempts.",
      branchName: "main",
      nextAction: "Prove handoff context reaches the first model request.",
    });
    let output = "";

    await startSession(config, {
      projectRoot,
      contextLimit: 100,
      initialPrompt: "Continue from handoff",
      fetchImpl: async (input, init) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }

        const requestBody = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        expect(requestBody.messages).toEqual([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining(
              "Prior LOOM session handoff:\nGoal & status: Resume Phase 5 Session Continuity verification.",
            ),
          }),
          { role: "user", content: "Continue from handoff" },
        ]);
        return jsonResponse({
          choices: [{ message: { content: "Continuing from handoff" } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).toContain("Developer: Continuing from handoff");
  });

  test("runs follow-up turns with history and visible tool-call results", async () => {
    const projectRoot = await tempProject();
    await writeFile(join(projectRoot, "note.txt"), "tool output", "utf8");
    let output = "";
    let chatRequestCount = 0;

    await startSession(config, {
      projectRoot,
      contextLimit: 100,
      initialPrompt: "First turn",
      input: ["Read note.txt", "/exit"],
      fetchImpl: async (input, init) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }

        chatRequestCount += 1;
        const requestBody = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };

        if (chatRequestCount === 1) {
          expect(requestBody.messages).toEqual([
            expect.objectContaining({ role: "system" }),
            { role: "user", content: "First turn" },
          ]);
          return jsonResponse({
            choices: [{ message: { content: "First answer" } }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          });
        }

        expect(requestBody.messages).toEqual([
          expect.objectContaining({ role: "system" }),
          { role: "user", content: "First turn" },
          { role: "assistant", content: "First answer" },
          { role: "user", content: "Read note.txt" },
        ]);
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "Read the note",
                  toolCalls: [
                    { tool: "file-reader", args: { path: "note.txt" } },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 4 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(chatRequestCount).toBe(2);
    expect(output).toContain("Enter follow-up prompts. Type / for commands.");
    expect(output).toContain("Developer: First answer");
    expect(output).toContain("Developer: Read the note");
    expect(output).toContain("20%");
    expect(output).toContain("Tool 1 (file-reader): ok — tool output");
  });

  test("injects recalled prior-session context without printing its content", async () => {
    const projectRoot = await tempProject();
    let output = "";
    let recallSessionId = "";

    await startSession(config, {
      projectRoot,
      input: ["/recall implementation status", "Use recalled context", "/exit"],
      recallPriorContext: async (query, currentSessionId) => {
        expect(query).toBe("implementation status");
        recallSessionId = currentSessionId;
        return {
          context: "Bounded historical reference",
          resultCount: 2,
        };
      },
      fetchImpl: async (input, init) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }

        const requestBody = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        expect(requestBody.messages).toEqual([
          expect.objectContaining({ role: "system" }),
          { role: "user", content: "Bounded historical reference" },
          { role: "user", content: "Use recalled context" },
        ]);
        return jsonResponse({
          choices: [{ message: { content: "Used prior context" } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(recallSessionId.length).toBeGreaterThan(0);
    expect(output).toContain("Recall: using 2 prior-session result(s).");
    expect(output).not.toContain("Bounded historical reference");
  });

  test("does not expose recall failure details", async () => {
    const projectRoot = await tempProject();
    let output = "";

    await startSession(config, {
      projectRoot,
      input: ["/recall implementation status", "/exit"],
      recallPriorContext: async () => {
        throw new Error("internal backend detail");
      },
      fetchImpl: async () => jsonResponse({ data: [{ id: "local-model" }] }),
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).toContain(
      "Recall failed: unable to retrieve prior-session context.",
    );
    expect(output).not.toContain("internal backend detail");
  });

  test("reports missing indexed prior-session history without exposing a path", async () => {
    const projectRoot = await tempProject();
    let output = "";

    await startSession(config, {
      projectRoot,
      input: ["/recall implementation status", "/exit"],
      recallPriorContext: async () => {
        throw new PriorSessionRecallError("prior-session-history-missing");
      },
      fetchImpl: async () => jsonResponse({ data: [{ id: "local-model" }] }),
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).toContain(
      "Recall unavailable: no indexed prior-session history exists.",
    );
    expect(output).not.toContain(projectRoot);
  });

  test("reports missing embedding backend configuration without exposing values", async () => {
    const projectRoot = await tempProject();
    let output = "";

    await startSession(config, {
      projectRoot,
      input: ["/recall implementation status", "/exit"],
      recallPriorContext: async () => {
        throw new PriorSessionRecallError("embedding-backend-not-configured");
      },
      fetchImpl: async () => jsonResponse({ data: [{ id: "local-model" }] }),
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(output).toContain(
      "Recall unavailable: configure store.embeddingBackend.",
    );
    expect(output).not.toContain(config.backends.local?.baseUrl ?? "");
  });

  test("switches active agents with tab commands", async () => {
    const projectRoot = await tempProject();
    let output = "";
    let chatRequestCount = 0;

    await startSession(config, {
      projectRoot,
      contextLimit: 100,
      input: [
        "/tab",
        "Plan architecture",
        "/agent Security",
        "Review risk",
        "/exit",
      ],
      fetchImpl: async (input, init) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }

        chatRequestCount += 1;
        const requestBody = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };

        if (chatRequestCount === 1) {
          expect(requestBody.messages[0]?.content).toContain("Architect agent");
          return jsonResponse({
            choices: [{ message: { content: "Architecture answer" } }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          });
        }

        expect(requestBody.messages[0]?.content).toContain("Security agent");
        return jsonResponse({
          choices: [{ message: { content: "Security answer" } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(chatRequestCount).toBe(2);
    expect(output.match(/Agents:/g)?.length).toBe(3);
    expect(output.match(/Status:/g)?.length).toBe(5);
    expect(output).toContain("Developer  Architect  Tester  Security");
    expect(output).toContain("Architect: Architecture answer");
    expect(output).toContain("architect ▸");
    expect(output).toContain("Security: Security answer");
    expect(output).toContain("security ▸");
    expect(output).toContain("16%");
  });

  test("reports unknown agent names without running a prompt", async () => {
    const projectRoot = await tempProject();
    let output = "";
    let chatRequestCount = 0;

    await startSession(config, {
      projectRoot,
      input: ["/agent unknown", "/exit"],
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "local-model" }] });
        }
        chatRequestCount += 1;
        return jsonResponse({ choices: [{ message: { content: "unused" } }] });
      },
      writeOutput: (message) => {
        output += message;
      },
    });

    expect(chatRequestCount).toBe(0);
    expect(output).toContain("Unknown agent: unknown");
  });
});
