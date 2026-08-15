import assert from "node:assert/strict";
import test from "node:test";

import { bridgeHelloSchema } from "../src/bridge/protocol.js";

test("bridge hello accepts the documented protocol shape", () => {
  const result = bridgeHelloSchema.safeParse({
    client: {
      apiVersion: 36,
      asepriteVersion: "1.3.16",
      name: "aseprite-mcp-extension",
      version: "0.1.0",
    },
    protocolVersion: 1,
    token: "secret",
    type: "hello",
  });

  assert.equal(result.success, true);
});

test("bridge hello rejects an unknown protocol version", () => {
  const result = bridgeHelloSchema.safeParse({
    client: {
      apiVersion: 36,
      asepriteVersion: "1.3.16",
      name: "aseprite-mcp-extension",
      version: "0.1.0",
    },
    protocolVersion: 2,
    token: "secret",
    type: "hello",
  });

  assert.equal(result.success, false);
});
