import { describe, expect, test } from "bun:test";
import type { BackendConfig } from "@loom/config/schema";
import { PromptRequestError, runPrompt } from "@loom/prompt/run-prompt";

const backend = {
  key: "local",
  type: "openai-compatible" as const,
  baseUrl: "http://127.0.0.1:8000",
  model: "discovered-model",
};

const backendConfig: BackendConfig = {
  type: "openai-compatible",
  baseUrl: "http://127.0.0.1:8000",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("runPrompt", () => {
  test("posts an OpenAI-compatible chat completion request", async () => {
    const seen: Array<{ input: string; init?: RequestInit }> = [];

    const response = await runPrompt({
      backend,
      backendConfig,
      messages: [{ role: "user", content: "Hello" }],
      fetchImpl: async (input, init) => {
        seen.push(init === undefined ? { input } : { input, init });
        return jsonResponse({
          choices: [{ message: { content: "Hi" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        });
      },
    });

    expect(response).toEqual({
      content: "Hi",
      usage: { promptTokens: 3, completionTokens: 2 },
    });
    expect(seen[0]?.input).toBe("http://127.0.0.1:8000/v1/chat/completions");
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      model: "discovered-model",
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  test("uses apiKeyEnv without exposing the secret in errors", async () => {
    const response = await runPrompt({
      backend,
      backendConfig: { ...backendConfig, apiKeyEnv: "LOOM_TEST_KEY" },
      env: { LOOM_TEST_KEY: "secret-token" },
      messages: [{ role: "user", content: "Hello" }],
      fetchImpl: async (_input, init) => {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer secret-token",
        );
        return jsonResponse({ choices: [{ message: { content: "Hi" } }] });
      },
    });

    expect(response.content).toBe("Hi");
  });

  test("streams OpenAI-compatible SSE text deltas and usage", async () => {
    const deltas: string[] = [];
    const response = await runPrompt({
      backend,
      backendConfig,
      messages: [{ role: "user", content: "Hello" }],
      onTextDelta: (delta) => deltas.push(delta),
      fetchImpl: async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          model: "discovered-model",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          stream_options: { include_usage: true },
        });
        return new Response(
          [
            'data: {"choices":[{"delta":{"content":"Hel"}}]}',
            "",
            'data: {"choices":[{"delta":{"content":"lo"}}]}',
            "",
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(response).toEqual({
      content: "Hello",
      usage: { promptTokens: 3, completionTokens: 2 },
    });
  });

  test("fails loudly when a streaming response ends before DONE", async () => {
    await expect(
      runPrompt({
        backend,
        backendConfig,
        messages: [{ role: "user", content: "Hello" }],
        onTextDelta: () => {},
        fetchImpl: async () =>
          new Response(
            'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
          ),
      }),
    ).rejects.toThrow("before [DONE]");
  });

  test("rejects an oversized unterminated streaming event", async () => {
    await expect(
      runPrompt({
        backend,
        backendConfig,
        messages: [{ role: "user", content: "Hello" }],
        onTextDelta: () => {},
        fetchImpl: async () => new Response("x".repeat(1_048_577)),
      }),
    ).rejects.toThrow("event was too large");
  });

  test("fails loudly for unsupported backend types", async () => {
    await expect(
      runPrompt({
        backend: { ...backend, type: "anthropic" },
        backendConfig: { ...backendConfig, type: "anthropic" },
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(PromptRequestError);
  });

  test("fails loudly on malformed response content", async () => {
    await expect(
      runPrompt({
        backend,
        backendConfig,
        messages: [{ role: "user", content: "Hello" }],
        fetchImpl: async () => jsonResponse({ choices: [{ message: {} }] }),
      }),
    ).rejects.toThrow("message content");
  });
});
