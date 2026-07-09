import type {
  ContextBus,
  PipelineDefinition,
  StageExecutionResult,
  StageExecutor,
  TransformStage,
} from "@loom/pipeline/types";

export class TransformStageExecutor implements StageExecutor<TransformStage> {
  readonly type = "transform" as const;

  async execute(
    stage: TransformStage,
    bus: ContextBus,
    _pipelineDefaults: PipelineDefinition["defaults"],
  ): Promise<StageExecutionResult> {
    const startedAt = performance.now();
    const output = resolveExpression(stage.expression, bus);
    bus.set(stageOutputKey(stage.id), output);

    return {
      stageId: stage.id,
      output,
      skipped: false,
      durationMs: elapsed(startedAt),
    };
  }
}

export function resolveExpression(
  expression: string,
  bus: ContextBus,
): unknown {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new Error("Transform expression must not be empty");
  }

  if (bus.has(trimmed)) return bus.get(trimmed);

  const context = bus.toTemplateContext();
  const value = resolveDottedPath(context, trimmed);
  if (value.found) return value.value;

  throw new Error(
    `Expression "${expression}" did not resolve to a context value`,
  );
}

export function resolveDottedPath(
  context: Record<string, unknown>,
  path: string,
): { found: true; value: unknown } | { found: false } {
  const parts = path.split(".");
  let cursor: unknown = context;

  for (const part of parts) {
    if (
      typeof cursor !== "object" ||
      cursor === null ||
      !Object.hasOwn(cursor, part)
    ) {
      return { found: false };
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return { found: true, value: cursor };
}

export function stageOutputKey(stageId: string): string {
  return `stages.${stageId}.output`;
}

export function elapsed(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}
