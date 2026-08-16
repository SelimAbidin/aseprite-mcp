import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { addAsepriteLayer } from "../src/tools/add-layer.js";
import { addedLayerResult } from "./helpers/document-result.js";
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

test("aseprite_add_layer sends a validated name and returns layer and document summaries", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const addPromise = addAsepriteLayer(bridge, { name: " Highlights " });
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "add_layer");
  assert.deepEqual(request.params, { name: "Highlights" });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: addedLayerResult(),
    type: "response",
  });

  const result = await addPromise;
  assert.equal(result.layer.name, "Highlights");
  assert.equal(result.layer.type, "image");
  assert.deepEqual(result.layer.path, [2]);
  assert.equal(result.document.activeLayer?.name, "Highlights");
  assert.equal(result.document.layers.length, 2);
  assert.deepEqual(result.document.slices, []);
  assert.deepEqual(result.document.tags, []);
});

test("aseprite_add_layer rejects invalid names before contacting Aseprite", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(addAsepriteLayer(bridge, { name: "   " }));
  await assert.rejects(addAsepriteLayer(bridge, { name: "x".repeat(256) }));

  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
});
