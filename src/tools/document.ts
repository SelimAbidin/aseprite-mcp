import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { BridgeError } from "../bridge/errors.js";

const layerTypeSchema = z.enum([
  "background",
  "group",
  "image",
  "reference",
  "tilemap",
  "unknown",
]);

export interface AsepriteDocumentLayer {
  readonly children?: readonly AsepriteDocumentLayer[] | undefined;
  readonly editable: boolean;
  readonly name: string;
  readonly opacity?: number | undefined;
  readonly type: z.infer<typeof layerTypeSchema>;
  readonly visible: boolean;
}

export const asepriteDocumentLayerSchema: z.ZodType<AsepriteDocumentLayer> =
  z.object({
    children: z.lazy(() => z.array(asepriteDocumentLayerSchema)).optional(),
    editable: z.boolean(),
    name: z.string(),
    opacity: z.number().int().min(0).max(255).optional(),
    type: layerTypeSchema,
    visible: z.boolean(),
  });

const rectangleSchema = z.object({
  height: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  x: z.number().int(),
  y: z.number().int(),
});

const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

export const asepriteDocumentOutputSchema = z.object({
  activeFrameNumber: z.number().int().positive(),
  activeLayer: z
    .object({
      name: z.string(),
      path: z.array(z.number().int().positive()).min(1),
      type: layerTypeSchema,
    })
    .optional(),
  colorMode: z.string().min(1),
  filename: z.string().min(1).optional(),
  frameCount: z.number().int().positive(),
  height: z.number().int().positive(),
  id: z.number().int().nonnegative(),
  isModified: z.boolean(),
  layers: z.array(asepriteDocumentLayerSchema),
  slices: z.array(
    z.object({
      bounds: rectangleSchema,
      center: rectangleSchema.optional(),
      name: z.string(),
      pivot: pointSchema.optional(),
    }),
  ),
  tags: z.array(
    z.object({
      direction: z.string().min(1),
      fromFrame: z.number().int().positive(),
      name: z.string(),
      repeatCount: z.number().int().nonnegative().optional(),
      toFrame: z.number().int().positive(),
    }),
  ),
  width: z.number().int().positive(),
});

export type AsepriteDocument = z.infer<typeof asepriteDocumentOutputSchema>;

function normalizeLayerArrays(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const layer = value as Record<string, unknown>;
  if (layer.children === null) return { ...layer, children: [] };
  if (!Array.isArray(layer.children)) return layer;

  return {
    ...layer,
    children: layer.children.map(normalizeLayerArrays),
  };
}

function normalizeAsepriteEmptyArrays(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const document = value as Record<string, unknown>;
  const normalizeArray = (
    arrayValue: unknown,
    mapItem: (item: unknown) => unknown = (item) => item,
  ): unknown => {
    if (arrayValue === null) return [];
    return Array.isArray(arrayValue) ? arrayValue.map(mapItem) : arrayValue;
  };

  return {
    ...document,
    layers: normalizeArray(document.layers, normalizeLayerArrays),
    slices: normalizeArray(document.slices),
    tags: normalizeArray(document.tags),
  };
}

export async function readAsepriteDocument(
  bridge: AsepriteBridge,
): Promise<AsepriteDocument> {
  return asepriteDocumentOutputSchema.parse(
    normalizeAsepriteEmptyArrays(await bridge.request("get_document", {})),
  );
}

function documentText(document: AsepriteDocument): string {
  const filename = document.filename ?? "Untitled";
  const activeLayer =
    document.activeLayer === undefined
      ? "No layer is active."
      : `Active layer: ${document.activeLayer.name}.`;

  return `${filename}: ${document.width}x${document.height}, ${document.frameCount} frame(s), ${document.layers.length} top-level layer(s). Active frame: ${document.activeFrameNumber}. ${activeLayer}`;
}

export function registerDocumentTool(
  server: McpServer,
  bridge: AsepriteBridge,
): void {
  server.registerTool(
    "aseprite_get_document",
    {
      annotations: {
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Inspect the active Aseprite document, including ordered layer hierarchy, frames, tags, and slices without returning pixel data.",
      outputSchema: asepriteDocumentOutputSchema,
      title: "Inspect active Aseprite document",
    },
    async (): Promise<CallToolResult> => {
      try {
        const document = await readAsepriteDocument(bridge);
        return {
          content: [{ text: documentText(document), type: "text" }],
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
