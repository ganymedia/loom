import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlanParserError, parsePlanYaml } from "@loom/planner/parser";

async function projectWithPlan(content: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "loom-plan-parser-"));
  await mkdir(join(projectRoot, ".loom"));
  await writeFile(join(projectRoot, ".loom", "plan.yaml"), content, "utf8");
  return projectRoot;
}

const validPlan = `name: Example
version: "0.1.0"
current_phase: phase-1
current_milestone: milestone-1
current_task: task-1
phases:
  - id: phase-1
    name: Foundation
    description: Build the foundation
    exit_criterion: Foundation works
    milestones:
      - id: milestone-1
        name: Config
        description: Config work
        tasks:
          - id: task-1
            name: Schema
            description: Define schema
`;

describe("parsePlanYaml", () => {
  test("reads and validates the default .loom/plan.yaml", async () => {
    const projectRoot = await projectWithPlan(validPlan);

    const plan = await parsePlanYaml({ projectRoot });

    expect(plan.name).toBe("Example");
    expect(plan.current_task).toBe("task-1");
    expect(plan.phases[0]?.status).toBe("pending");
  });

  test("supports an explicit project-relative plan path", async () => {
    const projectRoot = await projectWithPlan(validPlan);
    await writeFile(join(projectRoot, "custom-plan.yaml"), validPlan, "utf8");

    const plan = await parsePlanYaml({
      projectRoot,
      planPath: "custom-plan.yaml",
    });

    expect(plan.phases[0]?.id).toBe("phase-1");
  });

  test("fails loudly for malformed YAML", async () => {
    const projectRoot = await projectWithPlan("name: [unterminated");

    await expect(parsePlanYaml({ projectRoot })).rejects.toThrow(
      "is not valid YAML",
    );
  });

  test("fails loudly for schema validation errors", async () => {
    const projectRoot = await projectWithPlan(`name: Example
version: "0.1.0"
current_task: missing
phases:
  - id: phase-1
    name: Foundation
    description: Build
    exit_criterion: Works
    milestones: []
`);

    await expect(parsePlanYaml({ projectRoot })).rejects.toThrow(
      "current_task",
    );
  });

  test("rejects paths that escape the project root", async () => {
    const projectRoot = await projectWithPlan(validPlan);

    await expect(
      parsePlanYaml({ projectRoot, planPath: "../plan.yaml" }),
    ).rejects.toThrow(PlanParserError);
  });
});
