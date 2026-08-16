import { lstat, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

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

function operationFailed(message: string, error?: unknown): BridgeError {
  return new BridgeError("ASEPRITE_OPERATION_FAILED", message, {
    ...(error === undefined
      ? {}
      : { cause: error instanceof Error ? error.message : String(error) }),
  });
}

async function canonicalAllowedRoots(
  lexicalRoots: readonly string[],
): Promise<string[]> {
  const roots = await Promise.all(
    lexicalRoots.map(async (directory): Promise<string | undefined> => {
      try {
        return await realpath(directory);
      } catch {
        return undefined;
      }
    }),
  );
  return roots.filter((root): root is string => root !== undefined);
}

function lexicalAllowedRoots(
  absolutePath: string,
  allowedDirectories: readonly string[],
): string[] {
  return allowedDirectories
    .filter((directory) => isAbsolute(directory))
    .map((directory) => resolve(directory))
    .filter((directory) => isPathContained(directory, absolutePath));
}

export async function resolveAllowedExistingPath(
  requestedPath: string,
  allowedDirectories: readonly string[],
): Promise<string> {
  if (!isAbsolute(requestedPath)) throw pathNotAllowed(requestedPath);

  const absolutePath = resolve(requestedPath);
  const lexicalRoots = lexicalAllowedRoots(absolutePath, allowedDirectories);

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

  const canonicalRoots = await canonicalAllowedRoots(lexicalRoots);

  if (
    !canonicalRoots.some((directory) =>
      isPathContained(directory, canonicalPath),
    )
  ) {
    throw pathNotAllowed(requestedPath);
  }

  return canonicalPath;
}

export interface ResolvedOutputPath {
  readonly exists: boolean;
  readonly path: string;
}

export async function resolveAllowedOutputPath(
  requestedPath: string,
  allowedDirectories: readonly string[],
): Promise<ResolvedOutputPath> {
  if (!isAbsolute(requestedPath)) throw pathNotAllowed(requestedPath);

  const absolutePath = resolve(requestedPath);
  const lexicalRoots = lexicalAllowedRoots(absolutePath, allowedDirectories);
  if (lexicalRoots.length === 0) throw pathNotAllowed(requestedPath);

  const canonicalRoots = await canonicalAllowedRoots(lexicalRoots);
  let exists = false;
  try {
    await lstat(absolutePath);
    exists = true;
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw operationFailed(
        `The output path could not be inspected: ${requestedPath}`,
        error,
      );
    }
  }

  if (exists) {
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(absolutePath);
      if (!(await stat(canonicalPath)).isFile()) {
        throw operationFailed(
          `The output path is not a regular file: ${requestedPath}`,
        );
      }
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw operationFailed(
        `The output path could not be resolved: ${requestedPath}`,
        error,
      );
    }

    if (
      !canonicalRoots.some((directory) =>
        isPathContained(directory, canonicalPath),
      )
    ) {
      throw pathNotAllowed(requestedPath);
    }
    return { exists: true, path: canonicalPath };
  }

  let canonicalParent: string;
  try {
    canonicalParent = await realpath(dirname(absolutePath));
    if (!(await stat(canonicalParent)).isDirectory()) {
      throw operationFailed(
        `The output parent is not a directory: ${requestedPath}`,
      );
    }
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw operationFailed(
      `The output parent directory could not be resolved: ${requestedPath}`,
      error,
    );
  }

  const canonicalPath = join(canonicalParent, basename(absolutePath));
  if (
    !canonicalRoots.some((directory) =>
      isPathContained(directory, canonicalPath),
    )
  ) {
    throw pathNotAllowed(requestedPath);
  }
  return { exists: false, path: canonicalPath };
}
