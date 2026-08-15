import { McpServer } from "@modelcontextprotocol/server";

import { SERVER_NAME, SERVER_VERSION } from "../constants.js";
import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";

export interface McpServerDependencies {
  readonly bridge: AsepriteBridge;
}

export function createAsepriteMcpServer(
  dependencies: McpServerDependencies,
): McpServer {
  void dependencies;

  return new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Use the registered Aseprite tools to inspect and edit the connected Aseprite instance.",
    },
  );
}
