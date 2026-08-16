import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteMcpServer } from "../src/mcp/create-mcp-server.js";
import { asepriteStatusOutputSchema } from "../src/tools/status.js";

test("MCP clients can discover and call aseprite_status", async (context) => {
  const bridge = new AsepriteBridge({
    requestTimeoutMs: 100,
    token: undefined,
  });
  const server = createAsepriteMcpServer({
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
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["aseprite_status", "aseprite_get_document", "aseprite_create_sprite"],
  );

  const result = await client.callTool({
    arguments: {},
    name: "aseprite_status",
  });

  assert.equal(result.isError, undefined);
  const status = asepriteStatusOutputSchema.parse(result.structuredContent);
  assert.equal(status.bridge.connected, false);
  assert.equal(status.server.name, "aseprite-mcp");
  assert.equal(status.server.version, "0.1.0");
  assert.equal(typeof status.server.uptimeSeconds, "number");
});
