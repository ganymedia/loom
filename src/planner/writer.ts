import { join } from "node:path";
import type { PlanYaml } from "@loom/planner/schema";
import {
  resolveWritablePath,
  writeUtf8FileNoFollow,
} from "@loom/tools/path-safety";
import YAML from "yaml";

export interface WritePlanYamlOptions {
  projectRoot: string;
  plan: PlanYaml;
  planPath?: string;
}

export class PlanWriterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlanWriterError";
  }
}

function defaultPlanPath(): string {
  return join(".loom", "plan.yaml");
}

export async function writePlanYaml(
  options: WritePlanYamlOptions,
): Promise<void> {
  const requestedPath = options.planPath ?? defaultPlanPath();
  let filePath: string;

  try {
    filePath = await resolveWritablePath(options.projectRoot, requestedPath);
  } catch (error) {
    throw new PlanWriterError(
      `Plan file "${requestedPath}" is not writable inside the project root`,
      { cause: error },
    );
  }

  try {
    await writeUtf8FileNoFollow(filePath, YAML.stringify(options.plan));
  } catch (error) {
    throw new PlanWriterError(`Failed to write plan file "${requestedPath}"`, {
      cause: error,
    });
  }
}
