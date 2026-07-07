import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoomConfig } from "@loom/config/schema";
import { runSessionSmoke, startSession } from "@loom/tui/session";

const config: LoomConfig = {
  activeProfile: "default",
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

    expect(output).toContain("LOOM TUI placeholder started");
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

    expect(output).toContain("Developer: Hello from Developer");
  });
});
