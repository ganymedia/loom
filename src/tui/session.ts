import type { FetchLike, ResolvedBackend } from "@loom/backends/discovery";
import { resolveBackendForRequest } from "@loom/backends/router";
import type { LoomConfig } from "@loom/config/schema";
import { fileReaderTool } from "@loom/tools/file-reader";
import { fileWriterTool } from "@loom/tools/file-writer";

export interface StartSessionOptions {
  backendOverride?: string;
  fetchImpl?: FetchLike;
  projectRoot?: string;
  smokeFilePath?: string;
  writeOutput?: (message: string) => void;
}

export interface SessionSmokeResult {
  backend?: ResolvedBackend;
  backendError?: string;
  fileWriteOk: boolean;
  fileReadOk: boolean;
  fileError?: string;
}

export async function runSessionSmoke(
  config: LoomConfig,
  options: StartSessionOptions = {},
): Promise<SessionSmokeResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const smokeFilePath = options.smokeFilePath ?? ".loom/session-smoke.txt";
  const result: SessionSmokeResult = {
    fileWriteOk: false,
    fileReadOk: false,
  };

  try {
    result.backend = await resolveBackendForRequest(config, {
      ...(options.backendOverride === undefined
        ? {}
        : { backendOverride: options.backendOverride }),
      ...(options.fetchImpl === undefined
        ? {}
        : { fetchImpl: options.fetchImpl }),
    });
  } catch (error) {
    result.backendError =
      error instanceof Error ? error.message : String(error);
  }

  const content = `LOOM session smoke file\nbackend=${result.backend?.key ?? "unresolved"}\n`;
  const writeResult = await fileWriterTool.execute({
    projectRoot,
    path: smokeFilePath,
    content,
  });

  result.fileWriteOk = writeResult.success;
  if (!writeResult.success) {
    result.fileError = writeResult.error ?? "file write failed";
    return result;
  }

  const readResult = await fileReaderTool.execute({
    projectRoot,
    path: smokeFilePath,
  });

  result.fileReadOk = readResult.success && readResult.output === content;
  if (!result.fileReadOk) {
    result.fileError = readResult.error ?? "file read verification failed";
  }

  return result;
}

export async function startSession(
  config: LoomConfig,
  options: StartSessionOptions = {},
): Promise<void> {
  const writeOutput =
    options.writeOutput ?? ((message: string) => process.stdout.write(message));
  const smoke = await runSessionSmoke(config, options);

  writeOutput("LOOM TUI placeholder started.\n");
  if (smoke.backend === undefined) {
    writeOutput(
      `Backend: unavailable (${smoke.backendError ?? "unknown error"})\n`,
    );
  } else {
    writeOutput(
      `Backend: ${smoke.backend.key} using discovered model ${smoke.backend.model}\n`,
    );
  }
  writeOutput(`File write: ${smoke.fileWriteOk ? "ok" : "failed"}\n`);
  writeOutput(`File read: ${smoke.fileReadOk ? "ok" : "failed"}\n`);
  if (smoke.fileError !== undefined) {
    writeOutput(`File error: ${smoke.fileError}\n`);
  }
}
