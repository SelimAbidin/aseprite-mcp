import { createServer } from "node:http";

import type { AddressInfo } from "node:net";

import { AsepriteBridge } from "./bridge/aseprite-bridge.js";
import { attachAsepriteWebSocketServer } from "./bridge/websocket-server.js";
import type { ServerConfig } from "./config.js";
import { createHttpApp } from "./http/create-http-app.js";

export interface ServerRuntime {
  readonly close: () => Promise<void>;
  readonly listen: () => Promise<URL>;
}

export function createServerRuntime(config: ServerConfig): ServerRuntime {
  const bridge = new AsepriteBridge(config.requestTimeoutMs);
  const { app, close: closeMcp } = createHttpApp({ bridge, config });
  const httpServer = createServer(app);
  const webSocketServer = attachAsepriteWebSocketServer({ bridge, httpServer });

  return {
    close: async () => {
      await closeMcp();
      await new Promise<void>((resolve, reject) => {
        webSocketServer.close((webSocketError) => {
          if (webSocketError !== undefined) {
            reject(webSocketError);
            return;
          }

          httpServer.close((httpError) => {
            if (httpError !== undefined) {
              reject(httpError);
              return;
            }

            resolve();
          });
        });
      });
    },
    listen: () =>
      new Promise<URL>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off("error", reject);
          const address = httpServer.address() as AddressInfo;
          resolve(new URL(`http://${config.host}:${address.port}`));
        });
      }),
  };
}
