import { describe, expect, test } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FINDINGS_MAX_BYTES,
  FINDINGS_MAX_RECORDS,
  appendFindings,
} from "@loom/agents/findings-store";
import type { SastFinding } from "@loom/agents/sast-contracts";
import type { LoomConfig } from "@loom/config/schema";

const config: LoomConfig = {
  activeProfile: "default",
  defaults: { theme: "loom-dark" },
  store: { topK: 3 },
  profiles: { default: {} },
  backends: {},
};

const finding: SastFinding = {
  ruleId: "synthetic-rule",
  severity: "medium",
  file: "src/example.ts",
  message: "synthetic message",
  fixHint: "synthetic fix",
};

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "loom-findings-"));
  await mkdir(join(root, ".loom"));
  return root;
}

describe("findings persistence", () => {
  test("atomically writes owner-only bounded newest JSONL records", async () => {
    const root = await project();
    const findings = Array.from({ length: 505 }, (_, index) => ({
      ...finding,
      ruleId: `rule-${index}`,
    }));
    await appendFindings(root, crypto.randomUUID(), findings, config, {});

    const path = join(root, ".loom", "findings.jsonl");
    const content = await readFile(path, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(FINDINGS_MAX_RECORDS);
    expect(content).not.toContain('rule-0"');
    expect(Buffer.byteLength(content)).toBeLessThanOrEqual(FINDINGS_MAX_BYTES);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect((await readdir(join(root, ".loom"))).sort()).toEqual([
      "findings.jsonl",
    ]);
  });

  test("rejects a symlink without changing its target", async () => {
    const root = await project();
    const outside = join(await project(), "outside.jsonl");
    await writeFile(outside, "unchanged\n");
    await symlink(outside, join(root, ".loom", "findings.jsonl"));

    await expect(
      appendFindings(root, crypto.randomUUID(), [finding], config, {}),
    ).rejects.toThrow("Unable to persist SAST findings");
    expect(await readFile(outside, "utf8")).toBe("unchanged\n");
  });

  test("redacts configured values and neutralizes record controls", async () => {
    const root = await project();
    const protectedConfig: LoomConfig = {
      ...config,
      backends: {
        local: {
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:9000",
          headers: { authorization: "synthetic-sensitive-value" },
        },
      },
    };
    await appendFindings(
      root,
      crypto.randomUUID(),
      [
        {
          ...finding,
          message: "first\nsynthetic-sensitive-value\tlast",
        },
      ],
      protectedConfig,
      {},
    );

    const content = await readFile(
      join(root, ".loom", "findings.jsonl"),
      "utf8",
    );
    expect(content).not.toContain("synthetic-sensitive-value");
    expect(content).not.toContain("\\n");
    expect(content).not.toContain("\\t");
    expect(content.trim().split("\n")).toHaveLength(1);
  });

  test("serializes concurrent rewrites without partial JSONL", async () => {
    const root = await project();
    await Promise.all(
      Array.from({ length: 12 }, () =>
        appendFindings(root, crypto.randomUUID(), [finding], config, {}),
      ),
    );
    const lines = (
      await readFile(join(root, ".loom", "findings.jsonl"), "utf8")
    )
      .trim()
      .split("\n");
    expect(lines).toHaveLength(12);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });
});
