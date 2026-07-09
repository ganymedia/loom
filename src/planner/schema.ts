import { z } from "zod";

export const planStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "blocked",
]);

export const tokenEstimateSchema = z.enum([
  "small",
  "medium",
  "large",
  "xlarge",
]);

const nonEmptyString = z.string().trim().min(1);

export const planTaskSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  status: planStatusSchema.default("pending"),
  token_estimate: tokenEstimateSchema.optional(),
  files: z.array(nonEmptyString).default([]),
  dependencies: z.array(nonEmptyString).default([]),
});

export const planMilestoneSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  status: planStatusSchema.default("pending"),
  token_estimate: tokenEstimateSchema.optional(),
  tasks: z.array(planTaskSchema).default([]),
});

export const planPhaseSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  exit_criterion: nonEmptyString,
  status: planStatusSchema.default("pending"),
  token_estimate: tokenEstimateSchema.optional(),
  milestones: z.array(planMilestoneSchema).default([]),
});

export const planYamlSchema = z
  .object({
    name: nonEmptyString,
    version: nonEmptyString,
    created: nonEmptyString.optional(),
    updated: nonEmptyString.optional(),
    current_phase: nonEmptyString.optional(),
    current_milestone: nonEmptyString.optional(),
    current_task: nonEmptyString.optional(),
    phases: z.array(planPhaseSchema).min(1),
  })
  .superRefine((plan, context) => {
    const phaseIds = new Set<string>();
    const milestoneIds = new Set<string>();
    const taskIds = new Set<string>();

    for (const [phaseIndex, phase] of plan.phases.entries()) {
      if (phaseIds.has(phase.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phases", phaseIndex, "id"],
          message: `duplicate phase id "${phase.id}"`,
        });
      }
      phaseIds.add(phase.id);

      for (const [milestoneIndex, milestone] of phase.milestones.entries()) {
        if (milestoneIds.has(milestone.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phases", phaseIndex, "milestones", milestoneIndex, "id"],
            message: `duplicate milestone id "${milestone.id}"`,
          });
        }
        milestoneIds.add(milestone.id);

        for (const [taskIndex, task] of milestone.tasks.entries()) {
          if (taskIds.has(task.id)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                "phases",
                phaseIndex,
                "milestones",
                milestoneIndex,
                "tasks",
                taskIndex,
                "id",
              ],
              message: `duplicate task id "${task.id}"`,
            });
          }
          taskIds.add(task.id);
        }
      }
    }

    if (plan.current_phase !== undefined && !phaseIds.has(plan.current_phase)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["current_phase"],
        message: `current_phase "${plan.current_phase}" does not match a phase id`,
      });
    }

    if (
      plan.current_milestone !== undefined &&
      !milestoneIds.has(plan.current_milestone)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["current_milestone"],
        message: `current_milestone "${plan.current_milestone}" does not match a milestone id`,
      });
    }

    if (plan.current_task !== undefined && !taskIds.has(plan.current_task)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["current_task"],
        message: `current_task "${plan.current_task}" does not match a task id`,
      });
    }
  });

export type PlanStatus = z.infer<typeof planStatusSchema>;
export type TokenEstimate = z.infer<typeof tokenEstimateSchema>;
export type PlanTask = z.infer<typeof planTaskSchema>;
export type PlanMilestone = z.infer<typeof planMilestoneSchema>;
export type PlanPhase = z.infer<typeof planPhaseSchema>;
export type PlanYaml = z.infer<typeof planYamlSchema>;
