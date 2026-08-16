import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";

export const addFrameInputSchema = z.object({
  content: z
    .enum(["empty", "duplicate-current"])
    .describe("Whether the new frame is empty or copies the active frame."),
  durationMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional duration for the new frame in milliseconds."),
});

export const addFrameOutputSchema = z.object({
  frameCount: z.number().int().positive(),
  frameNumber: z.number().int().positive(),
});

export interface AddFrameInput {
  readonly content: "duplicate-current" | "empty";
  readonly durationMs?: number | undefined;
}

export type AddFrameResult = z.infer<typeof addFrameOutputSchema>;

export function parseAddFrameResult(value: unknown): AddFrameResult {
  return addFrameOutputSchema.parse(value);
}

export async function addAsepriteFrame(
  bridge: AsepriteBridge,
  input: AddFrameInput,
): Promise<AddFrameResult> {
  const params = addFrameInputSchema.parse(input);
  return parseAddFrameResult(await bridge.request("add_frame", params));
}

export function registerAddFrameTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_add_frame",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Add and activate one empty or duplicated animation frame in the active Aseprite document as a single undoable operation.",
      inputSchema: addFrameInputSchema,
      outputSchema: addFrameOutputSchema,
      title: "Add an Aseprite frame",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await addAsepriteFrame(bridge, input);
        return {
          content: [
            {
              text: `Added and activated frame ${result.frameNumber}. The document now has ${result.frameCount} frame(s).`,
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
