import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type PlanYaml, planYamlSchema } from "@loom/planner/schema";
import { resolveReadablePath } from "@loom/tools/path-safety";
import YAML from "yaml";
import type { ZodError } from "zod";

export interface ParsePlanYamlOptions {
  projectRoot: string;
  planPath?: string;
}

export class PlanParserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlanParserError";
  }
}

function defaultPlanPath(): string {
  return join(".loom", "plan.yaml");
}

function formatValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "plan" : issue.path.join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export async function parsePlanYaml(
  options: ParsePlanYamlOptions,
): Promise<PlanYaml> {
  const requestedPath = options.planPath ?? defaultPlanPath();
  let filePath: string;

  try {
    filePath = await resolveReadablePath(options.projectRoot, requestedPath);
  } catch (error) {
    throw new PlanParserError(
      `Plan file "${requestedPath}" is not readable inside the project root`,
      { cause: error },
    );
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    throw new PlanParserError(`Failed to read plan file "${requestedPath}"`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    throw new PlanParserError(
      `Plan file "${requestedPath}" is not valid YAML`,
      {
        cause: error,
      },
    );
  }

  const result = planYamlSchema.safeParse(parsed);
  if (!result.success) {
    throw new PlanParserError(
      `Plan file "${requestedPath}" failed validation: ${formatValidationError(result.error)}`,
    );
  }

  return result.data;
}
