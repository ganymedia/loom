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

export function defaultGlobalConfigPath(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const home = env.HOME;
  if (home !== undefined && home.length > 0) {
    return join(home, ".loom", "config.yaml");
  }
  const configHome = env.XDG_CONFIG_HOME;
  if (configHome !== undefined && configHome.length > 0) {
    return join(configHome, "loom", "config.yaml");
  }
  return undefined;
}

export function defaultGlobalConfigPaths(env: NodeJS.ProcessEnv): string[] {
  const configHome = env.XDG_CONFIG_HOME;
  const home = env.HOME;
  const paths: string[] = [];

  if (home !== undefined && home.length > 0) {
    paths.push(join(home, ".config", "loom", "config.yaml"));
  }

  if (configHome !== undefined && configHome.length > 0) {
    paths.push(join(configHome, "loom", "config.yaml"));
  }

  if (home !== undefined && home.length > 0) {
    paths.push(join(home, ".loom", "config.yaml"));
  }

  return paths;
}

async function readYamlIfPresent(path: string | undefined): Promise<unknown> {
  if (path === undefined || !existsSync(path)) return {};
  const content = await readFile(path, "utf8");
  return YAML.parse(content) ?? {};
}

async function readGlobalConfig(env: NodeJS.ProcessEnv): Promise<unknown> {
  const configs = await Promise.all(
    defaultGlobalConfigPaths(env).map((path) => readYamlIfPresent(path)),
  );
  return configs.reduce<unknown>(mergeConfig, {});
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

  const profiles = {
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
  };
  const backends = {
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
  };

  return {
    ...globalRecord,
    ...projectRecord,
    profiles: Object.keys(profiles).length === 0 ? { default: {} } : profiles,
    backends,
  };
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<LoomConfig> {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? process.cwd();
  const globalConfig = await readGlobalConfig(env);
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
    profiles: {
      ...parsed.profiles,
      [activeProfile]: parsed.profiles[activeProfile] ?? {},
    },
  };
}
