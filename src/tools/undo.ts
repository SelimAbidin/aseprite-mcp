import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";

export const undoInputSchema = z.object({});

export const undoOutputSchema = z.object({
  canRedo: z.boolean(),
  canUndo: z.boolean(),
});

export type UndoResult = z.infer<typeof undoOutputSchema>;

export function parseUndoResult(value: unknown): UndoResult {
  return undoOutputSchema.parse(value);
}

export async function undoAsepriteOperation(
  bridge: AsepriteBridge,
): Promise<UndoResult> {
  return parseUndoResult(await bridge.request("undo", {}));
}

export function registerUndoTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_undo",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Undo exactly one operation in the active Aseprite document and report the updated undo and redo availability.",
      inputSchema: undoInputSchema,
      outputSchema: undoOutputSchema,
      title: "Undo an Aseprite operation",
    },
    async (): Promise<CallToolResult> => {
      try {
        const result = await undoAsepriteOperation(bridge);
        return {
          content: [
            {
              text: `Undid one operation. Undo is ${result.canUndo ? "available" : "unavailable"}; redo is ${result.canRedo ? "available" : "unavailable"}.`,
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
