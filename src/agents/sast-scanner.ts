import { isAbsolute, normalize } from "node:path";
import type {
  AgentTurnResult,
  SubAgentLifecycleEvent,
} from "@loom/agents/base";
import { appendFindings } from "@loom/agents/findings-store";
import { parseSastOutput } from "@loom/agents/sast-contracts";
import {
  getDeveloperSastRule,
  getSastManifest,
} from "@loom/agents/sast-manifest";
import type { FetchLike } from "@loom/backends/discovery";
import { resolveBackendForRequest } from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";
import { runPrompt } from "@loom/prompt/run-prompt";
import { matchesGlob } from "@loom/tools/base";
import { isFileWriterResultData } from "@loom/tools/file-writer";

export interface SastRunResult {
  spawned: string[];
  promptTokens: number;
  completionTokens: number;
}

export interface RunSastOptions {
  config: LoomConfig;
  projectRoot: string;
  turn: AgentTurnResult;
  backendOverride?: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  onLifecycle?: (event: SubAgentLifecycleEvent) => void;
}

interface ScanRequest {
  path: string;
  source: string;
}

export async function runSastForDeveloperWrites(
  options: RunSastOptions,
): Promise<SastRunResult> {
  if (options.config.subAgents?.sast.enabled !== true) {
    return { spawned: [], promptTokens: 0, completionTokens: 0 };
  }

  const manifest = getSastManifest();
  if (manifest.agent.name !== "sast-scanner") {
    throw new Error("SAST sub-agent registry is invalid");
  }
  const developerRule = getDeveloperSastRule();
  const fileMatch = developerRule.trigger.fileMatch;
  if (developerRule.trigger.type !== "file-write" || fileMatch === undefined) {
    throw new Error("SAST sub-agent registry is invalid");
  }
  const requests = collectScanRequests(
    options.turn,
    manifest.execution,
    fileMatch,
  );
  const result: SastRunResult = {
    spawned: [],
    promptTokens: 0,
    completionTokens: 0,
  };

  for (const request of requests) {
    const executionId = crypto.randomUUID();
    result.spawned.push(manifest.package.name);
    emit(options.onLifecycle, {
      id: executionId,
      displayName: manifest.agent.display_name,
      status: "started",
    });
    if (options.onLifecycle !== undefined) await Bun.sleep(50);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      manifest.execution.timeout_seconds * 1_000,
    );
    try {
      const backend = await resolveBackendForRequest(options.config, {
        preferredModels: manifest.model.preferred,
        ...(options.backendOverride === undefined
          ? {}
          : { backendOverride: options.backendOverride }),
        ...(options.fetchImpl === undefined
          ? {}
          : { fetchImpl: options.fetchImpl }),
      });
      const backendConfig = options.config.backends[backend.key];
      if (backendConfig === undefined) throw new Error("Backend unavailable");
      const response = await runPrompt({
        backend,
        backendConfig,
        messages: [
          { role: "system", content: manifest.agent.system_prompt },
          {
            role: "user",
            content: JSON.stringify({
              path: request.path,
              source: request.source,
            }),
          },
        ],
        ...(options.fetchImpl === undefined
          ? {}
          : { fetchImpl: options.fetchImpl }),
        ...(options.env === undefined ? {} : { env: options.env }),
        maxTokens: manifest.execution.max_tokens,
        signal: controller.signal,
      });
      result.promptTokens += response.usage.promptTokens;
      result.completionTokens += response.usage.completionTokens;
      const output = parseSastOutput(
        response.content,
        request.path,
        manifest.execution.max_findings,
      );
      await appendFindings(
        options.projectRoot,
        executionId,
        output.findings,
        options.config,
        options.env,
      );
      emit(options.onLifecycle, {
        id: executionId,
        displayName: manifest.agent.display_name,
        status: "succeeded",
      });
    } catch {
      emit(options.onLifecycle, {
        id: executionId,
        displayName: manifest.agent.display_name,
        status: "failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  return result;
}

function collectScanRequests(
  turn: AgentTurnResult,
  execution: ReturnType<typeof getSastManifest>["execution"],
  fileMatch: string,
): ScanRequest[] {
  const seen = new Set<string>();
  const requests: ScanRequest[] = [];
  for (const call of turn.toolCalls) {
    if (call.tool !== "file-writer" || !call.result.success) continue;
    if (!isFileWriterResultData(call.result.data)) continue;
    const path = safeRelativePath(call.result.data.path);
    const source = call.result.data.afterContent;
    if (path === undefined || source === null || seen.has(path)) continue;
    if (!matchesGlob(fileMatch, path)) continue;
    if (Buffer.byteLength(source, "utf8") > execution.max_source_bytes)
      continue;
    seen.add(path);
    requests.push({ path, source });
  }
  return requests;
}

function safeRelativePath(path: string): string | undefined {
  if (
    path.length === 0 ||
    path.length > 512 ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolute(path)
  ) {
    return undefined;
  }
  const normalized = normalize(path);
  if (
    normalized !== path ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    return undefined;
  }
  return normalized;
}

function emit(
  listener: ((event: SubAgentLifecycleEvent) => void) | undefined,
  event: SubAgentLifecycleEvent,
): void {
  try {
    listener?.(event);
  } catch {
    // UI observers cannot alter scan or parent-turn outcomes.
  }
}
