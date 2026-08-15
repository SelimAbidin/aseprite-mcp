# Aseprite MCP extension

This directory will be packaged as the installable Aseprite MCP bridge extension.

The extension currently:

- connects to `http://127.0.0.1:3210/aseprite` by default;
- reconnects with bounded backoff;
- performs the versioned bridge handshake with an optional token;
- handles the `get_status` and `get_document` bridge methods used by the read-only MCP tools;
- provides **File > Scripts > MCP Connection Status** and **Configure MCP Bridge** commands.

The Lua bridge must still be manually verified in a supported Aseprite installation before release packaging.
