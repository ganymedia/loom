import { join } from "node:path";
import { PromptStore } from "@loom/store/prompt-store";
import type { Command } from "commander";

export interface RegisterRecallCommandOptions {
  projectRoot?: string;
  writeOut?: (message: string) => void;
  storePath?: string;
}

interface RecallCommandOptions {
  vector?: string;
  topK?: string;
}

export function registerRecallCommand(
  program: Command,
  options: RegisterRecallCommandOptions = {},
): void {
  const writeOut =
    options.writeOut ?? ((message: string) => process.stdout.write(message));

  program
    .command("recall")
    .description("Recall similar Prompt Store events by embedding vector")
    .option(
      "--vector <csv>",
      "comma-separated numeric embedding vector for cosine recall",
    )
    .option("--top-k <count>", "maximum number of recall results", "5")
    .action((commandOptions: RecallCommandOptions) => {
      if (commandOptions.vector === undefined) {
        throw new Error(
          "loom recall requires --vector until embedding generation is implemented",
        );
      }

      const vector = parseVector(commandOptions.vector);
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
