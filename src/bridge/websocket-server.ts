import type { Server as HttpServer } from "node:http";

import { WebSocketServer } from "ws";

import type { AsepriteBridge } from "./aseprite-bridge.js";

export interface WebSocketServerDependencies {
  readonly bridge: AsepriteBridge;
  readonly httpServer: HttpServer;
}

export function attachAsepriteWebSocketServer({
  bridge,
  httpServer,
}: WebSocketServerDependencies): WebSocketServer {
  void bridge;

  const webSocketServer = new WebSocketServer({
    maxPayload: 1024 * 1024,
    noServer: true,
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname !== "/aseprite") {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (webSocket) => {
    // T000 follow-up: authenticate the hello message, then attach this socket
    // to AsepriteBridge. Until then, fail closed.
    webSocket.close(1013, "Aseprite bridge handshake is not implemented yet");
  });

  return webSocketServer;
}
