# Task backlog

## Workflow

Tasks are implemented strictly in ID order unless a dependency or defect requires an explicit change to this document.

Allowed statuses:

- `planned`
- `in-progress`
- `blocked`
- `complete`

Before implementation, set exactly one task to `in-progress`. A task becomes `complete` only when all acceptance criteria are satisfied.

## Backlog summary

| ID     | Task                                             | Status   | Depends on |
| ------ | ------------------------------------------------ | -------- | ---------- |
| `T000` | Project and transport foundation                 | complete | None       |
| `T001` | `aseprite_status`                                | complete | `T000`     |
| `T002` | `aseprite_get_document`                          | complete | `T001`     |
| `T003` | `aseprite_create_sprite`                         | complete | `T002`     |
| `T004` | `aseprite_open_sprite`                           | planned  | `T003`     |
| `T005` | `aseprite_add_layer`                             | planned  | `T004`     |
| `T006` | `aseprite_add_frame`                             | planned  | `T005`     |
| `T007` | `aseprite_draw_pixels`                           | planned  | `T006`     |
| `T008` | `aseprite_undo`                                  | planned  | `T007`     |
| `T009` | `aseprite_redo`                                  | planned  | `T008`     |
| `T010` | `aseprite_save`                                  | planned  | `T009`     |
| `T011` | `aseprite_export`                                | planned  | `T010`     |
| `T012` | Package, documentation, and release verification | planned  | `T011`     |

## T000: Project and transport foundation

Status: `complete`

Scope:

- Scaffold a private ESM package targeting Node 26.
- Enable strict TypeScript compilation.
- Add the official MCP v2 server, Node, and Express adapters.
- Create a loopback HTTP server with `/mcp`, `/aseprite`, and `/health`.
- Implement authentication, Host/Origin validation, configuration parsing, and graceful shutdown.
- Implement the versioned WebSocket bridge with request correlation and timeouts.
- Create the Aseprite extension package, preferences, handshake, and dispatcher shell.
- Add a mock extension and Streamable HTTP test harness.

Acceptance criteria:

- `npm run build`, `npm run typecheck`, and `npm test` pass on Node 26.
- Unauthorized HTTP and WebSocket requests are rejected when a token is configured.
- A mock extension can authenticate and reconnect.
- Pending requests reject immediately when the extension disconnects.
- The server never listens outside loopback.
- `/health` provides foundation diagnostics independently of MCP tools.

## T001: `aseprite_status`

Status: `complete`

Purpose: Report server health and whether an Aseprite extension has completed the configured handshake.

Input: No arguments.

Output:

- Server version and uptime.
- Bridge connection state.
- Extension version when connected.
- Aseprite version and scripting API version when connected.
- Active sprite name and dimensions when available.

Acceptance criteria:

- Works when Aseprite is disconnected.
- Returns structured content in addition to readable text.
- Is annotated as read-only and idempotent.
- Does not fail merely because no sprite is open.

## T002: `aseprite_get_document`

Status: `complete`

Purpose: Inspect the active Aseprite document.

Input: No arguments.

Output:

- Sprite ID, filename, dimensions, color mode, and modified state.
- Frame count and active frame number.
- Hierarchical layer summaries and active layer.
- Tags and slices where available.

Acceptance criteria:

- Returns `NO_ACTIVE_SPRITE` when appropriate.
- Preserves layer hierarchy and stable ordering.
- Avoids returning raw pixel data.
- Is annotated as read-only and idempotent.

## T003: `aseprite_create_sprite`

Status: `complete`

Purpose: Create and activate a new RGB sprite.

Input:

- `width`: integer from 1 through the configured maximum.
- `height`: integer from 1 through the configured maximum.
- `name`: optional initial document name.
- `background`: optional `#RRGGBB` or `#RRGGBBAA` color.

Acceptance criteria:

- Creates an RGB sprite with one frame and one editable layer.
- Rejects invalid or excessive dimensions before contacting Aseprite.
- Returns the same document summary shape as `aseprite_get_document`.
- The operation does not write a file.

## T004: `aseprite_open_sprite`

Status: `planned`

Purpose: Open a supported image or Aseprite document.

Input:

- `path`: absolute path under an allowed directory.

Acceptance criteria:

- Rejects relative paths and allow-list escapes.
- Returns `PATH_NOT_ALLOWED` before contacting Aseprite.
- Returns a document summary after a successful open.
- Reports unsupported or corrupt files without crashing the bridge.

## T005: `aseprite_add_layer`

Status: `planned`

Purpose: Add and activate a regular image layer.

Input:

- `name`: non-empty layer name.

Acceptance criteria:

- Requires an active sprite.
- Creates one regular layer and makes it active.
- Produces one undo step.
- Returns the new layer summary and updated document summary.

## T006: `aseprite_add_frame`

Status: `planned`

Purpose: Add an animation frame.

Input:

- `content`: `empty` or `duplicate-current`.
- `durationMs`: optional positive frame duration.

Acceptance criteria:

- Requires an active sprite.
- Creates and activates exactly one frame.
- Produces one undo step.
- Returns the new frame number and updated frame count.

## T007: `aseprite_draw_pixels`

Status: `planned`

Purpose: Draw a batch of pixels on an RGB cel.

Input:

- Optional target layer and frame; defaults to the active site.
- `pixels`: bounded array of `{ x, y, color }` values.
- Colors use `#RRGGBB` or `#RRGGBBAA`.

Acceptance criteria:

- Supports RGB sprites in v0.1.
- Rejects unsupported color modes clearly.
- Rejects out-of-bounds coordinates before mutation.
- Creates a cel when the target layer/frame has none.
- Applies the complete batch as one undoable transaction.
- Refreshes the visible editor.
- Returns the changed pixel count and target information.

## T008: `aseprite_undo`

Status: `planned`

Purpose: Undo the latest active-sprite operation.

Input: No arguments.

Acceptance criteria:

- Requires an active sprite and an available undo step.
- Performs exactly one undo operation.
- Returns updated undo/redo availability.

## T009: `aseprite_redo`

Status: `planned`

Purpose: Redo the latest undone active-sprite operation.

Input: No arguments.

Acceptance criteria:

- Requires an active sprite and an available redo step.
- Performs exactly one redo operation.
- Returns updated undo/redo availability.

## T010: `aseprite_save`

Status: `planned`

Purpose: Save the active sprite and associate it with the target file.

Input:

- `path`: optional absolute path under an allowed directory.
- `overwrite`: defaults to `false` for a new target.

Acceptance criteria:

- Saves to the existing associated file when `path` is omitted.
- Requires `path` when the sprite has no associated file.
- Rejects disallowed paths and unapproved overwrites.
- Returns the final filename and modified state.
- Is marked as a filesystem-writing tool.

## T011: `aseprite_export`

Status: `planned`

Purpose: Save a copy without changing the active document's associated filename.

Input:

- `path`: absolute output path under an allowed directory.
- `overwrite`: defaults to `false`.

Acceptance criteria:

- Rejects disallowed paths and unapproved overwrites.
- Does not change the active document's associated filename.
- Returns the output path and format.
- Is marked as a filesystem-writing tool.

## T012: Package, documentation, and release verification

Status: `planned`

Scope:

- Package the Lua extension as an installable `.aseprite-extension`.
- Document Node setup, environment variables, authentication, allowed paths, MCP endpoint configuration, and extension pairing.
- Run all automated and manual verification.
- Record supported Node, Aseprite, and MCP SDK versions.

Acceptance criteria:

- A clean installation can follow the README without undocumented steps.
- The packaged extension connects after Aseprite restart.
- All tools pass their documented acceptance tests.
- The release contains no secrets or machine-specific paths.
