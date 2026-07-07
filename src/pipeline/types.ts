export type StageType =
  | "prompt"
  | "transform"
  | "branch"
  | "parallel"
  | "inject";

export interface BaseStage {
  id: string;
  type: StageType;
}

export interface PromptStage extends BaseStage {
  type: "prompt";
  backend?: string;
  model?: string;
  prompt: string;
  outputSchema?: string;
}

export interface TransformStage extends BaseStage {
  type: "transform";
  expression: string;
}

export interface BranchStage extends BaseStage {
  type: "branch";
  condition: string;
  ifTrue: string;
  ifFalse: string;
}

export interface ParallelStage extends BaseStage {
  type: "parallel";
  stages: PipelineStage[];
  concurrencyLimit?: number;
  mergeStrategy: "concat" | "dict" | "list";
}

export interface InjectStage extends BaseStage {
  type: "inject";
  query: string;
  topK?: number;
  ref?: string;
  input?: Record<string, unknown>;
}

export type PipelineStage =
  | PromptStage
  | TransformStage
  | BranchStage
  | ParallelStage
  | InjectStage;

export interface PipelineDefinition {
  name: string;
  version: string;
  defaults?: {
    backend?: string;
    model?: string;
    temperature?: number;
  };
  stages: PipelineStage[];
}

export class ContextBus {
  private readonly store = new Map<string, unknown>();
  private readonly locked = new Set<string>();

  set(key: string, value: unknown): void {
    if (this.locked.has(key)) {
      throw new Error(
        `ContextBus: key "${key}" is already written and immutable. Stage outputs cannot be overwritten once set.`,
      );
    }
    this.store.set(key, value);
    if (key.startsWith("stages.")) this.locked.add(key);
  }

  get(key: string): unknown {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  toTemplateContext(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store.entries()) {
      const parts = key.split(".");
      let cursor = result;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (part === undefined) continue;
        const existing = cursor[part];
        if (
          typeof existing !== "object" ||
          existing === null ||
          Array.isArray(existing)
        ) {
          cursor[part] = {};
        }
        cursor = cursor[part] as Record<string, unknown>;
      }
      const leaf = parts.at(-1);
      if (leaf !== undefined) cursor[leaf] = value;
    }
    return result;
  }
}

export interface StageExecutionResult {
  stageId: string;
  output: unknown;
  skipped: boolean;
  error?: string;
  durationMs: number;
}

export interface StageExecutor<TStage extends PipelineStage = PipelineStage> {
  type: TStage["type"];
  execute(
    stage: TStage,
    bus: ContextBus,
    pipelineDefaults: PipelineDefinition["defaults"],
  ): Promise<StageExecutionResult>;
}

export interface PipelineRunResult {
  pipelineName: string;
  success: boolean;
  stageResults: StageExecutionResult[];
  finalOutput: unknown;
  totalDurationMs: number;
  totalTokens: { prompt: number; completion: number };
}
