import type { BackendConfig } from "@loom/config/schema";

interface ModelListResponse {
  data?: Array<{ id?: unknown }>;
}

export interface ResolvedBackend {
  key: string;
  type: BackendConfig["type"];
  baseUrl: string;
  model: string;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class BackendDiscoveryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BackendDiscoveryError";
  }
}

function modelsUrl(baseUrl: string): string {
  return new URL("/v1/models", baseUrl).toString();
}

export async function discoverModels(
  backend: Pick<BackendConfig, "baseUrl" | "headers">,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  let response: Response;

  try {
    const requestInit: RequestInit =
      backend.headers === undefined ? {} : { headers: backend.headers };
    response = await fetchImpl(modelsUrl(backend.baseUrl), requestInit);
  } catch (error) {
    throw new BackendDiscoveryError("Unable to reach backend model endpoint", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new BackendDiscoveryError(
      `Backend model endpoint returned HTTP ${response.status}`,
    );
  }

  let payload: ModelListResponse;
  try {
    payload = (await response.json()) as ModelListResponse;
  } catch (error) {
    throw new BackendDiscoveryError(
      "Backend model endpoint returned invalid JSON",
      {
        cause: error,
      },
    );
  }

  if (!Array.isArray(payload.data)) {
    throw new BackendDiscoveryError(
      "Backend model endpoint response is missing a data array",
    );
  }

  const models = payload.data
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (models.length === 0) {
    throw new BackendDiscoveryError(
      "Backend model endpoint returned no usable models",
    );
  }

  return models;
}

export async function resolveModel(
  key: string,
  backend: BackendConfig,
  preferred: readonly string[] = [],
  fetchImpl: FetchLike = fetch,
): Promise<ResolvedBackend> {
  const models = await discoverModels(backend, fetchImpl);
  const preferredModel = preferred.find((model) => models.includes(model));
  const selectedModel = preferredModel ?? models[0];

  if (selectedModel === undefined) {
    throw new BackendDiscoveryError(
      "Model discovery returned no selectable model",
    );
  }

  return {
    key,
    type: backend.type,
    baseUrl: backend.baseUrl,
    model: selectedModel,
  };
}
