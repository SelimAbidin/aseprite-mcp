import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { addAsepriteFrame } from "../src/tools/add-frame.js";
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

test("aseprite_add_frame sends validated frame content and duration", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const addPromise = addAsepriteFrame(bridge, {
    content: "duplicate-current",
    durationMs: 125,
  });
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "add_frame");
  assert.deepEqual(request.params, {
    content: "duplicate-current",
    durationMs: 125,
  });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { frameCount: 5, frameNumber: 3 },
    type: "response",
  });

  assert.deepEqual(await addPromise, { frameCount: 5, frameNumber: 3 });
});

test("aseprite_add_frame supports an empty frame without a duration", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const addPromise = addAsepriteFrame(bridge, { content: "empty" });
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.deepEqual(request.params, { content: "empty" });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: { frameCount: 2, frameNumber: 2 },
    type: "response",
  });

  assert.deepEqual(await addPromise, { frameCount: 2, frameNumber: 2 });
});

test("aseprite_add_frame rejects invalid durations before contacting Aseprite", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(
    addAsepriteFrame(bridge, { content: "empty", durationMs: 0 }),
  );
  await assert.rejects(
    addAsepriteFrame(bridge, { content: "empty", durationMs: 1.5 }),
  );

  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
});
