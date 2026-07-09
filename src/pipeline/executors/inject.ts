import { elapsed, stageOutputKey } from "@loom/pipeline/executors/transform";
import type {
  ContextBus,
  InjectStage,
  PipelineDefinition,
  StageExecutionResult,
  StageExecutor,
} from "@loom/pipeline/types";

export interface InjectRecallQuery {
  query: string;
  topK: number;
  ref?: string;
  input?: Record<string, unknown>;
}

export interface InjectStageExecutorOptions {
  recall: (query: InjectRecallQuery) => Promise<unknown> | unknown;
}

export class InjectStageExecutor implements StageExecutor<InjectStage> {
  readonly type = "inject" as const;

  constructor(private readonly options: InjectStageExecutorOptions) {}

  async execute(
    stage: InjectStage,
    bus: ContextBus,
    _pipelineDefaults: PipelineDefinition["defaults"],
  ): Promise<StageExecutionResult> {
    const startedAt = performance.now();
    const query: InjectRecallQuery = {
      query: stage.query,
      topK: stage.topK ?? 5,
    };
    if (stage.ref !== undefined) query.ref = stage.ref;
    if (stage.input !== undefined) query.input = stage.input;

    const output = await this.options.recall(query);
    bus.set(stageOutputKey(stage.id), output);

    return {
      stageId: stage.id,
      output,
      skipped: false,
      durationMs: elapsed(startedAt),
    };
  }
}
