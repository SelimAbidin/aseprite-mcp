# Aseprite MCP

A local Model Context Protocol server for controlling Aseprite through its Lua scripting API.

## Project status

`T000` is in progress. The Node/TypeScript project, Streamable HTTP MCP endpoint, health endpoint, WebSocket attachment point, bridge schemas, extension shell, and test harness are scaffolded.

The Aseprite WebSocket handshake and command dispatch are not implemented yet. The scaffold currently closes Aseprite WebSocket connections intentionally and registers no application MCP tools.

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

## Scaffold commands

Install dependencies and run every check:

```sh
npm install
npm run check
```

Start the development server with a local secret containing at least 32 characters:

```sh
ASEPRITE_MCP_TOKEN="replace-with-a-long-random-secret" npm run dev
```

The default endpoints are:

- MCP: `http://127.0.0.1:3210/mcp`
- Aseprite bridge: `ws://127.0.0.1:3210/aseprite`
- Health: `http://127.0.0.1:3210/health`
