import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import type { AsepriteBridge } from "../bridge/aseprite-bridge.js";
import type { ServerConfig } from "../config.js";
import { createAsepriteMcpServer } from "../mcp/create-mcp-server.js";
import { requireBearerToken } from "./auth.js";

export interface HttpAppDependencies {
  readonly bridge: AsepriteBridge;
  readonly config: ServerConfig;
}

export function createHttpApp({ bridge, config }: HttpAppDependencies) {
  const app = createMcpExpressApp({ host: config.host });
  const mcpHandler = createMcpHandler(() =>
    createAsepriteMcpServer({
      allowedDirectories: config.allowedDirectories,
      bridge,
      maxSpriteDimension: config.maxSpriteDimension,
    }),
  );
  const nodeMcpHandler = toNodeHandler(mcpHandler);

  app.get("/health", (_request, response) => {
    response.json({
      bridge: bridge.snapshot(),
      status: "ok",
    });
  });

  app.all("/mcp", requireBearerToken(config.token), (request, response) =>
    nodeMcpHandler(request, response, request.body),
  );

  return {
    app,
    close: () => mcpHandler.close(),
  };
}
