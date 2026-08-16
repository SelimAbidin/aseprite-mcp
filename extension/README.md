# Aseprite MCP extension

This directory will be packaged as the installable Aseprite MCP bridge extension.

The extension currently:

- connects to `http://127.0.0.1:3210/aseprite` by default;
- reconnects with bounded backoff;
- performs the versioned bridge handshake with an optional token;
- handles the `get_status`, `get_document`, `create_sprite`, `open_sprite`, `add_layer`, `add_frame`, `draw_pixels`, `undo`, `redo`, `save_sprite`, and `export_sprite` bridge methods;
- provides **File > Scripts > MCP Connection Status** and **Configure MCP Bridge** commands.

The Lua bridge must be manually verified in a supported Aseprite installation before release packaging. The core `aseprite_create_sprite` path was verified with Aseprite 1.3.18.2 arm64 on 2026-08-16.

## Manual verification: `aseprite_create_sprite`

1. Start the server and connect the extension in Aseprite 1.3 or later.
2. Call `aseprite_create_sprite` with `width: 32`, `height: 16`, `name: "manual-test"`, and `background: "#33669980"`.
3. Verify that the new active document is RGB, remains unsaved, is 32x16, has one frame and one editable image layer, and is filled with the requested semi-transparent color.
4. Call the tool without `name` or `background` and verify that the new active document is untitled and transparent.
5. Call the tool with zero, fractional, and over-limit dimensions and verify that no new document is created.

## Manual verification: `aseprite_open_sprite`

1. Start the server with `ASEPRITE_MCP_ALLOWED_DIRECTORIES` set to an absolute test directory, then connect the extension in Aseprite 1.3 or later.
2. Put a valid `.aseprite` file and a supported image such as `.png` in the test directory. Call `aseprite_open_sprite` for each absolute path and verify that it becomes the active document and that the returned summary matches its filename, dimensions, frames, and layers.
3. Call the tool with a relative path and with an absolute path outside the test directory. Verify that both return `PATH_NOT_ALLOWED` and that Aseprite does not open a document.
4. Create a symlink inside the allowed directory whose target is outside it. Call the tool for a file through that symlink and verify that it returns `PATH_NOT_ALLOWED`.
5. Put a corrupt or unsupported file inside the allowed directory and call the tool. Verify that it returns `ASEPRITE_OPERATION_FAILED`, the extension remains connected, and a later `aseprite_status` call succeeds.

## Manual verification: `aseprite_add_layer`

1. Start the server and connect extension version `0.1.7` in Aseprite 1.3 or later.
2. Open or create a sprite, note its current layer count, and call `aseprite_add_layer` with `name: "Highlights"`.
3. Verify that exactly one regular image layer named `Highlights` is added, it is active, and the returned layer path matches the document's active-layer path.
4. Undo once and verify that the layer is removed. Redo once and verify that the same layer returns, confirming creation and naming form one undo step.
5. Close all sprites and call the tool again. Verify that it returns `NO_ACTIVE_SPRITE` and the extension remains connected.

## Manual verification: `aseprite_draw_pixels`

1. Start the server and connect extension version `0.1.9` in Aseprite 1.3 or later.
2. Create a 16x16 RGB sprite with two frames and an image layer named `Ink`. Call `aseprite_get_document` and note the `Ink` layer path.
3. Call `aseprite_draw_pixels` for frame 2 and the `Ink` path with opaque and semi-transparent colors at several canvas coordinates. Verify that the pixels appear on frame 2 and that the result reports the batch size, frame 2, and the `Ink` layer path.
4. Use an empty frame/layer intersection and verify that drawing creates its cel. Undo once and verify that the complete batch, including the new cel, is removed; redo once and verify that it returns.
5. Call the tool with an x coordinate equal to the sprite width and with a y coordinate equal to its height. Verify that each returns `OUT_OF_BOUNDS`, no pixels change, and no cel is created.
6. Open an indexed or grayscale sprite and verify that the tool returns `UNSUPPORTED_COLOR_MODE` without changing it.
7. Target a group, reference, tilemap, locked layer, nonexistent layer path, or nonexistent frame and verify that the request fails without mutation and that the extension remains connected.

## Manual verification: `aseprite_undo`

1. Start the server and connect extension version `0.1.10` in Aseprite 1.3 or later.
2. Create or open a sprite, make two visibly different undoable changes, and call `aseprite_undo` once. Verify that only the latest change is reverted.
3. Verify that the result reports `canRedo: true` and that `canUndo` matches whether an earlier operation remains in the Edit menu.
4. Call `aseprite_undo` until no undo step remains, then call it once more. Verify that it returns `NO_UNDO_AVAILABLE`, the sprite does not change, and the extension remains connected.
5. Close all sprites and call the tool. Verify that it returns `NO_ACTIVE_SPRITE`.

## Manual verification: `aseprite_redo`

1. Start the server and connect extension version `0.1.11` in Aseprite 1.3 or later.
2. Create or open a sprite, make two visibly different undoable changes, undo both, and call `aseprite_redo` once. Verify that only the first undone change is restored.
3. Verify that the result reports `canUndo: true` and that `canRedo` matches whether another operation remains in the Edit menu.
4. Call `aseprite_redo` until no redo step remains, then call it once more. Verify that it returns `NO_REDO_AVAILABLE`, the sprite does not change, and the extension remains connected.
5. Close all sprites and call the tool. Verify that it returns `NO_ACTIVE_SPRITE`.

## Manual verification: `aseprite_save`

1. Start the server with `ASEPRITE_MCP_ALLOWED_DIRECTORIES` set to an absolute test directory, then connect extension version `0.1.12` in Aseprite 1.3 or later.
2. Create an unsaved sprite, make a visible change, and call `aseprite_save` without `path`. Verify that it returns `INVALID_REQUEST` and no file is written.
3. Call it with a new absolute `.aseprite` path in the allowed directory. Verify that the file is created, becomes the document's associated filename, and the result reports `isModified: false`.
4. Modify the sprite again and call the tool without `path`. Verify that it saves to the associated file without prompting and returns `isModified: false`.
5. Choose a different existing target and call the tool with `overwrite: false`; verify `FILE_EXISTS` and unchanged file contents. Repeat with `overwrite: true` and verify the target is replaced and becomes the associated filename.
6. Try a relative path, a path outside the allowed directory, and a path through an in-root symlink to an outside directory. Verify `PATH_NOT_ALLOWED` and no file write.

## Manual verification: `aseprite_export`

1. Start the server with `ASEPRITE_MCP_ALLOWED_DIRECTORIES` set to an absolute test directory, then connect extension version `0.1.13` in Aseprite 1.3 or later.
2. Open a modified `.aseprite` document and note its associated filename and modified state. Call `aseprite_export` with a new absolute `.png` path in the allowed directory.
3. Verify that the PNG is created, the result reports the output path and `png` format, and the active document's associated filename and modified state do not change.
4. Call the tool for the same target with `overwrite: false`; verify `FILE_EXISTS` and unchanged output contents. Repeat with `overwrite: true` and verify the output is replaced without changing the active document filename.
5. Export to another Aseprite-supported format and verify that the result reports the selected extension as its format.
6. Try a relative path, a path outside the allowed directory, and a path through an in-root symlink to an outside directory. Verify `PATH_NOT_ALLOWED` and no file write.
