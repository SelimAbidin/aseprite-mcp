import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

const TOKEN = "test-token-that-is-at-least-thirty-two-characters";

test("loadConfig returns documented defaults", () => {
  const config = loadConfig({});

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.maxSpriteDimension, 4096);
  assert.equal(config.port, 3210);
  assert.equal(config.requestTimeoutMs, 10_000);
  assert.deepEqual(config.allowedDirectories, []);
  assert.equal(config.token, undefined);
});

test("loadConfig accepts a custom maximum sprite dimension", () => {
  assert.equal(
    loadConfig({ ASEPRITE_MCP_MAX_SPRITE_DIMENSION: "8192" })
      .maxSpriteDimension,
    8192,
  );
  assert.throws(() => loadConfig({ ASEPRITE_MCP_MAX_SPRITE_DIMENSION: "0" }));
});

test("loadConfig accepts an optional long local token", () => {
  assert.equal(loadConfig({ ASEPRITE_MCP_TOKEN: TOKEN }).token, TOKEN);
});

test("loadConfig rejects non-loopback hosts", () => {
  assert.throws(() =>
    loadConfig({
      ASEPRITE_MCP_HOST: "0.0.0.0",
      ASEPRITE_MCP_TOKEN: TOKEN,
    }),
  );
});
