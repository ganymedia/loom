import type { z } from "zod";

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

export interface ToolDefinition<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  execute(args: TArgs): Promise<ToolResult>;
}

export type Capability =
  | "file-read"
  | "file-write"
  | "file-delete"
  | "shell-exec"
  | "web-search"
  | "git-ops"
  | "network-read"
  | "network-write"
  | "process-spawn"
  | "env-read";

export interface ToolAccessPolicy {
  capabilities: Capability[];
  allowed: string[];
  denied: string[];
}

export function isToolPermitted(
  toolName: string,
  policy: ToolAccessPolicy,
): boolean {
  if (policy.denied.includes(toolName)) return false;
  return policy.allowed.includes(toolName);
}

export interface FileMatchRule {
  pattern: string;
  path: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function matchesGlob(pattern: string, path: string): boolean {
  let regexPattern = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      regexPattern += ".*";
      continue;
    }
    if (char === "{") {
      const closeIndex = pattern.indexOf("}", index);
      if (closeIndex > index) {
        const group = pattern.slice(index + 1, closeIndex);
        regexPattern += `(${group
          .split(",")
          .map((part) => escapeRegex(part))
          .join("|")})`;
        index = closeIndex;
        continue;
      }
    }
    regexPattern += escapeRegex(char ?? "");
  }

  return new RegExp(`^${regexPattern}$`).test(path);
}
