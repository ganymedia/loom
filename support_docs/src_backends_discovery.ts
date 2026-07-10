import type { LoomConfig } from "@loom/config/schema"

// ─────────────────────────────────────────────────────────────────────────────
// Error types
// ─────────────────────────────────────────────────────────────────────────────

export class BackendUnavailableError extends Error {
  constructor(
    message: string,
    public readonly backendKey: string,
    public readonly endpoint: string,
  ) {
    super(message)
    this.name = "BackendUnavailableError"
  }
}

export class UnknownBackendError extends Error {
  constructor(public readonly backendKey: string) {
    super(
      `Unknown backend: "${backendKey}". ` +
        `Check your ~/.loom/config.yaml or .loom/config.yaml backends section.`,
    )
    this.name = "UnknownBackendError"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI model list response shape
// ─────────────────────────────────────────────────────────────────────────────

interface OpenAIModel {
  id: string
  object: string
  created?: number
  owned_by?: string
}

interface ModelsResponse {
  object: string
  data: OpenAIModel[]
}

// ─────────────────────────────────────────────────────────────────────────────
// discoverModels
//
// Calls GET /v1/models on any OpenAI-compatible endpoint (vLLM, Ollama, etc.)
// and returns the list of available model IDs. Never throws — returns an empty
// array if the endpoint is unreachable or returns an unexpected response.
//
// This is called at request time, not at startup. LOOM adapts to whatever
// models are currently deployed at the endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export async function discoverModels(
  endpoint: string,
  apiKey?: string,
  timeoutMs = 5_000,
): Promise<string[]> {
  const url = `${endpoint.replace(/\/$/, "")}/models`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) return []

    const data = (await response.json()) as ModelsResponse
    return data.data?.map((m) => m.id) ?? []
  } catch {
    // Endpoint unreachable, timed out, or returned non-JSON
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ResolvedBackend — what the rest of LOOM uses to make requests
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedBackend {
  endpoint: string
  model: string
  apiKey: string | undefined
  type: "openai-compatible" | "anthropic"
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveModel
//
// The key function for async model resolution. Given a backend key and an
// optional preferred model name, returns what to actually use.
//
// For OpenAI-compatible backends (vLLM, Ollama, etc.):
//   1. Fetches available models from GET /v1/models
//   2. Uses preferredModel if available
//   3. Falls back to first available model if preferred is not present
//   4. Throws BackendUnavailableError if endpoint has no models
//
// For Anthropic backends:
//   Uses preferredModel or "claude-sonnet-4-6" as default. Anthropic does not
//   expose a public /models endpoint, so no discovery is performed.
//
// This is intentionally NOT cached. Model availability can change between
// requests (model swap, server restart). Always check fresh.
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveModel(
  backendKey: string,
  preferredModel: string | undefined,
  config: LoomConfig,
): Promise<ResolvedBackend> {
  const backend = config.backends[backendKey]
  if (!backend) throw new UnknownBackendError(backendKey)

  // Anthropic: no /models endpoint, use preferred or default
  if (backend.type === "anthropic") {
    return {
      endpoint: backend.endpoint,
      model: preferredModel ?? "claude-sonnet-4-6",
      apiKey: backend.apiKey,
      type: "anthropic",
    }
  }

  // OpenAI-compatible: discover what's actually available
  const available = await discoverModels(backend.endpoint, backend.apiKey)

  if (available.length === 0) {
    throw new BackendUnavailableError(
      `No models found at ${backend.endpoint}. Is the inference server running?\n` +
        `Checked: GET ${backend.endpoint}/models`,
      backendKey,
      backend.endpoint,
    )
  }

  const model =
    preferredModel !== undefined && available.includes(preferredModel)
      ? preferredModel
      : (available[0] as string)

  return {
    endpoint: backend.endpoint,
    model,
    apiKey: backend.apiKey,
    type: "openai-compatible",
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// probeAllBackends
//
// Checks all configured backends concurrently. Used by `loom config status`
// to show which backends are reachable and what models they have.
// ─────────────────────────────────────────────────────────────────────────────

export interface BackendStatus {
  available: boolean
  models: string[]
  endpoint: string
  type: "openai-compatible" | "anthropic"
  latencyMs?: number
}

export async function probeAllBackends(
  config: LoomConfig,
): Promise<Record<string, BackendStatus>> {
  const results: Record<string, BackendStatus> = {}

  await Promise.all(
    Object.entries(config.backends).map(async ([key, backend]) => {
      if (backend.type === "anthropic") {
        // Anthropic doesn't expose a public model list endpoint.
        // We mark it available by convention and list known models.
        results[key] = {
          available: true,
          models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
          endpoint: backend.endpoint,
          type: "anthropic",
        }
        return
      }

      const start = Date.now()
      const models = await discoverModels(backend.endpoint, backend.apiKey)
      const latencyMs = Date.now() - start

      results[key] = {
        available: models.length > 0,
        models,
        endpoint: backend.endpoint,
        type: "openai-compatible",
        latencyMs,
      }
    }),
  )

  return results
}
