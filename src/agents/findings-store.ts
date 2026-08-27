import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { SastFinding } from "@loom/agents/sast-contracts";
import { createConfigRedactor } from "@loom/config/redaction";
import type { LoomConfig } from "@loom/config/schema";
import { sanitizeTerminalText } from "@loom/tui/markdown";
import { z } from "zod";

export const FINDINGS_MAX_BYTES = 1_048_576;
export const FINDINGS_MAX_RECORDS = 500;
const FINDINGS_FILE = "findings.jsonl";
const LOCK_FILE = ".findings.lock";

export interface FindingRecord {
  timestamp: string;
  scanId: string;
  rule: string;
  severity: SastFinding["severity"];
  file: string;
  line?: number | undefined;
  cwe?: string | undefined;
  message: string;
  fixHint: string;
}

const findingRecordSchema = z
  .object({
    timestamp: z.string().datetime(),
    scanId: z.string().uuid(),
    rule: z.string().min(1).max(128),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    file: z.string().min(1).max(512),
    line: z.number().int().positive().optional(),
    cwe: z
      .string()
      .regex(/^CWE-[1-9][0-9]{0,5}$/)
      .optional(),
    message: z.string().min(1).max(500),
    fixHint: z.string().min(1).max(500),
  })
  .strict();

export async function appendFindings(
  projectRoot: string,
  scanId: string,
  findings: readonly SastFinding[],
  config: LoomConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (findings.length === 0) return;
  const loomDirectory = await safeLoomDirectory(projectRoot);
  const lockPath = join(loomDirectory, LOCK_FILE);
  const lock = await acquireLock(lockPath);
  try {
    const target = join(loomDirectory, FINDINGS_FILE);
    await rejectSymlink(target);
    const existing = await readRecords(target);
    const redact = createConfigRedactor(config, env);
    const timestamp = new Date().toISOString();
    const added = findings.map(
      (finding): FindingRecord =>
        findingRecordSchema.parse({
          timestamp,
          scanId,
          rule: safeText(finding.ruleId, redact),
          severity: finding.severity,
          file: safeText(finding.file, redact),
          ...(finding.line === undefined ? {} : { line: finding.line }),
          ...(finding.cwe === undefined
            ? {}
            : { cwe: safeText(finding.cwe, redact) }),
          message: safeText(finding.message, redact),
          fixHint: safeText(finding.fixHint, redact),
        }),
    );
    const records = [...existing, ...added].slice(-FINDINGS_MAX_RECORDS);
    let bytes = encodedBytes(records);
    while (bytes > FINDINGS_MAX_BYTES) {
      const removed = records.shift();
      if (removed === undefined) break;
      bytes -= encodedRecordBytes(removed);
    }
    await atomicWrite(target, records);
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

async function safeLoomDirectory(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot);
  const expected = join(root, ".loom");
  await mkdir(expected, { recursive: true, mode: 0o700 });
  if ((await realpath(expected)) !== expected) {
    throw new Error("Unable to persist SAST findings");
  }
  return expected;
}

async function acquireLock(
  path: string,
): Promise<Awaited<ReturnType<typeof open>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await open(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      await Bun.sleep(10);
    }
  }
  throw new Error("Unable to persist SAST findings");
}

async function rejectSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error("Unable to persist SAST findings");
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
}

async function readRecords(path: string): Promise<FindingRecord[]> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (stats.size > FINDINGS_MAX_BYTES) {
      throw new Error("Unable to persist SAST findings");
    }
    const content = await handle.readFile("utf8");
    if (content.length === 0) return [];
    return content
      .trimEnd()
      .split("\n")
      .map((line) => findingRecordSchema.parse(JSON.parse(line)));
  } catch {
    throw new Error("Unable to persist SAST findings");
  } finally {
    await handle.close();
  }
}

async function atomicWrite(
  target: string,
  records: readonly FindingRecord[],
): Promise<void> {
  const temporary = `${target}.tmp-${crypto.randomUUID()}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    await handle.chmod(0o600);
    await handle.writeFile(encode(records), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } finally {
    await handle?.close();
    await unlink(temporary).catch(() => undefined);
  }
}

function encode(records: readonly FindingRecord[]): string {
  return records.length === 0
    ? ""
    : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function encodedBytes(records: readonly FindingRecord[]): number {
  return Buffer.byteLength(encode(records), "utf8");
}

function encodedRecordBytes(record: FindingRecord): number {
  return Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
}

function safeText(value: string, redact: (text: string) => string): string {
  return sanitizeTerminalText(redact(value)).replace(/[\r\n\t]/g, " ");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
