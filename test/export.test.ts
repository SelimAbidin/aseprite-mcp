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
import { exportAsepriteSprite } from "../src/tools/export.js";
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
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const request = JSON.parse(
      connection.sentMessages.at(-1) ?? "{}",
    ) as Record<string, unknown>;
    if (request.method === method) return request;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`The ${method} bridge request was not sent.`);
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

function documentResult(id = 61): Record<string, unknown> {
  return {
    activeFrameNumber: 1,
    activeLayer: { name: "Ink", path: [1], type: "image" },
    colorMode: "rgb",
    filename: "/source/hero.aseprite",
    frameCount: 1,
    height: 16,
    id,
    isModified: true,
    layers: [
      {
        editable: true,
        name: "Ink",
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

test("aseprite_export exports to a canonical new path", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aseprite-mcp-export-"));
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const outputPath = join(temporaryRoot, "hero.png");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const exportPromise = exportAsepriteSprite(bridge, [temporaryRoot], {
    path: outputPath,
  });
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult());
  const exportRequest = await waitForRequest(connection, "export_sprite");
  assert.deepEqual(exportRequest.params, {
    overwrite: false,
    path: join(await realpath(temporaryRoot), "hero.png"),
    spriteId: 61,
  });
  respond(connection, exportRequest, { format: "png", path: outputPath });

  assert.deepEqual(await exportPromise, {
    format: "png",
    path: outputPath,
  });
});

test("aseprite_export rejects an existing target unless overwrite is enabled", async (context) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "aseprite-mcp-export-overwrite-"),
  );
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const outputPath = join(temporaryRoot, "hero.png");
  await writeFile(outputPath, "existing image");

  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());
  const messagesBeforeValidation = connection.sentMessages.length;

  await assert.rejects(
    exportAsepriteSprite(bridge, [temporaryRoot], { path: outputPath }),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "FILE_EXISTS",
  );
  assert.equal(connection.sentMessages.length, messagesBeforeValidation);

  const exportPromise = exportAsepriteSprite(bridge, [temporaryRoot], {
    overwrite: true,
    path: outputPath,
  });
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult(62));
  const exportRequest = await waitForRequest(connection, "export_sprite");
  assert.deepEqual(exportRequest.params, {
    overwrite: true,
    path: await realpath(outputPath),
    spriteId: 62,
  });
  respond(connection, exportRequest, { format: "png", path: outputPath });
  assert.equal((await exportPromise).format, "png");
});

test("aseprite_export rejects output paths that escape through a symlink", async (context) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "aseprite-mcp-export-symlink-"),
  );
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const allowedRoot = join(temporaryRoot, "allowed");
  const outsideRoot = join(temporaryRoot, "outside");
  await mkdir(allowedRoot);
  await mkdir(outsideRoot);
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
    exportAsepriteSprite(bridge, [allowedRoot], {
      path: join(linkedDirectory, "hero.png"),
    }),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "PATH_NOT_ALLOWED",
  );
  assert.equal(connection.sentMessages.length, messagesBeforeValidation);
});

test("aseprite_export rejects malformed Aseprite results", async (context) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "aseprite-mcp-export-result-"),
  );
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const { bridge, connection } = createConnectedBridge();
  context.after(() => bridge.close());

  const exportPromise = exportAsepriteSprite(bridge, [temporaryRoot], {
    path: join(temporaryRoot, "hero.png"),
  });
  const documentRequest = await waitForRequest(connection, "get_document");
  respond(connection, documentRequest, documentResult());
  const exportRequest = await waitForRequest(connection, "export_sprite");
  respond(connection, exportRequest, { format: "", path: 123 });

  await assert.rejects(exportPromise);
});
