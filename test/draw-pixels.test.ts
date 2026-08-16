import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import {
  drawAsepritePixels,
  MAX_DRAW_PIXELS,
} from "../src/tools/draw-pixels.js";
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

test("aseprite_draw_pixels sends a validated target and pixel batch", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const drawPromise = drawAsepritePixels(bridge, {
    frameNumber: 3,
    layerPath: [2, 1],
    pixels: [
      { color: "#ff0000", x: 1, y: 2 },
      { color: "#00FF0080", x: 3, y: 4 },
    ],
  });
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.equal(request.method, "draw_pixels");
  assert.deepEqual(request.params, {
    frameNumber: 3,
    layerPath: [2, 1],
    pixels: [
      { color: "#ff0000", x: 1, y: 2 },
      { color: "#00FF0080", x: 3, y: 4 },
    ],
  });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: {
      changedPixelCount: 2,
      frameNumber: 3,
      layer: { name: "Ink", path: [2, 1] },
    },
    type: "response",
  });

  assert.deepEqual(await drawPromise, {
    changedPixelCount: 2,
    frameNumber: 3,
    layer: { name: "Ink", path: [2, 1] },
  });
});

test("aseprite_draw_pixels defaults the target to Aseprite's active site", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const drawPromise = drawAsepritePixels(bridge, {
    pixels: [{ color: "#12345678", x: 0, y: 0 }],
  });
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  assert.deepEqual(request.params, {
    pixels: [{ color: "#12345678", x: 0, y: 0 }],
  });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: {
      changedPixelCount: 1,
      frameNumber: 1,
      layer: { name: "Layer 1", path: [1] },
    },
    type: "response",
  });

  await drawPromise;
});

test("aseprite_draw_pixels rejects malformed and excessive batches before contacting Aseprite", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(drawAsepritePixels(bridge, { pixels: [] }));
  await assert.rejects(
    drawAsepritePixels(bridge, {
      pixels: [{ color: "red", x: 0, y: 0 }],
    }),
  );
  await assert.rejects(
    drawAsepritePixels(bridge, {
      pixels: [{ color: "#112233", x: -1, y: 0 }],
    }),
  );
  await assert.rejects(
    drawAsepritePixels(bridge, {
      pixels: Array.from({ length: MAX_DRAW_PIXELS + 1 }, () => ({
        color: "#112233",
        x: 0,
        y: 0,
      })),
    }),
  );

  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
});
