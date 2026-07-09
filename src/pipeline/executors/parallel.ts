import { elapsed, stageOutputKey } from "@loom/pipeline/executors/transform";
import type {
  ContextBus,
  ParallelStage,
  PipelineDefinition,
  PipelineStage,
  StageExecutionResult,
  StageExecutor,
  StageType,
} from "@loom/pipeline/types";

export type StageExecutorRegistry = Partial<{
  [Type in StageType]: StageExecutor<Extract<PipelineStage, { type: Type }>>;
}>;

export class ParallelStageExecutor implements StageExecutor<ParallelStage> {
  readonly type = "parallel" as const;

  constructor(private readonly registry: StageExecutorRegistry) {}

  async execute(
    stage: ParallelStage,
    bus: ContextBus,
    pipelineDefaults: PipelineDefinition["defaults"],
  ): Promise<StageExecutionResult> {
    const startedAt = performance.now();
    const concurrencyLimit = stage.concurrencyLimit ?? stage.stages.length;
    const childResults = await runWithConcurrency(
      stage.stages,
      concurrencyLimit,
      async (childStage) => {
        const executor = this.registry[childStage.type] as
          | StageExecutor<typeof childStage>
          | undefined;
        if (executor === undefined) {
          throw new Error(
            `No executor registered for parallel child stage type "${childStage.type}"`,
          );
        }
        return executor.execute(childStage, bus, pipelineDefaults);
      },
    );

    const output = mergeOutputs(stage, childResults);
    bus.set(stageOutputKey(stage.id), output);

    return {
      stageId: stage.id,
      output,
      skipped: false,
      durationMs: elapsed(startedAt),
    };
  }
}

async function runWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrencyLimit: number,
  worker: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (concurrencyLimit <= 0) {
    throw new Error("Parallel concurrencyLimit must be greater than zero");
  }

  const results: TOutput[] = [];
  for (let index = 0; index < inputs.length; index += concurrencyLimit) {
    const batch = inputs.slice(index, index + concurrencyLimit);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

function mergeOutputs(
  stage: ParallelStage,
  childResults: readonly StageExecutionResult[],
): unknown {
  if (stage.mergeStrategy === "list") {
    return childResults.map((result) => result.output);
  }

  if (stage.mergeStrategy === "dict") {
    return Object.fromEntries(
      childResults.map((result) => [result.stageId, result.output]),
    );
  }

  return childResults.flatMap((result) => {
    if (Array.isArray(result.output)) return result.output;
    return [result.output];
  });
}
