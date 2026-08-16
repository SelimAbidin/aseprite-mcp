import { McpServer } from "@modelcontextprotocol/server";

import { SERVER_NAME, SERVER_VERSION } from "../constants.js";
import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import { registerCreateSpriteTool } from "../tools/create-sprite.js";
import { registerDocumentTool } from "../tools/document.js";
import { registerStatusTool } from "../tools/status.js";

export interface McpServerDependencies {
  readonly bridge: AsepriteBridge;
  readonly maxSpriteDimension: number;
}

export function createAsepriteMcpServer(
  dependencies: McpServerDependencies,
): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Use the registered Aseprite tools to inspect and edit the connected Aseprite instance.",
    },
  );

  registerStatusTool(server, dependencies.bridge);
  registerDocumentTool(server, dependencies.bridge);
  registerCreateSpriteTool(
    server,
    dependencies.bridge,
    dependencies.maxSpriteDimension,
  );
  return server;
}
