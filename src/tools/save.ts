import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { isAbsolute } from "node:path";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";
import {
  resolveAllowedExistingPath,
  resolveAllowedOutputPath,
} from "../security/paths.js";
import { readAsepriteDocument } from "./document.js";

export const saveInputSchema = z.object({
  overwrite: z
    .boolean()
    .default(false)
    .describe("Allow replacing an existing file at a new target path."),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Absolute output path under an allowed directory. Required for an unsaved sprite.",
    ),
});

export const saveOutputSchema = z.object({
  filename: z.string().min(1),
  isModified: z.boolean(),
});

export interface SaveInput {
  readonly overwrite?: boolean | undefined;
  readonly path?: string | undefined;
}

export type SaveResult = z.infer<typeof saveOutputSchema>;

function fileExists(path: string): BridgeError {
  return new BridgeError(
    "FILE_EXISTS",
    `The output file already exists; set overwrite to true to replace it: ${path}`,
  );
}

export async function saveAsepriteSprite(
  bridge: AsepriteBridge,
  allowedDirectories: readonly string[],
  input: SaveInput,
): Promise<SaveResult> {
  const params = saveInputSchema.parse(input);
  const requestedOutput =
    params.path === undefined
      ? undefined
      : await resolveAllowedOutputPath(params.path, allowedDirectories);
  const document = await readAsepriteDocument(bridge);

  let path: string;
  let allowExistingTarget = params.overwrite;
  if (params.path === undefined) {
    if (document.filename === undefined || !isAbsolute(document.filename)) {
      throw new BridgeError(
        "INVALID_REQUEST",
        "path is required because the active sprite has no associated file.",
      );
    }
    path = (
      await resolveAllowedOutputPath(document.filename, allowedDirectories)
    ).path;
    allowExistingTarget = true;
  } else {
    const output = requestedOutput;
    if (output === undefined) {
      throw new Error("The validated output path is unexpectedly missing.");
    }
    path = output.path;

    if (output.exists && !allowExistingTarget) {
      let associatedPath: string | undefined;
      if (document.filename !== undefined) {
        try {
          associatedPath = await resolveAllowedExistingPath(
            document.filename,
            allowedDirectories,
          );
        } catch {
          associatedPath = undefined;
        }
      }

      if (associatedPath !== path) throw fileExists(params.path);
      allowExistingTarget = true;
    }
  }

  return saveOutputSchema.parse(
    await bridge.request("save_sprite", {
      overwrite: allowExistingTarget,
      path,
      spriteId: document.id,
    }),
  );
}

export function registerSaveTool(
  server: McpServer,
  bridge: AsepriteBridge,
  allowedDirectories: readonly string[],
): void {
  server.registerTool(
    "aseprite_save",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Save the active sprite to its associated file or to an allowed path, optionally replacing an existing target.",
      inputSchema: saveInputSchema,
      outputSchema: saveOutputSchema,
      title: "Save the active Aseprite sprite",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await saveAsepriteSprite(
          bridge,
          allowedDirectories,
          input,
        );
        return {
          content: [
            {
              text: `Saved ${result.filename}. The document is ${result.isModified ? "still modified" : "not modified"}.`,
              type: "text",
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        const message =
          error instanceof BridgeError
            ? `${error.code}: ${error.message}`
            : error instanceof Error
              ? error.message
              : String(error);

        return {
          content: [{ text: message, type: "text" }],
          isError: true,
        };
      }
    },
  );
}
