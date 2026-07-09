import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  InjectStage,
  ParallelStage,
  PipelineDefinition,
  PipelineStage,
  PromptStage,
} from "@loom/pipeline/types";
import { resolveReadablePath } from "@loom/tools/path-safety";
import YAML from "yaml";
import { type ZodError, z } from "zod";

export interface ParsePipelineOptions {
  projectRoot: string;
  pipelinePath?: string;
}

export class PipelineParserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PipelineParserError";
  }
}

const nonEmptyString = z.string().trim().min(1);

const pipelineDefaultsSchema = z
  .object({
    backend: nonEmptyString.optional(),
    model: nonEmptyString.optional(),
    temperature: z.number().finite().optional(),
  })
  .transform((defaults): NonNullable<PipelineDefinition["defaults"]> => {
    const result: NonNullable<PipelineDefinition["defaults"]> = {};
    if (defaults.backend !== undefined) result.backend = defaults.backend;
    if (defaults.model !== undefined) result.model = defaults.model;
    if (defaults.temperature !== undefined) {
      result.temperature = defaults.temperature;
    }
    return result;
  });

const baseStageSchema = z.object({
  id: nonEmptyString,
});

const promptStageSchema = baseStageSchema
  .extend({
    type: z.literal("prompt"),
    backend: nonEmptyString.optional(),
    model: nonEmptyString.optional(),
    prompt: nonEmptyString,
    outputSchema: nonEmptyString.optional(),
  })
  .transform((stage): PipelineStage => {
    const result: PromptStage = {
      id: stage.id,
      type: "prompt",
      prompt: stage.prompt,
    };
    if (stage.backend !== undefined) result.backend = stage.backend;
    if (stage.model !== undefined) result.model = stage.model;
    if (stage.outputSchema !== undefined) {
      result.outputSchema = stage.outputSchema;
    }
    return result;
  });

const transformStageSchema = baseStageSchema
  .extend({
    type: z.literal("transform"),
    expression: nonEmptyString,
  })
  .transform(
    (stage): PipelineStage => ({
      id: stage.id,
      type: "transform",
      expression: stage.expression,
    }),
  );

const branchStageSchema = baseStageSchema
  .extend({
    type: z.literal("branch"),
    condition: nonEmptyString,
    ifTrue: nonEmptyString,
    ifFalse: nonEmptyString,
  })
  .transform(
    (stage): PipelineStage => ({
      id: stage.id,
      type: "branch",
      condition: stage.condition,
      ifTrue: stage.ifTrue,
      ifFalse: stage.ifFalse,
    }),
  );

const injectStageSchema = baseStageSchema
  .extend({
    type: z.literal("inject"),
    query: nonEmptyString,
    topK: z.number().int().positive().optional(),
    ref: nonEmptyString.optional(),
    input: z.record(z.unknown()).optional(),
  })
  .transform((stage): PipelineStage => {
    const result: InjectStage = {
      id: stage.id,
      type: "inject",
      query: stage.query,
    };
    if (stage.topK !== undefined) result.topK = stage.topK;
    if (stage.ref !== undefined) result.ref = stage.ref;
    if (stage.input !== undefined) result.input = stage.input;
    return result;
  });

const pipelineStageSchema: z.ZodType<PipelineStage, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z.union([
      promptStageSchema,
      transformStageSchema,
      branchStageSchema,
      z
        .object({
          id: nonEmptyString,
          type: z.literal("parallel"),
          stages: z.array(pipelineStageSchema).min(1),
          concurrencyLimit: z.number().int().positive().optional(),
          mergeStrategy: z.enum(["concat", "dict", "list"]),
        })
        .transform((stage): PipelineStage => {
          const result: ParallelStage = {
            id: stage.id,
            type: "parallel",
            stages: stage.stages,
            mergeStrategy: stage.mergeStrategy,
          };
          if (stage.concurrencyLimit !== undefined) {
            result.concurrencyLimit = stage.concurrencyLimit;
          }
          return result;
        }),
      injectStageSchema,
    ]),
  );

const pipelineDefinitionSchema: z.ZodType<
  PipelineDefinition,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    name: nonEmptyString,
    version: nonEmptyString,
    defaults: pipelineDefaultsSchema.optional(),
    stages: z.array(pipelineStageSchema).min(1),
  })
  .transform((pipeline): PipelineDefinition => {
    const result: PipelineDefinition = {
      name: pipeline.name,
      version: pipeline.version,
      stages: pipeline.stages,
    };
    if (pipeline.defaults !== undefined) result.defaults = pipeline.defaults;
    return result;
  })
  .superRefine((pipeline, context) => {
    const stageIds = new Set<string>();
    const branchStages: Array<{
      stage: PipelineStage;
      path: Array<string | number>;
    }> = [];

    function visit(stage: PipelineStage, path: Array<string | number>): void {
      if (stageIds.has(stage.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "id"],
          message: `duplicate stage id "${stage.id}"`,
        });
      }
      stageIds.add(stage.id);

      if (stage.type === "branch") branchStages.push({ stage, path });

      if (stage.type === "parallel") {
        stage.stages.forEach((childStage, index) => {
          visit(childStage, [...path, "stages", index]);
        });
      }
    }

    pipeline.stages.forEach((stage, index) => {
      visit(stage, ["stages", index]);
    });

    for (const { stage, path } of branchStages) {
      if (stage.type !== "branch") continue;
      if (!stageIds.has(stage.ifTrue)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "ifTrue"],
          message: `ifTrue "${stage.ifTrue}" does not match a stage id`,
        });
      }
      if (!stageIds.has(stage.ifFalse)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "ifFalse"],
          message: `ifFalse "${stage.ifFalse}" does not match a stage id`,
        });
      }
    }
  });

function defaultPipelinePath(): string {
  return join(".loom", "pipeline.yaml");
}

function formatValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "pipeline" : issue.path.join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export async function parsePipeline(
  options: ParsePipelineOptions,
): Promise<PipelineDefinition> {
  const requestedPath = options.pipelinePath ?? defaultPipelinePath();
  let filePath: string;

  try {
    filePath = await resolveReadablePath(options.projectRoot, requestedPath);
  } catch (error) {
    throw new PipelineParserError(
      `Pipeline file "${requestedPath}" is not readable inside the project root`,
      { cause: error },
    );
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    throw new PipelineParserError(
      `Failed to read pipeline file "${requestedPath}"`,
      { cause: error },
    );
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    throw new PipelineParserError(
      `Pipeline file "${requestedPath}" is not valid YAML`,
      { cause: error },
    );
  }

  const result = pipelineDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new PipelineParserError(
      `Pipeline file "${requestedPath}" failed validation: ${formatValidationError(result.error)}`,
    );
  }

  return result.data;
}
