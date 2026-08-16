import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { createAsepriteSprite } from "../src/tools/create-sprite.js";
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

function createdDocumentResult(): Record<string, unknown> {
  return {
    activeFrameNumber: 1,
    activeLayer: { name: "Layer 1", path: [1], type: "image" },
    colorMode: "rgb",
    filename: "hero",
    frameCount: 1,
    height: 32,
    id: 23,
    isModified: true,
    layers: [
      {
        editable: true,
        name: "Layer 1",
        opacity: 255,
        type: "image",
        visible: true,
      },
    ],
    slices: null,
    tags: null,
    width: 64,
  };
}

test("aseprite_create_sprite sends validated creation parameters", async () => {
  const { bridge, connection } = createConnectedBridge();

  const createPromise = createAsepriteSprite(bridge, 4096, {
    background: "#12345680",
    height: 32,
    name: " hero ",
    width: 64,
  });
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "create_sprite");
  assert.deepEqual(request.params, {
    background: "#12345680",
    height: 32,
    name: "hero",
    width: 64,
  });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: createdDocumentResult(),
    type: "response",
  });

  const document = await createPromise;
  assert.equal(document.colorMode, "rgb");
  assert.equal(document.frameCount, 1);
  assert.equal(document.layers.length, 1);
  assert.equal(document.layers[0]?.editable, true);
  assert.deepEqual(document.slices, []);
  assert.deepEqual(document.tags, []);
  bridge.close();
});

test("aseprite_create_sprite rejects invalid input before contacting Aseprite", async () => {
  const { bridge, connection } = createConnectedBridge();
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(
    createAsepriteSprite(bridge, 64, { height: 32, width: 65 }),
  );
  await assert.rejects(
    createAsepriteSprite(bridge, 64, {
      background: "red",
      height: 32,
      width: 32,
    }),
  );
  await assert.rejects(
    createAsepriteSprite(bridge, 64, { height: 0, width: 32 }),
  );

  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
  bridge.close();
});
