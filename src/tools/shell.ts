import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute } from "node:path";
import type { ToolDefinition, ToolResult } from "@loom/tools/base";
import { resolveReadablePath } from "@loom/tools/path-safety";
import { z } from "zod";

const ALLOWED_COMMANDS = new Set(["pwd", "ls", "cat", "grep", "wc"]);
const MAX_OUTPUT_SIZE = 1_000_000;
const DEFAULT_TIMEOUT = 30_000;

export const shellArgsSchema = z.object({
  projectRoot: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeout: z.number().int().positive().max(60_000).optional(),
  maxOutput: z.number().int().positive().max(10_000_000).optional(),
});

export type ShellArgs = z.infer<typeof shellArgsSchema>;

export class ShellToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellToolError";
  }
}

function baseCommand(command: string): string | undefined {
  return command.split("/").pop();
}

function isCommandAllowed(command: string): boolean {
  const base = baseCommand(command);
  return base !== undefined && ALLOWED_COMMANDS.has(base);
}

async function resolvePathArgs(
  projectRoot: string,
  args: string[],
): Promise<string[]> {
  const resolved: string[] = [];
  for (const arg of args) {
    if (arg.includes("\0") || arg.startsWith("-") || isAbsolute(arg)) {
      throw new ShellToolError(`Shell argument "${arg}" is not permitted`);
    }
    try {
      resolved.push(await resolveReadablePath(projectRoot, arg));
    } catch {
      throw new ShellToolError(`Shell argument "${arg}" is not permitted`);
    }
  }
  return resolved;
}

async function prepareCommandArgs(
  command: string,
  args: string[],
  projectRoot: string,
): Promise<string[]> {
  if (command === "pwd") {
    if (args.length !== 0) {
      throw new ShellToolError("pwd does not accept arguments");
    }
    return [];
  }

  if (command === "grep") {
    const [pattern, ...paths] = args;
    if (pattern === undefined || pattern.includes("\0") || paths.length === 0) {
      throw new ShellToolError("grep requires a pattern and at least one file");
    }
    return ["--", pattern, ...(await resolvePathArgs(projectRoot, paths))];
  }

  if (command === "cat" && args.length === 0) {
    throw new ShellToolError("cat requires at least one file");
  }

  return ["--", ...(await resolvePathArgs(projectRoot, args))];
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  maxOutput: number,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child: ChildProcessWithoutNullStreams = spawn(command, args, {
      cwd,
      stdio: "pipe",
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        success: false,
        output: "",
        error: `Command timed out after ${timeout}ms`,
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
          error: `Command output exceeded maxOutput (${maxOutput})`,
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
          : { error: `Command failed with exit code ${code}: ${stderr}` }),
        data: { command, args, exitCode: code },
      });
    });
  });
}

export const shellTool: ToolDefinition<ShellArgs> = {
  name: "shell",
  description: "Execute a read-only shell command within the project root",
  argsSchema: shellArgsSchema,
  async execute(args: ShellArgs): Promise<ToolResult> {
    try {
      const parsed = shellArgsSchema.parse(args);
      const command = baseCommand(parsed.command);
      const commandArgs = parsed.args ?? [];
      const timeout = parsed.timeout ?? DEFAULT_TIMEOUT;
      const maxOutput = parsed.maxOutput ?? MAX_OUTPUT_SIZE;

      if (command === undefined || !isCommandAllowed(parsed.command)) {
        return {
          success: false,
          output: "",
          error: `Command "${parsed.command}" is not allowed`,
        };
      }

      const preparedArgs = await prepareCommandArgs(
        command,
        commandArgs,
        parsed.projectRoot,
      );

      return await runCommand(
        command,
        preparedArgs,
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
