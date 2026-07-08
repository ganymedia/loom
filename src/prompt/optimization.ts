import type { PromptMessage } from "@loom/prompt/run-prompt";

export const DEFAULT_JSON_ENFORCEMENT_INSTRUCTION =
  "Respond ONLY with valid JSON matching the schema below. No preamble, no explanation, no markdown fences. Your entire response must be a single parseable JSON object.";

export interface OptimizePromptOptions {
  messages: PromptMessage[];
  stripWhitespace?: boolean;
  deduplicateInstructions?: boolean;
  reorderForRecency?: boolean;
  outputSchema?: unknown;
  jsonEnforcementInstruction?: string;
}

export interface PromptOptimizationReport {
  strippedWhitespace: boolean;
  deduplicatedInstructionCount: number;
  reorderedForRecency: boolean;
  injectedJsonEnforcement: boolean;
}

export interface OptimizedPrompt {
  messages: PromptMessage[];
  report: PromptOptimizationReport;
}

export class PromptOptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptOptimizationError";
  }
}

function assertMessages(messages: PromptMessage[]): void {
  if (messages.length === 0) {
    throw new PromptOptimizationError("messages must not be empty");
  }

  for (const [index, message] of messages.entries()) {
    if (message.content.trim().length === 0) {
      throw new PromptOptimizationError(
        `messages[${index}].content must not be empty`,
      );
    }
  }
}

function normalizeWhitespace(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function instructionKey(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

function deduplicateAgainstSystem(messages: PromptMessage[]): {
  messages: PromptMessage[];
  removedCount: number;
} {
  const systemInstructions = new Set<string>();
  let removedCount = 0;

  const deduped = messages.map((message) => {
    const lines = message.content.split("\n");

    if (message.role === "system") {
      for (const line of lines) {
        const key = instructionKey(line);
        if (key.length > 0) {
          systemInstructions.add(key);
        }
      }
      return message;
    }

    const keptLines = lines.filter((line) => {
      const key = instructionKey(line);
      if (key.length === 0) {
        return false;
      }
      if (systemInstructions.has(key)) {
        removedCount += 1;
        return false;
      }
      return true;
    });

    if (keptLines.length === 0) {
      return message;
    }

    return { ...message, content: keptLines.join("\n") };
  });

  return { messages: deduped, removedCount };
}

function reorderMessagesForRecency(messages: PromptMessage[]): PromptMessage[] {
  const finalMessage = messages.at(-1);
  if (finalMessage === undefined) {
    return messages;
  }

  const body = messages.slice(0, -1);
  const systemMessages = body.filter((message) => message.role === "system");
  const conversationMessages = body.filter(
    (message) => message.role !== "system",
  );

  return [...systemMessages, ...conversationMessages, finalMessage];
}

function formatSchema(schema: unknown): string {
  if (typeof schema === "string") {
    if (schema.trim().length === 0) {
      throw new PromptOptimizationError("outputSchema must not be empty");
    }
    return schema.trim();
  }

  if (schema === undefined) {
    throw new PromptOptimizationError("outputSchema must not be undefined");
  }

  return JSON.stringify(schema, null, 2);
}

function injectJsonEnforcement(
  messages: PromptMessage[],
  instruction: string,
  schema: unknown,
): PromptMessage[] {
  if (instruction.trim().length === 0) {
    throw new PromptOptimizationError(
      "jsonEnforcementInstruction must not be empty",
    );
  }

  const enforcement: PromptMessage = {
    role: "system",
    content: `${instruction.trim()}\n\nSchema:\n${formatSchema(schema)}`,
  };
  const finalMessage = messages.at(-1);
  if (finalMessage === undefined) {
    return [enforcement];
  }

  return [...messages.slice(0, -1), enforcement, finalMessage];
}

export function optimizePrompt(
  options: OptimizePromptOptions,
): OptimizedPrompt {
  assertMessages(options.messages);

  let messages = options.messages.map((message) => ({ ...message }));
  const stripWhitespace = options.stripWhitespace ?? true;
  const deduplicateInstructions = options.deduplicateInstructions ?? true;
  const reorderForRecency = options.reorderForRecency ?? true;
  let deduplicatedInstructionCount = 0;

  if (stripWhitespace) {
    messages = messages.map((message) => ({
      ...message,
      content: normalizeWhitespace(message.content),
    }));
  }

  if (deduplicateInstructions) {
    const result = deduplicateAgainstSystem(messages);
    messages = result.messages;
    deduplicatedInstructionCount = result.removedCount;
  }

  if (options.outputSchema !== undefined) {
    messages = injectJsonEnforcement(
      messages,
      options.jsonEnforcementInstruction ??
        DEFAULT_JSON_ENFORCEMENT_INSTRUCTION,
      options.outputSchema,
    );
  }

  if (reorderForRecency) {
    messages = reorderMessagesForRecency(messages);
  }

  assertMessages(messages);

  return {
    messages,
    report: {
      strippedWhitespace: stripWhitespace,
      deduplicatedInstructionCount,
      reorderedForRecency: reorderForRecency,
      injectedJsonEnforcement: options.outputSchema !== undefined,
    },
  };
}
