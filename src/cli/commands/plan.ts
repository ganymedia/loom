import { markTaskDone, summarizePlan } from "@loom/planner/operations";
import { parsePlanYaml } from "@loom/planner/parser";
import { writePlanYaml } from "@loom/planner/writer";
import type { Command } from "commander";

export interface RegisterPlanCommandOptions {
  projectRoot?: string;
  writeOut?: (message: string) => void;
}

function projectRoot(options: RegisterPlanCommandOptions): string {
  return options.projectRoot ?? process.cwd();
}

export function registerPlanCommand(
  program: Command,
  options: RegisterPlanCommandOptions = {},
): void {
  const plan = program
    .command("plan")
    .description("Inspect and update plan.yaml");
  const writeOut =
    options.writeOut ?? ((message: string) => process.stdout.write(message));

  plan
    .command("status")
    .description("Print current plan status")
    .action(async () => {
      const parsed = await parsePlanYaml({ projectRoot: projectRoot(options) });
      const summary = summarizePlan(parsed);
      writeOut(`${JSON.stringify(summary, null, 2)}\n`);
    });

  plan
    .command("done")
    .description("Mark a task complete and advance to the next pending task")
    .argument("<taskId>", "task id to mark complete")
    .action(async (taskId: string) => {
      const root = projectRoot(options);
      const parsed = await parsePlanYaml({ projectRoot: root });
      const updated = markTaskDone(parsed, taskId);
      await writePlanYaml({ projectRoot: root, plan: updated });
      writeOut(
        `Marked ${taskId} completed. Current task: ${updated.current_task ?? "none"}\n`,
      );
    });

  plan
    .command("decompose")
    .description("Decompose an xlarge task into smaller tasks")
    .argument("<taskId>", "task id to decompose")
    .action(() => {
      throw new Error("loom plan decompose is not implemented yet");
    });
}
