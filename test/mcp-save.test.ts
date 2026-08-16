import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteMcpServer } from "../src/mcp/create-mcp-server.js";
import { saveOutputSchema } from "../src/tools/save.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

async function waitForRequest(
  connection: FakeBridgeConnection,
  method: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const request = JSON.parse(
      connection.sentMessages.at(-1) ?? "{}",
    ) as Record<string, unknown>;
    if (request.method === method) return request;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`The ${method} bridge request was not sent.`);
}

test("MCP clients can discover and call aseprite_save", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-mcp-save-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const outputPath = join(temporaryRoot, "hero.aseprite");

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
  const saveTool = tools.tools.find((tool) => tool.name === "aseprite_save");
  assert.deepEqual(saveTool?.annotations, {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
  });

  const resultPromise = client.callTool({
    arguments: { path: outputPath },
    name: "aseprite_save",
  });
  const documentRequest = await waitForRequest(connection, "get_document");
  connection.emitMessage({
    id: documentRequest.id,
    ok: true,
    protocolVersion: 1,
    result: {
      activeFrameNumber: 1,
      activeLayer: { name: "Ink", path: [1], type: "image" },
      colorMode: "rgb",
      frameCount: 1,
      height: 16,
      id: 51,
      isModified: true,
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
      width: 16,
    },
    type: "response",
  });

  const saveRequest = await waitForRequest(connection, "save_sprite");
  connection.emitMessage({
    id: saveRequest.id,
    ok: true,
    protocolVersion: 1,
    result: { filename: outputPath, isModified: false },
    type: "response",
  });

  const result = await resultPromise;
  assert.equal(result.isError, undefined);
  assert.deepEqual(saveOutputSchema.parse(result.structuredContent), {
    filename: outputPath,
    isModified: false,
  });
});
