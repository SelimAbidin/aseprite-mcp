import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { BridgeError } from "../bridge/errors.js";

function isPathContained(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

function pathNotAllowed(path: string): BridgeError {
  return new BridgeError(
    "PATH_NOT_ALLOWED",
    `The path is outside the configured allowed directories: ${path}`,
  );
}

export async function resolveAllowedExistingPath(
  requestedPath: string,
  allowedDirectories: readonly string[],
): Promise<string> {
  if (!isAbsolute(requestedPath)) throw pathNotAllowed(requestedPath);

  const absolutePath = resolve(requestedPath);
  const lexicalRoots = allowedDirectories
    .filter((directory) => isAbsolute(directory))
    .map((directory) => resolve(directory))
    .filter((directory) => isPathContained(directory, absolutePath));

  if (lexicalRoots.length === 0) throw pathNotAllowed(requestedPath);

  let canonicalPath: string;
  try {
    canonicalPath = await realpath(absolutePath);
  } catch (error) {
    throw new BridgeError(
      "ASEPRITE_OPERATION_FAILED",
      `The requested file could not be resolved: ${requestedPath}`,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  const canonicalRoots = await Promise.all(
    lexicalRoots.map(async (directory): Promise<string | undefined> => {
      try {
        return await realpath(directory);
      } catch {
        return undefined;
      }
    }),
  );

  if (
    !canonicalRoots.some(
      (directory) =>
        directory !== undefined && isPathContained(directory, canonicalPath),
    )
  ) {
    throw pathNotAllowed(requestedPath);
  }

  return canonicalPath;
}
