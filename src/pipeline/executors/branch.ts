import {
  elapsed,
  resolveExpression,
  stageOutputKey,
} from "@loom/pipeline/executors/transform";
import type {
  BranchStage,
  ContextBus,
  PipelineDefinition,
  StageExecutionResult,
  StageExecutor,
} from "@loom/pipeline/types";

export interface BranchStageOutput {
  condition: unknown;
  selectedStageId: string;
}

export class BranchStageExecutor implements StageExecutor<BranchStage> {
  readonly type = "branch" as const;

  async execute(
    stage: BranchStage,
    bus: ContextBus,
    _pipelineDefaults: PipelineDefinition["defaults"],
  ): Promise<StageExecutionResult> {
    const startedAt = performance.now();
    const condition = resolveExpression(stage.condition, bus);
    const selectedStageId = isTruthy(condition) ? stage.ifTrue : stage.ifFalse;
    const output: BranchStageOutput = { condition, selectedStageId };
    bus.set(stageOutputKey(stage.id), output);

    return {
      stageId: stage.id,
      output,
      skipped: false,
      durationMs: elapsed(startedAt),
    };
  }
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}
