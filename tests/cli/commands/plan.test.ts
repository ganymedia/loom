import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerPlanCommand } from "@loom/cli/commands/plan";
import { Command } from "commander";
import YAML from "yaml";

const planYaml = `name: Example
version: "0.1.0"
current_phase: phase-1
current_milestone: milestone-1
current_task: task-1
phases:
  - id: phase-1
    name: Foundation
    description: Build
    exit_criterion: Works
    milestones:
      - id: milestone-1
        name: Core
        description: Core work
        tasks:
          - id: task-1
            name: First
            description: First task
          - id: task-2
            name: Second
            description: Second task
`;

async function projectWithPlan(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-plan-command-"));
  await mkdir(join(projectRoot, ".loom"));
  await writeFile(join(projectRoot, ".loom", "plan.yaml"), planYaml, "utf8");
  return projectRoot;
}

function planProgram(projectRoot: string, output: string[]): Command {
  const program = new Command();
  program.exitOverride();
  registerPlanCommand(program, {
    projectRoot,
    writeOut: (message) => output.push(message),
  });
  return program;
}

describe("plan command", () => {
  test("prints plan status", async () => {
    const projectRoot = await projectWithPlan();
    const output: string[] = [];
    const program = planProgram(projectRoot, output);

    await program.parseAsync(["node", "loom", "plan", "status"]);

    const summary = JSON.parse(output.join("")) as { currentTask: string };
    expect(summary.currentTask).toBe("task-1");
  });

  test("marks a task done and writes the updated plan", async () => {
    const projectRoot = await projectWithPlan();
    const output: string[] = [];
    const program = planProgram(projectRoot, output);

    await program.parseAsync(["node", "loom", "plan", "done", "task-1"]);

    expect(output.join("")).toContain("Marked task-1 completed");
    const updated = YAML.parse(
      await readFile(join(projectRoot, ".loom", "plan.yaml"), "utf8"),
    ) as {
      current_task: string;
      phases: Array<{
        milestones: Array<{ tasks: Array<{ status: string }> }>;
      }>;
    };
    expect(updated.current_task).toBe("task-2");
    expect(updated.phases[0]?.milestones[0]?.tasks[0]?.status).toBe(
      "completed",
    );
  });

  test("fails loudly for unimplemented decompose", async () => {
    const projectRoot = await projectWithPlan();
    const program = planProgram(projectRoot, []);

    await expect(
      program.parseAsync(["node", "loom", "plan", "decompose", "task-1"]),
    ).rejects.toThrow("not implemented");
  });
});
