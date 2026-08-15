import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";
import { bridgeClientSchema } from "../bridge/protocol.js";
import { SERVER_NAME, SERVER_VERSION } from "../constants.js";

const activeSpriteSchema = z.object({
  colorMode: z.string().min(1),
  filename: z.string().optional(),
  frameCount: z.number().int().positive(),
  height: z.number().int().positive(),
  id: z.number().int().nonnegative(),
  isModified: z.boolean(),
  name: z.string().min(1),
  width: z.number().int().positive(),
});

const asepriteRuntimeStatusSchema = z.object({
  activeSprite: activeSpriteSchema.optional(),
  apiVersion: z.number().int().nonnegative(),
  asepriteVersion: z.string().min(1),
});

export const asepriteStatusOutputSchema = z.object({
  aseprite: asepriteRuntimeStatusSchema.optional(),
  bridge: z.object({
    connected: z.boolean(),
    connectedAt: z.string().optional(),
  }),
  extension: bridgeClientSchema.optional(),
  server: z.object({
    name: z.string(),
    uptimeSeconds: z.number().int().nonnegative(),
    version: z.string(),
  }),
});

export type AsepriteStatus = z.infer<typeof asepriteStatusOutputSchema>;

export async function readAsepriteStatus(
  bridge: AsepriteBridge,
): Promise<AsepriteStatus> {
  const snapshot = bridge.snapshot();
  const baseStatus = {
    bridge: {
      connected: snapshot.connected,
      ...(snapshot.connectedAt === undefined
        ? {}
        : { connectedAt: snapshot.connectedAt }),
    },
    server: {
      name: SERVER_NAME,
      uptimeSeconds: Math.floor(process.uptime()),
      version: SERVER_VERSION,
    },
  };

  if (!snapshot.connected || snapshot.client === undefined) {
    return baseStatus;
  }

  const aseprite = asepriteRuntimeStatusSchema.parse(
    await bridge.request("get_status", {}),
  );

  return {
    ...baseStatus,
    aseprite,
    extension: snapshot.client,
  };
}

function statusText(status: AsepriteStatus): string {
  if (!status.bridge.connected) {
    return "Aseprite MCP is running, but the Aseprite extension is not connected.";
  }

  const sprite = status.aseprite?.activeSprite;
  const documentText =
    sprite === undefined
      ? "No sprite is currently open."
      : `Active sprite: ${sprite.name} (${sprite.width}x${sprite.height}, ${sprite.frameCount} frame(s)).`;

  return `Aseprite ${status.aseprite?.asepriteVersion ?? "unknown"} is connected. ${documentText}`;
}

export function registerStatusTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_status",
    {
      annotations: {
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Report whether Aseprite is connected and summarize its active sprite, if any.",
      outputSchema: asepriteStatusOutputSchema,
      title: "Aseprite connection status",
    },
    async (): Promise<CallToolResult> => {
      try {
        const status = await readAsepriteStatus(bridge);
        return {
          content: [{ text: statusText(status), type: "text" }],
          structuredContent: status,
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
