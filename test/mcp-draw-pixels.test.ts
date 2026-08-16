import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteMcpServer } from "../src/mcp/create-mcp-server.js";
import { drawPixelsOutputSchema } from "../src/tools/draw-pixels.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

test("MCP clients can discover and call aseprite_draw_pixels", async (context) => {
  const bridge = new AsepriteBridge({
    requestTimeoutMs: 100,
    token: undefined,
  });
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());

  const server = createAsepriteMcpServer({
    allowedDirectories: [],
    bridge,
    maxSpriteDimension: 4096,
  });
  const client = new Client({ name: "aseprite-mcp-test", version: "0.1.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  context.after(async () => {
    await client.close();
    await server.close();
    bridge.close();
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const drawPixelsTool = tools.tools.find(
    (tool) => tool.name === "aseprite_draw_pixels",
  );
  assert.deepEqual(drawPixelsTool?.annotations, {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
  });
  const pixelsSchema = drawPixelsTool?.inputSchema.properties?.pixels as
    { maxItems?: unknown } | undefined;
  assert.equal(pixelsSchema?.maxItems, 4096);

  const resultPromise = client.callTool({
    arguments: {
      frameNumber: 2,
      layerPath: [1],
      pixels: [{ color: "#abcdef", x: 7, y: 8 }],
    },
    name: "aseprite_draw_pixels",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "draw_pixels");

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: {
      changedPixelCount: 1,
      frameNumber: 2,
      layer: { name: "Colors", path: [1] },
    },
    type: "response",
  });

  const result = await resultPromise;
  assert.equal(result.isError, undefined);
  assert.deepEqual(drawPixelsOutputSchema.parse(result.structuredContent), {
    changedPixelCount: 1,
    frameNumber: 2,
    layer: { name: "Colors", path: [1] },
  });

  const outOfBoundsPromise = client.callTool({
    arguments: {
      pixels: [{ color: "#ffffff", x: 32, y: 0 }],
    },
    name: "aseprite_draw_pixels",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const outOfBoundsRequest = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    error: {
      code: "OUT_OF_BOUNDS",
      message: "Pixel coordinates must be inside the sprite canvas.",
    },
    id: outOfBoundsRequest.id,
    ok: false,
    protocolVersion: 1,
    type: "response",
  });

  const outOfBoundsResult = await outOfBoundsPromise;
  assert.equal(outOfBoundsResult.isError, true);
  assert.deepEqual(outOfBoundsResult.content, [
    {
      text: "OUT_OF_BOUNDS: Pixel coordinates must be inside the sprite canvas.",
      type: "text",
    },
  ]);
});
