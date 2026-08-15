import type { IncomingHttpHeaders, Server as HttpServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import type { AsepriteBridge, BridgeConnection } from "./aseprite-bridge.js";

export interface WebSocketServerDependencies {
  readonly bridge: AsepriteBridge;
  readonly httpServer: HttpServer;
}

export function isSuccessfulWebSocketSend(
  error: Error | null | undefined,
): boolean {
  return error == null;
}

export function isAllowedWebSocketOrigin(
  headers: IncomingHttpHeaders,
): boolean {
  const origin = headers.origin;

  if (origin === undefined) return true;
  if (headers.host === undefined) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === "http:" && originUrl.host === headers.host;
  } catch {
    return false;
  }
}

function adaptWebSocket(webSocket: WebSocket): BridgeConnection {
  return {
    close: (code, reason) => webSocket.close(code, reason),
    onClose: (listener) => {
      const handleClose = (code: number, reason: Buffer): void => {
        listener({ code, reason: reason.toString("utf8") });
      };
      webSocket.on("close", handleClose);
      return () => webSocket.off("close", handleClose);
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
          if (isSuccessfulWebSocketSend(error)) resolve();
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

    if (
      url.pathname !== "/aseprite" ||
      !isAllowedWebSocketOrigin(request.headers)
    ) {
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
