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

export const addLayerInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Name for the new image layer."),
});

export const addedLayerOutputSchema = z.object({
  editable: z.boolean(),
  name: z.string().min(1),
  opacity: z.number().int().min(0).max(255).optional(),
  path: z.array(z.number().int().positive()).min(1),
  type: z.literal("image"),
  visible: z.boolean(),
});

export const addLayerOutputSchema = z.object({
  document: asepriteDocumentOutputSchema,
  layer: addedLayerOutputSchema,
});

export interface AddLayerInput {
  readonly name: string;
}

export interface AddLayerResult {
  readonly document: AsepriteDocument;
  readonly layer: z.infer<typeof addedLayerOutputSchema>;
}

export function parseAddLayerResult(value: unknown): AddLayerResult {
  const result = z
    .object({
      document: z.unknown(),
      layer: addedLayerOutputSchema,
    })
    .parse(value);

  return {
    document: parseAsepriteDocument(result.document),
    layer: result.layer,
  };
}

export async function addAsepriteLayer(
  bridge: AsepriteBridge,
  input: AddLayerInput,
): Promise<AddLayerResult> {
  const params = addLayerInputSchema.parse(input);
  return parseAddLayerResult(await bridge.request("add_layer", params));
}

export function registerAddLayerTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_add_layer",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Add and activate one regular image layer in the active Aseprite document as a single undoable operation.",
      inputSchema: addLayerInputSchema,
      outputSchema: addLayerOutputSchema,
      title: "Add an Aseprite layer",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await addAsepriteLayer(bridge, input);
        return {
          content: [
            {
              text: `Added layer "${result.layer.name}". ${documentText(result.document)}`,
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
