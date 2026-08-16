# Aseprite MCP

A local Model Context Protocol server for controlling Aseprite through its Lua scripting API.

## Project status

The transport foundation (`T000`) and first five tools (`T001` through `T005`) are complete. The server can report bridge status, inspect the active Aseprite document without returning pixel data, create or open sprites, and add regular image layers.

The next planned tool is `aseprite_add_frame` (`T006`). See the task backlog for its exact input and acceptance criteria.

The project will use:

- Node.js 26
- TypeScript
- MCP Streamable HTTP transport
- An Aseprite Lua extension connected to Node.js over a local WebSocket
- One implementation task per MCP tool

## Documentation

- [Delivery plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Tool task backlog](docs/TASKS.md)

## Runtime target

Use Node.js 26:

```sh
nvm use
node --version
```

The eventual package will declare Node `>=26.0.0 <27`.

## Development commands

Install dependencies and run the core checks:

```sh
npm install
npm run check
```

Start the development server:

```sh
npm run dev
```

For local authentication, configure an optional secret containing at least 32 characters. Use the same value in the Aseprite extension and MCP client:

```sh
ASEPRITE_MCP_TOKEN="replace-with-a-long-random-secret" npm run dev
```

New sprite dimensions default to a maximum of 4096 pixels per axis. Override the limit when needed:

```sh
ASEPRITE_MCP_MAX_SPRITE_DIMENSION=8192 npm run dev
```

Opening, saving, and exporting files is limited to explicitly allowed directories. Configure one directory, or multiple directories separated by `:` on macOS/Linux and `;` on Windows:

```sh
ASEPRITE_MCP_ALLOWED_DIRECTORIES="/absolute/path/to/sprites:/another/allowed/path" npm run dev
```

Paths supplied to tools must be absolute. Existing symlinks are resolved before Aseprite is contacted, and a target that escapes the configured roots is rejected.

Run the real Streamable HTTP integration test separately:

```sh
npm run test:integration
```

The default endpoints are:

- MCP: `http://127.0.0.1:3210/mcp`
- Aseprite bridge: `ws://127.0.0.1:3210/aseprite`
- Health: `http://127.0.0.1:3210/health`

## Available tools

- `aseprite_status`: read-only server, bridge, Aseprite, and active-sprite status
- `aseprite_get_document`: read-only active-document metadata, frames, ordered layer hierarchy, tags, and slices
- `aseprite_create_sprite`: create and activate an unsaved RGB sprite with an optional name and background color
- `aseprite_open_sprite`: open and activate an existing image or Aseprite document from an allowed directory
- `aseprite_add_layer`: add and activate a named regular image layer as one undoable operation
