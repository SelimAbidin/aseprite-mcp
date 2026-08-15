# Aseprite MCP

A local Model Context Protocol server for controlling Aseprite through its Lua scripting API.

## Project status

The transport foundation (`T000`) and first two tools (`T001` and `T002`) are complete. The server can report bridge status and inspect the active Aseprite document without returning pixel data.

The next planned tool is `aseprite_create_sprite` (`T003`). See the task backlog for its exact input and acceptance criteria.

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
