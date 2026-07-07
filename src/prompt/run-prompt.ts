import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import type { BackendConfig } from "@loom/config/schema";

export type PromptRole = "system" | "user" | "assistant";

export interface PromptMessage {
  role: PromptRole;
  content: string;
}

export interface RunPromptOptions {
  backend: ResolvedBackend;
  backendConfig: BackendConfig;
  messages: PromptMessage[];
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export interface PromptUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface PromptResponse {
  content: string;
  usage: PromptUsage;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };
}

export class PromptRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromptRequestError";
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  return new URL("/v1/chat/completions", baseUrl).toString();
}

function buildHeaders(
  backendConfig: BackendConfig,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(backendConfig.headers ?? {}),
  };

  if (backendConfig.apiKeyEnv !== undefined) {
    const apiKey = env[backendConfig.apiKeyEnv];
    if (apiKey === undefined || apiKey.length === 0) {
      throw new PromptRequestError(
        `Backend API key environment variable "${backendConfig.apiKeyEnv}" is not set`,
      );
    }
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function usageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function runPrompt(
  options: RunPromptOptions,
): Promise<PromptResponse> {
  if (options.backend.type !== "openai-compatible") {
    throw new PromptRequestError(
      `Backend type "${options.backend.type}" is not supported by the Phase 1 prompt gateway`,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(chatCompletionsUrl(options.backend.baseUrl), {
      method: "POST",
      headers: buildHeaders(options.backendConfig, options.env ?? process.env),
      body: JSON.stringify({
        model: options.backend.model,
        messages: options.messages,
      }),
    });
  } catch (error) {
    throw new PromptRequestError(
      "Prompt request failed before receiving a response",
      {
        cause: error,
      },
    );
  }

  if (!response.ok) {
    throw new PromptRequestError(
      `Prompt request returned HTTP ${response.status}`,
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    throw new PromptRequestError("Prompt response was not valid JSON", {
      cause: error,
    });
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new PromptRequestError(
      "Prompt response did not include message content",
    );
  }

  return {
    content,
    usage: {
      promptTokens: usageNumber(payload.usage?.prompt_tokens),
      completionTokens: usageNumber(payload.usage?.completion_tokens),
    },
  };
}
