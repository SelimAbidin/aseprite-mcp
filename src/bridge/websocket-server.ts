import type { Server as HttpServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import type { AsepriteBridge, BridgeConnection } from "./aseprite-bridge.js";

export interface WebSocketServerDependencies {
  readonly bridge: AsepriteBridge;
  readonly httpServer: HttpServer;
}

function adaptWebSocket(webSocket: WebSocket): BridgeConnection {
  return {
    close: (code, reason) => webSocket.close(code, reason),
    onClose: (listener) => {
      webSocket.on("close", listener);
      return () => webSocket.off("close", listener);
    },
    onMessage: (listener) => {
      const handleMessage = (data: Buffer, isBinary: boolean): void => {
        if (isBinary) {
          webSocket.close(1003, "Binary bridge messages are not supported");
          return;
        }
        listener(data.toString("utf8"));
      };
      webSocket.on("message", handleMessage);
      return () => webSocket.off("message", handleMessage);
    },
    send: (message) =>
      new Promise<void>((resolve, reject) => {
        if (webSocket.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket is not open"));
          return;
        }
        webSocket.send(message, (error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}

export function attachAsepriteWebSocketServer({
  bridge,
  httpServer,
}: WebSocketServerDependencies): WebSocketServer {
  const webSocketServer = new WebSocketServer({
    maxPayload: 1024 * 1024,
    noServer: true,
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const hasBrowserOrigin = request.headers.origin !== undefined;

    if (url.pathname !== "/aseprite" || hasBrowserOrigin) {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (webSocket) => {
    webSocket.on("error", () => webSocket.close());
    bridge.acceptConnection(adaptWebSocket(webSocket));
  });

  return webSocketServer;
}
