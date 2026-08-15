# Delivery plan

## Goal

Build a local MCP server that lets an MCP client inspect and modify the currently running Aseprite application through safe, typed tools.

The first release is intentionally local-first. It is not a hosted multi-user service and will not expose arbitrary Lua execution.

## Agreed technology

| Area                 | Decision                                                                              |
| -------------------- | ------------------------------------------------------------------------------------- |
| Runtime              | Node.js 26                                                                            |
| Language             | TypeScript with strict type checking                                                  |
| MCP SDK              | Official TypeScript SDK v2 packages                                                   |
| MCP transport        | Streamable HTTP                                                                       |
| HTTP endpoint        | `http://127.0.0.1:3210/mcp` by default                                                |
| Aseprite bridge      | WebSocket at `ws://127.0.0.1:3210/aseprite`                                           |
| Aseprite integration | Installable Lua extension                                                             |
| Validation           | Zod schemas at MCP and bridge boundaries                                              |
| Testing              | Node test runner, protocol tests, mock bridge tests, and manual Aseprite verification |

## Delivery principles

1. Implement the foundation before application tools.
2. Implement exactly one tool task at a time.
3. A tool is complete only when its schema, Node handler, Lua handler, tests, and documentation are complete.
4. Read-only inspection tools come before mutation and filesystem tools.
5. Mutations must be undoable through `app.transaction()` wherever Aseprite supports it.
6. The bridge exposes named operations only. It never evaluates Lua supplied by a caller.
7. File operations are restricted to configured allowed directories.
8. Every network listener binds to loopback unless a future task explicitly introduces remote deployment and authentication requirements.

## Phases

### Phase 0: foundation

- Create the Node 26 TypeScript project.
- Add formatting, linting, build, test, and type-check commands.
- Create the Streamable HTTP MCP endpoint.
- Create the WebSocket upgrade endpoint for the Aseprite extension.
- Define the bridge request, response, error, and handshake schemas.
- Add request correlation, timeouts, disconnect cleanup, and graceful shutdown.
- Add authentication, Host/Origin validation, and filesystem allow-list configuration.
- Build the installable Aseprite extension shell.
- Add automated protocol tests with a mock Aseprite peer.

Phase 0 is complete when an MCP client can connect over Streamable HTTP, list an empty tool set, and a mock Aseprite extension can complete the authenticated bridge handshake. `aseprite_status` is added separately in `T001`.

### Phase 1: read-only tools

- `aseprite_status`
- `aseprite_get_document`

This phase establishes reliable document serialization before mutations are introduced.

### Phase 2: document creation and navigation

- `aseprite_create_sprite`
- `aseprite_open_sprite`
- `aseprite_add_layer`
- `aseprite_add_frame`

### Phase 3: editing

- `aseprite_draw_pixels`
- `aseprite_undo`
- `aseprite_redo`

The first drawing implementation targets RGB sprites. Grayscale, indexed-color, tilemap, selection, and higher-level drawing primitives will be separate future tasks.

### Phase 4: persistence

- `aseprite_save`
- `aseprite_export`

These tools are implemented last because they write to disk and require complete path validation and overwrite behavior.

### Phase 5: release readiness

- Package the Lua extension as `.aseprite-extension`.
- Run the complete automated suite on Node 26.
- Perform the manual verification matrix in a supported Aseprite version.
- Document MCP client configuration, extension installation, authentication, and troubleshooting.
- Tag the first release only after every v0.1 task is accepted.

## Definition of done

The v0.1 release is done when:

- The MCP endpoint works over Streamable HTTP.
- Node.js 26 is declared and tested.
- Aseprite reconnects after either process restarts.
- Every planned tool has input validation and structured output.
- Every planned tool has automated Node-side coverage.
- Every Lua operation has a documented manual verification case.
- Mutations are grouped into a single undo step where applicable.
- Timeouts and disconnections return actionable MCP errors rather than hanging.
- No operation permits arbitrary code execution.
- No file operation can escape configured allowed directories.

## Deferred from v0.1

- Stdio MCP transport
- Remote or public deployment
- Multi-user sessions
- Headless Aseprite CLI fallback
- Arbitrary Lua execution
- Indexed-color and grayscale pixel editing
- Tilemap editing
- Selection and vector-like drawing tools
- Automatic image generation
- Aseprite event subscriptions pushed to MCP clients

Deferred items require their own design and task before implementation.
