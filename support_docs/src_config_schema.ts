import { z } from "zod"

// ─────────────────────────────────────────────────────────────────────────────
// Backend
//
// Models are NOT configured here. They are discovered dynamically by calling
// GET /v1/models on the endpoint at request time. This means LOOM always uses
// whatever is actually deployed, and adapts automatically when you swap models.
// ─────────────────────────────────────────────────────────────────────────────

export const BackendSchema = z.object({
  endpoint: z.string().url("Backend endpoint must be a valid URL"),
  type: z.enum(["openai-compatible", "anthropic"]),
  // apiKey is optional for local endpoints (vLLM, Ollama)
  apiKey: z.string().optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Profile
//
// A named configuration set. Switch instantly with: loom config profile use <name>
// defaultModel is a hint — if the model is not available at the backend,
// LOOM falls back to the first available model at that endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export const ProfileSchema = z.object({
  defaultBackend: z.string(),
  defaultModel: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().positive().int().default(8192),
  stream: z.boolean().default(true),
  requestTimeoutSec: z.number().positive().default(120),
})

// ─────────────────────────────────────────────────────────────────────────────
// Session continuity
// ─────────────────────────────────────────────────────────────────────────────

export const SessionConfigSchema = z.object({
  handoffThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.8)
    .describe("Trigger handoff when context usage exceeds this fraction"),
  narrativePath: z.string().default(".loom/narrative.md"),
  handoffPath: z.string().default(".loom/handoff.md"),
  handoffArchivePath: z.string().default(".loom/handoffs"),
})

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Store
// ─────────────────────────────────────────────────────────────────────────────

export const StoreConfigSchema = z.object({
  path: z.string().default("~/.loom/store.db"),
  // Which backend to use for generating embeddings via POST /v1/embeddings.
  // Defaults to the active profile's defaultBackend if not set.
  // Your vLLM endpoint supports this natively — no extra setup needed.
  embeddingBackend: z.string().optional(),
  embeddingModel: z.string().optional(),
  topK: z.number().positive().int().default(3),
})

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Intelligence
// ─────────────────────────────────────────────────────────────────────────────

export const PromptIntelligenceConfigSchema = z.object({
  maxRetries: z.number().nonnegative().int().default(3),
  retryTemperature: z
    .number()
    .min(0)
    .max(2)
    .default(0.0)
    .describe("Temperature forced to this value on retry for determinism"),
  compressionThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.75)
    .describe("Compress context when usage exceeds this fraction of the model window"),
  responseHeadroom: z
    .number()
    .min(0)
    .max(1)
    .default(0.25)
    .describe("Reserve this fraction of the window for the model's response"),
  compressionStrategy: z.enum(["summarize", "drop", "hybrid"]).default("summarize"),
  // Backend used for summarization compression calls (should be a fast/light model).
  // Defaults to the active profile's defaultBackend.
  compressionBackend: z.string().optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Root config — ~/.loom/config.yaml
// ─────────────────────────────────────────────────────────────────────────────

export const LoomConfigSchema = z.object({
  backends: z.record(z.string(), BackendSchema).default({}),
  profiles: z.record(z.string(), ProfileSchema).default({}),
  defaults: z
    .object({
      activeProfile: z.string().default("default"),
    })
    .default({}),
  session: SessionConfigSchema.default({}),
  store: StoreConfigSchema.default({}),
  promptIntelligence: PromptIntelligenceConfigSchema.default({}),
})

// ─────────────────────────────────────────────────────────────────────────────
// Exported types
// ─────────────────────────────────────────────────────────────────────────────

export type LoomConfig = z.infer<typeof LoomConfigSchema>
export type BackendConfig = z.infer<typeof BackendSchema>
export type ProfileConfig = z.infer<typeof ProfileSchema>
export type SessionConfig = z.infer<typeof SessionConfigSchema>
export type StoreConfig = z.infer<typeof StoreConfigSchema>
export type PromptIntelligenceConfig = z.infer<typeof PromptIntelligenceConfigSchema>
