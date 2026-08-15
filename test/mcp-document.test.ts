import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteMcpServer } from "../src/mcp/create-mcp-server.js";
import { asepriteDocumentOutputSchema } from "../src/tools/document.js";
import { documentResult } from "./helpers/document-result.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

test("MCP clients can discover and call aseprite_get_document", async (context) => {
  const bridge = new AsepriteBridge({
    requestTimeoutMs: 100,
    token: undefined,
  });
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());

  const server = createAsepriteMcpServer({ bridge });
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
  const documentTool = tools.tools.find(
    (tool) => tool.name === "aseprite_get_document",
  );
  assert.deepEqual(documentTool?.annotations, {
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  });

  const resultPromise = client.callTool({
    arguments: {},
    name: "aseprite_get_document",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: documentResult(),
    type: "response",
  });

  const result = await resultPromise;
  assert.equal(result.isError, undefined);
  const document = asepriteDocumentOutputSchema.parse(result.structuredContent);
  assert.equal(document.filename, "/sprites/hero.aseprite");
  assert.equal(document.activeLayer?.name, "Ink");

  const noSpriteResultPromise = client.callTool({
    arguments: {},
    name: "aseprite_get_document",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const noSpriteRequest = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    error: {
      code: "NO_ACTIVE_SPRITE",
      message: "Open or create a sprite first.",
    },
    id: noSpriteRequest.id,
    ok: false,
    protocolVersion: 1,
    type: "response",
  });

  const noSpriteResult = await noSpriteResultPromise;
  assert.equal(noSpriteResult.isError, true);
  assert.deepEqual(noSpriteResult.content, [
    {
      text: "NO_ACTIVE_SPRITE: Open or create a sprite first.",
      type: "text",
    },
  ]);
});
