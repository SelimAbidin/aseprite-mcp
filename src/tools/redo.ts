import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";

export const redoInputSchema = z.object({});

export const redoOutputSchema = z.object({
  canRedo: z.boolean(),
  canUndo: z.boolean(),
});

export type RedoResult = z.infer<typeof redoOutputSchema>;

export function parseRedoResult(value: unknown): RedoResult {
  return redoOutputSchema.parse(value);
}

export async function redoAsepriteOperation(
  bridge: AsepriteBridge,
): Promise<RedoResult> {
  return parseRedoResult(await bridge.request("redo", {}));
}

export function registerRedoTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_redo",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Redo exactly one operation in the active Aseprite document and report the updated undo and redo availability.",
      inputSchema: redoInputSchema,
      outputSchema: redoOutputSchema,
      title: "Redo an Aseprite operation",
    },
    async (): Promise<CallToolResult> => {
      try {
        const result = await redoAsepriteOperation(bridge);
        return {
          content: [
            {
              text: `Redid one operation. Undo is ${result.canUndo ? "available" : "unavailable"}; redo is ${result.canRedo ? "available" : "unavailable"}.`,
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
