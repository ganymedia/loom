import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface HandoffDocument {
  goalStatus: string;
  completedWork: string;
  failedAttempts: string;
  branchName: string;
  nextAction: string;
}

export interface NarrativeEntry {
  title: string;
  body: string;
  date?: string;
}

const HANDOFF_TITLE = "# LOOM Session Handoff";
const HANDOFF_FIELDS = [
  ["goalStatus", "Goal & status"],
  ["completedWork", "Completed work"],
  ["failedAttempts", "Failed attempts"],
  ["branchName", "Branch name"],
  ["nextAction", "Next action"],
] as const;

export function handoffPath(projectRoot: string): string {
  return join(projectRoot, ".loom", "handoff.md");
}

export function narrativePath(projectRoot: string): string {
  return join(projectRoot, ".loom", "narrative.md");
}

export function formatHandoff(document: HandoffDocument): string {
  return `${HANDOFF_TITLE}\n\n${HANDOFF_FIELDS.map(
    ([key, label]) => `- **${label}** — ${document[key]}`,
  ).join("\n")}\n`;
}

export function parseHandoff(content: string): HandoffDocument {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== HANDOFF_TITLE) {
    throw new Error("Handoff document is missing the LOOM handoff title");
  }

  const parsed: Partial<HandoffDocument> = {};
  for (const [key, label] of HANDOFF_FIELDS) {
    const prefix = `- **${label}** — `;
    const line = lines.find((candidate) => candidate.startsWith(prefix));
    if (line === undefined) {
      throw new Error(`Handoff document is missing required field "${label}"`);
    }
    const value = line.slice(prefix.length).trim();
    if (value.length === 0) {
      throw new Error(`Handoff document field "${label}" must not be empty`);
    }
    parsed[key] = value;
  }

  return parsed as HandoffDocument;
}

export async function readHandoff(
  projectRoot: string,
): Promise<HandoffDocument | undefined> {
  try {
    return parseHandoff(await readFile(handoffPath(projectRoot), "utf8"));
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

export async function writeHandoff(
  projectRoot: string,
  document: HandoffDocument,
): Promise<void> {
  const path = handoffPath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, formatHandoff(document), "utf8");
}

export function formatNarrativeEntry(entry: NarrativeEntry): string {
  const date = entry.date ?? new Date().toISOString().slice(0, 10);
  const body = entry.body.trim();
  if (entry.title.trim().length === 0) {
    throw new Error("Narrative entry title must not be empty");
  }
  if (body.length === 0) {
    throw new Error("Narrative entry body must not be empty");
  }
  return `\n## ${date} — ${entry.title.trim()}\n\n${body}\n`;
}

export async function appendNarrativeEntry(
  projectRoot: string,
  entry: NarrativeEntry,
): Promise<void> {
  const path = narrativePath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, formatNarrativeEntry(entry), {
    encoding: "utf8",
    flag: "a",
  });
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
