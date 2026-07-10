import { readFile } from "node:fs/promises";
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
import { ContextBus } from "@loom/pipeline/types";
import type { RunPromptOptions } from "@loom/prompt/run-prompt";
import { resolveReadablePath } from "@loom/tools/path-safety";
import type { Command } from "commander";
import YAML from "yaml";

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

interface PipelineRunCommandOptions {
  var?: string[];
  input?: string[];
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
    .option(
      "--var <key=value>",
      "seed a Context Bus key with a YAML-parsed value",
      collectOption,
      [],
    )
    .option(
      "--input <file>",
      "seed Context Bus keys from a project-relative YAML/JSON object file",
      collectOption,
      [],
    )
    .action(async (file: string, commandOptions: PipelineRunCommandOptions) => {
      const projectRoot = options.projectRoot ?? process.cwd();
      const definition = await parsePipeline({
        projectRoot,
        pipelinePath: file,
      });
      const result = await runPipeline(definition, {
        executors: createPipelineExecutors(options),
        bus: await buildContextBus(projectRoot, commandOptions),
      });

      writeOut(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.success) {
        process.exitCode = 1;
      }
    });
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function buildContextBus(
  projectRoot: string,
  options: PipelineRunCommandOptions,
): Promise<ContextBus> {
  const bus = new ContextBus();

  for (const inputPath of options.input ?? []) {
    const input = await readInputObject(projectRoot, inputPath);
    for (const [key, value] of Object.entries(input)) {
      setBusValue(bus, key, value);
    }
  }

  for (const variable of options.var ?? []) {
    const [key, value] = parseVariable(variable);
    setBusValue(bus, key, value);
  }

  return bus;
}

async function readInputObject(
  projectRoot: string,
  inputPath: string,
): Promise<Record<string, unknown>> {
  const filePath = await resolveReadablePath(projectRoot, inputPath);
  const parsed = YAML.parse(await readFile(filePath, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`pipeline --input "${inputPath}" must contain an object`);
  }
  return parsed as Record<string, unknown>;
}

function parseVariable(variable: string): [string, unknown] {
  const separator = variable.indexOf("=");
  if (separator <= 0) {
    throw new Error('pipeline --var must use the form "key=value"');
  }
  const key = variable.slice(0, separator).trim();
  const rawValue = variable.slice(separator + 1);
  if (key.length === 0) {
    throw new Error("pipeline --var key must not be empty");
  }
  return [key, YAML.parse(rawValue) as unknown];
}

function setBusValue(bus: ContextBus, key: string, value: unknown): void {
  if (key.trim().length === 0) {
    throw new Error("pipeline input keys must not be empty");
  }
  if (bus.has(key)) {
    throw new Error(
      `pipeline context key "${key}" was provided more than once`,
    );
  }
  bus.set(key, value);
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
