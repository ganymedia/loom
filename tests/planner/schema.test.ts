import { describe, expect, test } from "bun:test";
import { planYamlSchema } from "@loom/planner/schema";

const minimalPlan = {
  name: "Example",
  version: "0.1.0",
  current_phase: "phase-1",
  current_milestone: "milestone-1",
  current_task: "task-1",
  phases: [
    {
      id: "phase-1",
      name: "Foundation",
      description: "Build the foundation",
      exit_criterion: "Foundation works",
      milestones: [
        {
          id: "milestone-1",
          name: "Config",
          description: "Config work",
          tasks: [
            {
              id: "task-1",
              name: "Schema",
              description: "Define schema",
            },
          ],
        },
      ],
    },
  ],
};

describe("planYamlSchema", () => {
  test("parses a valid plan and applies default statuses and arrays", () => {
    const parsed = planYamlSchema.parse(minimalPlan);

    expect(parsed.phases[0]?.status).toBe("pending");
    expect(parsed.phases[0]?.milestones[0]?.status).toBe("pending");
    expect(parsed.phases[0]?.milestones[0]?.tasks[0]?.status).toBe("pending");
    expect(parsed.phases[0]?.milestones[0]?.tasks[0]?.files).toEqual([]);
    expect(parsed.phases[0]?.milestones[0]?.tasks[0]?.dependencies).toEqual([]);
  });

  test("requires root fields and at least one phase", () => {
    const result = planYamlSchema.safeParse({
      name: "Example",
      version: "0.1.0",
      phases: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["phases"]);
    }
  });

  test("rejects invalid status and token estimate values", () => {
    const result = planYamlSchema.safeParse({
      ...minimalPlan,
      phases: [
        {
          ...minimalPlan.phases[0],
          status: "started",
          token_estimate: "huge",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["phases.0.status", "phases.0.token_estimate"]),
      );
    }
  });

  test("rejects duplicate IDs at every plan level", () => {
    const duplicateMilestone = {
      id: "milestone-1",
      name: "Config",
      description: "Config work",
      tasks: [
        {
          id: "task-1",
          name: "Schema",
          description: "Define schema",
        },
      ],
    };
    const duplicatePhase = {
      id: "phase-1",
      name: "Foundation",
      description: "Build the foundation",
      exit_criterion: "Foundation works",
      milestones: [duplicateMilestone, duplicateMilestone],
    };

    const result = planYamlSchema.safeParse({
      name: "Example",
      version: "0.1.0",
      phases: [duplicatePhase, duplicatePhase],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('duplicate phase id "phase-1"');
      expect(messages).toContain('duplicate milestone id "milestone-1"');
      expect(messages).toContain('duplicate task id "task-1"');
    }
  });

  test("rejects current pointers that do not match declared IDs", () => {
    const result = planYamlSchema.safeParse({
      ...minimalPlan,
      current_phase: "missing-phase",
      current_milestone: "missing-milestone",
      current_task: "missing-task",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining([
          "current_phase",
          "current_milestone",
          "current_task",
        ]),
      );
    }
  });
});
