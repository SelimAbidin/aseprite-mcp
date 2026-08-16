import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteMcpServer } from "../src/mcp/create-mcp-server.js";
import { redoOutputSchema } from "../src/tools/redo.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

test("MCP clients can discover and call aseprite_redo", async (context) => {
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
  const redoTool = tools.tools.find((tool) => tool.name === "aseprite_redo");
  assert.deepEqual(redoTool?.annotations, {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
  });

  const resultPromise = client.callTool({
    arguments: {},
    name: "aseprite_redo",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "redo");
  assert.deepEqual(request.params, {});

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { canRedo: false, canUndo: true },
    type: "response",
  });

  const result = await resultPromise;
  assert.equal(result.isError, undefined);
  assert.deepEqual(redoOutputSchema.parse(result.structuredContent), {
    canRedo: false,
    canUndo: true,
  });

  const unavailablePromise = client.callTool({
    arguments: {},
    name: "aseprite_redo",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const unavailableRequest = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    error: {
      code: "NO_REDO_AVAILABLE",
      message: "The active sprite has no operation to redo.",
    },
    id: unavailableRequest.id,
    ok: false,
    protocolVersion: 1,
    type: "response",
  });

  const unavailableResult = await unavailablePromise;
  assert.equal(unavailableResult.isError, true);
  assert.deepEqual(unavailableResult.content, [
    {
      text: "NO_REDO_AVAILABLE: The active sprite has no operation to redo.",
      type: "text",
    },
  ]);

  const noSpritePromise = client.callTool({
    arguments: {},
    name: "aseprite_redo",
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

  const noSpriteResult = await noSpritePromise;
  assert.equal(noSpriteResult.isError, true);
  assert.deepEqual(noSpriteResult.content, [
    {
      text: "NO_ACTIVE_SPRITE: Open or create a sprite first.",
      type: "text",
    },
  ]);
});
