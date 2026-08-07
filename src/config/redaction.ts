import type { LoomConfig } from "@loom/config/schema";

export const REDACTED_VALUE = "[REDACTED]";

export function configSensitiveValues(
  config: LoomConfig,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const values = new Set<string>();

  for (const backend of Object.values(config.backends)) {
    addSensitiveValue(values, backend.baseUrl);
    addUrlComponents(values, backend.baseUrl);

    for (const value of Object.values(backend.headers ?? {})) {
      addSensitiveValue(values, value);
    }

    if (backend.apiKeyEnv !== undefined) {
      addSensitiveValue(values, env[backend.apiKeyEnv]);
    }
  }

  return [...values].sort((left, right) => right.length - left.length);
}

export function redactSensitiveText(
  text: string,
  sensitiveValues: readonly string[],
): string {
  return sensitiveValues.reduce(
    (redacted, value) => redacted.replaceAll(value, REDACTED_VALUE),
    text,
  );
}

export function createConfigRedactor(
  config: LoomConfig,
  env: NodeJS.ProcessEnv = process.env,
): (text: string) => string {
  const sensitiveValues = configSensitiveValues(config, env);
  return (text: string): string => redactSensitiveText(text, sensitiveValues);
}

function addSensitiveValue(
  values: Set<string>,
  value: string | undefined,
): void {
  if (value !== undefined && value.length > 0) values.add(value);
}

function addUrlComponents(values: Set<string>, value: string): void {
  try {
    const url = new URL(value);
    addSensitiveValue(values, url.origin);
    addSensitiveValue(values, url.username);
    addSensitiveValue(values, url.password);
    for (const parameterValue of url.searchParams.values()) {
      addSensitiveValue(values, parameterValue);
    }
  } catch {
    // Schema validation owns malformed URL reporting. The raw value is still redacted.
  }
}
