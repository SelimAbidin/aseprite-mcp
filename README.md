# Aseprite MCP

A local Model Context Protocol server for controlling Aseprite through its Lua scripting API.

## Project status

Planning. No server or Aseprite extension code has been implemented yet.

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

