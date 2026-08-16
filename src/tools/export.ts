import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";
import { resolveAllowedOutputPath } from "../security/paths.js";
import { readAsepriteDocument } from "./document.js";

export const exportInputSchema = z.object({
  overwrite: z
    .boolean()
    .default(false)
    .describe("Allow replacing an existing output file."),
  path: z
    .string()
    .min(1)
    .regex(
      /\.[^./\\]+$/,
      "The export path must include a file extension that selects the format.",
    )
    .describe("Absolute output path under an allowed directory."),
});

export const exportOutputSchema = z.object({
  format: z.string().min(1),
  path: z.string().min(1),
});

export interface ExportInput {
  readonly overwrite?: boolean | undefined;
  readonly path: string;
}

export type ExportResult = z.infer<typeof exportOutputSchema>;

export async function exportAsepriteSprite(
  bridge: AsepriteBridge,
  allowedDirectories: readonly string[],
  input: ExportInput,
): Promise<ExportResult> {
  const params = exportInputSchema.parse(input);
  const output = await resolveAllowedOutputPath(
    params.path,
    allowedDirectories,
  );
  if (output.exists && !params.overwrite) {
    throw new BridgeError(
      "FILE_EXISTS",
      `The output file already exists; set overwrite to true to replace it: ${params.path}`,
    );
  }

  const document = await readAsepriteDocument(bridge);
  return exportOutputSchema.parse(
    await bridge.request("export_sprite", {
      overwrite: params.overwrite,
      path: output.path,
      spriteId: document.id,
    }),
  );
}

export function registerExportTool(
  server: McpServer,
  bridge: AsepriteBridge,
  allowedDirectories: readonly string[],
): void {
  server.registerTool(
    "aseprite_export",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Export a copy of the active sprite to an allowed path without changing the document's associated filename.",
      inputSchema: exportInputSchema,
      outputSchema: exportOutputSchema,
      title: "Export a copy of the active Aseprite sprite",
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await exportAsepriteSprite(
          bridge,
          allowedDirectories,
          input,
        );
        return {
          content: [
            {
              text: `Exported ${result.format.toUpperCase()} copy to ${result.path}.`,
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
