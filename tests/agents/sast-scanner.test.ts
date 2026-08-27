import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentTurnResult,
  SubAgentLifecycleEvent,
} from "@loom/agents/base";
import { parseSastOutput } from "@loom/agents/sast-contracts";
import { getSastManifest } from "@loom/agents/sast-manifest";
import { runSastForDeveloperWrites } from "@loom/agents/sast-scanner";
import type { LoomConfig } from "@loom/config/schema";

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  store: { topK: 3 },
  profiles: { default: { defaultBackend: "local" } },
  backends: {
    local: { type: "openai-compatible", baseUrl: "http://127.0.0.1:8000" },
  },
  subAgents: { sast: { enabled: true } },
};

function turn(
  paths: Array<[string, string | null, boolean?]>,
): AgentTurnResult {
  return {
    content: "parent result",
    toolCalls: paths.map(([path, source, success = true]) => ({
      tool: "file-writer",
      args: {},
      result: {
        success,
        output: "parent tool result",
        data: {
          kind: "file-write",
          path,
          bytes: source === null ? 0 : Buffer.byteLength(source),
          beforeContent: "",
          afterContent: source,
        },
      },
    })),
    subAgentsSpawned: [],
    promptTokens: 5,
    completionTokens: 3,
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "loom-sast-"));
  await mkdir(join(root, ".loom"));
  return root;
}

describe("SAST sub-agent", () => {
  test("loads its embedded typed manifest", () => {
    const manifest = getSastManifest();
    expect(manifest.agent.name).toBe("sast-scanner");
    expect(manifest.interface.output.findings.items.additionalProperties).toBe(
      false,
    );
    expect(manifest.execution.max_source_bytes).toBe(65_536);
    expect(manifest.execution.max_tokens).toBe(4_096);
    expect(manifest.execution.timeout_seconds).toBe(60);
  });

  test("is off by default without requests or lifecycle events", async () => {
    let calls = 0;
    const events: SubAgentLifecycleEvent[] = [];
    const result = await runSastForDeveloperWrites({
      config: { ...config, subAgents: undefined },
      projectRoot: await project(),
      turn: turn([["src/a.ts", "safe"]]),
      fetchImpl: async () => {
        calls += 1;
        return response({});
      },
      onLifecycle: (event) => events.push(event),
    });
    expect(result).toEqual({
      spawned: [],
      promptTokens: 0,
      completionTokens: 0,
    });
    expect(calls).toBe(0);
    expect(events).toEqual([]);
  });

  test("filters, deduplicates, and scans accepted writes sequentially", async () => {
    const requestedPaths: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const result = await runSastForDeveloperWrites({
      config,
      projectRoot: await project(),
      turn: turn([
        ["src/a.ts", "first"],
        ["src/a.ts", "duplicate"],
        ["README.md", "unsupported"],
        ["src/failed.js", "failed", false],
        ["src/null.py", null],
        ["src/large.go", "x".repeat(65_537)],
        ["src/b.py", "second"],
      ]),
      fetchImpl: async (input, init) => {
        if (input.endsWith("/v1/models")) {
          return response({ data: [{ id: "runtime" }] });
        }
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const body = JSON.parse(String(init?.body)) as {
          max_tokens: number;
          messages: Array<{ content: string }>;
        };
        expect(body.max_tokens).toBe(4_096);
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        const inputData = JSON.parse(body.messages[1]?.content ?? "{}") as {
          path: string;
        };
        requestedPaths.push(inputData.path);
        await Bun.sleep(5);
        active -= 1;
        return response({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  findings: [],
                  summary: "complete",
                  filesScanned: 1,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 1 },
        });
      },
    });

    expect(requestedPaths).toEqual(["src/a.ts", "src/b.py"]);
    expect(maximumActive).toBe(1);
    expect(result.spawned).toEqual(["loom-sast-scanner", "loom-sast-scanner"]);
    expect(result.promptTokens).toBe(4);
    expect(result.completionTokens).toBe(2);
  });

  test("isolates invalid output while accounting known usage", async () => {
    const events: SubAgentLifecycleEvent[] = [];
    const result = await runSastForDeveloperWrites({
      config,
      projectRoot: await project(),
      turn: turn([["src/a.ts", "safe"]]),
      fetchImpl: async (input) =>
        input.endsWith("/v1/models")
          ? response({ data: [{ id: "runtime" }] })
          : response({
              choices: [{ message: { content: "{}" } }],
              usage: { prompt_tokens: 7, completion_tokens: 4 },
            }),
      onLifecycle: (event) => events.push(event),
    });

    expect(result.spawned).toHaveLength(1);
    expect(result.promptTokens).toBe(7);
    expect(result.completionTokens).toBe(4);
    expect(events.map((event) => event.status)).toEqual(["started", "failed"]);
    expect(Object.keys(events[0] ?? {}).sort()).toEqual([
      "displayName",
      "id",
      "status",
    ]);
  });

  test("persists validated findings without source or raw output", async () => {
    const projectRoot = await project();
    const events: SubAgentLifecycleEvent[] = [];
    const result = await runSastForDeveloperWrites({
      config,
      projectRoot,
      turn: turn([["src/a.ts", "const uniqueSourceMarker = 1;"]]),
      fetchImpl: async (input) =>
        input.endsWith("/v1/models")
          ? response({ data: [{ id: "runtime" }] })
          : response({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      findings: [
                        {
                          ruleId: "synthetic-rule",
                          severity: "medium",
                          file: "src/a.ts",
                          line: 1,
                          cwe: "CWE-20",
                          message: "Synthetic issue",
                          fixHint: "Validate the value",
                        },
                      ],
                      summary: "raw summary must not persist",
                      filesScanned: 1,
                    }),
                  },
                },
              ],
              usage: { prompt_tokens: 8, completion_tokens: 5 },
            }),
      onLifecycle: (event) => events.push(event),
    });

    const persisted = await readFile(
      join(projectRoot, ".loom", "findings.jsonl"),
      "utf8",
    );
    expect(result.spawned).toEqual(["loom-sast-scanner"]);
    expect(events.map((event) => event.status)).toEqual([
      "started",
      "succeeded",
    ]);
    expect(persisted).not.toContain("uniqueSourceMarker");
    expect(persisted).not.toContain("raw summary must not persist");
    expect(Object.keys(JSON.parse(persisted)).sort()).toEqual([
      "cwe",
      "file",
      "fixHint",
      "line",
      "message",
      "rule",
      "scanId",
      "severity",
      "timestamp",
    ]);
  });

  test("rejects unknown fields, wrong paths, and invalid counts", () => {
    const base = {
      findings: [
        {
          ruleId: "rule",
          severity: "high",
          file: "src/a.ts",
          message: "message",
          fixHint: "fix",
        },
      ],
      summary: "summary",
      filesScanned: 1,
    };
    expect(() =>
      parseSastOutput(
        JSON.stringify({ ...base, raw: "forbidden" }),
        "src/a.ts",
        50,
      ),
    ).toThrow();
    expect(() =>
      parseSastOutput(
        JSON.stringify({
          ...base,
          findings: [{ ...base.findings[0], file: "src/b.ts" }],
        }),
        "src/a.ts",
        50,
      ),
    ).toThrow();
    expect(() =>
      parseSastOutput(
        JSON.stringify({ ...base, filesScanned: 2 }),
        "src/a.ts",
        50,
      ),
    ).toThrow();
  });
});
