import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AsepriteBridge } from "../src/bridge/aseprite-bridge.js";
import { BridgeError } from "../src/bridge/errors.js";
import { saveAsepriteSprite } from "../src/tools/save.js";
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
  method: string,
  previousId?: unknown,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const request = JSON.parse(
      connection.sentMessages.at(-1) ?? "{}",
    ) as Record<string, unknown>;
    if (request.method === method && request.id !== previousId) return request;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`The ${method} bridge request was not sent.`);
}

function documentResult(filename?: string, id = 41): Record<string, unknown> {
  return {
    activeFrameNumber: 1,
    activeLayer: { name: "Layer 1", path: [1], type: "image" },
    colorMode: "rgb",
    ...(filename === undefined ? {} : { filename }),
    frameCount: 1,
    height: 16,
    id,
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
    slices: [],
    tags: [],
    width: 16,
  };
}

function respond(
  connection: FakeBridgeConnection,
  request: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  connection.emitMessage({
    id: request.id,
    ok: true,
    protocolVersion: 1,
    result,
    type: "response",
  });
}

test("aseprite_save saves an unsaved sprite to a canonical new path", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-save-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const outputPath = join(temporaryRoot, "hero.aseprite");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const savePromise = saveAsepriteSprite(bridge, [temporaryRoot], {
    path: outputPath,
  });
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult(undefined, 41));

  const saveRequest = await waitForRequest(
    connection,
    "save_sprite",
    documentRequest.id,
  );
  assert.deepEqual(saveRequest.params, {
    overwrite: false,
    path: join(await realpath(temporaryRoot), "hero.aseprite"),
    spriteId: 41,
  });
  respond(connection, saveRequest, {
    filename: outputPath,
    isModified: false,
  });

  assert.deepEqual(await savePromise, {
    filename: outputPath,
    isModified: false,
  });
});

test("aseprite_save uses the allowed associated file when path is omitted", async (context) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "aseprite-mcp-save-associated-"),
  );
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const associatedPath = join(temporaryRoot, "hero.aseprite");
  await writeFile(associatedPath, "old sprite");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const savePromise = saveAsepriteSprite(bridge, [temporaryRoot], {});
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult(associatedPath, 42));
  const saveRequest = await waitForRequest(connection, "save_sprite");

  assert.deepEqual(saveRequest.params, {
    overwrite: true,
    path: await realpath(associatedPath),
    spriteId: 42,
  });
  respond(connection, saveRequest, {
    filename: associatedPath,
    isModified: false,
  });
  assert.equal((await savePromise).filename, associatedPath);
});

test("aseprite_save requires a path for an unsaved sprite", async (context) => {
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const savePromise = saveAsepriteSprite(bridge, [], {});
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult());

  await assert.rejects(
    savePromise,
    (error: unknown) =>
      error instanceof BridgeError && error.code === "INVALID_REQUEST",
  );
  assert.equal(
    connection.sentMessages.filter((message) =>
      message.includes('"method":"save_sprite"'),
    ).length,
    0,
  );
});

test("aseprite_save rejects disallowed paths and unapproved overwrites", async (context) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "aseprite-mcp-save-overwrite-"),
  );
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const existingPath = join(temporaryRoot, "existing.png");
  const associatedPath = join(temporaryRoot, "source.aseprite");
  await writeFile(existingPath, "existing image");
  await writeFile(associatedPath, "source sprite");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(
    saveAsepriteSprite(bridge, [temporaryRoot], { path: "relative.png" }),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "PATH_NOT_ALLOWED",
  );
  assert.equal(connection.sentMessages.length, messagesBeforeValidation);

  const savePromise = saveAsepriteSprite(bridge, [temporaryRoot], {
    path: existingPath,
  });
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult(associatedPath, 43));
  await assert.rejects(
    savePromise,
    (error: unknown) =>
      error instanceof BridgeError && error.code === "FILE_EXISTS",
  );
  assert.equal(
    connection.sentMessages.filter((message) =>
      message.includes('"method":"save_sprite"'),
    ).length,
    0,
  );
});
