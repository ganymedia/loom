import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  defaultGlobalConfigPath,
  defaultGlobalConfigPaths,
} from "@loom/config/loader";
import {
  enforcePrivateConfigPermissions,
  writePrivateConfigFile,
} from "@loom/config/writer";
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
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error("backend endpoint must be a valid URL", { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("backend endpoint must use http:// or https://");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function promptForBaseUrl(question: string): Promise<string> {
  process.stdout.write(question);
  process.stdin.setEncoding("utf8");

  return new Promise<string>((resolve, reject) => {
    let buffer = "";

    const cleanup = (): void => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };

    const finish = (answer: string): void => {
      cleanup();
      resolve(answer);
    };

    const onData = (chunk: string | Buffer): void => {
      buffer += chunk.toString();
      const newlineIndex = buffer.search(/\r?\n/);
      if (newlineIndex >= 0) {
        finish(buffer.slice(0, newlineIndex));
      }
    };

    const onEnd = (): void => {
      cleanup();
      reject(
        new Error("backend endpoint prompt ended before input was received"),
      );
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
    process.stdin.resume();
  });
}

export async function ensureFirstRunConfig(
  options: FirstRunConfigOptions = {},
): Promise<FirstRunConfigResult> {
  const env = options.env ?? process.env;
  const path = defaultGlobalConfigPath(env);
  if (path === undefined)
    return { created: false, skippedReason: "missing-home" };
  const existingPaths = defaultGlobalConfigPaths(env).filter((configPath) =>
    existsSync(configPath),
  );
  const existingPath = existingPaths[0];
  if (existingPath !== undefined) {
    await Promise.all(
      existingPaths.map((configPath) =>
        enforcePrivateConfigPermissions(configPath),
      ),
    );
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
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writePrivateConfigFile(path, buildConfig(baseUrl), { exclusive: true });
  options.stdout?.write(`Created LOOM config at ${path}\n`);
  return { created: true, path };
}
