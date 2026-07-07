import { realpath } from "node:fs/promises";
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

  return candidate;
}
