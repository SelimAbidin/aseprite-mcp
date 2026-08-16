import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";
import {
  asepriteDocumentOutputSchema,
  documentText,
  parseAsepriteDocument,
  type AsepriteDocument,
} from "./document.js";

const colorSchema = z
  .string()
  .regex(
    /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i,
    "Background must use #RRGGBB or #RRGGBBAA format.",
  );

export function createSpriteInputSchema(maxSpriteDimension: number) {
  return z.object({
    background: colorSchema.optional().describe("Initial fill color."),
    height: z
      .number()
      .int()
      .min(1)
      .max(maxSpriteDimension)
      .describe(`Canvas height from 1 through ${maxSpriteDimension}.`),
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe("Optional initial document name; this does not save a file."),
    width: z
      .number()
      .int()
      .min(1)
      .max(maxSpriteDimension)
      .describe(`Canvas width from 1 through ${maxSpriteDimension}.`),
  });
}

export interface CreateSpriteInput {
  readonly background?: string | undefined;
  readonly height: number;
  readonly name?: string | undefined;
  readonly width: number;
}

export async function createAsepriteSprite(
  bridge: AsepriteBridge,
  maxSpriteDimension: number,
  input: CreateSpriteInput,
): Promise<AsepriteDocument> {
  const params = createSpriteInputSchema(maxSpriteDimension).parse(input);
  return parseAsepriteDocument(await bridge.request("create_sprite", params));
}

export function registerCreateSpriteTool(
  server: McpServer,
  bridge: AsepriteBridge,
  maxSpriteDimension: number,
): void {
  server.registerTool(
    "aseprite_create_sprite",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Create and activate a new unsaved RGB sprite with one frame and one editable image layer.",
      inputSchema: createSpriteInputSchema(maxSpriteDimension),
      outputSchema: asepriteDocumentOutputSchema,
      title: "Create an Aseprite sprite",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const document = await createAsepriteSprite(
          bridge,
          maxSpriteDimension,
          input,
        );
        return {
          content: [
            {
              text: `Created ${documentText(document)}`,
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
