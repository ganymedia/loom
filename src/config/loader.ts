import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type LoomConfig, loomConfigSchema } from "@loom/config/schema";
import YAML from "yaml";

export interface LoadConfigOptions {
  profileOverride?: string;
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
}

function defaultGlobalConfigPath(env: NodeJS.ProcessEnv): string | undefined {
  const configHome = env.XDG_CONFIG_HOME;
  const home = env.HOME;

  if (configHome !== undefined && configHome.length > 0) {
    return join(configHome, "loom", "config.yaml");
  }

  if (home !== undefined && home.length > 0) {
    return join(home, ".config", "loom", "config.yaml");
  }

  return undefined;
}

async function readYamlIfPresent(path: string | undefined): Promise<unknown> {
  if (path === undefined || !existsSync(path)) return {};
  const content = await readFile(path, "utf8");
  return YAML.parse(content) ?? {};
}

function mergeConfig(globalConfig: unknown, projectConfig: unknown): unknown {
  const globalRecord =
    typeof globalConfig === "object" && globalConfig !== null
      ? globalConfig
      : {};
  const projectRecord =
    typeof projectConfig === "object" && projectConfig !== null
      ? projectConfig
      : {};

  return {
    ...globalRecord,
    ...projectRecord,
    profiles: {
      ...("profiles" in globalRecord &&
      typeof globalRecord.profiles === "object" &&
      globalRecord.profiles !== null
        ? globalRecord.profiles
        : {}),
      ...("profiles" in projectRecord &&
      typeof projectRecord.profiles === "object" &&
      projectRecord.profiles !== null
        ? projectRecord.profiles
        : {}),
    },
    backends: {
      ...("backends" in globalRecord &&
      typeof globalRecord.backends === "object" &&
      globalRecord.backends !== null
        ? globalRecord.backends
        : {}),
      ...("backends" in projectRecord &&
      typeof projectRecord.backends === "object" &&
      projectRecord.backends !== null
        ? projectRecord.backends
        : {}),
    },
  };
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<LoomConfig> {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? process.cwd();
  const globalConfig = await readYamlIfPresent(defaultGlobalConfigPath(env));
  const projectConfig = await readYamlIfPresent(
    join(projectRoot, ".loom", "config.yaml"),
  );
  const merged = mergeConfig(globalConfig, projectConfig);

  const parsed = loomConfigSchema.parse(merged);
  const activeProfile =
    options.profileOverride ?? env.LOOM_PROFILE ?? parsed.activeProfile;

  return {
    ...parsed,
    activeProfile,
  };
}
