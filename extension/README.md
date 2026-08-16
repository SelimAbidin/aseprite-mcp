# Aseprite MCP extension

This directory will be packaged as the installable Aseprite MCP bridge extension.

The extension currently:

- connects to `http://127.0.0.1:3210/aseprite` by default;
- reconnects with bounded backoff;
- performs the versioned bridge handshake with an optional token;
- handles the `get_status`, `get_document`, `create_sprite`, and `open_sprite` bridge methods;
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
