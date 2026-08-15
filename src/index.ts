#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { createServerRuntime } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = createServerRuntime(config);
  const baseUrl = await runtime.listen();

  console.error(`Aseprite MCP listening at ${new URL("/mcp", baseUrl)}`);

  const shutdown = async (): Promise<void> => {
    await runtime.close();
    process.exitCode = 0;
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  console.error("Failed to start Aseprite MCP:", error);
  process.exitCode = 1;
});
