import assert from "node:assert/strict";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { readAsepriteStatus } from "../src/tools/status.js";
import {
  bridgeHello,
  FakeBridgeConnection,
} from "./helpers/fake-bridge-connection.js";

function createBridge(): AsepriteBridge {
  return new AsepriteBridge({
    requestTimeoutMs: 100,
    token: undefined,
  });
}

test("aseprite_status works while the extension is disconnected", async () => {
  const bridge = createBridge();

  const status = await readAsepriteStatus(bridge);

  assert.equal(status.server.name, "aseprite-mcp");
  assert.equal(status.bridge.connected, false);
  assert.equal(status.aseprite, undefined);
  bridge.close();
});

test("aseprite_status returns the active sprite from Aseprite", async () => {
  const bridge = createBridge();
  const connection = new FakeBridgeConnection();
  bridge.acceptConnection(connection);
  connection.emitMessage(bridgeHello());

  const statusPromise = readAsepriteStatus(bridge);
  const request = JSON.parse(connection.sentMessages.at(-1) ?? "{}");
  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: {
      activeSprite: {
        colorMode: "rgb",
        frameCount: 1,
        height: 32,
        id: 7,
        isModified: false,
        name: "hero.aseprite",
        width: 32,
      },
      apiVersion: 36,
      asepriteVersion: "1.3.16",
    },
    type: "response",
  });

  const status = await statusPromise;
  assert.equal(status.bridge.connected, true);
  assert.equal(status.aseprite?.activeSprite?.name, "hero.aseprite");
  assert.equal(status.aseprite?.activeSprite?.width, 32);
  bridge.close();
});
