import type { FetchLike } from "@loom/backends/discovery";
import type { LoomConfig } from "@loom/config/schema";
import { runPipeline } from "@loom/pipeline/dag-walker";
import { BranchStageExecutor } from "@loom/pipeline/executors/branch";
import { InjectStageExecutor } from "@loom/pipeline/executors/inject";
import { ParallelStageExecutor } from "@loom/pipeline/executors/parallel";
import type { StageExecutorRegistry } from "@loom/pipeline/executors/parallel";
import { PromptStageExecutor } from "@loom/pipeline/executors/prompt";
import { TransformStageExecutor } from "@loom/pipeline/executors/transform";
import { parsePipeline } from "@loom/pipeline/parser";
import type { RunPromptOptions } from "@loom/prompt/run-prompt";
import type { Command } from "commander";

export interface RegisterPipelineCommandOptions {
  config: LoomConfig;
  projectRoot?: string;
  writeOut?: (message: string) => void;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  promptRunner?: PromptStageExecutorOptions["promptRunner"];
  recall?: ConstructorParameters<typeof InjectStageExecutor>[0]["recall"];
}

interface PromptStageExecutorOptions {
  promptRunner?: (options: RunPromptOptions) => Promise<{
    content: string;
    usage: { promptTokens: number; completionTokens: number };
  }>;
}

export function registerPipelineCommand(
  program: Command,
  options: RegisterPipelineCommandOptions,
): void {
  const writeOut =
    options.writeOut ?? ((message: string) => process.stdout.write(message));

  const pipeline = program
    .command("pipeline")
    .description("Run LOOM pipeline files");

  pipeline
    .command("run")
    .argument("<file>", "project-relative .loom pipeline file")
    .description("execute a .loom pipeline file")
    .action(async (file: string) => {
      const definition = await parsePipeline({
        projectRoot: options.projectRoot ?? process.cwd(),
        pipelinePath: file,
      });
      const result = await runPipeline(definition, {
        executors: createPipelineExecutors(options),
      });

      writeOut(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.success) {
        process.exitCode = 1;
      }
    });
}

export function createPipelineExecutors(
  options: RegisterPipelineCommandOptions,
): StageExecutorRegistry {
  const registry: StageExecutorRegistry = {};
  registry.transform = new TransformStageExecutor();
  registry.branch = new BranchStageExecutor();
  registry.prompt = new PromptStageExecutor({
    config: options.config,
    ...(options.fetchImpl === undefined
      ? {}
      : { fetchImpl: options.fetchImpl }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.promptRunner === undefined
      ? {}
      : { promptRunner: options.promptRunner }),
  });
  registry.inject = new InjectStageExecutor({
    recall:
      options.recall ??
      (() => {
        throw new Error(
          "loom pipeline run cannot execute inject stages until recall is configured",
        );
      }),
  });
  registry.parallel = new ParallelStageExecutor(registry);
  return registry;
}
