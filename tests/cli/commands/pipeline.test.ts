import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerPipelineCommand } from "@loom/cli/commands/pipeline";
import { loomConfigSchema } from "@loom/config/schema";
import { Command } from "commander";

async function projectWithPipeline(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-pipeline-command-"));
  await mkdir(join(projectRoot, ".loom"));
  await writeFile(
    join(projectRoot, ".loom", "sample.loom"),
    `name: cli-pipeline
version: "1"
stages:
  - id: seed
    type: inject
    query: fixed
  - id: choose
    type: branch
    condition: stages.seed.output.enabled
    ifTrue: keep
    ifFalse: drop
  - id: keep
    type: transform
    expression: stages.seed.output.label
  - id: drop
    type: transform
    expression: stages.seed.output.missing
`,
    "utf8",
  );
  await writeFile(
    join(projectRoot, ".loom", "vars.loom"),
    `name: cli-vars
version: "1"
stages:
  - id: choose
    type: branch
    condition: input.enabled
    ifTrue: keep
    ifFalse: drop
  - id: keep
    type: transform
    expression: runtime.label
  - id: drop
    type: transform
    expression: input.missing
`,
    "utf8",
  );
  await writeFile(
    join(projectRoot, ".loom", "input.yaml"),
    `input.enabled: true
`,
    "utf8",
  );
  return projectRoot;
}

function pipelineProgram(projectRoot: string, output: string[]): Command {
  const program = new Command();
  program.exitOverride();
  registerPipelineCommand(program, {
    config: loomConfigSchema.parse({}),
    projectRoot,
    writeOut: (message) => output.push(message),
    recall: () => ({ enabled: true, label: "selected" }),
  });
  return program;
}

describe("pipeline command", () => {
  test("runs a real pipeline file through the CLI wrapper", async () => {
    const projectRoot = await projectWithPipeline();
    const output: string[] = [];
    const program = pipelineProgram(projectRoot, output);

    await program.parseAsync([
      "node",
      "loom",
      "pipeline",
      "run",
      ".loom/sample.loom",
    ]);

    const result = JSON.parse(output.join("")) as {
      success: boolean;
      finalOutput: string;
      stageResults: Array<{ stageId: string; skipped: boolean }>;
    };
    expect(result.success).toBe(true);
    expect(result.finalOutput).toBe("selected");
    expect(
      result.stageResults.find((stage) => stage.stageId === "drop")?.skipped,
    ).toBe(true);
  });

  test("seeds Context Bus values from --input and --var", async () => {
    const projectRoot = await projectWithPipeline();
    const output: string[] = [];
    const program = pipelineProgram(projectRoot, output);

    await program.parseAsync([
      "node",
      "loom",
      "pipeline",
      "run",
      ".loom/vars.loom",
      "--input",
      ".loom/input.yaml",
      "--var",
      "runtime.label=from var",
    ]);

    const result = JSON.parse(output.join("")) as {
      success: boolean;
      finalOutput: string;
      stageResults: Array<{ stageId: string; skipped: boolean }>;
    };
    expect(result.success).toBe(true);
    expect(result.finalOutput).toBe("from var");
    expect(
      result.stageResults.find((stage) => stage.stageId === "drop")?.skipped,
    ).toBe(true);
  });

  test("redacts config secrets from pipeline results", async () => {
    const projectRoot = await projectWithPipeline();
    const output: string[] = [];
    const program = new Command();
    program.exitOverride();
    registerPipelineCommand(program, {
      config: loomConfigSchema.parse({
        backends: {
          local: {
            type: "openai-compatible",
            baseUrl: "https://backend.example.invalid",
            headers: { Authorization: "synthetic-header-secret" },
          },
        },
      }),
      projectRoot,
      writeOut: (message) => output.push(message),
      recall: () => ({
        enabled: true,
        label: "https://backend.example.invalid synthetic-header-secret",
      }),
    });

    await program.parseAsync([
      "node",
      "loom",
      "pipeline",
      "run",
      ".loom/sample.loom",
    ]);

    const rendered = output.join("");
    expect(rendered).not.toContain("backend.example.invalid");
    expect(rendered).not.toContain("synthetic-header-secret");
    expect(rendered).toContain("[REDACTED]");
  });

  test("fails loudly for duplicate injected Context Bus keys", async () => {
    const projectRoot = await projectWithPipeline();
    const program = pipelineProgram(projectRoot, []);

    await expect(
      program.parseAsync([
        "node",
        "loom",
        "pipeline",
        "run",
        ".loom/vars.loom",
        "--var",
        "runtime.label=one",
        "--var",
        "runtime.label=two",
      ]),
    ).rejects.toThrow(
      'pipeline context key "runtime.label" was provided more than once',
    );
  });
});
