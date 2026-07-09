import { describe, expect, test } from "bun:test";
import {
  BackendRouterError,
  resolveBackendForRequest,
} from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  profiles: {
    default: { defaultBackend: "local" },
  },
  backends: {
    local: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000",
    },
    alternate: {
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8001",
    },
  },
};

describe("resolveBackendForRequest", () => {
  test("resolves the active profile default backend", async () => {
    const resolved = await resolveBackendForRequest(config, {
      fetchImpl: async () =>
        jsonResponse({ data: [{ id: "available-model" }] }),
    });

    expect(resolved).toEqual({
      key: "local",
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000",
      model: "available-model",
    });
  });

  test("uses a backend override when provided", async () => {
    const resolved = await resolveBackendForRequest(config, {
      backendOverride: "alternate",
      fetchImpl: async () =>
        jsonResponse({ data: [{ id: "alternate-model" }] }),
    });

    expect(resolved.key).toBe("alternate");
    expect(resolved.baseUrl).toBe("http://127.0.0.1:8001");
    expect(resolved.model).toBe("alternate-model");
  });

  test("honors preferred models only when discovered", async () => {
    const resolved = await resolveBackendForRequest(config, {
      preferredModels: ["preferred-model"],
      fetchImpl: async () =>
        jsonResponse({
          data: [{ id: "fallback-model" }, { id: "preferred-model" }],
        }),
    });

    expect(resolved.model).toBe("preferred-model");
  });

  test("fails loudly when active profile is missing", async () => {
    await expect(
      resolveBackendForRequest(
        { ...config, activeProfile: "missing" },
        { fetchImpl: async () => jsonResponse({ data: [{ id: "model" }] }) },
      ),
    ).rejects.toThrow(BackendRouterError);
  });

  test("fails loudly when active profile lacks a default backend", async () => {
    await expect(
      resolveBackendForRequest(
        {
          ...config,
          profiles: { default: {} },
        },
        { fetchImpl: async () => jsonResponse({ data: [{ id: "model" }] }) },
      ),
    ).rejects.toThrow("does not define a default backend");
  });

  test("fails loudly when selected backend is not configured", async () => {
    await expect(
      resolveBackendForRequest(
        {
          ...config,
          profiles: { default: { defaultBackend: "missing" } },
        },
        { fetchImpl: async () => jsonResponse({ data: [{ id: "model" }] }) },
      ),
    ).rejects.toThrow('Backend "missing" is not configured');
  });
});
