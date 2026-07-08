import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ToolDefinition, ToolResult } from "@loom/tools/base";
import { z } from "zod";

const ALLOWED_GIT_COMMANDS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "branch",
  "rev-parse",
  "ls-files",
]);
const MAX_OUTPUT_SIZE = 1_000_000;
const DEFAULT_TIMEOUT = 30_000;

export const gitOpsArgsSchema = z.object({
  projectRoot: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeout: z.number().int().positive().max(60_000).optional(),
  maxOutput: z.number().int().positive().max(10_000_000).optional(),
});

export type GitOpsArgs = z.infer<typeof gitOpsArgsSchema>;

export class GitOpsToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitOpsToolError";
  }
}

function isGitCommandAllowed(command: string): boolean {
  return ALLOWED_GIT_COMMANDS.has(command);
}

function isSafeArg(arg: string): boolean {
  if (arg.includes("\0")) return false;
  if (arg.startsWith("/")) return false;
  if (arg.split("/").includes("..")) return false;
  return true;
}

function validateArgs(args: string[]): string | undefined {
  const unsafeArg = args.find((arg) => !isSafeArg(arg));
  return unsafeArg === undefined
    ? undefined
    : `Git argument "${unsafeArg}" is not permitted`;
}

async function runGit(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  maxOutput: number,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child: ChildProcessWithoutNullStreams = spawn(
      "git",
      [command, ...args],
      { cwd, stdio: "pipe" },
    );
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        success: false,
        output: "",
        error: `Git command timed out after ${timeout}ms`,
      });
    }, timeout);

    let settled = false;
    let stdout = "";
    let stderr = "";

    const settle = (result: ToolResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maxOutput) {
        child.kill("SIGTERM");
        settle({
          success: false,
          output: "",
          error: `Git command output exceeded maxOutput (${maxOutput})`,
        });
      }
      return next;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      settle({ success: false, output: "", error: error.message });
    });
    child.on("close", (code) => {
      settle({
        success: code === 0,
        output: code === 0 ? stdout : "",
        ...(code === 0
          ? {}
          : { error: `Git command failed with exit code ${code}: ${stderr}` }),
        data: { command, args, exitCode: code },
      });
    });
  });
}

export const gitOpsTool: ToolDefinition<GitOpsArgs> = {
  name: "git-ops",
  description: "Execute read-only git operations within the project root",
  argsSchema: gitOpsArgsSchema,
  async execute(args: GitOpsArgs): Promise<ToolResult> {
    try {
      const parsed = gitOpsArgsSchema.parse(args);
      const commandArgs = parsed.args ?? [];
      const timeout = parsed.timeout ?? DEFAULT_TIMEOUT;
      const maxOutput = parsed.maxOutput ?? MAX_OUTPUT_SIZE;

      if (!isGitCommandAllowed(parsed.command)) {
        return {
          success: false,
          output: "",
          error: `Git command "${parsed.command}" is not allowed`,
        };
      }

      const argsError = validateArgs(commandArgs);
      if (argsError !== undefined) {
        return { success: false, output: "", error: argsError };
      }

      return await runGit(
        parsed.command,
        commandArgs,
        parsed.projectRoot,
        timeout,
        maxOutput,
      );
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
