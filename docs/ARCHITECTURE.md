# Architecture

## System overview

```text
MCP client
    |
    | Streamable HTTP
    v
http://127.0.0.1:3210/mcp
    |
    v
Node.js 26 / TypeScript process
    |
    | local WebSocket (optional shared-secret authentication)
    v
ws://127.0.0.1:3210/aseprite
    |
    v
Aseprite Lua extension
    |
    v
Aseprite scripting API
```

## Components

### HTTP application

The Node process owns one HTTP server and binds to `127.0.0.1` by default.

Planned routes:

| Route       | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `/mcp`      | MCP Streamable HTTP endpoint                         |
| `/aseprite` | WebSocket upgrade endpoint used by the Lua extension |
| `/health`   | Minimal process and bridge readiness information     |

The implementation will use the official MCP TypeScript SDK v2 HTTP entry point. MCP server instances may be created per HTTP request, while the Aseprite bridge remains process-level state injected into each tool handler.

The default handler will support the current MCP protocol era and the SDK's stateless legacy compatibility path. Session-specific application state will not be stored inside an MCP transport instance.

### Aseprite bridge

The bridge owns:

- The single validated Aseprite WebSocket connection.
- A map of pending request IDs to promises.
- Per-request timeouts.
- Disconnect rejection and cleanup.
- A validated snapshot of the connected Aseprite and scripting API versions.

Only one Aseprite connection is supported in v0.1. A second connection is rejected with a clear reason. Multi-instance routing is deferred.

### Lua extension

The extension loads with Aseprite, connects to the local WebSocket endpoint, performs the configured handshake, and dispatches a fixed set of methods.

Minimum planned Aseprite version: 1.3.0. This gives the bridge access to both the WebSocket API and the built-in JSON API.

The extension must:

- Reconnect with bounded backoff.
- Send a versioned handshake before accepting requests.
- Validate request shape and parameter types again in Lua.
- Wrap mutations in `pcall` and `app.transaction()` where appropriate.
- Return structured errors.
- Refresh the UI after visible mutations when necessary.
- Close the socket during plugin shutdown.

## MCP HTTP model

Streamable HTTP is the only MCP transport planned for v0.1.

The server will:

- Expose one `/mcp` endpoint.
- Use JSON responses or SSE as selected by the MCP SDK and client request.
- Keep tool handlers independent of MCP session state.
- Apply request body limits.
- Shut down HTTP, MCP, and WebSocket resources cleanly.
- Keep logs separate from protocol responses.

## Bridge protocol

Every message has a protocol version and a discriminated `type`.

### Handshake

```json
{
  "protocolVersion": 1,
  "type": "hello",
  "token": "shared-secret",
  "client": {
    "name": "aseprite-mcp-extension",
    "version": "0.1.0",
    "asepriteVersion": "1.3.x",
    "apiVersion": 36
  }
}
```

The implemented named methods are `get_status`, `get_document`, `create_sprite`, `open_sprite`, and `add_layer`. Filesystem paths are validated and canonicalized by the Node process before a request reaches the extension.

The `token` field is omitted when the server has no shared secret configured. The server does not send tool requests until it accepts the handshake.

### Request

```json
{
  "protocolVersion": 1,
  "type": "request",
  "id": "01J...",
  "method": "get_document",
  "params": {}
}
```

### Success response

```json
{
  "protocolVersion": 1,
  "type": "response",
  "id": "01J...",
  "ok": true,
  "result": {}
}
```

### Error response

```json
{
  "protocolVersion": 1,
  "type": "response",
  "id": "01J...",
  "ok": false,
  "error": {
    "code": "NO_ACTIVE_SPRITE",
    "message": "Open or create a sprite first.",
    "details": {}
  }
}
```

## Error model

Stable bridge error codes will include:

| Code                        | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `ASEPRITE_DISCONNECTED`     | No authenticated extension is connected                    |
| `BRIDGE_TIMEOUT`            | Aseprite did not answer within the configured deadline     |
| `INVALID_REQUEST`           | A bridge message or parameters failed validation           |
| `UNSUPPORTED_METHOD`        | The Lua dispatcher does not implement the requested method |
| `NO_ACTIVE_SPRITE`          | The operation requires an active sprite                    |
| `UNSUPPORTED_COLOR_MODE`    | The operation does not support the active sprite's mode    |
| `OUT_OF_BOUNDS`             | Coordinates or dimensions are outside the valid canvas     |
| `PATH_NOT_ALLOWED`          | A requested filesystem path is outside configured roots    |
| `FILE_EXISTS`               | An output exists and overwrite was not explicitly allowed  |
| `ASEPRITE_OPERATION_FAILED` | Aseprite rejected or failed the operation                  |

Tool handlers translate these into concise MCP tool errors while preserving the code in structured content.

## Security boundaries

### Network

- Bind to `127.0.0.1` by default.
- Validate HTTP `Host` and `Origin` values to prevent DNS rebinding.
- When `ASEPRITE_MCP_TOKEN` is configured, require it as a bearer token on `/mcp`.
- When configured, require the same secret in the WebSocket handshake.
- Reject WebSockets that fail the configured handshake before processing requests.
- Set request and message size limits.

Listening on non-loopback interfaces is not part of v0.1.

### Commands

- No arbitrary Lua or generic `app.command` passthrough.
- Every method is registered explicitly on both sides.
- Input is validated in TypeScript and defensively checked in Lua.
- Pixel batches have a fixed maximum size.

### Filesystem

- File paths must be absolute.
- Open, save, and export paths must fall under configured allowed directories.
- Relative traversal and symlink escapes are rejected.
- Existing outputs require an explicit `overwrite: true`.

## Configuration

The initial configuration contract will use environment variables:

| Variable                            | Default     | Purpose                                          |
| ----------------------------------- | ----------- | ------------------------------------------------ |
| `ASEPRITE_MCP_HOST`                 | `127.0.0.1` | HTTP bind address; v0.1 accepts loopback only    |
| `ASEPRITE_MCP_PORT`                 | `3210`      | HTTP and WebSocket port                          |
| `ASEPRITE_MCP_TOKEN`                | none        | Optional shared secret; enables authentication   |
| `ASEPRITE_MCP_ALLOWED_DIRECTORIES`  | none        | Platform-delimited filesystem roots              |
| `ASEPRITE_MCP_REQUEST_TIMEOUT_MS`   | `10000`     | Bridge request deadline                          |
| `ASEPRITE_MCP_LOG_LEVEL`            | `info`      | Server logging level                             |
| `ASEPRITE_MCP_MAX_SPRITE_DIMENSION` | `4096`      | Maximum width or height accepted for new sprites |

The Lua extension stores its server URL and optional token in plugin preferences.

## Testing strategy

### Unit tests

- Configuration parsing.
- Authentication and Host/Origin validation.
- Path containment including symlink cases.
- Bridge schema validation.
- Timeout and disconnect behavior.
- Tool input and output schemas.

### Integration tests

- Start the HTTP server on an ephemeral loopback port.
- Connect with the official Streamable HTTP MCP client.
- Connect a mock Aseprite WebSocket client.
- Exercise one complete request/response flow per tool.
- Verify malformed, unauthorized, timed-out, and disconnected cases.

### Manual Aseprite tests

Each tool task contains a manual test performed with the installed extension. Manual tests verify UI state, undo behavior, file results, and reconnection behavior that mocks cannot prove.
