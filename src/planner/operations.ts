import type { PlanTask, PlanYaml } from "@loom/planner/schema";

export interface PlanTaskLocation {
  phaseIndex: number;
  milestoneIndex: number;
  taskIndex: number;
  task: PlanTask;
}

export interface PlanStatusSummary {
  name: string;
  currentPhase: string | undefined;
  currentMilestone: string | undefined;
  currentTask: string | undefined;
  completedTasks: number;
  totalTasks: number;
  nextPendingTask: PlanTask | undefined;
}

export class PlanOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanOperationError";
  }
}

export function listPlanTasks(plan: PlanYaml): PlanTaskLocation[] {
  return plan.phases.flatMap((phase, phaseIndex) =>
    phase.milestones.flatMap((milestone, milestoneIndex) =>
      milestone.tasks.map((task, taskIndex) => ({
        phaseIndex,
        milestoneIndex,
        taskIndex,
        task,
      })),
    ),
  );
}

export function summarizePlan(plan: PlanYaml): PlanStatusSummary {
  const tasks = listPlanTasks(plan);
  return {
    name: plan.name,
    currentPhase: plan.current_phase,
    currentMilestone: plan.current_milestone,
    currentTask: plan.current_task,
    completedTasks: tasks.filter(
      (location) => location.task.status === "completed",
    ).length,
    totalTasks: tasks.length,
    nextPendingTask: tasks.find(
      (location) => location.task.status === "pending",
    )?.task,
  };
}

export function markTaskDone(plan: PlanYaml, taskId: string): PlanYaml {
  if (taskId.trim().length === 0) {
    throw new PlanOperationError("task id must not be empty");
  }

  const tasks = listPlanTasks(plan);
  const target = tasks.find((location) => location.task.id === taskId);
  if (target === undefined) {
    throw new PlanOperationError(`task "${taskId}" was not found`);
  }

  const nextPlan: PlanYaml = structuredClone(plan);
  const nextTarget =
    nextPlan.phases[target.phaseIndex]?.milestones[target.milestoneIndex]
      ?.tasks[target.taskIndex];
  if (nextTarget === undefined) {
    throw new PlanOperationError(`task "${taskId}" location is invalid`);
  }
  nextTarget.status = "completed";

  const nextPending = listPlanTasks(nextPlan).find(
    (location) => location.task.status === "pending",
  );

  if (nextPending !== undefined) {
    const phase = nextPlan.phases[nextPending.phaseIndex];
    const milestone = phase?.milestones[nextPending.milestoneIndex];
    if (phase === undefined || milestone === undefined) {
      throw new PlanOperationError("next pending task location is invalid");
    }
    nextPlan.current_phase = phase.id;
    nextPlan.current_milestone = milestone.id;
    nextPlan.current_task = nextPending.task.id;
  }

  return nextPlan;
}
