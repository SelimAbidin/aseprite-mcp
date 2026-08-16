import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function waitForRequest(
  connection: FakeBridgeConnection,
  previousId?: unknown,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const request = JSON.parse(
      connection.sentMessages.at(-1) ?? "{}",
    ) as Record<string, unknown>;
    if (request.method === "open_sprite" && request.id !== previousId) {
      return request;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("The open_sprite bridge request was not sent.");
}

test("MCP clients can discover and call aseprite_open_sprite", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-mcp-open-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const spritePath = join(temporaryRoot, "hero.aseprite");
  await writeFile(spritePath, "fake sprite data");

  const bridge = new AsepriteBridge({
    requestTimeoutMs: 100,
    token: undefined,
  });
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());

  const server = createAsepriteMcpServer({
    allowedDirectories: [temporaryRoot],
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
  const openTool = tools.tools.find(
    (tool) => tool.name === "aseprite_open_sprite",
  );
  assert.deepEqual(openTool?.annotations, {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
  });

  const resultPromise = client.callTool({
    arguments: { path: spritePath },
    name: "aseprite_open_sprite",
  });
  const request = await waitForRequest(connection);
  assert.equal(request.method, "open_sprite");

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: {
      activeFrameNumber: 1,
      activeLayer: { name: "Ink", path: [1], type: "image" },
      colorMode: "rgb",
      filename: spritePath,
      frameCount: 1,
      height: 16,
      id: 32,
      isModified: false,
      layers: [
        {
          editable: true,
          name: "Ink",
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
  assert.equal(document.filename, spritePath);
  assert.equal(document.activeLayer?.name, "Ink");

  const failurePromise = client.callTool({
    arguments: { path: spritePath },
    name: "aseprite_open_sprite",
  });
  const failureRequest = await waitForRequest(connection, request.id);
  connection.emitMessage({
    error: {
      code: "ASEPRITE_OPERATION_FAILED",
      message: "Aseprite could not open the requested file.",
    },
    id: failureRequest.id,
    ok: false,
    protocolVersion: 1,
    type: "response",
  });

  const failure = await failurePromise;
  assert.equal(failure.isError, true);
  assert.equal(bridge.snapshot().connected, true);
  assert.deepEqual(failure.content, [
    {
      text: "ASEPRITE_OPERATION_FAILED: Aseprite could not open the requested file.",
      type: "text",
    },
  ]);
});
