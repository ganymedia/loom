import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSafetyError";
  }
}

function isWithinRoot(projectRoot: string, targetPath: string): boolean {
  const relativePath = relative(projectRoot, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

export async function resolveReadablePath(
  projectRoot: string,
  requestedPath: string,
): Promise<string> {
  const root = await realpath(projectRoot);
  const candidate = resolve(root, requestedPath);
  const target = await realpath(candidate);

  if (!isWithinRoot(root, target)) {
    throw new PathSafetyError(`Path "${requestedPath}" escapes project root`);
  }

  return target;
}

export async function resolveWritablePath(
  projectRoot: string,
  requestedPath: string,
): Promise<string> {
  const root = await realpath(projectRoot);
  const candidate = resolve(root, requestedPath);
  const parent = await realpath(dirname(candidate));

  if (!isWithinRoot(root, parent) || !isWithinRoot(root, candidate)) {
    throw new PathSafetyError(`Path "${requestedPath}" escapes project root`);
  }

  try {
    if ((await lstat(candidate)).isSymbolicLink()) {
      throw new PathSafetyError(
        `Path "${requestedPath}" must not be a symbolic link`,
      );
    }
  } catch (error) {
    if (error instanceof PathSafetyError) throw error;
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }

  return candidate;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function writeUtf8FileNoFollow(
  targetPath: string,
  content: string,
): Promise<void> {
  const handle = await open(
    targetPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o666,
  );
  try {
    await handle.writeFile(content, { encoding: "utf8" });
  } finally {
    await handle.close();
  }
}
