import type { FetchLike } from "@loom/backends/discovery";
import {
  type ResolveBackendOptions,
  resolveBackendForRequest,
} from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";
import {
  elapsed,
  resolveDottedPath,
  stageOutputKey,
} from "@loom/pipeline/executors/transform";
import type {
  ContextBus,
  PipelineDefinition,
  PromptStage,
  StageExecutionResult,
  StageExecutor,
} from "@loom/pipeline/types";
import { type RunPromptOptions, runPrompt } from "@loom/prompt/run-prompt";

export interface PromptStageExecutorOptions {
  config: LoomConfig;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  promptRunner?: (options: RunPromptOptions) => Promise<{
    content: string;
    usage: { promptTokens: number; completionTokens: number };
  }>;
}

export interface PromptStageOutput {
  content: string;
  backend: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

export class PromptStageExecutor implements StageExecutor<PromptStage> {
  readonly type = "prompt" as const;
  private readonly promptRunner: NonNullable<
    PromptStageExecutorOptions["promptRunner"]
  >;

  constructor(private readonly options: PromptStageExecutorOptions) {
    this.promptRunner = options.promptRunner ?? runPrompt;
  }

  async execute(
    stage: PromptStage,
    bus: ContextBus,
    pipelineDefaults: PipelineDefinition["defaults"],
  ): Promise<StageExecutionResult> {
    const startedAt = performance.now();
    const backendOverride = stage.backend ?? pipelineDefaults?.backend;
    const preferredModel = stage.model ?? pipelineDefaults?.model;
    const resolveOptions: ResolveBackendOptions = {
      preferredModels: preferredModel === undefined ? [] : [preferredModel],
    };
    if (backendOverride !== undefined) {
      resolveOptions.backendOverride = backendOverride;
    }
    if (this.options.fetchImpl !== undefined) {
      resolveOptions.fetchImpl = this.options.fetchImpl;
    }
    const backend = await resolveBackendForRequest(
      this.options.config,
      resolveOptions,
    );

    const backendConfig = this.options.config.backends[backend.key];
    if (backendConfig === undefined) {
      throw new Error(`Resolved backend "${backend.key}" is not configured`);
    }

    const promptOptions: RunPromptOptions = {
      backend,
      backendConfig,
      messages: [
        {
          role: "user",
          content: renderTemplate(stage.prompt, bus),
        },
      ],
    };
    if (this.options.fetchImpl !== undefined) {
      promptOptions.fetchImpl = this.options.fetchImpl;
    }
    if (this.options.env !== undefined) promptOptions.env = this.options.env;

    const response = await this.promptRunner(promptOptions);

    const output: PromptStageOutput = {
      content: response.content,
      backend: backend.key,
      model: backend.model,
      usage: response.usage,
    };
    bus.set(stageOutputKey(stage.id), output);

    return {
      stageId: stage.id,
      output,
      skipped: false,
      durationMs: elapsed(startedAt),
    };
  }
}

export function renderTemplate(template: string, bus: ContextBus): string {
  const context = bus.toTemplateContext();
  return template.replace(
    /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g,
    (_match, path) => {
      const resolved = resolveDottedPath(context, path);
      if (!resolved.found) {
        throw new Error(`Template reference "${path}" did not resolve`);
      }
      return stringifyTemplateValue(resolved.value);
    },
  );
}

function stringifyTemplateValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
