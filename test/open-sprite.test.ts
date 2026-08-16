import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { BridgeError } from "../src/bridge/errors.js";
import { openAsepriteSprite } from "../src/tools/open-sprite.js";
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

async function waitForRequest(
  connection: FakeBridgeConnection,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const request = JSON.parse(
      connection.sentMessages.at(-1) ?? "{}",
    ) as Record<string, unknown>;
    if (request.method === "open_sprite") return request;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("The open_sprite bridge request was not sent.");
}

function openedDocumentResult(filename: string): Record<string, unknown> {
  return {
    activeFrameNumber: 1,
    activeLayer: { name: "Layer 1", path: [1], type: "image" },
    colorMode: "rgb",
    filename,
    frameCount: 1,
    height: 16,
    id: 31,
    isModified: false,
    layers: [
      {
        editable: true,
        name: "Layer 1",
        opacity: 255,
        type: "image",
        visible: true,
      },
    ],
    slices: [],
    tags: [],
    width: 32,
  };
}

test("aseprite_open_sprite sends a canonical allowed path", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-open-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const spritePath = join(temporaryRoot, "hero.png");
  await writeFile(spritePath, "fake image data");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const openPromise = openAsepriteSprite(bridge, [temporaryRoot], {
    path: spritePath,
  });
  const request = await waitForRequest(connection);
  assert.equal(request.method, "open_sprite");
  assert.deepEqual(request.params, { path: await realpath(spritePath) });

  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result: openedDocumentResult(spritePath),
    type: "response",
  });

  const document = await openPromise;
  assert.equal(document.filename, spritePath);
  assert.equal(document.isModified, false);
});

test("aseprite_open_sprite rejects disallowed paths before contacting Aseprite", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-paths-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const allowedRoot = join(temporaryRoot, "allowed");
  const outsideRoot = join(temporaryRoot, "outside");
  await mkdir(allowedRoot);
  await mkdir(outsideRoot);
  const outsidePath = join(outsideRoot, "outside.png");
  await writeFile(outsidePath, "fake image data");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(
    openAsepriteSprite(bridge, [allowedRoot], { path: "relative.png" }),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "PATH_NOT_ALLOWED",
  );
  await assert.rejects(
    openAsepriteSprite(bridge, [allowedRoot], { path: outsidePath }),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "PATH_NOT_ALLOWED",
  );

  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
});

test("aseprite_open_sprite rejects a symlink escape before contacting Aseprite", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-symlink-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const allowedRoot = join(temporaryRoot, "allowed");
  const outsideRoot = join(temporaryRoot, "outside");
  await mkdir(allowedRoot);
  await mkdir(outsideRoot);
  const outsidePath = join(outsideRoot, "outside.png");
  await writeFile(outsidePath, "fake image data");
  const linkedDirectory = join(allowedRoot, "linked-outside");
  await symlink(
    outsideRoot,
    linkedDirectory,
    process.platform === "win32" ? "junction" : "dir",
  );

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(
    openAsepriteSprite(bridge, [allowedRoot], {
      path: join(linkedDirectory, "outside.png"),
    }),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "PATH_NOT_ALLOWED",
  );

  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
});
