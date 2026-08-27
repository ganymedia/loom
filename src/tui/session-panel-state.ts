import { createHash } from "node:crypto";
import { basename, parse } from "node:path";
import { parsePlanYaml } from "@loom/planner/parser";
import type { PlanStatus, PlanYaml } from "@loom/planner/schema";
import { sanitizeTerminalText } from "@loom/tui/markdown";
import { LOOM_VERSION } from "@loom/version";

export type SessionRuntimeState = "idle" | "active" | "failed";
export type PendingPlanStatus = Exclude<PlanStatus, "completed">;

export interface SessionPanelTask {
  readonly id: string;
  readonly name: string;
  readonly status: PendingPlanStatus;
}

export type SessionPanelPlan =
  | {
      readonly availability: "available";
      readonly tasks: readonly SessionPanelTask[];
    }
  | { readonly availability: "unavailable" };

export interface SessionPanelState {
  readonly directory: string;
  readonly plan: SessionPanelPlan;
  readonly runtime: SessionRuntimeState;
  readonly title: string;
  readonly version: string;
}

const MAX_DIRECTORY_CHARACTERS = 80;
const MAX_TASK_ID_CHARACTERS = 32;
const MAX_TASK_NAME_CHARACTERS = 120;
const MAX_PANEL_TASKS = 5;

export function sanitizePanelValue(value: string, limit: number): string {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("panel value limit must be a positive integer");
  }
  const neutralized = sanitizeTerminalText(value).replace(/[\r\n\t]/g, " ");
  return Array.from(neutralized).slice(0, limit).join("");
}

export function sessionDirectoryName(projectRoot: string): string {
  const parsed = parse(projectRoot);
  if (parsed.root === projectRoot) return "[filesystem root]";
  const name = sanitizePanelValue(
    basename(projectRoot),
    MAX_DIRECTORY_CHARACTERS,
  );
  return name.length > 0 ? name : "[unnamed directory]";
}

export function deriveSessionTitle(firstPrompt: string): string {
  const digest = createHash("sha256").update(firstPrompt).digest("hex");
  return `Session ${digest.slice(0, 8)}`;
}

export function flattenPendingPlanTasks(
  plan: PlanYaml,
): readonly SessionPanelTask[] {
  const tasks: SessionPanelTask[] = [];
  for (const phase of plan.phases) {
    for (const milestone of phase.milestones) {
      for (const task of milestone.tasks) {
        if (task.status === "completed") continue;
        tasks.push({
          id: sanitizePanelValue(task.id, MAX_TASK_ID_CHARACTERS),
          name: sanitizePanelValue(task.name, MAX_TASK_NAME_CHARACTERS),
          status: task.status,
        });
        if (tasks.length === MAX_PANEL_TASKS) return tasks;
      }
    }
  }
  return tasks;
}

export async function loadSessionPanelPlan(
  projectRoot: string,
): Promise<SessionPanelPlan> {
  try {
    const plan = await parsePlanYaml({ projectRoot });
    return { availability: "available", tasks: flattenPendingPlanTasks(plan) };
  } catch {
    return { availability: "unavailable" };
  }
}

export async function createSessionPanelState(
  projectRoot: string,
): Promise<SessionPanelState> {
  return {
    directory: sessionDirectoryName(projectRoot),
    plan: await loadSessionPanelPlan(projectRoot),
    runtime: "idle",
    title: "New session",
    version: LOOM_VERSION,
  };
}
