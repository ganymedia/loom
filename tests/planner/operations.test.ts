import { describe, expect, test } from "bun:test";
import {
  PlanOperationError,
  markTaskDone,
  summarizePlan,
} from "@loom/planner/operations";
import type { PlanYaml } from "@loom/planner/schema";

const plan: PlanYaml = {
  name: "Example",
  version: "0.1.0",
  current_phase: "phase-1",
  current_milestone: "milestone-1",
  current_task: "task-1",
  phases: [
    {
      id: "phase-1",
      name: "Foundation",
      description: "Build",
      exit_criterion: "Works",
      status: "in_progress",
      milestones: [
        {
          id: "milestone-1",
          name: "Core",
          description: "Core work",
          status: "in_progress",
          tasks: [
            {
              id: "task-1",
              name: "First",
              description: "First task",
              status: "pending",
              files: [],
              dependencies: [],
            },
            {
              id: "task-2",
              name: "Second",
              description: "Second task",
              status: "pending",
              files: [],
              dependencies: [],
            },
          ],
        },
      ],
    },
  ],
};

describe("planner operations", () => {
  test("summarizes current progress", () => {
    expect(summarizePlan(plan)).toEqual({
      name: "Example",
      currentPhase: "phase-1",
      currentMilestone: "milestone-1",
      currentTask: "task-1",
      completedTasks: 0,
      totalTasks: 2,
      nextPendingTask: plan.phases[0]?.milestones[0]?.tasks[0],
    });
  });

  test("marks a task complete and advances to the next pending task", () => {
    const updated = markTaskDone(plan, "task-1");

    expect(updated.phases[0]?.milestones[0]?.tasks[0]?.status).toBe(
      "completed",
    );
    expect(updated.current_task).toBe("task-2");
    expect(plan.phases[0]?.milestones[0]?.tasks[0]?.status).toBe("pending");
  });

  test("fails loudly for an unknown task", () => {
    expect(() => markTaskDone(plan, "missing")).toThrow(PlanOperationError);
  });
});
