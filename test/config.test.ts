import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

const TOKEN = "test-token-that-is-at-least-thirty-two-characters";

test("loadConfig returns documented defaults", () => {
  const config = loadConfig({ ASEPRITE_MCP_TOKEN: TOKEN });

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3210);
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.deepEqual(config.allowedDirectories, []);
});

test("loadConfig rejects non-loopback hosts", () => {
  assert.throws(() =>
    loadConfig({
      ASEPRITE_MCP_HOST: "0.0.0.0",
      ASEPRITE_MCP_TOKEN: TOKEN,
    }),
  );
});
