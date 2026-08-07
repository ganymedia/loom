import { join } from "node:path";
import type { FetchLike } from "@loom/backends/discovery";
import { generateEmbedding } from "@loom/backends/embeddings";
import { createConfigRedactor } from "@loom/config/redaction";
import type { LoomConfig } from "@loom/config/schema";
import { PromptStore } from "@loom/store/prompt-store";
import type { Command } from "commander";

export interface RegisterRecallCommandOptions {
  projectRoot?: string;
  writeOut?: (message: string) => void;
  storePath?: string;
  config?: LoomConfig;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

interface RecallCommandOptions {
  vector?: string;
  query?: string;
  topK?: string;
}

export function registerRecallCommand(
  program: Command,
  options: RegisterRecallCommandOptions = {},
): void {
  const outputSink =
    options.writeOut ?? ((message: string) => process.stdout.write(message));
  const redact =
    options.config === undefined
      ? (message: string): string => message
      : createConfigRedactor(options.config, options.env);
  const writeOut = (message: string): void => outputSink(redact(message));

  program
    .command("recall")
    .description(
      "Recall similar Prompt Store events by query text or embedding vector",
    )
    .option("--query <text>", "natural-language query to embed for recall")
    .option(
      "--vector <csv>",
      "comma-separated numeric embedding vector for cosine recall",
    )
    .option("--top-k <count>", "maximum number of recall results", "5")
    .action(async (commandOptions: RecallCommandOptions) => {
      if (
        commandOptions.vector !== undefined &&
        commandOptions.query !== undefined
      ) {
        throw new Error(
          "loom recall accepts either --query or --vector, not both",
        );
      }
      if (
        commandOptions.vector === undefined &&
        commandOptions.query === undefined
      ) {
        throw new Error("loom recall requires either --query or --vector");
      }

      const vector =
        commandOptions.query === undefined
          ? parseVector(commandOptions.vector as string)
          : await queryVector(commandOptions.query, options);
      const topK = parseTopK(commandOptions.topK ?? "5");
      const store = PromptStore.open(storePath(options));
      try {
        const results = store.recallSimilar(vector, { topK });
        writeOut(
          `${JSON.stringify(
            {
              results: results.map((result) => ({
                score: result.score,
                event: result.event,
              })),
            },
            null,
            2,
          )}\n`,
        );
      } finally {
        store.close();
      }
    });
}

async function queryVector(
  query: string,
  options: RegisterRecallCommandOptions,
): Promise<number[]> {
  if (options.config === undefined) {
    throw new Error("loom recall --query requires loaded runtime config");
  }

  const embedding = await generateEmbedding({
    config: options.config,
    input: query,
    ...(options.fetchImpl === undefined
      ? {}
      : { fetchImpl: options.fetchImpl }),
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  return embedding.embedding;
}

function storePath(options: RegisterRecallCommandOptions): string {
  if (options.storePath !== undefined) return options.storePath;
  return join(
    options.projectRoot ?? process.cwd(),
    ".loom",
    "prompt-store.sqlite",
  );
}

function parseVector(value: string): number[] {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new Error("recall vector must be a comma-separated list of numbers");
  }

  const vector = parts.map((part) => Number(part));
  if (vector.some((part) => !Number.isFinite(part))) {
    throw new Error("recall vector must contain only finite numbers");
  }
  return vector;
}

function parseTopK(value: string): number {
  const topK = Number(value);
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error("--top-k must be a positive integer");
  }
  return topK;
}
