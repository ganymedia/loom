import type {
  PromptMessage,
  PromptResponse,
  PromptUsage,
} from "@loom/prompt/run-prompt";

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_TEMPERATURE = 0;
export const DEFAULT_RETRY_PROMPT_TEMPLATE = `Your previous response was invalid. Error: {error}

Return ONLY a valid {format} object. No other text.`;

export interface PromptValidationResult {
  valid: boolean;
  error?: string;
}

export interface RetryPromptAttempt {
  attemptIndex: number;
  messages: PromptMessage[];
  temperature: number | undefined;
  modelHint: string | undefined;
}

export type PromptExecutor = (
  attempt: RetryPromptAttempt,
) => Promise<PromptResponse>;

export type PromptValidator = (
  response: PromptResponse,
  attempt: RetryPromptAttempt,
) => PromptValidationResult | Promise<PromptValidationResult>;

export interface RunPromptWithRetryOptions {
  messages: PromptMessage[];
  execute: PromptExecutor;
  validate?: PromptValidator;
  maxRetries?: number;
  retryTemperature?: number;
  retryPromptTemplate?: string;
  retryModelFallback?: boolean;
  modelFallbacks?: string[];
  responseFormat?: string;
}

export interface PromptRetryAttemptReport {
  attemptIndex: number;
  valid: boolean;
  validationError?: string;
  modelHint?: string;
}

export interface PromptRetryResult {
  response: PromptResponse;
  attempts: PromptRetryAttemptReport[];
  usage: PromptUsage;
}

export class PromptRetryError extends Error {
  readonly attempts: PromptRetryAttemptReport[];

  constructor(message: string, attempts: PromptRetryAttemptReport[]) {
    super(message);
    this.name = "PromptRetryError";
    this.attempts = attempts;
  }
}

function assertMessages(messages: PromptMessage[]): void {
  if (messages.length === 0) {
    throw new PromptRetryError("messages must not be empty", []);
  }

  for (const [index, message] of messages.entries()) {
    if (message.content.trim().length === 0) {
      throw new PromptRetryError(
        `messages[${index}].content must not be empty`,
        [],
      );
    }
  }
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PromptRetryError(`${name} must be a non-negative integer`, []);
  }
}

function finiteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new PromptRetryError(`${name} must be finite`, []);
  }
}

function renderRetryPrompt(
  template: string,
  error: string,
  format: string,
): string {
  if (template.trim().length === 0) {
    throw new PromptRetryError("retryPromptTemplate must not be empty", []);
  }

  return template.replaceAll("{error}", error).replaceAll("{format}", format);
}

function retryMessages(parts: {
  originalMessages: PromptMessage[];
  invalidResponse: string;
  validationError: string;
  retryPromptTemplate: string;
  responseFormat: string;
}): PromptMessage[] {
  return [
    ...parts.originalMessages,
    { role: "assistant", content: parts.invalidResponse },
    {
      role: "user",
      content: renderRetryPrompt(
        parts.retryPromptTemplate,
        parts.validationError,
        parts.responseFormat,
      ),
    },
  ];
}

function modelHintForAttempt(options: {
  attemptIndex: number;
  retryModelFallback: boolean;
  modelFallbacks: string[];
}): string | undefined {
  if (!options.retryModelFallback || options.attemptIndex < 3) {
    return undefined;
  }

  return options.modelFallbacks[options.attemptIndex - 3];
}

function addUsage(left: PromptUsage, right: PromptUsage): PromptUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
  };
}

function validationFailureMessage(error: string | undefined): string {
  return error !== undefined && error.trim().length > 0
    ? error
    : "response failed validation";
}

export async function runPromptWithRetry(
  options: RunPromptWithRetryOptions,
): Promise<PromptRetryResult> {
  assertMessages(options.messages);

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryTemperature =
    options.retryTemperature ?? DEFAULT_RETRY_TEMPERATURE;
  const retryPromptTemplate =
    options.retryPromptTemplate ?? DEFAULT_RETRY_PROMPT_TEMPLATE;
  const retryModelFallback = options.retryModelFallback ?? true;
  const modelFallbacks = options.modelFallbacks ?? [];
  const responseFormat = options.responseFormat ?? "JSON";

  nonNegativeInteger(maxRetries, "maxRetries");
  finiteNumber(retryTemperature, "retryTemperature");

  let messages = options.messages.map((message) => ({ ...message }));
  let totalUsage: PromptUsage = { promptTokens: 0, completionTokens: 0 };
  const attempts: PromptRetryAttemptReport[] = [];
  let lastValidationError: string | undefined;
  let lastResponseContent = "";

  for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex += 1) {
    const modelHint = modelHintForAttempt({
      attemptIndex,
      retryModelFallback,
      modelFallbacks,
    });
    const attempt: RetryPromptAttempt = {
      attemptIndex,
      messages,
      temperature: attemptIndex === 0 ? undefined : retryTemperature,
      modelHint,
    };
    const response = await options.execute(attempt);
    totalUsage = addUsage(totalUsage, response.usage);

    const validation = options.validate
      ? await options.validate(response, attempt)
      : { valid: true };
    const report: PromptRetryAttemptReport = {
      attemptIndex,
      valid: validation.valid,
    };

    if (modelHint !== undefined) {
      report.modelHint = modelHint;
    }

    if (!validation.valid) {
      report.validationError = validationFailureMessage(validation.error);
    }

    attempts.push(report);

    if (validation.valid) {
      return { response, attempts, usage: totalUsage };
    }

    lastValidationError = report.validationError;
    lastResponseContent = response.content;

    if (attemptIndex < maxRetries) {
      if (lastValidationError === undefined) {
        throw new PromptRetryError(
          "validation failed without an error",
          attempts,
        );
      }

      messages = retryMessages({
        originalMessages: options.messages,
        invalidResponse: lastResponseContent,
        validationError: lastValidationError,
        retryPromptTemplate,
        responseFormat,
      });
    }
  }

  throw new PromptRetryError(
    `Prompt validation failed after ${maxRetries + 1} attempt(s): ${lastValidationError}`,
    attempts,
  );
}
