import {
  type FetchLike,
  type ResolvedBackend,
  resolveModel,
} from "@loom/backends/discovery";
import type { LoomConfig } from "@loom/config/schema";

export class BackendRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendRouterError";
  }
}

export interface ResolveBackendOptions {
  backendOverride?: string;
  preferredModels?: readonly string[];
  fetchImpl?: FetchLike;
}

function resolveBackendKey(
  config: LoomConfig,
  backendOverride: string | undefined,
): string {
  if (backendOverride !== undefined && backendOverride.length > 0) {
    return backendOverride;
  }

  const activeProfile = config.profiles[config.activeProfile];
  if (activeProfile === undefined) {
    throw new BackendRouterError(
      `Active profile "${config.activeProfile}" is not defined`,
    );
  }

  if (activeProfile.defaultBackend === undefined) {
    throw new BackendRouterError(
      `Active profile "${config.activeProfile}" does not define a default backend`,
    );
  }

  return activeProfile.defaultBackend;
}

export async function resolveBackendForRequest(
  config: LoomConfig,
  options: ResolveBackendOptions = {},
): Promise<ResolvedBackend> {
  const backendKey = resolveBackendKey(config, options.backendOverride);
  const backend = config.backends[backendKey];

  if (backend === undefined) {
    throw new BackendRouterError(`Backend "${backendKey}" is not configured`);
  }

  return resolveModel(
    backendKey,
    backend,
    options.preferredModels ?? [],
    options.fetchImpl,
  );
}
