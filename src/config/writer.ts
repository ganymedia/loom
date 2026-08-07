import { constants } from "node:fs";
import { open } from "node:fs/promises";

export interface PrivateConfigWriteOptions {
  exclusive?: boolean;
}

export async function writePrivateConfigFile(
  path: string,
  content: string,
  options: PrivateConfigWriteOptions = {},
): Promise<void> {
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_NOFOLLOW |
    (options.exclusive === true ? constants.O_EXCL : 0);
  const handle = await open(path, flags, 0o600);
  try {
    await handle.chmod(0o600);
    await handle.truncate(0);
    await handle.writeFile(content, { encoding: "utf8" });
  } finally {
    await handle.close();
  }
}

export async function enforcePrivateConfigPermissions(
  path: string,
): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

export async function readPrivateConfigFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.chmod(0o600);
    return await handle.readFile({ encoding: "utf8" });
  } finally {
    await handle.close();
  }
}
