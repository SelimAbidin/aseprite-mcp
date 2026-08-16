import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { redoAsepriteOperation } from "../src/tools/redo.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

function createConnectedBridge(): {
  bridge: AsepriteBridge;
  connection: FakeBridgeConnection;
} {
  const bridge = new AsepriteBridge({
    requestTimeoutMs: 100,
    token: undefined,
  });
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());
  return { bridge, connection };
}

test("aseprite_redo requests one redo and returns updated availability", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const redoPromise = redoAsepriteOperation(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "redo");
  assert.deepEqual(request.params, {});

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { canRedo: false, canUndo: true },
    type: "response",
  });

  assert.deepEqual(await redoPromise, { canRedo: false, canUndo: true });
});

test("aseprite_redo rejects malformed Aseprite results", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const redoPromise = redoAsepriteOperation(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { canRedo: false, canUndo: "yes" },
    type: "response",
  });

  await assert.rejects(redoPromise);
});
