import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";

export const MAX_DRAW_PIXELS = 4096;

const pixelColorSchema = z
  .string()
  .regex(
    /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i,
    "Pixel colors must use #RRGGBB or #RRGGBBAA format.",
  );

export const drawPixelsInputSchema = z.object({
  frameNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("One-based target frame number; defaults to the active frame."),
  layerPath: z
    .array(z.number().int().positive())
    .min(1)
    .max(32)
    .optional()
    .describe(
      "One-based layer hierarchy path from aseprite_get_document; defaults to the active layer.",
    ),
  pixels: z
    .array(
      z.object({
        color: pixelColorSchema,
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(MAX_DRAW_PIXELS)
    .describe(
      `One through ${MAX_DRAW_PIXELS} RGB canvas pixels to draw as one undoable operation.`,
    ),
});

export const drawPixelsOutputSchema = z.object({
  changedPixelCount: z.number().int().positive(),
  frameNumber: z.number().int().positive(),
  layer: z.object({
    name: z.string(),
    path: z.array(z.number().int().positive()).min(1),
  }),
});

export type DrawPixelsInput = z.input<typeof drawPixelsInputSchema>;
export type DrawPixelsResult = z.infer<typeof drawPixelsOutputSchema>;

export function parseDrawPixelsResult(value: unknown): DrawPixelsResult {
  return drawPixelsOutputSchema.parse(value);
}

export async function drawAsepritePixels(
  bridge: AsepriteBridge,
  input: DrawPixelsInput,
): Promise<DrawPixelsResult> {
  const params = drawPixelsInputSchema.parse(input);
  return parseDrawPixelsResult(await bridge.request("draw_pixels", params));
}

export function registerDrawPixelsTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_draw_pixels",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Draw a bounded batch of RGB pixels on a target Aseprite layer and frame as one undoable operation, creating the cel when needed.",
      inputSchema: drawPixelsInputSchema,
      outputSchema: drawPixelsOutputSchema,
      title: "Draw pixels in Aseprite",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await drawAsepritePixels(bridge, input);
        return {
          content: [
            {
              text: `Drew ${result.changedPixelCount} pixel(s) on layer ${result.layer.name} at frame ${result.frameNumber}.`,
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
