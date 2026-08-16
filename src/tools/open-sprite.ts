import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";
import { resolveAllowedExistingPath } from "../security/paths.js";
import {
  asepriteDocumentOutputSchema,
  documentText,
  parseAsepriteDocument,
  type AsepriteDocument,
} from "./document.js";

export const openSpriteInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Absolute path to an existing file under an allowed directory."),
});

export interface OpenSpriteInput {
  readonly path: string;
}

export async function openAsepriteSprite(
  bridge: AsepriteBridge,
  allowedDirectories: readonly string[],
  input: OpenSpriteInput,
): Promise<AsepriteDocument> {
  const params = openSpriteInputSchema.parse(input);
  const path = await resolveAllowedExistingPath(
    params.path,
    allowedDirectories,
  );
  return parseAsepriteDocument(await bridge.request("open_sprite", { path }));
}

export function registerOpenSpriteTool(
  server: McpServer,
  bridge: AsepriteBridge,
  allowedDirectories: readonly string[],
): void {
  server.registerTool(
    "aseprite_open_sprite",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Open and activate an existing image or Aseprite document from a configured allowed directory.",
      inputSchema: openSpriteInputSchema,
      outputSchema: asepriteDocumentOutputSchema,
      title: "Open an Aseprite sprite",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const document = await openAsepriteSprite(
          bridge,
          allowedDirectories,
          input,
        );
        return {
          content: [
            {
              text: `Opened ${documentText(document)}`,
              type: "text",
            },
          ],
          structuredContent: document,
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
