import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedWebSocketOrigin,
  isSuccessfulWebSocketSend,
} from "../src/bridge/websocket-server.js";

test("WebSocket send guard accepts both runtime success values", () => {
  assert.equal(isSuccessfulWebSocketSend(undefined), true);
  assert.equal(isSuccessfulWebSocketSend(null), true);
  assert.equal(isSuccessfulWebSocketSend(new Error("send failed")), false);
});

test("WebSocket origin guard accepts non-browser clients", () => {
  assert.equal(isAllowedWebSocketOrigin({ host: "127.0.0.1:3210" }), true);
});

test("WebSocket origin guard accepts Aseprite's same-host Origin", () => {
  assert.equal(
    isAllowedWebSocketOrigin({
      host: "127.0.0.1:3210",
      origin: "http://127.0.0.1:3210",
    }),
    true,
  );
});

test("WebSocket origin guard rejects cross-origin browsers", () => {
  assert.equal(
    isAllowedWebSocketOrigin({
      host: "127.0.0.1:3210",
      origin: "https://attacker.example",
    }),
    false,
  );
});

test("WebSocket origin guard rejects malformed and incomplete origins", () => {
  assert.equal(isAllowedWebSocketOrigin({ origin: "not-a-url" }), false);
  assert.equal(
    isAllowedWebSocketOrigin({
      host: "127.0.0.1:3210",
      origin: "not-a-url",
    }),
    false,
  );
});
