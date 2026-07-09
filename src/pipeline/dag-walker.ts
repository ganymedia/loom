import type { StageExecutorRegistry } from "@loom/pipeline/executors/parallel";
import {
  ContextBus,
  type PipelineDefinition,
  type PipelineRunResult,
  type PipelineStage,
  type StageExecutionResult,
  type StageExecutor,
} from "@loom/pipeline/types";

export interface RunPipelineOptions {
  executors: StageExecutorRegistry;
  bus?: ContextBus;
}

export class PipelineExecutionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PipelineExecutionError";
  }
}

export async function runPipeline(
  pipeline: PipelineDefinition,
  options: RunPipelineOptions,
): Promise<PipelineRunResult> {
  const startedAt = performance.now();
  const bus = options.bus ?? new ContextBus();
  const stageResults: StageExecutionResult[] = [];
  const skippedStageIds = new Set<string>();
  let finalOutput: unknown;

  validatePipelineRuntime(pipeline);

  for (const stage of pipeline.stages) {
    if (skippedStageIds.has(stage.id)) {
      const skippedResult: StageExecutionResult = {
        stageId: stage.id,
        output: undefined,
        skipped: true,
        durationMs: 0,
      };
      stageResults.push(skippedResult);
      continue;
    }

    const executor = options.executors[stage.type] as
      | StageExecutor<typeof stage>
      | undefined;
    if (executor === undefined) {
      throw new PipelineExecutionError(
        `No executor registered for stage type "${stage.type}"`,
      );
    }

    try {
      const result = await executor.execute(stage, bus, pipeline.defaults);
      stageResults.push(result);
      finalOutput = result.output;
      markSkippedBranchTarget(stage, result, skippedStageIds);
    } catch (error) {
      const failedResult: StageExecutionResult = {
        stageId: stage.id,
        output: undefined,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: elapsed(startedAt),
      };
      stageResults.push(failedResult);
      return {
        pipelineName: pipeline.name,
        success: false,
        stageResults,
        finalOutput,
        totalDurationMs: elapsed(startedAt),
        totalTokens: totalTokens(stageResults),
      };
    }
  }

  return {
    pipelineName: pipeline.name,
    success: true,
    stageResults,
    finalOutput,
    totalDurationMs: elapsed(startedAt),
    totalTokens: totalTokens(stageResults),
  };
}

function validatePipelineRuntime(pipeline: PipelineDefinition): void {
  const stageIds = new Set<string>();
  for (const stage of pipeline.stages) {
    if (stageIds.has(stage.id)) {
      throw new PipelineExecutionError(`Duplicate stage id "${stage.id}"`);
    }
    stageIds.add(stage.id);
  }

  for (const stage of pipeline.stages) {
    if (stage.type !== "branch") continue;
    if (!stageIds.has(stage.ifTrue)) {
      throw new PipelineExecutionError(
        `Branch stage "${stage.id}" ifTrue target "${stage.ifTrue}" does not match a top-level stage id`,
      );
    }
    if (!stageIds.has(stage.ifFalse)) {
      throw new PipelineExecutionError(
        `Branch stage "${stage.id}" ifFalse target "${stage.ifFalse}" does not match a top-level stage id`,
      );
    }
  }
}

function markSkippedBranchTarget(
  stage: PipelineStage,
  result: StageExecutionResult,
  skippedStageIds: Set<string>,
): void {
  if (stage.type !== "branch") return;
  const selectedStageId = selectedBranchTarget(result.output);
  if (selectedStageId === undefined) {
    throw new PipelineExecutionError(
      `Branch stage "${stage.id}" did not return a selectedStageId`,
    );
  }

  const unselectedStageId =
    selectedStageId === stage.ifTrue ? stage.ifFalse : stage.ifTrue;
  skippedStageIds.add(unselectedStageId);
}

function selectedBranchTarget(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const value = (output as Record<string, unknown>).selectedStageId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function totalTokens(
  stageResults: readonly StageExecutionResult[],
): PipelineRunResult["totalTokens"] {
  return stageResults.reduce(
    (totals, result) => {
      const usage = promptUsage(result.output);
      totals.prompt += usage.prompt;
      totals.completion += usage.completion;
      return totals;
    },
    { prompt: 0, completion: 0 },
  );
}

function promptUsage(output: unknown): { prompt: number; completion: number } {
  if (typeof output !== "object" || output === null) {
    return { prompt: 0, completion: 0 };
  }
  const usage = (output as Record<string, unknown>).usage;
  if (typeof usage !== "object" || usage === null) {
    return { prompt: 0, completion: 0 };
  }
  const promptTokens = (usage as Record<string, unknown>).promptTokens;
  const completionTokens = (usage as Record<string, unknown>).completionTokens;
  return {
    prompt: typeof promptTokens === "number" ? promptTokens : 0,
    completion: typeof completionTokens === "number" ? completionTokens : 0,
  };
}

function elapsed(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}
