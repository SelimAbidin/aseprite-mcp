import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteMcpServer } from "../src/mcp/create-mcp-server.js";
import { asepriteDocumentOutputSchema } from "../src/tools/document.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

test("MCP clients can discover and call aseprite_create_sprite", async (context) => {
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
    maxSpriteDimension: 128,
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
  const createTool = tools.tools.find(
    (tool) => tool.name === "aseprite_create_sprite",
  );
  assert.deepEqual(createTool?.annotations, {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
  });
  const widthSchema = createTool?.inputSchema.properties?.width as
    { maximum?: unknown } | undefined;
  assert.equal(widthSchema?.maximum, 128);

  const resultPromise = client.callTool({
    arguments: {
      background: "#ff8800",
      height: 16,
      name: "icon",
      width: 32,
    },
    name: "aseprite_create_sprite",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "create_sprite");

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: {
      activeFrameNumber: 1,
      activeLayer: { name: "Layer 1", path: [1], type: "image" },
      colorMode: "rgb",
      filename: "icon",
      frameCount: 1,
      height: 16,
      id: 24,
      isModified: true,
      layers: [
        {
          editable: true,
          name: "Layer 1",
          opacity: 255,
          type: "image",
          visible: true,
        },
      ],
      slices: [],
      tags: [],
      width: 32,
    },
    type: "response",
  });

  const result = await resultPromise;
  assert.equal(result.isError, undefined);
  const document = asepriteDocumentOutputSchema.parse(result.structuredContent);
  assert.equal(document.filename, "icon");
  assert.equal(document.width, 32);
  assert.equal(document.layers[0]?.type, "image");
});
