import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { BridgeError } from "../src/bridge/errors.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

const TOKEN = "test-token-that-is-at-least-thirty-two-characters";

function createBridge(token: string | undefined = undefined): AsepriteBridge {
  return new AsepriteBridge({
    handshakeTimeoutMs: 100,
    requestTimeoutMs: 100,
    token,
  });
}

test("bridge accepts an unauthenticated local handshake when no token is configured", () => {
  const bridge = createBridge();
  const connection = new FakeBridgeConnection();

  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());

  assert.equal(bridge.snapshot().connected, true);
  assert.equal(
    JSON.parse(connection.sentMessages[0] ?? "{}").type,
    "hello_accepted",
  );
  bridge.close();
});

test("bridge treats repeated valid handshakes as idempotent", () => {
  const bridge = createBridge();
  const connection = new FakeBridgeConnection();

  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());
  connection.emitMessage(bridgeHello());

  assert.equal(bridge.snapshot().connected, true);
  assert.equal(connection.closeCode, undefined);
  assert.equal(connection.sentMessages.length, 2);
  assert.equal(bridge.snapshot().lastEvent, "repeated_hello_acknowledged");
  bridge.close();
});

test("bridge rejects a bad token when authentication is configured", () => {
  const bridge = createBridge(TOKEN);
  const connection = new FakeBridgeConnection();

  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello("wrong-token"));

  assert.equal(connection.closeCode, 1008);
  assert.equal(bridge.snapshot().connected, false);
  bridge.close();
});

test("bridge correlates requests and responses", async () => {
  const bridge = createBridge(TOKEN);
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello(TOKEN));

  const resultPromise = bridge.request("get_status", {});
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { answer: 42 },
    type: "response",
  });

  assert.deepEqual(await resultPromise, { answer: 42 });
  bridge.close();
});

test("bridge rejects pending requests when Aseprite disconnects", async () => {
  const bridge = createBridge();
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());

  const resultPromise = bridge.request("get_status", {});
  connection.emitClose();

  await assert.rejects(resultPromise, (error: unknown) => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, "ASEPRITE_DISCONNECTED");
    return true;
  });
  bridge.close();
});

test("bridge accepts a new Aseprite connection after disconnect", () => {
  const bridge = createBridge();
  const firstConnection = new FakeBridgeConnection();
  bridge.acceptConnection(firstConnection);
  firstConnection.emitMessage(bridgeHello());
  firstConnection.emitClose();

  const secondConnection = new FakeBridgeConnection();
  bridge.acceptConnection(secondConnection);
  secondConnection.emitMessage(bridgeHello());

  assert.equal(bridge.snapshot().connected, true);
  bridge.close();
});
