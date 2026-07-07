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

export const loomConfigSchema = z.object({
  activeProfile: z.string().min(1).default("default"),
  profiles: z.record(profileConfigSchema).default({ default: {} }),
  backends: z.record(backendConfigSchema).default({}),
});

export type BackendType = z.infer<typeof backendTypeSchema>;
export type BackendConfig = z.infer<typeof backendConfigSchema>;
export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type LoomConfig = z.infer<typeof loomConfigSchema>;
