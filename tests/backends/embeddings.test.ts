import { describe, expect, test } from "bun:test";
import {
  EmbeddingRequestError,
  generateEmbedding,
} from "@loom/backends/embeddings";
import type { LoomConfig } from "@loom/config/schema";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  store: {
    embeddingBackend: "embeddings",
    embeddingModel: "preferred-embedding-model",
    topK: 3,
  },
  profiles: {
    default: { defaultBackend: "chat" },
  },
  backends: {
    chat: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000",
    },
    embeddings: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8001",
      apiKeyEnv: "LOOM_EMBEDDING_API_KEY",
    },
  },
};

describe("generateEmbedding", () => {
  test("discovers the configured embedding backend and posts an embedding request", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];

    const result = await generateEmbedding({
      config,
      input: "search text",
      env: { LOOM_EMBEDDING_API_KEY: "secret-key" },
      fetchImpl: async (input, init) => {
        calls.push(init === undefined ? { input } : { input, init });
        if (input.endsWith("/v1/models")) {
          return jsonResponse({
            data: [
              { id: "fallback-embedding-model" },
              { id: "preferred-embedding-model" },
            ],
          });
        }
        return jsonResponse({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { prompt_tokens: 4, total_tokens: 4 },
        });
      },
    });

    expect(result.backend.key).toBe("embeddings");
    expect(result.backend.model).toBe("preferred-embedding-model");
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.usage).toEqual({ promptTokens: 4, totalTokens: 4 });
    expect(calls.map((call) => call.input)).toEqual([
      "http://127.0.0.1:8001/v1/models",
      "http://127.0.0.1:8001/v1/embeddings",
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      model: "preferred-embedding-model",
      input: "search text",
    });
    expect(calls[1]?.init?.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-key",
    });
  });

  test("falls back to the first discovered model when the preferred embedding model is absent", async () => {
    const result = await generateEmbedding({
      config,
      input: "search text",
      env: { LOOM_EMBEDDING_API_KEY: "secret-key" },
      fetchImpl: async (input) => {
        if (input.endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "available-embedding-model" }] });
        }
        return jsonResponse({ data: [{ embedding: [1, 0] }] });
      },
    });

    expect(result.backend.model).toBe("available-embedding-model");
    expect(result.embedding).toEqual([1, 0]);
  });

  test("fails loudly when embedding backend configuration is missing", async () => {
    await expect(
      generateEmbedding({
        config: { ...config, store: { topK: 3 } },
        input: "search text",
        fetchImpl: async () => jsonResponse({ data: [{ id: "model" }] }),
      }),
    ).rejects.toThrow("store.embeddingBackend must be configured");
  });

  test("does not leak API key values in missing-key errors", async () => {
    await expect(
      generateEmbedding({
        config,
        input: "search text",
        env: {},
        fetchImpl: async (input) => {
          if (input.endsWith("/v1/models")) {
            return jsonResponse({
              data: [{ id: "preferred-embedding-model" }],
            });
          }
          return jsonResponse({ data: [{ embedding: [1] }] });
        },
      }),
    ).rejects.toThrow('"LOOM_EMBEDDING_API_KEY" is not set');
  });

  test("rejects malformed embedding responses", async () => {
    await expect(
      generateEmbedding({
        config,
        input: "search text",
        env: { LOOM_EMBEDDING_API_KEY: "secret-key" },
        fetchImpl: async (input) => {
          if (input.endsWith("/v1/models")) {
            return jsonResponse({
              data: [{ id: "preferred-embedding-model" }],
            });
          }
          return jsonResponse({ data: [{ embedding: [1, "bad"] }] });
        },
      }),
    ).rejects.toThrow(EmbeddingRequestError);
  });

  test("rejects empty inputs", async () => {
    await expect(
      generateEmbedding({
        config,
        input: "   ",
        fetchImpl: async () => jsonResponse({ data: [{ id: "model" }] }),
      }),
    ).rejects.toThrow("Embedding input must not be empty");
  });
});
