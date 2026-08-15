import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { BridgeError } from "../src/bridge/errors.js";
import { readAsepriteDocument } from "../src/tools/document.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";
import { documentResult } from "./helpers/document-result.js";

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

test("aseprite_get_document preserves ordered layer hierarchy and metadata", async () => {
  const { bridge, connection } = createConnectedBridge();

  const documentPromise = readAsepriteDocument(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: documentResult(),
    type: "response",
  });

  const document = await documentPromise;
  assert.equal(request.method, "get_document");
  assert.equal(document.id, 17);
  assert.equal(document.activeFrameNumber, 2);
  assert.deepEqual(document.activeLayer?.path, [2, 1]);
  assert.deepEqual(
    document.layers.map((layer) => layer.name),
    ["Background", "Character"],
  );
  assert.deepEqual(
    document.layers[1]?.children?.map((layer) => layer.name),
    ["Ink", "Shadows"],
  );
  assert.deepEqual(document.tags[1], {
    direction: "ping-pong",
    fromFrame: 3,
    name: "run",
    repeatCount: 2,
    toFrame: 4,
  });
  assert.deepEqual(document.slices[0]?.pivot, { x: 8, y: 20 });
  assert.equal("pixels" in document, false);
  assert.equal("pixels" in (document.layers[1]?.children?.[0] ?? {}), false);
  bridge.close();
});

test("aseprite_get_document preserves NO_ACTIVE_SPRITE", async () => {
  const { bridge, connection } = createConnectedBridge();

  const documentPromise = readAsepriteDocument(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    error: {
      code: "NO_ACTIVE_SPRITE",
      message: "Open or create a sprite first.",
    },
    id: request.id,
    ok: false,
    protocolVersion: 1,
    type: "response",
  });

  await assert.rejects(documentPromise, (error: unknown) => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, "NO_ACTIVE_SPRITE");
    assert.equal(error.message, "Open or create a sprite first.");
    return true;
  });
  bridge.close();
});
