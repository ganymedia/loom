import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import type { BackendConfig } from "@loom/config/schema";

const MAX_STREAM_EVENT_BYTES = 1_048_576;
const MAX_STREAM_CONTENT_LENGTH = 16_777_216;

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
  maxTokens?: number;
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
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

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: unknown } }>;
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
  if (
    options.maxTokens !== undefined &&
    (!Number.isInteger(options.maxTokens) || options.maxTokens <= 0)
  ) {
    throw new PromptRequestError("Prompt maxTokens must be a positive integer");
  }
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
        ...(options.maxTokens === undefined
          ? {}
          : { max_tokens: options.maxTokens }),
        ...(options.onTextDelta === undefined
          ? {}
          : { stream: true, stream_options: { include_usage: true } }),
      }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
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

  if (options.onTextDelta !== undefined) {
    return await readStreamingResponse(response, options.onTextDelta);
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

async function readStreamingResponse(
  response: Response,
  onTextDelta: (delta: string) => void,
): Promise<PromptResponse> {
  if (response.body === null) {
    throw new PromptRequestError("Streaming prompt response had no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let sawDone = false;
  let usage: PromptUsage = { promptTokens: 0, completionTokens: 0 };

  const processEvent = (event: string): void => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (data.length === 0) return;
    if (data === "[DONE]") {
      sawDone = true;
      return;
    }

    let chunk: ChatCompletionChunk;
    try {
      chunk = JSON.parse(data) as ChatCompletionChunk;
    } catch (error) {
      throw new PromptRequestError(
        "Streaming prompt response was not valid JSON",
        {
          cause: error,
        },
      );
    }
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      if (content.length + delta.length > MAX_STREAM_CONTENT_LENGTH) {
        throw new PromptRequestError("Streaming prompt response was too large");
      }
      content += delta;
      onTextDelta(delta);
    }
    if (chunk.usage !== undefined) {
      usage = {
        promptTokens: usageNumber(chunk.usage.prompt_tokens),
        completionTokens: usageNumber(chunk.usage.completion_tokens),
      };
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const events = pending.split(/\r?\n\r?\n/);
      pending = events.pop() ?? "";
      if (pending.length > MAX_STREAM_EVENT_BYTES) {
        throw new PromptRequestError("Streaming prompt event was too large");
      }
      for (const event of events) processEvent(event);
      if (done) break;
    }
    if (pending.trim().length > 0) processEvent(pending);
  } catch (error) {
    if (error instanceof PromptRequestError) throw error;
    throw new PromptRequestError("Streaming prompt response failed", {
      cause: error,
    });
  } finally {
    reader.releaseLock();
  }

  if (!sawDone) {
    throw new PromptRequestError(
      "Streaming prompt response ended before [DONE]",
    );
  }
  if (content.length === 0) {
    throw new PromptRequestError(
      "Prompt response did not include message content",
    );
  }
  return { content, usage };
}
