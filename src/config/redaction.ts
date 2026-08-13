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

export interface StreamingRedactor {
  push(text: string): string;
  flush(): string;
}

export function createStreamingConfigRedactor(
  config: LoomConfig,
  env: NodeJS.ProcessEnv = process.env,
): StreamingRedactor {
  const sensitiveValues = configSensitiveValues(config, env);
  let pending = "";

  return {
    push(text: string): string {
      pending += text;
      let safe = "";
      while (true) {
        const match = earliestSensitiveMatch(pending, sensitiveValues);
        if (match === undefined) break;
        safe += `${pending.slice(0, match.index)}${REDACTED_VALUE}`;
        pending = pending.slice(match.index + match.value.length);
      }
      const retainedLength = sensitivePrefixSuffixLength(
        pending,
        sensitiveValues,
      );
      const safeLength = pending.length - retainedLength;
      safe += pending.slice(0, safeLength);
      pending = pending.slice(safeLength);
      return safe;
    },
    flush(): string {
      const safe = redactSensitiveText(pending, sensitiveValues);
      pending = "";
      return safe;
    },
  };
}

function earliestSensitiveMatch(
  text: string,
  sensitiveValues: readonly string[],
): { index: number; value: string } | undefined {
  let earliest: { index: number; value: string } | undefined;
  for (const value of sensitiveValues) {
    const index = text.indexOf(value);
    if (index !== -1 && (earliest === undefined || index < earliest.index)) {
      earliest = { index, value };
    }
  }
  return earliest;
}

function sensitivePrefixSuffixLength(
  text: string,
  sensitiveValues: readonly string[],
): number {
  const maximum = Math.min(
    text.length,
    Math.max(0, ...sensitiveValues.map((value) => value.length - 1)),
  );
  for (let length = maximum; length > 0; length -= 1) {
    const suffix = text.slice(-length);
    if (sensitiveValues.some((value) => value.startsWith(suffix)))
      return length;
  }
  return 0;
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
