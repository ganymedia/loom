import { describe, expect, test } from "bun:test";
import {
  BackendDiscoveryError,
  discoverModels,
  resolveModel,
} from "@loom/backends/discovery";
import type { BackendConfig } from "@loom/config/schema";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("discoverModels", () => {
  const backend: BackendConfig = {
    type: "openai-compatible",
    baseUrl: "http://127.0.0.1:8000",
  };

  test("returns model ids from an OpenAI-compatible endpoint", async () => {
    const models = await discoverModels(backend, async () =>
      jsonResponse({ data: [{ id: "first-model" }, { id: "second-model" }] }),
    );

    expect(models).toEqual(["first-model", "second-model"]);
  });

  test("fails loudly on unreachable backend", async () => {
    await expect(
      discoverModels(backend, async () => {
        throw new Error("connection refused");
      }),
    ).rejects.toThrow(BackendDiscoveryError);
  });

  test("fails loudly on malformed model response", async () => {
    await expect(
      discoverModels(backend, async () => jsonResponse({ models: [] })),
    ).rejects.toThrow("missing a data array");
  });
});

describe("resolveModel", () => {
  const backend: BackendConfig = {
    type: "openai-compatible",
    baseUrl: "http://127.0.0.1:8000",
  };

  test("uses a preferred model only when discovered", async () => {
    const resolved = await resolveModel(
      "local",
      backend,
      ["second-model"],
      async () =>
        jsonResponse({ data: [{ id: "first-model" }, { id: "second-model" }] }),
    );

    expect(resolved.model).toBe("second-model");
  });

  test("falls back to the first discovered model", async () => {
    const resolved = await resolveModel(
      "local",
      backend,
      ["not-present"],
      async () => jsonResponse({ data: [{ id: "first-model" }] }),
    );

    expect(resolved.model).toBe("first-model");
  });
});
