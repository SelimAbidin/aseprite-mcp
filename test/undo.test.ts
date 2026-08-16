import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { undoAsepriteOperation } from "../src/tools/undo.js";
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

test("aseprite_undo requests one undo and returns updated availability", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const undoPromise = undoAsepriteOperation(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "undo");
  assert.deepEqual(request.params, {});

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { canRedo: true, canUndo: false },
    type: "response",
  });

  assert.deepEqual(await undoPromise, { canRedo: true, canUndo: false });
});

test("aseprite_undo rejects malformed Aseprite results", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const undoPromise = undoAsepriteOperation(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { canRedo: "yes", canUndo: false },
    type: "response",
  });

  await assert.rejects(undoPromise);
});
