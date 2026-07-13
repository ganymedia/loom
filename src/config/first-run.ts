import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  defaultGlobalConfigPath,
  defaultGlobalConfigPaths,
} from "@loom/config/loader";
import YAML from "yaml";

export interface FirstRunConfigOptions {
  env?: NodeJS.ProcessEnv;
  isInteractive?: boolean;
  ask?: (question: string) => Promise<string>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
}

export interface FirstRunConfigResult {
  created: boolean;
  path?: string;
  skippedReason?: "existing-config" | "missing-home" | "non-interactive";
}

function buildConfig(baseUrl: string): string {
  return YAML.stringify({
    activeProfile: "default",
    defaults: { theme: "loom-dark" },
    profiles: { default: { defaultBackend: "local" } },
    backends: {
      local: {
        type: "openai-compatible",
        baseUrl,
      },
    },
  });
}

function normalizeBaseUrl(input: string): string {
  const value = input.trim();
  if (value.length === 0) {
    throw new Error("backend endpoint is required to create config");
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("backend endpoint must use http:// or https://");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function promptForBaseUrl(): Promise<string> {
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return reader.question("OpenAI-compatible backend URL: ");
  } finally {
    reader.close();
  }
}

export async function ensureFirstRunConfig(
  options: FirstRunConfigOptions = {},
): Promise<FirstRunConfigResult> {
  const env = options.env ?? process.env;
  const path = defaultGlobalConfigPath(env);
  if (path === undefined)
    return { created: false, skippedReason: "missing-home" };
  const existingPath = defaultGlobalConfigPaths(env).find((configPath) =>
    existsSync(configPath),
  );
  if (existingPath !== undefined) {
    return {
      created: false,
      path: existingPath,
      skippedReason: "existing-config",
    };
  }

  const isInteractive = options.isInteractive ?? process.stdin.isTTY === true;
  if (!isInteractive) {
    return { created: false, path, skippedReason: "non-interactive" };
  }

  const answer = await (options.ask ?? promptForBaseUrl)(
    "OpenAI-compatible backend URL: ",
  );
  const baseUrl = normalizeBaseUrl(answer);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buildConfig(baseUrl), { encoding: "utf8", flag: "wx" });
  options.stdout?.write(`Created LOOM config at ${path}\n`);
  return { created: true, path };
}
