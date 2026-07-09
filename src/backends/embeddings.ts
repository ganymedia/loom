import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import { resolveBackendForRequest } from "@loom/backends/router";
import type { BackendConfig, LoomConfig } from "@loom/config/schema";

export interface GenerateEmbeddingOptions {
  config: LoomConfig;
  input: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

export interface EmbeddingResponse {
  backend: ResolvedBackend;
  embedding: number[];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

interface OpenAIEmbeddingResponse {
  data?: Array<{
    embedding?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    total_tokens?: unknown;
  };
}

export class EmbeddingRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmbeddingRequestError";
  }
}

function embeddingsUrl(baseUrl: string): string {
  return new URL("/v1/embeddings", baseUrl).toString();
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
      throw new EmbeddingRequestError(
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

function parseEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EmbeddingRequestError(
      "Embedding response did not include a non-empty embedding vector",
    );
  }

  const embedding = value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new EmbeddingRequestError(
        "Embedding response included a non-numeric vector value",
      );
    }
    return item;
  });

  return embedding;
}

export async function generateEmbedding(
  options: GenerateEmbeddingOptions,
): Promise<EmbeddingResponse> {
  if (options.input.trim().length === 0) {
    throw new EmbeddingRequestError("Embedding input must not be empty");
  }

  const backendOverride = options.config.store.embeddingBackend;
  if (backendOverride === undefined) {
    throw new EmbeddingRequestError(
      "store.embeddingBackend must be configured before generating embeddings",
    );
  }

  const preferredModels =
    options.config.store.embeddingModel === undefined
      ? []
      : [options.config.store.embeddingModel];
  const backend = await resolveBackendForRequest(options.config, {
    backendOverride,
    preferredModels,
    ...(options.fetchImpl === undefined
      ? {}
      : { fetchImpl: options.fetchImpl }),
  });

  if (backend.type !== "openai-compatible") {
    throw new EmbeddingRequestError(
      `Backend type "${backend.type}" is not supported for embeddings`,
    );
  }

  const backendConfig = options.config.backends[backend.key];
  if (backendConfig === undefined) {
    throw new EmbeddingRequestError(
      `Resolved embedding backend "${backend.key}" is not configured`,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = buildHeaders(backendConfig, options.env ?? process.env);
  let response: Response;
  try {
    response = await fetchImpl(embeddingsUrl(backend.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: backend.model,
        input: options.input,
      }),
    });
  } catch (error) {
    throw new EmbeddingRequestError(
      "Embedding request failed before receiving a response",
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new EmbeddingRequestError(
      `Embedding request returned HTTP ${response.status}`,
    );
  }

  let payload: OpenAIEmbeddingResponse;
  try {
    payload = (await response.json()) as OpenAIEmbeddingResponse;
  } catch (error) {
    throw new EmbeddingRequestError("Embedding response was not valid JSON", {
      cause: error,
    });
  }

  return {
    backend,
    embedding: parseEmbedding(payload.data?.[0]?.embedding),
    usage: {
      promptTokens: usageNumber(payload.usage?.prompt_tokens),
      totalTokens: usageNumber(payload.usage?.total_tokens),
    },
  };
}
