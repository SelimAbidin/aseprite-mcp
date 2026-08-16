import assert from "node:assert/strict";
import test from "node:test";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import type { ServerConfig } from "../src/config.js";
import { createServerRuntime } from "../src/server.js";

const TOKEN = "integration-token-that-is-at-least-thirty-two-characters";

test("Streamable HTTP discovers and calls Aseprite tools", async (context) => {
  const config: ServerConfig = {
    allowedDirectories: [],
    host: "127.0.0.1",
    logLevel: "error",
    maxSpriteDimension: 4096,
    port: 0,
    requestTimeoutMs: 100,
    token: TOKEN,
  };
  const runtime = createServerRuntime(config);
  const baseUrl = await runtime.listen();
  const mcpUrl = new URL("/mcp", baseUrl);
  const client = new Client({ name: "http-test", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: {
      headers: { Authorization: `Bearer ${TOKEN}` },
    },
  });

  context.after(async () => {
    await client.close();
    await runtime.close();
  });

  const unauthorizedResponse = await fetch(mcpUrl, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "unauthorized-test", version: "0.1.0" },
        protocolVersion: "2025-11-25",
      },
    }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.equal(unauthorizedResponse.status, 401);

  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    [
      "aseprite_status",
      "aseprite_get_document",
      "aseprite_create_sprite",
      "aseprite_open_sprite",
    ],
  );

  const result = await client.callTool({
    arguments: {},
    name: "aseprite_status",
  });
  assert.equal(result.isError, undefined);

  const documentResult = await client.callTool({
    arguments: {},
    name: "aseprite_get_document",
  });
  assert.equal(documentResult.isError, true);
  assert.deepEqual(documentResult.content, [
    {
      text: "ASEPRITE_DISCONNECTED: The Aseprite extension is not connected.",
      type: "text",
    },
  ]);
});
