import { z } from "zod";

export const backendTypeSchema = z.enum(["openai-compatible", "anthropic"]);

export const backendConfigSchema = z.object({
  type: backendTypeSchema,
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().min(1).optional(),
  headers: z.record(z.string()).optional(),
});

export const profileConfigSchema = z.object({
  defaultBackend: z.string().min(1).optional(),
});

export const defaultsConfigSchema = z.object({
  theme: z.string().min(1).default("loom-dark"),
});

export const storeConfigSchema = z.object({
  path: z.string().min(1).optional(),
  embeddingBackend: z.string().min(1).optional(),
  embeddingModel: z.string().min(1).optional(),
  topK: z.number().int().positive().default(3),
});

export const loomConfigSchema = z.object({
  activeProfile: z.string().min(1).default("default"),
  defaults: defaultsConfigSchema.default({ theme: "loom-dark" }),
  store: storeConfigSchema.default({ topK: 3 }),
  profiles: z.record(profileConfigSchema).default({ default: {} }),
  backends: z.record(backendConfigSchema).default({}),
});

export type BackendType = z.infer<typeof backendTypeSchema>;
export type BackendConfig = z.infer<typeof backendConfigSchema>;
export type DefaultsConfig = z.infer<typeof defaultsConfigSchema>;
export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type StoreConfig = z.infer<typeof storeConfigSchema>;
export type LoomConfig = z.infer<typeof loomConfigSchema>;
